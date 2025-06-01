// src/app/api/manager/products-list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin'; // Assuming firebaseAdmin is initialized here

// Define the structure for a product in the list
interface ProductListItem {
    id: string;
    name: string;
}

// --- In-memory cache store for the entire products list ---
// This cache is per instance of your server.
// In a serverless environment, each invocation might be a new instance,
// making this less effective for long TTLs compared to Next.js's `revalidate` feature,
// but it will work if the same instance serves multiple requests within the TTL.
let cachedProductsList: ProductListItem[] | null = null;
let productsListCacheTimestamp: number | null = null;
const PRODUCTS_LIST_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in milliseconds

// To ensure Next.js doesn't do its own aggressive caching ON TOP of our manual cache
// for a GET request, we should make this route dynamic. This forces it to
// execute on every request, allowing our manual cache logic to take effect.
// If we didn't do this, Next.js might cache the first response (e.g., an empty cache
// response or the first fetched response) and serve it repeatedly, bypassing our logic.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const now = Date.now();

    // Check if cache is valid
    if (cachedProductsList && productsListCacheTimestamp && (now - productsListCacheTimestamp < PRODUCTS_LIST_CACHE_TTL_MS)) {
        console.log(`[ProductsList] CACHE HIT: Serving ${cachedProductsList.length} products from in-memory cache.`);
        return NextResponse.json(cachedProductsList);
    }

    // Cache is invalid or empty, fetch from Firestore
    console.log("[ProductsList] CACHE MISS or STALE: In-memory cache for product list is stale or empty. Fetching from Firestore...");
    try {
        const productsSnapshot = await db.collection('product').orderBy('articleName', 'asc').get();

        if (productsSnapshot.empty) {
            console.log("[ProductsList] No products found in Firestore.");
            // Cache the empty result to avoid repeated DB queries if the list is indeed empty
            cachedProductsList = [];
            productsListCacheTimestamp = now;
            return NextResponse.json([]);
        }

        const products: ProductListItem[] = productsSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().articleName || doc.id, // Good fallback
        }));

        // Update cache
        cachedProductsList = products;
        productsListCacheTimestamp = now;
        console.log(`[ProductsList] Successfully fetched ${products.length} products from Firestore and updated in-memory cache for 1 hour.`);
        return NextResponse.json(products);

    } catch (error) {
        console.error("[ProductsList] Error fetching product list:", error);
        // Do not cache errors, or cache them with a very short TTL if necessary for specific scenarios
        return NextResponse.json({ message: "Failed to fetch products"}, { status: 500 });
    }
}