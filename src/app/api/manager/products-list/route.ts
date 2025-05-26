// src/app/api/manager/products-list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
    try {
        const productsSnapshot = await db.collection('product').orderBy('articleName', 'asc').get();
        const products = productsSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().articleName || doc.id,
        }));
        return NextResponse.json(products);
    } catch (error) {
        console.error("Error fetching product list:", error);
        return NextResponse.json({ message: "Failed to fetch products"}, { status: 500 });
    }
}