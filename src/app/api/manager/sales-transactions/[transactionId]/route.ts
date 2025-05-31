// src/app/api/manager/sales-transactions/[transactionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

const IST_TIMEZONE = 'Asia/Kolkata';

// Helper to get the hour (0-23) in IST from a Firestore Timestamp
const getHourInISTFromTimestamp = (timestamp: admin.firestore.Timestamp): number => {
    const dateFromTimestamp = timestamp.toDate();
    const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', hour12: false, timeZone: IST_TIMEZONE,
    });
    return parseInt(formatter.format(dateFromTimestamp), 10);
};

export async function DELETE(
  req: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  const transactionId = params.transactionId;
  console.log(`API DELETE /api/manager/sales-transactions/${transactionId} called`);

  try {
    if (!transactionId) {
      return NextResponse.json({ message: 'Transaction ID is required.' }, { status: 400 });
    }

    const saleRef = db.collection('salesTransactions').doc(transactionId);

    // Use a transaction to ensure atomicity of delete and aggregate decrements
    await db.runTransaction(async (transaction) => {
        const saleDoc = await transaction.get(saleRef); // READ 1

        if (!saleDoc.exists) {
            throw new Error(`Sale transaction with ID "${transactionId}" not found.`);
        }
        const saleData = saleDoc.data();
        if (!saleData) {
            throw new Error('Sale data is missing for the transaction.');
        }

        // Only decrement aggregates if the item was "SOLD"
        if (saleData.status === "SOLD") {
            const dateOfSale = saleData.dateOfSale;
            const staffId = saleData.staffId;
            const articleNo = saleData.articleNo;
            const price = saleData.calculatedSellPrice;
            const weight = saleData.weightGrams;
            const originalTimestamp = saleData.timestamp as admin.firestore.Timestamp;

            if (!dateOfSale || !staffId || !articleNo || typeof price !== 'number' || typeof weight !== 'number' || !originalTimestamp) {
                throw new Error('Sale data incomplete for aggregate reversal during delete.');
            }

            const originalSaleHourIST = getHourInISTFromTimestamp(originalTimestamp);
            const originalSaleHourStr = originalSaleHourIST.toString().padStart(2, '0');

            // Prepare refs for aggregate documents
            const dailySummaryRef = db.collection('dailySalesSummaries').doc(dateOfSale);
            const dailyStaffSalesRef = db.collection('dailyStaffSales').doc(dateOfSale);
            const dailyProductSalesRef = db.collection('dailyProductSales').doc(`${dateOfSale}_${articleNo}`);

            // Read aggregate documents (must happen before writes)
            const dailySummarySnapshot = await transaction.get(dailySummaryRef); // READ 2
            const staffSalesSnapshot = await transaction.get(dailyStaffSalesRef); // READ 3
            const productSalesSnapshot = await transaction.get(dailyProductSalesRef); // READ 4

            // Perform writes for decrements
            if (dailySummarySnapshot.exists) {
                const updatePayload: admin.firestore.UpdateData = {
                    totalSalesValue: admin.firestore.FieldValue.increment(-price),
                    totalTransactions: admin.firestore.FieldValue.increment(-1),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                };
                const hourlyBreakdownPath = `hourlyBreakdown.${originalSaleHourStr}.totalSales`;
                const hourlyCountPath = `hourlyBreakdown.${originalSaleHourStr}.transactionCount`;
                if (dailySummarySnapshot.data()?.hourlyBreakdown?.[originalSaleHourStr]) {
                    updatePayload[hourlyBreakdownPath] = admin.firestore.FieldValue.increment(-price);
                    updatePayload[hourlyCountPath] = admin.firestore.FieldValue.increment(-1);
                }
                transaction.update(dailySummaryRef, updatePayload); // WRITE 1 (aggregates)
            }
            if (staffSalesSnapshot.exists && staffSalesSnapshot.data()?.staffStats?.[staffId]) {
                const staffValuePath = `staffStats.${staffId}.totalSalesValue`;
                const staffTxPath = `staffStats.${staffId}.totalTransactions`;
                transaction.update(dailyStaffSalesRef, {
                    [staffValuePath]: admin.firestore.FieldValue.increment(-price),
                    [staffTxPath]: admin.firestore.FieldValue.increment(-1),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                }); // WRITE 2 (aggregates)
            }
            if (productSalesSnapshot.exists) {
                transaction.update(dailyProductSalesRef, {
                    totalQuantitySoldGrams: admin.firestore.FieldValue.increment(-weight),
                    totalSalesValue: admin.firestore.FieldValue.increment(-price),
                    totalTransactions: admin.firestore.FieldValue.increment(-1),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                }); // WRITE 3 (aggregates)
            }
        }
        // Delete the actual sales transaction document
        transaction.delete(saleRef); // WRITE (original sale)
    });
    
    console.log("Sale transaction deleted and aggregates adjusted:", transactionId);
    return NextResponse.json({ message: `Sale transaction ID "${transactionId}" deleted successfully. Aggregates adjusted if applicable.`, id: transactionId });

  } catch (error: any) {
    console.error(`Error deleting sale transaction ${transactionId}:`, error);
    if (error.message.includes("not found")) {
        return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: 'Failed to delete sale transaction.', details: error.message }, { status: 500 });
  }
}