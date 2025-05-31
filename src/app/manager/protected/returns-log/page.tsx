// src/app/manager/protected/returns-log/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Loader2, Filter, ArchiveRestore, Undo2, Search, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

// --- Interface Definitions ---
// ... (Keep all your interface definitions as they are) ...
interface ReturnTransaction { // For the main list of returned items
  id: string;
  articleNo: string;
  barcodeScanned?: string;
  product_articleName?: string;
  calculatedSellPrice: number;
  dateOfSale: string; // Original date of sale
  staffId: string; // Original staff who made the sale
  status: string; // Should be "RETURNED_PRE_BILLING"
  timestamp: string; // Original sale timestamp
  lastStatusUpdateAt?: string; // When it was marked as returned
  weightGrams: number;
}

interface ReturnsLogApiResponse { // What the /api/manager/returns endpoint returns
    returns: ReturnTransaction[];
    totalReturnedValue: number; // Value for the current page of returns
    count: number; // Total count of returned items matching filter
    pagination: {
        currentPage: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
    }
}

interface StaffMember {
    id: string;
    name: string;
}

// For "Mark Sale as Returned" Dialog (items found by find-by-barcode)
interface SaleToReturn {
  id: string;
  articleNo: string;
  barcodeScanned?: string;
  product_articleName?: string;
  weightGrams: number;
  calculatedSellPrice: number;
  timestamp: string; // ISO String
  status: string; // Should be "SOLD" when found
  staffId: string;
  dateOfSale: string;
}
interface FindSalesApiResponse { // For the find-by-barcode API
    transactions: SaleToReturn[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
    }
}


const BARCODE_PREFIX = "2110000";
const ARTICLE_NO_IN_BARCODE_LENGTH = 9;
const WEIGHT_GRAMS_IN_BARCODE_LENGTH = 5;
const CHECK_DIGIT_PLACEHOLDER = "1";

const IST_TIMEZONE_CLIENT = 'Asia/Kolkata';
const getISODateStringForClient = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const getNowInClientIST = (): Date => new Date(new Date().toLocaleString("en-US", { timeZone: IST_TIMEZONE_CLIENT }));


export default function ManagerReturnsLogPage() {
  const [returnsLogData, setReturnsLogData] = useState<ReturnsLogApiResponse | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const defaultDateRange = useMemo(() => {
    const today = getNowInClientIST();
    const endDate = getISODateStringForClient(today);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    const startDate = getISODateStringForClient(sevenDaysAgo);
    return { startDate, endDate };
  }, []);

  const [filters, setFilters] = useState({ 
    startDate: defaultDateRange.startDate, 
    endDate: defaultDateRange.endDate, 
    staffId: 'all'
  });
  const [currentPage, setCurrentPage] = useState(1);

  // State for "Mark Sale as Returned" Dialog
  const [isMarkReturnModalOpen, setIsMarkReturnModalOpen] = useState(false);
  const [searchForReturnBarcode, setSearchForReturnBarcode] = useState('');
  const [manualSearchForReturn, setManualSearchForReturn] = useState({ articleNo: '', weightGrams: '' });
  const [foundSalesToReturn, setFoundSalesToReturn] = useState<SaleToReturn[]>([]);
  const [foundSalesPagination, setFoundSalesPagination] = useState<FindSalesApiResponse['pagination'] | null>(null);
  const [currentDialogSearchTerm, setCurrentDialogSearchTerm] = useState('');
  const [currentDialogPage, setCurrentDialogPage] = useState(1);
  const [selectedSaleToReturnByManager, setSelectedSaleToReturnByManager] = useState<SaleToReturn | null>(null);
  const [isFindingSaleInDialog, setIsFindingSaleInDialog] = useState(false);
  

  const fetchStaffList = useCallback(async () => {
    try {
      const response = await fetch('/api/manager/staff-list'); // Corrected endpoint
      if (!response.ok) throw new Error('Failed to fetch staff list');
      setStaffList(await response.json());
    } catch (err: any) {
      sonnerToast.error("Error fetching staff list: " + err.message);
    }
  }, []);

  const fetchReturnsLog = useCallback(async (page: number = 1) => {
    setIsLoading(true); setError(null);
    setCurrentPage(page); // Update current page state
    const queryParams = new URLSearchParams({ page: String(page), limit: '30' });
    if (filters.startDate) queryParams.append('startDate', filters.startDate);
    if (filters.endDate) queryParams.append('endDate', filters.endDate);
    if (filters.staffId && filters.staffId !== 'all') queryParams.append('staffId', filters.staffId);

    try {
      const response = await fetch(`/api/manager/returns?${queryParams.toString()}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || errData.details || 'Failed to fetch returns log');
      }
      const data: ReturnsLogApiResponse = await response.json();
      setReturnsLogData(data);
    } catch (err: any) {
      setError(err.message); setReturnsLogData(null); sonnerToast.error("Error fetching returns: " + err.message);
    } finally { setIsLoading(false); }
  }, [filters.startDate, filters.endDate, filters.staffId]); // Dependencies that trigger refetch

  useEffect(() => {
    fetchStaffList();
    fetchReturnsLog(1); // Fetch page 1 on initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startDate, filters.endDate, filters.staffId, fetchStaffList]); // fetchReturnsLog itself isn't here to avoid loop, called by applyFilters or page change

  const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const applyFilters = () => {
    if (filters.startDate && filters.endDate && new Date(filters.startDate) > new Date(filters.endDate)) {
        sonnerToast.error("Start date cannot be after end date.");
        return;
    }
    fetchReturnsLog(1); // Reset to page 1 when applying new filters
  };
  
  const handlePageChange = (newPage: number) => {
    fetchReturnsLog(newPage);
  };

  const constructBarcodeManager = (articleNo: string, weightGrams: string): string | null => {
    const artNoClean = articleNo.trim(); const weightClean = weightGrams.trim();
    if (!artNoClean || !weightClean || !/^\d+$/.test(artNoClean) || !/^\d+$/.test(weightClean)) { sonnerToast.error("Article Number and Weight must be numeric."); return null; }
    if (artNoClean.length !== ARTICLE_NO_IN_BARCODE_LENGTH) { sonnerToast.error(`Article No. must be ${ARTICLE_NO_IN_BARCODE_LENGTH} digits.`); return null; }
    if (weightClean.length > WEIGHT_GRAMS_IN_BARCODE_LENGTH || parseInt(weightClean, 10) === 0) { sonnerToast.error(`Weight must be 1-${WEIGHT_GRAMS_IN_BARCODE_LENGTH} digits and not zero.`); return null; }
    const paddedArticleNo = artNoClean.padStart(ARTICLE_NO_IN_BARCODE_LENGTH, '0');
    const paddedWeightGrams = weightClean.padStart(WEIGHT_GRAMS_IN_BARCODE_LENGTH, '0');
    return `${BARCODE_PREFIX}${paddedArticleNo}${paddedWeightGrams}${CHECK_DIGIT_PLACEHOLDER}`;
  };
  
  const findSalesToMarkAsReturnedByManager = async (barcodeToSearch: string, page: number = 1) => {
    if (!barcodeToSearch.trim()) { sonnerToast.warning("Please enter a barcode to search."); return; }
    setIsFindingSaleInDialog(true);
    setCurrentDialogPage(page); // Store current dialog page
    if (page === 1) { // Reset results only for a new search or going back to page 1
        setFoundSalesToReturn([]);
        setSelectedSaleToReturnByManager(null);
        setFoundSalesPagination(null);
    }
    setCurrentDialogSearchTerm(barcodeToSearch.trim());
    try {
      const response = await fetch(`/api/sales/find-by-barcode?barcode=${encodeURIComponent(barcodeToSearch.trim())}&page=${page}&limit=5`);
      const data: FindSalesApiResponse = await response.json();
      if (!response.ok && response.status !== 404) { throw new Error(data.message || 'Failed to find sales'); }
      
      if (data.transactions && data.transactions.length > 0) {
        setFoundSalesToReturn(data.transactions);
        setFoundSalesPagination(data.pagination);
         if (page === 1 && data.transactions.length === 1 && data.pagination.totalItems === 1) {
            setSelectedSaleToReturnByManager(data.transactions[0]);
            sonnerToast.success("1 sale found and auto-selected.");
        } else if (page === 1 && data.pagination.totalItems > 0){
            sonnerToast.info(`${data.pagination.totalItems} 'SOLD' sale(s) found for this barcode. Please select one if applicable.`);
        }
      } else {
         if(page === 1) sonnerToast.info('No "SOLD" sales found for this barcode.');
         setFoundSalesToReturn([]); // Clear if no transactions on current page but might exist elsewhere
         setFoundSalesPagination(data.pagination || null); 
      }
    } catch (err: any) { sonnerToast.error('Error finding sale: ' + err.message); setFoundSalesToReturn([]); setFoundSalesPagination(null); } 
    finally { setIsFindingSaleInDialog(false); }
  };

  const handleDialogPageChange = (newPage: number) => {
    if (currentDialogSearchTerm) {
        findSalesToMarkAsReturnedByManager(currentDialogSearchTerm, newPage);
    }
  };

  const handleManagerBarcodeSearch = () => {
    if (searchForReturnBarcode.trim()) findSalesToMarkAsReturnedByManager(searchForReturnBarcode.trim(), 1);
  };
  const handleManagerManualSearch = () => {
    const barcode = constructBarcodeManager(manualSearchForReturn.articleNo, manualSearchForReturn.weightGrams);
    if (barcode) { setSearchForReturnBarcode(barcode); findSalesToMarkAsReturnedByManager(barcode, 1); }
  };

  const handleManagerMarkAsReturned = async (transaction: SaleToReturn) => {
     if (!transaction) { sonnerToast.error("No transaction selected."); return; }
     if (transaction.status !== "SOLD") { sonnerToast.warning(`Item is already ${transaction.status}. Cannot mark as returned again.`); return; }
     if (!confirm(`Are you sure you want to mark item "${transaction.product_articleName || transaction.articleNo}" (Sold for ₹${transaction.calculatedSellPrice.toFixed(2)}) as returned? This will adjust aggregates.`)) return;
    
    setIsUpdatingStatus(transaction.id);
    try {
      const response = await fetch('/api/sales/update-status', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.id, newStatus: 'RETURNED_PRE_BILLING'}),
      });
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || 'Failed to update status'); }
      sonnerToast.success('Sale marked as returned. Aggregates adjusted.');
      setIsMarkReturnModalOpen(false); 
      fetchReturnsLog(currentPage); // Refresh current page of returns log
    } catch (err: any) { sonnerToast.error('Error updating status: ' + err.message); } 
    finally { setIsUpdatingStatus(null); }
  };
  
  const renderFoundSaleRowForManager = (sale: SaleToReturn) => (
    <TableRow 
        key={sale.id} 
        onClick={() => setSelectedSaleToReturnByManager(sale)}
        className={`cursor-pointer hover:bg-muted ${selectedSaleToReturnByManager?.id === sale.id ? 'bg-blue-100 dark:bg-blue-900/50' : ''}`}
    >
      <TableCell className="text-xs py-2 px-2 whitespace-nowrap">{new Date(sale.timestamp).toLocaleString()}</TableCell>
      <TableCell className="text-xs py-2 px-2 whitespace-nowrap">{staffList.find(s => s.id === sale.staffId)?.name || sale.staffId}</TableCell>
      <TableCell className="text-xs py-2 px-2 whitespace-nowrap">{sale.articleNo} ({sale.product_articleName || 'N/A'})</TableCell>
      <TableCell className="text-right text-xs py-2 px-2 whitespace-nowrap">₹{sale.calculatedSellPrice.toFixed(2)}</TableCell>
      <TableCell className="text-center py-2 px-2">
         {selectedSaleToReturnByManager?.id === sale.id ? 
            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : 
            <span className="text-xs text-muted-foreground">Select</span>
         }
      </TableCell>
    </TableRow>
  );

  const todayForInputMax = useMemo(() => getISODateStringForClient(getNowInClientIST()), []);

  return (
    // Add max-w-full and overflow-x-hidden to the main page container if not already handled by a layout component
    <div className="container mx-auto px-2 sm:px-4 py-4 max-w-full overflow-x-hidden">
      <Toaster richColors position="top-right" />
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-2">
        <Button onClick={() => {
            setIsMarkReturnModalOpen(true);
            setSearchForReturnBarcode('');
            setManualSearchForReturn({ articleNo: '', weightGrams: '' });
            setFoundSalesToReturn([]);
            setSelectedSaleToReturnByManager(null);
            setFoundSalesPagination(null);
            setCurrentDialogSearchTerm('');
            setCurrentDialogPage(1);
        }} variant="outline" size="sm">
          <Undo2 className="mr-2 h-4 w-4" /> Mark a Sale as Returned
        </Button>
      </div>
      {/* Filters Card */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg sm:text-xl flex items-center gap-2"><Filter className="h-5 w-5"/> Filter Returns Log</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div><Label htmlFor="startDate">Original Sale Start Date</Label><Input type="date" id="startDate" value={filters.startDate} onChange={(e) => handleFilterChange('startDate', e.target.value)} max={todayForInputMax} className="text-sm"/></div>
          <div><Label htmlFor="endDate">Original Sale End Date</Label><Input type="date" id="endDate" value={filters.endDate} onChange={(e) => handleFilterChange('endDate', e.target.value)} max={todayForInputMax} className="text-sm"/></div>
          <div><Label htmlFor="staffIdFilter">Original Staff of Sale</Label><Select value={filters.staffId} onValueChange={(value) => handleFilterChange('staffId', value)}><SelectTrigger id="staffIdFilter" className="text-sm"><SelectValue placeholder="All Staff" /></SelectTrigger><SelectContent><SelectItem value="all">All Staff</SelectItem>{staffList.map(staff => (<SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>))}</SelectContent></Select></div>
          <Button onClick={applyFilters} disabled={isLoading} className="h-10 w-full sm:w-auto text-sm">{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />} Apply Filters</Button>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {returnsLogData && !isLoading && !error && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card><CardHeader className="pb-2 pt-3 px-4"><CardDescription className="text-xs">Returned Value (this page)</CardDescription><CardTitle className="text-lg sm:text-xl">₹{returnsLogData.totalReturnedValue.toFixed(2)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2 pt-3 px-4"><CardDescription className="text-xs">Total Returned Packets (all)</CardDescription><CardTitle className="text-lg sm:text-xl">{returnsLogData.count}</CardTitle></CardHeader></Card>
        </div>
      )}

      {/* Returns List Table Card */}
      <Card>
        <CardHeader><CardTitle className="text-lg sm:text-xl flex items-center gap-2"><ArchiveRestore className="h-5 w-5"/> Returned Items List</CardTitle></CardHeader>
        {/* IMPORTANT: Added overflow-x-auto to CardContent to contain the ScrollArea's width behavior */}
        <CardContent className="overflow-x-auto"> 
          {isLoading && ( <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2 text-sm">Loading returns...</p></div>)}
          {error && !isLoading && (<p className="text-destructive text-center py-10 text-sm">Error: {error}</p>)}
          {!isLoading && !error && returnsLogData && ( returnsLogData.returns.length > 0 ? (
            <>
                {/* ScrollArea will now properly manage horizontal scroll for the Table */}
                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                  {/* Removed min-w-[800px] from Table for better mobile adaptability */}
                  {/* Applied smaller text size to the Table directly and to cells for mobile */}
                  <Table className="text-[0.7rem] sm:text-xs leading-tight"> 
                    <TableHeader>
                      <TableRow>
                        {/* Removed min-w, added whitespace-nowrap, adjusted padding for smaller text */}
                        <TableHead className="py-2 px-2 whitespace-nowrap w-[150px] sm:w-[170px]">Return Processed At</TableHead>
                        <TableHead className="py-2 px-2 whitespace-nowrap">Original Staff</TableHead>
                        <TableHead className="py-2 px-2 whitespace-nowrap">Article & Product</TableHead>
                        <TableHead className="text-right py-2 px-2 whitespace-nowrap">Weight (g)</TableHead>
                        <TableHead className="text-right py-2 px-2 whitespace-nowrap">Value (₹)</TableHead>
                        <TableHead className="py-2 px-2 whitespace-nowrap">Original Sale Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnsLogData.returns.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/50">
                          {/* Adjusted padding for smaller text, added whitespace-nowrap */}
                          <TableCell className="py-2 px-2 whitespace-nowrap">{item.lastStatusUpdateAt ? new Date(item.lastStatusUpdateAt).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'}</TableCell>
                          <TableCell className="py-2 px-2 whitespace-nowrap">{staffList.find(s => s.id === item.staffId)?.name || item.staffId}</TableCell>
                          <TableCell className="py-2 px-2 whitespace-nowrap">{item.articleNo} <span className="text-muted-foreground">({item.product_articleName || 'N/A'})</span></TableCell>
                          <TableCell className="text-right py-2 px-2 whitespace-nowrap">{item.weightGrams}g</TableCell>
                          <TableCell className="text-right py-2 px-2 whitespace-nowrap">₹{item.calculatedSellPrice.toFixed(2)}</TableCell>
                          <TableCell className="py-2 px-2 whitespace-nowrap">{item.dateOfSale ? new Date(item.dateOfSale + 'T00:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC'}) : 'N/A'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
                {returnsLogData.pagination && returnsLogData.pagination.totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-2 mt-4 text-xs">
                        <Button variant="outline" size="sm" onClick={() => handlePageChange(returnsLogData.pagination.currentPage - 1)} disabled={returnsLogData.pagination.currentPage <= 1 || isLoading}><ChevronLeft className="h-4 w-4 mr-1 sm:mr-0"/> <span className="sm:hidden">Prev</span></Button>
                        <span>Page {returnsLogData.pagination.currentPage} of {returnsLogData.pagination.totalPages} ({returnsLogData.pagination.totalItems} items)</span>
                        <Button variant="outline" size="sm" onClick={() => handlePageChange(returnsLogData.pagination.currentPage + 1)} disabled={returnsLogData.pagination.currentPage >= returnsLogData.pagination.totalPages || isLoading}><span className="sm:hidden">Next</span> <ChevronRight className="h-4 w-4 ml-1 sm:ml-0"/></Button>
                    </div>
                )}
            </>
              ) : (<p className="text-center py-10 text-muted-foreground text-sm">No returned items found for the selected criteria.</p>)
          )}
        </CardContent>
      </Card>

      {/* Dialog to Mark a Sale as Returned (largely unchanged, but review text sizes inside if needed) */}
      <Dialog open={isMarkReturnModalOpen} onOpenChange={(isOpen) => {
          setIsMarkReturnModalOpen(isOpen);
          if (!isOpen) { setFoundSalesToReturn([]); setSelectedSaleToReturnByManager(null); setSearchForReturnBarcode(''); setManualSearchForReturn({ articleNo: '', weightGrams: '' }); setCurrentDialogSearchTerm(''); setFoundSalesPagination(null); setCurrentDialogPage(1); }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6"> {/* Added p-4 sm:p-6 */}
          <DialogHeader><DialogTitle className="text-lg">Mark a "SOLD" Item as Returned</DialogTitle><DialogDesc className="text-sm">Search for the original "SOLD" transaction. The system will then update its status and adjust daily aggregates for the original sale date.</DialogDesc></DialogHeader>
          <ScrollArea className="flex-grow py-4 pr-2 -mr-2 min-h-0"> {/* Added min-h-0 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="managerSearchBarcode" className="text-sm">Search by Full Barcode</Label>
                <div className="flex gap-2"><Input id="managerSearchBarcode" type="text" value={searchForReturnBarcode} onChange={(e) => setSearchForReturnBarcode(e.target.value)} placeholder="Scan/Enter full barcode" className="font-mono text-sm h-10"/><Button onClick={handleManagerBarcodeSearch} disabled={isFindingSaleInDialog || !searchForReturnBarcode.trim()} className="h-10">{isFindingSaleInDialog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button></div>
              </div>
              <div className="space-y-2 p-3 border rounded-md"><Label className="text-sm font-medium">Or, Find by Article & Weight</Label><div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end mt-1"><div><Label htmlFor="mArticleNo" className="text-xs">Article No. ({ARTICLE_NO_IN_BARCODE_LENGTH} digits)</Label><Input id="mArticleNo" value={manualSearchForReturn.articleNo} onChange={(e) => setManualSearchForReturn(prev => ({...prev, articleNo: e.target.value}))} placeholder={`e.g., ${'0'.repeat(ARTICLE_NO_IN_BARCODE_LENGTH)}`} className="text-sm h-9"/></div><div><Label htmlFor="mWeight" className="text-xs">Weight (g, ≤{WEIGHT_GRAMS_IN_BARCODE_LENGTH} digits)</Label><Input id="mWeight" type="number" value={manualSearchForReturn.weightGrams} onChange={(e) => setManualSearchForReturn(prev => ({...prev, weightGrams: e.target.value}))} placeholder="e.g., 100" className="text-sm h-9"/></div><Button onClick={handleManagerManualSearch} disabled={isFindingSaleInDialog || !manualSearchForReturn.articleNo || !manualSearchForReturn.weightGrams} className="h-9 text-sm">{isFindingSaleInDialog ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>} Find</Button></div></div>
              
              {isFindingSaleInDialog && <div className="text-center p-2"><Loader2 className="h-5 w-5 animate-spin text-primary"/></div>}
              
              {foundSalesToReturn.length > 0 && !isFindingSaleInDialog && (
                <div className="mt-4 space-y-2">
                  <Label className="text-sm">{foundSalesPagination?.totalItems === 1 ? "Sale Found (Auto-selected):" : `Multiple "SOLD" Sales Found (${foundSalesPagination?.totalItems || 0}) - Select One:`}</Label>
                  <ScrollArea className="max-h-[150px] sm:max-h-[200px] w-full border rounded-md"> {/* Adjusted max-h */}
                    <Table className="text-[0.7rem] sm:text-xs leading-tight">
                      <TableHeader><TableRow><TableHead className="py-1 px-2 whitespace-nowrap">Timestamp</TableHead><TableHead className="py-1 px-2 whitespace-nowrap">Staff</TableHead><TableHead className="py-1 px-2 whitespace-nowrap">Item</TableHead><TableHead className="text-right py-1 px-2 whitespace-nowrap">Price</TableHead><TableHead className="text-center py-1 px-2 whitespace-nowrap">Select</TableHead></TableRow></TableHeader>
                      <TableBody>{foundSalesToReturn.map(renderFoundSaleRowForManager)}</TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal"/>
                  </ScrollArea>
                  {foundSalesPagination && foundSalesPagination.totalPages > 1 && (
                    <div className="flex justify-center items-center space-x-2 pt-2 text-xs">
                        <Button variant="outline" size="sm" onClick={() => handleDialogPageChange(foundSalesPagination.currentPage - 1)} disabled={foundSalesPagination.currentPage <= 1 || isFindingSaleInDialog}><ChevronLeft className="h-4 w-4"/> Prev</Button>
                        <span>Page {foundSalesPagination.currentPage} of {foundSalesPagination.totalPages}</span>
                        <Button variant="outline" size="sm" onClick={() => handleDialogPageChange(foundSalesPagination.currentPage + 1)} disabled={foundSalesPagination.currentPage >= foundSalesPagination.totalPages || isFindingSaleInDialog}>Next <ChevronRight className="h-4 w-4"/></Button>
                    </div>
                  )}
                </div>
              )}
              {foundSalesToReturn.length === 0 && !isFindingSaleInDialog && currentDialogSearchTerm && <p className="text-center text-sm text-muted-foreground mt-2">No "SOLD" items found for this search.</p>}
            </div>
          </ScrollArea>
          <DialogFooter className="mt-auto pt-4 border-t">
            <DialogClose asChild><Button variant="outline" disabled={isUpdatingStatus !== null}>Cancel</Button></DialogClose>
            <Button 
                onClick={() => selectedSaleToReturnByManager && handleManagerMarkAsReturned(selectedSaleToReturnByManager)} 
                disabled={isUpdatingStatus !== null || !selectedSaleToReturnByManager || selectedSaleToReturnByManager.status !== "SOLD"}
                variant="destructive"
            >
              {isUpdatingStatus === selectedSaleToReturnByManager?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4"/>} 
              Mark Selected as Returned
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}