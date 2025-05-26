// src/app/api/manager/staff/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

interface StaffData {
  staffIdForDoc?: string; // For doc ID on create
  name: string;
  role: 'vendor' | 'manager';
  password?: string; // Only on create or password reset
}

// GET - List all staff
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includePassword = searchParams.get('includePassword') === 'true';

    const snapshot = await db.collection('staff').orderBy('name', 'asc').get();
    const staffList = snapshot.docs.map(doc => {
        const data = doc.data();
        if (includePassword) {
            // If password is explicitly requested, include it
            return { id: doc.id, ...data };
        } else {
            // Default: Exclude password from list view
            const { password, ...staffMember } = data; 
            return { id: doc.id, ...staffMember };
        }
    });
    return NextResponse.json(staffList);
  } catch (error: any) {
    console.error("Error fetching staff:", error); // Log the full error on the server
    return NextResponse.json({ message: 'Failed to fetch staff', details: error.message }, { status: 500 });
  }
}

// POST - Create new staff
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as StaffData;
    const { staffIdForDoc, name, role, password } = body;

    if (!staffIdForDoc || staffIdForDoc.trim() === '' || !name || !role || !password) {
      return NextResponse.json({ message: 'Staff ID, Name, Role, and Password are required and cannot be empty.' }, { status: 400 });
    }
    if (role !== 'vendor' && role !== 'manager') {
        return NextResponse.json({ message: 'Invalid role. Must be "vendor" or "manager".' }, { status: 400 });
    }

    const staffRef = db.collection('staff').doc(staffIdForDoc.trim());
    const doc = await staffRef.get();
    if (doc.exists) {
      return NextResponse.json({ message: `Staff with ID ${staffIdForDoc.trim()} already exists.` }, { status: 409 });
    }

    // IMPORTANT: Storing passwords in plaintext is a major security risk.
    // In a production environment, hash the password before storing.
    // Example (conceptual, needs bcryptjs or similar library installed):
    // const hashedPassword = await bcrypt.hash(password, 10);
    // password: hashedPassword,

    await staffRef.set({
      name: name.trim(),
      role,
      password, // Storing plain text as requested by user for this example
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ message: 'Staff created successfully', id: staffIdForDoc.trim() }, { status: 201 });
  } catch (error: any)
{
    console.error("Error creating staff:", error);
    let errorMessage = 'Failed to create staff';
    if (error.message?.includes("Document path must be a non-empty string")) {
        errorMessage = 'Invalid Staff ID format.';
    } else if (error.details) {
        errorMessage += `. Details: ${error.details}`;
    } else if (error.message) {
        errorMessage += `. Message: ${error.message}`;
    }
    return NextResponse.json({ message: errorMessage, fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)) }, { status: 500 });
  }
}