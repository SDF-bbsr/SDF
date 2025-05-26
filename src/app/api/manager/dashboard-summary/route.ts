// src/app/api/manager/dashboard-summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

// --- Constants for IST ---
const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 5 * 60 + 30;

// Helper to get YYYY-MM-DD string from a Date object IN A SPECIFIC TIMEZONE (IST)
const getISODateStringInIST = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

// Helper to format hour for display (e.g., 9 -> "09 AM") - This assumes hour is already 0-23 in target timezone
const formatHourForDisplayIST = (hourInIST: number): string => {
  const ampm = hourInIST >= 12 ? 'PM' : 'AM';
  const h = hourInIST % 12 || 12; // Convert 0 and 12 to 12
  return `${h.toString().padStart(2, '0')} ${ampm}`;
};


interface SaleSummary {
  totalValue: number;
  totalPackets: number;
}
interface StaffSaleSummary extends SaleSummary {
  staffId: string;
  staffName?: string;
}
interface DailySalePoint {
  date: string;
  totalSales: number;
}
interface ItemSaleSummary {
  articleNo: string;
  articleName?: string;
  totalQuantitySold: number;
  totalValueSold: number;
}
interface HourlySalePoint {
  hour: string; // Formatted hour like "09 AM" (IST)
  hourNumeric: number; // For sorting, 0-23 (IST)
  totalSales: number;
  transactionCount: number;
}

export async function GET(req: NextRequest) {
  console.log("API /api/manager/dashboard-summary called");
  try {
    // Use server's current time to determine "today" in IST
    const nowInServerTime = new Date();
    const todayStrIST = getISODateStringInIST(nowInServerTime);
    console.log(`Today in IST (for query): ${todayStrIST}`);

    const salesTransactionsTodayQuery = db.collection('salesTransactions')
      .where('dateOfSale', '==', todayStrIST); // Querying by dateOfSale string (which should be stored in IST)

    const salesTodaySnapshot = await salesTransactionsTodayQuery
      .where('status', '==', 'SOLD')
      .get();

    let totalSalesTodayValue = 0;
    const staffSalesToday: { [key: string]: StaffSaleSummary } = {};
    const itemSalesToday: { [key: string]: ItemSaleSummary } = {};
    const salesByHourRawIST: { [hour: number]: { totalSales: number; transactionCount: number } } = {};

    salesTodaySnapshot.forEach(doc => {
      const data = doc.data();
      const saleValue = data.calculatedSellPrice || 0;
      totalSalesTodayValue += saleValue;

      const staffId = data.staffId;
      if (staffId) {
        if (!staffSalesToday[staffId]) staffSalesToday[staffId] = { staffId, totalValue: 0, totalPackets: 0 };
        staffSalesToday[staffId].totalValue += saleValue;
        staffSalesToday[staffId].totalPackets += 1;
      }

      const articleNo = data.articleNo;
      if (articleNo) {
        if (!itemSalesToday[articleNo]) itemSalesToday[articleNo] = { articleNo, articleName: data.product_articleName || 'Unknown', totalQuantitySold: 0, totalValueSold: 0 };
        itemSalesToday[articleNo].totalQuantitySold += data.weightGrams || 0;
        itemSalesToday[articleNo].totalValueSold += saleValue;
      }
      
      const transactionTimestamp = data.timestamp as admin.firestore.Timestamp;
      if (transactionTimestamp) {
        const transactionDateUTC = transactionTimestamp.toDate(); // This is a JS Date object, inherently UTC in its value but methods like getHours() are local to runtime
        
        // Convert transactionDateUTC to IST for hourly bucketing
        const hourInIST = parseInt(new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', // 0-23
            hour12: false,
            timeZone: IST_TIMEZONE,
        }).format(transactionDateUTC), 10);

        // Double check if the date part (in IST) of the timestamp matches todayStrIST
        if (getISODateStringInIST(transactionDateUTC) === todayStrIST) {
            if (!salesByHourRawIST[hourInIST]) {
                salesByHourRawIST[hourInIST] = { totalSales: 0, transactionCount: 0 };
            }
            salesByHourRawIST[hourInIST].totalSales += saleValue;
            salesByHourRawIST[hourInIST].transactionCount += 1;
        }
      }
    });
    totalSalesTodayValue = parseFloat(totalSalesTodayValue.toFixed(2));

    const returnsTodaySnapshot = await db.collection('salesTransactions')
      .where('dateOfSale', '==', todayStrIST)
      .where('status', '==', 'RETURNED_PRE_BILLING')
      .get();
    let totalReturnsTodayValue = 0;
    returnsTodaySnapshot.forEach(doc => { totalReturnsTodayValue += doc.data().calculatedSellPrice || 0; });
    totalReturnsTodayValue = parseFloat(totalReturnsTodayValue.toFixed(2));

    const staffIds = Object.keys(staffSalesToday);
    if (staffIds.length > 0) {
      const staffDocs = await db.collection('staff').where(admin.firestore.FieldPath.documentId(), 'in', staffIds).get();
      staffDocs.forEach(doc => {
        if (staffSalesToday[doc.id]) {
          staffSalesToday[doc.id].staffName = doc.data().name || doc.id;
          staffSalesToday[doc.id].totalValue = parseFloat(staffSalesToday[doc.id].totalValue.toFixed(2));
        }
      });
    }
    const staffSalesTodayArray = Object.values(staffSalesToday).sort((a, b) => b.totalValue - a.totalValue);

    const topSellingItemsArray = Object.values(itemSalesToday)
      .map(item => ({ ...item, totalValueSold: parseFloat(item.totalValueSold.toFixed(2))}))
      .sort((a, b) => b.totalValueSold - a.totalValueSold).slice(0, 5);

    const salesByHourDataIST: HourlySalePoint[] = [];
    for (let i = 0; i < 24; i++) { // i is hour in IST (0-23)
        salesByHourDataIST.push({
            hourNumeric: i,
            hour: formatHourForDisplayIST(i), // Format this IST hour
            totalSales: parseFloat((salesByHourRawIST[i]?.totalSales || 0).toFixed(2)),
            transactionCount: salesByHourRawIST[i]?.transactionCount || 0,
        });
    }

    const thirtyDaysAgoServerTime = new Date(nowInServerTime);
    thirtyDaysAgoServerTime.setDate(nowInServerTime.getDate() - 29);
    const thirtyDaysAgoStrIST = getISODateStringInIST(thirtyDaysAgoServerTime);

    const salesLast30DaysSnapshot = await db.collection('salesTransactions')
      .where('dateOfSale', '>=', thirtyDaysAgoStrIST)
      .where('dateOfSale', '<=', todayStrIST)
      .where('status', '==', 'SOLD')
      .orderBy('dateOfSale', 'asc')
      .get();

    const dailySalesMapIST: { [date: string]: number } = {};
     for (let i = 0; i < 30; i++) {
        const d = new Date(nowInServerTime);
        d.setDate(d.getDate() - i);
        dailySalesMapIST[getISODateStringInIST(d)] = 0;
    }

    salesLast30DaysSnapshot.forEach(doc => {
      const data = doc.data();
      const dateIST = data.dateOfSale; // Assuming dateOfSale is already stored as YYYY-MM-DD in IST
      dailySalesMapIST[dateIST] = (dailySalesMapIST[dateIST] || 0) + (data.calculatedSellPrice || 0);
    });

    const salesTrendData: DailySalePoint[] = Object.entries(dailySalesMapIST)
      .map(([date, totalSales]) => ({ date, totalSales: parseFloat(totalSales.toFixed(2)) }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const targets = { dailyStoreTarget: 25000 };

    return NextResponse.json({
      todaySnapshot: {
        totalSales: totalSalesTodayValue,
        totalReturns: totalReturnsTodayValue,
        salesPerStaff: staffSalesTodayArray,
        salesByHour: salesByHourDataIST, // Use the IST processed data
      },
      salesTrendData,
      topSellingItems: topSellingItemsArray,
      targets,
    });

  } catch (error: any) {
    console.error("Error in /api/manager/dashboard-summary:", error);
    let message = 'Internal Server Error';
    if (error.code === 9 || error.code === 'failed-precondition' || (error.message && error.message.toLowerCase().includes('index'))) {
        message = 'Internal Server Error - A Firestore Index might be missing.';
        console.error("Potential Firestore Index issue. Error details:", error.details || error.message);
    }
    return NextResponse.json({ message: message, details: error.message }, { status: 500 });
  }
}