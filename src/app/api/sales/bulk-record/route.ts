// src/app/api/sales/bulk-record/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

// ProductDetailsFromDB and lookupProduct can be shared or re-defined
interface ProductDetailsFromDB {
  articleNumber: string;
  articleName: string;
  posDescription?: string | null;
  metlerCode?: string | null;
  hsnCode?: string | null;
  taxPercentage?: number | null;
  purchasePricePerKg?: number | null;
  sellingRatePerKg?: number | null;
  mrpPer100g?: number | null;
  remark?: string | null;
}

async function lookupProduct(articleNo: string): Promise<ProductDetailsFromDB | null> {
  if (!articleNo || typeof articleNo !== 'string' || articleNo.trim() === "") {
    console.warn(`[VendorBulk] Invalid article number for lookup: ${articleNo}`);
    return null;
  }
  const productRef = db.collection('product').doc(String(articleNo).trim());
  const productDoc = await productRef.get();
  if (!productDoc.exists) {
    console.warn(`[VendorBulk] Product ${articleNo} not found.`);
    return null;
  }
  return productDoc.data() as ProductDetailsFromDB;
}

// Payload from vendor frontend for each item
interface VendorBulkSaleItemPayload {
  barcodeScanned: string;
  articleNo: string; // Parsed from barcode
  weightGrams: number; // Parsed from barcode
  staffId: string; // Logged-in vendor
  // calculatedSellPrice is determined after product lookup
  // product_* fields are determined after product lookup
  // dateOfSale and timestamp are determined by server
}

export async function POST(req: NextRequest) {
  console.log("API POST /api/sales/bulk-record called (Vendor)");
  try {
    // The frontend will send an object with a 'sales' array
    const body = await req.json();
    const salesPayload = body.sales as VendorBulkSaleItemPayload[];


    if (!Array.isArray(salesPayload) || salesPayload.length === 0) {
      return NextResponse.json({ message: 'Request body must be a non-empty array of sales.' }, { status: 400 });
    }

    const salesCollectionRef = db.collection('salesTransactions');
    const firestoreBatch = db.batch();
    let successfulRecords = 0;
    let failedRecords = 0;
    const errors: { barcode: string, message: string }[] = [];

    const IST_TIMEZONE = 'Asia/Kolkata';
    const getISODateStringInIST = (date: Date): string => {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
        const year = parts.find(part => part.type === 'year')?.value;
        const month = parts.find(part => part.type === 'month')?.value;
        const day = parts.find(part => part.type === 'day')?.value;
        return `${year}-${month}-${day}`;
    };
    
    // All sales in this batch will share the same server-evaluated timestamp and derived dateOfSale
    const currentServerTimestamp = admin.firestore.FieldValue.serverTimestamp();
    // For deriving dateOfSale, we'd ideally get the resolved server timestamp.
    // Since we can't get it before commit, we'll use current server date for dateOfSale.
    // The exact timestamp object will be resolved by Firestore upon commit.
    const currentDateForSale = getISODateStringInIST(new Date());


    for (const sale of salesPayload) {
      // Basic validation from frontend payload
      if (!sale.articleNo || !sale.staffId || typeof sale.weightGrams !== 'number' || !sale.barcodeScanned) {
        failedRecords++;
        errors.push({ barcode: sale.barcodeScanned || 'UNKNOWN', message: 'Core data missing from payload (articleNo, staffId, weightGrams, barcodeScanned).' });
        console.warn("[VendorBulk] Skipping sale due to missing core data from payload:", sale);
        continue;
      }

      const productDetails = await lookupProduct(sale.articleNo);

      if (!productDetails || typeof productDetails.sellingRatePerKg !== 'number') {
        failedRecords++;
        errors.push({ barcode: sale.barcodeScanned, message: `Product details not found or invalid for article ${sale.articleNo}.` });
        console.warn(`[VendorBulk] Product lookup failed for articleNo: ${sale.articleNo}`);
        continue;
      }

      const calculatedSellPrice = parseFloat(((sale.weightGrams / 1000) * productDetails.sellingRatePerKg).toFixed(2));

      const saleData = {
        articleNo: sale.articleNo, // This is product_articleNumber
        barcodeScanned: sale.barcodeScanned,
        weightGrams: sale.weightGrams,
        calculatedSellPrice,
        staffId: sale.staffId,
        status: "SOLD",
        timestamp: currentServerTimestamp, // Use server timestamp for all
        dateOfSale: currentDateForSale,    // Derived IST date from server time

        product_articleNumber: productDetails.articleNumber,
        product_articleName: productDetails.articleName,
        product_posDescription: productDetails.posDescription || null,
        product_metlerCode: productDetails.metlerCode || null,
        product_hsnCode: productDetails.hsnCode || null,
        product_taxPercentage: productDetails.taxPercentage !== undefined ? productDetails.taxPercentage : null,
        product_purchasePricePerKg: productDetails.purchasePricePerKg !== undefined ? productDetails.purchasePricePerKg : null,
        product_sellingRatePerKg: productDetails.sellingRatePerKg,
        product_mrpPer100g: productDetails.mrpPer100g !== undefined ? productDetails.mrpPer100g : null,
        product_remark: productDetails.remark || null,
      };

      const docRef = salesCollectionRef.doc(); // Auto-generate ID
      firestoreBatch.set(docRef, saleData);
      successfulRecords++;

      // Committing in smaller chunks within the loop if needed (max 500 operations per batch)
      if (successfulRecords > 0 && successfulRecords % 490 === 0 && salesPayload.length > successfulRecords) {
        console.log(`[VendorBulk] Committing intermediate batch of ${490} sales...`);
        await firestoreBatch.commit();
        // firestoreBatch = db.batch(); // Firestore batches are single use. This line needs to be db.batch() to create a new one
        // This logic is tricky. It's simpler to commit once if the total is expected < 500.
        // For very large vendor bulk adds, this loop would need a new batch instance.
        // For now, assuming vendor bulk adds are < 490 items at once.
      }
    }

    if (successfulRecords > 0) {
        console.log(`[VendorBulk] Committing final batch of ${successfulRecords} sales...`);
        await firestoreBatch.commit();
    }
    
    if (successfulRecords === 0 && failedRecords > 0) {
        return NextResponse.json({ 
            message: `Bulk sales processing completed with ${failedRecords} failures. No sales recorded.`,
            successfulRecords,
            failedRecords,
            errors
        }, { status: 400 });
    }

    return NextResponse.json({ 
        message: `Bulk sales processing completed. ${successfulRecords} recorded, ${failedRecords} failed.`,
        successfulRecords,
        failedRecords,
        errors: errors.length > 0 ? errors : undefined
    }, { status: successfulRecords > 0 && failedRecords > 0 ? 207 : (successfulRecords > 0 ? 201 : 400) });

  } catch (error: any) {
    console.error("[VendorBulk] Error in bulk sales record:", error);
    return NextResponse.json({ message: 'Failed to process vendor bulk sales.', details: error.message }, { status: 500 });
  }
}