// src/app/manager/protected/sales-log/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { Loader2, Filter, UploadCloud, List, CalendarDays, Download, Copy, FileText, FileSpreadsheet, Trash2, ChevronLeft , ChevronRight } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import * as XLSX from 'xlsx';

// --- Interface Definitions ---
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
  _isProcessing?: boolean;
}

interface StaffMember { id: string; name: string; }

interface DailySaleSummary { 
    date: string; 
    totalSalesValue: number; 
    totalTransactions: number; 
    avgPacketValue?: number; 
}

type ViewMode = 'individual' | 'daily';
type QuickPeriod = 'today' | 'last7d' | 'last30d' | 'custom';

// For Bulk Add Payload (matching API expectation)
interface ManagerBulkSaleItemPayloadFE { // FE for Frontend
  barcodeScanned: string;
  articleNo: string;      
  weightGrams: number;    
  staffId: string;        
  dateOfSale: string;     
}


const ALL_EXPORTABLE_FIELDS: { key: keyof SaleTransaction | 'id'; label: string }[] = [
    { key: 'id', label: 'Transaction ID (Internal)' }, { key: 'timestamp', label: 'Timestamp (Full)' }, 
    { key: 'dateOfSale', label: 'Date of Sale' }, { key: 'staffId', label: 'Staff ID' }, 
    { key: 'barcodeScanned', label: 'Barcode Scanned' }, { key: 'articleNo', label: 'Article No (from Sale)' }, 
    { key: 'product_articleName', label: 'Product Name' }, { key: 'product_articleNumber', label: 'Product Article No' }, 
    { key: 'weightGrams', label: 'Weight (g)' }, { key: 'calculatedSellPrice', label: 'Sell Price (₹)' }, 
    { key: 'status', label: 'Status' }, { key: 'product_posDescription', label: 'Product POS Desc' }, 
    { key: 'product_metlerCode', label: 'Product Metler Code' }, { key: 'product_hsnCode', label: 'Product HSN Code' }, 
    { key: 'product_taxPercentage', label: 'Product Tax %' }, { key: 'product_purchasePricePerKg', label: 'Product Purchase Price/Kg' }, 
    { key: 'product_sellingRatePerKg', label: 'Product Selling Rate/Kg' }, { key: 'product_mrpPer100g', label: 'Product MRP/100g' }, 
    { key: 'product_remark', label: 'Product Remark' },
];
const DEFAULT_EXCEL_FIELDS: (keyof SaleTransaction | 'id')[] = [
    'dateOfSale', 'timestamp', 'staffId', 'barcodeScanned', 'product_articleName', 'weightGrams', 'calculatedSellPrice'
];

const IST_TIMEZONE_CLIENT = 'Asia/Kolkata';
const getISODateStringForClient = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const getNowInClientIST = (): Date => new Date(new Date().toLocaleString("en-US", { timeZone: IST_TIMEZONE_CLIENT }));

const BARCODE_PREFIX_LENGTH = 7; // Define these constants here if needed by parseBarcode
const ARTICLE_NO_IN_BARCODE_LENGTH = 9;
const WEIGHT_GRAMS_IN_BARCODE_LENGTH = 5;
const BARCODE_PREFIX = "2110000"; // Assuming this is the prefix

export default function ManagerSalesLogPage() {
  const [transactions, setTransactions] = useState<SaleTransaction[]>([]);
  const [transactionPagination, setTransactionPagination] = useState<{currentPage: number, totalPages: number, totalItems: number} | null>(null);
  const [dailySummaries, setDailySummaries] = useState<DailySaleSummary[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isLoadingDailySummaries, setIsLoadingDailySummaries] = useState(false);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('daily');

  const [activeQuickPeriod, setActiveQuickPeriod] = useState<QuickPeriod>('last7d');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');


  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [bulkSalesData, setBulkSalesData] = useState({ 
    barcodes: '', 
    staffId: '', 
    dateOfSale: getISODateStringForClient(getNowInClientIST()) 
  });
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [activeExportTab, setActiveExportTab] = useState<'excel' | 'barcodes'>('excel');
  const [exportFilters, setExportFilters] = useState({ 
    startDate: getISODateStringForClient(getNowInClientIST()),
    endDate: getISODateStringForClient(getNowInClientIST()),
    staffId: 'all', 
    sortOrder: 'desc', 
    selectedFields: DEFAULT_EXCEL_FIELDS,
    status: 'all', 
  });
  const [exportDataPreviewCount, setExportDataPreviewCount] = useState<number | null>(null);
  const [exportedBarcodesText, setExportedBarcodesText] = useState('');


  const getDateRangeForQuickPeriod = useCallback((period: QuickPeriod): {startDate: string, endDate: string} => {
    const nowIST = getNowInClientIST();
    let sDate = nowIST;
    let eDate = nowIST;

    switch(period) {
        case 'today':
            break;
        case 'last7d':
            sDate = new Date(nowIST);
            sDate.setDate(nowIST.getDate() - 6);
            break;
        case 'last30d':
            sDate = new Date(nowIST);
            sDate.setDate(nowIST.getDate() - 29);
            break;
        case 'custom':
             return {startDate: customDateRange.startDate, endDate: customDateRange.endDate};
    }
    return {
        startDate: getISODateStringForClient(sDate),
        endDate: getISODateStringForClient(eDate)
    };
  }, [customDateRange.startDate, customDateRange.endDate]);


  const fetchStaffList = useCallback(async () => {
    setIsLoadingStaff(true);
    try {
      const response = await fetch('/api/manager/staff-list');
      if (!response.ok) throw new Error('Failed to fetch staff list');
      const data: StaffMember[] = await response.json();
      setStaffList(data);
      if (data.length > 0 && !bulkSalesData.staffId) {
        setBulkSalesData(prev => ({ ...prev, staffId: data[0].id }));
      }
    } catch (err: any) { sonnerToast.error("Error fetching staff: " + err.message); } 
    finally { setIsLoadingStaff(false); }
  }, [bulkSalesData.staffId]);


  const fetchDailySummaries = useCallback(async () => {
    setIsLoadingDailySummaries(true); setError(null);
    
    const {startDate, endDate} = activeQuickPeriod === 'custom' && customDateRange.startDate && customDateRange.endDate
                                 ? customDateRange
                                 : getDateRangeForQuickPeriod(activeQuickPeriod);
    
    if (!startDate || !endDate) {
        sonnerToast.warning("Please select a valid date range for daily summaries.");
        setIsLoadingDailySummaries(false);
        return;
    }

    const queryParams = new URLSearchParams({ mode: 'dailySummaries', startDate, endDate });
    if (selectedStaffId && selectedStaffId !== 'all') queryParams.append('staffId', selectedStaffId);
    
    try {
      const response = await fetch(`/api/manager/sales-transactions?${queryParams.toString()}`);
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || 'Failed to fetch daily summaries'); }
      const data = await response.json();
      setDailySummaries((data.dailySummaries || []).map((s: DailySaleSummary) => ({
          ...s,
          totalSalesValue: s.totalSalesValue || 0, // Default to 0 if undefined
          totalTransactions: s.totalTransactions || 0, // Default to 0
          avgPacketValue: (s.totalTransactions && s.totalTransactions > 0 && s.totalSalesValue) ? s.totalSalesValue / s.totalTransactions : 0
      })));
    } catch (err: any) { setError(err.message); setDailySummaries([]); sonnerToast.error("Error fetching daily summaries: " + err.message); } 
    finally { setIsLoadingDailySummaries(false); }
  }, [activeQuickPeriod, customDateRange, selectedStaffId, getDateRangeForQuickPeriod]);


  const fetchIndividualTransactions = useCallback(async (page: number = 1) => {
    setIsLoadingTransactions(true); setError(null);
    if (page === 1) {
        setTransactions([]);
        setTransactionPagination(null);
    }
    const {startDate, endDate} = activeQuickPeriod === 'custom' && customDateRange.startDate && customDateRange.endDate
                                 ? customDateRange
                                 : getDateRangeForQuickPeriod(activeQuickPeriod);

    if (!startDate || !endDate) {
        sonnerToast.warning("Please select a valid date range for transactions.");
        setIsLoadingTransactions(false);
        return;
    }
    
    const queryParams = new URLSearchParams({ mode: 'transactions', startDate, endDate, page: String(page), limit: '30' });
    if (selectedStaffId && selectedStaffId !== 'all') queryParams.append('staffId', selectedStaffId);
    
    try {
      const response = await fetch(`/api/manager/sales-transactions?${queryParams.toString()}`);
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || 'Failed to fetch transactions'); }
      const data = await response.json();
      setTransactions(data.transactions || []);
      setTransactionPagination(data.pagination || null);
    } catch (err: any) { setError(err.message); setTransactions([]); setTransactionPagination(null); sonnerToast.error("Error fetching transactions: " + err.message); } 
    finally { setIsLoadingTransactions(false); }
  }, [activeQuickPeriod, customDateRange, selectedStaffId, getDateRangeForQuickPeriod]);

  
  useEffect(() => {
    fetchStaffList();
    if (viewMode === 'daily') {
      fetchDailySummaries();
    } else { 
      fetchIndividualTransactions(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 


  const handleApplyFilters = () => {
    if (activeQuickPeriod === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) {
        sonnerToast.warning("For custom range, please select both start and end dates.");
        return;
    }
    if (new Date(customDateRange.startDate) > new Date(customDateRange.endDate)) {
        sonnerToast.error("Start date cannot be after end date for custom range.");
        return;
    }
    if (viewMode === 'daily') {
      fetchDailySummaries();
    } else {
      fetchIndividualTransactions(1);
    }
  };
  
  const handleViewModeChange = (newMode: ViewMode) => {
    setViewMode(newMode);
    // When switching, apply the current filters or default to a sensible period
    if (newMode === 'daily') {
        setActiveQuickPeriod(prev => prev === 'custom' ? 'custom' : 'last7d'); // Keep custom if it was set
        // Data fetch will be triggered by useEffect watching viewMode, activeQuickPeriod, selectedStaffId
    } else { // individual
        setActiveQuickPeriod(prev => prev === 'custom' ? 'custom' : 'today'); // Keep custom if it was set
    }
  };

  useEffect(() => {
    if(!isLoadingStaff) { 
        if (viewMode === 'daily') {
            fetchDailySummaries();
        } else {
            fetchIndividualTransactions(1);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, activeQuickPeriod, selectedStaffId]);


  const parseBarcode = (barcode: string): { articleNo: string; weightGrams: number } | null => { 
    barcode = barcode.trim(); 
    if (barcode.length < BARCODE_PREFIX.length + ARTICLE_NO_IN_BARCODE_LENGTH + WEIGHT_GRAMS_IN_BARCODE_LENGTH) return null; 
    try { 
        const articleNo = barcode.substring(BARCODE_PREFIX.length, BARCODE_PREFIX.length + ARTICLE_NO_IN_BARCODE_LENGTH); 
        const weightStr = barcode.substring(BARCODE_PREFIX.length + ARTICLE_NO_IN_BARCODE_LENGTH, BARCODE_PREFIX.length + ARTICLE_NO_IN_BARCODE_LENGTH + WEIGHT_GRAMS_IN_BARCODE_LENGTH); 
        const weightGrams = parseInt(weightStr, 10); 
        if (isNaN(weightGrams) || !/^\d+$/.test(articleNo)) return null; 
        return { articleNo, weightGrams }; 
    } catch (e) { return null; } 
  };

  const handleBulkSalesInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setBulkSalesData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  const handleBulkSalesSelectChange = (name: 'staffId', value: string) => {
    setBulkSalesData(prev => ({ ...prev, [name]: value }));
  };

  const handleBulkSalesSubmit = async () => {
    if (!bulkSalesData.barcodes.trim() || !bulkSalesData.staffId || !bulkSalesData.dateOfSale) {
      sonnerToast.error("Barcodes, Staff ID, and Date of Sale are required for bulk sales.");
      return;
    }
    const barcodeLines = bulkSalesData.barcodes.trim().split('\n');
    const salesToRecord: ManagerBulkSaleItemPayloadFE[] = [];
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
        sonnerToast.warning(`Invalid barcode format: "${barcode}"`);
      }
    }

    if (parseErrors > 0) {
      if (!confirm(`${parseErrors} barcode(s) had an invalid format and were ignored. Proceed with the ${salesToRecord.length} valid one(s)?`)) {
        return;
      }
    }
    if (salesToRecord.length === 0) {
      sonnerToast.info("No valid sales data to submit after parsing.");
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
      if (!response.ok && response.status !== 207) {
        throw new Error(result.message || "Bulk recording failed");
      }
      
      sonnerToast.success(
        `Bulk process finished: ${result.successfulRecords || 0} recorded, ${result.failedRecords || 0} failed.`
      );
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach((err: {barcode: string, message: string}) => sonnerToast.error(`Error for ${err.barcode}: ${err.message}`));
      }

      setIsBulkAddModalOpen(false);
      setBulkSalesData(prev => ({ ...prev, barcodes: '' }));
      if (viewMode === 'daily') {
        fetchDailySummaries();
      } else {
        fetchIndividualTransactions(1);
      }
    } catch (err: any) {
      sonnerToast.error("Bulk sales submission error: " + err.message);
    } finally {
      setIsSubmittingBulk(false);
    }
  };

const handleExportFilterChange = (field: keyof typeof exportFilters, value: string | string[]) => {
  setExportFilters(prev => ({ ...prev, [field]: value }));
  setExportDataPreviewCount(null);
};

const handleExportFieldToggle = (fieldKey: keyof SaleTransaction | 'id') => {
  setExportFilters(prev => {
    const newSelectedFields = prev.selectedFields.includes(fieldKey)
      ? prev.selectedFields.filter(key => key !== fieldKey)
      : [...prev.selectedFields, fieldKey];
    return { ...prev, selectedFields: newSelectedFields as (keyof SaleTransaction | 'id')[] }; // Type assertion
  });
};

const fetchExportData = async (forPreviewCountOnly = false, forBarcodeTextExport = false): Promise<SaleTransaction[] | number> => {
  setIsExporting(true);
  if (!forPreviewCountOnly && forBarcodeTextExport) {setExportedBarcodesText('');}

  const queryParams = new URLSearchParams();
  if (exportFilters.startDate) queryParams.append('startDate', exportFilters.startDate);
  if (exportFilters.endDate) queryParams.append('endDate', exportFilters.endDate);
  if (exportFilters.staffId && exportFilters.staffId !== 'all') queryParams.append('staffId', exportFilters.staffId);
  if (exportFilters.status && exportFilters.status !== 'all') queryParams.append('status', exportFilters.status);
  queryParams.append('sortOrder', exportFilters.sortOrder);
  // For preview, API might handle limit, for full export, API sends up to 10000
  queryParams.append('limit', forPreviewCountOnly ? '0' : '10000'); 
  queryParams.append('countOnly', String(forPreviewCountOnly));

  try {
    const response = await fetch(`/api/manager/sales-transactions/export?${queryParams.toString()}`);
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.message || "Failed to fetch data for export");
    }
    const data = await response.json();

    if (forPreviewCountOnly) {
      const count = data.totalRecords || 0;
      setExportDataPreviewCount(count);
      return count;
    } else {
      const fetchedTransactions = data.transactions as SaleTransaction[] || [];
      if (forBarcodeTextExport) {
        const barcodes = fetchedTransactions
          .map(tx => String(tx.barcodeScanned || ''))
          .filter(barcode => barcode.trim() !== "")
          .join('\n');
        setExportedBarcodesText(barcodes);
      }
      return fetchedTransactions;
    }
  } catch (err:any) {
    sonnerToast.error("Export error: " + err.message);
    if (forPreviewCountOnly) setExportDataPreviewCount(0);
    return forPreviewCountOnly ? 0 : [];
  } finally {
    setIsExporting(false);
  }
};

const handleGenerateExcel = async () => {
  setIsExporting(true);
  // 'dataToExport' comes from fetchExportData, which gets data from the API
  const dataToExport = await fetchExportData(false, false) as SaleTransaction[];
  setIsExporting(false);

  if (!dataToExport || dataToExport.length === 0) {
    sonnerToast.info("No data available to export for the selected criteria.");
    return;
  }

  // 'selectedHeaders' correctly uses exportFilters.selectedFields to get labels
  const selectedHeaders = exportFilters.selectedFields
      .map(key => ALL_EXPORTABLE_FIELDS.find(f => f.key === key)?.label || String(key));

  const worksheetData = dataToExport.map(tx => {
      const row: any = {};
      // This loop is correct: it iterates over the fields the user selected.
      exportFilters.selectedFields.forEach(key => { 
          const fieldConfig = ALL_EXPORTABLE_FIELDS.find(f => f.key === key);
          let value = tx[key as keyof SaleTransaction] as any; // Access data using the key from selectedFields

          // Formatting for specific fields
          if (key === 'timestamp' && value) {
              value = new Date(value).toLocaleString();
          }
          if (key === 'calculatedSellPrice' && typeof value === 'number') {
              value = value.toFixed(2);
          }
          // Add formatting for other numeric product fields if they exist
          if ((key === 'product_taxPercentage' || 
               key === 'product_purchasePricePerKg' || 
               key === 'product_sellingRatePerKg' || 
               key === 'product_mrpPer100g') && typeof value === 'number') {
              value = value.toFixed(2); // Or appropriate formatting
          }


          // The issue is likely here: if tx[key] is undefined, String(undefined) is "undefined"
          // or if null, String(null) is "null". We want blank.
          row[fieldConfig?.label || String(key)] = value !== undefined && value !== null ? String(value) : ''; 
      });
      return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(worksheetData, { header: selectedHeaders });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SalesData");
  XLSX.writeFile(workbook, `SalesExport_${exportFilters.startDate}_to_${exportFilters.endDate}.xlsx`);
  sonnerToast.success("Excel file generation initiated!");
};

const handleExportBarcodesAsText = async () => {
  setIsExporting(true);
  await fetchExportData(false, true);
  setIsExporting(false);
  if (exportedBarcodesText) {
    sonnerToast.success("Barcodes prepared for copying.");
  } else if(exportDataPreviewCount === 0) {
    sonnerToast.info("No barcodes to export for the selected criteria.");
  }
};

const copyBarcodesToClipboard = () => {
  if (exportedBarcodesText) {
    navigator.clipboard.writeText(exportedBarcodesText)
      .then(() => sonnerToast.success("Barcodes copied to clipboard!"))
      .catch(err => sonnerToast.error("Failed to copy barcodes: " + String(err)));
  }
};

const handleDeleteSale = async (sale: SaleTransaction) => {
  if (!confirm(`Are you sure you want to permanently delete sales transaction ID: ${sale.id} (Product: ${sale.product_articleName || sale.articleNo})? This action will also attempt to reverse its impact on daily aggregates and CANNOT be undone.`)) {
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
    sonnerToast.success("Sale transaction deleted and aggregates adjusted successfully!");
    if (viewMode === 'individual' && transactionPagination) {
       // If last item on a page > 1, fetch previous page, else refetch current.
      if (transactions.length === 1 && transactionPagination.currentPage > 1) {
          fetchIndividualTransactions(transactionPagination.currentPage - 1);
      } else {
          fetchIndividualTransactions(transactionPagination.currentPage);
      }
    } else if (viewMode === 'daily') {
      fetchDailySummaries();
    } else { 
      fetchIndividualTransactions(1);
    }
  } catch (err: any) {
    sonnerToast.error("Error deleting sale: " + err.message);
    setTransactions(prev => prev.map(tx => tx.id === sale.id ? {...tx, _isProcessing: false} : tx));
  }
};

const isLoadingData = (viewMode === 'daily' && isLoadingDailySummaries) || (viewMode === 'individual' && isLoadingTransactions);
const todayForInputMax = useMemo(() => getISODateStringForClient(getNowInClientIST()), []);

const dailySummaryTotals = useMemo(() => {
    if (!dailySummaries || dailySummaries.length === 0) {
        return { grandTotalPackets: 0, grandTotalSalesValue: 0, overallAveragePacketValue: 0 };
    }

    const grandTotalPackets = dailySummaries.reduce((acc, curr) => acc + (curr.totalTransactions || 0), 0);
    const grandTotalSalesValue = dailySummaries.reduce((acc, curr) => acc + (curr.totalSalesValue || 0), 0);
    const overallAveragePacketValue = grandTotalPackets > 0 ? grandTotalSalesValue / grandTotalPackets : 0;

    return { grandTotalPackets, grandTotalSalesValue, overallAveragePacketValue };
}, [dailySummaries]);


return (
  <>
    <Toaster richColors position="top-right" />
    <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
      <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setIsBulkAddModalOpen(true)} variant="outline" disabled={isLoadingStaff}><UploadCloud className="mr-2 h-4 w-4" /> Bulk Add Sales</Button>
          <Button onClick={() => { 
              const today = getISODateStringForClient(getNowInClientIST());
              setExportFilters(prev => ({...prev, startDate: today, endDate: today, status: 'SOLD'}));
              setExportDataPreviewCount(null); 
              setExportedBarcodesText(''); 
              setActiveExportTab('excel'); 
              setIsExportModalOpen(true); 
          }} variant="outline"><Download className="mr-2 h-4 w-4" /> Export Data</Button>
      </div>
    </div>

    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Filter Sales Log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-x-4 gap-y-2 items-end">
              <div className="flex-grow space-y-1">
                  <Label>Period</Label>
                  <Select 
                      value={activeQuickPeriod} 
                      onValueChange={(value) => setActiveQuickPeriod(value as QuickPeriod)}
                  >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="today">Today</SelectItem>
                          <SelectItem value="last7d">Last 7 Days</SelectItem>
                          <SelectItem value="last30d">Last 30 Days</SelectItem>
                          <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
              
              {activeQuickPeriod === 'custom' && (
                  <>
                      <div className="flex-grow  space-y-1"><Label htmlFor="customStartDate">Start Date</Label><Input type="date" id="customStartDate" value={customDateRange.startDate} onChange={(e) => setCustomDateRange(prev => ({...prev, startDate: e.target.value}))} max={todayForInputMax} /></div>
                      <div className="flex-grow  space-y-1"><Label htmlFor="customEndDate">End Date</Label><Input type="date" id="customEndDate" value={customDateRange.endDate} onChange={(e) => setCustomDateRange(prev => ({...prev, endDate: e.target.value}))} max={todayForInputMax} /></div>
                  </>
              )}
              <div className="flex-grow  space-y-1">
                  <Label htmlFor="staffIdFilter">Staff</Label>
                  <Select value={selectedStaffId} onValueChange={(value) => setSelectedStaffId(value)}>
                      <SelectTrigger id="staffIdFilter"><SelectValue placeholder="All Staff" /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">All Staff</SelectItem>
                          {staffList.map(staff => (<SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>))}
                      </SelectContent>
                  </Select>
              </div>
              <Button onClick={handleApplyFilters} disabled={isLoadingData} className="h-10 shrink-0">
                  {isLoadingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
                  Apply Filters
              </Button>
          </div>
          <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleViewModeChange('daily')} variant={viewMode === 'daily' ? 'default' : 'outline'}><CalendarDays className="mr-2 h-4 w-4"/>Daily Summary</Button>
              <Button onClick={() => handleViewModeChange('individual')} variant={viewMode === 'individual' ? 'default' : 'outline'}><List className="mr-2 h-4 w-4"/>Individual Transactions</Button>
          </div>
      </CardContent>
    </Card>
    
    <Card>
      <CardHeader>
          <CardTitle>{viewMode === 'individual' ? 'Individual Transactions (SOLD only)' : 'Daily Sales Summary'}</CardTitle>
          <CardDescription>
              Displaying data for {activeQuickPeriod === 'custom' ? `${customDateRange.startDate || '...'} to ${customDateRange.endDate || '...'}` : activeQuickPeriod.replace('last','Last ').replace('d',' Days')}
              {selectedStaffId !=='all' ? ` for Staff: ${staffList.find(s=>s.id === selectedStaffId)?.name || selectedStaffId}` : ' for All Staff'}.
          </CardDescription>
      </CardHeader>
      <CardContent>
        {(isLoadingDailySummaries && viewMode === 'daily') && <div className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary"/> <p>Loading daily summaries...</p></div>}
        {(isLoadingTransactions && viewMode === 'individual') && <div className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary"/> <p>Loading transactions...</p></div>}
        {error && !isLoadingData && <p className="text-destructive text-center py-10">Error: {error}</p>}

        {viewMode === 'daily' && !isLoadingDailySummaries && !error && (
          dailySummaries.length > 0 ? (
              <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                <Table className="text-xs">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="">Date</TableHead>
                            <TableHead className="text-right ">Total Packets</TableHead>
                            <TableHead className="text-right ">Total Value (₹)</TableHead>
                            <TableHead className="text-right ">Avg. Value (₹)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {dailySummaries.map((s) => (
                            <TableRow key={s.date}>
                                <TableCell className="font-medium">{new Date(s.date + 'T00:00:00Z').toLocaleDateString(undefined, {timeZone:'UTC', year:'numeric',month:'long',day:'numeric'})}</TableCell>
                                <TableCell className="text-right">{s.totalTransactions}</TableCell>
                                <TableCell className="text-right">₹{(s.totalSalesValue || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right">₹{(s.avgPacketValue || 0).toFixed(2)}</TableCell>
                            </TableRow>
                        ))}
                        {/* Grand Total Row */}
                        <TableRow className="border-t-2 border-primary bg-muted/30">
                            <TableCell className="font-semibold">Grand Total</TableCell>
                            <TableCell className="text-right font-semibold">{dailySummaryTotals.grandTotalPackets}</TableCell>
                            <TableCell className="text-right font-semibold">₹{dailySummaryTotals.grandTotalSalesValue.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">₹{dailySummaryTotals.overallAveragePacketValue.toFixed(2)}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <ScrollBar orientation="horizontal"/>
              </ScrollArea>
          ) : <p className="text-center py-10 text-muted-foreground">No daily summaries found for selected criteria.</p>
        )}

        {viewMode === 'individual' && !isLoadingTransactions && !error && (
          transactions.length > 0 ? (
            <>
              <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                <Table className="text-xs">
                  <TableHeader><TableRow><TableHead className="">Timestamp</TableHead><TableHead className="">Staff</TableHead><TableHead className="">Product Name</TableHead><TableHead className="">Weight(gm)</TableHead><TableHead className="text-right">Price (₹)</TableHead><TableHead className=" hidden md:table-cell">Barcode</TableHead><TableHead className="text-center">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id} className={`${tx._isProcessing ? 'opacity-50' : ''}`}>
                        <TableCell>{new Date(tx.timestamp).toLocaleString()}</TableCell>
                        <TableCell>{staffList.find(s => s.id === tx.staffId)?.name || tx.staffId}</TableCell>
                        <TableCell className="text-left">{tx.product_articleName || tx.articleNo}</TableCell>
                        <TableCell className="text-right">{tx.weightGrams.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{tx.calculatedSellPrice.toFixed(2)}</TableCell>
                        <TableCell className="hidden md:table-cell truncate max-w-[150px]">{tx.barcodeScanned || 'N/A'}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteSale(tx)} title="Delete Sale" disabled={tx._isProcessing || isSubmittingBulk} className="h-7 w-7">
                              {tx._isProcessing ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal"/>
              </ScrollArea>
              {transactionPagination && transactionPagination.totalPages > 1 && (
                  <div className="flex justify-center items-center space-x-2 mt-4">
                      <Button variant="outline" size="sm" onClick={() => fetchIndividualTransactions(transactionPagination.currentPage - 1)} disabled={transactionPagination.currentPage <= 1 || isLoadingTransactions}><ChevronLeft className="h-4 w-4"/> Prev</Button>
                      <span>Page {transactionPagination.currentPage} of {transactionPagination.totalPages} ({transactionPagination.totalItems} items)</span>
                      <Button variant="outline" size="sm" onClick={() => fetchIndividualTransactions(transactionPagination.currentPage + 1)} disabled={transactionPagination.currentPage >= transactionPagination.totalPages || isLoadingTransactions}>Next <ChevronRight className="h-4 w-4"/></Button>
                  </div>
              )}
            </>
          ) : <p className="text-center py-10 text-muted-foreground">No transactions found for "SOLD" status and selected criteria.</p>
        )}
      </CardContent>
    </Card>

    {/* Bulk Add Dialog */}
    <Dialog open={isBulkAddModalOpen} onOpenChange={setIsBulkAddModalOpen}>
      <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Bulk Add Sales Transactions</DialogTitle><DialogDesc>Enter barcodes, select staff and date of sale. Sales will be recorded as "SOLD". Timestamp will be set to 2 PM on the selected date (server time).</DialogDesc></DialogHeader>
          <div className="grid gap-4 py-4">
              <div className="grid gap-2"><Label htmlFor="barcodes">Barcodes (one per line)</Label><Textarea id="barcodes" name="barcodes" value={bulkSalesData.barcodes} onChange={handleBulkSalesInputChange} placeholder={`2110000600038848000421\n2110000600038851002081\n...`} rows={8} className="font-mono text-xs"/><p className="text-xs text-muted-foreground">Format: {BARCODE_PREFIX}({BARCODE_PREFIX.length})+ArticleNo({ARTICLE_NO_IN_BARCODE_LENGTH})+Weight({WEIGHT_GRAMS_IN_BARCODE_LENGTH})+[CheckDigit(1)]</p></div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2"><Label htmlFor="bulkStaffId">Staff Performing Sale</Label><Select name="staffId" value={bulkSalesData.staffId} onValueChange={(value) => handleBulkSalesSelectChange('staffId', value)}><SelectTrigger id="bulkStaffId"><SelectValue placeholder="Select Staff" /></SelectTrigger><SelectContent>{staffList.length > 0 ? staffList.map(staff => (<SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>)) : (<SelectItem value="" disabled>Loading staff...</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label htmlFor="bulkDateOfSale">Date of Sale</Label><Input type="date" id="bulkDateOfSale" name="dateOfSale" value={bulkSalesData.dateOfSale} onChange={handleBulkSalesInputChange} max={getISODateStringForClient(getNowInClientIST())}/></div>
              </div>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline" disabled={isSubmittingBulk}>Cancel</Button></DialogClose><Button type="button" onClick={handleBulkSalesSubmit} disabled={isSubmittingBulk}>{isSubmittingBulk && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit Bulk Sales</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    
    {/* Export Dialog */}
{/* Export Dialog */}
<Dialog open={isExportModalOpen} onOpenChange={(isOpen) => { setIsExportModalOpen(isOpen); if (!isOpen) { setExportDataPreviewCount(null); setExportedBarcodesText(''); setActiveExportTab('excel'); }}}>
  <DialogContent className="sm:max-w-2xl max-h-[95vh] flex flex-col p-4 sm:p-6">
      <DialogHeader>
          <DialogTitle>Export Sales Data</DialogTitle>
          <DialogDesc className="text-xs">Configure filters and select format for your data export. Default date is today.</DialogDesc>
          <DialogDesc className="text-sm text-red-400 font-medium">Remember that exporting data is an Document Read Expensive functionality, don't use it often !!</DialogDesc>
      </DialogHeader>
      {/* Main ScrollArea for dialog content between header and footer */}
      <ScrollArea className="flex-grow pr-2 -mr-2 min-h-0"> {/* Added min-h-0, removed py-4 */}
          <Tabs defaultValue="excel" className="w-full" onValueChange={(value) => setActiveExportTab(value as 'excel' | 'barcodes')}>
              <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="excel"><FileSpreadsheet className="mr-2 h-4 w-4 inline-block"/> Export as Excel</TabsTrigger>
                  <TabsTrigger value="barcodes"><FileText className="mr-2 h-4 w-4 inline-block"/>Export Barcodes (Text)</TabsTrigger>
              </TabsList>
              
              {/* Filters Section - COMMON to both tabs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-1 border-b pb-4 mb-4">
                  <div><Label htmlFor="exportStartDate">Start Date</Label><Input type="date" id="exportStartDate" value={exportFilters.startDate} onChange={(e) => handleExportFilterChange('startDate', e.target.value)} max={todayForInputMax} /></div>
                  <div><Label htmlFor="exportEndDate">End Date</Label><Input type="date" id="exportEndDate" value={exportFilters.endDate} onChange={(e) => handleExportFilterChange('endDate', e.target.value)} max={todayForInputMax} /></div>
                  <div><Label htmlFor="exportStaffId">Staff</Label><Select value={exportFilters.staffId} onValueChange={(value) => handleExportFilterChange('staffId', value)}><SelectTrigger id="exportStaffId"><SelectValue placeholder="All Staff" /></SelectTrigger><SelectContent><SelectItem value="all">All Staff</SelectItem>{staffList.map(staff => (<SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>))}</SelectContent></Select></div>
                  <div><Label htmlFor="exportStatus">Status</Label><Select value={exportFilters.status} onValueChange={(value) => handleExportFilterChange('status', value)}><SelectTrigger id="exportStatus"><SelectValue placeholder="All Statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="SOLD">SOLD</SelectItem><SelectItem value="RETURNED_PRE_BILLING">RETURNED_PRE_BILLING</SelectItem></SelectContent></Select></div>
                  <div><Label htmlFor="exportSortOrder">Sort Order</Label><Select value={exportFilters.sortOrder} onValueChange={(value) => handleExportFilterChange('sortOrder', value)}><SelectTrigger id="exportSortOrder"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="desc">Newest First</SelectItem><SelectItem value="asc">Oldest First</SelectItem></SelectContent></Select></div>
              </div>

              {/* Conditionally rendered Preview sections, AFTER common filters, BEFORE specific tab content */}
              {activeExportTab === 'excel' && (
                  <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <Button variant="outline" onClick={() => fetchExportData(true, false)} disabled={isExporting} className="w-full sm:w-auto">
                          {isExporting && exportDataPreviewCount === null ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                          Preview Data Count
                      </Button>
                      {exportDataPreviewCount !== null && (
                          <span className="text-sm text-muted-foreground text-center sm:text-right w-full sm:w-auto">
                              {exportDataPreviewCount} records match.
                          </span>
                      )}
                  </div>
              )}

              {activeExportTab === 'barcodes' && (
                  <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <Button variant="outline" onClick={() => fetchExportData(true, true)} disabled={isExporting} className="w-full sm:w-auto">
                          {isExporting && exportDataPreviewCount === null ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                          Preview Barcode Count
                      </Button>
                      {exportDataPreviewCount !== null && (
                          <span className="text-sm text-muted-foreground text-center sm:text-right w-full sm:w-auto">
                              {exportDataPreviewCount} barcodes match.
                          </span>
                      )}
                  </div>
              )}
              
              <TabsContent value="excel" className="space-y-4">
                  <h4 className="font-medium text-sm mb-2">Select Fields to Include in Excel:</h4>
                  <ScrollArea className="max-h-24 sm:max-h-32 md:max-h-48 w-full rounded-md border p-3 min-h-0"> {/* Adjusted max-h, p-3, added min-h-0 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                          {ALL_EXPORTABLE_FIELDS.map(field => (
                              <div key={field.key} className="flex items-center space-x-2">
                                  <Checkbox 
                                      id={`export-field-${field.key}`} 
                                      checked={exportFilters.selectedFields.includes(field.key)} 
                                      onCheckedChange={() => handleExportFieldToggle(field.key as keyof SaleTransaction | 'id')}
                                      className="border-slate-300 dark:border-slate-700" // Explicit border for visibility
                                  />
                                  <Label htmlFor={`export-field-${field.key}`} className="text-xs font-normal cursor-pointer">{field.label}</Label>
                              </div>
                          ))}
                      </div>
                      <ScrollBar orientation="vertical"/>
                  </ScrollArea>
              </TabsContent>

              <TabsContent value="barcodes" className="space-y-4">
                  <p className="text-sm text-muted-foreground">This will export only the "Barcode Scanned" field for the selected criteria.</p>
                  {exportedBarcodesText && (
                      <div className="space-y-2">
                          <Label htmlFor="exportedBarcodesArea">Barcodes:</Label>
                          <div className="relative">
                              {/* Ensure max-h-25 for Textarea is appropriate, consider min-h-0 if it causes issues */}
                              <ScrollArea className="w-full whitespace-pre-wrap rounded-md border max-h-25 min-h-0"> 
                                  <Textarea id="exportedBarcodesArea" value={exportedBarcodesText} readOnly className="font-mono text-xs pr-10 max-h-25 resize-none"/>
                                  <ScrollBar orientation="vertical" />
                              </ScrollArea>
                              <Button variant="ghost" size="sm" onClick={copyBarcodesToClipboard} className="absolute top-1 right-1 h-6 w-6 z-10" title="Copy barcodes">
                                  <Copy className="h-3.5 w-3.5"/>
                              </Button>
                          </div>
                      </div>
                  )}
              </TabsContent>
          </Tabs>
      </ScrollArea>
      <DialogFooter className="mt-auto pt-8 border-t">
          <DialogClose asChild><Button variant="outline" disabled={isExporting}>Cancel</Button></DialogClose>
          <Button onClick={async () => { if (activeExportTab === 'excel') { await handleGenerateExcel(); } else if (activeExportTab === 'barcodes') { await handleExportBarcodesAsText(); } }} disabled={isExporting || exportDataPreviewCount === null || exportDataPreviewCount === 0}>
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Generate Export
          </Button>
      </DialogFooter>
  </DialogContent>
</Dialog>
  </>
);
}