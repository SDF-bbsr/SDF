// src/app/api/sales/update-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

export async function PUT(req: NextRequest) { // Use PUT for updates
  try {
    // REMOVED: staffIdMakingChange from destructuring
    const { transactionId, newStatus } = await req.json();

    // REMOVED: staffIdMakingChange from validation
    if (!transactionId || !newStatus) {
      return NextResponse.json({ message: 'Transaction ID and new status are required.' }, { status: 400 });
    }

    if (newStatus !== "RETURNED_PRE_BILLING" && newStatus !== "SOLD") { // Add more valid statuses if needed
        return NextResponse.json({ message: 'Invalid status value.' }, { status: 400 });
    }

    const saleRef = db.collection('salesTransactions').doc(transactionId);
    const saleDoc = await saleRef.get();

    if (!saleDoc.exists) {
      return NextResponse.json({ message: 'Sale transaction not found.' }, { status: 404 });
    }

    // The original saleData is still available if you need to log original staffId for other purposes,
    // but it's not directly used for the update anymore regarding "who made the change".
    // const saleData = saleDoc.data();

    await saleRef.update({
      status: newStatus,
      // REMOVED: lastStatusUpdateBy: staffIdMakingChange,
      lastStatusUpdateAt: admin.firestore.FieldValue.serverTimestamp() // Still useful to know when status changed
    });

    return NextResponse.json({ message: `Sale status updated to ${newStatus} successfully.` });

  } catch (error) {
    console.error("Error updating sale status:", error);
    // Check if error is a known type with a message property
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}