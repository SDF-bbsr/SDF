// src/app/api/manager/item-performance-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin'; // Keep for FieldPath if needed, but not for this specific change

interface ItemPerformance {
  articleNo: string;
  articleName?: string; // Populated from salesTransaction directly
  totalWeightSoldGrams: number;
  totalValueSold: number;
  totalPackets: number;
}

interface ProductInfo { // For items from the master product list (e.g., zero sales)
  articleNo: string;
  articleName?: string;
}

interface FullItemPerformanceResponse {
  soldItemsPerformance: ItemPerformance[];
  grandTotals: {
    totalValueSold: number;
    totalWeightSoldGrams: number;
  };
  zeroSalesItems: ProductInfo[];
}

export async function GET(req: NextRequest) {
  console.log("API /api/manager/item-performance-data called");
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD
    const endDate = searchParams.get('endDate');     // YYYY-MM-DD

    if (!startDate || !endDate) {
      return NextResponse.json({ message: 'Start date and end date are required.' }, { status: 400 });
    }
    console.log(`Fetching item performance from: ${startDate}, to: ${endDate}`);

    // 1. Fetch and Aggregate Sales Data
    const salesQuery = db.collection('salesTransactions')
      .where('status', '==', 'SOLD')
      .where('dateOfSale', '>=', startDate)
      .where('dateOfSale', '<=', endDate);

    const salesSnapshot = await salesQuery.get();
    console.log(`Query completed, fetched ${salesSnapshot.docs.length} sales documents.`);

    const itemPerformanceMap: { [articleNo: string]: ItemPerformance } = {};
    let grandTotalValueSold = 0;
    let grandTotalWeightSoldGrams = 0;

    salesSnapshot.forEach(doc => {
      const data = doc.data();
      const articleNo = data.articleNo as string; // or data.product_articleNumber
      const articleNameFromTransaction = data.product_articleName as string; // Key change here
      const weightGrams = data.weightGrams || 0;
      const sellPrice = data.calculatedSellPrice || 0;

      if (!itemPerformanceMap[articleNo]) {
        itemPerformanceMap[articleNo] = {
          articleNo,
          articleName: articleNameFromTransaction || articleNo, // Use name from transaction, fallback to articleNo
          totalWeightSoldGrams: 0,
          totalValueSold: 0,
          totalPackets: 0,
        };
      }
      itemPerformanceMap[articleNo].totalWeightSoldGrams += weightGrams;
      itemPerformanceMap[articleNo].totalValueSold += sellPrice;
      itemPerformanceMap[articleNo].totalPackets += 1;

      grandTotalValueSold += sellPrice;
      grandTotalWeightSoldGrams += weightGrams;
    });

    let soldItemsPerformance = Object.values(itemPerformanceMap);
    
    // No longer need to fetch product names for SOLD items separately
    // The articleName is already populated from the salesTransaction

    soldItemsPerformance.sort((a, b) => b.totalValueSold - a.totalValueSold);

    // 2. Fetch All Products and Identify Zero Sales Items
    // This part still needs to query your master 'product' collection
    const allProductsSnapshot = await db.collection('product').get();
    const zeroSalesItems: ProductInfo[] = [];
    
    allProductsSnapshot.forEach(doc => {
        const productData = doc.data();
        // Assuming the document ID of your 'product' collection is the articleNo
        const productArticleNo = doc.id; 
        
        // And your 'product' collection has an 'articleName' field
        const masterProductArticleName = productData.articleName as string; 

        if (!itemPerformanceMap[productArticleNo]) { // If not found in sold items map for the period
            zeroSalesItems.push({
                articleNo: productArticleNo,
                articleName: masterProductArticleName || productArticleNo, // Fallback to articleNo if name is missing
            });
        }
    });
    zeroSalesItems.sort((a,b) => (a.articleName || a.articleNo).localeCompare(b.articleName || b.articleNo));


    const responseData: FullItemPerformanceResponse = {
      soldItemsPerformance,
      grandTotals: {
        totalValueSold: parseFloat(grandTotalValueSold.toFixed(2)),
        totalWeightSoldGrams: parseFloat(grandTotalWeightSoldGrams.toFixed(3)), // Or just keep as number
      },
      zeroSalesItems,
    };

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error("Error in /api/manager/item-performance-data:", error);
    if (error.code === 9 || error.code === 'failed-precondition' || (error.message && error.message.toLowerCase().includes('index'))) {
        console.error("Potential Firestore Index issue for item performance. Error details:", error.details);
        return NextResponse.json({ message: 'Internal Server Error - Possible Firestore Index missing. Check server logs for a link to create it.', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}