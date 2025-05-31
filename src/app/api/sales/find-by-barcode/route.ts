// src/app/api/sales/find-by-barcode/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin'; // For types if needed, not strictly for query here

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get('barcode');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '5', 10); // Default to 5 items per page

    if (!barcode) {
      return NextResponse.json({ message: 'Barcode is required.' }, { status: 400 });
    }

    let baseQuery: admin.firestore.Query = db.collection('salesTransactions')
                                        .where('barcodeScanned', '==', barcode)
                                        .where('status', '==', 'SOLD'); // Only find SOLD items
        
    // Get total count for pagination
    // This query for count should be efficient if indexed on (barcodeScanned, status)
    const countSnapshot = await baseQuery.count().get();
    const totalItems = countSnapshot.data().count;

    if (totalItems === 0) {
      return NextResponse.json({ 
        message: `No "SOLD" transaction found with barcode "${barcode}".`,
        transactions: [],
        pagination: { currentPage: 1, pageSize: limit, totalItems: 0, totalPages: 0 }
      }, { status: 404 }); // Keep 404 if nothing found
    }

    // Apply ordering and pagination to the main query
    let dataQuery = baseQuery.orderBy('timestamp', 'desc'); // Most recent first

    if (page > 1) {
        const offset = (page - 1) * limit;
        // Fetch docs up to the offset to get the last document of the previous page
        const previousPageSnapshot = await dataQuery.limit(offset).get();
        if (!previousPageSnapshot.empty) {
            const lastDocOfPreviousPage = previousPageSnapshot.docs[previousPageSnapshot.docs.length - 1];
            dataQuery = dataQuery.startAfter(lastDocOfPreviousPage);
        } else if (offset > 0) { 
            // Page requested is beyond available data based on offset
             return NextResponse.json({
                message: 'Page not found.',
                transactions: [],
                pagination: { currentPage: page, pageSize: limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
            }, { status: 404 });
        }
    }
    dataQuery = dataQuery.limit(limit);

    const snapshot = await dataQuery.get(); // Fetches 'limit' documents

    const transactions = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            articleNo: data.articleNo,
            barcodeScanned: data.barcodeScanned,
            product_articleName: data.product_articleName || null,
            weightGrams: data.weightGrams,
            calculatedSellPrice: data.calculatedSellPrice,
            timestamp: data.timestamp.toDate().toISOString(),
            status: data.status,
            staffId: data.staffId,
            dateOfSale: data.dateOfSale, // Crucial for return aggregation
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
    console.error("Error finding sale by barcode:", error);
    // Check for index errors
    if (error.code === 9 || error.code === 'failed-precondition' || (error.message && error.message.toLowerCase().includes('index'))) {
        console.error("Potential Firestore Index issue. Details:", error.details || error.message);
        return NextResponse.json({ message: 'Query requires a Firestore index for optimal performance.', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}