// src/app/api/manager/staff-performance-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin'; // For Query type

const IST_TIMEZONE = 'Asia/Kolkata';

// Helper to get YYYY-MM-DD string for a given date in IST
const getISODateStringInISTFromDate = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(date);
};

interface DailyStaffSalesDoc {
    date: string;
    staffStats: {
        [staffId: string]: {
            name?: string; // Name is good to have but might not be strictly needed if staffId is key
            totalSalesValue: number;
            totalTransactions: number;
        }
    };
    lastUpdated?: admin.firestore.Timestamp;
}

interface DailySalePointForStaff {
  date: string; // YYYY-MM-DD
  totalSales: number;
  packetCount: number;
}

export async function GET(req: NextRequest) {
  console.log("API /api/manager/staff-performance-data called (Optimized)");
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staffId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!staffId || !startDate || !endDate) {
      return NextResponse.json({ message: 'Staff ID, start date, and end date are required.' }, { status: 400 });
    }
    console.log(`Fetching performance for staffId: ${staffId}, from: ${startDate}, to: ${endDate}`);

    const query: admin.firestore.Query = db.collection('dailyStaffSales')
                                        .where('date', '>=', startDate)
                                        .where('date', '<=', endDate)
                                        .orderBy('date', 'asc'); // Order chronologically for trend

    const snapshot = await query.get(); // Reads N documents where N is number of days in range
    console.log(`Query to dailyStaffSales fetched ${snapshot.docs.length} documents.`);

    let overallTotalValue = 0;
    let overallTotalPackets = 0;
    const dailySalesTrend: DailySalePointForStaff[] = [];

    snapshot.forEach(doc => {
      const data = doc.data() as DailyStaffSalesDoc;
      if (data.staffStats && data.staffStats[staffId]) {
        const staffDailyStats = data.staffStats[staffId];
        const dailySales = staffDailyStats.totalSalesValue || 0;
        const dailyPackets = staffDailyStats.totalTransactions || 0;

        overallTotalValue += dailySales;
        overallTotalPackets += dailyPackets;

        dailySalesTrend.push({
          date: data.date,
          totalSales: parseFloat(dailySales.toFixed(2)),
          packetCount: dailyPackets,
        });
      } else {
        // If a day's record exists but no stats for this staff, add a zero point for graph continuity
        dailySalesTrend.push({
            date: data.date, // Or doc.id if 'date' field might be missing (though unlikely for this collection)
            totalSales: 0,
            packetCount: 0,
        });
      }
    });
    
    // If snapshot is empty but we have a date range, we might want to fill with zeros
    // For simplicity now, if no docs, trend will be empty. Client can handle "no data".

    const averagePacketValue = overallTotalPackets > 0 
        ? parseFloat((overallTotalValue / overallTotalPackets).toFixed(2)) 
        : 0;

    return NextResponse.json({
      summary: {
        totalSalesValue: parseFloat(overallTotalValue.toFixed(2)),
        totalPackets: overallTotalPackets,
        averagePacketValue: averagePacketValue,
      },
      dailySalesTrend,
    });

  } catch (error: any) {
    console.error("Error in /api/manager/staff-performance-data:", error);
    // No specific index error check here as the query is simple (range on date, orderBy date)
    // which Firestore usually handles well or creates a single-field index for.
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}