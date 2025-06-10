// src/app/api/insights/getinsights/dashboard/route.ts

import { db } from '@/lib/firebaseAdmin';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Reference the specific document for sales dashboard insights
        const insightDocRef = db.collection('insights').doc('salesDashboardInsight');
        const docSnap = await insightDocRef.get();

        if (!docSnap.exists) {
            // This is not an error, it just means no insight has been generated yet.
            return NextResponse.json({ message: 'Insight not found' }, { status: 404 });
        }
        
        // Return the full document data, which includes the insight payload and the timestamp
        return NextResponse.json(docSnap.data());

    } catch (error: any) {
        // Log the error with the correct route path for easier debugging
        console.error("[ERROR] in /api/insights/getinsights/dashboard:", error);
        return NextResponse.json({ message: 'Failed to fetch insight.', details: error.message }, { status: 500 });
    }
}