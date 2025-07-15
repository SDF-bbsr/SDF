// src/app/recruiter/manager-demo/stock/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
    ChevronDown, ChevronRight, Edit3, Loader2, AlertCircle, PlusCircle, RefreshCw, CalendarDays, Search, History, Lightbulb, 
    AlertTriangle, CheckCircle, TrendingDown, ListChecks // <-- ADDED ICONS
} from 'lucide-react'; // Removed ChevronsLeft, ChevronsRight
import { toast as sonnerToast, Toaster } from 'sonner';

interface MonthlyStockLedgerItem {
    closingStockKg: number;
    lastSalesSyncDateForMonth: string | null;
    lastUpdated: string;
    month: string;
    openingStockKg: number;
    productArticleNo: string;
    productName: string;
    restockEntriesThisMonth?: {
        [timestamp: string]: {
            [randomNumber: string]: {
                date: string;
                notes?: string;
                quantityKg: number;
            };
        };
    };
    totalRestockedThisMonthKg: number;
    totalSoldThisMonthKg: number;
    year: string;
}

interface ProductListItem {
    id: string; 
    name: string;
    articleNumber: string; 
}

// ADD the NEW type definitions for the AI response
interface FirestoreTimestamp {
    _seconds: number;
    _nanoseconds: number;
  }
  interface HighRiskProduct {
    productName: string;
    currentStockKg: number;
    totalSoldKg: number;
    recommendedReplenishmentKg: string;
    notes: string;
  }
  interface StatusItem {
    productName: string;
    reason: string;
  }
  interface AIStockInsightResponse {
    summary: string;
    highRiskProducts: HighRiskProduct[];
    statusReport: {
      wellStocked: StatusItem[];
      slowMoving: StatusItem[];
    };
    recommendations: string[];
    generatedAt: FirestoreTimestamp;
    sourceMonth: string;
  }

// const ITEMS_PER_PAGE = 30; // Removed
const IST_TIMEZONE = 'Asia/Kolkata';

const formatTimestampToIST = (utcTimestamp: string | Date): string => {
    try {
        const date = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp;
        return date.toLocaleString('en-IN', {
            timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    } catch (e) { return "Invalid Date"; }
};

// ADD this new helper function to format the Firestore timestamp object
const formatFirestoreTimestamp = (ts: FirestoreTimestamp | undefined): string => {
    if (!ts?._seconds) return 'N/A';
    const date = new Date(ts._seconds * 1000);
    return formatTimestampToIST(date);
};

const getCurrentMonthYYYYMM = () => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
};

const getMonthOptions = () => {
    const options = []; const today = new Date();
    for (let i = 0; i < 12; i++) { const d = new Date(today.getFullYear(), today.getMonth() - i, 1); options.push({ value: `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`, label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) });}
    options.sort((a, b) => b.value.localeCompare(a.value)); return options;
};

export default function StockLedgerPage() {
    const [productList, setProductList] = useState<ProductListItem[]>([]);
    const [allLedgerDataForMonth, setAllLedgerDataForMonth] = useState<MonthlyStockLedgerItem[]>([]);
    const [displayedLedgerData, setDisplayedLedgerData] = useState<MonthlyStockLedgerItem[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    // const [isPaginating, setIsPaginating] = useState(false); // Removed
    const [isSyncingVisible, setIsSyncingVisible] = useState(false);
    const [isSyncingEntireMonth, setIsSyncingEntireMonth] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthYYYYMM());
    const [searchTerm, setSearchTerm] = useState<string>('');

    const [isAddStockDialogOpen, setIsAddStockDialogOpen] = useState(false);
    const [selectedProductForRestock, setSelectedProductForRestock] = useState<string>('');
    const [restockQuantityKg, setRestockQuantityKg] = useState<string>('');
    const [restockDate, setRestockDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [restockNotes, setRestockNotes] = useState<string>('');
    const [isAddingStock, setIsAddingStock] = useState(false);

    const [isEditOpeningStockDialogOpen, setIsEditOpeningStockDialogOpen] = useState(false);
    const [editingStockItem, setEditingStockItem] = useState<MonthlyStockLedgerItem | null>(null);
    const [newOpeningStockKg, setNewOpeningStockKg] = useState<string>('');
    const [isUpdatingOpeningStock, setIsUpdatingOpeningStock] = useState(false);

    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

    const [restockInsight, setRestockInsight] = useState<AIStockInsightResponse | null>(null);
    const [isInsightLoading, setIsInsightLoading] = useState(true);
    const [isInsightExpanded, setIsInsightExpanded] = useState(false);

    // Removed pagination state: currentPage, pageCursors, hasNextPage

    const monthOptions = useMemo(() => getMonthOptions(), []);

    // --- vvv MODIFY THIS useEffect HOOK vvv ---
    useEffect(() => {
        const fetchInsight = async () => {
            setIsInsightLoading(true);
            try {
                const response = await fetch('/api/insights/getinsights/stock');
                if (response.status === 404) {
                    setRestockInsight(null);
                    return; 
                }
                if (!response.ok) {
                    throw new Error('Failed to fetch the restock analysis.');
                }
                // The API now returns the full structured object
                const data: AIStockInsightResponse = await response.json();
                setRestockInsight(data); // Set the entire object to state
            } catch (error: any) {
                console.error("Could not fetch AI insight:", error.message);
                setRestockInsight(null);
            } finally {
                setIsInsightLoading(false);
            }
        };
        fetchInsight();
    }, []); // This runs once on component mount.

    const fetchProductList = useCallback(async () => {
        try {
            const response = await fetch('/api/manager/products-list');
            if (!response.ok) throw new Error('Failed to fetch product list');
            const dataFromApi: { id: string, name: string }[] = await response.json();
            const formattedProductList = dataFromApi.map(p => ({
                id: p.id,
                name: p.name,
                articleNumber: p.id 
            }));
            setProductList(formattedProductList);
            console.log(`[Stock Page] Fetched ${formattedProductList.length} products for selection.`);
        } catch (err: any) {
            sonnerToast.error("Product list error: " + err.message);
            setProductList([]);
        }
    }, []);

    const fetchStockLedgerData = useCallback(async (monthToFetch: string) => {
        setIsLoading(true);
        setError(null);
        
        const queryParams = `month=${monthToFetch}`; // No limit or startAfter

        try {
            const response = await fetch(`/api/manager/stock-ledger?${queryParams}`);
            if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || 'Ledger fetch failed'); }
            
            // API will now return just { items: MonthlyStockLedgerItem[] }
            const data: { items: MonthlyStockLedgerItem[] } = await response.json();
            
            setAllLedgerDataForMonth(data.items || []);
            setDisplayedLedgerData(data.items || []); 
            // No hasNextPage or pageCursors to update

        } catch (err: any) {
            setError(err.message); 
            setAllLedgerDataForMonth([]); 
            setDisplayedLedgerData([]);
            sonnerToast.error("Ledger fetch error: " + err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);


    useEffect(() => { fetchProductList(); }, [fetchProductList]);

    useEffect(() => {
        setExpandedRows({});
        setSearchTerm('');
        if (selectedMonth) {
            fetchStockLedgerData(selectedMonth);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth, fetchStockLedgerData]);

    useEffect(() => {
        if (!searchTerm) {
            setDisplayedLedgerData(allLedgerDataForMonth);
            return;
        }
        const lowerSearchTerm = searchTerm.toLowerCase();
        const filtered = allLedgerDataForMonth.filter(item =>
            item.productName.toLowerCase().includes(lowerSearchTerm) ||
            item.productArticleNo.toLowerCase().includes(lowerSearchTerm)
        );
        setDisplayedLedgerData(filtered);
    }, [searchTerm, allLedgerDataForMonth]);

    const handleAddStock = async () => {
        if (!selectedProductForRestock || !restockQuantityKg || !selectedMonth || !restockDate) {
            sonnerToast.error("Product, quantity, month, and restock date are required.");
            return;
        }
        // Set the loading state for the button
        setIsAddingStock(true);
        setError(null);

        // Simulate the API call delay
        setTimeout(() => {
            // Show the info toast explaining this is a demo
            sonnerToast.info("This is a demo environment.", {
                description: "Adding new stock is disabled. In a real application, this would update the database.",
            });

            // Reset loading state, close dialog, and clear form after the toast appears
            setIsAddingStock(false);
            setIsAddStockDialogOpen(false);
            setSelectedProductForRestock('');
            setRestockQuantityKg('');
            setRestockNotes('');
            setRestockDate(new Date().toISOString().split('T')[0]);
            // Note: The call to fetchData() is removed as no data actually changes.
        }, 1000); // 1-second delay for simulation
    };

    const handleEditOpeningStock = (item: MonthlyStockLedgerItem) => {
        setEditingStockItem(item); setNewOpeningStockKg(String(item.openingStockKg)); setIsEditOpeningStockDialogOpen(true);
    };

    const handleUpdateOpeningStock = async () => {
        if (!editingStockItem || newOpeningStockKg === '') return;
        const parsedOpeningStock = parseFloat(newOpeningStockKg);
        if (isNaN(parsedOpeningStock) || parsedOpeningStock < 0) {
            sonnerToast.error("Invalid opening stock quantity.");
            return;
        }
        // Set the loading state for the button
        setIsUpdatingOpeningStock(true);
        setError(null);

        // Simulate the API call delay
        setTimeout(() => {
            // Show the info toast explaining this is a demo
            sonnerToast.info("This is a demo environment.", {
                description: "Updating opening stock is disabled. In a real application, this would update the database.",
            });

            // Reset loading state and close dialog after the toast appears
            setIsUpdatingOpeningStock(false);
            setIsEditOpeningStockDialogOpen(false);
            // Note: The call to fetchData() is removed as no data actually changes.
        }, 1000); // 1-second delay for simulation
    };

    const handleSyncVisibleSales = async () => {
        const itemsToSync = searchTerm ? displayedLedgerData : allLedgerDataForMonth;
        if (itemsToSync.length === 0) {
            sonnerToast.info("No products currently visible to sync.");
            return;
        }
        // Set the loading state for the button
        setIsSyncingVisible(true);
        setError(null);

        // Simulate the API call delay
        setTimeout(() => {
            // Show the info toast explaining this is a demo
            sonnerToast.info("This is a demo environment.", {
                description: "Syncing sales is disabled. In a real application, this would fetch latest sales data and update the ledger.",
            });

            // Reset loading state after the toast appears
            setIsSyncingVisible(false);
            // Note: The call to fetchData() is removed as no data actually changes.
        }, 1000); // 1-second delay for simulation
    };

    const handleSyncEntireMonthSales = async () => {
        if (productList.length === 0) {
            sonnerToast.info("Product list not loaded yet or is empty. Cannot sync all.");
            return;
        }
        if (!selectedMonth) {
            sonnerToast.error("Please select a month to sync.");
            return;
        }

        if (!confirm(`Are you sure you want to sync sales for ALL ${productList.length} products for ${monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth}? This might take some time. This is a Document Read Expensive task`)) {
            return;
        }
        
        // Set the loading state for the button
        setIsSyncingEntireMonth(true);
        setError(null);

        // Simulate the API call delay
        setTimeout(() => {
            // Show the info toast explaining this is a demo
            sonnerToast.info("This is a demo environment.", {
                description: "Syncing sales for the entire month is disabled. In a real application, this would update the ledger for all products.",
            });

            // Reset loading state after the toast appears
            setIsSyncingEntireMonth(false);
            // Note: The call to fetchData() is removed as no data actually changes.
        }, 1000); // 1-second delay for simulation
    };


    const toggleRowExpansion = (productArticleNo: string) => {
        setExpandedRows(prev => ({ ...prev, [productArticleNo]: !prev[productArticleNo] }));
    };

    const HighRiskTable = ({ products }: { products: HighRiskProduct[] }) => (
        <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="font-bold text-destructive">Product</TableHead>
                        <TableHead className="text-right font-bold text-destructive">Current Stock (kg)</TableHead>
                        <TableHead className="text-right font-bold text-destructive">Replenish (kg)</TableHead>
                        <TableHead className="font-bold text-destructive">Notes</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {products.map((p) => (
                        <TableRow key={p.productName} className={p.currentStockKg < 0 ? 'bg-red-50 dark:bg-red-900/20' : ''}>
                            <TableCell className="font-medium">{p.productName}</TableCell>
                            <TableCell className={`text-right font-bold ${p.currentStockKg < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                                {p.currentStockKg.toFixed(3)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-blue-600 dark:text-blue-400">
                                {p.recommendedReplenishmentKg}
                            </TableCell>
                            <TableCell className="text-sm">
                                <div className="flex items-center gap-2">
                                    {p.notes.toLowerCase().includes('negative stock') && <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                                    <span className={p.notes.toLowerCase().includes('negative stock') ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                                        {p.notes}
                                    </span>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    const RecommendationsCard = ({ recommendations }: { recommendations: string[] }) => (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <ListChecks className="h-5 w-5 text-blue-500" />
                    AI Recommendations
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="space-y-3">
                    {recommendations.map((rec, index) => (
                        <li key={index} className="flex items-start gap-3 text-sm">
                            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-800 dark:text-blue-200">
                                {index + 1}
                            </span>
                            <p className="text-muted-foreground">{rec}</p>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );

    const StatusList = ({ title, items, icon: Icon, iconColor }: { title: string; items: StatusItem[]; icon: React.ElementType; iconColor: string; }) => (
        <div>
            <h4 className={`mb-3 flex items-center gap-2 text-md font-semibold ${iconColor}`}>
                <Icon className="h-5 w-5" />
                {title}
            </h4>
            <ul className="space-y-3">
                {items.map(item => (
                    <li key={item.productName} className="border-l-2 pl-3 text-sm">
                        <p className="font-medium text-foreground">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                    </li>
                ))}
            </ul>
        </div>
    );

    const StatusReport = ({ statusReport }: { statusReport: AIStockInsightResponse['statusReport'] }) => (
        <Card>
            <CardHeader><CardTitle className="text-lg">Status Report</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                <StatusList title="Well-Stocked" items={statusReport.wellStocked} icon={CheckCircle} iconColor="text-green-600 dark:text-green-400" />
                <StatusList title="Slow-Moving" items={statusReport.slowMoving} icon={TrendingDown} iconColor="text-orange-500 dark:text-orange-400" />
            </CardContent>
        </Card>
    );

    return (
        <>
            <Toaster richColors position="top-right" />
            <div className="container mx-auto px-2 sm:px-4 py-8">
                {isInsightLoading && (
                    <Card className="mb-6 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                        <CardHeader className="flex flex-row items-center gap-3 py-3 px-4 sm:px-6">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                            <CardTitle className="text-base sm:text-lg text-blue-800 dark:text-blue-300">Loading AI Restock Analysis...</CardTitle>
                        </CardHeader>
                    </Card>
                )}

                {!isInsightLoading && restockInsight && (
                     <Card className="mb-6 border-amber-300 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-900/20">
                     <CardHeader className="p-0">
                         <button 
                             className="w-full flex justify-between items-center text-left px-4 py-3 sm:px-6"
                             onClick={() => setIsInsightExpanded(!isInsightExpanded)}
                             aria-expanded={isInsightExpanded}
                         >
                             <div className="flex items-center gap-3">
                                 <Lightbulb className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                 <div>
                                     <CardTitle className="text-base sm:text-lg text-amber-900 dark:text-amber-300">AI Stock Restock Insight</CardTitle>
                                     <CardDescription className="text-xs mt-1">
                                         Last generated: {formatFirestoreTimestamp(restockInsight.generatedAt)}
                                     </CardDescription>
                                 </div>
                             </div>
                             {isInsightExpanded ? (
                                 <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform" />
                             ) : (
                                 <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform" />
                             )}
                         </button>
                     </CardHeader>
                     {isInsightExpanded && (
                         <CardContent className="px-4 py-4 sm:px-6 space-y-8">
                             {/* 1. Overall Summary */}
                             <p className="text-sm text-foreground/80 border-l-4 border-amber-400 pl-4">
                                 {restockInsight.summary}
                             </p>

                             {/* 2. High-Risk Products Table */}
                             <div>
                                 <h3 className="mb-3 text-lg font-semibold text-destructive flex items-center gap-2">
                                     <AlertTriangle className="h-5 w-5" />
                                     High-Risk Products (Action Required)
                                 </h3>
                                 <HighRiskTable products={restockInsight.highRiskProducts} />
                             </div>
                             
                             {/* 3. Recommendations & Status in a Grid */}
                             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                 <div className="lg:col-span-2">
                                     <RecommendationsCard recommendations={restockInsight.recommendations} />
                                 </div>
                                 <div className="lg:col-span-1">
                                     <StatusReport statusReport={restockInsight.statusReport} />
                                 </div>
                             </div>
                         </CardContent>
                     )}
                 </Card>
                )}
                <Card>
                    <CardHeader className="px-3 sm:px-6">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
                            <div>
                                <CardTitle className="text-xl sm:text-2xl">Monthly Stock Ledger</CardTitle>
                                <CardDescription className="text-xs sm:text-sm mt-1">Manage monthly stock</CardDescription>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-row md:flex-wrap md:items-center md:gap-3 w-full md:w-auto">
                                <div className="relative w-full sm:w-48 md:w-56 order-last md:order-1 col-span-full sm:col-span-1 md:col-auto mt-2 md:mt-0">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                    <Input
                                        type="search"
                                        placeholder="Search product..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="h-8 sm:h-9 text-xs sm:text-sm pl-8 w-full"
                                    />
                                </div>

                                {/* <div className="order-1 md:order-2 col-span-2 sm:col-span-1 md:col-auto">
                                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                        <SelectTrigger className="w-full sm:w-[160px] md:w-[180px] text-xs sm:text-sm h-8 sm:h-9">
                                            <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 mr-1 opacity-70" />
                                            <SelectValue placeholder="Month" />
                                        </SelectTrigger>
                                        <SelectContent>{monthOptions.map(o=><SelectItem key={o.value} value={o.value} className="text-xs sm:text-sm">{o.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div> */}

                                {/* <div className="order-2 md:order-3 col-span-1 sm:col-auto">
                                    <Button 
                                        onClick={handleSyncVisibleSales} 
                                        size="sm" 
                                        variant="outline"
                                        className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-9 whitespace-nowrap" 
                                        disabled={isLoading || isSyncingVisible || isSyncingEntireMonth || displayedLedgerData.length === 0}
                                        title="Sync sales for currently visible/searched products"
                                    >
                                        {isSyncingVisible ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <RefreshCw className="mr-1 h-3 w-3"/>}
                                        Sync Visible
                                    </Button>
                                </div> */}

                                {/* <div className="order-3 md:order-4 col-span-1 sm:col-auto">
                                    <Button 
                                        onClick={handleSyncEntireMonthSales} 
                                        size="sm" 
                                        className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-9 whitespace-nowrap" 
                                        disabled={isLoading || isSyncingVisible || isSyncingEntireMonth || productList.length === 0}
                                        title={`Sync sales for all ${productList.length} products for the selected month`}
                                    >
                                        {isSyncingEntireMonth ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <History className="mr-1 h-3 w-3"/>}
                                        Sync All for Month
                                    </Button>
                                </div> */}
                                
                                <div className="order-4 md:order-5 col-span-2 sm:col-span-1 md:col-auto">
                                    <Dialog open={isAddStockDialogOpen} onOpenChange={setIsAddStockDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-9 whitespace-nowrap">
                                                <PlusCircle className="mr-1 h-3 w-3"/>Add Stock
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[520px]">
                                           <DialogHeader><DialogTitle>Add Stock for {monthOptions.find(m=>m.value === selectedMonth)?.label || selectedMonth}</DialogTitle><DialogDescription>Record new stock arrival.</DialogDescription></DialogHeader>
                                            <div className="grid gap-4 py-4">
                                                <div className="space-y-1 sm:grid sm:grid-cols-4 sm:items-center sm:gap-x-3 sm:space-y-0">
                                                    <Label htmlFor="product_restock_select" className="text-xs sm:text-sm sm:text-right sm:col-span-1">Product</Label>
                                                    <Select value={selectedProductForRestock} onValueChange={setSelectedProductForRestock}>
                                                        <SelectTrigger id="product_restock_select" className="w-full sm:col-span-3 h-8 sm:h-10 text-xs sm:text-sm">
                                                            <SelectValue placeholder="Select product" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {productList.length > 0 ? productList.map(p => <SelectItem key={p.id} value={p.id} className="text-xs sm:text-sm">{p.name} ({p.articleNumber})</SelectItem>) : <div className="p-4 text-center text-xs text-muted-foreground">Loading products...</div>}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1 sm:grid sm:grid-cols-4 sm:items-center sm:gap-x-3 sm:space-y-0">
                                                    <Label htmlFor="restock_date" className="text-xs sm:text-sm sm:text-right sm:col-span-1">Restock Date</Label>
                                                    <Input id="restock_date" type="date" value={restockDate} onChange={e => setRestockDate(e.target.value)} className="w-full sm:col-span-3 h-8 sm:h-10 text-xs sm:text-sm" />
                                                </div>
                                                <div className="space-y-1 sm:grid sm:grid-cols-4 sm:items-center sm:gap-x-3 sm:space-y-0">
                                                    <Label htmlFor="quantity_restock" className="text-xs sm:text-sm sm:text-right sm:col-span-1">Quantity (kg)</Label>
                                                    <Input id="quantity_restock" type="number" value={restockQuantityKg} onChange={e => setRestockQuantityKg(e.target.value)} className="w-full sm:col-span-3 h-8 sm:h-10 text-xs sm:text-sm" placeholder="e.g., 100.5"/>
                                                </div>
                                                <div className="space-y-1 sm:grid sm:grid-cols-4 sm:items-center sm:gap-x-3 sm:space-y-0">
                                                    <Label htmlFor="notes_restock" className="text-xs sm:text-sm sm:text-right sm:col-span-1">Notes</Label>
                                                    <Input id="notes_restock" value={restockNotes} onChange={e => setRestockNotes(e.target.value)} className="w-full sm:col-span-3 h-8 sm:h-10 text-xs sm:text-sm" placeholder="Optional"/>
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button variant="outline" onClick={()=>setIsAddStockDialogOpen(false)} size="sm" className="text-xs sm:text-sm">Cancel</Button>
                                                <Button onClick={handleAddStock} disabled={isAddingStock || !selectedProductForRestock || !restockQuantityKg} size="sm" className="text-xs sm:text-sm">
                                                    {isAddingStock && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                        </div>
                        {error && <p className="text-red-500 text-center py-2 text-xs sm:text-sm">{error}</p>}
                    </CardHeader>
                    <CardContent className="px-0 sm:px-6">
                        {isLoading && (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" /> 
                                <p className="ml-2 text-sm sm:text-base">
                                    {`Loading ledger for ${monthOptions.find(m=>m.value === selectedMonth)?.label || selectedMonth}...`}
                                </p>
                            </div>
                        )}
                        
                        {!isLoading && displayedLedgerData.length === 0 && !error && (
                             <p className="text-center py-10 text-sm sm:text-base">
                                {searchTerm ? 'No products match your search.' : `No stock ledger data for ${monthOptions.find(m=>m.value === selectedMonth)?.label || selectedMonth}.`}
                            </p>
                        )}

                        {!isLoading && displayedLedgerData.length > 0 && (
                            <div className="overflow-x-auto">
                                <Table className="mt-4 text-xs sm:text-sm">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-6 px-1 sm:px-2"></TableHead>
                                            <TableHead className="px-2 sm:px-4">Product</TableHead>
                                            <TableHead className="text-right px-1 sm:px-2">Open. (kg)</TableHead>
                                            <TableHead className="text-right px-1 sm:px-2">Restocked</TableHead>
                                            <TableHead className="text-right px-1 sm:px-2">Sold</TableHead>
                                            <TableHead className="text-right font-semibold px-1 sm:px-2">Closing</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                    {displayedLedgerData.map((item) => (
                                        <React.Fragment key={item.productArticleNo}>
                                            <TableRow>
                                                <TableCell className="px-1 sm:px-2 py-1 sm:py-2">
                                                    <Button variant="ghost" size="icon" onClick={() => toggleRowExpansion(item.productArticleNo)} className="h-6 w-6 sm:h-7 sm:w-7">
                                                        {expandedRows[item.productArticleNo] ? <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4"/> : <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4"/>}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="font-medium px-2 sm:px-4 py-2 sm:py-3">
                                                    {item.productName} <p className="text-muted-foreground text-xs">{item.productArticleNo}</p>
                                                </TableCell>
                                                <TableCell className="text-right px-1 sm:px-2">
                                                    {item.openingStockKg.toLocaleString()}
                                                    <Button variant="ghost" size="icon" className="ml-1 h-5 w-5 opacity-60 hover:opacity-100" onClick={() => handleEditOpeningStock(item)} title="Edit Opening Stock">
                                                        <Edit3 className="h-3 w-3"/>
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="text-right px-1 sm:px-2">{item.totalRestockedThisMonthKg.toLocaleString()}</TableCell>
                                                <TableCell className="text-right px-1 sm:px-2">{item.totalSoldThisMonthKg.toLocaleString()}</TableCell>
                                                <TableCell className="text-right font-semibold px-1 sm:px-2">{item.closingStockKg.toLocaleString()}</TableCell>
                                            </TableRow>
                                            {expandedRows[item.productArticleNo] && (
                                                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                                                    <TableCell/>
                                                    <TableCell colSpan={5} className="p-2 sm:p-3">
                                                        <div className="text-xs">
                                                            <h4 className="font-semibold mb-1 text-gray-600 dark:text-gray-300">Restock Details for {item.productName} ({monthOptions.find(m => m.value === item.month)?.label || item.month}):</h4>
                                                            {item.restockEntriesThisMonth && Object.keys(item.restockEntriesThisMonth).length > 0 ? (
                                                                <ul className="list-disc list-inside pl-1 space-y-0.5">
                                                                    {Object.entries(item.restockEntriesThisMonth)
                                                                        .sort(([tsA], [tsB]) => new Date(tsA).getTime() - new Date(tsB).getTime())
                                                                        .map(([timestamp, randomEntriesMap]) => {
                                                                            const randomIdKey = Object.keys(randomEntriesMap)[0];
                                                                            if (!randomIdKey) {
                                                                                console.warn(`No restock entry data found under timestamp: ${timestamp} for product: ${item.productArticleNo}`);
                                                                                return null;
                                                                            }
                                                                            const restockDetail = randomEntriesMap[randomIdKey];
                                                                            return (
                                                                                <li key={timestamp}>
                                                                                    <span className="font-medium">{restockDetail.quantityKg.toLocaleString()} kg</span> on {(restockDetail.date)}
                                                                                    {restockDetail.notes && <span className="text-muted-foreground italic"> - {restockDetail.notes}</span>}
                                                                                </li>
                                                                            );
                                                                        })}
                                                                </ul>
                                                            ) : <p className="text-muted-foreground italic">No restocks recorded this month.</p>}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        
                        {/* Pagination UI Removed */}

                    </CardContent>
                </Card>

                <Dialog open={isEditOpeningStockDialogOpen} onOpenChange={setIsEditOpeningStockDialogOpen}>
                     <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader>
                            <DialogTitle>Edit Opening Stock for {editingStockItem?.productName}</DialogTitle>
                            <DialogDescription>For month: {monthOptions.find(m=>m.value === editingStockItem?.month)?.label || editingStockItem?.month}. This will affect the closing stock.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-1 sm:grid sm:grid-cols-3 sm:items-center sm:gap-x-4 sm:space-y-0">
                                <Label htmlFor="openingStock" className="text-xs sm:text-sm sm:text-right sm:col-span-1">Opening (kg)</Label>
                                <Input id="openingStock" type="number" value={newOpeningStockKg} onChange={e => setNewOpeningStockKg(e.target.value)} className="w-full sm:col-span-2 h-9 sm:h-10 text-xs sm:text-sm" placeholder="e.g., 50.25" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsEditOpeningStockDialogOpen(false)} size="sm" className="text-xs sm:text-sm">Cancel</Button>
                            <Button onClick={handleUpdateOpeningStock} disabled={isUpdatingOpeningStock || newOpeningStockKg === ''} size="sm" className="text-xs sm:text-sm">
                                {isUpdatingOpeningStock && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Update
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}