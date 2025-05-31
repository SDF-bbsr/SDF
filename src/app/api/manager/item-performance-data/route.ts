// src/app/api/manager/item-performance-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

// Interface for data from dailyProductSales collection
interface DailyProductSaleDoc {
  date: string;
  productArticleNo: string;
  productName: string; // Already denormalized here
  totalQuantitySoldGrams: number;
  totalSalesValue: number;
  totalTransactions: number;
}

// Interface for the aggregated performance of a single item over the period
interface AggregatedItemPerformance {
  articleNo: string;
  articleName: string;
  totalWeightSoldGrams: number;
  totalValueSold: number;
  totalPackets: number; // Sum of totalTransactions from dailyProductSales
}

interface GrandTotals {
  totalValueSold: number;
  totalWeightSoldGrams: number;
  totalPacketsSold: number;
}

// Response structure for the frontend
interface ItemPerformanceApiResponse {
  soldItemsPerformance: AggregatedItemPerformance[];
  grandTotals: GrandTotals;
  // zeroSalesItems: ProductInfo[]; // Removed as per request
}


export async function GET(req: NextRequest) {
  console.log("API /api/manager/item-performance-data called (Optimized with dailyProductSales)");
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ message: 'Start date and end date are required.' }, { status: 400 });
    }
    console.log(`Fetching item performance from dailyProductSales: ${startDate} to ${endDate}`);

    // 1. Fetch all relevant dailyProductSales documents for the date range
    const dailyProductSalesQuery = db.collection('dailyProductSales')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate);
    
    const dailyProductSalesSnapshot = await dailyProductSalesQuery.get();
    // READS: Number of (product*day) documents in the range.
    // E.g., if 30 products sold each day for 7 days, this is ~210 reads.
    console.log(`Fetched ${dailyProductSalesSnapshot.docs.length} dailyProductSales documents.`);

    // 2. Aggregate these daily stats in memory
    const aggregatedPerformanceMap: { [articleNo: string]: AggregatedItemPerformance } = {};
    let grandTotalValue = 0;
    let grandTotalWeight = 0;
    let grandTotalPackets = 0;

    dailyProductSalesSnapshot.forEach(doc => {
      const dailyData = doc.data() as DailyProductSaleDoc;
      const { productArticleNo, productName, totalQuantitySoldGrams, totalSalesValue, totalTransactions } = dailyData;

      if (!aggregatedPerformanceMap[productArticleNo]) {
        aggregatedPerformanceMap[productArticleNo] = {
          articleNo: productArticleNo,
          articleName: productName || productArticleNo, // Fallback to articleNo if name somehow missing
          totalWeightSoldGrams: 0,
          totalValueSold: 0,
          totalPackets: 0,
        };
      }
      
      aggregatedPerformanceMap[productArticleNo].totalWeightSoldGrams += totalQuantitySoldGrams || 0;
      aggregatedPerformanceMap[productArticleNo].totalValueSold += totalSalesValue || 0;
      aggregatedPerformanceMap[productArticleNo].totalPackets += totalTransactions || 0;
    });

    let soldItemsPerformance = Object.values(aggregatedPerformanceMap);

    // Calculate grand totals from the aggregated data
    soldItemsPerformance.forEach(item => {
        grandTotalValue += item.totalValueSold;
        grandTotalWeight += item.totalWeightSoldGrams;
        grandTotalPackets += item.totalPackets;
    });

    // Sort by total value sold descending
    soldItemsPerformance.sort((a, b) => b.totalValueSold - a.totalValueSold);

    const responseData: ItemPerformanceApiResponse = {
      soldItemsPerformance,
      grandTotals: {
        totalValueSold: parseFloat(grandTotalValue.toFixed(2)),
        totalWeightSoldGrams: parseFloat(grandTotalWeight.toFixed(3)),
        totalPacketsSold: grandTotalPackets,
      },
      // zeroSalesItems: [], // Removed as per request
    };

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error("Error in /api/manager/item-performance-data:", error);
    // The query on dailyProductSales is simple (range on 'date'). 
    // It should be efficient with the default single-field index on 'date'.
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}