// src/app/api/manager/stock-ledger/route.ts
import { db } from '@/lib/firebaseAdmin'; // Adjust path if necessary
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Interface for product list items (matching frontend for clarity)
interface ProductListItem {
    id: string; // This is productArticleNo
    name: string;
    articleNumber: string; 
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
    lastUpdated: admin.firestore.Timestamp; // Firestore Timestamp for backend
}


async function getOrCreateLedgerEntry(
    dbOrTransaction: FirebaseFirestore.Firestore | admin.firestore.Transaction,
    productArticleNo: string,
    productName: string, 
    currentMonthYYYYMM: string
): Promise<FirebaseFirestore.DocumentData | null> { 
    const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${currentMonthYYYYMM}`);
    
    const getOperation = (ref: FirebaseFirestore.DocumentReference) => 
        dbOrTransaction instanceof admin.firestore.Transaction 
            ? (dbOrTransaction as admin.firestore.Transaction).get(ref) 
            : ref.get();

    let ledgerDocSnap = await getOperation(ledgerDocRef);

    if (!ledgerDocSnap.exists) {
        const [year, monthNum] = currentMonthYYYYMM.split('-').map(Number);
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
            productName, 
            month: currentMonthYYYYMM,
            year: currentMonthYYYYMM.split('-')[0],
            openingStockKg,
            totalRestockedThisMonthKg: 0,
            restockEntriesThisMonth: {},
            totalSoldThisMonthKg: 0,
            closingStockKg: openingStockKg,
            lastSalesSyncDateForMonth: null,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp
        };

        if (dbOrTransaction instanceof admin.firestore.Transaction) {
            (dbOrTransaction as admin.firestore.Transaction).set(ledgerDocRef, initialData);
        } else {
            await ledgerDocRef.set(initialData);
        }
        // After setting, re-fetch the snapshot if we want to return consistent DocumentData with a server timestamp resolved
        // Or just return initialData. For simplicity here, return initialData. If serverTimestamp needs to be resolved before returning,
        // then another get would be needed if not in a transaction or if the transaction commit is not awaited here.
        // However, the frontend interface has `lastUpdated: string`, so initialData with a placeholder or `new Date().toISOString()` might be okay,
        // or let the first fetch after creation show the resolved server timestamp.
        // The original code returned `initialData` in this path.
        return initialData; 
    }
    return ledgerDocSnap.data() || null; 
}


export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const month = searchParams.get('month');
        // const limit = parseInt(searchParams.get('limit') || '30', 10); // Removed
        // const startAfterProductNo = searchParams.get('startAfterProductNo'); // Removed

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ message: 'Valid month (YYYY-MM) is required.' }, { status: 400 });
        }

        // 1. Fetch all product definitions, ordered by productArticleNo
        const productsSnapshot = await db.collection('product').orderBy(admin.firestore.FieldPath.documentId()).get();

        const allProductDefs: ProductListItem[] = productsSnapshot.docs.map(doc => ({
            id: doc.id, 
            name: doc.data().articleName || `Product ${doc.id}`, 
            articleNumber: doc.data().articleNumber || doc.id, 
        }));
        
        // Fetch ledger entry for ALL products
        const itemsPromises = allProductDefs.map(async (product) => {
            const ledgerData = await getOrCreateLedgerEntry(db, product.id, product.name, month);
            // Ensure lastUpdated is a string for the frontend
            if (ledgerData && ledgerData.lastUpdated && typeof ledgerData.lastUpdated.toDate === 'function') {
                ledgerData.lastUpdated = ledgerData.lastUpdated.toDate().toISOString();
            } else if (ledgerData && !ledgerData.lastUpdated) { // if initialData was returned from getOrCreate
                 ledgerData.lastUpdated = new Date().toISOString(); // placeholder if serverTimestamp not resolved
            }
            return ledgerData;
        });

        const resolvedItems = (await Promise.all(itemsPromises))
            .filter(item => item !== null) as MonthlyStockLedgerItem[];
        
        // Ensure items are sorted by productArticleNo (should be, but explicit sort is safer)
        resolvedItems.sort((a, b) => a.productArticleNo.localeCompare(b.productArticleNo));
        
        return NextResponse.json({ items: resolvedItems });

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
            new Date(restockDate).toISOString(); 
        } catch (e) {
            return NextResponse.json({ message: 'Valid restockDate (YYYY-MM-DD) is required.' }, { status: 400 });
        }


        const productRef = db.collection('product').doc(productArticleNo);
        const productDoc = await productRef.get();
        if (!productDoc.exists) {
            return NextResponse.json({ message: `Product with ID ${productArticleNo} not found.` }, { status: 404 });
        }
        const productName = productDoc.data()?.articleName || `Product ${productArticleNo}`; 

        const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${monthToUpdate}`);

        await db.runTransaction(async (transaction) => {
            const ledgerData = await getOrCreateLedgerEntry(transaction, productArticleNo, productName, monthToUpdate);
            
            if (!ledgerData) {
                throw new Error(`Ledger entry could not be found or created for ${productArticleNo} in ${monthToUpdate}.`);
            }
            
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
        const message = error.message || 'Failed to add stock';
        // Determine status code based on error if possible, otherwise default to 500
        const status = error.code === 'NOT_FOUND' ? 404 : (error.status || 500); // Example
        return NextResponse.json({ message }, { status });
    }
}