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

export async function POST(req: NextRequest) {
    // Modification: Added request received log
    console.log('[STOCK SYNC SALES] POST /api/manager/stock-ledger/sync-sales: Request received.');
    try {
        const { productArticleNos, monthToSync } = await req.json(); // productArticleNos is now an array
        // Modification: Added request body log
        console.log(`[STOCK SYNC SALES] Request body: productArticleNos: ${JSON.stringify(productArticleNos)}, monthToSync: ${monthToSync}`);

        if (!Array.isArray(productArticleNos) || productArticleNos.length === 0 || !monthToSync || !/^\d{4}-\d{2}$/.test(monthToSync)) {
            return NextResponse.json({ message: 'Product article numbers array and a valid month (YYYY-MM) are required.' }, { status: 400 });
        }

        const [year, monthNum] = monthToSync.split('-').map(Number);
        const firstDayOfMonth = `${monthToSync}-01`;
        // To get the last day of the month: go to the first day of the *next* month, then subtract one day.
        // Or, use new Date(year, monthNum, 0) which gives the last day of the *previous* month (monthNum is 1-indexed).
        const lastDayDate = new Date(year, monthNum, 0); // monthNum is 1-12, new Date month is 0-11. So monthNum directly works here for 'day 0 of next month'.
        const lastDayOfMonth = `${monthToSync}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

        let successCount = 0;
        const errors: { articleNo: string; message: string }[] = [];

        const batch = db.batch();

        for (const productArticleNo of productArticleNos) {
            try {
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

                // Fetch product name - needed if creating a new ledger entry
                const productRef = db.collection('product').doc(productArticleNo);
                const productDoc = await productRef.get();
                const productName = productDoc.exists ? productDoc.data()?.articleName || productArticleNo : productArticleNo;

                const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${monthToSync}`);
                const ledgerSnap = await ledgerDocRef.get(); // Read outside batch

                if (!ledgerSnap.exists) {
                    // Ledger entry does not exist, create a new one with synced sales
                    const openingStockData = await getOpeningStockForMonth(db, productArticleNo, monthToSync);

                    const initialData = {
                        productArticleNo,
                        productName,
                        month: monthToSync,
                        year: monthToSync.split('-')[0],
                        openingStockKg: openingStockData.openingStockKg,
                        totalRestockedThisMonthKg: 0, // Assuming no restocks if created now by sync
                        restockEntriesThisMonth: {},
                        totalSoldThisMonthKg: totalSoldKgThisMonth,
                        closingStockKg: openingStockData.openingStockKg - totalSoldKgThisMonth, // Opening - Sold (since restocked is 0)
                        lastSalesSyncDateForMonth: new Date().toISOString().split('T')[0],
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    };
                    batch.set(ledgerDocRef, initialData);
                } else {
                     // Ledger entry exists, update it
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
                console.error(`[STOCK SYNC SALES] Error syncing product ${productArticleNo}:`, e); // Added specific error log for per-product failure
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
                errors // Send detailed errors array
            }, { status: 207 }); // Multi-Status
        }
        return NextResponse.json({ message: `Sales successfully synced for ${successCount} products in ${monthToSync}.` });

    } catch (error: any) {
        // Modification: Updated fatal error log message
        console.error("[FATAL ERROR] Error syncing sales to ledger:", error);
        return NextResponse.json({ message: error.message || 'Failed to sync sales due to a server error.' }, { status: 500 });
    }
}