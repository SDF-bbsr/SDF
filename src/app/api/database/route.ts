// src/app/api/database/route.ts

import { db } from '@/lib/firebaseAdmin';
import { NextRequest, NextResponse } from 'next/server';

// Define a type for our response structure for better clarity
type CollectionSample = {
    docId: string | null;
    data: any; // Using 'any' as each collection will have a different data structure
};

export async function GET(req: NextRequest) {
    try {
        // --- 1. 
        console.log("[Database Sample] Request received. Fetching samples from all collections...");

        // --- 2. Get a list of all collections ---
        let collectionRefs = await db.listCollections();

        // Filter out specific collections
        collectionRefs = collectionRefs.filter(ref => ref.id !== 'insights' && ref.id !== 'telegramBotSubscriptions');
        
        // This will hold our final structured response
        const databaseSample: { [collectionName: string]: CollectionSample } = {};

        // --- 3. Iterate over each collection and fetch one document ---
        for (const collectionRef of collectionRefs) {
            const collectionId = collectionRef.id;

            // Fetch just one document from the current collection
            const snapshot = await collectionRef.limit(1).get();

            if (snapshot.empty) {
                // Handle case where a collection might be empty
                databaseSample[collectionId] = {
                    docId: null,
                    data: "Collection is empty."
                };
            } else {
                // Get the first (and only) document
                const doc = snapshot.docs[0];
                
                // Add the structured data to our response object
                databaseSample[collectionId] = {
                    docId: doc.id,
                    data: doc.data()
                };
            }
        }
        
        console.log(`[Database Sample] Successfully sampled ${collectionRefs.length} collections.`);

        // --- 4. Return the complete database sample ---
        return NextResponse.json(databaseSample);

    } catch (error: any) {
        console.error("[ERROR] in /api/database/route.ts:", error);
        return NextResponse.json({ message: 'Failed to fetch database sample.', details: error.message }, { status: 500 });
    }
}