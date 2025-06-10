import { db } from '@/lib/firebaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// --- TYPE DEFINITIONS (Updated) ---

interface ProductMaster {
    articleNumber: string;
    articleName: string;
    purchasePricePerKg: number;
    sellingRatePerKg: number;
}

interface DailyProductSale {
    date: string; // YYYY-MM-DD
    productArticleNo: string;
    totalSalesValue: number;
    totalQuantitySoldGrams: number;
    totalTransactions: number;
}

// Intermediate structure for aggregating data
interface ProductAnalysisData {
    articleNo: string;
    name: string;
    purchasePricePerKg: number;
    sellingRatePerKg: number;
    recentSalesValue: number; // Last 7 days
    recentTransactions: number;
    priorSalesValue: number; // Prior 7 days
    // NEW: For Daily Movers
    yesterdaySalesValue: number;
    total14DaySalesValue: number;
}

// Clean, final structure to be sent to the AI
interface ProductDataForAI {
    articleNo: string;
    name: string;
    salesVolumeLast7Days: number;
    salesVolumePrevious7Days: number;
    estimatedProfitMargin: number;
    averagePacketValue: number;
    // NEW: Fields for Daily Movers
    yesterdaySalesVolume: number;
    averageDailySalesPrior13Days: number;
}

// MODIFIED: Expected structure of the JSON response from Gemini
interface AIInsightResponse {
    // NEW SECTION
    dailyMovers: {
        narrative: string;
        standoutPerformers: Array<{ productName: string; yesterdaySales: number; averageDailySales: number; percentageChange: number; }>;
        underperformers: Array<{ productName: string; yesterdaySales: number; averageDailySales: number; percentageChange: number; }>;
    };
    weeklyMovers: {
        risingStars: Array<{ productName: string; changePercentage: number; }>;
        coolingOff: Array<{ productName: string; changePercentage: number; }>;
    };
    consistentPerformers: {
        narrative: string;
        products: Array<{ productName: string; averageDailySales: number; }>;
    };
    priceSweetSpot: {
        narrative: string;
        sweetSpotRange: [number, number];
    };
    // MODIFIED: Richer data in profitQuadrant
    profitQuadrant: {
        stars: { narrative: string; products: Array<{ productName: string; salesVolume: number; profitMargin: number; }>; };
        cashCows: { narrative: string; products: Array<{ productName: string; salesVolume: number; profitMargin: number; }>; };
        opportunities: { narrative: string; products: Array<{ productName: string; salesVolume: number; profitMargin: number; }>; };
        problemChildren: { narrative: string; products: Array<{ productName: string; salesVolume: number; profitMargin: number; }>; };
    };
}

// --- API HANDLER ---

export async function GET(req: NextRequest) {
    try {
        // 1. --- Security Check ---
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        console.log('[Insight Generation] Starting product performance insight job...');

        // 2. --- Date & Data Fetching (Updated) ---
        const today = new Date(); // e.g., June 10th
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1); // June 9th
        const startDate = new Date(yesterday);
        startDate.setDate(startDate.getDate() - 13); // May 27th (14 days total, including yesterday)

        const priorPeriodEndDate = new Date(startDate);
        priorPeriodEndDate.setDate(priorPeriodEndDate.getDate() + 6); // June 2nd

        const startDateString = startDate.toISOString().split('T')[0];
        const yesterdayString = yesterday.toISOString().split('T')[0];
        const priorPeriodEndDateString = priorPeriodEndDate.toISOString().split('T')[0];

        console.log(`[Insight Generation] Analyzing data from ${startDateString} to ${yesterdayString}`);

        const [salesSnapshot, productsSnapshot] = await Promise.all([
            db.collection('dailyProductSales')
              .where('date', '>=', startDateString)
              .where('date', '<=', yesterdayString)
              .get(),
            db.collection('product').get()
        ]);

        if (salesSnapshot.empty) {
            return NextResponse.json({ message: 'No sales data found in the last 14 days.' }, { status: 200 });
        }

        const productMasterMap = new Map<string, ProductMaster>();
        productsSnapshot.forEach(doc => {
            const data = doc.data();
            productMasterMap.set(data.articleNumber, {
                articleNumber: data.articleNumber,
                articleName: data.articleName,
                purchasePricePerKg: data.purchasePricePerKg || 0,
                sellingRatePerKg: data.sellingRatePerKg || 0,
            });
        });

        // 3. --- Process and Aggregate Data (Updated) ---
        const analysisMap = new Map<string, ProductAnalysisData>();

        salesSnapshot.forEach(doc => {
            const sale = doc.data() as DailyProductSale;
            const productInfo = productMasterMap.get(sale.productArticleNo);
            if (!productInfo) return;

            if (!analysisMap.has(sale.productArticleNo)) {
                analysisMap.set(sale.productArticleNo, {
                    articleNo: sale.productArticleNo, name: productInfo.articleName,
                    purchasePricePerKg: productInfo.purchasePricePerKg, sellingRatePerKg: productInfo.sellingRatePerKg,
                    recentSalesValue: 0, recentTransactions: 0, priorSalesValue: 0,
                    // NEW
                    yesterdaySalesValue: 0, total14DaySalesValue: 0,
                });
            }
            
            const productData = analysisMap.get(sale.productArticleNo)!;
            
            // Add to the correct 7-day bucket for Weekly Movers
            if (sale.date > priorPeriodEndDateString) {
                productData.recentSalesValue += sale.totalSalesValue;
                productData.recentTransactions += sale.totalTransactions;
            } else {
                productData.priorSalesValue += sale.totalSalesValue;
            }

            // NEW: Capture yesterday's sales specifically
            if (sale.date === yesterdayString) {
                productData.yesterdaySalesValue += sale.totalSalesValue;
            }
            
            productData.total14DaySalesValue += sale.totalSalesValue;
        });

        // 4. --- Prepare Final Data for AI (Updated) ---
        const productsForAI: ProductDataForAI[] = [];
        for (const [_, data] of analysisMap.entries()) {
            if (data.total14DaySalesValue <= 0) continue;
            
            const margin = data.sellingRatePerKg > 0
                ? (data.sellingRatePerKg - data.purchasePricePerKg) / data.sellingRatePerKg
                : 0;

            // NEW: Calculate average daily sales for the 13 days *before* yesterday
            const prior13DaySales = data.total14DaySalesValue - data.yesterdaySalesValue;
            const avgDailySalesPrior = prior13DaySales > 0 ? prior13DaySales / 13 : 0;

            productsForAI.push({
                articleNo: data.articleNo,
                name: data.name,
                salesVolumeLast7Days: parseFloat(data.recentSalesValue.toFixed(2)),
                salesVolumePrevious7Days: parseFloat(data.priorSalesValue.toFixed(2)),
                estimatedProfitMargin: parseFloat(margin.toFixed(3)),
                averagePacketValue: data.recentTransactions > 0 ? parseFloat((data.recentSalesValue / data.recentTransactions).toFixed(2)) : 0,
                // NEW
                yesterdaySalesVolume: parseFloat(data.yesterdaySalesValue.toFixed(2)),
                averageDailySalesPrior13Days: parseFloat(avgDailySalesPrior.toFixed(2)),
            });
        }
        
        const topProductsForAI = productsForAI.sort((a, b) => b.salesVolumeLast7Days - a.salesVolumeLast7Days).slice(0, 60);

        if (topProductsForAI.length < 3) {
             return NextResponse.json({ message: 'Not enough product data to generate a meaningful insight.' }, { status: 200 });
        }

        // 5. --- Generate Insight with Gemini API (Updated Prompt) ---
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', generationConfig: { responseMimeType: "application/json" } });

        const prompt = `
            You are a sharp, data-driven retail analyst for a dry fruits store. Analyze the following product performance data to provide strategic insights to the store manager. The analysis is for data up to and including yesterday.

            **Input Data Explanation:**
            - 'yesterdaySalesVolume': Sales revenue for a product yesterday.
            - 'averageDailySalesPrior13Days': The average daily sales for that product over the 13 days prior to yesterday.
            - 'salesVolumeLast7Days', 'salesVolumePrevious7Days': Weekly sales figures for trend analysis.
            - 'estimatedProfitMargin': Item profitability from 0.0 to 1.0.
            - 'averagePacketValue': Average transaction value.

            **Your Task:**
            Generate a JSON object that strictly adheres to the specified structure. Do not add any extra text or explanations outside of the JSON.

            **Required JSON Output Structure:**
            {
              "dailyMovers": {
                "narrative": "string",
                "standoutPerformers": [{ "productName": "string", "yesterdaySales": "number", "averageDailySales": "number", "percentageChange": "number" }],
                "underperformers": [{ "productName": "string", "yesterdaySales": "number", "averageDailySales": "number", "percentageChange": "number" }]
              },
              "weeklyMovers": {
                "risingStars": [{ "productName": "string", "changePercentage": "number" }],
                "coolingOff": [{ "productName": "string", "changePercentage": "number" }]
              },
              "consistentPerformers": {
                "narrative": "string",
                "products": [{ "productName": "string", "averageDailySales": "number" }]
              },
              "priceSweetSpot": { "narrative": "string", "sweetSpotRange": ["number", "number"] },
              "profitQuadrant": {
                "stars": { "narrative": "string", "products": [{ "productName": "string", "salesVolume": "number", "profitMargin": "number" }] },
                "cashCows": { "narrative": "string", "products": [{ "productName": "string", "salesVolume": "number", "profitMargin": "number" }] },
                "opportunities": { "narrative": "string", "products": [{ "productName": "string", "salesVolume": "number", "profitMargin": "number" }] },
                "problemChildren": { "narrative": "string", "products": [{ "productName": "string", "salesVolume": "number", "profitMargin": "number" }] }
              }
            }

            **Instructions for each section:**
            1.  **dailyMovers**: Compare 'yesterdaySalesVolume' to 'averageDailySalesPrior13Days'. Identify 4-5 top standout performers and underperformers. Write a narrative about yesterday's key trends.
            2.  **weeklyMovers**: Identify 4-5 products with the biggest positive/negative percentage change week-over-week.
            3.  **consistentPerformers**: Identify 4-5 products that are reliable, based on their sales volume across the 14 days. Calculate their average daily sales over the full 14-day period.
            4.  **priceSweetSpot**: Analyze 'averagePacketValue' of top sellers and identify the most effective price range.
            5.  **profitQuadrant**: Classify top products based on 'salesVolumeLast7Days' and 'estimatedProfitMargin'. For each product listed, YOU MUST include its 'productName', 'salesVolume' (use salesVolumeLast7Days), and 'profitMargin'. Provide a 1-sentence strategic narrative for each quadrant.
                - Stars: High Volume, High Margin (>0.4).
                - Cash Cows: High Volume, Low Margin (<=0.4).
                - Opportunities: Low Volume, High Margin.
                - Problem Children: Low Volume, Low Margin.

            Analyze this data:
            ${JSON.stringify(topProductsForAI, null, 2)}
        `;

        console.log(`[Insight Generation] Sending ${topProductsForAI.length} products to Gemini for analysis.`);
        const result = await model.generateContent(prompt);
        const rawResponse = result.response.text();
        const insightData: AIInsightResponse = JSON.parse(rawResponse);

        // 6. --- Save the Insight to Firestore (Updated) ---
        const insightDocRef = db.collection('insights').doc('productPerformance');
        await insightDocRef.set({
            ...insightData,
            type: 'productPerformance',
            // MODIFIED: Changed field name to lastUpdated as requested
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            sourceDateRange: { start: startDateString, end: yesterdayString },
        }, { merge: true });

        console.log('[Insight Generation] Product performance insight generated and saved successfully.');

        // 7. --- Return Success Response ---
        return NextResponse.json({ 
            message: 'Product performance insight generated and saved successfully.',
            insight: insightData 
        });

    } catch (error: any) {
        console.error("[ERROR] in /api/insights/product:", error);
        const errorMessage = error.message || 'An unknown error occurred.';
        if (error instanceof SyntaxError) {
             console.error("[ERROR] Failed to parse JSON response from Gemini API.");
             return NextResponse.json({ message: 'Failed to parse AI response.', details: errorMessage }, { status: 500 });
        }
        return NextResponse.json({ message: 'Failed to generate product insight.', details: errorMessage }, { status: 500 });
    }
}