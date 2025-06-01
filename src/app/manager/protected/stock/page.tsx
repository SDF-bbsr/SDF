// src/app/manager/protected/stock/page.tsx
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
    ChevronDown, ChevronRight, Edit3, Loader2, AlertCircle, PlusCircle, RefreshCw, ChevronsLeft, ChevronsRight, CalendarDays, Search, History // Added History icon
} from 'lucide-react';
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
    id: string; // This should map to productArticleNo
    name: string;
    articleNumber: string; // Assuming this might be the same as id or a display variant
}

const ITEMS_PER_PAGE = 30;
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

const getCurrentMonthYYYYMM = () => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
};

const getMonthOptions = () => {
    const options = []; const today = new Date();
    for (let i = 0; i < 12; i++) { const d = new Date(today.getFullYear(), today.getMonth() - i, 1); options.push({ value: `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`, label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) });}
    for (let i = 1; i <= 3; i++) { const d = new Date(today.getFullYear(), today.getMonth() + i, 1); options.push({ value: `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`, label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) });}
    options.sort((a, b) => b.value.localeCompare(a.value)); return options;
};

export default function StockLedgerPage() {
    const [productList, setProductList] = useState<ProductListItem[]>([]);
    const [allLedgerDataForMonth, setAllLedgerDataForMonth] = useState<MonthlyStockLedgerItem[]>([]);
    const [displayedLedgerData, setDisplayedLedgerData] = useState<MonthlyStockLedgerItem[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isPaginating, setIsPaginating] = useState(false);
    const [isSyncingVisible, setIsSyncingVisible] = useState(false); // Renamed from isSyncingAll
    const [isSyncingEntireMonth, setIsSyncingEntireMonth] = useState(false); // New state for "Sync All Products for Month"
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

    const [currentPage, setCurrentPage] = useState(1);
    const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
    const [hasNextPage, setHasNextPage] = useState(false);

    const monthOptions = useMemo(() => getMonthOptions(), []);

    const fetchProductList = useCallback(async () => {
        // setIsLoadingProductList(true) // Optional: if you want a separate loader for this
        try {
            const response = await fetch('/api/manager/products-list');
            if (!response.ok) throw new Error('Failed to fetch product list');
            // Ensure the ProductListItem interface matches the response.
            // The API returns: { id: string, name: string }
            // Your ProductListItem has: { id: string; name: string; articleNumber: string; }
            // Let's assume 'id' from API is the articleNumber.
            const dataFromApi: { id: string, name: string }[] = await response.json();
            const formattedProductList = dataFromApi.map(p => ({
                id: p.id, // This 'id' will be used as productArticleNo
                name: p.name,
                articleNumber: p.id // Assuming id is the article number
            }));
            setProductList(formattedProductList);
            console.log(`[Stock Page] Fetched ${formattedProductList.length} products for selection.`);
        } catch (err: any) {
            sonnerToast.error("Product list error: " + err.message);
            setProductList([]); // Set to empty on error
        } finally {
            // setIsLoadingProductList(false)
        }
    }, []);

    const fetchStockLedgerData = useCallback(async (monthToFetch: string, pageNum: number) => {
        // ... (existing code, no changes needed here)
        if (pageNum === 1) setIsLoading(true);
        else setIsPaginating(true);
        setError(null);

        const cursorIndex = pageNum - 1;
        const startAfterCursor = pageNum > 1 && pageCursors.length > cursorIndex && cursorIndex >= 0 ? pageCursors[cursorIndex] : null;
        
        let queryParams = `month=${monthToFetch}&limit=${ITEMS_PER_PAGE}`;
        if (startAfterCursor) {
            queryParams += `&startAfterProductNo=${encodeURIComponent(startAfterCursor)}`;
        }

        try {
            const response = await fetch(`/api/manager/stock-ledger?${queryParams}`);
            if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || 'Ledger fetch failed'); }
            const data: { items: MonthlyStockLedgerItem[], newLastDocProductNo: string | null, hasMore: boolean } = await response.json();
            
            setAllLedgerDataForMonth(data.items || []);
            setDisplayedLedgerData(data.items || []); 
            setHasNextPage(data.hasMore);

            if (data.items.length > 0) {
                const newCursor = data.newLastDocProductNo; 
                setPageCursors(prevCursors => {
                    const updatedCursors = [...prevCursors];
                    while (updatedCursors.length <= pageNum) {
                        updatedCursors.push(null);
                    }
                    updatedCursors[pageNum] = newCursor; 
                    return updatedCursors;
                });
            } else if (pageNum > 1 && data.items.length === 0) {
                setHasNextPage(false);
            }

        } catch (err: any) {
            setError(err.message); 
            setAllLedgerDataForMonth([]); 
            setDisplayedLedgerData([]);
            sonnerToast.error("Ledger fetch error: " + err.message);
        } finally {
            setIsLoading(false);
            setIsPaginating(false);
        }
    }, [pageCursors]);


    useEffect(() => { fetchProductList(); }, [fetchProductList]);

    useEffect(() => {
        setCurrentPage(1);
        setPageCursors([null]);
        setHasNextPage(false);
        setExpandedRows({});
        setSearchTerm('');
        if (selectedMonth) {
            fetchStockLedgerData(selectedMonth, 1);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth]);

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
        // ... (existing code, no changes needed here)
        if (!selectedProductForRestock || !restockQuantityKg || !selectedMonth || !restockDate) { sonnerToast.error("Product, quantity, month, and restock date are required."); return; }
        setIsAddingStock(true);
        try {
            const response = await fetch('/api/manager/stock-ledger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productArticleNo: selectedProductForRestock, 
                    quantityKg: parseFloat(restockQuantityKg), notes: restockNotes,
                    monthToUpdate: selectedMonth, restockDate: restockDate,
                }),
            });
            if (!response.ok) { const d = await response.json(); throw new Error(d.message || 'Failed to add stock');}
            sonnerToast.success('Stock added successfully!'); setIsAddStockDialogOpen(false);
            setSelectedProductForRestock(''); setRestockQuantityKg(''); setRestockNotes(''); setRestockDate(new Date().toISOString().split('T')[0]);
            fetchStockLedgerData(selectedMonth, currentPage); 
        } catch (e:any) { sonnerToast.error("Error adding stock: " + e.message); } finally { setIsAddingStock(false); }
    };

    const handleEditOpeningStock = (item: MonthlyStockLedgerItem) => {
        setEditingStockItem(item); setNewOpeningStockKg(String(item.openingStockKg)); setIsEditOpeningStockDialogOpen(true);
    };

    const handleUpdateOpeningStock = async () => {
        // ... (existing code, no changes needed here)
        if (!editingStockItem || newOpeningStockKg === '') return;
        const parsedOpeningStock = parseFloat(newOpeningStockKg);
        if (isNaN(parsedOpeningStock) || parsedOpeningStock < 0) {
            sonnerToast.error("Invalid opening stock quantity.");
            return;
        }
        setIsUpdatingOpeningStock(true);
        try {
            const response = await fetch('/api/manager/stock-ledger/opening-stock', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    productArticleNo: editingStockItem.productArticleNo,
                    monthToUpdate: editingStockItem.month,
                    newOpeningStockKg: parsedOpeningStock
                 }),
            });
            if (!response.ok) { const d = await response.json(); throw new Error(d.message || 'Update failed');}
            sonnerToast.success('Opening stock updated!'); 
            setIsEditOpeningStockDialogOpen(false); 
            fetchStockLedgerData(selectedMonth, currentPage); 
        } catch (e:any) { sonnerToast.error("Update error: " + e.message); } finally { setIsUpdatingOpeningStock(false); }
    };

    const handleSyncVisibleSales = async () => { // Renamed from handleSyncAllVisibleSales
        const itemsToSync = searchTerm ? displayedLedgerData : allLedgerDataForMonth;
        if (itemsToSync.length === 0) { sonnerToast.info("No products currently visible to sync."); return; }
        setIsSyncingVisible(true);
        try {
            const nos = itemsToSync.map(i => i.productArticleNo);
            const response = await fetch('/api/manager/stock-ledger/sync-sales', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productArticleNos: nos, monthToSync: selectedMonth }),
            });
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.message || 'Sync failed');
            if (response.status === 207) { // Multi-Status for partial success
                 sonnerToast.warning(resData.message || `Sales sync for visible products partially complete. Check details.`, {
                    description: `Success: ${resData.successCount}, Failed: ${resData.errorCount}`,
                });
            } else {
                sonnerToast.success(resData.message || `Sales synced for ${nos.length} visible products in ${selectedMonth}`);
            }
            fetchStockLedgerData(selectedMonth, currentPage);
        } catch (e:any) { sonnerToast.error("Sync Visible error: " + e.message); } finally { setIsSyncingVisible(false); }
    };

    // NEW: Handler to sync sales for ALL products for the selected month
    const handleSyncEntireMonthSales = async () => {
        if (productList.length === 0) {
            sonnerToast.info("Product list not loaded yet or is empty. Cannot sync all.");
            return;
        }
        if (!selectedMonth) {
            sonnerToast.error("Please select a month to sync.");
            return;
        }

        // Optional: Add a confirmation dialog here for such a broad action
        if (!confirm(`Are you sure you want to sync sales for ALL ${productList.length} products for ${monthOptions.find(m=>m.value === selectedMonth)?.label || selectedMonth}? This might take some time. This is a Document Read Expensive task`)) {
            return;
        }

        setIsSyncingEntireMonth(true);
        const allProductArticleNos = productList.map(p => p.id); // 'id' from productList is the article number

        try {
            sonnerToast.info(`Starting sales sync for all ${allProductArticleNos.length} products for ${monthOptions.find(m=>m.value === selectedMonth)?.label || selectedMonth}... This may take a moment.`, { duration: 10000 });
            const response = await fetch('/api/manager/stock-ledger/sync-sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productArticleNos: allProductArticleNos, monthToSync: selectedMonth }),
            });
            const resData = await response.json();

            if (!response.ok && response.status !== 207) { // 207 is Multi-Status, handled below
                throw new Error(resData.message || 'Sync for all products failed');
            }

            if (response.status === 207) { // Multi-Status for partial success
                 sonnerToast.warning(resData.message || `Sales sync for all products partially complete.`, {
                    description: `Success: ${resData.successCount}, Failed: ${resData.errorCount}. Check console for detailed errors.`,
                    duration: 15000
                });
                if (resData.errors && resData.errors.length > 0) {
                    console.warn("[STOCK SYNC ALL] Partial failure details:", resData.errors);
                }
            } else {
                sonnerToast.success(resData.message || `Sales successfully synced for all ${allProductArticleNos.length} products in ${selectedMonth}.`);
            }
            fetchStockLedgerData(selectedMonth, currentPage); // Refresh data
        } catch (e: any) {
            sonnerToast.error("Sync All Products Error: " + e.message, { duration: 10000 });
            console.error("[STOCK SYNC ALL] Error:", e);
        } finally {
            setIsSyncingEntireMonth(false);
        }
    };


    const toggleRowExpansion = (productArticleNo: string) => {
        setExpandedRows(prev => ({ ...prev, [productArticleNo]: !prev[productArticleNo] }));
    };

    const handlePageNavigation = (direction: 'next' | 'prev') => {
        // ... (existing code, no changes needed here)
        let newPage = currentPage;
        if (direction === 'next' && hasNextPage) {
            newPage = currentPage + 1;
        } else if (direction === 'prev' && currentPage > 1) {
            newPage = currentPage - 1;
        }
        
        if (newPage !== currentPage) {
            setCurrentPage(newPage);
            fetchStockLedgerData(selectedMonth, newPage);
        }
    };

    return (
        <>
            <Toaster richColors position="top-right" />
            <div className="container mx-auto px-2 sm:px-4 py-8">
                <Card>
                    <CardHeader className="px-3 sm:px-6">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
                            <div>
                                <CardTitle className="text-xl sm:text-2xl">Monthly Stock Ledger</CardTitle>
                                <CardDescription className="text-xs sm:text-sm mt-1">Manage monthly stock</CardDescription>
                            </div>
                            {/* Action Buttons Group */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-row md:flex-wrap md:items-center md:gap-3 w-full md:w-auto">
                                {/* Search Input */}
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

                                {/* Month Select */}
                                <div className="order-1 md:order-2 col-span-2 sm:col-span-1 md:col-auto">
                                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                        <SelectTrigger className="w-full sm:w-[160px] md:w-[180px] text-xs sm:text-sm h-8 sm:h-9">
                                            <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 mr-1 opacity-70" />
                                            <SelectValue placeholder="Month" />
                                        </SelectTrigger>
                                        <SelectContent>{monthOptions.map(o=><SelectItem key={o.value} value={o.value} className="text-xs sm:text-sm">{o.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>

                                {/* Sync Visible Sales Button */}
                                <div className="order-2 md:order-3 col-span-1 sm:col-auto">
                                    <Button 
                                        onClick={handleSyncVisibleSales} 
                                        size="sm" 
                                        variant="outline" // Differentiate from Sync All
                                        className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-9 whitespace-nowrap" 
                                        disabled={isLoading || isPaginating || isSyncingVisible || isSyncingEntireMonth || displayedLedgerData.length === 0}
                                        title="Sync sales for currently visible/searched products"
                                    >
                                        {isSyncingVisible ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <RefreshCw className="mr-1 h-3 w-3"/>}
                                        Sync Visible
                                    </Button>
                                </div>

                                {/* NEW: Sync All Products for Month Button */}
                                <div className="order-3 md:order-4 col-span-1 sm:col-auto">
                                    <Button 
                                        onClick={handleSyncEntireMonthSales} 
                                        size="sm" 
                                        className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-9 whitespace-nowrap" 
                                        disabled={isLoading || isPaginating || isSyncingVisible || isSyncingEntireMonth || productList.length === 0}
                                        title={`Sync sales for all ${productList.length} products for the selected month`}
                                    >
                                        {isSyncingEntireMonth ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <History className="mr-1 h-3 w-3"/>}
                                        Sync All for Month
                                    </Button>
                                </div>
                                
                                {/* Add Stock Button Dialog Trigger */}
                                <div className="order-4 md:order-5 col-span-2 sm:col-span-1 md:col-auto">
                                    <Dialog open={isAddStockDialogOpen} onOpenChange={setIsAddStockDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-9 whitespace-nowrap">
                                                <PlusCircle className="mr-1 h-3 w-3"/>Add Stock
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[520px]">
                                          {/* ... (Add stock dialog content - no change) ... */}
                                           <DialogHeader><DialogTitle>Add Stock for {monthOptions.find(m=>m.value === selectedMonth)?.label || selectedMonth}</DialogTitle><DialogDescription>Record new stock arrival.</DialogDescription></DialogHeader>
                                            <div className="grid gap-4 py-4"> {/* Main grid for form items */}
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
                        {/* ... (Loading states and table - no change, but check disabled states on buttons) ... */}
                        {(isLoading || isPaginating) && (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" /> 
                                <p className="ml-2 text-sm sm:text-base">
                                    {isPaginating ? 'Loading next page...' : `Loading ledger for ${monthOptions.find(m=>m.value === selectedMonth)?.label || selectedMonth}...`}
                                </p>
                            </div>
                        )}
                        
                        {!isLoading && !isPaginating && displayedLedgerData.length === 0 && !error && (
                             <p className="text-center py-10 text-sm sm:text-base">
                                {searchTerm ? 'No products match your search.' : `No stock ledger data for ${monthOptions.find(m=>m.value === selectedMonth)?.label || selectedMonth}.`}
                            </p>
                        )}

                        {!isLoading && !isPaginating && displayedLedgerData.length > 0 && (
                            <div className="overflow-x-auto"> {/* This div now handles table scrolling */}
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
                        
                        {/* Pagination - now correctly outside the table's scroll wrapper */}
                        {(!isLoading && !isPaginating && (allLedgerDataForMonth.length > 0 || currentPage > 1) && !searchTerm ) && ( 
                            <div className="flex items-center justify-end space-x-2 py-4 px-2 sm:px-0">
                                <Button variant="outline" size="sm" onClick={()=>handlePageNavigation('prev')} disabled={currentPage === 1 || isLoading || isPaginating} className="text-xs sm:text-sm">
                                    <ChevronsLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1"/> Prev
                                </Button>
                                <span className="text-xs sm:text-sm text-muted-foreground">Page {currentPage}</span>
                                <Button variant="outline" size="sm" onClick={()=>handlePageNavigation('next')} disabled={!hasNextPage || isLoading || isPaginating} className="text-xs sm:text-sm">
                                    Next <ChevronsRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1"/>
                                </Button>
                            </div>
                         )}
                    </CardContent>
                </Card>

                {/* ... (Edit opening stock dialog - no change) ... */}
                <Dialog open={isEditOpeningStockDialogOpen} onOpenChange={setIsEditOpeningStockDialogOpen}>
                     <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader>
                            <DialogTitle>Edit Opening Stock for {editingStockItem?.productName}</DialogTitle>
                            <DialogDescription>For month: {monthOptions.find(m=>m.value === editingStockItem?.month)?.label || editingStockItem?.month}. This will affect the closing stock.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4"> {/* Main grid for form items */}
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