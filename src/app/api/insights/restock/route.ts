// src/app/api/insights/restock/route.ts

import { db } from '@/lib/firebaseAdmin'; // Your firebase-admin setup
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// --- INTERFACES ---

// Unchanged: Consistent with your existing ledger structure
interface MonthlyStockLedgerItem {
    productArticleNo: string;
    productName: string;
    month: string;
    year: string;
    openingStockKg: number;
    totalRestockedThisMonthKg: number;
    restockEntriesThisMonth: { [timestamp: string]: { date: string; quantityKg: number; notes?: string } };
    totalSoldThisMonthKg: number;
    closingStockKg: number;
    lastSalesSyncDateForMonth: string | null;
    lastUpdated: any;
}

// Unchanged: A cleaner version of the data specifically for the AI prompt
interface ProductDataForAI {
    productName: string;
    dailySalesRateKg: number;
    totalSoldThisMonthKg: number;
    currentStockKg: number;
    openingStockKg: number;
    totalRestockedThisMonthKg: number;
    restockEntriesThisMonth: { [timestamp: string]: { date: string; quantityKg: number; } };
}


// vvv MODIFIED: The structured JSON response now has a more detailed statusReport vvv
interface AIStockInsightResponse {
    summary: string;
    highRiskProducts: {
        productName: string;
        currentStockKg: number;
        totalSoldKg: number;
        recommendedReplenishmentKg: string;
        notes: string;
    }[];
    statusReport: {
        wellStocked: {
            productName: string;
            reason: string; // e.g., "Current stock is 13.085 kg."
        }[];
        slowMoving: {
            productName: string;
            reason: string; // e.g., "Daily sales rate is only 0.023 kg."
        }[];
    };
    recommendations: string[];
}
// ^^^ END OF MODIFICATION ^^^


// --- API HANDLER ---

export async function GET(req: NextRequest) {
    try {
        // --- 1. Security Check ---
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // --- 2. Fetch Ledger Data for the Current Month ---
        const now = new Date();
        const currentMonthYYYYMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        console.log(`[Insight Generation] Starting job for month: ${currentMonthYYYYMM}`);

        const ledgerSnapshot = await db.collection('monthlyProductStockLedger')
            .where('month', '==', currentMonthYYYYMM)
            .get();

        if (ledgerSnapshot.empty) {
            console.log(`[Insight Generation] No ledger documents found for ${currentMonthYYYYMM}. Exiting.`);
            return NextResponse.json({ message: `No stock ledger data found for month ${currentMonthYYYYMM}. No insight generated.` });
        }

        // --- 3. Process and Filter the Data ---
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const daysPassed = Math.max(1, (today.getTime() - firstDayOfMonth.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`[Insight Generation] Days passed this month for rate calculation: ${daysPassed.toFixed(2)}`);

        const productsToAnalyze: ProductDataForAI[] = [];
        
        ledgerSnapshot.forEach(doc => {
            const ledgerData = doc.data() as MonthlyStockLedgerItem;

            if (ledgerData.totalRestockedThisMonthKg === 0 && ledgerData.totalSoldThisMonthKg === 0) {
                return;
            }

            const dailySalesRate = ledgerData.totalSoldThisMonthKg / daysPassed;

            const productForAI: ProductDataForAI = {
                productName: ledgerData.productName,
                dailySalesRateKg: parseFloat(dailySalesRate.toFixed(3)),
                totalSoldThisMonthKg: ledgerData.totalSoldThisMonthKg,
                currentStockKg: ledgerData.closingStockKg,
                openingStockKg: ledgerData.openingStockKg,
                totalRestockedThisMonthKg: ledgerData.totalRestockedThisMonthKg,
                restockEntriesThisMonth: ledgerData.restockEntriesThisMonth,
            };
            productsToAnalyze.push(productForAI);
        });

        if (productsToAnalyze.length === 0) {
            console.log(`[Insight Generation] All products for ${currentMonthYYYYMM} had zero activity. Exiting.`);
            return NextResponse.json({ message: 'No products with sales or restock activity found. No insight generated.' });
        }

        // --- 4. Generate Insight with Gemini API ---
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.0-flash', 
            generationConfig: { responseMimeType: "application/json" } 
        });

        // vvv MODIFIED: The prompt is updated to request the new detailed JSON for statusReport vvv
        const prompt = `
            You are an expert AI inventory management analyst for a retail store.
            Your task is to analyze the following stock ledger data and generate a JSON object with a clear, actionable report for the store vendor.

            **Input Data Explanation:**
            - 'dailySalesRateKg': The average amount of the product sold per day this month.
            - 'totalSoldThisMonthKg': The total sold so far in the month.
            - 'currentStockKg': The stock on hand right now.

            **Required JSON Output Structure:**
            You MUST generate a JSON object that strictly adheres to this structure. Do not add any extra text or explanations outside of the JSON.
            {
              "summary": "A single, concise paragraph summarizing the overall stock situation.",
              "highRiskProducts": [
                {
                  "productName": "string",
                  "currentStockKg": number,
                  "totalSoldKg": number,
                  "recommendedReplenishmentKg": "string",
                  "notes": "string"
                }
              ],
              "statusReport": {
                "wellStocked": [
                  {
                    "productName": "string",
                    "reason": "string" 
                  }
                ],
                "slowMoving": [
                  {
                    "productName": "string",
                    "reason": "string"
                  }
                ]
              },
              "recommendations": ["string"]
            }

            **Analytical Rules & Content Instructions:**
            1.  **High Risk Products:** Identify products at high risk of selling out soon. For the 'notes' field, provide a brief, critical observation, if stock is negative, it MUST be 'Negative stock indicates tracking error. Investigate immediately.' , for others it must be some other reason and better if backed by some number.
            2.  **Replenishment Logic:** For 'recommendedReplenishmentKg', use 'dailySalesRateKg' to estimate a sensible restock amount (e.g., '5+', '10+', '15+').
            3.  **Status Report Logic:** This is very important.
                - For items in the \`wellStocked\` array, the \`reason\` string MUST state the current stock level. Populate those product that are well-stocked.
                - For items in the \`slowMoving\` array, the \`reason\` string MUST state the low daily sales rate. Populate those product that have a very low sales rate (i.e., have a very low 'dailySalesRateKg').
            4.  **Recommendations:** Conclude with the top 3-4 most important actions in the 'recommendations' array.
            5. Every number can be restricted to 3 decimal point, if excceding round of to 3 decimal points.
            
            Analyze this data:
            \`\`\`json
            ${JSON.stringify(productsToAnalyze, null, 2)}
            \`\`\`
        `;
        // ^^^ END OF MODIFICATION ^^^

        console.log(`[Insight Generation] Sending ${productsToAnalyze.length} products to Gemini for analysis.`);
        const result = await model.generateContent(prompt);
        const rawResponse = result.response.text();
        
        const insightData: AIStockInsightResponse = JSON.parse(rawResponse);

        // --- 5. Save the Insight to Firestore ---
        const insightDocRef = db.collection('insights').doc('stockRestockInsight');
        await insightDocRef.set({
            ...insightData,
            type: 'stock',
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceMonth: currentMonthYYYYMM,
        }, { merge: true });

        console.log('[Insight Generation] Insight generated and saved successfully.');

        // --- 6. Return Success Response ---
        return NextResponse.json({ 
            message: 'Stock insight generated and saved successfully.',
            insight: insightData 
        });

    } catch (error: any) {
        console.error("[ERROR] in /api/insights/restock:", error);
        if (error instanceof SyntaxError) {
             console.error("[ERROR] Failed to parse JSON response from Gemini API. Raw Response:", (error as any).stack?.split('\n')[0]);
             return NextResponse.json({ message: 'Failed to parse AI response.', details: 'The AI model returned a response that was not valid JSON.' }, { status: 500 });
        }
        return NextResponse.json({ message: 'Failed to generate stock insight.', details: error.message }, { status: 500 });
    }
}