// src/app/api/manager/dashboard-summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin'; // Assuming firebaseAdmin is initialized
import admin from 'firebase-admin';

// Helper to get YYYY-MM-DD string from a Date object (in server's local timezone)
const getISODateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to format hour for display (e.g., 9 -> "09 AM")
const formatHourForDisplay = (hour: number): string => {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12; // Convert 0 and 12 to 12
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
  totalQuantitySold: number; // in grams
  totalValueSold: number;
}

interface HourlySalePoint {
  hour: string; // Formatted hour like "09 AM"
  hourNumeric: number; // For sorting, 0-23
  totalSales: number;
  transactionCount: number;
}


export async function GET(req: NextRequest) {
  console.log("API /api/manager/dashboard-summary called");
  try {
    const today = new Date(); // Server's current date and time
    const todayStr = getISODateString(today); // YYYY-MM-DD based on server's local timezone

    // --- 1. Today's Snapshot ---
    const salesTransactionsTodayQuery = db.collection('salesTransactions')
      .where('dateOfSale', '==', todayStr); // Querying by dateOfSale string

    const salesTodaySnapshot = await salesTransactionsTodayQuery
      .where('status', '==', 'SOLD')
      .get();

    let totalSalesTodayValue = 0;
    const staffSalesToday: { [key: string]: StaffSaleSummary } = {};
    const itemSalesToday: { [key: string]: ItemSaleSummary } = {};
    const salesByHourRaw: { [hour: number]: { totalSales: number; transactionCount: number } } = {};

    salesTodaySnapshot.forEach(doc => {
      const data = doc.data();
      const saleValue = data.calculatedSellPrice || 0;
      totalSalesTodayValue += saleValue;

      // Staff Sales
      const staffId = data.staffId; // This is "Parimita" in your example
      if (staffId) {
        if (!staffSalesToday[staffId]) {
          staffSalesToday[staffId] = { staffId, totalValue: 0, totalPackets: 0 };
        }
        staffSalesToday[staffId].totalValue += saleValue;
        staffSalesToday[staffId].totalPackets += 1;
      }

      // Item Sales
      const articleNo = data.articleNo; // This is "600038799"
      if (articleNo) {
        if (!itemSalesToday[articleNo]) {
          itemSalesToday[articleNo] = { 
            articleNo, 
            articleName: data.product_articleName || 'Unknown Product', // Use product_articleName from transaction
            totalQuantitySold: 0, 
            totalValueSold: 0
          };
        }
        itemSalesToday[articleNo].totalQuantitySold += data.weightGrams || 0;
        itemSalesToday[articleNo].totalValueSold += saleValue;
      }
      
      // Sales by Hour (using Firestore Timestamp)
      const transactionTimestamp = data.timestamp as admin.firestore.Timestamp;
      if (transactionTimestamp) {
        const transactionDate = transactionTimestamp.toDate(); // Convert to JS Date
        // Ensure the transaction is indeed from "today" according to its timestamp, not just dateOfSale string
        if (getISODateString(transactionDate) === todayStr) {
            const hour = transactionDate.getHours(); // 0-23 in server's local timezone
            if (!salesByHourRaw[hour]) {
                salesByHourRaw[hour] = { totalSales: 0, transactionCount: 0 };
            }
            salesByHourRaw[hour].totalSales += saleValue;
            salesByHourRaw[hour].transactionCount += 1;
        }
      }
    });
    totalSalesTodayValue = parseFloat(totalSalesTodayValue.toFixed(2));

    // Total Returns Today
    const returnsTodaySnapshot = await db.collection('salesTransactions')
      .where('dateOfSale', '==', todayStr)
      .where('status', '==', 'RETURNED_PRE_BILLING')
      .get();
    let totalReturnsTodayValue = 0;
    returnsTodaySnapshot.forEach(doc => {
      totalReturnsTodayValue += doc.data().calculatedSellPrice || 0;
    });
    totalReturnsTodayValue = parseFloat(totalReturnsTodayValue.toFixed(2));

    // Process Staff Sales: Fetch names if your 'staff' collection stores names separately
    const staffIds = Object.keys(staffSalesToday);
    if (staffIds.length > 0) {
      // Assuming staffId from transaction is the document ID in 'staff' collection
      const staffDocs = await db.collection('staff').where(admin.firestore.FieldPath.documentId(), 'in', staffIds).get();
      staffDocs.forEach(doc => {
        if (staffSalesToday[doc.id]) {
          staffSalesToday[doc.id].staffName = doc.data().name || doc.id; // Use 'name' field or staffId itself
          staffSalesToday[doc.id].totalValue = parseFloat(staffSalesToday[doc.id].totalValue.toFixed(2));
        }
      });
    }
    const staffSalesTodayArray = Object.values(staffSalesToday).sort((a, b) => b.totalValue - a.totalValue);

    // Process Top Selling Items (names are already included)
    const topSellingItemsArray = Object.values(itemSalesToday)
      .map(item => ({
        ...item,
        totalValueSold: parseFloat(item.totalValueSold.toFixed(2)) // Ensure formatting
      }))
      .sort((a, b) => b.totalValueSold - a.totalValueSold)
      .slice(0, 5); // Top 5

    // Process Sales by Hour
    const salesByHourData: HourlySalePoint[] = [];
    for (let i = 0; i < 24; i++) { // Ensure all hours are present for a complete chart
        salesByHourData.push({
            hourNumeric: i,
            hour: formatHourForDisplay(i),
            totalSales: parseFloat((salesByHourRaw[i]?.totalSales || 0).toFixed(2)),
            transactionCount: salesByHourRaw[i]?.transactionCount || 0,
        });
    }
    // Filter out hours with no sales for cleaner chart, or keep all for full day view
    // const filteredSalesByHourData = salesByHourData.filter(h => h.totalSales > 0 || h.transactionCount > 0);


    // --- 2. Sales Trends (Data for last 30 days) ---
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);
    const thirtyDaysAgoStr = getISODateString(thirtyDaysAgo);

    const salesLast30DaysSnapshot = await db.collection('salesTransactions')
      .where('dateOfSale', '>=', thirtyDaysAgoStr)
      .where('dateOfSale', '<=', todayStr)
      .where('status', '==', 'SOLD')
      .orderBy('dateOfSale', 'asc') // Firestore requires an index for this
      .get();

    const dailySalesMap: { [date: string]: number } = {};
    // Initialize map for all 30 days to ensure continuous data for chart
     for (let i = 0; i < 30; i++) {
        const d = new Date(today); // Start from today
        d.setDate(d.getDate() - i); // Go back i days
        dailySalesMap[getISODateString(d)] = 0; // Initialize with 0 sales
    }

    salesLast30DaysSnapshot.forEach(doc => {
      const data = doc.data();
      const date = data.dateOfSale; // This is YYYY-MM-DD string
      dailySalesMap[date] = (dailySalesMap[date] || 0) + (data.calculatedSellPrice || 0);
    });

    const salesTrendData: DailySalePoint[] = Object.entries(dailySalesMap)
      .map(([date, totalSales]) => ({
        date,
        totalSales: parseFloat(totalSales.toFixed(2)),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());


    // Targets: Placeholder
    const targets = {
      dailyStoreTarget: 25000, // Example value
    };

    return NextResponse.json({
      todaySnapshot: {
        totalSales: totalSalesTodayValue,
        totalReturns: totalReturnsTodayValue, // Still sending data
        salesPerStaff: staffSalesTodayArray,
        salesByHour: salesByHourData, // Send all hours for a consistent chart
      },
      salesTrendData,
      topSellingItems: topSellingItemsArray,
      targets,
    });

  } catch (error: any) {
    console.error("Error in /api/manager/dashboard-summary:", error);
    let message = 'Internal Server Error';
    // Check for Firestore index errors specifically
    if (error.code === 9 || error.code === 'failed-precondition' || (error.message && error.message.toLowerCase().includes('index'))) {
        message = 'Internal Server Error - A Firestore Index might be missing. Please check server logs for a link to create the required index.';
        console.error("Potential Firestore Index issue. Error details:", error.details || error.message);
    }
    return NextResponse.json({ message: message, details: error.message }, { status: 500 });
  }
}