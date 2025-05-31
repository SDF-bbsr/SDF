// src/app/api/manager/sales-transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin'; // For types

const IST_TIMEZONE = 'Asia/Kolkata';

const getCurrentISODateStringInIST = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(now);
};

// Helper to format a given Date object into YYYY-MM-DD string in IST
const getCurrentISODateStringInISTFromDate = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(date);
};

// Interface for data fetched from dailySalesSummaries collection
interface DailySalesSummaryDoc {
    date: string;
    totalSalesValue: number;    // Field name in Firestore
    totalTransactions: number;  // Field name in Firestore
    hourlyBreakdown?: any;      // Optional, not used directly in this summary list
    lastUpdated?: admin.firestore.Timestamp;
}

// Interface for data fetched from dailyStaffSales collection
interface DailyStaffSalesDoc {
    date: string;
    staffStats: {
        [staffId: string]: {
            name: string;
            totalSalesValue: number;
            totalTransactions: number;
        }
    };
    lastUpdated?: admin.firestore.Timestamp;
}

// Interface for what the frontend expects for daily summaries
interface DailySummaryForClient {
    date: string;
    totalSalesValue: number;
    totalTransactions: number;
}


export async function GET(req: NextRequest) {
  console.log("API GET /api/manager/sales-transactions called (Manager View)");
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'transactions';
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');
    const staffId = searchParams.get('staffId');
    
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || (mode === 'transactions' ? '30' : '90'));

    const todayStrIST = getCurrentISODateStringInIST();

    if (mode === 'dailySummaries') {
        console.log(`Fetching dailySummaries. staffId: ${staffId}, startDate: ${startDate}, endDate: ${endDate}`);
        if (!startDate || !endDate) {
            console.log("Defaulting date range for dailySummaries to last 7 days.");
            const today = new Date(new Date().toLocaleString("en-US", {timeZone: IST_TIMEZONE}));
            endDate = getCurrentISODateStringInIST();
            const sevenDaysAgo = new Date(today);
            sevenDaysAgo.setDate(today.getDate() - 6);
            startDate = getCurrentISODateStringInISTFromDate(sevenDaysAgo);
            console.log(`Defaulted range: ${startDate} to ${endDate}`);
        }

        const dailySummariesResult: DailySummaryForClient[] = [];
        let query: admin.firestore.Query;

        if (staffId && staffId !== "" && staffId !== "all") {
            console.log(`Fetching daily summaries for specific staff: ${staffId}`);
            query = db.collection('dailyStaffSales')
                      .where('date', '>=', startDate)
                      .where('date', '<=', endDate)
                      .orderBy('date', 'desc')
                      .limit(limit);
            const snapshot = await query.get();
            console.log(`dailyStaffSales query fetched ${snapshot.docs.length} documents.`);
            snapshot.forEach(doc => {
                const data = doc.data() as DailyStaffSalesDoc; // Use specific interface
                if (data.staffStats && data.staffStats[staffId]) {
                    dailySummariesResult.push({
                        date: data.date,
                        totalSalesValue: data.staffStats[staffId].totalSalesValue || 0,
                        totalTransactions: data.staffStats[staffId].totalTransactions || 0
                    });
                } else {
                    // This can happen if a dailyStaffSales doc exists for the date but not for this specific staff
                    // Or if staffId in query params doesn't exist in the staffStats map
                    console.log(`No stats found for staff ${staffId} in dailyStaffSales doc for date ${data.date}`);
                }
            });
        } else {
            console.log("Fetching daily summaries for all staff from dailySalesSummaries.");
            query = db.collection('dailySalesSummaries')
                      .where('date', '>=', startDate)
                      .where('date', '<=', endDate)
                      .orderBy('date', 'desc')
                      .limit(limit);
            const snapshot = await query.get();
            console.log(`dailySalesSummaries query fetched ${snapshot.docs.length} documents.`);
            snapshot.forEach(doc => {
                const data = doc.data() as DailySalesSummaryDoc; // Use specific interface
                // Ensure fields exist and default if necessary
                dailySummariesResult.push({
                    date: data.date,
                    totalSalesValue: data.totalSalesValue || 0,
                    totalTransactions: data.totalTransactions || 0
                });
            });
        }
        console.log("Returning dailySummaries:", dailySummariesResult);
        return NextResponse.json({ dailySummaries: dailySummariesResult });
    }

    // --- Mode: Individual Transactions ---
    if (!startDate || !endDate) {
        startDate = todayStrIST;
        endDate = todayStrIST;
    }

    let query: admin.firestore.Query = db.collection('salesTransactions')
                                        .where('status', '==', 'SOLD');

    if (staffId && staffId !== "" && staffId !== "all") {
      query = query.where('staffId', '==', staffId);
    }
    query = query.where('dateOfSale', '>=', startDate).where('dateOfSale', '<=', endDate);
    
    const countSnapshot = await query.count().get();
    const totalItems = countSnapshot.data().count;

    query = query.orderBy('dateOfSale', 'desc').orderBy('timestamp', 'desc');
    
    if (page > 1) {
        const offset = (page - 1) * limit;
        const previousPageSnapshot = await query.limit(offset).get();
        if (!previousPageSnapshot.empty) {
            const lastVisible = previousPageSnapshot.docs[previousPageSnapshot.docs.length - 1];
            query = query.startAfter(lastVisible);
        } else if (offset > 0 && totalItems > 0) {
             return NextResponse.json({ 
                transactions: [], 
                pagination: { currentPage: page, pageSize: limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
            }, { status: 404 });
        }
    }
    query = query.limit(limit);

    const snapshot = await query.get();
    const transactions = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        articleNo: data.articleNo,
        barcodeScanned: data.barcodeScanned || null,
        calculatedSellPrice: data.calculatedSellPrice,
        dateOfSale: data.dateOfSale,
        staffId: data.staffId,
        status: data.status,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date(0).toISOString(),
        weightGrams: data.weightGrams,
        product_articleName: data.product_articleName || null,
        product_articleNumber: data.product_articleNumber || null,
        product_hsnCode: data.product_hsnCode || null,
        product_metlerCode: data.product_metlerCode || null,
        product_mrpPer100g: data.product_mrpPer100g !== undefined ? data.product_mrpPer100g : null,
        product_posDescription: data.product_posDescription || null,
        product_purchasePricePerKg: data.product_purchasePricePerKg !== undefined ? data.product_purchasePricePerKg : null,
        product_remark: data.product_remark || null,
        product_sellingRatePerKg: data.product_sellingRatePerKg !== undefined ? data.product_sellingRatePerKg : null,
        product_taxPercentage: data.product_taxPercentage !== undefined ? data.product_taxPercentage : null,
      };
    });

    return NextResponse.json({
      transactions,
      pagination: {
          currentPage: page,
          pageSize: limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
      }
    });

  } catch (error: any) {
    console.error("Error in /api/manager/sales-transactions GET (Manager):", error);
    if (error.code === 9 || (typeof error.message === 'string' && error.message.includes('requires an index'))) {
        console.error("Firestore Index missing. Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return NextResponse.json({ message: 'Query failed (missing Firestore index).', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}