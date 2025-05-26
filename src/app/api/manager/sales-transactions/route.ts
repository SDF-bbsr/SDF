// src/app/api/manager/sales-transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

export async function GET(req: NextRequest) {
  console.log("API GET /api/manager/sales-transactions called");
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD
    const endDate = searchParams.get('endDate');     // YYYY-MM-DD
    const staffId = searchParams.get('staffId');     // Specific staff ID
    const status = searchParams.get('status');       // "SOLD", "RETURNED_PRE_BILLING"
    const limit = parseInt(searchParams.get('limit') || '100'); // Default 100, frontend asks for 1000

    let query: admin.firestore.Query = db.collection('salesTransactions');

    // Apply filters
    if (staffId && staffId !== "") {
      query = query.where('staffId', '==', staffId);
    }
    if (status && status !== "") {
      query = query.where('status', '==', status);
    }
    
    // Date range filtering: Firestore requires the first orderBy to be on the field used for inequality filters.
    if (startDate && endDate) {
        query = query.where('dateOfSale', '>=', startDate).where('dateOfSale', '<=', endDate);
        // If you also have other equality filters (staffId, status), they should come before date range.
        // Firestore will need an index that starts with staffId/status, then dateOfSale.
    } else if (startDate) {
        query = query.where('dateOfSale', '>=', startDate);
    } else if (endDate) {
        query = query.where('dateOfSale', '<=', endDate);
    }
    
    // Apply ordering
    // The field used in an inequality filter (like dateOfSale >= startDate) must be the first field in orderBy.
    if (startDate || endDate) {
        query = query.orderBy('dateOfSale', 'desc').orderBy('timestamp', 'desc');
    } else {
        // If no date filters, you can order by timestamp directly.
        // If staffId or status filters are active without date, you might need indexes like:
        // staffId (asc), timestamp (desc)
        // status (asc), timestamp (desc)
        // staffId (asc), status(asc), timestamp(desc)
        query = query.orderBy('timestamp', 'desc');
    }
    
    query = query.limit(limit);

    console.log("Executing sales transactions query with filters...");
    const snapshot = await query.get();
    console.log(`Query completed, fetched ${snapshot.docs.length} documents.`);

    const transactions = snapshot.docs.map(doc => {
      const data = doc.data();
      // Ensure all relevant fields, including denormalized product_ ones, are returned
      return {
        id: doc.id,
        articleNo: data.articleNo,
        barcodeScanned: data.barcodeScanned || null, // Ensure null if undefined
        calculatedSellPrice: data.calculatedSellPrice,
        dateOfSale: data.dateOfSale,
        staffId: data.staffId,
        status: data.status,
        timestamp: data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().toISOString() : new Date(0).toISOString(), // Handle if timestamp isn't a Firestore Timestamp
        weightGrams: data.weightGrams,
        
        // Include denormalized product fields stored with the transaction
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
    });

  } catch (error: any) {
    console.error("Error in /api/manager/sales-transactions GET:", error);
    // Check for Firestore's specific error code for missing index (which is 9, FAILED_PRECONDITION)
    if (error.code === 9 || (typeof error.message === 'string' && error.message.includes('INVALID_ARGUMENT') && error.message.includes('requires an index'))) {
        // Log the full error to see the index creation link if Firestore provides it
        console.error("Firestore Index missing or query issue. Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        let detailMessage = error.details || error.message;
        if (typeof detailMessage === 'string' && detailMessage.includes('The query requires an index.')){
            // Try to extract the index creation URL (this format can change)
            const match = detailMessage.match(/https?:\/\/[^\s]+/);
            if (match) {
                detailMessage += ` --- You can create the Firestore index using this link: ${match[0]}`;
            }
        }
        return NextResponse.json({ 
            message: 'Query failed due to missing Firestore index or invalid query structure. Check server logs for an index creation link or details.', 
            details: detailMessage
        }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal Server Error', details: error.message || 'Unknown error' }, { status: 500 });
  }
}