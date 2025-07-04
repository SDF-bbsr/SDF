// /api/manager/stock-ledger/sync-sales/route.ts
import { db } from '@/lib/firebaseAdmin';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Change 1: monthToSync is now optional.
interface SyncSalesRequestBody {
    productArticleNos?: string[];
    monthToSync?: string;
}

interface ProductListItemAPI {
    id: string;
    name: string;
}

export async function POST(req: NextRequest) {
    console.log('[STOCK SYNC SALES] POST /api/manager/stock-ledger/sync-sales: Request received.');
    try {
        const body: SyncSalesRequestBody = await req.json();
        // Change 2: Use `let` to allow monthToSync to be reassigned.
        let { productArticleNos, monthToSync } = body;

        // Change 3: Logic to handle missing monthToSync.
        if (!monthToSync) {
            console.log('[STOCK SYNC SALES] monthToSync not provided. Calculating current month for Asia/Kolkata timezone.');
            const now = new Date();
            const timeZone = 'Asia/Kolkata';
            const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(now);
            const month = new Intl.DateTimeFormat('en-US', { month: '2-digit', timeZone }).format(now);
            monthToSync = `${year}-${month}`;
            console.log(`[STOCK SYNC SALES] Defaulting to current month: ${monthToSync}`);
        } else if (!/^\d{4}-\d{2}$/.test(monthToSync)) {
            // If it IS provided, it must be in the correct format.
            return NextResponse.json({ message: 'A valid month (YYYY-MM) is required.' }, { status: 400 });
        }
        
        // Step 1: Determine the list of products to sync
        let effectiveProductArticleNos: string[];
        if (productArticleNos && Array.isArray(productArticleNos) && productArticleNos.length > 0) {
            effectiveProductArticleNos = productArticleNos;
            console.log(`[STOCK SYNC SALES] Using ${effectiveProductArticleNos.length} provided products.`);
        } else {
            console.log('[STOCK SYNC SALES] Fetching all products to sync.');
            const appUrl = process.env.VERCEL_APP_URL;
            if (!appUrl) throw new Error('Configuration error: VERCEL_APP_URL missing.');
            
            const response = await fetch(`${appUrl}/api/manager/products-list`);
            if (!response.ok) throw new Error(`Failed to fetch product list. Status: ${response.status}`);
            
            const products: ProductListItemAPI[] = await response.json();
            if (!products || products.length === 0) {
                 return NextResponse.json({ message: 'No products found to sync.' }, { status: 404 });
            }
            effectiveProductArticleNos = products.map(p => p.id);
            console.log(`[STOCK SYNC SALES] Fetched ${effectiveProductArticleNos.length} products to sync.`);
        }

        if (effectiveProductArticleNos.length === 0) {
            return NextResponse.json({ message: 'No product article numbers to process.' }, { status: 400 });
        }
        
        // Step 2: Fetch all necessary data in parallel (Optimized)
        console.log(`[STOCK SYNC SALES] Starting parallel data fetch for all products for month ${monthToSync}.`);
        const [year, monthNum] = monthToSync.split('-').map(Number);
        const firstDayOfMonth = `${monthToSync}-01`;
        const lastDayDate = new Date(year, monthNum, 0); 
        const lastDayOfMonth = `${monthToSync}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

        // We only need two sets of data now: monthly sales and the current month's ledgers.
        const [salesSnapshot, currentLedgerDocs] = await Promise.all([
            // 1. Get ALL sales for the month in ONE query
            db.collection('dailyProductSales')
                .where('date', '>=', firstDayOfMonth)
                .where('date', '<=', lastDayOfMonth)
                .get(),
            
            // 2. Get ALL existing ledgers for the CURRENT month in ONE call
            db.getAll(...effectiveProductArticleNos.map(id => db.collection('monthlyProductStockLedger').doc(`${id}_${monthToSync}`)))
        ]);
        console.log(`[STOCK SYNC SALES] Fetched ${salesSnapshot.size} sales records and ${currentLedgerDocs.length} current ledgers.`);

        // Step 3: Process data into Maps for fast in-memory lookup
        const salesByProduct = new Map<string, number>();
        salesSnapshot.forEach(doc => {
            const data = doc.data();
            const currentSales = salesByProduct.get(data.productArticleNo) || 0;
            salesByProduct.set(data.productArticleNo, currentSales + (data.totalQuantitySoldGrams || 0));
        });

        const currentLedgers = new Map(currentLedgerDocs.map(doc => [doc.id.split('_')[0], doc.data()]));

        // Step 4: Loop through products without awaits, preparing a batch update
        const batch = db.batch();
        let successCount = 0;
        const errors: { articleNo: string; message: string }[] = [];

        for (const productArticleNo of effectiveProductArticleNos) {
            try {
                const existingLedgerData = currentLedgers.get(productArticleNo);

                // --- CRITICAL CHANGE ---
                // If the ledger doesn't exist, we skip it and report an error.
                // We do NOT create it here.
                if (!existingLedgerData) {
                    errors.push({ 
                        articleNo: productArticleNo, 
                        message: 'Ledger entry for this month does not exist. Please visit the Stock Ledger page first to initialize it.' 
                    });
                    continue; // Skip to the next product
                }

                // Calculate total sales for this product
                const totalSoldGramsThisMonth = salesByProduct.get(productArticleNo) || 0;
                const totalSoldKgThisMonth = totalSoldGramsThisMonth / 1000;
                
                // Calculate the new closing stock based on the existing ledger data
                const openingStockKg = existingLedgerData.openingStockKg || 0;
                const totalRestockedKg = existingLedgerData.totalRestockedThisMonthKg || 0;
                const newClosingStock = openingStockKg + totalRestockedKg - totalSoldKgThisMonth;
                
                // Prepare the update operation
                const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${monthToSync}`);
                batch.update(ledgerDocRef, {
                    totalSoldThisMonthKg: totalSoldKgThisMonth,
                    closingStockKg: newClosingStock,
                    lastSalesSyncDateForMonth: new Date().toISOString().split('T')[0],
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
                
                successCount++;
            } catch (e: any) {
                console.error(`[STOCK SYNC SALES] Error processing product ${productArticleNo}:`, e);
                errors.push({ articleNo: productArticleNo, message: e.message || 'Unknown error during processing.' });
            }
        }
        
        // Step 5: Commit all updates in a single batch
        console.log('[STOCK SYNC SALES] Committing batch write.');
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
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
             return NextResponse.json({ message: 'Invalid JSON in request body.' }, { status: 400 });
        }
        return NextResponse.json({ message: error.message || 'Failed to sync sales due to a server error.' }, { status: 500 });
    }
}