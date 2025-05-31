// src/app/vendor/returns/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Undo2, Search, ScanLine, CheckCircle, Camera, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import Quagga, { QuaggaConfig, QuaggaDetectionResult } from 'quagga';

interface SaleTransaction {
  id: string;
  articleNo: string;
  barcodeScanned?: string;
  product_articleName?: string;
  weightGrams: number;
  calculatedSellPrice: number;
  timestamp: string;
  status: string;
  staffId: string;
  dateOfSale: string;
}

interface FoundSalesResponse {
    transactions: SaleTransaction[];
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

const QUAGGA_SCANNER_REGION_ID_RETURNS = "quagga-scanner-live-region-returns";

export default function VendorReturnsPage() {
  const { user, logout } = useUser();
  const router = useRouter();

  const [foundSalesByBarcode, setFoundSalesByBarcode] = useState<SaleTransaction[]>([]);
  const [searchPagination, setSearchPagination] = useState<FoundSalesResponse['pagination'] | null>(null);
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<SaleTransaction | null>(null);
  
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchBarcode, setSearchBarcode] = useState('');
  const [manualSearch, setManualSearch] = useState({ articleNo: '', weightGrams: '' });
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');

  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isQuaggaInitialized, setIsQuaggaInitialized] = useState(false);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const searchBarcode_InputRef = useRef<HTMLInputElement>(null);
  const firstScannerEffectRunReturns = useRef(true);

  useEffect(() => {
    if (!user) { router.push('/vendor/login'); }
    else { if(!isScannerActive && searchBarcode_InputRef.current) searchBarcode_InputRef.current.focus(); }
  }, [user, router, isScannerActive]);


  const findSalesByBarcodeGlobal = useCallback(async (barcodeToSearch: string, page: number = 1) => {
    if (!barcodeToSearch.trim()) return;
    setIsSearching(true); 
    if (page === 1) { // Reset only for a new search, not for pagination
        setFoundSalesByBarcode([]);
        setSelectedSaleForReturn(null);
        setSearchPagination(null);
    }
    setError(null);
    setCurrentSearchTerm(barcodeToSearch.trim());

    try {
      const response = await fetch(`/api/sales/find-by-barcode?barcode=${encodeURIComponent(barcodeToSearch.trim())}&page=${page}&limit=5`);
      const data: FoundSalesResponse = await response.json();

      if (!response.ok && response.status !== 404) {
        throw new Error(data.message || 'Failed to find sales');
      }

      if (data.transactions && data.transactions.length > 0) {
        setFoundSalesByBarcode(data.transactions);
        setSearchPagination(data.pagination);
        // Auto-select if it's the very first page, and only one absolute result exists for the barcode
        if (page === 1 && data.transactions.length === 1 && data.pagination.totalItems === 1) {
             setSelectedSaleForReturn(data.transactions[0]);
             sonnerToast.success("1 sale found and auto-selected for return.");
        } else if (page === 1 && data.pagination.totalItems > 0) { // Check totalItems for the toast
            sonnerToast.info(`${data.pagination.totalItems} sale(s) found. Please select one to return if needed.`);
        }
      } else {
        if (page === 1) sonnerToast.info('No "SOLD" sales found for this barcode.');
        setFoundSalesByBarcode([]);
        setSearchPagination(data.pagination || null);
      }
    } catch (err: any) { setError(err.message); sonnerToast.error(err.message || 'Error finding sales.'); setFoundSalesByBarcode([]); setSearchPagination(null);
    } finally { setIsSearching(false); if(!isScannerActive && searchBarcode_InputRef.current) searchBarcode_InputRef.current.focus(); }
  }, [isScannerActive]); // isScannerActive dependency removed as focus logic is handled in main useEffect

  const onDetectedReturns = useCallback((result: QuaggaDetectionResult) => {
    if (result && result.codeResult && result.codeResult.code) {
      const scannedCode = result.codeResult.code;
      setSearchBarcode(scannedCode);
      setIsScannerActive(false);
      setScannerError(null);
      sonnerToast.success("Barcode Scanned! Searching...");
      findSalesByBarcodeGlobal(scannedCode, 1);
    }
  }, [findSalesByBarcodeGlobal]);

  const stopQuaggaScannerReturns = useCallback(() => { if (isQuaggaInitialized) { Quagga.offDetected(onDetectedReturns); Quagga.offProcessed(); Quagga.stop(); setIsQuaggaInitialized(false);}}, [onDetectedReturns, isQuaggaInitialized]);
  
  useEffect(() => { return () => { stopQuaggaScannerReturns(); }; }, [stopQuaggaScannerReturns]);
  
  useEffect(() => { 
    if (firstScannerEffectRunReturns.current) { 
      firstScannerEffectRunReturns.current = false; 
      return; 
    } 
    if (isScannerActive) { 
      if (!scannerContainerRef.current) {
        setScannerError("Scanner UI element not ready.");
        setIsScannerActive(false);
        return;
      }
      const quaggaConfig: QuaggaConfig = { 
        inputStream: { 
          name: "Live", 
          type: "LiveStream", 
          target: scannerContainerRef.current!, 
          constraints: {facingMode: "environment"}, 
          area: { top: "25%", right: "10%", left: "10%", bottom: "25%" }, 
          singleChannel: false 
        }, 
        numOfWorkers: typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? Math.max(1, navigator.hardwareConcurrency - 1) : 1, 
        locate: true, 
        frequency: 8, 
        decoder: { 
          readers: [ "code_128_reader", "ean_reader" ], 
          debug: { drawBoundingBox: true, showFrequency: false, drawScanline: true, showPattern: false }, 
          multiple: false 
        }, 
        locator: { 
          halfSample: true, 
          patchSize: "medium", 
          debug: { showCanvas: false } 
        } 
      }; 
      Quagga.init(quaggaConfig, (err: any) => { 
        if (err) { 
          const errMsg = typeof err === 'string' ? err : (err.message || 'Unknown init error'); 
          setScannerError(`Scanner init failed: ${errMsg}`); 
          sonnerToast.error(`Scanner init failed: ${errMsg}`); 
          setIsScannerActive(false); 
          setIsQuaggaInitialized(false); 
          return; 
        } 
        setIsQuaggaInitialized(true); 
        Quagga.start(); 
        Quagga.onDetected(onDetectedReturns); 
        Quagga.onProcessed((processedResult: any) => { 
          const drawingCtx = Quagga.canvas.ctx.overlay; 
          const drawingCanvas = Quagga.canvas.dom.overlay; 
          if (processedResult && drawingCanvas && drawingCtx) { 
            if (processedResult.boxes) { 
              drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.width as any || "0"), parseInt(drawingCanvas.height as any || "0")); 
              processedResult.boxes.filter((box: any) => box !== processedResult.box).forEach((box: any) => { 
                Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, { color: 'green', lineWidth: 2 }); 
              }); 
            } 
            if (processedResult.box) { Quagga.ImageDebug.drawPath(processedResult.box, { x: 0, y: 1 }, drawingCtx, { color: '#00F', lineWidth: 2 }); } 
            if (processedResult.codeResult && processedResult.codeResult.code) { Quagga.ImageDebug.drawPath(processedResult.line, { x: 'x', y: 'y' }, drawingCtx, { color: 'red', lineWidth: 3 }); } 
          } 
        }); 
      }); 
    } else { 
      stopQuaggaScannerReturns(); 
    } 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScannerActive, onDetectedReturns]); // Removed stopQuaggaScannerReturns from deps as it changes too often


  const toggleCameraScanner = () => {
    if (isScannerActive) setIsScannerActive(false);
    else { setSearchBarcode(''); setFoundSalesByBarcode([]); setSelectedSaleForReturn(null); setSearchPagination(null); setError(null); setScannerError(null); setIsScannerActive(true); }
  };

  const handleBarcodeSearch = () => {
    if (searchBarcode.trim()) { findSalesByBarcodeGlobal(searchBarcode.trim(), 1); }
  };

  const constructBarcode = (articleNo: string, weightGrams: string): string | null => { const artNoClean = articleNo.trim(); const weightClean = weightGrams.trim(); if (!artNoClean || !weightClean || !/^\d+$/.test(artNoClean) || !/^\d+$/.test(weightClean)) { sonnerToast.error("Article/Weight must be numeric."); return null; } if (artNoClean.length > ARTICLE_NO_IN_BARCODE_LENGTH) { sonnerToast.error(`Article No. max ${ARTICLE_NO_IN_BARCODE_LENGTH} digits.`); return null; } if (weightClean.length > WEIGHT_GRAMS_IN_BARCODE_LENGTH) { sonnerToast.error(`Weight max ${WEIGHT_GRAMS_IN_BARCODE_LENGTH} digits.`); return null; } const paddedArticleNo = artNoClean.padStart(ARTICLE_NO_IN_BARCODE_LENGTH, '0'); const paddedWeightGrams = weightClean.padStart(WEIGHT_GRAMS_IN_BARCODE_LENGTH, '0'); return `${BARCODE_PREFIX}${paddedArticleNo}${paddedWeightGrams}${CHECK_DIGIT_PLACEHOLDER}`;};

  const handleManualSearch = () => {
    const generatedBarcode = constructBarcode(manualSearch.articleNo, manualSearch.weightGrams);
    if (generatedBarcode) { setSearchBarcode(generatedBarcode); findSalesByBarcodeGlobal(generatedBarcode, 1); }
  };

  const handleMarkAsReturned = async (transaction: SaleTransaction) => {
    if (!user?.id || !transaction) return;
    if (!confirm(`Mark item ${transaction.product_articleName || transaction.articleNo} (Sold for ₹${transaction.calculatedSellPrice.toFixed(2)}) as returned?`)) return;
    setIsUpdating(transaction.id);
    try {
      const response = await fetch('/api/sales/update-status', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.id, newStatus: 'RETURNED_PRE_BILLING'}),
      });
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || 'Failed to update status'); }
      sonnerToast.success('Item marked as returned. Aggregates adjusted.');
      if (currentSearchTerm && searchPagination) {
        // If the returned item was the last on the page, and it's not page 1, go to previous page
        if (foundSalesByBarcode.length === 1 && searchPagination.currentPage > 1 && searchPagination.totalItems > searchPagination.pageSize) {
            findSalesByBarcodeGlobal(currentSearchTerm, searchPagination.currentPage - 1);
        } else {
            findSalesByBarcodeGlobal(currentSearchTerm, searchPagination.currentPage); 
        }
      } else {
        setFoundSalesByBarcode([]); setSelectedSaleForReturn(null); setSearchBarcode(''); setSearchPagination(null);
      }
    } catch (err: any) { sonnerToast.error(err.message || 'Error updating status.');
    } finally { setIsUpdating(null); }
  };

  if (!user) { return ( <main className="flex min-h-screen flex-col items-center justify-center p-4"> <Loader2 className="h-12 w-12 animate-spin text-primary" /> </main> ); }

  const renderSaleItemRow = (sale: SaleTransaction, onSelect?: (sale: SaleTransaction) => void) => {
    // Determine if this sale should show the direct "Return Item" button
    const showDirectReturnButton = 
        (selectedSaleForReturn?.id === sale.id) || // It's explicitly selected by the user
        (foundSalesByBarcode.length === 1 && searchPagination?.totalItems === 1); // It's the only absolute result

    return (
        <TableRow 
            key={sale.id} 
            onClick={onSelect ? () => onSelect(sale) : undefined}
            className={`
                ${onSelect ? 'cursor-pointer hover:bg-muted' : ''} 
                ${selectedSaleForReturn?.id === sale.id && foundSalesByBarcode.length > 1 ? 'bg-blue-100 dark:bg-blue-900/50' : ''}
            `}
        >
          <TableCell>{new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} <br/> <span className="text-xs text-muted-foreground">{new Date(sale.timestamp).toLocaleDateString()}</span></TableCell>
          <TableCell>{sale.articleNo} <br/> <span className="text-xs text-muted-foreground">{sale.product_articleName || 'N/A'}</span></TableCell>
          <TableCell>{sale.staffId}</TableCell>
          <TableCell className="text-right">₹{sale.calculatedSellPrice.toFixed(2)}</TableCell>
          <TableCell className="text-center">
            {showDirectReturnButton ? (
                <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={(e) => { e.stopPropagation(); handleMarkAsReturned(sale);}} 
                    disabled={isUpdating === sale.id} 
                    className="h-8"
                >
                    {isUpdating === sale.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
                    Return Item
                </Button>
            // Show Select button only if 'onSelect' is provided (meaning multiple items context) AND it's not the one to return directly
            ) : onSelect ? ( 
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onSelect(sale)} 
                    className="h-8"
                >
                    <CheckCircle className="mr-2 h-4 w-4 text-primary"/> Select
                </Button>
            ) : null}
          </TableCell>
        </TableRow>
    );
  };


  return (
    <>
      <style jsx global>{`#${QUAGGA_SCANNER_REGION_ID_RETURNS}{position:relative;width:100%;min-height:250px;overflow:hidden;background-color:#333}#${QUAGGA_SCANNER_REGION_ID_RETURNS} video,#${QUAGGA_SCANNER_REGION_ID_RETURNS} canvas.drawingBuffer{position:absolute;left:0;top:0;width:100%!important;height:100%!important}#${QUAGGA_SCANNER_REGION_ID_RETURNS} video{object-fit:cover}#${QUAGGA_SCANNER_REGION_ID_RETURNS} canvas.drawingBuffer{z-index:10}`}</style>
      <main suppressHydrationWarning className="min-h-screen p-4 md:p-6 bg-slate-50 dark:bg-slate-900">
        <Toaster richColors position="top-right" />
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-2">
            <Link href="/vendor/scan" ><Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Sale Entry</Button></Link>
            <h1 className="text-xl font-semibold text-center sm:text-left">Manage Returns - {user.name}</h1>
            <Button variant="ghost" size="sm" onClick={() => { logout(); router.push('/'); }}>Logout</Button>
          </div>
          <Card className="mb-6">
            <CardHeader><CardTitle>Find Item to Return (Searches "SOLD" Items)</CardTitle></CardHeader>
            <CardContent className="space-y-6">
               <div className="space-y-2">
                  <Button type="button" onClick={toggleCameraScanner} variant="outline" className="w-full" disabled={isSearching || (isUpdating !== null)}><Camera className="mr-2 h-4 w-4" /> {isScannerActive ? "Stop Camera Scan" : "Scan Barcode with Camera"}</Button>
                  {isScannerActive && (<div className="my-2 p-1 border rounded-md bg-gray-200 dark:bg-gray-800 shadow-inner"><div id={QUAGGA_SCANNER_REGION_ID_RETURNS} ref={scannerContainerRef} style={{ width: "100%", minHeight: "250px" }}></div></div>)}
                  {scannerError && (<div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 dark:bg-red-900/30 p-3 rounded-md"><XCircle className="h-5 w-5 flex-shrink-0" /><p>{scannerError}</p></div>)}
              </div>
              <div className="space-y-2">
                <Label htmlFor="searchBarcode">Or, Enter Barcode Manually</Label>
                <div className="flex gap-2">
                  <Input ref={searchBarcode_InputRef} id="searchBarcode" type="text" value={searchBarcode} onChange={(e) => setSearchBarcode(e.target.value)} placeholder="Enter or scan barcode" className="font-mono" disabled={isScannerActive}/>
                  <Button onClick={handleBarcodeSearch} disabled={isSearching || !searchBarcode.trim() || isScannerActive || (isUpdating !== null)} className="h-10">{isSearching && !isScannerActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
                </div>
              </div>
              <div className="space-y-2 p-4 border rounded-md bg-slate-50 dark:bg-slate-800">
                <Label>Or, Search by Article & Weight (Constructs Barcode)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <div className="space-y-1"><Label htmlFor="manualArticleNo" className="text-xs">Article No.</Label><Input id="manualArticleNo" type="text" value={manualSearch.articleNo} onChange={(e) => setManualSearch(prev => ({ ...prev, articleNo: e.target.value }))} placeholder="e.g., 600038799" disabled={isScannerActive}/></div>
                  <div className="space-y-1"><Label htmlFor="manualWeightGrams" className="text-xs">Weight (g)</Label><Input id="manualWeightGrams" type="number" value={manualSearch.weightGrams} onChange={(e) => setManualSearch(prev => ({ ...prev, weightGrams: e.target.value }))} placeholder="e.g., 60" disabled={isScannerActive}/></div>
                  <Button onClick={handleManualSearch} disabled={isSearching || !manualSearch.articleNo || !manualSearch.weightGrams || isScannerActive || (isUpdating !== null)} className="h-10">{isSearching && !isScannerActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4"/>} Find</Button>
                </div>
              </div>
              {isSearching && !isScannerActive && <div className="text-center p-4"><Loader2 className="h-6 w-6 animate-spin text-primary inline-block" /> Searching...</div>}
              {error && !isSearching && <p className="text-destructive text-center">{error}</p>}
              {foundSalesByBarcode.length > 0 && !isSearching && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">
                    {foundSalesByBarcode.length === 1 && searchPagination?.totalItems === 1 ? 
                        "Found Item:" : 
                        `Found ${searchPagination?.totalItems || 0} Item(s)${searchPagination?.totalItems !== 1 ? " - Please Select One:" : ""}`
                    }
                  </h3>
                  <ScrollArea className="max-h-[300px] w-full border rounded-md">
                    <Table>
                      <TableHeader><TableRow><TableHead>Time & Date</TableHead><TableHead>Article Info</TableHead><TableHead>Sold By</TableHead><TableHead className="text-right">Price (₹)</TableHead><TableHead className="text-center">Action</TableHead></TableRow></TableHeader>
                      <TableBody>{foundSalesByBarcode.map(sale => 
                          renderSaleItemRow(sale, (searchPagination && searchPagination.totalItems > 1) ? setSelectedSaleForReturn : undefined)
                      )}</TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                  {searchPagination && searchPagination.totalPages > 1 && (
                    <div className="flex justify-center items-center space-x-2 mt-4">
                        <Button variant="outline" size="sm" onClick={() => findSalesByBarcodeGlobal(currentSearchTerm, searchPagination.currentPage - 1)} disabled={searchPagination.currentPage <= 1 || isSearching}><ChevronLeft className="h-4 w-4"/> Prev</Button>
                        <span className="text-sm">Page {searchPagination.currentPage} of {searchPagination.totalPages} ({searchPagination.totalItems} items)</span>
                        <Button variant="outline" size="sm" onClick={() => findSalesByBarcodeGlobal(currentSearchTerm, searchPagination.currentPage + 1)} disabled={searchPagination.currentPage >= searchPagination.totalPages || isSearching}>Next <ChevronRight className="h-4 w-4"/></Button>
                    </div>
                  )}
                  {/* Show Confirm button for selected item ONLY if there were multiple items originally AND an item is selected */}
                  {selectedSaleForReturn && searchPagination && searchPagination.totalItems > 1 && (
                      <div className="mt-4 text-center">
                          <Button 
                            variant="destructive"
                            onClick={() => handleMarkAsReturned(selectedSaleForReturn)}
                            disabled={isUpdating === selectedSaleForReturn.id || !selectedSaleForReturn}
                          >
                              {isUpdating === selectedSaleForReturn.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
                              Confirm Return for: {selectedSaleForReturn.product_articleName || selectedSaleForReturn.articleNo}
                          </Button>
                      </div>
                  )}
                </div>
              )}
              {foundSalesByBarcode.length === 0 && !isSearching && currentSearchTerm && (<p className="text-center py-4 text-muted-foreground">No "SOLD" items found for the searched barcode.</p>)}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}