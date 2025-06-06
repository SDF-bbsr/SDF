// src/app/api/manager/stock-ledger/route.ts
import { db } from '@/lib/firebaseAdmin'; // Adjust path if necessary
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// --- INTERFACES ---

interface ProductListItem {
    id: string; // This is the product's document ID / articleNumber
    name: string;
    articleNumber: string;
}

interface MonthlyStockLedgerItem {
    productArticleNo: string;
    productName: string;
    month: string;
    year: string;
    openingStockKg: number;
    totalRestockedThisMonthKg: number;
    restockEntriesThisMonth: { [timestamp: string]: { date: string; quantityKg: number; notes?: string } };
    totalSoldThisMonthKg: number;
    closingStockKg: number;
    lastSalesSyncDateForMonth: string | null;
    lastUpdated: any; // Use `any` to allow for Timestamp, FieldValue, and string during processing
}

// --- HELPER FUNCTION (Used by POST handler) ---

/**
 * Finds a ledger entry or creates a new one if it doesn't exist.
 * This function is designed to work within a Firestore Transaction for the POST handler.
 * It is NOT used by the optimized GET handler.
 */
async function getOrCreateLedgerEntry(
    dbOrTransaction: FirebaseFirestore.Firestore | admin.firestore.Transaction,
    productArticleNo: string,
    productName: string,
    currentMonthYYYYMM: string
): Promise<FirebaseFirestore.DocumentData | null> {
    const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${currentMonthYYYYMM}`);

    // Helper to determine if we are running inside a transaction or not
    const getOperation = (ref: FirebaseFirestore.DocumentReference) =>
        dbOrTransaction instanceof admin.firestore.Transaction
            ? (dbOrTransaction as admin.firestore.Transaction).get(ref)
            : ref.get();

    let ledgerDocSnap = await getOperation(ledgerDocRef);

    if (!ledgerDocSnap.exists) {
        // Calculate previous month to find the closing stock
        const [year, monthNum] = currentMonthYYYYMM.split('-').map(Number);
        const prevMonthDate = new Date(year, monthNum - 2, 1);
        const prevMonthYYYYMM = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

        let openingStockKg = 0;
        const prevLedgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${prevMonthYYYYMM}`);
        const prevLedgerDocSnap = await getOperation(prevLedgerDocRef);

        if (prevLedgerDocSnap.exists) {
            openingStockKg = prevLedgerDocSnap.data()?.closingStockKg || 0;
        }

        const initialData = {
            productArticleNo,
            productName,
            month: currentMonthYYYYMM,
            year: currentMonthYYYYMM.split('-')[0],
            openingStockKg,
            totalRestockedThisMonthKg: 0,
            restockEntriesThisMonth: {},
            totalSoldThisMonthKg: 0,
            closingStockKg: openingStockKg, // Initially, closing stock equals opening stock
            lastSalesSyncDateForMonth: null,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };

        // If in a transaction, queue the set operation. Otherwise, execute it.
        if (dbOrTransaction instanceof admin.firestore.Transaction) {
            (dbOrTransaction as admin.firestore.Transaction).set(ledgerDocRef, initialData);
        } else {
            await ledgerDocRef.set(initialData);
        }

        // Return the data we've just constructed
        return initialData;
    }
    return ledgerDocSnap.data() || null;
}

// --- OPTIMIZED GET HANDLER ---

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const month = searchParams.get('month');

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ message: 'Valid month (YYYY-MM) is required.' }, { status: 400 });
        }

        console.log(`[STOCK LEDGER GET] Fetching/creating ledgers for ${month}`);

        // 1. Fetch all product definitions once.
        const productsSnapshot = await db.collection('product').orderBy(admin.firestore.FieldPath.documentId()).get();
        const allProductDefs: ProductListItem[] = productsSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().articleName || `Product ${doc.id}`,
            articleNumber: doc.data().articleNumber || doc.id,
        }));

        if (allProductDefs.length === 0) {
            return NextResponse.json({ items: [] });
        }

        // 2. Prepare for bulk fetching ledgers for current and previous months.
        const [year, monthNum] = month.split('-').map(Number);
        const prevMonthDate = new Date(year, monthNum - 2, 1);
        const prevMonthYYYYMM = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

        const currentLedgerRefs = allProductDefs.map(p => db.collection('monthlyProductStockLedger').doc(`${p.id}_${month}`));
        const prevLedgerRefs = allProductDefs.map(p => db.collection('monthlyProductStockLedger').doc(`${p.id}_${prevMonthYYYYMM}`));

        // 3. Perform bulk fetches in parallel. This is much faster than N individual fetches.
        console.time('[STOCK LEDGER GET] Bulk Fetch Duration');
        const [currentLedgerDocs, prevLedgerDocs] = await Promise.all([
            db.getAll(...currentLedgerRefs),
            db.getAll(...prevLedgerRefs)
        ]);
        console.timeEnd('[STOCK LEDGER GET] Bulk Fetch Duration');

        // 4. Process fetched data into maps for efficient O(1) lookups.
        const currentLedgersMap = new Map(currentLedgerDocs.filter(d => d.exists).map(d => [d.id.split('_')[0], d.data() as MonthlyStockLedgerItem]));
        const prevLedgersMap = new Map(prevLedgerDocs.filter(d => d.exists).map(d => [d.id.split('_')[0], d.data()]));

        // 5. Iterate through all products to build the final list and identify ledgers to be created.
        const finalLedgerItems: MonthlyStockLedgerItem[] = [];
        const batch = db.batch();
        let createdCount = 0;

        for (const product of allProductDefs) {
            const existingLedger = currentLedgersMap.get(product.id);

            if (existingLedger) {
                // Ledger already exists, just add it to our results.
                finalLedgerItems.push(existingLedger);
            } else {
                // Ledger does not exist, we need to create it.
                const prevLedger = prevLedgersMap.get(product.id);
                const openingStockKg = prevLedger?.closingStockKg || 0;

                const newLedgerData: Omit<MonthlyStockLedgerItem, 'lastUpdated'> & { lastUpdated: any } = {
                    productArticleNo: product.id,
                    productName: product.name,
                    month: month,
                    year: month.split('-')[0],
                    openingStockKg,
                    totalRestockedThisMonthKg: 0,
                    restockEntriesThisMonth: {},
                    totalSoldThisMonthKg: 0,
                    closingStockKg: openingStockKg, // Initially closing = opening
                    lastSalesSyncDateForMonth: null,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                };

                // Add the creation operation to the batch.
                const newLedgerRef = db.collection('monthlyProductStockLedger').doc(`${product.id}_${month}`);
                batch.set(newLedgerRef, newLedgerData);

                // Add the data to our results list (we'll format timestamp later).
                finalLedgerItems.push(newLedgerData as MonthlyStockLedgerItem);
                createdCount++;
            }
        }

        // 6. If any new ledgers were created, commit them all in one batch operation.
        if (createdCount > 0) {
            console.log(`[STOCK LEDGER GET] Committing batch to create ${createdCount} new ledger entries.`);
            await batch.commit();
        }

        // 7. Prepare the response: format timestamps to string and sort.
        const resolvedItems = finalLedgerItems.map(item => {
            // Convert Firestore Timestamps to ISO strings for JSON compatibility
            if (item.lastUpdated && typeof item.lastUpdated.toDate === 'function') {
                item.lastUpdated = item.lastUpdated.toDate().toISOString();
            } else {
                // For newly created items, the server timestamp isn't resolved yet on the client.
                // We provide a placeholder to ensure a consistent data shape.
                item.lastUpdated = new Date().toISOString();
            }
            return item;
        });

        resolvedItems.sort((a, b) => a.productArticleNo.localeCompare(b.productArticleNo));

        return NextResponse.json({ items: resolvedItems });

    } catch (error: any) {
        console.error("Error in GET /api/manager/stock-ledger:", error);
        return NextResponse.json({ message: 'Failed to fetch stock ledger data.', details: error.message }, { status: 500 });
    }
}

// --- EFFICIENT POST HANDLER (for single-item updates) ---

export async function POST(req: NextRequest) { // Add Stock
    try {
        const { productArticleNo, quantityKg, notes, monthToUpdate, restockDate } = await req.json();

        if (!productArticleNo || typeof quantityKg !== 'number' || quantityKg <= 0 || !monthToUpdate || !restockDate) {
            return NextResponse.json({ message: 'Product, valid quantity, month, and restock date are required.' }, { status: 400 });
        }
        if (!/^\d{4}-\d{2}$/.test(monthToUpdate)) {
            return NextResponse.json({ message: 'Valid month (YYYY-MM) for monthToUpdate is required.' }, { status: 400 });
        }
        try {
            new Date(restockDate).toISOString();
        } catch (e) {
            return NextResponse.json({ message: 'Valid restockDate (e.g., YYYY-MM-DD) is required.' }, { status: 400 });
        }


        const productRef = db.collection('product').doc(productArticleNo);
        const productDoc = await productRef.get();
        if (!productDoc.exists) {
            return NextResponse.json({ message: `Product with ID ${productArticleNo} not found.` }, { status: 404 });
        }
        const productName = productDoc.data()?.articleName || `Product ${productArticleNo}`;

        const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${monthToUpdate}`);

        await db.runTransaction(async (transaction) => {
            // Use the helper to get or create the ledger inside the transaction
            const ledgerData = await getOrCreateLedgerEntry(transaction, productArticleNo, productName, monthToUpdate);

            if (!ledgerData) {
                // This should not happen if getOrCreateLedgerEntry is correct
                throw new Error(`Ledger entry could not be found or created for ${productArticleNo} in ${monthToUpdate}.`);
            }

            // The data returned might not have types, so we cast it.
            const currentData = ledgerData as MonthlyStockLedgerItem;

            const newTotalRestocked = (currentData.totalRestockedThisMonthKg || 0) + quantityKg;
            const newClosingStock = (currentData.openingStockKg || 0) + newTotalRestocked - (currentData.totalSoldThisMonthKg || 0);
            const restockTimestampKey = new Date().toISOString();

            transaction.update(ledgerDocRef, {
                totalRestockedThisMonthKg: newTotalRestocked,
                closingStockKg: newClosingStock,
                [`restockEntriesThisMonth.${restockTimestampKey}`]: {
                    date: restockDate,
                    quantityKg,
                    notes: notes || ''
                },
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        return NextResponse.json({ message: 'Stock added successfully' });
    } catch (error: any) {
        console.error("Error adding stock to ledger:", error);
        return NextResponse.json({ message: error.message || 'Failed to add stock' }, { status: 500 });
    }
}