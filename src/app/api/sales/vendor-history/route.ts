// src/app/api/sales/vendor-history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

const getISODateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export async function GET(req: NextRequest) {
  console.log("API Route /api/sales/vendor-history called (Simplified Version)");
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staffId');
    const startDateParam = searchParams.get('startDate'); // YYYY-MM-DD
    const endDateParam = searchParams.get('endDate');     // YYYY-MM-DD

    if (!staffId) {
      console.error("Missing staffId in request");
      return NextResponse.json({ message: 'Staff ID is required.' }, { status: 400 });
    }
    console.log(`Fetching history for staffId: ${staffId}, startDate: ${startDateParam}, endDate: ${endDateParam}`);

    // --- Calculate Stats (These queries are simple and should have basic indexes) ---
    const today = new Date();
    let todayStr = getISODateString(today);

    let tempDate = new Date(today);
    const sevenDaysAgoStr = getISODateString(new Date(tempDate.setDate(tempDate.getDate() - 6)));

    tempDate = new Date(today); // Reset tempDate
    const thirtyDaysAgoStr = getISODateString(new Date(tempDate.setDate(tempDate.getDate() - 29)));

    const statsPromises = [
      db.collection('salesTransactions')
        .where('staffId', '==', staffId)
        .where('dateOfSale', '==', todayStr)
        .where('status', '==', 'SOLD')
        .get(),
      db.collection('salesTransactions')
        .where('staffId', '==', staffId)
        .where('dateOfSale', '>=', sevenDaysAgoStr)
        .where('dateOfSale', '<=', todayStr) // Keep for accuracy if data can be future-dated
        .where('status', '==', 'SOLD')
        .get(),
      db.collection('salesTransactions')
        .where('staffId', '==', staffId)
        .where('dateOfSale', '>=', thirtyDaysAgoStr)
        .where('dateOfSale', '<=', todayStr) // Keep for accuracy
        .where('status', '==', 'SOLD')
        .get(),
    ];
    console.log("Executing stats queries...");
    const [todaySnapshot, sevenDaySnapshot, thirtyDaySnapshot] = await Promise.all(statsPromises);
    console.log("Stats queries completed.");

    const calculateSummary = (snapshot: admin.firestore.QuerySnapshot) => {
      let totalValue = 0;
      snapshot.forEach(doc => {
        totalValue += doc.data().calculatedSellPrice || 0;
      });
      return {
        totalValue: parseFloat(totalValue.toFixed(2)),
        totalPackets: snapshot.size,
      };
    };

    const stats = {
      today: calculateSummary(todaySnapshot),
      last7Days: calculateSummary(sevenDaySnapshot),
      last30Days: calculateSummary(thirtyDaySnapshot),
    };
    console.log("Stats calculated:", stats);

    // --- Fetch ALL "SOLD" Transaction List for the staffId, ordered by timestamp ---
    // This query only needs an index on: staffId (ASC), status (ASC), timestamp (DESC)
    // OR staffId (ASC), timestamp (DESC) if status is always "SOLD" for this view.
    // The Firestore error message from your log will tell you the exact index for this part.
    console.log("Executing base transaction list query (staffId, status, orderBy timestamp)...");
    const baseTransactionsQuery = db.collection('salesTransactions')
      .where('staffId', '==', staffId)
      .where('status', '==', 'SOLD') // Assuming we always want SOLD status for this history
      .orderBy('timestamp', 'desc'); // We'll sort and then filter by date in JS

    const allTransactionsSnapshot = await baseTransactionsQuery.get();
    console.log(`Base transaction query completed. Fetched ${allTransactionsSnapshot.docs.length} total transactions for staff.`);

    let allTransactions = allTransactionsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        articleNo: data.articleNo,
        weightGrams: data.weightGrams,
        calculatedSellPrice: data.calculatedSellPrice,
        timestamp: data.timestamp.toDate().toISOString(), // Already a string
        dateOfSale: data.dateOfSale as string, // Already a string YYYY-MM-DD
      };
    });

    // --- Filter by date in JavaScript if parameters are provided ---
    let filteredTransactions = allTransactions;
    if (startDateParam) {
      console.log(`Filtering by startDate: ${startDateParam}`);
      filteredTransactions = filteredTransactions.filter(tx => tx.dateOfSale >= startDateParam);
    }
    if (endDateParam) {
      console.log(`Filtering by endDate: ${endDateParam}`);
      filteredTransactions = filteredTransactions.filter(tx => tx.dateOfSale <= endDateParam);
    }

    // Apply limit after JS filtering for simplicity, or before fetching if you know max needed
    const finalTransactions = filteredTransactions.slice(0, 100); // Send up to 100 of the filtered results
    console.log(`Filtered down to ${finalTransactions.length} transactions to send.`);


    return NextResponse.json({
      stats,
      transactions: finalTransactions, // Send the potentially JS-filtered and sliced list
    });

  } catch (error: any) {
    console.error("Detailed error in /api/sales/vendor-history (Simplified):", error);
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}