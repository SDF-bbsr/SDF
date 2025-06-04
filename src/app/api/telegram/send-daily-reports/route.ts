// app/api/telegram/send-daily-reports/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin'; // Your admin init
import exceljs from 'exceljs';

// --- Environment Variables and Constants ---
const CRON_SECRET = process.env.CRON_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // Needed for sending messages/documents
const VERCEL_APP_URL = process.env.VERCEL_APP_URL;     // Needed to call the export API

const IST_TIMEZONE_SERVER = 'Asia/Kolkata';

// --- Helper Functions (Copied/adapted from bot/route.ts) ---
function escapeMarkdownV2(text: string): string {
    if (typeof text !== 'string') return '';
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function sendTelegramMessage(chatId: number, text: string, parseMode: "MarkdownV2" | "HTML" | undefined = "MarkdownV2") {
    console.log(`[Cron SendDailyReports - sendTelegramMessage] Sending to chat ${chatId}: ${text.substring(0, 100)}...`);
    if (!TELEGRAM_BOT_TOKEN) {
        console.error("[Cron SendDailyReports - sendTelegramMessage] TELEGRAM_BOT_TOKEN is not set!");
        return; // Or throw an error
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: parseMode }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error("[Cron SendDailyReports - sendTelegramMessage] Telegram API sendMessage error:", errorData);
        }
    } catch (error) {
        console.error("[Cron SendDailyReports - sendTelegramMessage] Error sending Telegram message:", error);
    }
}

async function sendTelegramDocument(chatId: number, fileBuffer: Buffer, filename: string, caption?: string) {
    console.log(`[Cron SendDailyReports - sendTelegramDocument] Sending document ${filename} to chat ${chatId}`);
    if (!TELEGRAM_BOT_TOKEN) {
        console.error("[Cron SendDailyReports - sendTelegramDocument] TELEGRAM_BOT_TOKEN is not set!");
        return; // Or throw an error
    }

    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('document', new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    if (caption) {
        formData.append('caption', caption);
        formData.append('caption_parse_mode', 'MarkdownV2');
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;
    try {
        const response = await fetch(url, { method: 'POST', body: formData });
        if (!response.ok) {
            const errorData = await response.json();
            console.error("[Cron SendDailyReports - sendTelegramDocument] Telegram API sendDocument error:", errorData, `Response status: ${response.status}`);
        } else {
            console.log(`[Cron SendDailyReports - sendTelegramDocument] Document ${filename} sent successfully to chat ${chatId}.`);
        }
    } catch (error) {
        console.error("[Cron SendDailyReports - sendTelegramDocument] Error sending Telegram document:", error);
    }
}

const getISODateStringInIST = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE_SERVER, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(date);
};


// --- Main Cron Handler ---
export async function GET(req: NextRequest) { // Vercel Crons use GET by default
    console.log("[Cron SendDailyReports] Received request.");

    // Authenticate Cron Job
    const authHeader = req.headers.get('authorization');
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
        console.warn("[Cron SendDailyReports] Unauthorized attempt.");
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for essential environment variables for functionality
    if (!TELEGRAM_BOT_TOKEN || !VERCEL_APP_URL) {
        console.error("[Cron SendDailyReports] CRITICAL: Missing TELEGRAM_BOT_TOKEN or VERCEL_APP_URL environment variables!");
        return NextResponse.json({ error: 'Cron misconfigured internally. Required environment variables missing.' }, { status: 500 });
    }

    try {
        const subscribersSnapshot = await db.collection('telegramBotSubscriptions').where('isActive', '==', true).get();
        if (subscribersSnapshot.empty) {
            console.log("[Cron SendDailyReports] No active subscribers found.");
            return NextResponse.json({ message: 'No active subscribers.' });
        }

        const todayServerTime = new Date();
        const yesterdayServerTime = new Date(todayServerTime);
        yesterdayServerTime.setDate(todayServerTime.getDate() - 1);
        const yesterdayDateString = getISODateStringInIST(yesterdayServerTime);

        console.log(`[Cron SendDailyReports] Processing for date: ${yesterdayDateString} for ${subscribersSnapshot.size} subscribers.`);

        let successfulSends = 0;
        let failedSends = 0;

        for (const doc of subscribersSnapshot.docs) {
            const subData = doc.data();
            const chatId = subData.chatId;
            const firstName = subData.firstName || "Subscriber"; // Get first name if available

            if (!chatId) {
                console.warn(`[Cron SendDailyReports] Subscriber document ${doc.id} missing chatId. Skipping.`);
                failedSends++;
                continue;
            }
            console.log(`[Cron SendDailyReports] Processing for chat ID: ${chatId} (${firstName})`);

            try {
                const cleanVercelAppUrl = VERCEL_APP_URL!.endsWith('/') ? VERCEL_APP_URL!.slice(0, -1) : VERCEL_APP_URL!;
                const apiUrl = `${cleanVercelAppUrl}/api/manager/sales-transactions/export?startDate=${yesterdayDateString}&endDate=${yesterdayDateString}&status=SOLD&limit=10000`;
                
                console.log(`[Cron SendDailyReports] Calling export API for ${chatId}: ${apiUrl}`);
                const apiResponse = await fetch(apiUrl);

                if (!apiResponse.ok) {
                    const errorText = await apiResponse.text();
                    console.error(`[Cron SendDailyReports] Export API Error for chat ID ${chatId} (${apiResponse.status}): ${errorText.substring(0, 200)}`);
                    // Optionally send a message to the user that their report couldn't be generated
                    await sendTelegramMessage(chatId, `Sorry, there was an issue generating your daily sales report for ${escapeMarkdownV2(yesterdayDateString)}\\. Please try requesting it manually later or contact support if the issue persists\\.`);
                    failedSends++;
                    continue; // Continue to the next subscriber
                }

                const exportData: { transactions: any[], totalRecords: number } = await apiResponse.json();
                const transactionsToExport = exportData.transactions;

                if (transactionsToExport && transactionsToExport.length > 0) {
                    console.log(`[Cron SendDailyReports] Found ${transactionsToExport.length} transactions for ${chatId}. Generating Excel...`);
                    const workbook = new exceljs.Workbook();
                    workbook.creator = 'DryFruitManager DailyReport';
                    workbook.lastModifiedBy = 'DryFruitManager DailyReport';
                    workbook.created = new Date();
                    workbook.modified = new Date();
                    const worksheet = workbook.addWorksheet(`Sales ${yesterdayDateString}`);

                    const headers = [ // Same headers as in bot/route.ts
                        { header: 'Date of Sale', key: 'dateOfSale', width: 15 },
                        { header: 'Timestamp', key: 'timestamp', width: 25 },
                        { header: 'Staff ID', key: 'staffId', width: 15 },
                        { header: 'Product Name', key: 'product_articleName', width: 35 },
                        { header: 'Weight (g)', key: 'weightGrams', width: 15, style: { numFmt: '0.00' } },
                        { header: 'Sell Price (₹)', key: 'calculatedSellPrice', width: 18, style: { numFmt: '"₹"#,##0.00' } },
                        { header: 'Barcode', key: 'barcodeScanned', width: 20 },
                        { header: 'Status', key: 'status', width: 12 },
                    ];
                    worksheet.columns = headers;
                    worksheet.getRow(1).font = { bold: true };

                    transactionsToExport.forEach(tx => {
                        const rowData: any = {};
                        headers.forEach(header => {
                            let value = tx[header.key];
                            if (header.key === 'timestamp' && value) {
                                try {
                                    value = new Date(value).toLocaleString('en-IN', { timeZone: IST_TIMEZONE_SERVER });
                                } catch (e) {
                                    console.warn(`[Cron SendDailyReports] Could not format timestamp ${value} for chat ${chatId}: ${e}`);
                                }
                            }
                            if (header.key === 'dateOfSale' && typeof value === 'string' && value.includes('T')) {
                                value = value.split('T')[0];
                            }
                            rowData[header.key] = value !== undefined && value !== null ? value : '';
                        });
                        worksheet.addRow(rowData);
                    });
                    
                    const buffer = await workbook.xlsx.writeBuffer() as Buffer;
                    const filename = `DailySales_${yesterdayDateString.replace(/-/g, '')}.xlsx`;
                    const caption = `Hi ${escapeMarkdownV2(firstName)}\\,\nHere is your daily sales report for ${escapeMarkdownV2(yesterdayDateString)}\\.`;
                    
                    await sendTelegramDocument(chatId, buffer, filename, caption);
                    console.log(`[Cron SendDailyReports] Sent report to ${chatId}`);
                    successfulSends++;
                } else {
                    console.log(`[Cron SendDailyReports] No sales data to report for ${chatId} on ${yesterdayDateString}.`);
                    const noDataMessage = `Hi ${escapeMarkdownV2(firstName)}\\,\nNo sales transactions were recorded for ${escapeMarkdownV2(yesterdayDateString)}\\.`;
                    await sendTelegramMessage(chatId, noDataMessage);
                    successfulSends++; // Still a successful interaction
                }
            } catch (userError: any) {
                console.error(`[Cron SendDailyReports] Error processing report for chat ID ${chatId}:`, userError.message, userError.stack);
                // Optionally notify admin or the user about the failure for their specific report
                await sendTelegramMessage(chatId, `Sorry ${escapeMarkdownV2(firstName)}\\, we encountered an error while generating your daily report for ${escapeMarkdownV2(yesterdayDateString)}\\. Please try requesting it manually or contact support\\.`);
                failedSends++;
            }
            // Small delay to avoid hitting Telegram rate limits, especially if many users.
            // Adjust delay as needed. 1 second might be too long if you have hundreds of users.
            // Telegram general limit is 30 messages/sec, but 1 message/sec to the same chat is safer.
            await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
        }
        console.log(`[Cron SendDailyReports] Processing complete. Successful: ${successfulSends}, Failed: ${failedSends}`);
        return NextResponse.json({ message: `Processed ${subscribersSnapshot.size} subscribers. Successful: ${successfulSends}, Failed: ${failedSends}` });

    } catch (error: any) {
        console.error("[Cron SendDailyReports] General error during cron execution:", error.message, error.stack);
        return NextResponse.json({ error: 'Failed to send daily reports due to a general error.' }, { status: 500 });
    }
}