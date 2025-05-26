// src/app/api/manager/staff-performance-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

interface DailySalePoint {
  date: string;
  totalSales: number;
  packetCount: number;
}

export async function GET(req: NextRequest) {
  console.log("API /api/manager/staff-performance-data called");
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staffId');
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD
    const endDate = searchParams.get('endDate');     // YYYY-MM-DD

    if (!staffId || !startDate || !endDate) {
      return NextResponse.json({ message: 'Staff ID, start date, and end date are required.' }, { status: 400 });
    }
    console.log(`Fetching performance for staffId: ${staffId}, from: ${startDate}, to: ${endDate}`);

    let query: admin.firestore.Query = db.collection('salesTransactions')
                                        .where('staffId', '==', staffId)
                                        .where('status', '==', 'SOLD')
                                        .where('dateOfSale', '>=', startDate)
                                        .where('dateOfSale', '<=', endDate);
    
    // To get daily trends, we need to order by dateOfSale
    query = query.orderBy('dateOfSale', 'asc');

    const snapshot = await query.get();
    console.log(`Query completed, fetched ${snapshot.docs.length} sales documents for staff performance.`);

    let overallTotalValue = 0;
    let overallTotalPackets = 0;
    const dailySalesMap: { [date: string]: { totalSales: number, packetCount: number } } = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      const saleValue = data.calculatedSellPrice || 0;
      const saleDate = data.dateOfSale;

      overallTotalValue += saleValue;
      overallTotalPackets += 1;

      if (!dailySalesMap[saleDate]) {
        dailySalesMap[saleDate] = { totalSales: 0, packetCount: 0 };
      }
      dailySalesMap[saleDate].totalSales += saleValue;
      dailySalesMap[saleDate].packetCount += 1;
    });

    const dailySalesTrend: DailySalePoint[] = Object.entries(dailySalesMap).map(([date, totals]) => ({
      date,
      totalSales: parseFloat(totals.totalSales.toFixed(2)),
      packetCount: totals.packetCount,
    }));

    const averagePacketSize = overallTotalPackets > 0 
        ? parseFloat((overallTotalValue / overallTotalPackets).toFixed(2)) 
        : 0;

    return NextResponse.json({
      summary: {
        totalSalesValue: parseFloat(overallTotalValue.toFixed(2)),
        totalPackets: overallTotalPackets,
        averagePacketValue: averagePacketSize, // Note: this is avg value per packet, not weight.
      },
      dailySalesTrend, // For the chart
    });

  } catch (error: any) {
    console.error("Error in /api/manager/staff-performance-data:", error);
    if (error.code === 9 || error.code === 'failed-precondition') {
        console.error("Potential Firestore Index issue for staff performance. Error details:", error.details);
        return NextResponse.json({ message: 'Internal Server Error - Possible Firestore Index missing. Check server logs.', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}