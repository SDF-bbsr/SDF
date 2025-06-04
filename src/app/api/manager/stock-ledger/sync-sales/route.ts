// /api/manager/stock-ledger/sync-sales/route.ts
import { db } from '@/lib/firebaseAdmin';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Helper to get opening stock for a given product and month
// This function is derived from the "Modification" snippet.
async function getOpeningStockForMonth(
    dbInstance: FirebaseFirestore.Firestore,
    productArticleNo: string,
    // productName: string, // Not strictly needed by this function's logic but can be kept for consistency
    currentMonthYYYYMM: string
): Promise<{ openingStockKg: number }> {
    const [year, month] = currentMonthYYYYMM.split('-').map(Number);
    // To get previous month, month - 1 is current month's index (0-11), so month - 2 is previous month's index.
    const prevMonthDate = new Date(year, month - 2, 1);
    const prevMonthYYYYMM = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    let openingStockKg = 0;
    const prevLedgerDocRef = dbInstance.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${prevMonthYYYYMM}`);
    const prevLedgerDocSnap = await prevLedgerDocRef.get();

    if (prevLedgerDocSnap.exists) {
        openingStockKg = prevLedgerDocSnap.data()?.closingStockKg || 0;
    }
    // If previous month's ledger doesn't exist, opening stock remains 0.
    // A more advanced system might look for the last known closing stock or a base opening stock.
    return { openingStockKg };
}

interface SyncSalesRequestBody {
    productArticleNos?: string[]; // Optional: can be undefined, null, or an empty array
    monthToSync: string;
}

interface ProductListItemAPI { // Expected structure from /api/manager/products-list
    id: string;
    name: string;
    // Add other fields if present, but id and name are crucial
}

export async function POST(req: NextRequest) {
    // Modification: Added request received log
    console.log('[STOCK SYNC SALES] POST /api/manager/stock-ledger/sync-sales: Request received.');
    try {
        const body: SyncSalesRequestBody = await req.json();
        const { productArticleNos, monthToSync } = body;
        
        // Modification: Added request body log
        console.log(`[STOCK SYNC SALES] Request body: productArticleNos: ${JSON.stringify(productArticleNos)}, monthToSync: ${monthToSync}`);

        if (!monthToSync || !/^\d{4}-\d{2}$/.test(monthToSync)) {
            return NextResponse.json({ message: 'A valid month (YYYY-MM) is required.' }, { status: 400 });
        }
        
        let effectiveProductArticleNos: string[];

        if (productArticleNos && Array.isArray(productArticleNos) && productArticleNos.length > 0) {
            effectiveProductArticleNos = productArticleNos;
            console.log(`[STOCK SYNC SALES] Using provided productArticleNos: ${effectiveProductArticleNos.length} items.`);
        } else {
            console.log('[STOCK SYNC SALES] productArticleNos not provided or is empty. Attempting to fetch all products.');
            const appUrl = process.env.VERCEL_APP_URL; // As specified: preccs.enc.VERCEL_APP_URL
            
            if (!appUrl) {
                console.error('[STOCK SYNC SALES] VERCEL_APP_URL environment variable is not set. Cannot fetch product list automatically.');
                return NextResponse.json({ message: 'Configuration error: Server is not configured to fetch product list automatically (VERCEL_APP_URL missing).' }, { status: 500 });
            }

            const productListUrl = `${appUrl}/api/manager/products-list`;
            console.log(`[STOCK SYNC SALES] Fetching product list from: ${productListUrl}`);

            try {
                const response = await fetch(productListUrl);
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[STOCK SYNC SALES] Failed to fetch product list. Status: ${response.status}, URL: ${productListUrl}, Response: ${errorText}`);
                    throw new Error(`Failed to fetch product list. Server responded with status ${response.status}`);
                }
                const products: ProductListItemAPI[] = await response.json();
                
                if (!products || products.length === 0) {
                    console.log('[STOCK SYNC SALES] Fetched product list is empty or invalid.');
                    return NextResponse.json({ message: 'No products found to sync. The fetched product list is empty.' }, { status: 404 });
                }
                
                effectiveProductArticleNos = products.map(p => p.id);
                if (effectiveProductArticleNos.some(id => !id || typeof id !== 'string')) {
                    console.error('[STOCK SYNC SALES] Fetched product list contains invalid items (missing or non-string IDs).');
                    return NextResponse.json({ message: 'Fetched product list contains invalid data.' }, { status: 500 });
                }
                console.log(`[STOCK SYNC SALES] Successfully fetched ${effectiveProductArticleNos.length} products to sync.`);

            } catch (fetchError: any) {
                console.error('[STOCK SYNC SALES] Error during product list fetch:', fetchError);
                return NextResponse.json({ message: `Failed to fetch product list automatically: ${fetchError.message}` }, { status: 500 });
            }
        }

        // From this point, effectiveProductArticleNos is guaranteed to be populated,
        // either from the request or by fetching.
        if (!effectiveProductArticleNos || effectiveProductArticleNos.length === 0) {
             // This case should ideally be caught earlier (e.g., fetched list is empty)
             // but serves as a final check.
            return NextResponse.json({ message: 'No product article numbers to process.' }, { status: 400 });
        }


        const [year, monthNum] = monthToSync.split('-').map(Number);
        const firstDayOfMonth = `${monthToSync}-01`;
        const lastDayDate = new Date(year, monthNum, 0); 
        const lastDayOfMonth = `${monthToSync}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

        let successCount = 0;
        const errors: { articleNo: string; message: string }[] = [];

        const batch = db.batch();

        for (const productArticleNo of effectiveProductArticleNos) { // Use effectiveProductArticleNos
            try {
                // ... (rest of the per-product sync logic remains unchanged) ...
                const salesSnapshot = await db.collection('dailyProductSales')
                    .where('productArticleNo', '==', productArticleNo)
                    .where('date', '>=', firstDayOfMonth)
                    .where('date', '<=', lastDayOfMonth)
                    .get();

                let totalSoldGramsThisMonth = 0;
                salesSnapshot.forEach(doc => {
                    totalSoldGramsThisMonth += doc.data().totalQuantitySoldGrams || 0;
                });
                const totalSoldKgThisMonth = totalSoldGramsThisMonth / 1000;

                const productRef = db.collection('product').doc(productArticleNo);
                const productDoc = await productRef.get();
                const productName = productDoc.exists ? productDoc.data()?.articleName || productArticleNo : productArticleNo;

                const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${monthToSync}`);
                const ledgerSnap = await ledgerDocRef.get();

                if (!ledgerSnap.exists) {
                    const openingStockData = await getOpeningStockForMonth(db, productArticleNo, monthToSync);
                    const initialData = {
                        productArticleNo,
                        productName,
                        month: monthToSync,
                        year: monthToSync.split('-')[0],
                        openingStockKg: openingStockData.openingStockKg,
                        totalRestockedThisMonthKg: 0,
                        restockEntriesThisMonth: {},
                        totalSoldThisMonthKg: totalSoldKgThisMonth,
                        closingStockKg: openingStockData.openingStockKg - totalSoldKgThisMonth,
                        lastSalesSyncDateForMonth: new Date().toISOString().split('T')[0],
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    };
                    batch.set(ledgerDocRef, initialData);
                } else {
                     const currentData = ledgerSnap.data()!;
                     const newClosingStock = (currentData.openingStockKg || 0) + (currentData.totalRestockedThisMonthKg || 0) - totalSoldKgThisMonth;
                     batch.update(ledgerDocRef, {
                        totalSoldThisMonthKg: totalSoldKgThisMonth,
                        closingStockKg: newClosingStock,
                        lastSalesSyncDateForMonth: new Date().toISOString().split('T')[0],
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
                successCount++;
            } catch (e: any) {
                console.error(`[STOCK SYNC SALES] Error syncing product ${productArticleNo}:`, e);
                errors.push({ articleNo: productArticleNo, message: e.message || 'Unknown error during sync for this product.' });
            }
        }

        await batch.commit();

        if (errors.length > 0) {
            const errorMessages = errors.map(err => `Product ${err.articleNo}: ${err.message}`).join('; ');
            return NextResponse.json({
                message: `Sync partially complete. ${successCount} products synced successfully. ${errors.length} products failed. Errors: ${errorMessages}`,
                successCount,
                errorCount: errors.length,
                errors
            }, { status: 207 });
        }
        return NextResponse.json({ message: `Sales successfully synced for ${successCount} products in ${monthToSync}.` });

    } catch (error: any) {
        console.error("[FATAL ERROR] Error syncing sales to ledger:", error);
        // Check if error is from req.json() parsing
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
             return NextResponse.json({ message: 'Invalid JSON in request body.' }, { status: 400 });
        }
        return NextResponse.json({ message: error.message || 'Failed to sync sales due to a server error.' }, { status: 500 });
    }
}