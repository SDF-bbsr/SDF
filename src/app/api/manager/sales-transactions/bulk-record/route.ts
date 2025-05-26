// src/app/api/manager/sales-transactions/bulk-record/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

// Re-use or define product lookup logic here or import from a shared utility
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
    console.warn(`Invalid article number for lookup: ${articleNo}`);
    return null;
  }
  const productRef = db.collection('product').doc(String(articleNo).trim());
  const productDoc = await productRef.get();
  if (!productDoc.exists) {
    console.warn(`Product with article number ${articleNo} not found during lookup.`);
    return null;
  }
  return productDoc.data() as ProductDetailsFromDB;
}


interface BulkSaleItemPayload {
  barcodeScanned: string;
  articleNo: string;
  weightGrams: number;
  staffId: string;
  dateOfSale: string; // YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  console.log("API POST /api/manager/sales-transactions/bulk-record called");
  try {
    const { sales } = await req.json() as { sales: BulkSaleItemPayload[] };

    if (!Array.isArray(sales) || sales.length === 0) {
      return NextResponse.json({ message: 'Request body must be a non-empty array of sales.' }, { status: 400 });
    }

    const salesCollectionRef = db.collection('salesTransactions');
    const firestoreBatch = db.batch();
    let successfulRecords = 0;
    let failedRecords = 0;
    const errors: string[] = [];

    // Prepare a fixed timestamp for all sales in this bulk operation (e.g., 2 PM on the selected date)
    // The dateOfSale from payload is YYYY-MM-DD. We need to combine it with a time.
    // Firestore serverTimestamp will use the server's current time when the batch commits,
    // which might not be what's desired if you want all to have the same historical timestamp.
    // For simplicity with bulk historical entry, let's make a client-like timestamp for the chosen date.

    for (const sale of sales) {
      if (!sale.articleNo || !sale.staffId || !sale.dateOfSale || typeof sale.weightGrams !== 'number') {
        failedRecords++;
        errors.push(`Missing data for barcode ${sale.barcodeScanned || 'N/A'}`);
        console.warn("Skipping sale due to missing core data:", sale);
        continue;
      }

      const productDetails = await lookupProduct(sale.articleNo);

      if (!productDetails || typeof productDetails.sellingRatePerKg !== 'number') {
        failedRecords++;
        errors.push(`Product details not found or invalid for article ${sale.articleNo} (barcode: ${sale.barcodeScanned})`);
        console.warn(`Product lookup failed for articleNo: ${sale.articleNo}`);
        continue;
      }

      const calculatedSellPrice = parseFloat(((sale.weightGrams / 1000) * productDetails.sellingRatePerKg).toFixed(2));

      // Construct the timestamp string: YYYY-MM-DDTHH:MM:SS.sssZ (e.g., 2 PM UTC)
      // Or, more reliably, convert to a Date object then to Firestore Timestamp.
      const [year, month, day] = sale.dateOfSale.split('-').map(Number);
      // Create a Date object for 2 PM on the given date IN THE SERVER'S LOCAL TIMEZONE
      // For UTC, adjust accordingly or ensure server is UTC.
      // For simplicity here, assuming we use local 2 PM. For specific UTC, use Date.UTC
      const saleTimestampDate = new Date(year, month - 1, day, 14, 0, 0); // 2 PM


      const saleData = {
        articleNo: sale.articleNo,
        barcodeScanned: sale.barcodeScanned,
        weightGrams: sale.weightGrams,
        calculatedSellPrice,
        staffId: sale.staffId,
        status: "SOLD",
        timestamp: admin.firestore.Timestamp.fromDate(saleTimestampDate), // Use specific timestamp
        dateOfSale: sale.dateOfSale, // Keep the YYYY-MM-DD for querying

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

      if (successfulRecords % 490 === 0) { // Commit in chunks if many successful records
        console.log(`Committing batch of ${successfulRecords % 490 || 490} sales...`);
        await firestoreBatch.commit();
        // firestoreBatch = db.batch(); // Re-initialize for next chunk of writes
        // Firestore batches are single-use. For multiple commits, you need a new batch object.
        // However, the outer loop is already processing `sales` array, 
        // it's better to create a new batch for each main loop iteration if sales.length > 490,
        // or just commit once at the end if total sales < 490.
        // For this structure, committing once after loop is simpler unless `sales` is huge.
      }
    }

    if (successfulRecords > 0 && successfulRecords % 490 !== 0) { // Commit any remaining operations
        console.log(`Committing final batch of ${successfulRecords % 490} sales...`);
        await firestoreBatch.commit();
    } else if (successfulRecords === 0 && failedRecords > 0) {
        // No successful records to commit, but there were failures
        return NextResponse.json({ 
            message: `Bulk sales processing completed with ${failedRecords} failures. No sales recorded.`,
            successfulRecords,
            failedRecords,
            errors
        }, { status: 400 }); // Or 207 if partial success could happen (not with current single batch commit logic)
    }


    return NextResponse.json({ 
        message: `Bulk sales processing completed. ${successfulRecords} recorded, ${failedRecords} failed.`,
        successfulRecords,
        failedRecords,
        errors: errors.length > 0 ? errors : undefined
    }, { status: successfulRecords > 0 && failedRecords > 0 ? 207 : (successfulRecords > 0 ? 201 : 400) }); // Multi-status or appropriate status

  } catch (error: any) {
    console.error("Error in bulk sales record:", error);
    return NextResponse.json({ message: 'Failed to process bulk sales.', details: error.message }, { status: 500 });
  }
}