// src/app/api/manager/staff-list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin'; // Assuming firebaseAdmin is initialized here

// Define the structure for a staff member in the list
interface StaffListItem {
    id: string;
    name: string;
    role?: string; // Role might be optional
}

// --- In-memory cache store for the entire staff list ---
let cachedStaffList: StaffListItem[] | null = null;
let staffListCacheTimestamp: number | null = null;
const STAFF_LIST_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in milliseconds

// To ensure Next.js doesn't do its own aggressive caching ON TOP of our manual cache
// for a GET request, we should make this route dynamic. This forces it to
// execute on every request, allowing our manual cache logic to take effect.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // Original log to indicate the API was called, now it also indicates potential cache check
    // console.log("API /api/manager/staff-list called, checking cache..."); // You can refine this log

    const now = Date.now();

    // Check if cache is valid
    if (cachedStaffList && staffListCacheTimestamp && (now - staffListCacheTimestamp < STAFF_LIST_CACHE_TTL_MS)) {
        console.log(`[StaffList] CACHE HIT: Serving ${cachedStaffList.length} staff members from in-memory cache.`);
        return NextResponse.json(cachedStaffList);
    }

    // Cache is invalid or empty, fetch from Firestore
    console.log("[StaffList] CACHE MISS or STALE: In-memory cache for staff list is stale or empty. Fetching from Firestore...");
    try {
        const staffSnapshot = await db.collection('staff').orderBy('name', 'asc').get();

        if (staffSnapshot.empty) {
            console.log("[StaffList] No staff members found in Firestore.");
            // Cache the empty result to avoid repeated DB queries
            cachedStaffList = [];
            staffListCacheTimestamp = now;
            return NextResponse.json([]); // Return empty list as per original logic if empty
        }
        
        const staffList: StaffListItem[] = staffSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name || doc.id, // Fallback to ID if name is missing
                role: data.role, // Role will be undefined if not present, which is fine
            };
        });

        // Update cache
        cachedStaffList = staffList;
        staffListCacheTimestamp = now;
        console.log(`[StaffList] Successfully fetched ${staffList.length} staff members from Firestore and updated in-memory cache for 1 hour.`);
        
        return NextResponse.json(staffList);

    } catch (error: any) { // Keep existing error handling style
        console.error("[StaffList] Error fetching staff list:", error);
        // Do not cache errors
        return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}