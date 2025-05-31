// src/app/api/manager/data-updation/count-transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  console.log("API POST /api/manager/data-updation/count-transactions called");
  try {
    const { date } = await req.json(); // Expect a single 'date'

    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ message: 'A valid YYYY-MM-DD date is required.' }, { status: 400 });
    }

    const salesQuery = db.collection('salesTransactions')
      .where('status', '==', 'SOLD')
      .where('dateOfSale', '==', date); // Count for the specific day

    const countSnapshot = await salesQuery.count().get();
    const totalTransactions = countSnapshot.data().count;
    
    console.log(`Found ${totalTransactions} SOLD transactions for date: ${date}`);
    return NextResponse.json({ totalTransactions });

  } catch (error: any) {
    console.error("Error counting transactions for data-updation:", error);
    if (error.code === 9 || (error.message && error.message.toLowerCase().includes('index'))) {
        return NextResponse.json({ message: 'Query requires an index. Check server logs.', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Failed to count transactions.', details: error.message }, { status: 500 });
  }
}