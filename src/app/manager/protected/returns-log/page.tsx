"use client";

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Loader2, Filter, ArchiveRestore, Undo2, Search, ScanLine, CheckCircle } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface ReturnTransaction {
  id: string;
  articleNo: string;
  barcodeScanned?: string;
  product_articleName?: string;
  calculatedSellPrice: number;
  dateOfSale: string;
  staffId: string; 
  status: string;
  timestamp: string;
  lastStatusUpdateAt?: string; // When it was marked as returned
  lastStatusUpdateBy?: string; // Who marked it (will be undefined/null now)
  weightGrams: number;
}

interface ReturnsLogData {
    returns: ReturnTransaction[];
    totalReturnedValue: number;
    count: number;
}

interface StaffMember {
    id: string;
    name: string;
}

const BARCODE_PREFIX = "2110000";
const ARTICLE_NO_IN_BARCODE_LENGTH = 9;
const WEIGHT_GRAMS_IN_BARCODE_LENGTH = 5;
const CHECK_DIGIT_PLACEHOLDER = "1";


export default function ManagerReturnsLogPage() {
  const [returnsData, setReturnsData] = useState<ReturnsLogData | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [filters, setFilters] = useState({ startDate: '', endDate: '', staffId: '' });

  const [isMarkReturnModalOpen, setIsMarkReturnModalOpen] = useState(false);
  const [searchForReturnBarcode, setSearchForReturnBarcode] = useState('');
  const [manualSearchForReturn, setManualSearchForReturn] = useState({ articleNo: '', weightGrams: '' });
  
  const [foundSalesToReturn, setFoundSalesToReturn] = useState<ReturnTransaction[]>([]);
  const [selectedSaleToReturnByManager, setSelectedSaleToReturnByManager] = useState<ReturnTransaction | null>(null);
  const [isFindingSale, setIsFindingSale] = useState(false);


  const fetchStaffList = useCallback(async () => {
    try {
      const response = await fetch('/api/manager/staff');
      if (!response.ok) throw new Error('Failed to fetch staff list');
      setStaffList(await response.json());
    } catch (err: any) {
      sonnerToast.error("Error fetching staff list: " + err.message);
    }
  }, []);

  const fetchReturnsLog = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const queryParams = new URLSearchParams();
    if (filters.startDate) queryParams.append('startDate', filters.startDate);
    if (filters.endDate) queryParams.append('endDate', filters.endDate);
    if (filters.staffId && filters.staffId !== 'all') queryParams.append('staffId', filters.staffId);
    queryParams.append('limit', '200');

    try {
      const response = await fetch(`/api/manager/returns?${queryParams.toString()}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || errData.details || 'Failed to fetch returns log');
      }
      setReturnsData(await response.json());
    } catch (err: any) {
      setError(err.message);
      setReturnsData(null);
      sonnerToast.error("Error fetching returns: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchStaffList();
    fetchReturnsLog();
  }, [fetchReturnsLog, fetchStaffList]);
 

  const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const applyFilters = () => fetchReturnsLog();

  const constructBarcodeManager = (articleNo: string, weightGrams: string): string | null => {
    const artNoClean = articleNo.trim(); const weightClean = weightGrams.trim();
    if (!artNoClean || !weightClean || !/^\d+$/.test(artNoClean) || !/^\d+$/.test(weightClean)) { sonnerToast.error("Article/Weight must be numeric."); return null; }
    if (artNoClean.length > ARTICLE_NO_IN_BARCODE_LENGTH) { sonnerToast.error(`Article No. max ${ARTICLE_NO_IN_BARCODE_LENGTH} digits.`); return null; }
    if (weightClean.length > WEIGHT_GRAMS_IN_BARCODE_LENGTH) { sonnerToast.error(`Weight max ${WEIGHT_GRAMS_IN_BARCODE_LENGTH} digits.`); return null; }
    const paddedArticleNo = artNoClean.padStart(ARTICLE_NO_IN_BARCODE_LENGTH, '0');
    const paddedWeightGrams = weightClean.padStart(WEIGHT_GRAMS_IN_BARCODE_LENGTH, '0');
    return `${BARCODE_PREFIX}${paddedArticleNo}${paddedWeightGrams}${CHECK_DIGIT_PLACEHOLDER}`;
  };
  
  const findSalesToMarkAsReturnedByManager = async (barcodeToSearch: string) => {
    if (!barcodeToSearch.trim()) return;
    setIsFindingSale(true);
    setFoundSalesToReturn([]);
    setSelectedSaleToReturnByManager(null);
    try {
      const response = await fetch(`/api/sales/find-by-barcode?barcode=${encodeURIComponent(barcodeToSearch.trim())}`);
      if (!response.ok) {
        const errData = await response.json();
        sonnerToast.info(errData.message || 'No "SOLD" sales found.');
        return;
      }
      const sales: ReturnTransaction[] = await response.json();
      if (sales && sales.length > 0) {
        setFoundSalesToReturn(sales);
         if (sales.length === 1) {
            setSelectedSaleToReturnByManager(sales[0]);
            sonnerToast.success("1 sale found.");
        } else {
            sonnerToast.info(`${sales.length} sales found. Please select one to return.`);
        }
      } else {
         sonnerToast.info('No "SOLD" sales found for this barcode.');
      }
    } catch (err: any) {
      sonnerToast.error('Error finding sale: ' + err.message);
    } finally {
      setIsFindingSale(false);
    }
  };

  const handleManagerBarcodeSearch = () => {
    if (searchForReturnBarcode.trim()) {
        findSalesToMarkAsReturnedByManager(searchForReturnBarcode.trim());
    }
  };

  const handleManagerManualSearch = () => {
    const barcode = constructBarcodeManager(manualSearchForReturn.articleNo, manualSearchForReturn.weightGrams);
    if (barcode) {
        setSearchForReturnBarcode(barcode);
        findSalesToMarkAsReturnedByManager(barcode);
    }
  };

  const handleManagerMarkAsReturned = async (transaction: ReturnTransaction) => {
     if (!transaction) {
        sonnerToast.error("No transaction selected to mark as returned.");
        return;
    }
    if (!confirm(`Mark item ${transaction.product_articleName || transaction.articleNo} (Sold by: ${transaction.staffId} at ${new Date(transaction.timestamp).toLocaleTimeString()}) as returned?`)) {
      return;
    }
    setIsUpdating(transaction.id);
    try {
      const response = await fetch('/api/sales/update-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            transactionId: transaction.id, 
            newStatus: 'RETURNED_PRE_BILLING',
            // REMOVED: staffIdMakingChange is not sent anymore
        }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to update status');
      }
      sonnerToast.success('Sale marked as returned.');
      setFoundSalesToReturn([]); 
      setSelectedSaleToReturnByManager(null);
      setSearchForReturnBarcode('');
      setIsMarkReturnModalOpen(false); 
      fetchReturnsLog(); 
    } catch (err: any) {
      sonnerToast.error('Error updating status: ' + err.message);
    } finally {
      setIsUpdating(null);
    }
  };
  
  const renderFoundSaleRowForManager = (sale: ReturnTransaction) => (
    <TableRow 
        key={sale.id} 
        onClick={() => setSelectedSaleToReturnByManager(sale)}
        className={`cursor-pointer hover:bg-muted ${selectedSaleToReturnByManager?.id === sale.id ? 'bg-blue-100 dark:bg-blue-900/50' : ''}`}
    >
      <TableCell>{new Date(sale.timestamp).toLocaleString()}</TableCell>
      <TableCell>{sale.staffId}</TableCell>
      <TableCell>{sale.articleNo} ({sale.product_articleName || 'N/A'})</TableCell>
      <TableCell className="text-right">{sale.calculatedSellPrice.toFixed(2)}</TableCell>
      <TableCell className="text-center">
         {selectedSaleToReturnByManager?.id === sale.id ? 
            <CheckCircle className="h-5 w-5 text-green-500 mx-auto" /> : 
            <span className="text-xs text-muted-foreground">Select</span>
         }
      </TableCell>
    </TableRow>
  );

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-2">
        <Button onClick={() => setIsMarkReturnModalOpen(true)} variant="outline">
          <Undo2 className="mr-2 h-4 w-4" /> Mark a Sale as Returned
        </Button>
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5"/> Filter Returns Log</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div><Label htmlFor="startDate">Sale Start Date</Label><Input type="date" id="startDate" value={filters.startDate} onChange={(e) => handleFilterChange('startDate', e.target.value)} /></div>
          <div><Label htmlFor="endDate">Sale End Date</Label><Input type="date" id="endDate" value={filters.endDate} onChange={(e) => handleFilterChange('endDate', e.target.value)} /></div>
          <div>
            <Label htmlFor="staffIdFilter">Original Staff</Label>
            <Select value={filters.staffId} onValueChange={(value) => handleFilterChange('staffId', value)}>
              <SelectTrigger id="staffIdFilter"><SelectValue placeholder="All Staff" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Staff</SelectItem>{staffList.map(staff => (<SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <Button onClick={applyFilters} disabled={isLoading} className="lg:col-start-4 self-end h-10">{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />} Apply</Button>
        </CardContent>
      </Card>

      {returnsData && !isLoading && !error && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card><CardHeader className="pb-2"><CardDescription>Total Returned Value</CardDescription><CardTitle className="text-2xl">₹{returnsData.totalReturnedValue.toFixed(2)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Total Returned Packets</CardDescription><CardTitle className="text-2xl">{returnsData.count}</CardTitle></CardHeader></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArchiveRestore className="h-5 w-5"/> Returned Items List</CardTitle></CardHeader>
        <CardContent>
          {isLoading && ( <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">Loading...</p></div>)}
          {error && !isLoading && (<p className="text-destructive text-center py-10">Error: {error}</p>)}
          {!isLoading && !error && returnsData && ( returnsData.returns.length > 0 ? (
                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                <Table className="text-xs">
                  <TableHeader><TableRow><TableHead className="w-[170px]">Return Marked At</TableHead><TableHead>Original Staff</TableHead><TableHead>Article No / Name</TableHead><TableHead className="text-right">Weight (g)</TableHead><TableHead className="text-right">Value (₹)</TableHead><TableHead>Sale Date</TableHead>
                  {/* <TableHead className="hidden lg:table-cell">Marked By</TableHead> -- Removed as requested by simplification */}
                  </TableRow></TableHeader>
                  <TableBody>
                    {returnsData.returns.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/50">
                        <TableCell>{item.lastStatusUpdateAt ? new Date(item.lastStatusUpdateAt).toLocaleString() : (item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A')}</TableCell>
                        <TableCell>{item.staffId}</TableCell>
                        <TableCell>{item.articleNo} {item.product_articleName ? `(${item.product_articleName})` : ''}</TableCell>
                        <TableCell className="text-right">{item.weightGrams}g</TableCell>
                        <TableCell className="text-right">{item.calculatedSellPrice.toFixed(2)}</TableCell>
                        <TableCell>{item.dateOfSale ? new Date(item.dateOfSale + 'T00:00:00').toLocaleDateString() : 'N/A'}</TableCell>
                        {/* <TableCell className="hidden lg:table-cell">{item.lastStatusUpdateBy || 'N/A'}</TableCell> -- Removed */}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
                </ScrollArea>
              ) : (<p className="text-center py-10 text-muted-foreground">No returned items found.</p>)
          )}
        </CardContent>
      </Card>

      <Dialog open={isMarkReturnModalOpen} onOpenChange={(isOpen) => {
          setIsMarkReturnModalOpen(isOpen);
          if (!isOpen) { setFoundSalesToReturn([]); setSelectedSaleToReturnByManager(null); setSearchForReturnBarcode(''); setManualSearchForReturn({ articleNo: '', weightGrams: '' }); }
      }}>
        <DialogContent className="sm:max-w-2xl"> {/* Increased width for better table display */}
          <DialogHeader><DialogTitle>Mark a Sale as Returned (Manager)</DialogTitle><DialogDesc>Find a "SOLD" transaction to change its status.</DialogDesc></DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="managerSearchBarcode">Search by Barcode</Label>
              <div className="flex gap-2"><Input id="managerSearchBarcode" type="text" value={searchForReturnBarcode} onChange={(e) => setSearchForReturnBarcode(e.target.value)} placeholder="Scan/Enter barcode" className="font-mono"/><Button onClick={handleManagerBarcodeSearch} disabled={isFindingSale || !searchForReturnBarcode.trim()} className="h-10">{isFindingSale ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button></div>
            </div>
            <div className="space-y-2 p-3 border rounded-md"><Label className="text-sm">Or, Find by Article & Weight</Label><div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end"><div><Label htmlFor="mArticleNo" className="text-xs">Article No.</Label><Input id="mArticleNo" value={manualSearchForReturn.articleNo} onChange={(e) => setManualSearchForReturn(prev => ({...prev, articleNo: e.target.value}))}/></div><div><Label htmlFor="mWeight" className="text-xs">Weight (g)</Label><Input id="mWeight" type="number" value={manualSearchForReturn.weightGrams} onChange={(e) => setManualSearchForReturn(prev => ({...prev, weightGrams: e.target.value}))}/></div><Button onClick={handleManagerManualSearch} disabled={isFindingSale || !manualSearchForReturn.articleNo || !manualSearchForReturn.weightGrams} className="h-10">{isFindingSale ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>} Find</Button></div></div>
            {isFindingSale && <div className="text-center p-2"><Loader2 className="h-5 w-5 animate-spin"/></div>}
            {foundSalesToReturn.length > 0 && !isFindingSale && (
              <div className="mt-4 space-y-2">
                <Label>{foundSalesToReturn.length > 1 ? "Multiple Sales Found - Select One:" : "Sale Found:"}</Label>
                <ScrollArea className="max-h-[250px] w-full border rounded-md">
                  <Table className="text-xs"> {/* Ensure table in dialog is also small */}
                    <TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>Staff</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-center">Select</TableHead></TableRow></TableHeader>
                    <TableBody>{foundSalesToReturn.map(renderFoundSaleRowForManager)}</TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
            {foundSalesToReturn.length === 0 && !isFindingSale && searchForReturnBarcode && <p className="text-center text-sm text-muted-foreground mt-2">No "SOLD" items found for this search.</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => selectedSaleToReturnByManager && handleManagerMarkAsReturned(selectedSaleToReturnByManager)} disabled={isUpdating !== null || !selectedSaleToReturnByManager || selectedSaleToReturnByManager.status !== "SOLD"}>
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4"/>} Mark Selected as Returned
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}