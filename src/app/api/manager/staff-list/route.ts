// src/app/api/manager/staff-list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
    console.log("API /api/manager/staff-list called");
    try {
        const staffSnapshot = await db.collection('staff').orderBy('name', 'asc').get();
        
        const staffList = staffSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || doc.id, // Fallback to ID if name is missing
            role: doc.data().role,
        }));

        return NextResponse.json(staffList);

    } catch (error: any) {
        console.error("Error fetching staff list:", error);
        return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}