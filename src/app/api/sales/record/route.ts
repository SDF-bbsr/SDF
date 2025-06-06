// src/app/api/sales/record/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

const IST_TIMEZONE = 'Asia/Kolkata';

// Helper to get YYYY-MM-DD string for the current instant in IST
const getCurrentISODateStringInIST = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(now);
};

// Helper to get the current hour (0-23) in IST
const getCurrentHourInIST = (): number => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { // Using en-US for hour parsing
        hour: 'numeric',
        hour12: false, // 24-hour format
        timeZone: IST_TIMEZONE,
    });
    return parseInt(formatter.format(now), 10);
};


export async function POST(req: NextRequest) {
  try {
    const salePayload = await req.json();
    const {
      barcodeScanned, articleNo, weightGrams, calculatedSellPrice, staffId, staffName,
      product_articleNumber, product_articleName, product_posDescription, product_metlerCode,
      product_hsnCode, product_taxPercentage, product_purchasePricePerKg,
      product_sellingRatePerKg, product_mrpPer100g, product_remark,
    } = salePayload;

    if (!articleNo || typeof weightGrams !== 'number' || typeof calculatedSellPrice !== 'number' || !staffId || !product_articleName || !product_articleNumber) {
      return NextResponse.json({ message: 'Missing required sale data (articleNo, weight, price, staffId, product details).' }, { status: 400 });
    }

    // Check if weight exceeds the limit (1500 grams = 1.5 kg)
    if (weightGrams > 1500) {
        return NextResponse.json({ message: 'Billing is not allowed for weights exceeding 1.5 kg (1500 grams).' }, { status: 400 });
    }

    const todayStrIST = getCurrentISODateStringInIST();
    const currentHourIST = getCurrentHourInIST(); // Get current hour in IST for hourly breakdown
    const currentHourStr = currentHourIST.toString().padStart(2, '0'); // Format as "00", "01", ... "23"

    // Note: saleDataForTransaction.timestamp will be resolved by Firestore server to UTC.
    // The hourly breakdown is based on the server's perception of the current hour in IST when the sale is recorded.
    const saleDataForTransaction = {
      articleNo: String(articleNo),
      barcodeScanned: barcodeScanned || null,
      weightGrams,
      calculatedSellPrice,
      staffId,
      status: "SOLD",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      dateOfSale: todayStrIST, // Date of sale is based on IST calendar date
      // product_ fields...
      product_articleNumber: String(product_articleNumber),
      product_articleName: product_articleName,
      product_posDescription: product_posDescription,
      product_metlerCode: product_metlerCode,
      product_hsnCode: product_hsnCode,
      product_taxPercentage: product_taxPercentage,
      product_purchasePricePerKg: product_purchasePricePerKg,
      product_sellingRatePerKg: product_sellingRatePerKg,
      product_mrpPer100g: product_mrpPer100g,
      product_remark: product_remark !== undefined ? product_remark : null,
    };

    const dailySalesSummaryRef = db.collection('dailySalesSummaries').doc(todayStrIST);
    const dailyStaffSalesRef = db.collection('dailyStaffSales').doc(todayStrIST);
    const dailyProductSalesRef = db.collection('dailyProductSales').doc(`${todayStrIST}_${saleDataForTransaction.articleNo}`);
    const newSaleDocRef = db.collection('salesTransactions').doc();

    await db.runTransaction(async (transaction) => {
      // --- Step 1: Perform all reads ---
      const summaryDoc = await transaction.get(dailySalesSummaryRef);
      const staffSalesDoc = await transaction.get(dailyStaffSalesRef);
      const productSalesDoc = await transaction.get(dailyProductSalesRef);

      // --- Step 2: Prepare data for writes based on reads and new sale ---

      // For dailySalesSummaries (INCLUDING HOURLY)
      let newTotalSalesForDay = saleDataForTransaction.calculatedSellPrice;
      let newTxCountForDay = 1;
      let hourlyBreakdownUpdate = summaryDoc.exists ? summaryDoc.data()?.hourlyBreakdown || {} : {};

      if (!hourlyBreakdownUpdate[currentHourStr]) {
          hourlyBreakdownUpdate[currentHourStr] = { totalSales: 0, transactionCount: 0 };
      }
      hourlyBreakdownUpdate[currentHourStr].totalSales = parseFloat((hourlyBreakdownUpdate[currentHourStr].totalSales + saleDataForTransaction.calculatedSellPrice).toFixed(2));
      hourlyBreakdownUpdate[currentHourStr].transactionCount += 1;

      if (summaryDoc.exists) {
          newTotalSalesForDay += summaryDoc.data()?.totalSalesValue || 0;
          newTxCountForDay += summaryDoc.data()?.totalTransactions || 0;
      }
      const dailySummaryUpdateData = { // Renamed to avoid conflict with const name
          date: todayStrIST,
          totalSalesValue: parseFloat(newTotalSalesForDay.toFixed(2)),
          totalTransactions: newTxCountForDay,
          hourlyBreakdown: hourlyBreakdownUpdate,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };

      // For dailyStaffSales
      const currentStaffName = staffName || "Unknown Staff"; // staffName should be passed from client
      let staffStats = staffSalesDoc.exists ? staffSalesDoc.data()?.staffStats || {} : {};
      if (!staffStats[staffId]) {
        staffStats[staffId] = { name: currentStaffName, totalSalesValue: 0, totalTransactions: 0 };
      } else if (staffStats[staffId].name !== currentStaffName && currentStaffName !== "Unknown Staff") { // Update name if different and not default
        staffStats[staffId].name = currentStaffName;
      }
      staffStats[staffId].totalSalesValue = parseFloat((staffStats[staffId].totalSalesValue + saleDataForTransaction.calculatedSellPrice).toFixed(2));
      staffStats[staffId].totalTransactions += 1;
      const staffSalesUpdateData = { // Renamed
        date: todayStrIST,
        staffStats: staffStats,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // For dailyProductSales
      let newProductQty = saleDataForTransaction.weightGrams;
      let newProductSalesVal = saleDataForTransaction.calculatedSellPrice;
      let newProductTxCount = 1;
      if (productSalesDoc.exists) {
        newProductQty += productSalesDoc.data()?.totalQuantitySoldGrams || 0;
        newProductSalesVal += productSalesDoc.data()?.totalSalesValue || 0;
        newProductTxCount += productSalesDoc.data()?.totalTransactions || 0;
      }
      const productSalesUpdateData = { // Renamed
        date: todayStrIST,
        productArticleNo: saleDataForTransaction.articleNo,
        productName: saleDataForTransaction.product_articleName,
        totalQuantitySoldGrams: newProductQty,
        totalSalesValue: parseFloat(newProductSalesVal.toFixed(2)),
        totalTransactions: newProductTxCount,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };

      // --- Step 3: Perform all writes ---
      transaction.set(newSaleDocRef, saleDataForTransaction);
      transaction.set(dailySalesSummaryRef, dailySummaryUpdateData, { merge: true });
      transaction.set(dailyStaffSalesRef, staffSalesUpdateData, { merge: true });
      transaction.set(dailyProductSalesRef, productSalesUpdateData, { merge: true });
    });

    console.log(`Sale ${newSaleDocRef.id} recorded and aggregates updated (incl. hourly).`);
    return NextResponse.json({ 
        message: 'Sale recorded and aggregates updated successfully', 
        saleId: newSaleDocRef.id 
    });

  } catch (error){
    console.error('Error recording sale and updating aggregates:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ message: `Transaction failed: ${errorMessage}` }, { status: 500 });
  }
}