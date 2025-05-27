// src/app/api/manager/sales-transactions/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

export async function GET(req: NextRequest) {
  console.log("API GET /api/manager/sales-transactions/export called");
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const staffId = searchParams.get('staffId');
    const status = searchParams.get('status'); // You might want to add a status filter to export dialog too
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'; // Default to desc
    
    const countOnly = searchParams.get('countOnly') === 'true';
    // For actual export, don't use a small limit unless paginating server-side for export.
    // For client-side generation of Excel, we need all data. Be cautious with very large datasets.
    const limit = countOnly ? 1 : parseInt(searchParams.get('limit') || '10000'); // High limit for export

    let query: admin.firestore.Query = db.collection('salesTransactions');

    if (staffId && staffId !== "" && staffId !== "all") {
      query = query.where('staffId', '==', staffId);
    }
    if (status && status !== "" && status !== "all") { // Example if status filter is added
      query = query.where('status', '==', status);
    }
    
    if (startDate && endDate) {
        query = query.where('dateOfSale', '>=', startDate).where('dateOfSale', '<=', endDate);
    } else if (startDate) {
        query = query.where('dateOfSale', '>=', startDate);
    } else if (endDate) {
        query = query.where('dateOfSale', '<=', endDate);
    }
    
    // Apply ordering
    // The field used in an inequality filter must be the first field in orderBy.
    if (startDate || endDate) {
        query = query.orderBy('dateOfSale', sortOrder).orderBy('timestamp', sortOrder);
    } else {
        query = query.orderBy('timestamp', sortOrder);
    }
    
    if (countOnly) {
        // Firestore count aggregate. Ensure your Firebase Admin SDK version supports this.
        // If not, you'd fetch with limit(1) and check if empty, or fetch all and count (not recommended for just count).
        // For a more accurate count without fetching all documents, you'd need a server-side counter or separate aggregation.
        // Let's assume for preview, fetching a limited set and giving a "more than X" or exact if <= limit is okay.
        // Or, use the actual .count() aggregate if available and enabled.
        // For simplicity, let's fetch a larger set and count, this is NOT ideal for very large datasets.
        // A proper solution for countOnly would be a separate aggregation query or maintaining counters.
        // For now, let's fetch a larger sample and get its length for preview.
        const previewSnapshot = await query.limit(1001).get(); // Fetch slightly more than a typical large page
        return NextResponse.json({ totalRecords: previewSnapshot.size });
    }

    query = query.limit(limit); // Apply limit for actual data fetch

    const snapshot = await query.get();
    console.log(`Export query fetched ${snapshot.docs.length} documents.`);

    const transactions = snapshot.docs.map(doc => {
      const data = doc.data();
      return { // Return all fields, frontend will select
        id: doc.id,
        ...data, // Spread all data from Firestore document
        timestamp: data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().toISOString() : null,
      };
    });

    return NextResponse.json({
      transactions,
      totalRecords: transactions.length // For non-countOnly, this is the count of returned items
    });

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