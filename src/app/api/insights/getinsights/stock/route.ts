// src/app/api/insights/getinsights/stock/route.ts

import { db } from '@/lib/firebaseAdmin';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const insightDocRef = db.collection('insights').doc('stockRestockInsight');
        const docSnap = await insightDocRef.get();

        if (!docSnap.exists) {
            // This is not an error, it just means no insight has been generated yet.
            return NextResponse.json({ message: 'Insight not found' }, { status: 404 });
        }
        
        // Return the full document data, including the timestamp
        return NextResponse.json(docSnap.data());

    } catch (error: any) {
        console.error("[ERROR] in /api/insights/getinsights/stock:", error);
        return NextResponse.json({ message: 'Failed to fetch insight.', details: error.message }, { status: 500 });
    }
}