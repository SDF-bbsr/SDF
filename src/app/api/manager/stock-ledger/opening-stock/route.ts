// /api/manager/stock-ledger/opening-stock/route.ts
import { db } from '@/lib/firebaseAdmin';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

export async function PUT(req: NextRequest) {
    try {
        const { productArticleNo, monthToUpdate, newOpeningStockKg } = await req.json();

        if (!productArticleNo || !monthToUpdate || typeof newOpeningStockKg !== 'number') {
            return NextResponse.json({ message: 'Missing required fields or invalid opening stock value.' }, { status: 400 });
        }

        const ledgerDocRef = db.collection('monthlyProductStockLedger').doc(`${productArticleNo}_${monthToUpdate}`);

        await db.runTransaction(async (transaction) => {
            const ledgerDoc = await transaction.get(ledgerDocRef);
            if (!ledgerDoc.exists) {
                // Optionally, you could call getOrCreateLedgerEntry here if you want to allow editing opening stock for a non-existent month entry.
                // For now, let's assume it must exist if they are editing.
                throw new Error(`Ledger entry for ${productArticleNo} in ${monthToUpdate} not found.`);
            }
            const data = ledgerDoc.data()!;
            const newClosingStock = newOpeningStockKg + (data.totalRestockedThisMonthKg || 0) - (data.totalSoldThisMonthKg || 0);

            transaction.update(ledgerDocRef, {
                openingStockKg: newOpeningStockKg,
                closingStockKg: newClosingStock,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return NextResponse.json({ message: 'Opening stock updated successfully.' });
    } catch (error: any) {
        console.error("Error updating opening stock:", error);
        return NextResponse.json({ message: error.message || 'Failed to update opening stock' }, { status: 500 });
    }
}