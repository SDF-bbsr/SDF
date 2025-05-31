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
  return formatter.format(now);
};

// Helper to get a Date object representing a specific YYYY-MM-DD in IST (at 00:00:00 IST)
const getDateInIST = (yyyyMmDdStr: string): Date => {
    const [year, month, day] = yyyyMmDdStr.split('-').map(Number);
    // This Date object's UTC value corresponds to 00:00:00 on yyyyMmDdStr in IST.
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000);
};

// Helper to format hour for display (e.g., 9 -> "09 AM") - Assumes hourInIST is 0-23
const formatHourForDisplayIST = (hourInIST: number): string => {
  const ampm = hourInIST >= 12 ? 'PM' : 'AM';
  const h = hourInIST % 12 || 12;
  return `${h.toString().padStart(2, '0')} ${ampm}`;
};

// Interface for how hourly data might be stored in dailySalesSummaries
interface HourlyAggregate {
    totalSales: number;
    transactionCount: number;
}
interface DailySummaryDocData {
    date: string;
    totalSalesValue: number;
    totalTransactions: number;
    hourlyBreakdown?: { [hourStr: string]: HourlyAggregate }; // e.g., "00", "01", ..., "23"
    lastUpdated: admin.firestore.Timestamp;
}

interface DailyStaffSalesDocData {
    date: string;
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
    date: string;
    productArticleNo: string;
    productName: string;
    totalQuantitySoldGrams: number;
    totalSalesValue: number;
    totalTransactions: number;
    lastUpdated: admin.firestore.Timestamp;
}


// Frontend expected types
interface StaffSaleSummary {
  staffId: string;
  staffName?: string;
  totalValue: number;
  totalPackets: number;
}
interface DailySalePoint {
  date: string;
  totalSales: number;
}
interface ItemSaleSummary {
  articleNo: string;
  articleName?: string;
  totalQuantitySold: number; // in grams
  totalValueSold: number;
}
interface HourlySalePoint {
  hour: string; // e.g., "09 AM", "05 PM"
  hourNumeric: number; // For sorting, 0-23 (IST)
  totalSales: number;
  transactionCount: number;
}


export async function GET(req: NextRequest) {
  console.log("API /api/manager/dashboard-summary called (Optimized Version)");
  try {
    const todayStrIST = getCurrentISODateStringInIST();
    console.log(`Manager Dashboard: Today in IST (for query): ${todayStrIST}`);

    // --- 1. Today's Snapshot from Aggregates ---
    let totalSalesTodayValue = 0;
    let salesPerStaffArray: StaffSaleSummary[] = [];
    let salesByHourDataIST: HourlySalePoint[] = [];

    // Get today's overall sales and hourly breakdown from 'dailySalesSummaries'
    const dailySalesSummaryRef = db.collection('dailySalesSummaries').doc(todayStrIST);
    const todaySummaryDoc = await dailySalesSummaryRef.get(); // READ 1

    if (todaySummaryDoc.exists) {
      const summaryData = todaySummaryDoc.data() as DailySummaryDocData;
      totalSalesTodayValue = summaryData.totalSalesValue || 0;
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
      } else { // Fallback if no hourlyBreakdown yet (or provide empty array)
         for (let i = 0; i < 24; i++) { salesByHourDataIST.push({ hourNumeric: i, hour: formatHourForDisplayIST(i), totalSales: 0, transactionCount: 0});}
         console.warn(`Hourly breakdown missing for ${todayStrIST} in dailySalesSummaries.`);
      }
    } else { // Fallback if no summaryDoc for today yet (e.g. start of day)
        for (let i = 0; i < 24; i++) { salesByHourDataIST.push({ hourNumeric: i, hour: formatHourForDisplayIST(i), totalSales: 0, transactionCount: 0});}
        console.log(`No dailySalesSummary document found for ${todayStrIST}.`);
    }

    // Get today's sales per staff from 'dailyStaffSales'
    const dailyStaffSalesRef = db.collection('dailyStaffSales').doc(todayStrIST);
    const todayStaffSalesDoc = await dailyStaffSalesRef.get(); // READ 2
    if (todayStaffSalesDoc.exists) {
      const staffSalesData = todayStaffSalesDoc.data() as DailyStaffSalesDocData;
      if (staffSalesData.staffStats) {
        salesPerStaffArray = Object.entries(staffSalesData.staffStats).map(([staffId, stats]) => ({
          staffId,
          staffName: stats.name,
          totalValue: stats.totalSalesValue,
          totalPackets: stats.totalTransactions,
        })).sort((a, b) => b.totalValue - a.totalValue);
      }
    }

    // --- 2. Top Selling Items Today from 'dailyProductSales' ---
    const topSellingItemsQuery = db.collection('dailyProductSales')
      .where('date', '==', todayStrIST)
      .orderBy('totalSalesValue', 'desc')
      .limit(5);
    const topItemsSnapshot = await topSellingItemsQuery.get(); // READ 3 (up to 5 docs)
    
    const topSellingItemsArray: ItemSaleSummary[] = topItemsSnapshot.docs.map(doc => {
      const data = doc.data() as DailyProductSaleData;
      return {
        articleNo: data.productArticleNo,
        articleName: data.productName,
        totalQuantitySold: data.totalQuantitySoldGrams,
        totalValueSold: data.totalSalesValue,
      };
    });

    // --- 3. Sales Trend (Last 30 Days) from 'dailySalesSummaries' ---
    const salesTrendData: DailySalePoint[] = [];
    const datePromises = [];
    const todayForTrend = getDateInIST(todayStrIST); // Base date for calculating past 30 days

    for (let i = 0; i < 30; i++) {
        const d = new Date(todayForTrend.valueOf()); // Clone
        d.setUTCDate(todayForTrend.getUTCDate() - i); // Manipulate using UTC date parts
        const dateStrToQuery = getCurrentISODateStringInISTFromDate(d); // Format back to YYYY-MM-DD for IST
        datePromises.push(db.collection('dailySalesSummaries').doc(dateStrToQuery).get());
    }
    const dailySummaryDocs = await Promise.all(datePromises); // READ 4 (up to 30 docs)

    dailySummaryDocs.forEach(docSnap => {
        if (docSnap.exists) {
            const data = docSnap.data() as DailySummaryDocData;
            salesTrendData.push({ date: data.date, totalSales: data.totalSalesValue });
        } else {
            // If a day is missing, represent it with 0 sales but include the date
            salesTrendData.push({ date: docSnap.id, totalSales: 0 });
        }
    });
    salesTrendData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const targets = { dailyStoreTarget: 25000 }; // This could come from a settings collection later (1 read)

    return NextResponse.json({
      todaySnapshot: {
        totalSales: totalSalesTodayValue,
        totalReturns: 0, // Removed returns from dashboard focus
        salesPerStaff: salesPerStaffArray,
        salesByHour: salesByHourDataIST,
      },
      salesTrendData,
      topSellingItems: topSellingItemsArray,
      targets,
    });

  } catch (error: any) {
    console.error("Error in /api/manager/dashboard-summary (Optimized):", error);
    let message = 'Internal Server Error';
    if (error.code === 9 || error.code === 'failed-precondition' || (error.message && error.message.toLowerCase().includes('index'))) {
        message = 'Internal Server Error - A Firestore Index might be missing (especially for dailyProductSales query).';
        console.error("Potential Firestore Index issue. Error details:", error.details || error.message);
    }
    return NextResponse.json({ message: message, details: error.message }, { status: 500 });
  }
}

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