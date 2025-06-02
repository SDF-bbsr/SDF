// src/app/api/manager/dashboard-summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin'; // For FieldValue if needed, and types

const IST_TIMEZONE = 'Asia/Kolkata';

const getCurrentISODateStringInIST = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(now); // YYYY-MM-DD
};

// Helper to get a Date object representing the start of a specific YYYY-MM-DD in IST
const getDateInIST = (yyyyMmDdStr: string): Date => {
    const [year, month, day] = yyyyMmDdStr.split('-').map(Number);
    // Construct date in UTC, then adjust to represent 00:00:00 IST
    // For IST (UTC+5:30), subtract 5 hours and 30 minutes from the desired IST time to get UTC.
    // So, for 00:00:00 IST, it's (Previous Day's 18:30:00 UTC).
    // Date.UTC(year, monthIndex, day, hour, minute, second)
    // The Date object created will represent 00:00:00 in IST for that specific day.
    const dateInUTC = Date.UTC(year, month - 1, day); // This is 00:00:00 UTC on that day
    const istOffsetMilliseconds = (5 * 60 + 30) * 60 * 1000;
    // To represent 00:00:00 IST, we effectively want a Date object
    // whose internal UTC time is equivalent to YYYY-MM-DD 00:00:00 IST.
    return new Date(dateInUTC - istOffsetMilliseconds); // This Date object's .toISOString() would be YYYY-MM-(DD-1)T18:30:00.000Z
                                                     // But when formatted to IST, it will be YYYY-MM-DD 00:00:00 IST
};


// Helper to format hour for display (e.g., 9 -> "09 AM") - Assumes hourInIST is 0-23
const formatHourForDisplayIST = (hourInIST: number): string => {
  const ampm = hourInIST >= 12 ? 'PM' : 'AM';
  const h = hourInIST % 12 || 12;
  return `${h.toString().padStart(2, '0')} ${ampm}`;
};

// --- Firestore Document Interfaces ---
interface HourlyAggregate {
    totalSales: number;
    transactionCount: number;
}
interface DailySummaryDocData {
    date: string; // YYYY-MM-DD
    totalSalesValue: number;
    totalTransactions: number;
    hourlyBreakdown?: { [hourStr: string]: HourlyAggregate };
    lastUpdated: admin.firestore.Timestamp;
}

interface DailyStaffSalesDocData {
    date: string; // YYYY-MM-DD
    staffStats: {
        [staffId: string]: {
            name: string;
            totalSalesValue: number;
            totalTransactions: number;
        }
    };
    lastUpdated: admin.firestore.Timestamp;
}

interface DailyProductSaleData {
    date: string; // YYYY-MM-DD
    productArticleNo: string;
    productName: string;
    totalQuantitySoldGrams: number;
    totalSalesValue: number;
    totalTransactions: number;
    lastUpdated: admin.firestore.Timestamp;
}

// --- Monthly Target Interfaces (New) ---
interface StaffTargetDetailFromDB {
  incentivePercentage: number;
  target: number;
}

interface WeekTargetDataFromDB {
  endDate: string;   // "YYYY-MM-DD"
  label: string;     // "Week (01-07)"
  overallTarget: number;
  staff?: Record<string, StaffTargetDetailFromDB>; // Optional staff-specific targets
  startDate: string; // "YYYY-MM-DD"
}

interface MonthlyTargetDocumentFromDB {
  month: string; // "YYYY-MM"
  weeks: {
    [weekKey: string]: WeekTargetDataFromDB; // "week1", "week2", etc.
  };
}


// --- Frontend Expected Types ---
interface StaffSaleSummary {
  staffId: string;
  staffName?: string;
  totalValue: number;
  totalPackets: number; // Assuming this means transactions
}
interface DailySalePoint {
  date: string; // YYYY-MM-DD
  totalSales: number;
}
interface ItemSaleSummary {
  articleNo: string;
  articleName?: string;
  totalQuantitySold: number;
  totalValueSold: number;
}
interface HourlySalePoint {
  hour: string;
  hourNumeric: number;
  totalSales: number;
  transactionCount: number;
}

// New interface for weekly pacing result
interface WeeklyPacingResult {
  weekLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  overallTarget: number;
  achievedInWeekSoFar: number; // Total achieved from week start date up to and including today
  // achievedInWeekUpToYesterday: number; // Sales from week start date up to yesterday
  remainingTargetAmountOverall: number; // Overall target - achievedInWeekSoFar
  daysLeftInWeekIncludingToday: number;
  // averageDailySalesNeeded: number | null; // OLD field, can be removed or repurposed
  targetForTodayAndAverageRemaining: number | null; // NEW: (OverallWeeklyTarget - SalesUpToYesterday) / DaysRemaining
  isTargetConfigured: boolean;
}


export async function GET(req: NextRequest) {
console.log("API /api/manager/dashboard-summary called (v_daily_target)");
try {
  const todayStrIST = getCurrentISODateStringInIST();
  console.log(`Manager Dashboard: Today in IST (for query): ${todayStrIST}`);

  // --- 1. Today's Snapshot from Aggregates ---
  let totalSalesTodayValue = 0;
  let salesPerStaffArray: StaffSaleSummary[] = [];
  let salesByHourDataIST: HourlySalePoint[] = [];

  const dailySalesSummaryRef = db.collection('dailySalesSummaries').doc(todayStrIST);
  const todaySummaryDoc = await dailySalesSummaryRef.get(); // READ 1

  if (todaySummaryDoc.exists) {
    const summaryData = todaySummaryDoc.data() as DailySummaryDocData;
    totalSalesTodayValue = summaryData.totalSalesValue || 0;
    // ... (hourly breakdown logic - no changes)
    if (summaryData.hourlyBreakdown) {
      for (let i = 0; i < 24; i++) {
        const hourStr = i.toString().padStart(2, '0');
        const hourData = summaryData.hourlyBreakdown[hourStr];
        salesByHourDataIST.push({
          hourNumeric: i,
          hour: formatHourForDisplayIST(i),
          totalSales: parseFloat((hourData?.totalSales || 0).toFixed(2)),
          transactionCount: hourData?.transactionCount || 0,
        });
      }
    } else { 
       for (let i = 0; i < 24; i++) { salesByHourDataIST.push({ hourNumeric: i, hour: formatHourForDisplayIST(i), totalSales: 0, transactionCount: 0});}
    }
  } else { 
      for (let i = 0; i < 24; i++) { salesByHourDataIST.push({ hourNumeric: i, hour: formatHourForDisplayIST(i), totalSales: 0, transactionCount: 0});}
  }

  // ... (staff sales logic - no changes)
  const dailyStaffSalesRef = db.collection('dailyStaffSales').doc(todayStrIST);
  const todayStaffSalesDoc = await dailyStaffSalesRef.get(); // READ 2
  if (todayStaffSalesDoc.exists) {
    const staffSalesData = todayStaffSalesDoc.data() as DailyStaffSalesDocData;
    if (staffSalesData.staffStats) {
      salesPerStaffArray = Object.entries(staffSalesData.staffStats).map(([staffId, stats]) => ({
        staffId,
        staffName: stats.name,
        totalValue: stats.totalSalesValue || 0,
        totalPackets: stats.totalTransactions || 0,
      })).sort((a, b) => b.totalValue - a.totalValue);
    }
  }

  // --- 2. Top Selling Items Today - no changes ---
  const topSellingItemsQuery = db.collection('dailyProductSales')
    .where('date', '==', todayStrIST)
    .orderBy('totalSalesValue', 'desc')
    .limit(5);
  const topItemsSnapshot = await topSellingItemsQuery.get(); // READ 3
  const topSellingItemsArray: ItemSaleSummary[] = topItemsSnapshot.docs.map(doc => {
      const data = doc.data() as DailyProductSaleData;
      return { articleNo: data.productArticleNo, articleName: data.productName, totalQuantitySold: data.totalQuantitySoldGrams || 0, totalValueSold: data.totalSalesValue || 0 };
  });

  // --- 3. Sales Trend (Last 30 Days) - no changes ---
  const salesTrendData: DailySalePoint[] = [];
  const datePromisesTrend = [];
  const todayDateForTrend = getDateInIST(todayStrIST); 
  for (let i = 0; i < 30; i++) {
      const d = new Date(todayDateForTrend.valueOf()); 
      const targetUTCday = todayDateForTrend.getUTCDate() - i;
      d.setUTCDate(targetUTCday); 
      const dateStrToQuery = getCurrentISODateStringInISTFromDate(d);
      datePromisesTrend.push(db.collection('dailySalesSummaries').doc(dateStrToQuery).get());
  }
  const dailySummaryDocs = await Promise.all(datePromisesTrend); // READ 4
  dailySummaryDocs.forEach(docSnap => {
      if (docSnap.exists) {
          const data = docSnap.data() as DailySummaryDocData;
          salesTrendData.push({ date: data.date, totalSales: data.totalSalesValue || 0 });
      } else {
          salesTrendData.push({ date: docSnap.id, totalSales: 0 });
      }
  });
  salesTrendData.sort((a, b) => a.date.localeCompare(b.date));


  // --- 4. Weekly Target Pacing (MODIFIED) ---
  let weeklyPacing: WeeklyPacingResult = {
      weekLabel: null,
      startDate: null,
      endDate: null,
      overallTarget: 0,
      achievedInWeekSoFar: 0,
      // achievedInWeekUpToYesterday: 0,
      remainingTargetAmountOverall: 0,
      daysLeftInWeekIncludingToday: 0,
      targetForTodayAndAverageRemaining: null,
      isTargetConfigured: false,
  };

  const currentMonthId = todayStrIST.substring(0, 7);
  const monthlyTargetRef = db.collection('monthlyTargets').doc(currentMonthId);
  const monthlyTargetDoc = await monthlyTargetRef.get(); // READ 5

  if (monthlyTargetDoc.exists) {
      const monthlyData = monthlyTargetDoc.data() as MonthlyTargetDocumentFromDB;
      if (monthlyData && monthlyData.weeks) {
          for (const weekKey in monthlyData.weeks) {
              const weekInfo = monthlyData.weeks[weekKey];
              if (todayStrIST >= weekInfo.startDate && todayStrIST <= weekInfo.endDate) {
                  weeklyPacing.isTargetConfigured = (weekInfo.overallTarget || 0) > 0;
                  weeklyPacing.weekLabel = weekInfo.label;
                  weeklyPacing.startDate = weekInfo.startDate;
                  weeklyPacing.endDate = weekInfo.endDate;
                  weeklyPacing.overallTarget = weekInfo.overallTarget || 0;

                  let achievedInWeekUpToYesterday = 0;
                  for (const dailySale of salesTrendData) {
                      // Accumulate sales from week start UP TO (but not including) today
                      if (dailySale.date >= weekInfo.startDate && dailySale.date < todayStrIST) {
                          achievedInWeekUpToYesterday += dailySale.totalSales;
                      }
                      // Accumulate sales from week start UP TO AND INCLUDING today
                      if (dailySale.date >= weekInfo.startDate && dailySale.date <= todayStrIST) {
                          weeklyPacing.achievedInWeekSoFar += dailySale.totalSales;
                      }
                  }
                  // weeklyPacing.achievedInWeekUpToYesterday = parseFloat(achievedInWeekUpToYesterday.toFixed(2));
                  weeklyPacing.achievedInWeekSoFar = parseFloat(weeklyPacing.achievedInWeekSoFar.toFixed(2));

                  weeklyPacing.remainingTargetAmountOverall = parseFloat(
                      (weeklyPacing.overallTarget - weeklyPacing.achievedInWeekSoFar).toFixed(2)
                  );

                  const todayForCalc = getDateInIST(todayStrIST);
                  const weekEndDateForCalc = getDateInIST(weekInfo.endDate);
                  if (weekEndDateForCalc.getTime() >= todayForCalc.getTime()) {
                      const diffTime = Math.abs(weekEndDateForCalc.getTime() - todayForCalc.getTime());
                      weeklyPacing.daysLeftInWeekIncludingToday = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                  } else {
                      weeklyPacing.daysLeftInWeekIncludingToday = 0; 
                  }
                  
                  // Calculate NEW targetForTodayAndAverageRemaining
                  if (weeklyPacing.isTargetConfigured && weeklyPacing.daysLeftInWeekIncludingToday > 0) {
                      const remainingTargetFromYesterday = weeklyPacing.overallTarget - achievedInWeekUpToYesterday;
                      if (remainingTargetFromYesterday > 0) {
                          weeklyPacing.targetForTodayAndAverageRemaining = parseFloat(
                              (remainingTargetFromYesterday / weeklyPacing.daysLeftInWeekIncludingToday).toFixed(2)
                          );
                      } else {
                           weeklyPacing.targetForTodayAndAverageRemaining = 0; // Already met by yesterday
                      }
                  } else if (weeklyPacing.isTargetConfigured && weeklyPacing.overallTarget - achievedInWeekUpToYesterday > 0) {
                      // Days left is 0, but target (based on yesterday's performance) not met
                      weeklyPacing.targetForTodayAndAverageRemaining = weeklyPacing.overallTarget - achievedInWeekUpToYesterday;
                  } else {
                      weeklyPacing.targetForTodayAndAverageRemaining = 0; // Target met or no days left
                  }
                  break; 
              }
          }
      }
  }

  return NextResponse.json({
    todaySnapshot: {
      totalSales: totalSalesTodayValue,
      salesPerStaff: salesPerStaffArray,
      salesByHour: salesByHourDataIST,
    },
    salesTrendData,
    topSellingItems: topSellingItemsArray,
    weeklyPacing,
  });

} catch (error: any) {
  console.error("Error in /api/manager/dashboard-summary (v_daily_target):", error);
  let message = 'Internal Server Error';
  if (error.code === 9 || error.code === 'failed-precondition' || (error.message && error.message.toLowerCase().includes('index'))) {
      message = 'Internal Server Error - A Firestore Index might be missing.';
  }
  return NextResponse.json({ message: message, details: error.message }, { status: 500 });
}
}

const getCurrentISODateStringInISTFromDate = (date: Date): string => {
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
return formatter.format(date);
};