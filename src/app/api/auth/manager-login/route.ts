// src/app/api/auth/manager-login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { managerId, password } = await req.json();

    if (!managerId || !password) {
      return NextResponse.json({ message: 'Manager ID and password are required.' }, { status: 400 });
    }

    // We use the same 'staff' collection, but check the 'role'
    const managerRef = db.collection('staff').doc(String(managerId));
    const managerDoc = await managerRef.get();

    if (!managerDoc.exists) {
      return NextResponse.json({ message: 'Invalid Manager ID or password.' }, { status: 401 });
    }

    const managerData = managerDoc.data();

    if (managerData?.password !== password) {
      return NextResponse.json({ message: 'Invalid Manager ID or password.' }, { status: 401 });
    }

    if (managerData?.role !== 'manager') {
      return NextResponse.json({ message: 'Access denied. Not a manager account.' }, { status: 403 });
    }

    // Don't send password back
    const { password: _, ...userDataToSend } = managerData;

    return NextResponse.json({
      message: 'Login successful',
      user: {
        id: managerDoc.id, // This is the managerId
        name: userDataToSend.name,
        role: userDataToSend.role,
      }
    });

  } catch (error) {
    console.error('Error in manager login:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}