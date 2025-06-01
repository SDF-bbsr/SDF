// src/app/api/sales/vendor-history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore'; // Needed for potential future use, not immediately for GET

const IST_TIMEZONE = 'Asia/Kolkata';

// --- Date Helper Functions (Mostly Unchanged, verify usage) ---
const getCurrentISODateStringInIST = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(now);
};

const getDateInIST = (yyyyMmDdStr: string): Date => {
  const [year, month, day] = yyyyMmDdStr.split('-').map(Number);
  const dateAtUTCCorrespondingToISTMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000);
  return dateAtUTCCorrespondingToISTMidnight;
};

const getCurrentISODateStringInISTFromDate = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(date);
};

// These are used for transaction filters, so keep them
const getWeekRangeInISTForFilter = (currentISTDateStr: string): { startOfWeek: string, endOfWeek: string, display: string } => {
  const currentDateInIST = getDateInIST(currentISTDateStr);
  const d = new Date(currentDateInIST.valueOf());
  const day = d.getUTCDay();
  const diffToMonday = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const startOfWeekDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diffToMonday));
  const endOfWeekDate = new Date(startOfWeekDate.valueOf());
  endOfWeekDate.setUTCDate(startOfWeekDate.getUTCDate() + 6);
  const displayFormat: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: IST_TIMEZONE };
  const startDisplay = new Intl.DateTimeFormat('en-GB', displayFormat).format(startOfWeekDate);
  const endDisplay = new Intl.DateTimeFormat('en-GB', displayFormat).format(endOfWeekDate);
  return {
    startOfWeek: getCurrentISODateStringInISTFromDate(startOfWeekDate),
    endOfWeek: getCurrentISODateStringInISTFromDate(endOfWeekDate),
    display: `${startDisplay} - ${endDisplay}`
  };
};

const getMonthRangeInISTForFilter = (currentISTDateStr: string): { startOfMonth: string, endOfMonth: string, display: string } => {
  const currentDateInIST = getDateInIST(currentISTDateStr);
  const startOfMonthDate = new Date(Date.UTC(currentDateInIST.getUTCFullYear(), currentDateInIST.getUTCMonth(), 1));
  const endOfMonthDate = new Date(Date.UTC(currentDateInIST.getUTCFullYear(), currentDateInIST.getUTCMonth() + 1, 0));
  const displayFormat: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric', timeZone: IST_TIMEZONE };
  const monthDisplay = new Intl.DateTimeFormat('en-US', displayFormat).format(startOfMonthDate);
  return {
    startOfMonth: getCurrentISODateStringInISTFromDate(startOfMonthDate),
    endOfMonth: getCurrentISODateStringInISTFromDate(endOfMonthDate),
    display: monthDisplay
  };
};


// --- Interfaces for Target Data ---
interface StaffTargetDetail {
  incentivePercentage: number;
  target: number;
}

interface WeekTargetDataFromDB {
  endDate: string;   // "YYYY-MM-DD"
  label: string;     // "Week (01-07)"
  overallTarget: number;
  staff: Record<string, StaffTargetDetail>; // staffId -> details
  startDate: string; // "YYYY-MM-DD"
}

interface MonthlyTargetDocument {
  month: string; // "YYYY-MM"
  weeks: {
    [weekKey: string]: WeekTargetDataFromDB; // "week1", "week2", etc.
  };
}

interface CurrentWeekTargetInfo {
    achievedAmount: number;
    targetAmount: number;
    weekLabel: string;
    startDate: string;
    endDate: string;
    isSet: boolean; // true if target (from DB) > 0
    staffName?: string; // For display, if needed
}

interface StaffSalesSummary {
  totalSalesValue: number;
  totalTransactions: number;
  displayDate?: string;
}

// Function to get actual sales for a staff member within a date range
async function getSalesForDateRange(staffId: string, startDate: string, endDate: string): Promise<number> {
    let totalSales = 0;
    const salesQuery = db.collection('dailyStaffSales')
        .where('date', '>=', startDate)
        .where('date', '<=', endDate);

    const snapshot = await salesQuery.get();
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.staffStats && data.staffStats[staffId]) {
            totalSales += data.staffStats[staffId].totalSalesValue || 0;
        }
    });
    return parseFloat(totalSales.toFixed(2));
}


export async function GET(req: NextRequest) {
  console.log("API Route /api/sales/vendor-history called");
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staffId');
    const staffName = searchParams.get('staffName') || 'Staff'; // Optional: Pass staff name for display
    const mode = searchParams.get('mode') || 'stats'; 
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    let startDateParam = searchParams.get('startDate');
    let endDateParam = searchParams.get('endDate');

    if (!staffId) {
      return NextResponse.json({ message: 'Staff ID is required.' }, { status: 400 });
    }
    
    const todayStrIST = getCurrentISODateStringInIST();
    console.log(`API determined today's date string for querying (IST) as: ${todayStrIST}`);

    if (mode === 'stats') {
      const todayDateForDisplay = getDateInIST(todayStrIST); 
      const todayDisplayFormat: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', timeZone: IST_TIMEZONE };
      const todayDisplay = new Intl.DateTimeFormat('en-US', todayDisplayFormat).format(todayDateForDisplay);

      // 1. Get Today's Sales
      let todaySalesValue = 0;
      let todayTransactions = 0;
      const todayDocRef = db.collection('dailyStaffSales').doc(todayStrIST);
      const todayDocSnap = await todayDocRef.get();
      if (todayDocSnap.exists) {
          const data = todayDocSnap.data();
          if (data && data.staffStats && data.staffStats[staffId]) {
              todaySalesValue = data.staffStats[staffId].totalSalesValue || 0;
              todayTransactions = data.staffStats[staffId].totalTransactions || 0;
          }
      }
      const todayStats: StaffSalesSummary = {
          totalSalesValue: parseFloat(todaySalesValue.toFixed(2)),
          totalTransactions: todayTransactions,
          displayDate: todayDisplay
      };

      // 2. Get Current Week's Target and Achievement
      let currentWeekTargetData: CurrentWeekTargetInfo | null = null;
      const currentMonthId = todayStrIST.substring(0, 7); // YYYY-MM
      
      const monthlyTargetRef = db.collection('monthlyTargets').doc(currentMonthId);
      const monthlyTargetDoc = await monthlyTargetRef.get();

      if (monthlyTargetDoc.exists) {
          const data = monthlyTargetDoc.data() as MonthlyTargetDocument;
          if (data && data.weeks) {
              for (const weekKey in data.weeks) {
                  const weekInfo = data.weeks[weekKey];
                  if (todayStrIST >= weekInfo.startDate && todayStrIST <= weekInfo.endDate) {
                      // Found the current week
                      const staffTargetDetails = weekInfo.staff?.[staffId];
                      const targetAmount = staffTargetDetails?.target || 0;
                      
                      const achievedAmount = await getSalesForDateRange(staffId, weekInfo.startDate, weekInfo.endDate);

                      currentWeekTargetData = {
                          achievedAmount,
                          targetAmount,
                          weekLabel: weekInfo.label,
                          startDate: weekInfo.startDate,
                          endDate: weekInfo.endDate,
                          isSet: targetAmount > 0,
                          staffName: staffTargetDetails && staffName ? staffName : undefined
                      };
                      console.log(`[Stats] Found current week target for ${staffId} in ${currentMonthId}/${weekKey}: Target=${targetAmount}, Achieved=${achievedAmount}`);
                      break; // Exit loop once current week is found
                  }
              }
          }
      }
      if (!currentWeekTargetData) {
          console.log(`[Stats] No current week target found for ${staffId} for date ${todayStrIST} in month ${currentMonthId}.`);
      }

      return NextResponse.json({ 
          stats: {
              today: todayStats,
              // thisWeek and thisMonth are removed as per requirement
          },
          currentWeekTarget: currentWeekTargetData // New key for target data
      });
    }

    // --- Daily Summaries Mode (Unchanged) ---
    if (mode === 'dailySummaries') {
      let effectiveStartDate = startDateParam;
      let effectiveEndDate = endDateParam;

      if (!effectiveStartDate || !effectiveEndDate) {
        const todayForDefaults = getDateInIST(todayStrIST);
        const defaultEndDate = new Date(todayForDefaults);
        const defaultStartDate = new Date(todayForDefaults);
        defaultStartDate.setUTCDate(defaultEndDate.getUTCDate() - 6);
        effectiveStartDate = getCurrentISODateStringInISTFromDate(defaultStartDate);
        effectiveEndDate = getCurrentISODateStringInISTFromDate(defaultEndDate);
      }
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

    // --- Transactions Mode (Date calculation for filters uses helpers) ---
    if (mode === 'transactions') {
      let effectiveStartDate = startDateParam;
      let effectiveEndDate = endDateParam;

      // If startDateParam or endDateParam are not provided by custom filter,
      // use the periodType ('today', 'thisWeek', 'thisMonth') passed from client.
      // The client now calculates these for the API call.
      // If neither custom dates nor periodType-derived dates are there, default to today.
      if (!effectiveStartDate || !effectiveEndDate) {
          // This case should ideally be handled by client sending explicit dates
          // based on 'today', 'thisWeek', 'thisMonth' buttons.
          // Fallback to today if params are missing for some reason.
          console.warn("[Transactions] Start/End date params missing, defaulting to today.");
          effectiveStartDate = todayStrIST; 
          effectiveEndDate = todayStrIST;
      }
      
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
    return NextResponse.json({ message: errorMessage, details: error.details || error.message }, { status: 500 });
  }
}