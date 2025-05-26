// src/app/api/auth/vendor-login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { staffId, password } = await req.json();

    if (!staffId || !password) {
      return NextResponse.json({ message: 'Staff ID and password are required.' }, { status: 400 });
    }

    const staffRef = db.collection('staff').doc(String(staffId));
    const staffDoc = await staffRef.get();

    if (!staffDoc.exists) {
      return NextResponse.json({ message: 'Invalid Staff ID or password.' }, { status: 401 }); // Generic message
    }

    const staffData = staffDoc.data();

    // Direct password comparison (as requested, no hashing)
    if (staffData?.password !== password) {
      return NextResponse.json({ message: 'Invalid Staff ID or password.' }, { status: 401 });
    }

    if (staffData?.role !== 'vendor' && staffData?.role !== 'manager') { // Allow manager to login via vendor route if needed or restrict
        return NextResponse.json({ message: 'Access denied for this role.' }, { status: 403 });
    }

    // Don't send password back to client
    const { password: _, ...userDataToSend } = staffData;

    return NextResponse.json({
      message: 'Login successful',
      user: {
        id: staffDoc.id, // This is the staffId
        name: userDataToSend.name,
        role: userDataToSend.role,
      }
    });

  } catch (error) {
    console.error('Error in vendor login:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
//Note: You might want separate login routes for vendor and manager if their logic or returned data differs significantly, or if managers shouldn't be able to log in via the vendor endpoint. For now, this allows both if they exist in the staff collection. You can restrict staffData?.role !== 'vendor' if needed.
