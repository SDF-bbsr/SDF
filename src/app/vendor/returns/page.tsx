// src/app/(vendor)/returns/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Undo2, Search, ScanLine, CheckCircle, Camera, XCircle } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import Quagga, { QuaggaConfig, QuaggaDetectionResult } from 'quagga'; // Import QuaggaJS

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
}

const BARCODE_PREFIX = "2110000";
const ARTICLE_NO_IN_BARCODE_LENGTH = 9;
const WEIGHT_GRAMS_IN_BARCODE_LENGTH = 5;
const CHECK_DIGIT_PLACEHOLDER = "1";

// New ID for Quagga scanner container on this page
const QUAGGA_SCANNER_REGION_ID_RETURNS = "quagga-scanner-live-region-returns";

export default function VendorReturnsPage() {
  const { user, logout } = useUser();
  const router = useRouter();

  const [todaysOwnSales, setTodaysOwnSales] = useState<SaleTransaction[]>([]);
  const [foundSalesByBarcode, setFoundSalesByBarcode] = useState<SaleTransaction[]>([]);
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<SaleTransaction | null>(null);

  const [isLoadingTodays, setIsLoadingTodays] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchBarcode, setSearchBarcode] = useState('');
  const [manualSearch, setManualSearch] = useState({ articleNo: '', weightGrams: '' });

  // QuaggaJS specific state and refs
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isQuaggaInitialized, setIsQuaggaInitialized] = useState(false);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const searchBarcode_InputRef = useRef<HTMLInputElement>(null);
  const firstScannerEffectRunReturns = useRef(true);

  const fetchTodaysOwnSoldItems = useCallback(async (limit = 20) => {
    if (!user?.id) return;
    setIsLoadingTodays(true);
    const today = new Date().toISOString().split('T')[0];
    try {
      const response = await fetch(`/api/sales/vendor-history?staffId=${user.id}&startDate=${today}&endDate=${today}&status=SOLD&limit=${limit}`);
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || 'Failed to fetch recent sales'); }
      const data = await response.json();
      setTodaysOwnSales(data.transactions || []);
    } catch (err: any) { console.error("Error fetching your recent sales: ", err); setTodaysOwnSales([]);
    } finally { setIsLoadingTodays(false); }
  }, [user]);

  useEffect(() => {
    if (!user) { router.push('/vendor/login'); }
    else { fetchTodaysOwnSoldItems(); if(!isScannerActive) searchBarcode_InputRef.current?.focus(); }
  }, [user, router, fetchTodaysOwnSoldItems, isScannerActive]);


  const findSalesByBarcodeGlobal = useCallback(async (barcodeToSearch: string) => {
    if (!barcodeToSearch.trim()) return;
    setIsSearching(true); setFoundSalesByBarcode([]); setSelectedSaleForReturn(null); setError(null);
    try {
      const response = await fetch(`/api/sales/find-by-barcode?barcode=${encodeURIComponent(barcodeToSearch.trim())}`);
      if (!response.ok) {
        const errData = await response.json();
        if (response.status === 404) { sonnerToast.info(errData.message || 'No "SOLD" sales found for this barcode.'); }
        else { throw new Error(errData.message || 'Failed to find sales'); }
        setFoundSalesByBarcode([]); // Clear previous results on error too
        return;
      }
      const sales: SaleTransaction[] = await response.json();
      if (sales && sales.length > 0) {
        setFoundSalesByBarcode(sales);
        if (sales.length === 1) { setSelectedSaleForReturn(sales[0]); sonnerToast.success("1 sale found."); }
        else { sonnerToast.info(`${sales.length} sales found. Please select one to return.`); }
      } else {
        sonnerToast.info('No "SOLD" sales found for this barcode.');
        setFoundSalesByBarcode([]); // Ensure it's cleared
      }
    } catch (err: any) { setError(err.message); sonnerToast.error(err.message || 'Error finding sales.'); setFoundSalesByBarcode([]);
    } finally { setIsSearching(false); if(!isScannerActive) searchBarcode_InputRef.current?.focus(); }
  }, [isScannerActive]); // Added isScannerActive to dependencies

  const onDetectedReturns = useCallback((result: QuaggaDetectionResult) => {
    if (result && result.codeResult && result.codeResult.code) {
      console.log("QuaggaJS Detected (Returns Page):", result.codeResult.code);
      setSearchBarcode(result.codeResult.code);
      setIsScannerActive(false); // This will trigger Quagga stop via useEffect
      setScannerError(null);
      sonnerToast.success("Barcode Scanned! Searching...");
      findSalesByBarcodeGlobal(result.codeResult.code);
    }
  }, [findSalesByBarcodeGlobal]);


  const stopQuaggaScannerReturns = useCallback(() => {
    if (isQuaggaInitialized) {
      console.log("Stopping QuaggaJS scanner (Returns Page)...");
      Quagga.offDetected(onDetectedReturns);
      Quagga.offProcessed();
      Quagga.stop();
      setIsQuaggaInitialized(false);
      console.log("QuaggaJS scanner stopped (Returns Page).");
    }
  }, [onDetectedReturns, isQuaggaInitialized]);

  useEffect(() => {
    // Cleanup on component unmount
    return () => {
      stopQuaggaScannerReturns();
    };
  }, [stopQuaggaScannerReturns]);

  useEffect(() => {
    if (firstScannerEffectRunReturns.current) {
      firstScannerEffectRunReturns.current = false;
      return;
    }

    if (isScannerActive) {
      if (!scannerContainerRef.current) {
        console.error("Scanner container div not found (Returns Page).");
        setScannerError("Scanner UI element not ready.");
        setIsScannerActive(false);
        return;
      }
      console.log("Attempting to start QuaggaJS scanner (Returns Page)...");
      setScannerError(null);

      const quaggaConfig: QuaggaConfig = {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerContainerRef.current,
          constraints: {
            // width: { min: 640, ideal: 960 }, // Slightly smaller ideal for returns potentially
            // height: { min: 480, ideal: 720 },
            facingMode: "environment",
          },
          area: { top: "25%", right: "10%", left: "10%", bottom: "25%" }, // Adjust area
          singleChannel: false
        },
        numOfWorkers: navigator.hardwareConcurrency > 1 ? navigator.hardwareConcurrency -1 : 1,
        locate: true,
        frequency: 8, // Can try slightly lower frequency
        decoder: {
          readers: [ "code_128_reader", "ean_reader" ],
          debug: { drawBoundingBox: true, showFrequency: true, drawScanline: true, showPattern: false },
          multiple: false,
        },
        locator: {
          halfSample: true,
          patchSize: "medium", // Start with medium, can try 'large'
          debug: { showCanvas: false },
        },
      };

      Quagga.init(quaggaConfig, (err: any) => {
        if (err) {
          console.error("QuaggaJS initialization error (Returns Page):", err);
          const errMsg = typeof err === 'string' ? err : (err.message || 'Unknown initialization error');
          setScannerError(`Scanner init failed: ${errMsg}`);
          sonnerToast.error(`Scanner init failed: ${errMsg}`);
          setIsScannerActive(false);
          setIsQuaggaInitialized(false);
          return;
        }
        console.log("QuaggaJS initialized successfully (Returns Page). Starting scanner...");
        setIsQuaggaInitialized(true);
        Quagga.start();
        Quagga.onDetected(onDetectedReturns);
        Quagga.onProcessed((result: any) => {
            const drawingCtx = Quagga.canvas.ctx.overlay;
            const drawingCanvas = Quagga.canvas.dom.overlay;
            if (result && drawingCanvas && drawingCtx) {
                if (result.boxes) {
                    drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.width as any || "0"), parseInt(drawingCanvas.height as any || "0"));
                    result.boxes.filter((box: any) => box !== result.box).forEach((box: any) => {
                        Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, { color: 'green', lineWidth: 2 });
                    });
                }
                if (result.box) {
                    Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, { color: '#00F', lineWidth: 2 });
                }
                if (result.codeResult && result.codeResult.code) {
                    Quagga.ImageDebug.drawPath(result.line, { x: 'x', y: 'y' }, drawingCtx, { color: 'red', lineWidth: 3 });
                }
            }
        });
      });
    } else {
      stopQuaggaScannerReturns();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScannerActive, onDetectedReturns, stopQuaggaScannerReturns]);


  const toggleCameraScanner = () => {
    if (isScannerActive) {
      setIsScannerActive(false);
    } else {
      // Clear previous search results when starting scanner
      setSearchBarcode('');
      setFoundSalesByBarcode([]);
      setSelectedSaleForReturn(null);
      setError(null);
      setScannerError(null);
      setIsScannerActive(true);
    }
  };

  const handleBarcodeSearch = () => {
    if (searchBarcode.trim()) { findSalesByBarcodeGlobal(searchBarcode.trim()); }
  };

  const constructBarcode = (articleNo: string, weightGrams: string): string | null => {
    const artNoClean = articleNo.trim(); const weightClean = weightGrams.trim();
    if (!artNoClean || !weightClean || !/^\d+$/.test(artNoClean) || !/^\d+$/.test(weightClean)) { sonnerToast.error("Article/Weight must be numeric."); return null; }
    if (artNoClean.length > ARTICLE_NO_IN_BARCODE_LENGTH) { sonnerToast.error(`Article No. max ${ARTICLE_NO_IN_BARCODE_LENGTH} digits.`); return null; }
    if (weightClean.length > WEIGHT_GRAMS_IN_BARCODE_LENGTH) { sonnerToast.error(`Weight max ${WEIGHT_GRAMS_IN_BARCODE_LENGTH} digits.`); return null; }
    const paddedArticleNo = artNoClean.padStart(ARTICLE_NO_IN_BARCODE_LENGTH, '0');
    const paddedWeightGrams = weightClean.padStart(WEIGHT_GRAMS_IN_BARCODE_LENGTH, '0');
    return `${BARCODE_PREFIX}${paddedArticleNo}${paddedWeightGrams}${CHECK_DIGIT_PLACEHOLDER}`;
  };

  const handleManualSearch = () => {
    const generatedBarcode = constructBarcode(manualSearch.articleNo, manualSearch.weightGrams);
    if (generatedBarcode) { setSearchBarcode(generatedBarcode); findSalesByBarcodeGlobal(generatedBarcode); }
  };

  const handleMarkAsReturned = async (transaction: SaleTransaction) => {
    if (!user?.id || !transaction) return;
    if (!confirm(`Mark item ${transaction.product_articleName || transaction.articleNo} (Sold by: ${transaction.staffId} at ${new Date(transaction.timestamp).toLocaleTimeString()}) as returned?`)) return;
    setIsUpdating(transaction.id);
    try {
      const response = await fetch('/api/sales/update-status', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.id, newStatus: 'RETURNED_PRE_BILLING'}),
      });
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || 'Failed to update status'); }
      sonnerToast.success('Item marked as returned.');
      setFoundSalesByBarcode([]); setSelectedSaleForReturn(null); setSearchBarcode('');
      fetchTodaysOwnSoldItems();
    } catch (err: any) { sonnerToast.error(err.message || 'Error updating status.');
    } finally { setIsUpdating(null); }
  };

  if (!user) { return ( <main className="flex min-h-screen flex-col items-center justify-center p-4"> <Loader2 className="h-12 w-12 animate-spin text-primary" /> </main> ); }

  const renderSaleItemRow = (sale: SaleTransaction, onSelect?: (sale: SaleTransaction) => void) => (
    <TableRow key={sale.id} onClick={onSelect ? () => onSelect(sale) : undefined} className={`${onSelect ? 'cursor-pointer hover:bg-muted' : ''} ${selectedSaleForReturn?.id === sale.id ? 'bg-blue-100 dark:bg-blue-900/50' : ''}`}>
      <TableCell>{new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</TableCell>
      <TableCell>{sale.articleNo} {sale.product_articleName ? `(${sale.product_articleName})` : ''}</TableCell>
      <TableCell>{sale.staffId}</TableCell>
      <TableCell className="text-right">{sale.calculatedSellPrice.toFixed(2)}</TableCell>
      <TableCell className="text-center">
        {selectedSaleForReturn?.id === sale.id || !onSelect ? (
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleMarkAsReturned(sale);}} disabled={isUpdating === sale.id} className="h-8">
            {isUpdating === sale.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}Return Item</Button>
        ) : (<Button variant="ghost" size="sm" onClick={() => onSelect && onSelect(sale)} className="h-8"><CheckCircle className="mr-2 h-4 w-4 text-primary"/> Select</Button>)}
      </TableCell>
    </TableRow>
  );

  return (
    <>
      <style jsx global>{`
        #${QUAGGA_SCANNER_REGION_ID_RETURNS} {
          position: relative;
          width: 100%;
          min-height: 250px; /* Adjust as needed */
          overflow: hidden;
          background-color: #333;
        }
        #${QUAGGA_SCANNER_REGION_ID_RETURNS} video,
        #${QUAGGA_SCANNER_REGION_ID_RETURNS} canvas.drawingBuffer {
          position: absolute;
          left: 0;
          top: 0;
          width: 100% !important;
          height: 100% !important;
        }
        #${QUAGGA_SCANNER_REGION_ID_RETURNS} video {
           object-fit: cover;
        }
        #${QUAGGA_SCANNER_REGION_ID_RETURNS} canvas.drawingBuffer {
          z-index: 10;
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
            <CardHeader><CardTitle>Find Item to Return (Any Staff, "SOLD" Status)</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                  <Button type="button" onClick={toggleCameraScanner} variant="outline" className="w-full"
                    disabled={isSearching || (isUpdating !== null)}
                  >
                      <Camera className="mr-2 h-4 w-4" /> {isScannerActive ? "Stop Camera Scan" : "Scan Barcode with Camera"}
                  </Button>
                  {isScannerActive && (
                    <div className="my-2 p-1 border rounded-md bg-gray-200 dark:bg-gray-800 shadow-inner">
                      <div id={QUAGGA_SCANNER_REGION_ID_RETURNS} ref={scannerContainerRef} style={{ width: "100%", minHeight: "250px" }}></div>
                    </div>
                  )}
                  {scannerError && (<div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 dark:bg-red-900/30 p-3 rounded-md"><XCircle className="h-5 w-5 flex-shrink-0" /><p>{scannerError}</p></div>)}
              </div>

              <div className="space-y-2">
                <Label htmlFor="searchBarcode">Or, Enter Barcode Manually</Label>
                <div className="flex gap-2">
                  <Input ref={searchBarcode_InputRef} id="searchBarcode" type="text" value={searchBarcode} onChange={(e) => setSearchBarcode(e.target.value)} placeholder="Enter or scan barcode" className="font-mono" disabled={isScannerActive}/>
                  <Button onClick={handleBarcodeSearch}
                    disabled={isSearching || !searchBarcode.trim() || isScannerActive || (isUpdating !== null)}
                    className="h-10"
                  >
                      {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 p-4 border rounded-md bg-slate-50 dark:bg-slate-800">
                <Label>Or, Search by Article & Weight</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <div className="space-y-1"><Label htmlFor="manualArticleNo" className="text-xs">Article No.</Label><Input id="manualArticleNo" type="text" value={manualSearch.articleNo} onChange={(e) => setManualSearch(prev => ({ ...prev, articleNo: e.target.value }))} placeholder="e.g., 600038799" disabled={isScannerActive}/></div>
                  <div className="space-y-1"><Label htmlFor="manualWeightGrams" className="text-xs">Weight (g)</Label><Input id="manualWeightGrams" type="number" value={manualSearch.weightGrams} onChange={(e) => setManualSearch(prev => ({ ...prev, weightGrams: e.target.value }))} placeholder="e.g., 60" disabled={isScannerActive}/></div>
                  <Button onClick={handleManualSearch}
                    disabled={isSearching || !manualSearch.articleNo || !manualSearch.weightGrams || isScannerActive || (isUpdating !== null)}
                    className="h-10"
                  >
                      {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4"/>} Find
                  </Button>
                </div>
              </div>

              {isSearching && <div className="text-center p-4"><Loader2 className="h-6 w-6 animate-spin text-primary inline-block" /></div>}
              {error && !isSearching && <p className="text-destructive text-center">{error}</p>}

              {foundSalesByBarcode.length > 0 && !isSearching && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">{foundSalesByBarcode.length > 1 ? "Multiple Sales Found - Please Select One:" : "Found Item:"}</h3>
                  <ScrollArea className="max-h-[300px] w-full border rounded-md">
                    <Table>
                      <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Article Info</TableHead><TableHead>Sold By</TableHead><TableHead className="text-right">Price (₹)</TableHead><TableHead className="text-center">Action</TableHead></TableRow></TableHeader>
                      <TableBody>{foundSalesByBarcode.map(sale => renderSaleItemRow(sale, setSelectedSaleForReturn))}</TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                  {selectedSaleForReturn && foundSalesByBarcode.length > 1 && (
                      <div className="mt-4 text-center">
                          <Button onClick={() => handleMarkAsReturned(selectedSaleForReturn)}
                            disabled={isUpdating === selectedSaleForReturn.id}
                          >
                              {isUpdating === selectedSaleForReturn.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}Confirm Return for Selected
                          </Button>
                      </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Your Recently Packed Items (Today, Max 20, "SOLD")</CardTitle></CardHeader>
            <CardContent>
              {isLoadingTodays && !isSearching && ( <div className="flex justify-center items-center py-10"> <Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading your items...</p></div>)}
              {!isLoadingTodays && !error && todaysOwnSales.length > 0 && (
                <ScrollArea className="h-[300px] w-full border rounded-md">
                  <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Article Info</TableHead><TableHead>Sold By</TableHead><TableHead className="text-right">Price (₹)</TableHead><TableHead className="text-center">Action</TableHead></TableRow></TableHeader>
                    <TableBody>{todaysOwnSales.map(sale => renderSaleItemRow(sale))}</TableBody>
                  </Table>
                </ScrollArea>
              )}
              {!isLoadingTodays && !error && todaysOwnSales.length === 0 && (<p className="text-center py-10 text-muted-foreground">No items packed by you today, or all have been processed.</p>)}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}