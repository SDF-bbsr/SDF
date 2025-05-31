// src/app/api/manager/data-updation/process-batch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

const IST_TIMEZONE = 'Asia/Kolkata';

interface SaleTransactionDataForBatch {
    id: string;
    articleNo: string;
    calculatedSellPrice: number;
    dateOfSale: string; // Expected format: YYYY-MM-DD
    staffId: string;
    product_articleName?: string;
    weightGrams: number;
    timestamp: admin.firestore.Timestamp;
}

const getHourInISTFromTimestamp = (timestamp: admin.firestore.Timestamp): number => {
    const dateFromTimestamp = timestamp.toDate();
    const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', hour12: false, timeZone: IST_TIMEZONE,
    });
    return parseInt(formatter.format(dateFromTimestamp), 10);
};

// Helper to safely add numbers and round to 2 decimal places for currency
const addCurrency = (val1: number, val2: number): number => {
    return parseFloat((val1 + val2).toFixed(2));
};


export async function POST(req: NextRequest) {
  console.log("API POST /api/manager/data-updation/process-batch called");
  try {
    const { 
        dateToProcess, 
        batchSize = 50, 
        lastProcessedDocId, 
        staffNameMap: staffNameMapJson,
        isFirstBatchForDay 
    } = await req.json();

    if (!dateToProcess) {
      return NextResponse.json({ message: 'dateToProcess is required.' }, { status: 400 });
    }
    
    const staffNameMap = new Map<string,string>(staffNameMapJson ? Object.entries(staffNameMapJson) : []);

    if (isFirstBatchForDay) {
        console.log(`First batch for day ${dateToProcess} (batchSize: ${batchSize}). Deleting existing aggregates.`);
        const deleteBatch = db.batch();

        const summaryRef = db.collection('dailySalesSummaries').doc(dateToProcess);
        deleteBatch.delete(summaryRef);

        const staffSalesRef = db.collection('dailyStaffSales').doc(dateToProcess);
        deleteBatch.delete(staffSalesRef);

        const productSalesQuery = db.collection('dailyProductSales').where('date', '==', dateToProcess);
        const productSalesSnapshot = await productSalesQuery.get();
        
        let deletedProductDocsCount = 0;
        if (!productSalesSnapshot.empty) {
            productSalesSnapshot.docs.forEach(doc => {
                deleteBatch.delete(doc.ref);
                deletedProductDocsCount++;
            });
        }
        
        await deleteBatch.commit();
        console.log(`Deletion of aggregates for ${dateToProcess} complete. Summary: 1, StaffSales: 1, ProductSales: ${deletedProductDocsCount} docs.`);
    }

    let salesQuery: admin.firestore.Query = db.collection('salesTransactions')
      .where('status', '==', 'SOLD')
      .where('dateOfSale', '==', dateToProcess) 
      .orderBy(admin.firestore.FieldPath.documentId(), 'asc'); 

    if (lastProcessedDocId) {
      const lastDocSnapshot = await db.collection('salesTransactions').doc(lastProcessedDocId).get();
      if (lastDocSnapshot.exists) {
        salesQuery = salesQuery.startAfter(lastDocSnapshot);
        console.log(`Querying after doc ID: ${lastProcessedDocId} for date ${dateToProcess}`);
      } else {
        console.warn(`Last processed doc ID ${lastProcessedDocId} not found. Starting from beginning for date ${dateToProcess} for this batch.`);
      }
    }
    
    salesQuery = salesQuery.limit(batchSize);
    const salesSnapshot = await salesQuery.get();
    console.log(`Fetched ${salesSnapshot.docs.length} 'SOLD' transactions for date ${dateToProcess} in this batch.`);

    if (salesSnapshot.empty) {
      return NextResponse.json({ 
        message: `No more SOLD transactions to process for date ${dateToProcess} in this batch.`, 
        transactionsProcessedInBatch: 0,
        lastProcessedDocId: lastProcessedDocId 
      });
    }

    const transactionsInBatch: SaleTransactionDataForBatch[] = [];
    salesSnapshot.forEach(doc => {
        transactionsInBatch.push({ id: doc.id, ...(doc.data() as Omit<SaleTransactionDataForBatch, 'id'>) });
    });

    const newLastProcessedDocId = transactionsInBatch.length > 0 ? transactionsInBatch[transactionsInBatch.length - 1].id : lastProcessedDocId;

    // Note: Since we process one date at a time, salesByDate will have only one key.
    // This loop will effectively run once.
    const salesByDate: { [date: string]: SaleTransactionDataForBatch[] } = {};
    transactionsInBatch.forEach(tx => {
      if (tx.dateOfSale !== dateToProcess) {
          console.warn(`Transaction ${tx.id} has dateOfSale ${tx.dateOfSale} which does not match requested dateToProcess ${dateToProcess}. Skipping.`);
          return; 
      }
      if (!salesByDate[tx.dateOfSale]) salesByDate[tx.dateOfSale] = [];
      salesByDate[tx.dateOfSale].push(tx);
    });

    let aggregateDocsWrittenThisBatch = 0;

    for (const dateKey in salesByDate) { 
      const dailyTransactionsInBatch = salesByDate[dateKey]; // Transactions from the current batch for this date
      if (dailyTransactionsInBatch.length === 0) continue;
      
      console.log(`Aggregating for date: ${dateKey}, ${dailyTransactionsInBatch.length} transactions from this batch.`);

      const dailySummaryRef = db.collection('dailySalesSummaries').doc(dateKey);
      const dailyStaffSalesRef = db.collection('dailyStaffSales').doc(dateKey);
      
      // Transaction for summary and staff sales for this specific day
      await db.runTransaction(async (transaction) => {
        // --- Step 1: READ existing aggregate documents ---
        const summaryDocSnap = await transaction.get(dailySummaryRef);
        const staffSalesDocSnap = await transaction.get(dailyStaffSalesRef);

        // --- Step 2: Prepare data for writes ---

        // --- For dailySalesSummaries ---
        let currentTotalSalesValue = summaryDocSnap.exists ? summaryDocSnap.data()?.totalSalesValue || 0 : 0;
        let currentTotalTransactions = summaryDocSnap.exists ? summaryDocSnap.data()?.totalTransactions || 0 : 0;
        let currentHourlyBreakdown = summaryDocSnap.exists ? summaryDocSnap.data()?.hourlyBreakdown || {} : {};

        dailyTransactionsInBatch.forEach(tx => {
            currentTotalSalesValue = addCurrency(currentTotalSalesValue, tx.calculatedSellPrice);
            currentTotalTransactions += 1;

            const saleHour = getHourInISTFromTimestamp(tx.timestamp);
            const saleHourStr = saleHour.toString().padStart(2, '0');

            if (!currentHourlyBreakdown[saleHourStr]) {
                currentHourlyBreakdown[saleHourStr] = { totalSales: 0, transactionCount: 0 };
            }
            currentHourlyBreakdown[saleHourStr].totalSales = addCurrency(currentHourlyBreakdown[saleHourStr].totalSales, tx.calculatedSellPrice);
            currentHourlyBreakdown[saleHourStr].transactionCount += 1;
        });

        const summaryUpdatePayload = {
            date: dateKey,
            totalSalesValue: currentTotalSalesValue,
            totalTransactions: currentTotalTransactions,
            hourlyBreakdown: currentHourlyBreakdown, // Set the entire map
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        transaction.set(dailySummaryRef, summaryUpdatePayload, { merge: true }); // merge:true is crucial if isFirstBatchForDay was false & doc existed
        aggregateDocsWrittenThisBatch++;


        // --- For dailyStaffSales ---
        let currentStaffStats = staffSalesDocSnap.exists ? staffSalesDocSnap.data()?.staffStats || {} : {};
        
        dailyTransactionsInBatch.forEach(tx => {
            const staffId = tx.staffId;
            const staffNameFromMap = staffNameMap.get(staffId) || "Unknown Staff";

            if (!currentStaffStats[staffId]) {
                currentStaffStats[staffId] = { name: staffNameFromMap, totalSalesValue: 0, totalTransactions: 0 };
            } else if (currentStaffStats[staffId].name === "Unknown Staff" && staffNameFromMap !== "Unknown Staff") {
                currentStaffStats[staffId].name = staffNameFromMap; // Update name if better one is available
            }
            // Ensure name is set if it was somehow missing but staffId key existed
            if (!currentStaffStats[staffId].name) {
                currentStaffStats[staffId].name = staffNameFromMap;
            }

            currentStaffStats[staffId].totalSalesValue = addCurrency(currentStaffStats[staffId].totalSalesValue, tx.calculatedSellPrice);
            currentStaffStats[staffId].totalTransactions += 1;
        });

        const staffSalesUpdatePayload = {
            date: dateKey,
            staffStats: currentStaffStats, // Set the entire map
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        transaction.set(dailyStaffSalesRef, staffSalesUpdatePayload, { merge: true });
        aggregateDocsWrittenThisBatch++;
      }); // End of transaction for summary and staff
      
      // --- For dailyProductSales (using FieldValue.increment is fine here as each doc is product-specific) ---
      const productAggBatch = db.batch();
      let productBatchOps = 0;
      
      // First, aggregate product increments from the current batch
      const dayProductStatsIncrements: { [articleNo: string]: { nameIfNew: string; qty: number; value: number; count: number } } = {};
      dailyTransactionsInBatch.forEach(tx => {
          const productNameForAgg = tx.product_articleName || tx.articleNo;
          if (!dayProductStatsIncrements[tx.articleNo]) {
              dayProductStatsIncrements[tx.articleNo] = { nameIfNew: productNameForAgg, qty: 0, value: 0, count: 0 };
          }
          dayProductStatsIncrements[tx.articleNo].qty += tx.weightGrams;
          dayProductStatsIncrements[tx.articleNo].value = addCurrency(dayProductStatsIncrements[tx.articleNo].value, tx.calculatedSellPrice);
          dayProductStatsIncrements[tx.articleNo].count += 1;
      });

      for (const articleNo in dayProductStatsIncrements) {
        const agg = dayProductStatsIncrements[articleNo];
        const productAggRef = db.collection('dailyProductSales').doc(`${dateKey}_${articleNo}`);
        
        // Using FieldValue.increment is appropriate here because each product has its own document.
        // If isFirstBatchForDay=true, these documents were deleted, so increment acts as initialization.
        const productUpdatePayload: any = {
          date: dateKey, 
          productArticleNo: articleNo,
          productName: agg.nameIfNew, // Set/update name
          totalQuantitySoldGrams: admin.firestore.FieldValue.increment(agg.qty),
          totalSalesValue: admin.firestore.FieldValue.increment(agg.value), // Value is already summed and rounded for the batch
          totalTransactions: admin.firestore.FieldValue.increment(agg.count),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        
        productAggBatch.set(productAggRef, productUpdatePayload, { merge: true });
        productBatchOps++;
      }

      if (productBatchOps > 0) {
        await productAggBatch.commit();
        aggregateDocsWrittenThisBatch += productBatchOps;
        console.log(`Committed ${productBatchOps} product aggregate updates for date ${dateKey}.`);
      }
    } // End of for (const dateKey in salesByDate)

    return NextResponse.json({ 
        message: `Batch processed for date ${dateToProcess}. ${transactionsInBatch.length} transactions handled.`,
        transactionsProcessedInBatch: transactionsInBatch.length,
        lastProcessedDocId: newLastProcessedDocId,
        aggregateDocsWrittenThisBatch
    });

  } catch (error: any) {
    console.error("Error in process-batch API:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred in batch processing.";
    if (error instanceof Error && error.stack) {
        console.error("Stack trace:", error.stack);
    }
    return NextResponse.json({ message: 'Failed to process batch.', details: errorMessage }, { status: 500 });
  }
}