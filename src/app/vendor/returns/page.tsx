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

  // --- State and Refs for BarcodeDetector API ---
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isApiSupported, setIsApiSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const searchBarcode_InputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) { router.push('/vendor/login'); }
    else { if(!isScannerActive && searchBarcode_InputRef.current) searchBarcode_InputRef.current.focus(); }
  }, [user, router, isScannerActive]);

  // Check for BarcodeDetector API support on component mount
  useEffect(() => {
    if ('BarcodeDetector' in window) {
      setIsApiSupported(true);
    } else {
      console.warn("Barcode Detector API is not supported in this browser.");
      sonnerToast.warning("Built-in scanner is not supported on this device/browser.");
    }
  }, []);

  const findSalesByBarcodeGlobal = useCallback(async (barcodeToSearch: string, page: number = 1) => {
    if (!barcodeToSearch.trim()) return;
    setIsSearching(true); 
    if (page === 1) { 
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
        if (page === 1 && data.transactions.length === 1 && data.pagination.totalItems === 1) {
             setSelectedSaleForReturn(data.transactions[0]);
             sonnerToast.success("1 sale found and auto-selected for return.");
        } else if (page === 1 && data.pagination.totalItems > 0) {
            sonnerToast.info(`${data.pagination.totalItems} sale(s) found. Please select one to return if needed.`);
        }
      } else {
        if (page === 1) sonnerToast.info('No "SOLD" sales found for this barcode.');
        setFoundSalesByBarcode([]);
        setSearchPagination(data.pagination || null);
      }
    } catch (err: any) { setError(err.message); sonnerToast.error(err.message || 'Error finding sales.'); setFoundSalesByBarcode([]); setSearchPagination(null);
    } finally { setIsSearching(false); if(!isScannerActive && searchBarcode_InputRef.current) searchBarcode_InputRef.current.focus(); }
  }, [isScannerActive]);


  // --- New Effect to manage the BarcodeDetector API lifecycle ---
  useEffect(() => {
    if (!isScannerActive || !isApiSupported) {
      return; // Do nothing if scanner is off or not supported
    }

    let stream: MediaStream | null = null;
    // Note: 'ean_13' is common for retail barcodes, along with 'code_128'
    const barcodeDetector = new BarcodeDetector({ formats: ['code_128', 'ean_13'] });

    const stopScan = () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const scanForBarcode = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animationFrameId.current = requestAnimationFrame(scanForBarcode);
        return;
      }

      try {
        const barcodes = await barcodeDetector.detect(videoRef.current);
        if (barcodes.length > 0) {
          const detectedValue = barcodes[0].rawValue;
          if (detectedValue) {
            console.log("BarcodeDetector API Detected:", detectedValue);
            sonnerToast.success("Barcode Scanned! Searching...");
            setIsScannerActive(false); // This triggers the cleanup
            setSearchBarcode(detectedValue);
            findSalesByBarcodeGlobal(detectedValue, 1);
          } else {
            animationFrameId.current = requestAnimationFrame(scanForBarcode);
          }
        } else {
          animationFrameId.current = requestAnimationFrame(scanForBarcode);
        }
      } catch (err: any) {
        console.error("Error during barcode detection:", err);
        setScannerError(`Scanning error: ${err.message}`);
        setIsScannerActive(false); // Stop on error
      }
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(mediaStream => {
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            animationFrameId.current = requestAnimationFrame(scanForBarcode);
          });
        }
      })
      .catch(err => {
        console.error("Failed to get user media", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setScannerError(`Camera access failed: ${errMsg}. Please grant permission and try again.`);
        sonnerToast.error(`Camera access failed. Please grant permission.`);
        setIsScannerActive(false);
      });

    // Cleanup function runs when isScannerActive becomes false or component unmounts
    return () => {
      stopScan();
    };
  }, [isScannerActive, isApiSupported, findSalesByBarcodeGlobal]);


  const toggleCameraScanner = () => {
    if (isScannerActive) {
      setIsScannerActive(false);
    } else {
      if (!isApiSupported) {
        setScannerError("Barcode scanning is not supported by your browser. Try updating it or using a different one like Chrome on Android.");
        sonnerToast.error("Your browser doesn't support the built-in scanner.");
        return;
      }
      // Reset state for a new scan
      setSearchBarcode('');
      setFoundSalesByBarcode([]);
      setSelectedSaleForReturn(null);
      setSearchPagination(null);
      setError(null);
      setScannerError(null);
      setIsScannerActive(true);
    }
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
    const showDirectReturnButton = 
        (selectedSaleForReturn?.id === sale.id) ||
        (foundSalesByBarcode.length === 1 && searchPagination?.totalItems === 1);

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
                <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); handleMarkAsReturned(sale);}} disabled={isUpdating === sale.id} className="h-8">
                    {isUpdating === sale.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />} Return Item
                </Button>
            ) : onSelect ? ( 
                <Button variant="ghost" size="sm" onClick={() => onSelect(sale)} className="h-8">
                    <CheckCircle className="mr-2 h-4 w-4 text-primary"/> Select
                </Button>
            ) : null}
          </TableCell>
        </TableRow>
    );
  };


  return (
    <>
      <style jsx global>{`
        @keyframes returns-scan-line-anim {
          0% { top: 10%; }
          100% { top: 90%; }
        }
        .animate-scan-line-returns {
          animation: returns-scan-line-anim 2.5s ease-in-out infinite alternate;
        }
      `}</style>
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
                  <Button type="button" onClick={toggleCameraScanner} variant="outline" className="w-full" disabled={isSearching || (isUpdating !== null) || !isApiSupported}>
                      <Camera className="mr-2 h-4 w-4" /> 
                      {isScannerActive ? "Stop Camera Scan" : (isApiSupported ? "Scan Barcode with Camera" : "Scanner Not Supported")}
                  </Button>
                  {isScannerActive && (
                    <div className="my-2 p-1 border rounded-md bg-gray-900 shadow-inner relative overflow-hidden aspect-video">
                        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-[90%] h-[50%] border-2 border-dashed border-white/50 rounded-lg" />
                        </div>
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500 animate-scan-line-returns" />
                    </div>
                  )}
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