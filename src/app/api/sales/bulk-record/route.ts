// src/app/api/sales/bulk-record/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

const IST_TIMEZONE = 'Asia/Kolkata';

const getCurrentISODateStringInIST = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(now);
};

const getCurrentHourInIST = (): number => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', hour12: false, timeZone: IST_TIMEZONE,
    });
    return parseInt(formatter.format(now), 10);
};

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
  if (!articleNo || typeof articleNo !== 'string' || articleNo.trim() === "") return null;
  const productRef = db.collection('product').doc(String(articleNo).trim());
  const productDoc = await productRef.get();
  if (!productDoc.exists) return null;
  return productDoc.data() as ProductDetailsFromDB;
}

interface VendorBulkSaleItemPayload {
  barcodeScanned: string;
  articleNo: string;
  weightGrams: number;
  staffId: string;
}

interface ProcessedSaleData {
    articleNo: string;
    barcodeScanned: string;
    weightGrams: number;
    calculatedSellPrice: number;
    staffId: string;
    status: string;
    timestamp: admin.firestore.FieldValue;
    dateOfSale: string;
    product_articleNumber: string;
    product_articleName: string;
    product_posDescription?: string | null;
    product_metlerCode?: string | null;
    product_hsnCode?: string | null;
    product_taxPercentage?: number | null;
    product_purchasePricePerKg?: number | null;
    product_sellingRatePerKg?: number | null;
    product_mrpPer100g?: number | null;
    product_remark?: string | null;
}

export async function POST(req: NextRequest) {
  console.log("API POST /api/sales/bulk-record called");
  try {
    const body = await req.json();
    const salesPayload = body.sales as VendorBulkSaleItemPayload[];

    if (!Array.isArray(salesPayload) || salesPayload.length === 0) {
      return NextResponse.json({ message: 'Request body must be a non-empty array of sales.' }, { status: 400 });
    }

    const salesCollectionRef = db.collection('salesTransactions');
    const salesBatch = db.batch();
    
    let successfulRecords = 0;
    let failedRecords = 0;
    const errors: { barcode: string, message: string }[] = [];
    
    const todayStrIST = getCurrentISODateStringInIST();
    // For bulk, all items share the same server-evaluated timestamp from Firestore
    // and the same current hour for hourly breakdown.
    const currentHourIST = getCurrentHourInIST();
    const currentHourStr = currentHourIST.toString().padStart(2, '0');
    const currentServerTimestamp = admin.firestore.FieldValue.serverTimestamp();

    const processedSalesForAgg: ProcessedSaleData[] = [];

    for (const sale of salesPayload) {
      if (!sale.articleNo || !sale.staffId || typeof sale.weightGrams !== 'number' || !sale.barcodeScanned) {
        failedRecords++; errors.push({ barcode: sale.barcodeScanned || 'UNKNOWN', message: 'Core data missing.'}); continue;
      }
      const productDetails = await lookupProduct(sale.articleNo);
      if (!productDetails || typeof productDetails.sellingRatePerKg !== 'number') {
        failedRecords++; errors.push({ barcode: sale.barcodeScanned, message: `Product invalid: ${sale.articleNo}.`}); continue;
      }
      const calculatedSellPrice = parseFloat(((sale.weightGrams / 1000) * productDetails.sellingRatePerKg).toFixed(2));
      const saleData: ProcessedSaleData = {
        articleNo: sale.articleNo,
        barcodeScanned: sale.barcodeScanned,
        weightGrams: sale.weightGrams,
        calculatedSellPrice,
        staffId: sale.staffId,
        status: "SOLD",
        timestamp: currentServerTimestamp,
        dateOfSale: todayStrIST,
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
      const docRef = salesCollectionRef.doc();
      salesBatch.set(docRef, saleData);
      processedSalesForAgg.push(saleData);
      successfulRecords++;
    }

    if (successfulRecords > 0) {
      await salesBatch.commit();
      console.log(`[BulkRecord] Committed ${successfulRecords} sales transactions.`);

      const dailySummaryRef = db.collection('dailySalesSummaries').doc(todayStrIST);
      const dailyStaffSalesRef = db.collection('dailyStaffSales').doc(todayStrIST);

      const uniqueStaffIdsInBatch = Array.from(new Set(processedSalesForAgg.map(s => s.staffId)));
      const staffNameMap = new Map<string, string>();
      if (uniqueStaffIdsInBatch.length > 0) {
          const staffQuerySnapshot = await db.collection('staff').where(admin.firestore.FieldPath.documentId(), 'in', uniqueStaffIdsInBatch).get();
          staffQuerySnapshot.forEach(doc => { staffNameMap.set(doc.id, doc.data().name || "Unknown Staff"); });
      }
      
      await db.runTransaction(async (transaction) => {
        // --- Step 1: Perform all reads ---
        const summaryDoc = await transaction.get(dailySummaryRef);
        const staffSalesDoc = await transaction.get(dailyStaffSalesRef);

        // --- Step 2: Prepare data for writes ---
        let batchTotalSalesValue = 0;
        processedSalesForAgg.forEach(s => batchTotalSalesValue += s.calculatedSellPrice);
        
        // For dailySalesSummaries (INCLUDING HOURLY)
        let newTotalSalesForDay = batchTotalSalesValue;
        let newTxCountForDay = processedSalesForAgg.length;
        let hourlyBreakdownUpdate = summaryDoc.exists ? summaryDoc.data()?.hourlyBreakdown || {} : {};

        // Aggregate hourly data for the current batch
        // All sales in this bulk operation are considered to happen at `currentHourStr`
        if (!hourlyBreakdownUpdate[currentHourStr]) {
            hourlyBreakdownUpdate[currentHourStr] = { totalSales: 0, transactionCount: 0 };
        }
        hourlyBreakdownUpdate[currentHourStr].totalSales = parseFloat((hourlyBreakdownUpdate[currentHourStr].totalSales + batchTotalSalesValue).toFixed(2));
        hourlyBreakdownUpdate[currentHourStr].transactionCount += processedSalesForAgg.length;

        if (summaryDoc.exists) {
          newTotalSalesForDay += summaryDoc.data()?.totalSalesValue || 0;
          newTxCountForDay += summaryDoc.data()?.totalTransactions || 0;
          // If summaryDoc exists, its hourlyBreakdown (excluding currentHourStr) is already part of hourlyBreakdownUpdate
        }
        const dailySummaryUpdateData = {
          date: todayStrIST,
          totalSalesValue: parseFloat(newTotalSalesForDay.toFixed(2)),
          totalTransactions: newTxCountForDay,
          hourlyBreakdown: hourlyBreakdownUpdate,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };

        // For dailyStaffSales
        let staffStats = staffSalesDoc.exists ? staffSalesDoc.data()?.staffStats || {} : {};
        processedSalesForAgg.forEach(s => {
          const staffId = s.staffId;
          const staffName = staffNameMap.get(staffId) || "Unknown Staff";
          if (!staffStats[staffId]) {
            staffStats[staffId] = { name: staffName, totalSalesValue: 0, totalTransactions: 0 };
          } else if (staffStats[staffId].name !== staffName && staffName !== "Unknown Staff") {
             staffStats[staffId].name = staffName;
          }
          staffStats[staffId].totalSalesValue = parseFloat((staffStats[staffId].totalSalesValue + s.calculatedSellPrice).toFixed(2));
          staffStats[staffId].totalTransactions += 1;
        });
        const staffSalesUpdateData = {
          date: todayStrIST,
          staffStats: staffStats,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };

        // --- Step 3: Perform all writes ---
        transaction.set(dailySummaryRef, dailySummaryUpdateData, { merge: true });
        transaction.set(dailyStaffSalesRef, staffSalesUpdateData, { merge: true });
      });
      console.log(`[BulkRecord] Updated daily (incl. hourly) and staff summaries.`);

      const productAggBatch = db.batch();
      const productAggSummary: { [key: string]: { name: string, qty: number, value: number, count: number } } = {};

      processedSalesForAgg.forEach(s => {
        if (!productAggSummary[s.articleNo]) {
          productAggSummary[s.articleNo] = { name: s.product_articleName, qty: 0, value: 0, count: 0 };
        }
        productAggSummary[s.articleNo].qty += s.weightGrams;
        productAggSummary[s.articleNo].value += s.calculatedSellPrice;
        productAggSummary[s.articleNo].count += 1;
      });

      for (const articleNo in productAggSummary) {
        const agg = productAggSummary[articleNo];
        const productAggRef = db.collection('dailyProductSales').doc(`${todayStrIST}_${articleNo}`);
        productAggBatch.set(productAggRef, {
          date: todayStrIST,
          productArticleNo: articleNo,
          productName: agg.name,
          totalQuantitySoldGrams: admin.firestore.FieldValue.increment(agg.qty),
          totalSalesValue: admin.firestore.FieldValue.increment(parseFloat(agg.value.toFixed(2))),
          totalTransactions: admin.firestore.FieldValue.increment(agg.count),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      await productAggBatch.commit();
      console.log(`[BulkRecord] Updated product summaries.`);
    }
    
    if (successfulRecords === 0 && failedRecords > 0) {
        return NextResponse.json({ 
            message: `Bulk sales processing completed with ${failedRecords} failures. No sales recorded.`,
            successfulRecords, failedRecords, errors
        }, { status: 400 });
    }

    return NextResponse.json({ 
        message: `Bulk sales processing completed. ${successfulRecords} recorded, ${failedRecords} failed. Aggregates updated.`,
        successfulRecords, failedRecords, errors: errors.length > 0 ? errors : undefined
    }, { status: successfulRecords > 0 && failedRecords > 0 ? 207 : (successfulRecords > 0 ? 201 : 400) });

  } catch (error: any) {
    console.error("[BulkRecord] Error in bulk sales record:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ message: 'Failed to process vendor bulk sales.', details: errorMessage }, { status: 500 });
  }
}