// src/app/api/manager/returns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

export async function GET(req: NextRequest) {
  console.log("API /api/manager/returns called");
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD
    const endDate = searchParams.get('endDate');     // YYYY-MM-DD
    const staffId = searchParams.get('staffId');     // Optional: filter by staff who processed the original sale
    const limit = parseInt(searchParams.get('limit') || '50'); 

    let query: admin.firestore.Query = db.collection('salesTransactions')
                                        .where('status', '==', 'RETURNED_PRE_BILLING');

    if (staffId) {
      query = query.where('staffId', '==', staffId); 
    }
    if (startDate) {
        query = query.where('dateOfSale', '>=', startDate);
    }
    if (endDate) {
        query = query.where('dateOfSale', '<=', endDate);
    }
    
    // Order by when it was marked as returned (lastStatusUpdateAt)
    // If lastStatusUpdateAt might be null for older entries before this field was added,
    // you might want a secondary sort or ensure it's always populated.
    // For simplicity, if lastStatusUpdateAt is present, use it, else fallback to original sale timestamp.
    // However, since we are querying for RETURNED_PRE_BILLING, lastStatusUpdateAt should ideally exist.
    query = query.orderBy('lastStatusUpdateAt', 'desc'); // Primarily order by when it was returned
    // query = query.orderBy('timestamp', 'desc'); // Alternative if lastStatusUpdateAt is not reliable
    query = query.limit(limit);

    const snapshot = await query.get();
    console.log(`Query completed, fetched ${snapshot.docs.length} returned documents.`);

    let totalReturnedValue = 0;
    const returns = snapshot.docs.map(doc => {
      const data = doc.data();
      totalReturnedValue += data.calculatedSellPrice || 0;
      return {
        id: doc.id,
        articleNo: data.articleNo,
        barcodeScanned: data.barcodeScanned,
        product_articleName: data.product_articleName || null,
        calculatedSellPrice: data.calculatedSellPrice,
        dateOfSale: data.dateOfSale, 
        staffId: data.staffId, 
        status: data.status,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : null, // Original sale timestamp
        lastStatusUpdateAt: data.lastStatusUpdateAt?.toDate ? data.lastStatusUpdateAt.toDate().toISOString() : null,
        lastStatusUpdateBy: data.lastStatusUpdateBy || null, // Will likely be null/undefined now
        weightGrams: data.weightGrams,
      };
    });

    return NextResponse.json({
      returns,
      totalReturnedValue: parseFloat(totalReturnedValue.toFixed(2)),
      count: returns.length
    });

  } catch (error: any) {
    console.error("Error in /api/manager/returns:", error);
    if (error.code === 9 || error.code === 'failed-precondition') { // Firestore index error
        console.error("Potential Firestore Index issue for returns. Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        let detailMessage = error.details || error.message;
        const match = typeof detailMessage === 'string' ? detailMessage.match(/https?:\/\/[^\s]+/) : null;
        if (match) {
            detailMessage += ` --- Firestore index creation link: ${match[0]}`;
        }
        return NextResponse.json({ message: 'Query failed (missing Firestore index or invalid query). Check server logs for details.', details: detailMessage }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}