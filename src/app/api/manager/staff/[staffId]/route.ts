// src/app/api/manager/staff/[staffId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

interface StaffUpdateData {
  name?: string;
  role?: 'vendor' | 'manager';
  password?: string; // For password reset
}

// PUT - Update staff
export async function PUT(req: NextRequest, { params }: { params: { staffId: string } }) {
  const staffId = params.staffId;
  try {
    const body = await req.json() as StaffUpdateData;
    if (!staffId) return NextResponse.json({ message: 'Staff ID required' }, { status: 400 });
    if (Object.keys(body).length === 0) return NextResponse.json({ message: 'No update data' }, { status: 400 });
    if (body.role && body.role !== 'vendor' && body.role !== 'manager') {
        return NextResponse.json({ message: 'Invalid role' }, { status: 400 });
    }


    const staffRef = db.collection('staff').doc(staffId);
    const doc = await staffRef.get();
    if (!doc.exists) return NextResponse.json({ message: 'Staff not found' }, { status: 404 });

    const updateData: any = { ...body };
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await staffRef.update(updateData);
    return NextResponse.json({ message: 'Staff updated successfully' });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to update staff', details: error.message }, { status: 500 });
  }
}

// DELETE - Delete staff
export async function DELETE(req: NextRequest, { params }: { params: { staffId: string } }) {
  const staffId = params.staffId;
  try {
    if (!staffId) return NextResponse.json({ message: 'Staff ID required' }, { status: 400 });

    const staffRef = db.collection('staff').doc(staffId);
    const doc = await staffRef.get();
    if (!doc.exists) return NextResponse.json({ message: 'Staff not found' }, { status: 404 });
    
    // Consider implications: what if this staff has salesTransactions?
    // For now, direct delete.
    await staffRef.delete();
    return NextResponse.json({ message: 'Staff deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to delete staff', details: error.message }, { status: 500 });
  }
}