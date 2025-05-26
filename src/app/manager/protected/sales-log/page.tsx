// src/app/manager/protected/sales-log/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Filter, PackageCheck, PackageX, UploadCloud, List, CalendarDays, UserCircle } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface SaleTransaction {
  id: string;
  articleNo: string;
  barcodeScanned?: string;
  calculatedSellPrice: number;
  dateOfSale: string; // YYYY-MM-DD
  staffId: string;
  status: string;
  timestamp: string; // ISO string
  weightGrams: number;
  product_articleName?: string; // For display
}

interface StaffMember {
  id: string;
  name: string;
}

interface DailySaleSummary {
  date: string;
  totalSaleValue: number;
  totalPacketsSold: number;
  avgPacketValue: number;
}

type ViewMode = 'individual' | 'daily';

export default function ManagerSalesLogPage() {
  const [transactions, setTransactions] = useState<SaleTransaction[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySaleSummary[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('daily'); // Default to daily summary

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    staffId: '',
    status: '',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [bulkSalesData, setBulkSalesData] = useState({
    barcodes: '',
    staffId: '',
    dateOfSale: new Date().toISOString().split('T')[0], // Default to today
  });

  const fetchStaffList = useCallback(async () => {
    try {
      const response = await fetch('/api/manager/staff');
      if (!response.ok) throw new Error('Failed to fetch staff list');
      const data: StaffMember[] = await response.json();
      setStaffList(data);
      if (data.length > 0 && !bulkSalesData.staffId) {
        setBulkSalesData(prev => ({ ...prev, staffId: data[0].id }));
      }
    } catch (err: any) {
      sonnerToast.error("Error fetching staff: " + err.message);
    }
  }, [bulkSalesData.staffId]);


  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const queryParams = new URLSearchParams();
    if (appliedFilters.startDate) queryParams.append('startDate', appliedFilters.startDate);
    if (appliedFilters.endDate) queryParams.append('endDate', appliedFilters.endDate);
    if (appliedFilters.staffId) queryParams.append('staffId', appliedFilters.staffId);
    if (appliedFilters.status) queryParams.append('status', appliedFilters.status);
    queryParams.append('limit', '1000'); // Fetch more for client-side daily summary

    try {
      const response = await fetch(`/api/manager/sales-transactions?${queryParams.toString()}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || errData.details || 'Failed to fetch transactions');
      }
      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch (err: any) {
      setError(err.message);
      setTransactions([]);
      sonnerToast.error("Error fetching sales: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchTransactions();
    fetchStaffList();
  }, [fetchTransactions, fetchStaffList]);

  // Calculate daily summaries when transactions or viewMode change
  useEffect(() => {
    if (transactions.length > 0) {
      const summaries: { [date: string]: Omit<DailySaleSummary, 'date' | 'avgPacketValue'> & { items: SaleTransaction[] } } = {};
      transactions.forEach(tx => {
        const date = tx.dateOfSale;
        if (!summaries[date]) {
          summaries[date] = { totalSaleValue: 0, totalPacketsSold: 0, items: [] };
        }
        summaries[date].totalSaleValue += tx.calculatedSellPrice;
        summaries[date].totalPacketsSold += 1;
        summaries[date].items.push(tx);
      });

      const formattedSummaries: DailySaleSummary[] = Object.entries(summaries)
        .map(([date, data]) => ({
          date,
          totalSaleValue: data.totalSaleValue,
          totalPacketsSold: data.totalPacketsSold,
          avgPacketValue: data.totalPacketsSold > 0 ? data.totalSaleValue / data.totalPacketsSold : 0,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date descending
      setDailySummaries(formattedSummaries);
    } else {
      setDailySummaries([]);
    }
  }, [transactions]);


  const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const applyFilters = () => {
    setAppliedFilters(filters);
  };

  const handleBulkSalesInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setBulkSalesData(prev => ({ ...prev, [name]: value }));
  };

  const handleBulkSalesSelectChange = (name: 'staffId', value: string) => {
    setBulkSalesData(prev => ({ ...prev, [name]: value }));
  };

  // Barcode parsing logic (ASSUMPTION: ArticleNo is 9 digits, Weight is 5 digits)
  // Example Barcode: 2110000600038799000601
  // Prefix: 2110000 (7 digits)
  // ArticleNo: 600038799 (9 digits, from index 7 to 15)
  // WeightGrams: 00060 (5 digits, from index 16 to 20)
  // CheckDigit: 1 (1 digit, at index 21) - This is an assumption
  const BARCODE_PREFIX_LENGTH = 7;
  const ARTICLE_NO_LENGTH = 9;
  const WEIGHT_GRAMS_LENGTH = 5;

  const parseBarcode = (barcode: string): { articleNo: string; weightGrams: number } | null => {
    barcode = barcode.trim();
    if (barcode.length < BARCODE_PREFIX_LENGTH + ARTICLE_NO_LENGTH + WEIGHT_GRAMS_LENGTH) {
      return null; // Not long enough
    }
    try {
      const articleNo = barcode.substring(BARCODE_PREFIX_LENGTH, BARCODE_PREFIX_LENGTH + ARTICLE_NO_LENGTH);
      const weightStr = barcode.substring(BARCODE_PREFIX_LENGTH + ARTICLE_NO_LENGTH, BARCODE_PREFIX_LENGTH + ARTICLE_NO_LENGTH + WEIGHT_GRAMS_LENGTH);
      const weightGrams = parseInt(weightStr, 10);

      if (isNaN(weightGrams) || !/^\d+$/.test(articleNo)) {
          return null;
      }
      return { articleNo, weightGrams };
    } catch (e) {
      return null;
    }
  };

  const handleBulkSalesSubmit = async () => {
    if (!bulkSalesData.barcodes.trim() || !bulkSalesData.staffId || !bulkSalesData.dateOfSale) {
      sonnerToast.error("Please fill in all fields: Barcodes, Staff, and Date.");
      return;
    }

    const barcodeLines = bulkSalesData.barcodes.trim().split('\n');
    const salesToRecord: Array<{
      barcodeScanned: string;
      articleNo: string;
      weightGrams: number;
      staffId: string;
      dateOfSale: string; // YYYY-MM-DD format
    }> = [];

    let parseErrors = 0;
    for (const line of barcodeLines) {
      const barcode = line.trim();
      if (!barcode) continue;
      const parsed = parseBarcode(barcode);
      if (parsed) {
        salesToRecord.push({
          barcodeScanned: barcode,
          articleNo: parsed.articleNo,
          weightGrams: parsed.weightGrams,
          staffId: bulkSalesData.staffId,
          dateOfSale: bulkSalesData.dateOfSale,
        });
      } else {
        parseErrors++;
        sonnerToast.warning(`Could not parse barcode: "${barcode}"`);
      }
    }

    if (parseErrors > 0) {
      if (!confirm(`${parseErrors} barcode(s) could not be parsed. Do you want to proceed with the valid ones?`)) {
        return;
      }
    }

    if (salesToRecord.length === 0) {
      sonnerToast.info("No valid sales to record after parsing.");
      return;
    }

    setIsSubmittingBulk(true);
    try {
      const response = await fetch('/api/manager/sales-transactions/bulk-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sales: salesToRecord }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Bulk sales recording failed.");
      }
      sonnerToast.success(`${result.successfulRecords || 0} sales recorded successfully. ${result.failedRecords || 0} failed.`);
      setIsBulkAddModalOpen(false);
      setBulkSalesData(prev => ({ ...prev, barcodes: '' })); // Clear barcodes
      fetchTransactions(); // Refresh the list
    } catch (err: any) {
      sonnerToast.error("Error recording bulk sales: " + err.message);
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SOLD":
        return <span className="px-2 py-0.5 text-xs font-medium text-green-800 bg-green-100 rounded-full inline-flex items-center gap-1"><PackageCheck className="h-3 w-3" /> {status}</span>;
      case "RETURNED_PRE_BILLING":
        return <span className="px-2 py-0.5 text-xs font-medium text-red-800 bg-red-100 rounded-full inline-flex items-center gap-1"><PackageX className="h-3 w-3" /> RETURNED</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium text-gray-800 bg-gray-100 rounded-full">{status}</span>;
    }
  };

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <Button onClick={() => setIsBulkAddModalOpen(true)} variant="outline">
          <UploadCloud className="mr-2 h-4 w-4" /> Bulk Add Sales
        </Button>
        <Button onClick={() => setViewMode(prev => prev === 'individual' ? 'daily' : 'individual')} variant="outline">
          {viewMode === 'individual' ? <CalendarDays className="mr-2 h-4 w-4" /> : <List className="mr-2 h-4 w-4" />}
          {viewMode === 'individual' ? 'View Daily Summary' : 'View Individual Transactions'}
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Filter Sales</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input type="date" id="startDate" value={filters.startDate} onChange={(e) => handleFilterChange('startDate', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input type="date" id="endDate" value={filters.endDate} onChange={(e) => handleFilterChange('endDate', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="staffIdFilter">Staff</Label>
            <Select
              value={filters.staffId || "all"}
              onValueChange={(value) => handleFilterChange('staffId', value === "all" ? "" : value)}
            >
              <SelectTrigger id="staffIdFilter"><SelectValue placeholder="All Staff" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffList.map(staff => (
                  <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="statusFilter">Status</Label>
            <Select 
              value={filters.status || "all"} 
              onValueChange={(value) => handleFilterChange('status', value === "all" ? "" : value)}
            >
              <SelectTrigger id="statusFilter"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="SOLD">Sold</SelectItem>
                <SelectItem value="RETURNED_PRE_BILLING">Returned Pre-Billing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={applyFilters} disabled={isLoading} className="lg:col-start-5 self-end h-10">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
            Apply Filters
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{viewMode === 'individual' ? 'Individual Transaction List' : 'Daily Sales Summary'}</CardTitle>
          <CardDescription>Displaying {viewMode === 'individual' ? 'transactions' : 'daily summaries'} based on current filters.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">Loading data...</p>
            </div>
          )}
          {error && !isLoading && (
            <p className="text-destructive text-center py-10">Error: {error}</p>
          )}
          {!isLoading && !error && (
            <>
              {viewMode === 'individual' && (
                transactions.length > 0 ? (
                  <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[170px] py-2 px-3">Timestamp</TableHead>
                          <TableHead className="py-2 px-3">Staff</TableHead>
                          <TableHead className="py-2 px-3">Article No</TableHead>
                          <TableHead className="py-2 px-3 hidden md:table-cell">Product Name</TableHead>
                          <TableHead className="text-right py-2 px-3">Weight (g)</TableHead>
                          <TableHead className="text-right py-2 px-3">Price (₹)</TableHead>
                          <TableHead className="py-2 px-3">Status</TableHead>
                          <TableHead className="hidden lg:table-cell py-2 px-3">Barcode</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((tx) => (
                          <TableRow key={tx.id} className="hover:bg-muted/50">
                            <TableCell>{new Date(tx.timestamp).toLocaleString()}</TableCell>
                            <TableCell>{tx.staffId}</TableCell>
                            <TableCell>{tx.articleNo}</TableCell>
                            <TableCell className="hidden md:table-cell truncate max-w-[200px]">{tx.product_articleName || 'N/A'}</TableCell>
                            <TableCell className="text-right">{tx.weightGrams}</TableCell>
                            <TableCell className="text-right">{tx.calculatedSellPrice.toFixed(2)}</TableCell>
                            <TableCell>{getStatusBadge(tx.status)}</TableCell>
                            <TableCell className="hidden lg:table-cell truncate max-w-[150px]">{tx.barcodeScanned || 'N/A'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  <p className="text-center py-10 text-muted-foreground">No individual transactions found for the selected filters.</p>
                )
              )}
              {viewMode === 'daily' && (
                dailySummaries.length > 0 ? (
                  <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="py-2 px-3">Date</TableHead>
                          <TableHead className="text-right py-2 px-3">Total Packets Sold</TableHead>
                          <TableHead className="text-right py-2 px-3">Total Sale Value (₹)</TableHead>
                          <TableHead className="text-right py-2 px-3">Avg. Packet Value (₹)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailySummaries.map((summary) => (
                          <TableRow key={summary.date} className="hover:bg-muted/50">
                            <TableCell className="font-medium">{new Date(summary.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</TableCell>
                            <TableCell className="text-right">{summary.totalPacketsSold}</TableCell>
                            <TableCell className="text-right">₹{summary.totalSaleValue.toFixed(2)}</TableCell>
                            <TableCell className="text-right">₹{summary.avgPacketValue.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                     <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  <p className="text-center py-10 text-muted-foreground">No sales data available to generate daily summary for the selected filters.</p>
                )
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Bulk Add Sales Dialog */}
      <Dialog open={isBulkAddModalOpen} onOpenChange={setIsBulkAddModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Add Sales Transactions</DialogTitle>
            <DialogDescription>
              Enter barcodes (one per line), select staff and date.
              The system will attempt to parse article number and weight.
              A fixed time of 2:00 PM will be used for these sales.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="barcodes">Barcodes (one per line)</Label>
              <Textarea
                id="barcodes"
                name="barcodes"
                value={bulkSalesData.barcodes}
                onChange={handleBulkSalesInputChange}
                placeholder="2110000XXXXXXXXXWWWWWN..."
                rows={8}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Expected format: Prefix ({BARCODE_PREFIX_LENGTH}) + ArticleNo ({ARTICLE_NO_LENGTH}) + WeightGrams ({WEIGHT_GRAMS_LENGTH}) + [CheckDigit]
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bulkStaffId">Staff Member</Label>
                <Select
                  name="staffId"
                  value={bulkSalesData.staffId}
                  onValueChange={(value) => handleBulkSalesSelectChange('staffId', value)}
                >
                  <SelectTrigger id="bulkStaffId">
                    <SelectValue placeholder="Select Staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.length > 0 ? (
                      staffList.map(staff => (
                        <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>Loading staff...</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulkDateOfSale">Date of Sale</Label>
                <Input
                  type="date"
                  id="bulkDateOfSale"
                  name="dateOfSale"
                  value={bulkSalesData.dateOfSale}
                  onChange={handleBulkSalesInputChange}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={handleBulkSalesSubmit} disabled={isSubmittingBulk}>
              {isSubmittingBulk && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Bulk Sales
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}