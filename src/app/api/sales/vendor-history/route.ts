// src/app/api/sales/vendor-history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

const IST_TIMEZONE = 'Asia/Kolkata';

// This function directly gets the YYYY-MM-DD string for the *current instant* in IST
const getCurrentISODateStringInIST = (): string => {
  const now = new Date(); // Current server UTC time
  const formatter = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // Format the current UTC instant directly into IST date string
};

// Helper to get a Date object representing a specific YYYY-MM-DD in IST (at 00:00:00 IST)
// This is useful for calculating week/month ranges based on a specific IST date.
const getDateInIST = (yyyyMmDdStr: string): Date => {
    // Parse the YYYY-MM-DD string and explicitly state it's an IST date.
    // new Date("YYYY-MM-DDTHH:mm:ssZ") or new Date("YYYY-MM-DDTHH:mm:ss+05:30")
    // A simpler way for just date is to construct carefully.
    const [year, month, day] = yyyyMmDdStr.split('-').map(Number);
    // This creates a Date object. When formatted with timeZone: 'UTC', it would be previous day evening.
    // When formatted with timeZone: 'Asia/Kolkata', it represents start of day in IST.
    // Let's make a UTC date that corresponds to 00:00 IST on that day.
    // IST is UTC+5:30. So 00:00 IST on YYYY-MM-DD is (YYYY-MM-DD 00:00:00) - 5.5 hours in UTC.
    // Example: 2025-05-29 00:00:00 IST is 2025-05-28 18:30:00 UTC
    const dateAtUTCCorrespondingToISTMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000);
    return dateAtUTCCorrespondingToISTMidnight;
};


const getWeekRangeInIST = (currentISTDateStr: string): { startOfWeek: string, endOfWeek: string, display: string } => {
  const currentDateInIST = getDateInIST(currentISTDateStr); // Get a Date object for calculations

  const d = new Date(currentDateInIST.valueOf()); // Clone for manipulation
  const day = d.getUTCDay(); // Use getUTCDay because our Date object is aligned with UTC for IST's midnight
  
  // Adjust to get to Monday of the current week
  const diffToMonday = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  // Construct new dates using UTC methods to keep them aligned
  const startOfWeekDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diffToMonday));
  
  const endOfWeekDate = new Date(startOfWeekDate.valueOf());
  endOfWeekDate.setUTCDate(startOfWeekDate.getUTCDate() + 6);

  const displayFormat: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: IST_TIMEZONE };
  const startDisplay = new Intl.DateTimeFormat('en-GB', displayFormat).format(startOfWeekDate);
  const endDisplay = new Intl.DateTimeFormat('en-GB', displayFormat).format(endOfWeekDate);
  
  return {
    startOfWeek: getCurrentISODateStringInISTFromDate(startOfWeekDate), // Format these specific dates
    endOfWeek: getCurrentISODateStringInISTFromDate(endOfWeekDate),
    display: `${startDisplay} - ${endDisplay}`
  };
};

const getMonthRangeInIST = (currentISTDateStr: string): { startOfMonth: string, endOfMonth: string, display: string } => {
  const currentDateInIST = getDateInIST(currentISTDateStr); // Get a Date object

  const startOfMonthDate = new Date(Date.UTC(currentDateInIST.getUTCFullYear(), currentDateInIST.getUTCMonth(), 1));
  const endOfMonthDate = new Date(Date.UTC(currentDateInIST.getUTCFullYear(), currentDateInIST.getUTCMonth() + 1, 0)); // Day 0 of next month
  
  const displayFormat: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric', timeZone: IST_TIMEZONE };
  const monthDisplay = new Intl.DateTimeFormat('en-US', displayFormat).format(startOfMonthDate);

  return {
    startOfMonth: getCurrentISODateStringInISTFromDate(startOfMonthDate),
    endOfMonth: getCurrentISODateStringInISTFromDate(endOfMonthDate),
    display: monthDisplay
  };
};

// Helper to format a given Date object into YYYY-MM-DD string in IST
const getCurrentISODateStringInISTFromDate = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
};


interface StaffSalesSummary {
  totalSalesValue: number;
  totalTransactions: number;
  displayDate?: string;
}

export async function GET(req: NextRequest) {
  console.log("API Route /api/sales/vendor-history called");
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staffId');
    const mode = searchParams.get('mode') || 'stats'; 
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    let startDateParam = searchParams.get('startDate');
    let endDateParam = searchParams.get('endDate');

    if (!staffId) {
      return NextResponse.json({ message: 'Staff ID is required.' }, { status: 400 });
    }
    
    const todayStrIST = getCurrentISODateStringInIST(); // This directly gives the IST calendar date string
    console.log(`API determined today's date string for querying (IST) as: ${todayStrIST}`);

    if (mode === 'stats') {
      // For displayDate for "today", we need a Date object that represents today in IST
      const todayDateForDisplay = getDateInIST(todayStrIST); 
      const weekRange = getWeekRangeInIST(todayStrIST);
      const monthRange = getMonthRangeInIST(todayStrIST);

      const todayDisplayFormat: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', timeZone: IST_TIMEZONE };
      const todayDisplay = new Intl.DateTimeFormat('en-US', todayDisplayFormat).format(todayDateForDisplay);

      const periodsToQuery = [
        { name: 'today', start: todayStrIST, end: todayStrIST, display: todayDisplay },
        { name: 'thisWeek', start: weekRange.startOfWeek, end: weekRange.endOfWeek, display: weekRange.display },
        { name: 'thisMonth', start: monthRange.startOfMonth, end: monthRange.endOfMonth, display: monthRange.display },
      ];

      const stats: Record<string, StaffSalesSummary> = {};
      // ... (rest of the stats logic is expected to be correct now that todayStrIST is accurate)
      for (const p of periodsToQuery) {
        let totalValue = 0;
        let totalPackets = 0;
        
        console.log(`[Stats] Querying for period: ${p.name}, start: ${p.start}, end: ${p.end}`);
        
        if (p.name === 'today') {
            const todayDocRef = db.collection('dailyStaffSales').doc(p.start);
            const docSnap = await todayDocRef.get();
            if (docSnap.exists) {
                const data = docSnap.data();
                if (data && data.staffStats && data.staffStats[staffId]) {
                    totalValue = data.staffStats[staffId].totalSalesValue || 0;
                    totalPackets = data.staffStats[staffId].totalTransactions || 0;
                }
            }
            console.log(`[Stats] Today's direct doc fetch for ID '${p.start}': exists=${docSnap.exists}, value=${totalValue}, packets=${totalPackets}`);
        } else { 
            const dailyStaffSalesQuery = db.collection('dailyStaffSales')
              .where('date', '>=', p.start)
              .where('date', '<=', p.end);
            
            const snapshot = await dailyStaffSalesQuery.get();
            snapshot.forEach(doc => {
              const data = doc.data();
              if (data.staffStats && data.staffStats[staffId]) {
                totalValue += data.staffStats[staffId].totalSalesValue || 0;
                totalPackets += data.staffStats[staffId].totalTransactions || 0;
              }
            });
            console.log(`[Stats] Period ${p.name} query: count=${snapshot.size}, value=${totalValue}, packets=${totalPackets}`);
        }
        
        stats[p.name] = { 
            totalSalesValue: parseFloat(totalValue.toFixed(2)), 
            totalTransactions: totalPackets,
            displayDate: p.display
        };
      }
      console.log("[Stats] Final stats object from API:", JSON.stringify(stats));
      return NextResponse.json({ stats });
    }

    // --- Daily Summaries Mode ---
    if (mode === 'dailySummaries') {
      let effectiveStartDate = startDateParam;
      let effectiveEndDate = endDateParam;

      if (!effectiveStartDate || !effectiveEndDate) {
        const todayForDefaults = getDateInIST(todayStrIST); // Use today's IST date for defaults
        const defaultEndDate = new Date(todayForDefaults);
        const defaultStartDate = new Date(todayForDefaults);
        defaultStartDate.setUTCDate(defaultEndDate.getUTCDate() - 6); // Use UTC date manipulation
        effectiveStartDate = getCurrentISODateStringInISTFromDate(defaultStartDate);
        effectiveEndDate = getCurrentISODateStringInISTFromDate(defaultEndDate);
      }
      // ... (rest of dailySummaries logic) ...
      const dailySummariesList: { date: string, totalSalesValue: number, totalTransactions: number }[] = [];
      const dailyStaffSalesQuery = db.collection('dailyStaffSales')
        .where('date', '>=', effectiveStartDate)
        .where('date', '<=', effectiveEndDate)
        .orderBy('date', 'desc');

      const snapshot = await dailyStaffSalesQuery.get();
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.staffStats && data.staffStats[staffId]) {
          dailySummariesList.push({
            date: data.date,
            totalSalesValue: data.staffStats[staffId].totalSalesValue || 0,
            totalTransactions: data.staffStats[staffId].totalTransactions || 0,
          });
        }
      });
      return NextResponse.json({ dailySummaries: dailySummariesList });
    }

    // --- Transactions Mode ---
    if (mode === 'transactions') {
      let effectiveStartDate = startDateParam;
      let effectiveEndDate = endDateParam;

      if (!effectiveStartDate || !effectiveEndDate) {
        effectiveStartDate = todayStrIST; 
        effectiveEndDate = todayStrIST;
      }
      // ... (rest of transactions logic) ...
      let query = db.collection('salesTransactions')
        .where('staffId', '==', staffId)
        .where('status', '==', 'SOLD')
        .where('dateOfSale', '>=', effectiveStartDate)
        .where('dateOfSale', '<=', effectiveEndDate)
        .orderBy('timestamp', 'desc');

      const countSnapshot = await query.count().get();
      const totalItems = countSnapshot.data().count;

      if (page > 1) {
        const previousDocsSnapshot = await query.limit((page - 1) * limit).get();
        if (!previousDocsSnapshot.empty) {
          const lastVisible = previousDocsSnapshot.docs[previousDocsSnapshot.docs.length - 1];
          query = query.startAfter(lastVisible);
        }
      }
      query = query.limit(limit);

      const transactionsSnapshot = await query.get();
      const transactionsData = transactionsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          articleNo: data.articleNo,
          productName: data.product_articleName,
          weightGrams: data.weightGrams,
          calculatedSellPrice: data.calculatedSellPrice,
          timestamp: data.timestamp.toDate().toISOString(),
          dateOfSale: data.dateOfSale,
        };
      });

      return NextResponse.json({
        transactions: transactionsData,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalItems: totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      });
    }

    return NextResponse.json({ message: 'Invalid mode specified.' }, { status: 400 });

  } catch (error: any) {
    console.error("Error in /api/sales/vendor-history:", error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    if (error.code === 9 || error.code === 'failed-precondition' || (error.message && error.message.toLowerCase().includes('index'))) {
        console.error("Potential Firestore Index issue. Details:", error.details || error.message);
        return NextResponse.json({ message: 'Query requires a Firestore index. Please check server logs or Firebase console.', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: errorMessage, details: error.message }, { status: 500 });
  }
}