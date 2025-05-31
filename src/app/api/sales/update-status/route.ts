// src/app/api/sales/update-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

const IST_TIMEZONE = 'Asia/Kolkata'; // Define if not already globally available

// Helper to get the hour (0-23) in IST from a Firestore Timestamp
const getHourInISTFromTimestamp = (timestamp: admin.firestore.Timestamp): number => {
    const dateFromTimestamp = timestamp.toDate(); // Converts to JS Date (UTC)
    const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false, // 24-hour format
        timeZone: IST_TIMEZONE,
    });
    return parseInt(formatter.format(dateFromTimestamp), 10);
};

export async function PUT(req: NextRequest) {
  try {
    const { transactionId, newStatus } = await req.json();

    if (!transactionId || !newStatus) {
      return NextResponse.json({ message: 'Transaction ID and new status are required.' }, { status: 400 });
    }
    if (newStatus !== "RETURNED_PRE_BILLING" && newStatus !== "SOLD") {
        return NextResponse.json({ message: 'Invalid status value.' }, { status: 400 });
    }

    const saleRef = db.collection('salesTransactions').doc(transactionId);

    await db.runTransaction(async (transaction) => {
      // --- Step 1: Perform ALL reads ---
      const saleDoc = await transaction.get(saleRef); // READ 1 (original sale)

      if (!saleDoc.exists) {
        throw new Error('Sale transaction not found.');
      }
      const saleData = saleDoc.data();
      if (!saleData) {
        throw new Error('Sale data is missing.');
      }

      const originalStatus = saleData.status;
      let dailySummarySnapshot = null;
      let staffSalesSnapshot = null;
      let productSalesSnapshot = null;
      let dateOfSale: string | null = null; // Initialize to allow use outside if block
      let originalSaleHourStr: string | null = null; // For hourly decrement

      // Only read aggregate docs if we are actually going to decrement them
      if (originalStatus === "SOLD" && newStatus === "RETURNED_PRE_BILLING") {
        dateOfSale = saleData.dateOfSale;
        const staffId = saleData.staffId;
        const articleNo = saleData.articleNo;
        const originalTimestamp = saleData.timestamp as admin.firestore.Timestamp; // Get original timestamp

        if (!dateOfSale || !staffId || !articleNo || !originalTimestamp) {
            throw new Error('Original sale data incomplete for reversal (date, staffId, articleNo, or timestamp missing).');
        }
        
        const originalSaleHourIST = getHourInISTFromTimestamp(originalTimestamp);
        originalSaleHourStr = originalSaleHourIST.toString().padStart(2, '0');
        
        const dailySummaryRef = db.collection('dailySalesSummaries').doc(dateOfSale);
        dailySummarySnapshot = await transaction.get(dailySummaryRef);

        const dailyStaffSalesRef = db.collection('dailyStaffSales').doc(dateOfSale);
        staffSalesSnapshot = await transaction.get(dailyStaffSalesRef);

        const dailyProductSalesRef = db.collection('dailyProductSales').doc(`${dateOfSale}_${articleNo}`);
        productSalesSnapshot = await transaction.get(dailyProductSalesRef);
      }

      // --- Step 2: Perform ALL writes ---
      transaction.update(saleRef, {
        status: newStatus,
        lastStatusUpdateAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (originalStatus === "SOLD" && newStatus === "RETURNED_PRE_BILLING" && dateOfSale && originalSaleHourStr) {
        const price = saleData.calculatedSellPrice;
        const weight = saleData.weightGrams;
        const staffId = saleData.staffId;
        const articleNo = saleData.articleNo;

        if (typeof price !== 'number' || typeof weight !== 'number') {
            throw new Error('Original sale data incomplete for aggregation reversal (price or weight missing).');
        }
        
        // 1. Decrement dailySalesSummaries (INCLUDING HOURLY)
        if (dailySummarySnapshot && dailySummarySnapshot.exists) {
          const updatePayload: admin.firestore.UpdateData = {
            totalSalesValue: admin.firestore.FieldValue.increment(-price),
            totalTransactions: admin.firestore.FieldValue.increment(-1),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          };
          // Decrement specific hour in hourlyBreakdown
          const hourlyBreakdownPath = `hourlyBreakdown.${originalSaleHourStr}.totalSales`;
          const hourlyCountPath = `hourlyBreakdown.${originalSaleHourStr}.transactionCount`;
          
          // Check if the hour field exists before trying to decrement
          const currentHourlyData = dailySummarySnapshot.data()?.hourlyBreakdown?.[originalSaleHourStr];
          if (currentHourlyData) {
              updatePayload[hourlyBreakdownPath] = admin.firestore.FieldValue.increment(-price);
              updatePayload[hourlyCountPath] = admin.firestore.FieldValue.increment(-1);
          } else {
              console.warn(`Attempted to decrement non-existent hour ${originalSaleHourStr} for date ${dateOfSale}`);
          }
          transaction.update(dailySummarySnapshot.ref, updatePayload);
        }

        // 2. Decrement dailyStaffSales
        if (staffSalesSnapshot && staffSalesSnapshot.exists) {
          const currentStaffStats = staffSalesSnapshot.data()?.staffStats || {};
          if (currentStaffStats[staffId]) {
            const staffValuePath = `staffStats.${staffId}.totalSalesValue`;
            const staffTxPath = `staffStats.${staffId}.totalTransactions`;
            transaction.update(staffSalesSnapshot.ref, { // Use staffSalesSnapshot.ref
              [staffValuePath]: admin.firestore.FieldValue.increment(-price),
              [staffTxPath]: admin.firestore.FieldValue.increment(-1),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }); // WRITE 3
          }
        }

        // 3. Decrement dailyProductSales
        if (productSalesSnapshot && productSalesSnapshot.exists) {
          transaction.update(productSalesSnapshot.ref, { // Use productSalesSnapshot.ref
            totalQuantitySoldGrams: admin.firestore.FieldValue.increment(-weight),
            totalSalesValue: admin.firestore.FieldValue.increment(-price),
            totalTransactions: admin.firestore.FieldValue.increment(-1),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          }); // WRITE 4
        }
      } else if (originalStatus === "RETURNED_PRE_BILLING" && newStatus === "SOLD") {
        console.warn(`Reverting a return for tx ${transactionId} back to SOLD. Aggregates not re-incremented in this version.`);
        // If you implement re-incrementing, ensure all reads happen before writes there too.
      }
    });

    return NextResponse.json({ message: `Sale status updated to ${newStatus} successfully. Aggregates adjusted if applicable.` });

  } catch (error: any) {
    console.error("Error updating sale status:", error);
    if (error.message === 'Sale transaction not found.') {
        return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: `Failed to update status: ${error.message}` }, { status: 500 });
  }
}