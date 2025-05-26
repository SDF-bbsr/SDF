// src/app/api/sales/find-by-barcode/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get('barcode');
    // We will always search for 'SOLD' items to be returned.
    // const statusToFind = searchParams.get('status'); // No longer needed from query param

    if (!barcode) {
      return NextResponse.json({ message: 'Barcode is required.' }, { status: 400 });
    }

    let query: admin.firestore.Query = db.collection('salesTransactions')
                                        .where('barcodeScanned', '==', barcode)
                                        .where('status', '==', 'SOLD'); // Only find SOLD items
        
    // Return multiple matches, ordered by most recent first.
    // Add a limit to prevent excessively large responses if a barcode is somehow reused massively.
    query = query.orderBy('timestamp', 'desc').limit(20); // Limit to 20 matches for selection

    const snapshot = await query.get();

    if (snapshot.empty) {
      return NextResponse.json({ message: `No "SOLD" transaction found with barcode "${barcode}".` }, { status: 404 });
    }

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
            staffId: data.staffId, // Original staff
            dateOfSale: data.dateOfSale,
        };
    });
    

    return NextResponse.json(transactions); // Return array of transactions

  } catch (error: any) {
    console.error("Error finding sale by barcode:", error);
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}