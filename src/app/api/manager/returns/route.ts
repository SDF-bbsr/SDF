// src/app/api/manager/returns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin'; // Required for Query type

const IST_TIMEZONE = 'Asia/Kolkata';

// Helper to format a given Date object into YYYY-MM-DD string in IST
const getISODateStringInISTFromDate = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(date);
};

// Helper to get current YYYY-MM-DD string in IST
const getCurrentISODateStringInIST = (): string => {
    return getISODateStringInISTFromDate(new Date());
};


export async function GET(req: NextRequest) {
  console.log("API /api/manager/returns called");
  try {
    const { searchParams } = new URL(req.url);
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');
    const staffId = searchParams.get('staffId'); // Original staff who made the sale
    
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '30'); // Default 30 returns per page

    // Default date range to last 7 days if not provided
    if (!startDate || !endDate) {
        // Create a date object that represents "now" in IST for reliable date calculations
        const now = new Date();
        const nowInISTLocaleString = now.toLocaleString("en-US", {timeZone: IST_TIMEZONE});
        const todayInIST = new Date(nowInISTLocaleString);
        
        // endDate = getCurrentISODateStringInIST(todayInIST); // Today in IST
        endDate = getCurrentISODateStringInIST(); // Today in IST
        
        const sevenDaysAgoInIST = new Date(todayInIST);
        sevenDaysAgoInIST.setDate(todayInIST.getDate() - 6);
        startDate = getISODateStringInISTFromDate(sevenDaysAgoInIST);
        
        console.log(`Manager Returns Log: Defaulting date range to: ${startDate} - ${endDate}`);
    }

    let queryBase: admin.firestore.Query = db.collection('salesTransactions')
                                        .where('status', '==', 'RETURNED_PRE_BILLING');

    if (staffId && staffId !== 'all') { // Ensure 'all' is not treated as a specific staffId
      queryBase = queryBase.where('staffId', '==', staffId); 
    }
    
    // Filter by original dateOfSale for the returned items
    // Ensure startDate and endDate are valid before applying to query
    if (startDate) {
        queryBase = queryBase.where('dateOfSale', '>=', startDate);
    }
    if (endDate) {
        queryBase = queryBase.where('dateOfSale', '<=', endDate);
    }
    
    // Count for pagination
    // Firestore requires the first orderBy to match the inequality field if one exists.
    // So, we might need to construct the count query slightly differently or ensure indexes.
    // For simplicity, let's assume an index on (status, dateOfSale, staffId [optional], lastStatusUpdateAt) exists or will be created.
    let countQuery = queryBase; // Create a new query reference for count to avoid modifying dataQuery's orderBy yet
    
    const countSnapshot = await countQuery.count().get();
    const totalItems = countSnapshot.data().count;

    if (totalItems === 0) {
        console.log("No returned items found for the given criteria.");
        return NextResponse.json({
            returns: [],
            totalReturnedValue: 0,
            count: 0,
            pagination: { currentPage: 1, pageSize: limit, totalItems: 0, totalPages: 0 }
        });
    }
    
    // Apply ordering for data fetching.
    // If dateOfSale is used in range filters, it should be the primary sort field for that part of the query.
    // Then sort by when it was marked returned.
    let dataQuery = queryBase.orderBy('dateOfSale', 'desc') // Order by sale date first if filtered by it
                             .orderBy('lastStatusUpdateAt', 'desc'); // Then by when it was returned

    // Pagination logic
    if (page > 1) {
        const offset = (page - 1) * limit;
        // To use startAfter, we need to get the document snapshot of the last item of the previous page
        // This requires ordering to be consistent.
        const previousPageQuery = dataQuery.limit(offset); // Query up to the end of the previous page items
        const previousPageSnapshot = await previousPageQuery.get();

        if (!previousPageSnapshot.empty) {
            const lastVisible = previousPageSnapshot.docs[previousPageSnapshot.docs.length - 1];
            dataQuery = dataQuery.startAfter(lastVisible);
        } else if (offset > 0) { 
            // This means the requested page is out of bounds.
            console.log(`Page ${page} out of bounds for returns log.`);
            return NextResponse.json({
                returns: [], totalReturnedValue: 0, count: totalItems, // count is still totalItems
                pagination: { currentPage: page, pageSize: limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
            }, { status: 404 }); // Not found for this page
        }
    }
    dataQuery = dataQuery.limit(limit);

    const snapshot = await dataQuery.get();
    console.log(`Manager Returns query fetched ${snapshot.docs.length} documents for page ${page}. Total items: ${totalItems}`);

    let totalReturnedValueForPage = 0; 

    const returns = snapshot.docs.map(doc => {
      const data = doc.data();
      totalReturnedValueForPage += data.calculatedSellPrice || 0;
      return {
        id: doc.id,
        articleNo: data.articleNo,
        barcodeScanned: data.barcodeScanned,
        product_articleName: data.product_articleName || null,
        calculatedSellPrice: data.calculatedSellPrice,
        dateOfSale: data.dateOfSale, 
        staffId: data.staffId, 
        status: data.status,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : null,
        lastStatusUpdateAt: data.lastStatusUpdateAt?.toDate ? data.lastStatusUpdateAt.toDate().toISOString() : null,
        weightGrams: data.weightGrams,
      };
    });

    return NextResponse.json({
      returns,
      totalReturnedValue: parseFloat(totalReturnedValueForPage.toFixed(2)), // Value for the current page
      count: totalItems, // Total count for the filtered criteria
      pagination: {
          currentPage: page,
          pageSize: limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit)
      }
    });

  } catch (error: any) {
    console.error("Error in /api/manager/returns:", error);
    if (error.code === 9 || error.code === 'failed-precondition' || (typeof error.message === 'string' && error.message.includes('requires an index'))) {
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