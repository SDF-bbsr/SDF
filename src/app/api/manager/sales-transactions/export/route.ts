// src/app/api/manager/sales-transactions/export/route.ts
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

export async function GET(req: NextRequest) {
  console.log("API GET /api/manager/sales-transactions/export called");
  try {
    const { searchParams } = new URL(req.url);
    const todayStrIST = getCurrentISODateStringInIST(); // Get today's date in IST

    // Default to today if not provided
    const startDate = searchParams.get('startDate') || todayStrIST;
    const endDate = searchParams.get('endDate') || todayStrIST;
    
    const staffId = searchParams.get('staffId');
    const status = searchParams.get('status');
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
    const countOnly = searchParams.get('countOnly') === 'true';
    const limit = countOnly ? 1 : parseInt(searchParams.get('limit') || '10000');

    let query: admin.firestore.Query = db.collection('salesTransactions');

    if (staffId && staffId !== "" && staffId !== "all") {
      query = query.where('staffId', '==', staffId);
    }
    if (status && status !== "" && status !== "all") {
      query = query.where('status', '==', status);
    }
    
    // Apply date range using the potentially defaulted startDate and endDate
    query = query.where('dateOfSale', '>=', startDate).where('dateOfSale', '<=', endDate);
    
    query = query.orderBy('dateOfSale', sortOrder).orderBy('timestamp', sortOrder);
    
    if (countOnly) {
        const previewSnapshot = await query.limit(1001).get();
        return NextResponse.json({ totalRecords: previewSnapshot.size });
    }

    query = query.limit(limit);
    const snapshot = await query.get();
    const transactions = snapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data, timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : null };
    });

    return NextResponse.json({ transactions, totalRecords: transactions.length });

  } catch (error: any) {
    console.error("Error in /api/manager/sales-transactions/export GET:", error);
    if (error.code === 9 || (typeof error.message === 'string' && error.message.includes('INVALID_ARGUMENT') && error.message.includes('requires an index'))) {
        console.error("Firestore Index missing for export. Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        // ... (rest of error handling)
        return NextResponse.json({ message: 'Query failed (missing Firestore index). Check server logs.', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}