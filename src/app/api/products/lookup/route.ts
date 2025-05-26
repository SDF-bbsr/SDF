// src/app/api/products/lookup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin'; // Ensure this path is correct

// This interface should ideally be shared or match the one in VendorScanPage
interface ProductDetailsFromDB {
  articleNumber: string;
  articleName: string;
  posDescription: string;
  metlerCode: string;
  hsnCode: string;
  taxPercentage: number; // Changed to number
  purchasePricePerKg: number; // Changed to number
  sellingRatePerKg: number; // Changed to number
  mrpPer100g: number; // Changed to number
  remark?: string;
}


// This is the structure the frontend expects (matches ScannedItemDetails)
interface LookupResponse {
  articleNumber: string;
  articleName: string;
  posDescription: string;
  metlerCode: string;
  hsnCode: string;
  taxPercentage: number; // Changed to number
  purchasePricePerKg: number; // Changed to number
  sellingRatePerKg: number; // Changed to number
  mrpPer100g: number; // Changed to number
  remark?: string | null;

  weightGrams: number;
  calculatedSellPrice: number;
}


export async function POST(req: NextRequest) {
  try {
    const { articleNo, weightGrams } = await req.json();

    if (!articleNo || typeof articleNo !== 'string' || articleNo.trim() === "") {
      return NextResponse.json({ message: 'Valid article number is required.' }, { status: 400 });
    }
    if (typeof weightGrams !== 'number' || weightGrams <= 0) {
      return NextResponse.json({ message: 'Valid weight (grams) is required and must be positive.' }, { status: 400 });
    }

    const productRef = db.collection('product').doc(String(articleNo)); // Assuming 'product' is the collection name
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return NextResponse.json({ message: `Product with article number ${articleNo} not found.` }, { status: 404 });
    }

    const productData = productDoc.data() as ProductDetailsFromDB;

    if (!productData) {
        return NextResponse.json({ message: 'Product data is missing or malformed.' }, { status: 500 });
    }

    // Validate essential fields from productData
    if (typeof productData.articleName !== 'string' || productData.articleName.trim() === "") {
        return NextResponse.json({ message: 'Product data is incomplete: missing or invalid articleName.' }, { status: 500 });
    }
    if (typeof productData.sellingRatePerKg !== 'number' || productData.sellingRatePerKg < 0) { // Changed to number check
      return NextResponse.json({ message: 'Product data is invalid: sellingRatePerKg must be a non-negative number.' }, { status: 500 });
    }

    const calculatedSellPrice = parseFloat(((weightGrams / 1000) * productData.sellingRatePerKg).toFixed(2));

    // Construct the response according to the LookupResponse (ScannedItemDetails) interface
    const responsePayload: LookupResponse = {
      articleNumber: String(articleNo),
      articleName: productData.articleName,
      posDescription: productData.posDescription || "",
      metlerCode: productData.metlerCode || "",
      hsnCode: productData.hsnCode || "",
      taxPercentage: productData.taxPercentage, // Now a number
      purchasePricePerKg: productData.purchasePricePerKg, // Now a number
      sellingRatePerKg: productData.sellingRatePerKg, // Now a number
      mrpPer100g: productData.mrpPer100g, // Now a number
      remark: productData.remark || null,

      weightGrams: weightGrams,
      calculatedSellPrice: calculatedSellPrice,
    };

    return NextResponse.json(responsePayload);

  } catch (error) {
    console.error('Error in product lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ message: 'Internal Server Error', error: errorMessage }, { status: 500 });
  }
}