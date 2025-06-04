// app/api/telegram/bot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import exceljs from 'exceljs'; // For Excel generation
import { db } from '@/lib/firebaseAdmin'; // For Firestore
import { FieldValue } from 'firebase-admin/firestore'; // For serverTimestamp

// --- Interfaces (Kept from both, as they are consistent) ---
interface TelegramChat {
    id: number;
    type: string;
    first_name?: string;
    last_name?: string;
    username?: string;
}

interface TelegramMessage {
    message_id: number;
    from?: {
        id: number;
        is_bot: boolean;
        first_name: string;
        last_name?: string;
        username?: string;
        language_code?: string;
    };
    chat: TelegramChat;
    date: number; // Unix timestamp
    text?: string;
}

interface TelegramRequestBody {
    update_id: number;
    message?: TelegramMessage;
}

interface DailySummaryItem {
    date: string;
    totalSalesValue: number;
    totalTransactions: number;
}

interface ApiSalesResponse {
    dailySummaries: DailySummaryItem[];
}

// --- Environment Variables and Constants ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_PASSWORD = process.env.BOT_PASSWORD;
const VERCEL_APP_URL = process.env.VERCEL_APP_URL;

const authenticatedUsers = new Set<number>();

const IST_TIMEZONE_SERVER = 'Asia/Kolkata';

// --- Helper Functions ---
function escapeMarkdownV2(text: string): string {
    if (typeof text !== 'string') return '';
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function sendTelegramMessage(chatId: number, text: string, parseMode: "MarkdownV2" | "HTML" | undefined = "MarkdownV2") {
    console.log(`[Bot sendTelegramMessage] Sending to chat ${chatId}: ${text.substring(0, 100)}...`);
    if (!TELEGRAM_BOT_TOKEN) {
        console.error("[Bot sendTelegramMessage] TELEGRAM_BOT_TOKEN is not set!");
        return;
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
            console.error("[Bot sendTelegramMessage] Telegram API sendMessage error:", errorData);
        }
    } catch (error) {
        console.error("[Bot sendTelegramMessage] Error sending Telegram message:", error);
    }
}

async function sendTelegramDocument(chatId: number, fileBuffer: Buffer, filename: string, caption?: string) {
    console.log(`[Bot sendTelegramDocument] Sending document ${filename} to chat ${chatId}`);
    if (!TELEGRAM_BOT_TOKEN) {
        console.error("[Bot sendTelegramDocument] TELEGRAM_BOT_TOKEN is not set!");
        return;
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
            console.error("[Bot sendTelegramDocument] Telegram API sendDocument error:", errorData, `Response status: ${response.status}`);
        } else {
            console.log(`[Bot sendTelegramDocument] Document ${filename} sent successfully to chat ${chatId}.`);
        }
    } catch (error) {
        console.error("[Bot sendTelegramDocument] Error sending Telegram document:", error);
    }
}

function isValidDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateString.match(regex)) return false;
    const date = new Date(dateString);
    const timestamp = date.getTime();
    if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return false;
    return date.toISOString().startsWith(dateString);
}

const getISODateStringInIST = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE_SERVER, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(date);
};

// --- Main Handler ---
export async function POST(req: NextRequest) {
    console.log("[Bot Handler POST] Received a request.");

    if (!TELEGRAM_BOT_TOKEN || !BOT_PASSWORD || !VERCEL_APP_URL) {
        console.error("[Bot Handler POST] CRITICAL: Missing one or more required environment variables (TELEGRAM_BOT_TOKEN, BOT_PASSWORD, VERCEL_APP_URL)!");
        return NextResponse.json({ error: "Bot misconfigured internally. Required environment variables missing." }, { status: 500 });
    }

    let body: TelegramRequestBody;
    try {
        body = await req.json();
    } catch (e) {
        console.error("[Bot Handler POST] Failed to parse request body:", e);
        return NextResponse.json({ error: "Bad Request: Invalid JSON" }, { status: 400 });
    }

    const { message } = body;

    if (!message || !message.chat || !message.text) {
        console.log("[Bot Handler POST] Received non-message update or message without text/chat. Ignoring.");
        return NextResponse.json({ status: "ok", message: "No action taken for this update type" });
    }

    const chatId: number = message.chat.id;
    const text: string = message.text.trim();
    const [commandWithSlash, ...args] = text.split(' ');
    const command: string = commandWithSlash.startsWith('/') ? commandWithSlash.toLowerCase() : `/${commandWithSlash.toLowerCase()}`;

    console.log(`[Bot Handler POST] Processing command: ${command} for chat ID: ${chatId}, Args: [${args.join(', ')}]`);

    if (command === '/start') {
        await sendTelegramMessage(chatId, `Welcome to the Dry Fruit Manager Bot\\!\nPlease authenticate using the command: \`/password \\<your_password\\>\``);
        return NextResponse.json({ status: "ok" });
    }

    if (command === '/password') {
        const providedPassword = args[0];
        if (providedPassword && providedPassword === BOT_PASSWORD) {
            authenticatedUsers.add(chatId);
            console.log(`[Bot POST /password] User ${chatId} authenticated successfully.`);
            const menuText = "Authentication successful\\!\n\n" +
                             "What would you like to do\\?\n" +
                             "1\\. Get Sales Summary: `/getsummary YYYY\\-MM\\-DD YYYY\\-MM\\-DD`\n" +
                             "   \\(e\\.g\\., `/getsummary 2024\\-01\\-01 2024\\-01\\-05`\\)\n" +
                             "2\\. Export Yesterday's Sales: `/exportyesterday`\n" +
                             "3\\. Subscribe to Daily Reports: `/subscribedaily`\n" +
                             "4\\. Unsubscribe from Daily Reports: `/unsubscribedaily`\n\n" +
                             "Use `/help` to see all commands again\\.";
            await sendTelegramMessage(chatId, menuText);
        } else {
            authenticatedUsers.delete(chatId);
            console.log(`[Bot POST /password] User ${chatId} authentication failed. Provided: '${providedPassword || ''}'`);
            await sendTelegramMessage(chatId, "Authentication failed\\. Please use `/password \\<your_password\\>` with the correct password\\. If you forgot the password, contact the administrator\\.");
        }
        return NextResponse.json({ status: "ok" });
    }

    if (!authenticatedUsers.has(chatId)) {
        console.log(`[Bot POST] User ${chatId} not authenticated. Command: ${command}`);
        await sendTelegramMessage(chatId, "You are not authenticated\\. Please use `/start` and then `/password \\<your_password\\>` to authenticate\\.");
        return NextResponse.json({ status: "ok" });
    }

    // --- Authenticated Commands ---

    if (command === '/subscribedaily') {
        try {
            const subDocRef = db.collection('telegramBotSubscriptions').doc(String(chatId));
            const docSnap = await subDocRef.get();
            const firstName = message.from?.first_name || "User"; // Get user's first name, default to "User"

            if (docSnap.exists && docSnap.data()?.isActive) {
                await sendTelegramMessage(chatId, "You are already subscribed to daily reports\\.");
            } else {
                await subDocRef.set({
                    chatId: chatId,
                    firstName: escapeMarkdownV2(firstName), // Escape name in case it has special chars
                    subscribedAt: FieldValue.serverTimestamp(),
                    isActive: true
                }, { merge: true }); // merge: true will update if doc exists but isActive was false
                await sendTelegramMessage(chatId, "You have successfully subscribed to daily sales reports\\! You will receive an Excel file every morning around 6 AM IST\\.");
            }
        } catch (error: any) {
            console.error("[Bot /subscribedaily] Error:", error);
            await sendTelegramMessage(chatId, "Sorry, there was an error processing your subscription request\\. Please try again later\\.");
        }
        return NextResponse.json({ status: "ok" });
    }

    if (command === '/unsubscribedaily') {
        try {
            const subDocRef = db.collection('telegramBotSubscriptions').doc(String(chatId));
            const docSnap = await subDocRef.get();

            if (docSnap.exists && docSnap.data()?.isActive) {
                await subDocRef.update({ 
                    isActive: false,
                    unsubscribedAt: FieldValue.serverTimestamp() // Optionally track when they unsubscribed
                });
                await sendTelegramMessage(chatId, "You have been unsubscribed from daily reports\\.");
            } else {
                await sendTelegramMessage(chatId, "You were not actively subscribed to daily reports\\.");
            }
        } catch (error: any) {
            console.error("[Bot /unsubscribedaily] Error:", error);
            await sendTelegramMessage(chatId, "Sorry, there was an error processing your unsubscription request\\. Please try again later\\.");
        }
        return NextResponse.json({ status: "ok" });
    }

    if (command === '/getsummary') {
        console.log(`[Bot POST /getsummary] Authenticated user ${chatId} requesting summary.`);
        if (args.length !== 2) {
            await sendTelegramMessage(chatId, "Invalid format\\. Please use: `/getsummary \\<YYYY\\-MM\\-DD_start\\> \\<YYYY\\-MM\\-DD_end\\>`\nExample: `/getsummary 2023\\-01\\-01 2023\\-01\\-05`");
            return NextResponse.json({ status: "ok" });
        }
        const startDate = args[0];
        const endDate = args[1];

        if (!isValidDate(startDate) || !isValidDate(endDate)) {
            await sendTelegramMessage(chatId, "Invalid date format\\. Dates must be YYYY\\-MM\\-DD and valid dates\\.\nExample: `/getsummary 2023\\-01\\-01 2023\\-01\\-05`");
            return NextResponse.json({ status: "ok" });
        }

        try {
            const escapedStartDate = escapeMarkdownV2(startDate);
            const escapedEndDate = escapeMarkdownV2(endDate);
            await sendTelegramMessage(chatId, `Fetching summary from ${escapedStartDate} to ${escapedEndDate}\\.\\.\\.`);
            
            const cleanVercelAppUrl = VERCEL_APP_URL!.endsWith('/') ? VERCEL_APP_URL!.slice(0, -1) : VERCEL_APP_URL!;
            const apiUrl = `${cleanVercelAppUrl}/api/manager/sales-transactions?mode=dailySummaries&startDate=${startDate}&endDate=${endDate}`;
            
            console.log(`[Bot /getsummary] Calling API: ${apiUrl}`);
            const apiResponse = await fetch(apiUrl);
            const responseStatus = apiResponse.status;
            const responseTextForLog = await apiResponse.text(); 

            console.log(`[Bot /getsummary] API Response Status: ${responseStatus}`);

            if (!apiResponse.ok) {
                console.error(`[Bot /getsummary] API Error (${responseStatus}) from ${apiUrl}. Body: ${responseTextForLog.substring(0, 500)}`);
                const shortErrorDetail = responseTextForLog.substring(0, 100);
                await sendTelegramMessage(chatId, `Error fetching data from API: Status ${responseStatus}\\. Details: ${escapeMarkdownV2(shortErrorDetail)}\\.\\.\\.`);
                return NextResponse.json({ status: "ok" });
            }

            let parsedApiResponse: ApiSalesResponse;
            try {
                parsedApiResponse = JSON.parse(responseTextForLog);
            } catch (jsonError: any) {
                console.error("[Bot /getsummary] Failed to parse API response as JSON:", jsonError.message);
                console.error("[Bot /getsummary] Raw response was:", responseTextForLog.substring(0, 500));
                await sendTelegramMessage(chatId, "Error: API returned data in an unexpected format\\. Could not parse JSON response\\.");
                return NextResponse.json({ status: "ok" });
            }

            const summariesArray: DailySummaryItem[] | undefined = parsedApiResponse.dailySummaries;

            if (Array.isArray(summariesArray) && summariesArray.length > 0) {
                let responseMessageText = `*Daily Sales Summaries \\(${escapedStartDate} to ${escapedEndDate}\\)*:\n\n`;
                summariesArray.forEach(summary => {
                    const escapedItemDate = escapeMarkdownV2(summary.date);
                    const salesValue = summary.totalSalesValue?.toFixed(2) || 'N/A';
                    const transactions = summary.totalTransactions || 'N/A';
                    responseMessageText += `*Date: ${escapedItemDate}*\n` +
                                    `  Total Sales: ₹${escapeMarkdownV2(salesValue)}\n` +
                                    `  Total Transactions: ${escapeMarkdownV2(String(transactions))}\n\n`;
                });
                await sendTelegramMessage(chatId, responseMessageText);
            } else {
                console.log(`[Bot /getsummary] No data found in summariesArray or it's empty/undefined. summariesArray was:`, JSON.stringify(summariesArray));
                await sendTelegramMessage(chatId, `No sales summary data found for the period ${escapedStartDate} to ${escapedEndDate}\\.`);
            }

        } catch (error: any) {
            console.error("[Bot /getsummary] Error processing command:", error);
            const escapedErrorMessage = error.message ? escapeMarkdownV2(String(error.message)) : "An unknown error occurred";
            await sendTelegramMessage(chatId, `An unexpected error occurred while fetching summary: ${escapedErrorMessage}`);
        }
        return NextResponse.json({ status: "ok" });
    }

    if (command === '/exportyesterday') {
        console.log(`[Bot POST /exportyesterday] Authenticated user ${chatId} requesting yesterday's export.`);
        await sendTelegramMessage(chatId, "Generating yesterday's sales export\\.\\.\\. This may take a moment\\.");

        try {
            const todayServerTime = new Date();
            const yesterdayServerTime = new Date(todayServerTime);
            yesterdayServerTime.setDate(todayServerTime.getDate() - 1);
            const yesterdayDateString = getISODateStringInIST(yesterdayServerTime); 

            console.log(`[Bot /exportyesterday] Exporting for date (IST): ${yesterdayDateString}`);

            const cleanVercelAppUrl = VERCEL_APP_URL!.endsWith('/') ? VERCEL_APP_URL!.slice(0, -1) : VERCEL_APP_URL!;
            const apiUrl = `${cleanVercelAppUrl}/api/manager/sales-transactions/export?startDate=${yesterdayDateString}&endDate=${yesterdayDateString}&status=SOLD&limit=10000`; 
            
            console.log(`[Bot /exportyesterday] Calling export API: ${apiUrl}`);
            const apiResponse = await fetch(apiUrl);

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                console.error(`[Bot /exportyesterday] Export API Error (${apiResponse.status}): ${errorText.substring(0, 500)}`);
                await sendTelegramMessage(chatId, `Failed to fetch export data: Status ${apiResponse.status}\\. ${escapeMarkdownV2(errorText.substring(0,100))}`);
                return NextResponse.json({ status: "ok" });
            }

            const exportData: { transactions: any[], totalRecords: number } = await apiResponse.json();
            const transactionsToExport = exportData.transactions;

            if (!transactionsToExport || transactionsToExport.length === 0) {
                await sendTelegramMessage(chatId, `No sales transactions found to export for ${escapeMarkdownV2(yesterdayDateString)}\\.`);
                return NextResponse.json({ status: "ok" });
            }

            console.log(`[Bot /exportyesterday] Fetched ${transactionsToExport.length} transactions for export.`);

            const workbook = new exceljs.Workbook();
            workbook.creator = 'DryFruitManagerBot';
            workbook.lastModifiedBy = 'DryFruitManagerBot';
            workbook.created = new Date();
            workbook.modified = new Date();
            const worksheet = workbook.addWorksheet(`Sales ${yesterdayDateString}`);

            const headers = [
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
                            console.warn(`[Bot /exportyesterday] Could not format timestamp ${value}: ${e}`);
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
            const filename = `SalesExport_${yesterdayDateString.replace(/-/g, '')}.xlsx`;

            const captionText = `Sales Export for ${escapeMarkdownV2(yesterdayDateString)} containing ${transactionsToExport.length} transactions\\.`;
            await sendTelegramDocument(chatId, buffer, filename, captionText);

        } catch (error: any) {
            console.error("[Bot /exportyesterday] Error processing command:", error);
            await sendTelegramMessage(chatId, `An error occurred while generating the export: ${escapeMarkdownV2(error.message)}`);
        }
        return NextResponse.json({ status: "ok" });
    }

    if (command === '/help') {
        console.log(`[Bot POST /help] Authenticated user ${chatId} requested help.`);
        const helpText = "You are authenticated\\.\n\n" +
                       "*Available Commands:*\n" +
                       "`/getsummary \\<YYYY\\-MM\\-DD_start\\> \\<YYYY\\-MM\\-DD_end\\>`\n" +
                       "  \\- Get daily sales summaries for the specified date range\\.\n" +
                       "  _Example:_ `/getsummary 2024\\-01\\-01 2024\\-01\\-05`\n\n" +
                       "`/exportyesterday`\n" +
                       "  \\- Export yesterday's sales transactions as an Excel file\\.\n\n" +
                       "`/subscribedaily`\n" +
                       "  \\- Subscribe to receive daily sales reports automatically every morning\\.\n\n" +
                       "`/unsubscribedaily`\n" +
                       "  \\- Unsubscribe from daily sales reports\\.\n\n" +
                       "`/help`\n" +
                       "  \\- Show this help message\\.\n\n" +
                       "To re\\-authenticate or if issues persist, you might need to use `/start` again followed by `/password \\<your_password\\>`\\.";
        await sendTelegramMessage(chatId, helpText);
        return NextResponse.json({ status: "ok" });
    }

    console.log(`[Bot Handler POST] Unknown command '${command}' for authenticated user ${chatId}.`);
    await sendTelegramMessage(chatId, `Unknown command: \`${escapeMarkdownV2(command)}\`\\. Use /help to see available commands\\.`);
    return NextResponse.json({ status: "ok" });
}

export async function GET(req: NextRequest) {
    console.log("[Bot Handler GET] Received a GET request.");
    return NextResponse.json({ status: "ok", message: "Telegram bot webhook is active. Send POST requests for bot commands." });
}