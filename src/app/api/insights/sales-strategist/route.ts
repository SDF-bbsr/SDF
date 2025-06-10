// src/app/api/insights/sales-strategist/route.ts
import { db } from '@/lib/firebaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import holidays from '@/data/holidays.json'; // Assuming you have holidays.json in a /data directory

// --- TYPE DEFINITIONS ---

interface HourlyBreakdown {
    [hour: string]: {
        totalSales: number;
        transactionCount: number;
    };
}

interface DailySalesSummary {
    date: string; // YYYY-MM-DD
    totalSalesValue: number;
    totalTransactions: number;
    hourlyBreakdown: HourlyBreakdown;
}

// Data structure to be sent to the AI
interface DataForAI {
    currentTime: string; // e.g., "16:15"
    currentDayOfWeek: string; // e.g., "Tuesday"
    todayIsHoliday: string | false; // Holiday name or false
    todaySoFar: DailySalesSummary | null;
    historicalData: {
        last14Days: DailySalesSummary[];
    };
}

interface AIInsightResponse {
    title: string;
    summary: string;
    // NEW: Dedicated forecast object
    salesForecast: {
        predictedSales: [number, number]; // [low_end, high_end]
        reasoning: string;
        confidence: 'Low' | 'Medium' | 'High' | 'Actual';
    };
    analysis: string;
    recommendations: string[];
}

// --- HELPER FUNCTIONS ---

const getDayOfWeek = (dateString: string): string => {
    const date = new Date(dateString + 'T00:00:00'); // Ensure local time interpretation
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
};

const getCurrentTimeStage = (hour: number): 'briefing' | 'checkin' | 'peak' | 'debrief' => {
    if (hour < 12) return 'briefing';
    if (hour < 18) return 'checkin'; // 12 PM to 5:59 PM
    if (hour < 22) return 'peak';    // 6 PM to 9:59 PM
    return 'debrief';
};

// --- API HANDLER ---

export async function POST(req: NextRequest) {
    try {
        // 1. --- Security & Setup ---
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        // Use a timezone that reflects your store's location
        const timeZone = 'Asia/Kolkata'; 
        const todayString = now.toLocaleDateString('en-CA', { timeZone }); // YYYY-MM-DD
        const currentTimeString = now.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' });
        const currentHour = parseInt(now.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit' }), 10);

        console.log(`[Sales Insight] Job started at ${currentTimeString} on ${todayString}`);

        // 2. --- Data Fetching ---
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() - 1); // Historical data up to yesterday
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 13); // Go back 14 days total

        const startDateString = startDate.toISOString().split('T')[0];
        const endDateString = endDate.toISOString().split('T')[0];

        const [historicalSnapshot, todaySnapshot] = await Promise.all([
            db.collection('dailySalesSummaries')
                .where('date', '>=', startDateString)
                .where('date', '<=', endDateString)
                .get(),
            db.collection('dailySalesSummaries').doc(todayString).get()
        ]);

        const historicalData: DailySalesSummary[] = [];
        historicalSnapshot.forEach(doc => {
            historicalData.push(doc.data() as DailySalesSummary);
        });

        const todayData = todaySnapshot.exists ? todaySnapshot.data() as DailySalesSummary : null;
        
        // 3. --- Prepare Data for AI ---
        const dataForAI: DataForAI = {
            currentTime: currentTimeString,
            currentDayOfWeek: getDayOfWeek(todayString),
            todayIsHoliday: holidays[todayString as keyof typeof holidays] || false,
            todaySoFar: todayData,
            historicalData: {
                last14Days: historicalData,
            },
        };

        // 4. --- Generate Insight with Gemini API ---
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', generationConfig: { responseMimeType: "application/json" } });
        
        const timeStage = getCurrentTimeStage(currentHour);

        const prompt = `
            You are an expert AI Sales Strategist for a retail store. Your primary task is to provide a sales forecast and actionable advice to the store manager based on sales data.

            **Context:**
            - Current Time: ${dataForAI.currentTime} on ${dataForAI.currentDayOfWeek}, ${todayString}.
            - Holiday Status: Today is ${dataForAI.todayIsHoliday ? `a holiday (${dataForAI.todayIsHoliday})` : 'a regular business day'}.

            **Analytical Guidance:**
            - **Forecasting is Mandatory:** You MUST provide a sales forecast at every stage.
            - **Priority:** Base your analysis and forecast heavily on patterns from the **same day of the week** in previous weeks.
            - **Secondary Context:** Adjust your forecast based on recent trends (last 2-3 days) and any holiday/weekend effects.
            - **Bulk Upload Pattern:** A sudden, massive spike in sales and transactions in a single hour (often afternoon) that doesn't match surrounding hours is likely a 'bulk data upload'. Acknowledge this in your reasoning if it occurs, as it's not natural customer flow.

            **Your Task:**
            Based on the current time of day (${timeStage}), generate a JSON object that strictly follows the structure below.

            **Required JSON Output Structure:**
            {
            "title": "string",
            "summary": "string",
            "salesForecast": {
                "predictedSales": [number, number],
                "reasoning": "string",
                "confidence": "string"
            },
            "analysis": "string",
            "recommendations": ["string", "string"]
            }

            **Instructions for each time stage, especially for 'salesForecast':**
            - **briefing (Before 12 PM):**
            - **Forecast:** Base the 'predictedSales' range entirely on historical averages for this day of the week, adjusted for holiday context. 'confidence' must be "Low". 'reasoning' should state it's based on historical data as no sales have occurred yet.
            - **Content:** Title "Daily Briefing". Detail key hours to watch.
            - **checkin (12 PM - 6 PM):**
            - **Forecast:** This is critical. Calculate 'predictedSales' by combining today's performance so far with historical evening patterns. The 'reasoning' MUST explain how today's progress (e.g., "15% ahead of schedule") impacts the final number. 'confidence' must be "Medium".
            - **Content:** Title "Mid-Day Check-in". Compare today-so-far vs historical.
            - **peak (6 PM - 10 PM):**
            - **Forecast:** Refine the 'predictedSales' range based on the intensity of the current evening rush. This prediction should be more precise. The 'reasoning' should mention the performance of the last hour. 'confidence' must be "High".
            - **Content:** Title "Peak Hour Pulse". Report on the last hour's performance.
            - **debrief (After 10 PM):**
            - **Forecast:** The 'predictedSales' range should reflect the actual final sales number from 'todaySoFar' (e.g., [21350, 21350]). The 'reasoning' should explain the final outcome. 'confidence' must be "Actual".
            - **Content:** Title "End-of-Day Debrief". Provide "The Story of the Day".

            Analyze this data:
            ${JSON.stringify(dataForAI, null, 2)}
        `;

        console.log(`[Sales Insight] Sending data for '${timeStage}' stage to Gemini.`);
        const result = await model.generateContent(prompt);
        const rawResponse = result.response.text();
        const insightData: AIInsightResponse = JSON.parse(rawResponse);

        // 5. --- Save the Insight to Firestore ---
        const insightDocRef = db.collection('insights').doc('salesDashboardInsight');
        await insightDocRef.set({
            ...insightData,
            stage: timeStage,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            sourceDate: todayString,
        }, { merge: true });

        console.log('[Sales Insight] Insight generated and saved successfully.');

        // 6. --- Return Success Response ---
        return NextResponse.json({ 
            message: 'Sales insight generated and saved successfully.',
            insight: insightData 
        });

    } catch (error: any) {
        console.error("[ERROR] in /api/insights/sales-strategist:", error);
        const errorMessage = error.message || 'An unknown error occurred.';
        if (error instanceof SyntaxError) {
             console.error("[ERROR] Failed to parse JSON response from Gemini API. Raw Response:", error.stack);
             return NextResponse.json({ message: 'Failed to parse AI response.', details: errorMessage }, { status: 500 });
        }
        return NextResponse.json({ message: 'Failed to generate sales insight.', details: errorMessage }, { status: 500 });
    }
}