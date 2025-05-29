// src/app/manager/protected/sales-log/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Filter, PackageCheck, PackageX, UploadCloud, List, CalendarDays, Download, Copy, FileText, FileSpreadsheet, Info, Edit, Trash2 } from 'lucide-react'; // Added Edit, Trash2
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import * as XLSX from 'xlsx';

interface SaleTransaction {
  id: string;
  articleNo: string;
  barcodeScanned?: string;
  calculatedSellPrice: number;
  dateOfSale: string; 
  staffId: string;
  status: string;
  timestamp: string; 
  weightGrams: number;
  product_articleName?: string;
  product_articleNumber?: string;
  product_posDescription?: string;
  product_metlerCode?: string;
  product_hsnCode?: string;
  product_taxPercentage?: number | null;
  product_purchasePricePerKg?: number | null;
  product_sellingRatePerKg?: number | null;
  product_mrpPer100g?: number | null;
  product_remark?: string | null;
  _isProcessing?: boolean; // For UI feedback during edit/delete
}
interface StaffMember { id: string; name: string; }
interface DailySaleSummary { date: string; totalSaleValue: number; totalPacketsSold: number; avgPacketValue: number; }
type ViewMode = 'individual' | 'daily';

type SaleStatus = "SOLD" | "RETURNED_PRE_BILLING"; // Define possible statuses

const ALL_EXPORTABLE_FIELDS: { key: keyof SaleTransaction; label: string }[] = [
    { key: 'timestamp', label: 'Timestamp (Full)' }, { key: 'dateOfSale', label: 'Date of Sale' },
    { key: 'staffId', label: 'Staff ID' }, { key: 'barcodeScanned', label: 'Barcode Scanned' },
    { key: 'articleNo', label: 'Article No (from Sale)' }, { key: 'product_articleName', label: 'Product Name' },
    { key: 'product_articleNumber', label: 'Product Article No' }, { key: 'weightGrams', label: 'Weight (g)' },
    { key: 'calculatedSellPrice', label: 'Sell Price (₹)' }, { key: 'status', label: 'Status' },
    { key: 'product_posDescription', label: 'Product POS Desc' }, { key: 'product_metlerCode', label: 'Product Metler Code' },
    { key: 'product_hsnCode', label: 'Product HSN Code' }, { key: 'product_taxPercentage', label: 'Product Tax %' },
    { key: 'product_purchasePricePerKg', label: 'Product Purchase Price/Kg' }, { key: 'product_sellingRatePerKg', label: 'Product Selling Rate/Kg' },
    { key: 'product_mrpPer100g', label: 'Product MRP/100g' }, { key: 'product_remark', label: 'Product Remark' },
    { key: 'id', label: 'Transaction ID (Internal)' },
];
const DEFAULT_EXCEL_FIELDS: (keyof SaleTransaction)[] = [
    'barcodeScanned', 'articleNo', 'product_articleName', 'weightGrams', 'calculatedSellPrice', 'staffId', 'dateOfSale', 'timestamp', 'status'
];
const getDefaultDateRange = () => { /* ... (no change) ... */ const today = new Date(); const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1); const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0); return { startDate: firstDayOfMonth.toISOString().split('T')[0], endDate: lastDayOfMonth.toISOString().split('T')[0], }; };

export default function ManagerSalesLogPage() {
  const [transactions, setTransactions] = useState<SaleTransaction[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySaleSummary[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); // Generic submitting state for dialogs
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('daily');

  const defaultDates = getDefaultDateRange();
  const [filters, setFilters] = useState({ ...defaultDates, staffId: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [bulkSalesData, setBulkSalesData] = useState({ barcodes: '', staffId: '', dateOfSale: new Date().toISOString().split('T')[0] });

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [activeExportTab, setActiveExportTab] = useState<'excel' | 'barcodes'>('excel');
  const [exportFilters, setExportFilters] = useState({ ...defaultDates, staffId: 'all', sortOrder: 'desc', selectedFields: DEFAULT_EXCEL_FIELDS, });
  const [exportDataPreviewCount, setExportDataPreviewCount] = useState<number | null>(null);
  const [exportedBarcodesText, setExportedBarcodesText] = useState('');

  // State for Edit Sale Dialog
  const [isEditSaleModalOpen, setIsEditSaleModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleTransaction | null>(null);
  const [editSaleForm, setEditSaleForm] = useState<{ status: SaleStatus }>({ status: 'SOLD' });


  const fetchStaffList = useCallback(async () => { /* ... (no change) ... */ try { const response = await fetch('/api/manager/staff'); if (!response.ok) throw new Error('Failed to fetch staff list'); const data: StaffMember[] = await response.json(); setStaffList(data); if (data.length > 0 && !bulkSalesData.staffId) { setBulkSalesData(prev => ({ ...prev, staffId: data[0].id })); } } catch (err: any) { sonnerToast.error("Error fetching staff: " + err.message); } }, [bulkSalesData.staffId]);
  const fetchTransactions = useCallback(async (limit = 1000) => { /* ... (no change) ... */ setIsLoading(true); setError(null); const queryParams = new URLSearchParams(); if (appliedFilters.startDate) queryParams.append('startDate', appliedFilters.startDate); if (appliedFilters.endDate) queryParams.append('endDate', appliedFilters.endDate); if (appliedFilters.staffId) queryParams.append('staffId', appliedFilters.staffId); if (appliedFilters.status) queryParams.append('status', appliedFilters.status); queryParams.append('limit', String(limit)); try { const response = await fetch(`/api/manager/sales-transactions?${queryParams.toString()}`); if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || errData.details || 'Failed to fetch transactions'); } const data = await response.json(); setTransactions(data.transactions || []); } catch (err: any) { setError(err.message); setTransactions([]); sonnerToast.error("Error fetching sales: " + err.message); } finally { setIsLoading(false); } }, [appliedFilters]);
  useEffect(() => { fetchTransactions(); fetchStaffList(); }, [fetchTransactions, fetchStaffList]);
  useEffect(() => { /* ... (daily summary - no change) ... */ if (transactions.length > 0) { const summaries: { [date: string]: Omit<DailySaleSummary, 'date' | 'avgPacketValue'> & { items: SaleTransaction[] } } = {}; transactions.forEach(tx => { const date = tx.dateOfSale; if (!summaries[date]) { summaries[date] = { totalSaleValue: 0, totalPacketsSold: 0, items: [] }; } summaries[date].totalSaleValue += tx.calculatedSellPrice; summaries[date].totalPacketsSold += 1; summaries[date].items.push(tx); }); const formattedSummaries: DailySaleSummary[] = Object.entries(summaries).map(([date, data]) => ({ date, totalSaleValue: data.totalSaleValue, totalPacketsSold: data.totalPacketsSold, avgPacketValue: data.totalPacketsSold > 0 ? data.totalSaleValue / data.totalPacketsSold : 0, })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); setDailySummaries(formattedSummaries); } else { setDailySummaries([]); } }, [transactions]);

  const handleFilterChange = (filterName: keyof typeof filters, value: string) => setFilters(prev => ({ ...prev, [filterName]: value }));
  const applyFilters = () => setAppliedFilters(filters);
  const handleBulkSalesInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBulkSalesData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleBulkSalesSelectChange = (name: 'staffId', value: string) => setBulkSalesData(prev => ({ ...prev, [name]: value }));
  const BARCODE_PREFIX_LENGTH = 7, ARTICLE_NO_LENGTH = 9, WEIGHT_GRAMS_LENGTH = 5;
  const parseBarcode = (barcode: string): { articleNo: string; weightGrams: number } | null => { /* ... (no change) ... */ barcode = barcode.trim(); if (barcode.length < BARCODE_PREFIX_LENGTH + ARTICLE_NO_LENGTH + WEIGHT_GRAMS_LENGTH) return null; try { const articleNo = barcode.substring(BARCODE_PREFIX_LENGTH, BARCODE_PREFIX_LENGTH + ARTICLE_NO_LENGTH); const weightStr = barcode.substring(BARCODE_PREFIX_LENGTH + ARTICLE_NO_LENGTH, BARCODE_PREFIX_LENGTH + ARTICLE_NO_LENGTH + WEIGHT_GRAMS_LENGTH); const weightGrams = parseInt(weightStr, 10); if (isNaN(weightGrams) || !/^\d+$/.test(articleNo)) return null; return { articleNo, weightGrams }; } catch (e) { return null; } };
  const handleBulkSalesSubmit = async () => { /* ... (no change) ... */ if (!bulkSalesData.barcodes.trim() || !bulkSalesData.staffId || !bulkSalesData.dateOfSale) { sonnerToast.error("All fields required for bulk sales."); return; } const barcodeLines = bulkSalesData.barcodes.trim().split('\n'); const salesToRecord: any[] = []; let parseErrors = 0; for (const line of barcodeLines) { const barcode = line.trim(); if (!barcode) continue; const parsed = parseBarcode(barcode); if (parsed) salesToRecord.push({ ...parsed, barcodeScanned: barcode, staffId: bulkSalesData.staffId, dateOfSale: bulkSalesData.dateOfSale }); else { parseErrors++; sonnerToast.warning(`Invalid barcode: "${barcode}"`); }} if (parseErrors > 0 && !confirm(`${parseErrors} invalid barcodes. Proceed?`)) return; if (salesToRecord.length === 0) { sonnerToast.info("No valid sales."); return; } setIsSubmittingBulk(true); try { const response = await fetch('/api/manager/sales-transactions/bulk-record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sales: salesToRecord }), }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "Bulk recording failed."); sonnerToast.success(`${result.successfulRecords || 0} sales recorded. ${result.failedRecords || 0} failed.`); setIsBulkAddModalOpen(false); setBulkSalesData(prev => ({ ...prev, barcodes: '' })); fetchTransactions(); } catch (err: any) { sonnerToast.error("Bulk sales error: " + err.message); } finally { setIsSubmittingBulk(false); } };
  const getStatusBadge = (status: string) => { /* ... (no change) ... */ switch (status) { case "SOLD": return <span className="px-2 py-0.5 text-xs font-medium text-green-800 bg-green-100 rounded-full inline-flex items-center gap-1"><PackageCheck className="h-3 w-3" /> {status}</span>; case "RETURNED_PRE_BILLING": return <span className="px-2 py-0.5 text-xs font-medium text-red-800 bg-red-100 rounded-full inline-flex items-center gap-1"><PackageX className="h-3 w-3" /> RETURNED</span>; default: return <span className="px-2 py-0.5 text-xs font-medium text-gray-800 bg-gray-100 rounded-full">{status}</span>; } };
  const handleExportFilterChange = (field: keyof typeof exportFilters, value: string | string[]) => { /* ... (no change) ... */ setExportFilters(prev => ({ ...prev, [field]: value })); setExportDataPreviewCount(null); };
  const handleExportFieldToggle = (fieldKey: keyof SaleTransaction) => { /* ... (no change) ... */ setExportFilters(prev => { const newSelectedFields = prev.selectedFields.includes(fieldKey) ? prev.selectedFields.filter(key => key !== fieldKey) : [...prev.selectedFields, fieldKey]; return { ...prev, selectedFields: newSelectedFields }; }); };
  const fetchExportData = async (forPreviewCountOnly = false, forBarcodeTextExport = false): Promise<SaleTransaction[] | number> => { /* ... (no change) ... */ setIsExporting(true); if (!forPreviewCountOnly && forBarcodeTextExport) {setExportedBarcodesText('');} const queryParams = new URLSearchParams(); if (exportFilters.startDate) queryParams.append('startDate', exportFilters.startDate); if (exportFilters.endDate) queryParams.append('endDate', exportFilters.endDate); if (exportFilters.staffId && exportFilters.staffId !== 'all') queryParams.append('staffId', exportFilters.staffId); queryParams.append('sortOrder', exportFilters.sortOrder); queryParams.append('limit', forPreviewCountOnly ? '0' : '10000'); queryParams.append('countOnly', String(forPreviewCountOnly)); try { const response = await fetch(`/api/manager/sales-transactions/export?${queryParams.toString()}`); if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || "Failed to fetch data for export"); } const data = await response.json(); if (forPreviewCountOnly) { const count = data.totalRecords === -1 ? 1 : data.totalRecords || 0; setExportDataPreviewCount(count); return count; }  else { const fetchedTransactions = data.transactions as SaleTransaction[] || []; if (forBarcodeTextExport) { const barcodes = fetchedTransactions.map(tx => String(tx.barcodeScanned || '')).filter(barcode => barcode.trim() !== "").join('\n'); setExportedBarcodesText(barcodes); } return fetchedTransactions; } } catch (err:any) { sonnerToast.error("Export error: " + err.message); if (forPreviewCountOnly) setExportDataPreviewCount(0); return forPreviewCountOnly ? 0 : []; } finally { setIsExporting(false); } };
  const handleGenerateExcel = async () => { /* ... (no change) ... */ setIsExporting(true); const dataToExport = await fetchExportData(false, false) as SaleTransaction[]; setIsExporting(false); if (!dataToExport || dataToExport.length === 0) { sonnerToast.info("No data for Excel."); return; } const selectedHeaders = exportFilters.selectedFields.map(key => ALL_EXPORTABLE_FIELDS.find(f => f.key === key)?.label || String(key)); const worksheetData = dataToExport.map(tx => { const row: any = {}; exportFilters.selectedFields.forEach(key => { const fieldConfig = ALL_EXPORTABLE_FIELDS.find(f => f.key === key); let value = tx[key] as any; if (key === 'timestamp' && value) value = new Date(value).toLocaleString(); if (key === 'calculatedSellPrice' && typeof value === 'number') value = value.toFixed(2); row[fieldConfig?.label || String(key)] = value !== undefined && value !== null ? value : ''; }); return row; }); const worksheet = XLSX.utils.json_to_sheet(worksheetData, { header: selectedHeaders }); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "SalesData"); XLSX.writeFile(workbook, `SalesExport_${new Date().toISOString().split('T')[0]}.xlsx`); sonnerToast.success("Excel generation initiated!"); };
  const handleExportBarcodesAsText = async () => { /* ... (no change) ... */ setIsExporting(true); await fetchExportData(false, true); setIsExporting(false); if (exportedBarcodesText) { sonnerToast.success("Barcodes prepared."); } else if(exportDataPreviewCount === 0) { sonnerToast.info("No barcodes to export."); }};
  const copyBarcodesToClipboard = () => { /* ... (no change) ... */ if (exportedBarcodesText) { navigator.clipboard.writeText(exportedBarcodesText).then(() => sonnerToast.success("Barcodes copied!")).catch(err => sonnerToast.error("Copy failed: " + err)); } };

  // --- EDIT/DELETE SALE LOGIC ---
  const openEditSaleModal = (sale: SaleTransaction) => {
    setEditingSale(sale);
    setEditSaleForm({ status: sale.status as SaleStatus }); // Pre-fill with current status
    setIsEditSaleModalOpen(true);
  };

  const handleEditSaleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingSale) return;
    if (!confirm(`Are you sure you want to change the status of this transaction (ID: ${editingSale.id}) to "${editSaleForm.status}"?`)) {
        return;
    }
    setIsSubmitting(true);
    setTransactions(prev => prev.map(tx => tx.id === editingSale.id ? {...tx, _isProcessing: true} : tx));
    try {
      // Using the existing update-status API. Ensure it can be called by a manager.
      // If manager identity needs to be passed for audit, adjust payload.
      const response = await fetch(`/api/sales/update-status`, { 
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: editingSale.id,
          newStatus: editSaleForm.status,
          // staffIdMakingChange: 'ManagerAction' // Or actual manager ID
        }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Failed to update sale status");
      }
      sonnerToast.success("Sale status updated successfully!");
      setIsEditSaleModalOpen(false);
      fetchTransactions(); // Refresh the list
    } catch (err: any) {
      sonnerToast.error("Error updating sale: " + err.message);
      setTransactions(prev => prev.map(tx => tx.id === editingSale!.id ? {...tx, _isProcessing: false} : tx));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSale = async (sale: SaleTransaction) => {
    if (!confirm(`Are you sure you want to permanently delete this sales transaction (ID: ${sale.id})? This action CANNOT be undone.`)) {
      return;
    }
    setTransactions(prev => prev.map(tx => tx.id === sale.id ? {...tx, _isProcessing: true} : tx));
    try {
      const response = await fetch(`/api/manager/sales-transactions/${sale.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Failed to delete sale transaction");
      }
      sonnerToast.success("Sale transaction deleted successfully!");
      fetchTransactions(); // Refresh
    } catch (err: any) {
      sonnerToast.error("Error deleting sale: " + err.message);
      setTransactions(prev => prev.map(tx => tx.id === sale.id ? {...tx, _isProcessing: false} : tx));
    }
  };

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        {/* ... (Top Buttons - no change) ... */}
        <div className="flex gap-2"> <Button onClick={() => setIsBulkAddModalOpen(true)} variant="outline"><UploadCloud className="mr-2 h-4 w-4" /> Bulk Add Sales</Button> <Button onClick={() => { const currentDefDates = getDefaultDateRange(); setExportFilters(prev => ({...prev, startDate: currentDefDates.startDate, endDate: currentDefDates.endDate })); setExportDataPreviewCount(null); setExportedBarcodesText(''); setActiveExportTab('excel'); setIsExportModalOpen(true); }} variant="outline"><Download className="mr-2 h-4 w-4" /> Export Data</Button> </div> <Button onClick={() => setViewMode(prev => prev === 'individual' ? 'daily' : 'individual')} variant="outline">{viewMode === 'individual' ? <CalendarDays className="mr-2 h-4 w-4" /> : <List className="mr-2 h-4 w-4" />}{viewMode === 'individual' ? 'View Daily Summary' : 'View Individual Transactions'}</Button>
      </div>

      <Card className="mb-4 max-w-screen-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" /> Filter Sales
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
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
            <Select value={filters.staffId || "all"} onValueChange={(value) => handleFilterChange('staffId', value === "all" ? "" : value)}>
              <SelectTrigger id="staffIdFilter">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
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
            <Select value={filters.status || "all"} onValueChange={(value) => handleFilterChange('status', value === "all" ? "" : value)}>
              <SelectTrigger id="statusFilter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
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
        <CardHeader><CardTitle>{viewMode === 'individual' ? 'Individual Transaction List' : 'Daily Sales Summary'}</CardTitle><CardDescription>Displaying {viewMode === 'individual' ? 'transactions' : 'daily summaries'} based on current filters.</CardDescription></CardHeader>
        <CardContent>
          {isLoading && (<div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">Loading data...</p></div>)}
          {error && !isLoading && (<p className="text-destructive text-center py-10">Error: {error}</p>)}
          {!isLoading && !error && (
            viewMode === 'individual' ? (
                transactions.length > 0 ? (
                  <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[170px] py-2 px-3">Timestamp</TableHead>
                          <TableHead className="py-2 px-3">Staff</TableHead>
                          <TableHead className="py-2 px-3 hidden md:table-cell">Article No</TableHead>
                          <TableHead className="py-2 px-3 ">Product Name</TableHead>
                          <TableHead className="text-right py-2 px-3">Weight (g)</TableHead>
                          <TableHead className="text-right py-2 px-3">Price (₹)</TableHead>
                          <TableHead className="hidden md:table-cell py-2 px-3">Status</TableHead>
                          <TableHead className="py-2 px-3">Barcode</TableHead>
                          <TableHead className="text-center py-2 px-3 ">Actions</TableHead> {/* New Actions Column */}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((tx) => (
                          <TableRow key={tx.id} className={`hover:bg-muted/50 ${tx._isProcessing ? 'opacity-50' : ''}`}>
                            <TableCell>{new Date(tx.timestamp).toLocaleString()}</TableCell>
                            <TableCell>{tx.staffId}</TableCell>
                            <TableCell className="hidden md:table-cell">{tx.articleNo}</TableCell>
                            <TableCell className="truncate max-w-[200px]">{tx.product_articleName || 'N/A'}</TableCell>
                            <TableCell className="text-right">{tx.weightGrams}</TableCell>
                            <TableCell className="text-right">{tx.calculatedSellPrice.toFixed(2)}</TableCell>
                            <TableCell className="hidden md:table-cell">{getStatusBadge(tx.status)}</TableCell>
                            <TableCell className="truncate max-w-[150px]">{tx.barcodeScanned || 'N/A'}</TableCell>
                            <TableCell className="text-center space-x-1">
                                <Button variant="outline" size="sm" onClick={() => openEditSaleModal(tx)} title="Edit Sale Status" disabled={tx._isProcessing || isSubmitting}>
                                    {tx._isProcessing && editingSale?.id === tx.id ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Edit className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteSale(tx)} title="Delete Sale" disabled={tx._isProcessing || isSubmitting}>
                                    {tx._isProcessing && !editingSale ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (<p className="text-center py-10 text-muted-foreground">No individual transactions found.</p>)
            ) : ( /* ... (Daily Summary Table - no change) ... */
                dailySummaries.length > 0 ? (<ScrollArea className="w-full whitespace-nowrap rounded-md border"><Table className="text-sm"><TableHeader><TableRow><TableHead className="py-2 px-3">Date</TableHead><TableHead className="text-right py-2 px-3">Packets Sold</TableHead><TableHead className="text-right py-2 px-3">Sale Value (₹)</TableHead><TableHead className="text-right py-2 px-3">Avg. Value (₹)</TableHead></TableRow></TableHeader><TableBody>{dailySummaries.map((summary) => (<TableRow key={summary.date} className="hover:bg-muted/50"><TableCell className="font-medium">{new Date(summary.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</TableCell><TableCell className="text-right">{summary.totalPacketsSold}</TableCell><TableCell className="text-right">₹{summary.totalSaleValue.toFixed(2)}</TableCell><TableCell className="text-right">₹{summary.avgPacketValue.toFixed(2)}</TableCell></TableRow>))}</TableBody></Table><ScrollBar orientation="horizontal" /></ScrollArea>) : (<p className="text-center py-10 text-muted-foreground">No data for daily summary.</p>)
            )
          )}
        </CardContent>
      </Card>

      <Dialog open={isBulkAddModalOpen} onOpenChange={setIsBulkAddModalOpen}>{/* ... (Bulk Add Dialog - no change) ... */}<DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Bulk Add Sales Transactions</DialogTitle><DialogDesc>Enter barcodes, select staff and date. Fixed time of 2 PM will be used.</DialogDesc></DialogHeader><div className="grid gap-4 py-4"><div className="grid gap-2"><Label htmlFor="barcodes">Barcodes (one per line)</Label><Textarea id="barcodes" name="barcodes" value={bulkSalesData.barcodes} onChange={handleBulkSalesInputChange} placeholder="211..." rows={8} className="font-mono text-xs"/><p className="text-xs text-muted-foreground">Format: Prefix({BARCODE_PREFIX_LENGTH})+ArticleNo({ARTICLE_NO_LENGTH})+Weight({WEIGHT_GRAMS_LENGTH})+[CheckDigit]</p></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label htmlFor="bulkStaffId">Staff</Label><Select name="staffId" value={bulkSalesData.staffId} onValueChange={(value) => handleBulkSalesSelectChange('staffId', value)}><SelectTrigger id="bulkStaffId"><SelectValue placeholder="Select Staff" /></SelectTrigger><SelectContent>{staffList.length > 0 ? staffList.map(staff => (<SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>)) : (<SelectItem value="" disabled>Loading...</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="bulkDateOfSale">Date of Sale</Label><Input type="date" id="bulkDateOfSale" name="dateOfSale" value={bulkSalesData.dateOfSale} onChange={handleBulkSalesInputChange}/></div></div></div><DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button type="button" onClick={handleBulkSalesSubmit} disabled={isSubmittingBulk}>{isSubmittingBulk && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit Bulk Sales</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isExportModalOpen} onOpenChange={(isOpen) => { /* ... (Export Dialog - no change) ... */ setIsExportModalOpen(isOpen); if (!isOpen) { setExportDataPreviewCount(null); setExportedBarcodesText(''); setActiveExportTab('excel'); }}}> <DialogContent className="sm:max-w-2xl"> <DialogHeader><DialogTitle>Export Sales Data</DialogTitle><DialogDesc>Configure filters and select format for your data export.</DialogDesc></DialogHeader> <Tabs defaultValue="excel" className="w-full pt-4" onValueChange={(value) => setActiveExportTab(value as 'excel' | 'barcodes')}> <TabsList className="grid w-full grid-cols-2"> <TabsTrigger value="excel"><FileSpreadsheet className="mr-2 h-4 w-4 inline-block"/> Export as Excel</TabsTrigger> <TabsTrigger value="barcodes"><FileText className="mr-2 h-4 w-4 inline-block"/>Export Barcodes (Text)</TabsTrigger> </TabsList> <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-1 border-b pb-4 mb-4"> <div><Label htmlFor="exportStartDate">Start Date</Label><Input type="date" id="exportStartDate" value={exportFilters.startDate} onChange={(e) => handleExportFilterChange('startDate', e.target.value)} /></div> <div><Label htmlFor="exportEndDate">End Date</Label><Input type="date" id="exportEndDate" value={exportFilters.endDate} onChange={(e) => handleExportFilterChange('endDate', e.target.value)} /></div> <div><Label htmlFor="exportStaffId">Staff</Label><Select value={exportFilters.staffId} onValueChange={(value) => handleExportFilterChange('staffId', value)}><SelectTrigger id="exportStaffId"><SelectValue placeholder="All Staff" /></SelectTrigger><SelectContent><SelectItem value="all">All Staff</SelectItem>{staffList.map(staff => (<SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>))}</SelectContent></Select></div> <div><Label htmlFor="exportSortOrder">Sort Order</Label><Select value={exportFilters.sortOrder} onValueChange={(value) => handleExportFilterChange('sortOrder', value)}><SelectTrigger id="exportSortOrder"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="desc">Newest First</SelectItem><SelectItem value="asc">Oldest First</SelectItem></SelectContent></Select></div> </div> <TabsContent value="excel" className="space-y-4"> <h4 className="font-medium text-sm mb-2">Select Fields to Include in Excel:</h4> <ScrollArea className="max-h-60 w-full rounded-md border p-3"><div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">{ALL_EXPORTABLE_FIELDS.map(field => (<div key={field.key} className="flex items-center space-x-2"><Checkbox id={`export-field-${field.key}`} checked={exportFilters.selectedFields.includes(field.key)} onCheckedChange={() => handleExportFieldToggle(field.key)}/><Label htmlFor={`export-field-${field.key}`} className="text-xs font-normal cursor-pointer">{field.label}</Label></div>))}</div></ScrollArea> <div className="flex items-center justify-between gap-2 mt-2"><Button variant="outline" onClick={() => fetchExportData(true, false)} disabled={isExporting}>{isExporting && exportDataPreviewCount === null ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Preview Data Count</Button>{exportDataPreviewCount !== null && <span className="text-sm text-muted-foreground">{exportDataPreviewCount} records match.</span>}</div> </TabsContent> <TabsContent value="barcodes" className="space-y-4"> <p className="text-sm text-muted-foreground">This will export only the "Barcode Scanned" field for the selected criteria.</p> <div className="flex items-center justify-between gap-2 mt-2"><Button variant="outline" onClick={() => fetchExportData(true, true)} disabled={isExporting}>{isExporting && exportDataPreviewCount === null ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Preview Barcode Count</Button>{exportDataPreviewCount !== null && <span className="text-sm text-muted-foreground">{exportDataPreviewCount} barcodes match.</span>}</div> {exportedBarcodesText && (<div className="space-y-2"><Label htmlFor="exportedBarcodesArea">Barcodes:</Label><div className="relative"><ScrollArea className="w-full whitespace-pre-wrap rounded-md border max-h-25"><Textarea id="exportedBarcodesArea" value={exportedBarcodesText} readOnly className="font-mono text-xs pr-10 max-h-25 resize-none"/><ScrollBar orientation="vertical" /></ScrollArea><Button variant="ghost" size="sm" onClick={copyBarcodesToClipboard} className="absolute top-2 right-6 h-6 w-6 z-10" title="Copy barcodes"><Copy className="h-3.5 w-3.5"/></Button></div></div>)} </TabsContent> </Tabs> <DialogFooter className="mt-6"> <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose> <Button onClick={async () => { if (activeExportTab === 'excel') { await handleGenerateExcel(); } else if (activeExportTab === 'barcodes') { await handleExportBarcodesAsText(); } }} disabled={isExporting || exportDataPreviewCount === null || exportDataPreviewCount === 0}> {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Generate Export </Button> </DialogFooter> </DialogContent> </Dialog>

      {/* Edit Sale Dialog */}
      {editingSale && (
        <Dialog open={isEditSaleModalOpen} onOpenChange={setIsEditSaleModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Sale Transaction</DialogTitle>
              <DialogDesc>
                Modify the status for transaction ID: {editingSale.id}. <br />
                Product: {editingSale.product_articleName || editingSale.articleNo} ({editingSale.weightGrams}g)
              </DialogDesc>
            </DialogHeader>
            <form onSubmit={handleEditSaleSubmit} className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="editSaleStatus" className="text-right col-span-1">Status</Label>
                <Select
                  name="status"
                  value={editSaleForm.status}
                  onValueChange={(value) => setEditSaleForm({ status: value as SaleStatus })}
                  required
                >
                  <SelectTrigger id="editSaleStatus" className="col-span-3">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOLD">SOLD</SelectItem>
                    <SelectItem value="RETURNED_PRE_BILLING">RETURNED_PRE_BILLING</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Add other editable fields here if needed in the future */}
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}