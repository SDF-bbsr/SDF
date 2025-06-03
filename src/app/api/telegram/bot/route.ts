// app/api/telegram/bot/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Define types for Telegram message and chat for better type safety
interface TelegramChat {
    id: number;
    type: string; // "private", "group", "supergroup", or "channel"
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
    // Add other message fields if needed (entities, photo, etc.)
}

interface TelegramRequestBody {
    update_id: number;
    message?: TelegramMessage;
    // Add other update types if needed (edited_message, callback_query, etc.)
}


const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_PASSWORD = process.env.BOT_PASSWORD;
const VERCEL_APP_URL = process.env.VERCEL_APP_URL;

if (!TELEGRAM_BOT_TOKEN || !BOT_PASSWORD || !VERCEL_APP_URL) {
    console.error("Missing one or more required environment variables: TELEGRAM_BOT_TOKEN, BOT_PASSWORD, VERCEL_APP_URL");
    // Optional: throw an error during build/startup if you prefer to fail fast
}

// Simple in-memory store for authenticated users.
const authenticatedUsers = new Set<number>(); // Store chat IDs (numbers)

async function sendTelegramMessage(chatId: number, text: string, parseMode: "MarkdownV2" | "HTML" | undefined = "MarkdownV2") {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: parseMode }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Telegram API sendMessage error:", errorData);
        }
    } catch (error) {
        console.error("Error sending Telegram message:", error);
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

// Main handler for POST requests
export async function POST(req: NextRequest) {
    if (!TELEGRAM_BOT_TOKEN || !BOT_PASSWORD || !VERCEL_APP_URL) {
         // This check is more for runtime if somehow the env vars aren't loaded
        await sendTelegramMessage(0, "Bot misconfiguration: Critical environment variables missing. Please contact admin."); // Send to a dummy chat ID or log
        return NextResponse.json({ error: "Bot misconfigured" }, { status: 500 });
    }

    let body: TelegramRequestBody;
    try {
        body = await req.json();
    } catch (e) {
        console.error("Failed to parse request body:", e);
        return NextResponse.json({ error: "Bad Request: Invalid JSON" }, { status: 400 });
    }

    const { message } = body;

    if (!message || !message.chat || !message.text) {
        console.log("Received non-message update or message without text/chat.");
        return NextResponse.json({ status: "ok", message: "No action taken" }); // Acknowledge Telegram
    }

    const chatId: number = message.chat.id;
    const text: string = message.text.trim();
    const [commandWithSlash, ...args] = text.split(' ');
    const command: string = commandWithSlash.startsWith('/') ? commandWithSlash : `/${commandWithSlash}`;

    // --- Authentication ---
    if (command === '/start') {
        const providedPassword = args[0];
        if (providedPassword && providedPassword === BOT_PASSWORD) {
            authenticatedUsers.add(chatId);
            await sendTelegramMessage(chatId, "Authentication successful\\! You can now use `/getsummary <YYYY-MM-DD_start> <YYYY-MM-DD_end>`\\.");
        } else {
            authenticatedUsers.delete(chatId);
            await sendTelegramMessage(chatId, "Authentication failed\\. Please use `/start <your_password>`\\.");
        }
        return NextResponse.json({ status: "ok" });
    }

    if (!authenticatedUsers.has(chatId)) {
        await sendTelegramMessage(chatId, "You are not authenticated\\. Please use `/start <your_password>` first\\.");
        return NextResponse.json({ status: "ok" });
    }

    // --- Command Handling ---
    if (command === '/getsummary') {
        if (args.length !== 2) {
            await sendTelegramMessage(chatId, "Invalid format\\. Please use: `/getsummary <YYYY-MM-DD_start> <YYYY-MM-DD_end>`");
            return NextResponse.json({ status: "ok" });
        }
        const startDate = args[0];
        const endDate = args[1];

        if (!isValidDate(startDate) || !isValidDate(endDate)) {
            await sendTelegramMessage(chatId, "Invalid date format\\. Dates must be YYYY\\-MM\\-DD\\.");
            return NextResponse.json({ status: "ok" });
        }

        try {
            await sendTelegramMessage(chatId, `Fetching summary from ${startDate} to ${endDate}\\.\\.\\.`);
            const apiUrl = `${VERCEL_APP_URL}/api/manager/sales-transactions?mode=dailySummaries&startDate=${startDate}&endDate=${endDate}`;
            
            console.log(`Calling API: ${apiUrl}`); // For debugging
            const apiResponse = await fetch(apiUrl);

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                console.error(`API Error (${apiResponse.status}) from ${apiUrl}: ${errorText}`);
                await sendTelegramMessage(chatId, `Error fetching data from API: Status ${apiResponse.status}\\. Please check server logs for details on the API call to \`${VERCEL_APP_URL?.replace(/\./g, '\\.')}/\\.\\.\\.\`\\.`);
                return NextResponse.json({ status: "ok" });
            }

            // Define an interface for your API's daily summary item
            interface DailySummaryItem {
                date: string;
                totalSalesValue: number;
                totalTransactions: number;
            }

            const data: DailySummaryItem[] = await apiResponse.json();

            if (Array.isArray(data) && data.length > 0) {
                let responseText = `*Daily Sales Summaries (${startDate} to ${endDate})*:\n\n`;
                data.forEach(summary => {
                    responseText += `*Date: ${summary.date.replace(/-/g, '\\-')}*\n` + // Escape hyphens in dates
                                    `  Total Sales: ${summary.totalSalesValue?.toFixed(2) || 'N/A'}\n` +
                                    `  Total Transactions: ${summary.totalTransactions || 'N/A'}\n\n`;
                });
                await sendTelegramMessage(chatId, responseText);
            } else {
                await sendTelegramMessage(chatId, `No sales summary data found for the period ${startDate.replace(/-/g, '\\-')} to ${endDate.replace(/-/g, '\\-')}\\.`);
            }

        } catch (error: any) {
            console.error("Error processing /getsummary command:", error);
            // Escape the error message for MarkdownV2
            const escapedErrorMessage = error.message ? String(error.message).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&') : "An unknown error occurred";
            await sendTelegramMessage(chatId, `An unexpected error occurred: ${escapedErrorMessage}`);
        }
        return NextResponse.json({ status: "ok" });
    }

    // --- Help Command ---
    if (command === '/help') {
        let helpText = "Available Commands:\n" +
                       "`/start <password>` \\- Authenticate to use the bot\\.\n" +
                       "`/getsummary <YYYY-MM-DD_start> <YYYY-MM-DD_end>` \\- Fetch daily sales summaries for the given date range\\.";
        if (authenticatedUsers.has(chatId)) {
            helpText = "You are authenticated\\.\n" + helpText.substring(helpText.indexOf("Available Commands:"));
        }
        await sendTelegramMessage(chatId, helpText);
        return NextResponse.json({ status: "ok" });
    }

    // Fallback for unknown commands if authenticated
    await sendTelegramMessage(chatId, "Unknown command\\. Use /help to see available commands\\.");
    return NextResponse.json({ status: "ok" });
}

// Optional: If you want to handle GET requests to this endpoint (e.g., for health checks by Vercel)
export async function GET(req: NextRequest) {
    return NextResponse.json({ status: "ok", message: "Telegram bot webhook is active. Send POST requests." });
}