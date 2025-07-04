// src/app/api/manager/stock-ledger/export/route.ts
import { db } from '@/lib/firebaseAdmin';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Re-using the interface from the main ledger route
interface MonthlyStockLedgerItem {
    productArticleNo: string;
    productName: string;
    month: string;
    year: string;
    openingStockKg: number;
    totalRestockedThisMonthKg: number;
    restockEntriesThisMonth: { 
        [timestamp: string]: {
            [randomNumber: string]: {
                date: string;
                notes?: string;
                quantityKg: number;
            };
        };
    };
    totalSoldThisMonthKg: number;
    closingStockKg: number;
    lastSalesSyncDateForMonth: string | null;
    lastUpdated: any;
}

// This GET handler is optimized to fetch ALL ledger entries for a given month.
// It's based on your existing efficient GET handler but simplified for export (no pagination).
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const month = searchParams.get('month');

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ message: 'A valid month (YYYY-MM) is required for export.' }, { status: 400 });
        }

        console.log(`[EXPORT API] Initiating full data fetch for stock ledger month: ${month}`);

        // Note: The logic here mirrors your main GET handler to ensure consistency.
        // It fetches all products and then finds or creates ledger entries for them.
        // This ensures the export is comprehensive for the selected month.

        // 1. Fetch all product definitions once.
        const productsSnapshot = await db.collection('product').orderBy(admin.firestore.FieldPath.documentId()).get();
        if (productsSnapshot.empty) {
            return NextResponse.json({ items: [] });
        }
        const allProductDefs = productsSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().articleName || `Product ${doc.id}`,
        }));

        // 2. Prepare for bulk fetching ledgers.
        const currentLedgerRefs = allProductDefs.map(p => db.collection('monthlyProductStockLedger').doc(`${p.id}_${month}`));
        
        // 3. Perform bulk fetch.
        const currentLedgerDocs = await db.getAll(...currentLedgerRefs);

        // 4. Process fetched data. We don't need to create missing ones for an export,
        // as we only want to export what exists.
        const existingLedgers = currentLedgerDocs
            .filter(d => d.exists)
            .map(d => d.data() as MonthlyStockLedgerItem);
        
        // 5. Sort and format the response.
        const resolvedItems = existingLedgers.map(item => {
            if (item.lastUpdated && typeof item.lastUpdated.toDate === 'function') {
                item.lastUpdated = item.lastUpdated.toDate().toISOString();
            }
            // The structure of restockEntriesThisMonth is complex, but we pass it as-is.
            // The frontend will be responsible for parsing it into the correct columns.
            return item;
        });

        resolvedItems.sort((a, b) => a.productName.localeCompare(b.productName));

        console.log(`[EXPORT API] Successfully fetched ${resolvedItems.length} ledger items for ${month}.`);
        return NextResponse.json({ items: resolvedItems });

    } catch (error: any) {
        console.error("Error in GET /api/manager/stock-ledger/export:", error);
        return NextResponse.json({ message: 'Failed to fetch stock ledger data for export.', details: error.message }, { status: 500 });
    }
}