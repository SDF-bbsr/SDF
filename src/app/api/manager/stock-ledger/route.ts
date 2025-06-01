// src/app/api/manager/stock-ledger/route.ts
import { db } from '@/lib/firebaseAdmin'; // Adjust path if necessary
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Interface for product list items (matching frontend for clarity)
interface ProductListItem {
    id: string; // This is productArticleNo
    name: string;
    articleNumber: string; // Redundant if id is always articleNo, but good for clarity
}

// Interface for ledger items (matching frontend)
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
    lastUpdated: admin.firestore.Timestamp;
}


async function getOrCreateLedgerEntry(
    dbOrTransaction: FirebaseFirestore.Firestore | admin.firestore.Transaction,
    productArticleNo: string,
    productName: string, // Product name passed in
    currentMonthYYYYMM: string
): Promise<FirebaseFirestore.DocumentData | null> { // Returns DocumentData or null
    const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${currentMonthYYYYMM}`);
    
    // Perform the read using the transaction if provided, otherwise direct DB read
    const getOperation = (ref: FirebaseFirestore.DocumentReference) => 
        dbOrTransaction instanceof admin.firestore.Transaction 
            ? (dbOrTransaction as admin.firestore.Transaction).get(ref) 
            : ref.get();

    let ledgerDocSnap = await getOperation(ledgerDocRef);

    if (!ledgerDocSnap.exists) {
        const [year, monthNum] = currentMonthYYYYMM.split('-').map(Number);
        // For previous month: monthNum is 1-indexed. new Date's month is 0-indexed.
        // So, for month `monthNum`, its 0-indexed version is `monthNum - 1`.
        // Previous month is `monthNum - 1 - 1 = monthNum - 2`.
        const prevMonthDate = new Date(year, monthNum - 2, 1);
        const prevMonthYYYYMM = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        
        let openingStockKg = 0;
        const prevLedgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${prevMonthYYYYMM}`);
        const prevLedgerDocSnap = await getOperation(prevLedgerDocRef);

        if (prevLedgerDocSnap.exists) {
            openingStockKg = prevLedgerDocSnap.data()?.closingStockKg || 0;
        }

        const initialData: MonthlyStockLedgerItem = {
            productArticleNo,
            productName, // Use the passed productName
            month: currentMonthYYYYMM,
            year: currentMonthYYYYMM.split('-')[0],
            openingStockKg,
            totalRestockedThisMonthKg: 0,
            restockEntriesThisMonth: {},
            totalSoldThisMonthKg: 0,
            closingStockKg: openingStockKg,
            lastSalesSyncDateForMonth: null,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp // Cast for type correctness
        };

        if (dbOrTransaction instanceof admin.firestore.Transaction) {
            (dbOrTransaction as admin.firestore.Transaction).set(ledgerDocRef, initialData);
        } else {
            await ledgerDocRef.set(initialData);
        }
        return initialData; // Return the data that was set
    }
    return ledgerDocSnap.data() || null; // Return existing data
}


export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const month = searchParams.get('month');
        const limit = parseInt(searchParams.get('limit') || '30', 10);
        const startAfterProductNo = searchParams.get('startAfterProductNo');

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ message: 'Valid month (YYYY-MM) is required.' }, { status: 400 });
        }

        // 1. Fetch all product definitions, ordered by productArticleNo for consistent pagination
        const productsSnapshot = await db.collection('product').orderBy(admin.firestore.FieldPath.documentId()).get(); // Order by document ID (articleNo)

        const allProductDefs: ProductListItem[] = productsSnapshot.docs.map(doc => ({
            id: doc.id, // document ID is productArticleNo
            name: doc.data().articleName || `Product ${doc.id}`, // Fallback name
            articleNumber: doc.data().articleNumber || doc.id, // Ensure articleNumber is present
        }));

        let productIndexToStartFrom = 0;
        if (startAfterProductNo) {
            const foundIndex = allProductDefs.findIndex(p => p.id === startAfterProductNo);
            if (foundIndex !== -1) {
                productIndexToStartFrom = foundIndex + 1; // Start from the item *after* the cursor
            } else {
                // If startAfterProductNo is not found, it might mean it was deleted or an invalid cursor.
                // Depending on desired behavior, could return empty or error.
                // For now, if not found, effectively means starting from the beginning of what's left or an invalid cursor
                // If we return empty here, it might stop pagination prematurely if the cursor item was deleted.
                // A safer bet if the cursor is not found (and it's not the first page) is to indicate an issue or re-fetch from page 1.
                // However, for simplicity of this merge, we'll assume valid cursors or treat not found as "no more items from this point".
                // If you always want to return items if available, even if cursor is bad, don't set index high.
                // productIndexToStartFrom = allProductDefs.length; // Effectively no items
            }
        }
        
        const productsForPage = allProductDefs.slice(productIndexToStartFrom, productIndexToStartFrom + limit);
        
        const itemsPromises = productsForPage.map(async (product) => {
            // Use db directly for getOrCreate in GET, as it's not part of a larger write transaction for this specific item
            const ledgerData = await getOrCreateLedgerEntry(db, product.id, product.name, month);
            return ledgerData; // This will be the document data or the initial data if created
        });

        // Filter out nulls in case getOrCreateLedgerEntry could return null and we don't want to send them
        const resolvedItems = (await Promise.all(itemsPromises)).filter(item => item !== null) as MonthlyStockLedgerItem[];
        
        let newLastDocProductNo: string | null = null;
        let hasMore = false;

        if (resolvedItems.length > 0) {
            newLastDocProductNo = resolvedItems[resolvedItems.length - 1].productArticleNo;
            // Check if there are more products in the *original full list* after the current page
            if (productIndexToStartFrom + resolvedItems.length < allProductDefs.length) {
                hasMore = true;
            }
        } else if (startAfterProductNo && productsForPage.length === 0 && productIndexToStartFrom < allProductDefs.length) {
            // This case implies startAfterProductNo was valid, but the slice yielded no items (e.g. end of list for that cursor)
            // but there might still be other items in allProductDefs if the cursor was somewhere in the middle and limit was small.
            // The hasMore logic above should handle this. The key is `productIndexToStartFrom + resolvedItems.length < allProductDefs.length`
        }
        
        return NextResponse.json({ items: resolvedItems, newLastDocProductNo, hasMore });

    } catch (error: any) {
        console.error("Error in GET /api/manager/stock-ledger:", error);
        return NextResponse.json({ message: 'Failed to fetch stock ledger data.', details: error.message }, { status: 500 });
    }
}

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
            new Date(restockDate).toISOString(); // Validate date format
        } catch (e) {
            return NextResponse.json({ message: 'Valid restockDate (YYYY-MM-DD) is required.' }, { status: 400 });
        }


        const productRef = db.collection('product').doc(productArticleNo);
        const productDoc = await productRef.get();
        if (!productDoc.exists) {
            return NextResponse.json({ message: `Product with ID ${productArticleNo} not found.` }, { status: 404 });
        }
        const productName = productDoc.data()?.articleName || `Product ${productArticleNo}`; // Get productName

        const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${monthToUpdate}`);

        await db.runTransaction(async (transaction) => {
            // getOrCreateLedgerEntry will ensure the entry exists, using the transaction.
            // It returns the data of the entry (either existing or newly created).
            const ledgerData = await getOrCreateLedgerEntry(transaction, productArticleNo, productName, monthToUpdate);
            
            if (!ledgerData) {
                // This case should ideally not be reached if getOrCreateLedgerEntry works as expected
                // (i.e., it creates if not exists, or product itself doesn't exist which is checked before)
                throw new Error(`Ledger entry could not be found or created for ${productArticleNo} in ${monthToUpdate}.`);
            }
            
            // ledgerData is now the current state of the document data
            const currentData = ledgerData as MonthlyStockLedgerItem; // Cast for type safety
            
            const newTotalRestocked = (currentData.totalRestockedThisMonthKg || 0) + quantityKg;
            const newClosingStock = (currentData.openingStockKg || 0) + newTotalRestocked - (currentData.totalSoldThisMonthKg || 0);
            const restockTimestampKey = new Date().toISOString(); // Unique key for the restock entry

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
        const message = error.message || 'Failed to add stock';
        // Determine status code based on error if possible, otherwise default to 500
        const status = error.code === 'NOT_FOUND' ? 404 : (error.status || 500); // Example
        return NextResponse.json({ message }, { status });
    }
}