// src/app/api/sales/record/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin'; // Import the full admin namespace for FieldValue

export async function POST(req: NextRequest) {
  try {
    // MODIFIED: Destructure all incoming fields, including prefixed product details
    const {
      barcodeScanned,
      articleNo, // This is the main identifier for the product in this transaction (value from product.articleNumber)
      weightGrams,
      calculatedSellPrice,
      staffId,
      // Prefixed product fields
      product_articleNumber,
      product_articleName,
      product_posDescription,
      product_metlerCode,
      product_hsnCode,
      product_taxPercentage,
      product_purchasePricePerKg,
      product_sellingRatePerKg,
      product_mrpPer100g,
      product_remark,
    } = await req.json();

    // Basic validation for core sale data
    if (!articleNo || typeof weightGrams !== 'number' || typeof calculatedSellPrice !== 'number' || !staffId) {
      return NextResponse.json({ message: 'Missing required sale data (articleNo, weight, price, staffId).' }, { status: 400 });
    }
    // Optional: Add validation for essential product fields if necessary (e.g., product_articleName)
    if (!product_articleName || !product_articleNumber) {
         return NextResponse.json({ message: 'Missing core product details (name, number).' }, { status: 400 });
    }


    // MODIFIED: Construct saleData with all core transaction fields AND prefixed product fields
    const saleData = {
      // Core transaction fields
      articleNo: String(articleNo), // This should be the product's unique identifier (articleNumber)
      barcodeScanned: barcodeScanned || null,
      weightGrams,
      calculatedSellPrice,
      staffId,
      status: "SOLD", // Default status for a new sale
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      dateOfSale: new Date().toISOString().split('T')[0], // YYYY-MM-DD

      // Denormalized (prefixed) product fields from the request
      product_articleNumber: String(product_articleNumber),
      product_articleName: product_articleName,
      product_posDescription: product_posDescription,
      product_metlerCode: product_metlerCode,
      product_hsnCode: product_hsnCode,
      product_taxPercentage: product_taxPercentage,           // Stored as number
      product_purchasePricePerKg: product_purchasePricePerKg, // Stored as number
      product_sellingRatePerKg: product_sellingRatePerKg,     // Stored as number
      product_mrpPer100g: product_mrpPer100g,                 // Stored as number
      product_remark: product_remark !== undefined ? product_remark : null,
    };

    const salesCollectionRef = db.collection('salesTransactions');
    const docRef = await salesCollectionRef.add(saleData);

    return NextResponse.json({ message: 'Sale recorded successfully', saleId: docRef.id, data: saleData });

  } catch (error){
    console.error('Error recording sale:', error);
    // Check if error is a known type with a message property
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}