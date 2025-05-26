// src/app/api/manager/stock-events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

export async function POST(req: NextRequest) {
  console.log("API POST /api/manager/stock-events called");
  try {
    const { articleNo, type, quantityKg, eventDate, notes, recordedBy } = await req.json();

    if (!articleNo || !type || quantityKg === undefined || !eventDate || !recordedBy) {
      return NextResponse.json({ message: 'Missing required fields (articleNo, type, quantityKg, eventDate, recordedBy).' }, { status: 400 });
    }
    if (typeof quantityKg !== 'number' || quantityKg < 0) {
        return NextResponse.json({ message: 'Quantity Kg must be a non-negative number.' }, { status: 400 });
    }
    // Validate type
    const validTypes = ["OPENING_STOCK", "STOCK_RECEIVED", "ADJUSTMENT_ADD", "ADJUSTMENT_SUBTRACT"];
    if (!validTypes.includes(type.toUpperCase())) {
        return NextResponse.json({ message: `Invalid stock event type. Valid types are: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const newStockEvent = {
      articleNo,
      type: type.toUpperCase(),
      quantityKg: Number(quantityKg),
      eventDate, // Expecting YYYY-MM-DD
      notes: notes || null,
      recordedBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('stockEvents').add(newStockEvent);
    console.log("New stock event added with ID:", docRef.id);

    return NextResponse.json({ message: 'Stock event added successfully', id: docRef.id, data: newStockEvent }, { status: 201 });

  } catch (error: any) {
    console.error("Error in POST /api/manager/stock-events:", error);
    return NextResponse.json({ message: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}