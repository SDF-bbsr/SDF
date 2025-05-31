// src/app/api/products/lookup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

interface ProductDetailsFromDB {
  articleNumber: string;
  articleName: string;
  posDescription: string;
  metlerCode: string;
  hsnCode: string;
  taxPercentage: number;
  purchasePricePerKg: number;
  sellingRatePerKg: number;
  mrpPer100g: number;
  remark?: string;
}

interface LookupResponse {
  articleNumber: string;
  articleName: string;
  posDescription: string;
  metlerCode: string;
  hsnCode: string;
  taxPercentage: number;
  purchasePricePerKg: number;
  sellingRatePerKg: number;
  mrpPer100g: number;
  remark?: string | null;
  weightGrams: number;
  calculatedSellPrice: number;
}

// Server-side in-memory cache for products
const productCache = new Map<string, { data: ProductDetailsFromDB, timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL for product cache

export async function POST(req: NextRequest) {
  try {
    const { articleNo, weightGrams } = await req.json();

    if (!articleNo || typeof articleNo !== 'string' || articleNo.trim() === "") {
      return NextResponse.json({ message: 'Valid article number is required.' }, { status: 400 });
    }
    if (typeof weightGrams !== 'number' || weightGrams <= 0) {
      return NextResponse.json({ message: 'Valid weight (grams) is required and must be positive.' }, { status: 400 });
    }

    const trimmedArticleNo = String(articleNo).trim();

    // Check cache first
    const cachedEntry = productCache.get(trimmedArticleNo);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)) {
      console.log(`[ProductLookup] Cache HIT for articleNo: ${trimmedArticleNo}`);
      const productData = cachedEntry.data;
      // Essential validations still apply even for cached data
      if (typeof productData.sellingRatePerKg !== 'number' || productData.sellingRatePerKg < 0) {
         return NextResponse.json({ message: 'Cached product data is invalid: sellingRatePerKg missing or invalid.' }, { status: 500 });
      }
      const calculatedSellPrice = parseFloat(((weightGrams / 1000) * productData.sellingRatePerKg).toFixed(2));
      const responsePayload: LookupResponse = { /* ... construct from productData and weightGrams ... */
        articleNumber: trimmedArticleNo,
        articleName: productData.articleName,
        posDescription: productData.posDescription || "",
        metlerCode: productData.metlerCode || "",
        hsnCode: productData.hsnCode || "",
        taxPercentage: productData.taxPercentage,
        purchasePricePerKg: productData.purchasePricePerKg,
        sellingRatePerKg: productData.sellingRatePerKg,
        mrpPer100g: productData.mrpPer100g,
        remark: productData.remark || null,
        weightGrams: weightGrams,
        calculatedSellPrice: calculatedSellPrice,
      };
      return NextResponse.json(responsePayload);
    }

    console.log(`[ProductLookup] Cache MISS or STALE for articleNo: ${trimmedArticleNo}. Fetching from DB.`);
    const productRef = db.collection('product').doc(trimmedArticleNo);
    const productDoc = await productRef.get(); // 1 Firestore Read

    if (!productDoc.exists) {
      return NextResponse.json({ message: `Product with article number ${trimmedArticleNo} not found.` }, { status: 404 });
    }

    const productData = productDoc.data() as ProductDetailsFromDB;

    if (!productData) {
        return NextResponse.json({ message: 'Product data is missing or malformed.' }, { status: 500 });
    }
    if (typeof productData.articleName !== 'string' || productData.articleName.trim() === "") {
        return NextResponse.json({ message: 'Product data is incomplete: missing or invalid articleName.' }, { status: 500 });
    }
    if (typeof productData.sellingRatePerKg !== 'number' || productData.sellingRatePerKg < 0) {
      return NextResponse.json({ message: 'Product data is invalid: sellingRatePerKg must be a non-negative number.' }, { status: 500 });
    }

    // Store in cache
    productCache.set(trimmedArticleNo, { data: productData, timestamp: Date.now() });

    const calculatedSellPrice = parseFloat(((weightGrams / 1000) * productData.sellingRatePerKg).toFixed(2));
    const responsePayload: LookupResponse = {
      articleNumber: trimmedArticleNo,
      articleName: productData.articleName,
      posDescription: productData.posDescription || "",
      metlerCode: productData.metlerCode || "",
      hsnCode: productData.hsnCode || "",
      taxPercentage: productData.taxPercentage,
      purchasePricePerKg: productData.purchasePricePerKg,
      sellingRatePerKg: productData.sellingRatePerKg,
      mrpPer100g: productData.mrpPer100g,
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