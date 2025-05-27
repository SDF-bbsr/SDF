// src/app/api/manager/sales-transactions/[transactionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
// No need for admin.firestore.FieldValue here unless updating timestamps

export async function DELETE(
  req: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  const transactionId = params.transactionId;
  console.log(`API DELETE /api/manager/sales-transactions/${transactionId} called`);

  try {
    if (!transactionId) {
      return NextResponse.json({ message: 'Transaction ID is required.' }, { status: 400 });
    }

    const saleRef = db.collection('salesTransactions').doc(transactionId);
    const doc = await saleRef.get();

    if (!doc.exists) {
      return NextResponse.json({ message: `Sale transaction with ID "${transactionId}" not found.` }, { status: 404 });
    }

    await saleRef.delete();
    console.log("Sale transaction deleted:", transactionId);

    return NextResponse.json({ message: `Sale transaction ID "${transactionId}" deleted successfully.`, id: transactionId });

  } catch (error: any) {
    console.error(`Error deleting sale transaction ${transactionId}:`, error);
    return NextResponse.json({ message: 'Failed to delete sale transaction.', details: error.message }, { status: 500 });
  }
}

// Optional: You could also add a PUT handler here for more complex edits than just status
// export async function PUT(req: NextRequest, { params }: { params: { transactionId: string } }) {
//   // ... logic for updating various fields of a specific transaction ...
// }