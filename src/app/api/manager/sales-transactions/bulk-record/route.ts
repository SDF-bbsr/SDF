// src/app/api/manager/sales-transactions/bulk-record/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

const IST_TIMEZONE = 'Asia/Kolkata';

const getISODateStringInISTFromDate = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(date);
};

const getHourInISTFromDate = (date: Date): number => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', hour12: false, timeZone: IST_TIMEZONE,
    });
    return parseInt(formatter.format(date), 10); // Corrected: use 'date' not 'now'
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
  // Add any other fields that might be present in your 'product' collection
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

// In-memory cache for product lookups within this API call's scope
const productLookupCache = new Map<string, ProductDetailsFromDB>();

async function lookupProductCached(articleNo: string): Promise<ProductDetailsFromDB | null> {
  if (!articleNo || typeof articleNo !== 'string' || articleNo.trim() === "") {
    console.warn(`[ManagerBulkLookup] Invalid article number for lookup: ${articleNo}`);
    return null;
  }
  const trimmedArticleNo = String(articleNo).trim();

  if (productLookupCache.has(trimmedArticleNo)) {
    console.log(`[ManagerBulkLookup] Cache HIT for articleNo: ${trimmedArticleNo}`);
    return productLookupCache.get(trimmedArticleNo)!;
  }

  console.log(`[ManagerBulkLookup] Cache MISS for articleNo: ${trimmedArticleNo}. Fetching from DB.`);
  const productRef = db.collection('product').doc(trimmedArticleNo);
  const productDoc = await productRef.get(); // Firestore Read
  if (!productDoc.exists) {
    console.warn(`[ManagerBulkLookup] Product ${trimmedArticleNo} not found.`);
    return null;
  }
  const productData = productDoc.data() as ProductDetailsFromDB;
  productLookupCache.set(trimmedArticleNo, productData); // Store in cache
  return productData;
}


interface ManagerBulkSaleItemPayload {
  barcodeScanned: string;
  articleNo: string;
  weightGrams: number;
  staffId: string;
  dateOfSale: string; // YYYY-MM-DD
}

interface ProcessedSaleForManagerBulk {
    articleNo: string;
    barcodeScanned: string;
    weightGrams: number;
    calculatedSellPrice: number;
    staffId: string;
    status: string;
    timestamp: admin.firestore.Timestamp;
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
    // No originalPayload here, directly use fields
}


export async function POST(req: NextRequest) {
  console.log("API POST /api/manager/sales-transactions/bulk-record called");
  productLookupCache.clear(); // Clear cache at the start of each API call

  try {
    const { sales } = await req.json() as { sales: ManagerBulkSaleItemPayload[] };

    if (!Array.isArray(sales) || sales.length === 0) {
      return NextResponse.json({ message: 'Sales array is required and cannot be empty.' }, { status: 400 });
    }

    const salesCollectionRef = db.collection('salesTransactions');
    let mainSalesBatch = db.batch();
    
    let successfulRecordsCount = 0;
    let failedRecordsCount = 0;
    const processingErrors: { barcode: string, message: string }[] = [];
    
    const allProcessedSalesData: ProcessedSaleForManagerBulk[] = [];

    for (let i = 0; i < sales.length; i++) {
      const salePayload = sales[i];
      if (!salePayload.articleNo || !salePayload.staffId || !salePayload.dateOfSale || typeof salePayload.weightGrams !== 'number' || !salePayload.barcodeScanned) {
        failedRecordsCount++; 
        processingErrors.push({ barcode: salePayload.barcodeScanned || `Item index ${i}`, message: 'Core data missing (articleNo, staffId, dateOfSale, weightGrams, barcodeScanned).' }); 
        continue;
      }

      const productDetails = await lookupProductCached(salePayload.articleNo); // Use cached lookup
      if (!productDetails || typeof productDetails.sellingRatePerKg !== 'number') {
        failedRecordsCount++; 
        processingErrors.push({ barcode: salePayload.barcodeScanned, message: `Product details not found or invalid for article ${salePayload.articleNo}.`}); 
        continue;
      }

      const calculatedSellPrice = parseFloat(((salePayload.weightGrams / 1000) * productDetails.sellingRatePerKg).toFixed(2));
      
      const [year, month, day] = salePayload.dateOfSale.split('-').map(Number);
      // Create a Date object for 2 PM on the given date, assuming server's local time is implicitly UTC or close enough for Date constructor
      const saleTimestampDate = new Date(Date.UTC(year, month - 1, day, 14 - 5, 0 - 30, 0)); // 2 PM IST as UTC

      const saleDataForDB: Omit<ProcessedSaleForManagerBulk, 'originalPayload'> = { // Use a more specific type for DB write
        articleNo: salePayload.articleNo, 
        barcodeScanned: salePayload.barcodeScanned, 
        weightGrams: salePayload.weightGrams,
        calculatedSellPrice, 
        staffId: salePayload.staffId, 
        status: "SOLD", 
        timestamp: admin.firestore.Timestamp.fromDate(saleTimestampDate),
        dateOfSale: salePayload.dateOfSale, 
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
      mainSalesBatch.set(docRef, saleDataForDB);
      // For aggregation, we need ProcessedSaleForManagerBulk structure
      allProcessedSalesData.push({
        ...saleDataForDB 
        // originalPayload is not needed if all relevant data is already in saleDataForDB
      });
      successfulRecordsCount++;

      // Commit in chunks if necessary
      if (successfulRecordsCount > 0 && successfulRecordsCount % 490 === 0 && i < sales.length -1) {
        console.log(`[ManagerBulkRecord] Committing intermediate batch of sales transactions...`);
        await mainSalesBatch.commit();
        mainSalesBatch = db.batch(); // Re-initialize for the next chunk
      }
    }

    // Commit any remaining sales transactions in the last batch
    if (successfulRecordsCount > 0 && (successfulRecordsCount % 490 !== 0 || sales.length === successfulRecordsCount)) {
        console.log(`[ManagerBulkRecord] Committing final/remaining batch of sales transactions...`);
        await mainSalesBatch.commit();
    }
    console.log(`[ManagerBulkRecord] Total ${successfulRecordsCount} sales transactions committed.`);


    // --- Step 2: Aggregate Data if any sales were successful ---
    if (allProcessedSalesData.length > 0) {
        const salesByDate: { [date: string]: ProcessedSaleForManagerBulk[] } = {};
        allProcessedSalesData.forEach(s => {
            if (!salesByDate[s.dateOfSale]) salesByDate[s.dateOfSale] = [];
            salesByDate[s.dateOfSale].push(s);
        });

        const allStaffIds = Array.from(new Set(allProcessedSalesData.map(s => s.staffId)));
        const staffNameMap = new Map<string, string>();
        if (allStaffIds.length > 0) {
            const staffQuerySnapshot = await db.collection('staff').where(admin.firestore.FieldPath.documentId(), 'in', allStaffIds).get();
            staffQuerySnapshot.forEach(doc => { staffNameMap.set(doc.id, doc.data().name || "Unknown Staff"); });
        }

        for (const dateKey in salesByDate) {
            const salesForThisDate = salesByDate[dateKey];
            const dailySummaryRef = db.collection('dailySalesSummaries').doc(dateKey);
            const dailyStaffSalesRef = db.collection('dailyStaffSales').doc(dateKey);

            await db.runTransaction(async (transaction) => {
                // --- Reads within transaction ---
                const summaryDoc = await transaction.get(dailySummaryRef);
                const staffSalesDoc = await transaction.get(dailyStaffSalesRef);

                // --- Prepare updates ---
                let dateTotalSalesIncrement = 0;
                let dateTotalTxIncrement = salesForThisDate.length;
                const dateHourlyBreakdownUpdates: { [hourStr: string]: { salesIncrement: number, txIncrement: number} } = {};
                const dateStaffStatsUpdates: { [staffId: string]: { name: string, salesIncrement: number, txIncrement: number }} = {};

                salesForThisDate.forEach(s => {
                    dateTotalSalesIncrement += s.calculatedSellPrice;
                    
                    const saleHour = getHourInISTFromDate(s.timestamp.toDate());
                    const saleHourStr = saleHour.toString().padStart(2, '0');
                    if (!dateHourlyBreakdownUpdates[saleHourStr]) dateHourlyBreakdownUpdates[saleHourStr] = { salesIncrement: 0, txIncrement: 0 };
                    dateHourlyBreakdownUpdates[saleHourStr].salesIncrement += s.calculatedSellPrice;
                    dateHourlyBreakdownUpdates[saleHourStr].txIncrement += 1;
                    
                    const staffName = staffNameMap.get(s.staffId) || "Unknown Staff";
                    if (!dateStaffStatsUpdates[s.staffId]) dateStaffStatsUpdates[s.staffId] = { name: staffName, salesIncrement: 0, txIncrement: 0 };
                    else if (dateStaffStatsUpdates[s.staffId].name !== staffName && staffName !== "Unknown Staff") dateStaffStatsUpdates[s.staffId].name = staffName;
                    dateStaffStatsUpdates[s.staffId].salesIncrement += s.calculatedSellPrice;
                    dateStaffStatsUpdates[s.staffId].txIncrement += 1;
                });

                // Prepare daily summary update object
                const currentSummaryData = summaryDoc.data() || {};
                const newHourlyBreakdown = { ...(currentSummaryData.hourlyBreakdown || {}) };
                for(const hr in dateHourlyBreakdownUpdates){
                    if(!newHourlyBreakdown[hr]) newHourlyBreakdown[hr] = { totalSales: 0, transactionCount: 0};
                    newHourlyBreakdown[hr].totalSales = parseFloat(((newHourlyBreakdown[hr].totalSales || 0) + dateHourlyBreakdownUpdates[hr].salesIncrement).toFixed(2));
                    newHourlyBreakdown[hr].transactionCount = (newHourlyBreakdown[hr].transactionCount || 0) + dateHourlyBreakdownUpdates[hr].txIncrement;
                }
                const dailySummaryUpdatePayload = {
                    date: dateKey,
                    totalSalesValue: admin.firestore.FieldValue.increment(dateTotalSalesIncrement),
                    totalTransactions: admin.firestore.FieldValue.increment(dateTotalTxIncrement),
                    hourlyBreakdown: newHourlyBreakdown, // Set the entire map
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                };
                transaction.set(dailySummaryRef, dailySummaryUpdatePayload, { merge: true });


                // Prepare daily staff sales update object
                const currentStaffSalesData = staffSalesDoc.data() || {};
                const newStaffStats = { ...(currentStaffSalesData.staffStats || {}) };
                for(const sId in dateStaffStatsUpdates){
                    if(!newStaffStats[sId]) newStaffStats[sId] = { name: dateStaffStatsUpdates[sId].name, totalSalesValue: 0, totalTransactions: 0};
                    else if (newStaffStats[sId].name !== dateStaffStatsUpdates[sId].name && dateStaffStatsUpdates[sId].name !== "Unknown Staff") newStaffStats[sId].name = dateStaffStatsUpdates[sId].name;
                    newStaffStats[sId].totalSalesValue = parseFloat(((newStaffStats[sId].totalSalesValue || 0) + dateStaffStatsUpdates[sId].salesIncrement).toFixed(2));
                    newStaffStats[sId].totalTransactions = (newStaffStats[sId].totalTransactions || 0) + dateStaffStatsUpdates[sId].txIncrement;
                }
                const staffSalesUpdatePayload = {
                    date: dateKey,
                    staffStats: newStaffStats, // Set the entire map
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                };
                transaction.set(dailyStaffSalesRef, staffSalesUpdatePayload, { merge: true });
            });
            console.log(`[ManagerBulkRecord] Daily/Staff aggregates updated for date: ${dateKey}`);

            // Batch update for dailyProductSales for this date (using FieldValue.increment is fine here)
            const productAggBatch = db.batch();
            // ... (product aggregation logic as before - this part was okay)
            const productAggForDate: { [articleNo: string]: { name: string, qty: number, value: number, count: number }} = {};
            salesForThisDate.forEach(s => {
                if (!productAggForDate[s.articleNo]) productAggForDate[s.articleNo] = { name: s.product_articleName, qty:0, value:0, count:0};
                productAggForDate[s.articleNo].qty += s.weightGrams;
                productAggForDate[s.articleNo].value += s.calculatedSellPrice;
                productAggForDate[s.articleNo].count +=1;
            });
            for (const articleNo in productAggForDate) {
                const agg = productAggForDate[articleNo];
                const productAggRef = db.collection('dailyProductSales').doc(`${dateKey}_${articleNo}`);
                productAggBatch.set(productAggRef, {
                    date: dateKey, productArticleNo: articleNo, productName: agg.name,
                    totalQuantitySoldGrams: admin.firestore.FieldValue.increment(agg.qty),
                    totalSalesValue: admin.firestore.FieldValue.increment(parseFloat(agg.value.toFixed(2))),
                    totalTransactions: admin.firestore.FieldValue.increment(agg.count),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            await productAggBatch.commit();
            console.log(`[ManagerBulkRecord] Product aggregates updated for date: ${dateKey}`);
        }
    }
    
    if (failedRecordsCount > 0 && successfulRecordsCount === 0) {
        return NextResponse.json({ message: `Bulk processing failed for all ${failedRecordsCount} items.`, successfulRecords: 0, failedRecords: failedRecordsCount, errors: processingErrors }, { status: 400 });
    }

    return NextResponse.json({ 
        message: `Bulk sales processing completed. ${successfulRecordsCount} recorded, ${failedRecordsCount} failed. Aggregates updated.`,
        successfulRecords: successfulRecordsCount,
        failedRecords: failedRecordsCount,
        errors: processingErrors.length > 0 ? processingErrors : undefined
    }, { status: successfulRecordsCount > 0 && failedRecordsCount > 0 ? 207 : (successfulRecordsCount > 0 ? 201 : 500) }); // Use 500 if successful is 0 and failed > 0 but not caught above

  } catch (error: any) {
    console.error("[ManagerBulkRecord] Outer error:", error);
    return NextResponse.json({ message: 'Failed to process manager bulk sales.', details: error.message || String(error) }, { status: 500 });
  }
}
