// src/app/api/manager/stock-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

interface StockStatusItem {
  articleNo: string;
  articleName?: string;
  openingStockKg: number;
  openingStockDate?: string;
  totalSoldKg: number;
  totalReturnedKg: number;
  calculatedCurrentStockKg: number;
}

export async function GET(req: NextRequest) {
  console.log("API /api/manager/stock-status called");
  try {
    // 1. Fetch all products
    const productsSnapshot = await db.collection('product').get(); // Your collection is 'product'
    if (productsSnapshot.empty) {
      return NextResponse.json([]);
    }
    const products = productsSnapshot.docs.map(doc => ({
      id: doc.id, // articleNo
      name: doc.data().articleName || doc.id, // Assuming 'articleName' field
    }));

    const stockStatusItems: StockStatusItem[] = [];

    // For each product, calculate stock
    for (const product of products) {
      const articleNo = product.id;

      // 2. Get latest opening/received stock for this product
      // We consider "OPENING_STOCK" or "STOCK_RECEIVED" as base stock events
      const stockEventsSnapshot = await db.collection('stockEvents')
        .where('articleNo', '==', articleNo)
        .where('type', 'in', ['OPENING_STOCK', 'STOCK_RECEIVED']) // Add other relevant types
        .orderBy('eventDate', 'desc') // Get the latest by eventDate
        .orderBy('createdAt', 'desc') // Then by creation time as a tie-breaker
        .limit(1)
        .get();

      let openingStockKg = 0;
      let openingStockDate;
      if (!stockEventsSnapshot.empty) {
        const latestStockEvent = stockEventsSnapshot.docs[0].data();
        openingStockKg = latestStockEvent.quantityKg || 0;
        openingStockDate = latestStockEvent.eventDate;
      }

      // 3. Aggregate total SOLD quantity for this product
      // This query needs an index: articleNo (ASC), status (ASC)
      const soldSnapshot = await db.collection('salesTransactions')
        .where('articleNo', '==', articleNo)
        .where('status', '==', 'SOLD')
        .get();
      
      let totalSoldGrams = 0;
      soldSnapshot.forEach(doc => {
        totalSoldGrams += doc.data().weightGrams || 0;
      });
      const totalSoldKg = parseFloat((totalSoldGrams / 1000).toFixed(3));

      // 4. Aggregate total RETURNED_PRE_BILLING quantity for this product
      // This query needs an index: articleNo (ASC), status (ASC)
      const returnedSnapshot = await db.collection('salesTransactions')
        .where('articleNo', '==', articleNo)
        .where('status', '==', 'RETURNED_PRE_BILLING')
        .get();

      let totalReturnedGrams = 0;
      returnedSnapshot.forEach(doc => {
        totalReturnedGrams += doc.data().weightGrams || 0;
      });
      const totalReturnedKg = parseFloat((totalReturnedGrams / 1000).toFixed(3));

      // 5. Calculate current stock
      const calculatedCurrentStockKg = parseFloat(
        (openingStockKg - totalSoldKg + totalReturnedKg).toFixed(3)
      );

      stockStatusItems.push({
        articleNo,
        articleName: product.name,
        openingStockKg,
        openingStockDate,
        totalSoldKg,
        totalReturnedKg,
        calculatedCurrentStockKg,
      });
    }

    // Sort by article name or number
    stockStatusItems.sort((a, b) => (a.articleName || a.articleNo).localeCompare(b.articleName || b.articleNo));

    return NextResponse.json(stockStatusItems);

  } catch (error: any) {
    console.error("Error in /api/manager/stock-status:", error);
    if (error.code === 9 || error.code === 'failed-precondition') {
        console.error("Potential Firestore Index issue for stock status. Error details:", error.details);
        return NextResponse.json({ message: 'Internal Server Error - Possible Firestore Index missing. Check server logs.', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}