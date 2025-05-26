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

import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScanType,
  QrcodeErrorCallback,
  QrcodeSuccessCallback
} from "html5-qrcode";

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
const BARCODE_SCANNER_REGION_ID_RETURNS = "barcode-scanner-live-region-returns";

export default function VendorReturnsPage() {
  const { user, logout } = useUser();
  const router = useRouter();
  
  const [todaysOwnSales, setTodaysOwnSales] = useState<SaleTransaction[]>([]);
  const [foundSalesByBarcode, setFoundSalesByBarcode] = useState<SaleTransaction[]>([]);
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<SaleTransaction | null>(null);

  const [isLoadingTodays, setIsLoadingTodays] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null); // ID of item being updated
  const [error, setError] = useState<string | null>(null);

  const [searchBarcode, setSearchBarcode] = useState('');
  const [manualSearch, setManualSearch] = useState({ articleNo: '', weightGrams: '' });

  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const html5QrCodeInstanceRef = useRef<Html5Qrcode | null>(null);
  const searchBarcode_InputRef = useRef<HTMLInputElement>(null);

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
    else { fetchTodaysOwnSoldItems(); searchBarcode_InputRef.current?.focus(); }
  }, [user, router, fetchTodaysOwnSoldItems]);

  const findSalesByBarcodeGlobal = useCallback(async (barcodeToSearch: string) => {
    if (!barcodeToSearch.trim()) return;
    setIsSearching(true); setFoundSalesByBarcode([]); setSelectedSaleForReturn(null); setError(null);
    try {
      const response = await fetch(`/api/sales/find-by-barcode?barcode=${encodeURIComponent(barcodeToSearch.trim())}`);
      if (!response.ok) {
        const errData = await response.json();
        if (response.status === 404) { sonnerToast.info(errData.message || 'No "SOLD" sales found for this barcode.'); } 
        else { throw new Error(errData.message || 'Failed to find sales'); }
        return;
      }
      const sales: SaleTransaction[] = await response.json();
      if (sales && sales.length > 0) {
        setFoundSalesByBarcode(sales);
        if (sales.length === 1) { setSelectedSaleForReturn(sales[0]); sonnerToast.success("1 sale found."); } 
        else { sonnerToast.info(`${sales.length} sales found. Please select one to return.`); }
      } else { sonnerToast.info('No "SOLD" sales found for this barcode.'); }
    } catch (err: any) { setError(err.message); sonnerToast.error(err.message || 'Error finding sales.');
    } finally { setIsSearching(false); searchBarcode_InputRef.current?.focus(); }
  }, []);

  const onScanSuccessReturns: QrcodeSuccessCallback = (decodedText, decodedResult) => {
    console.log(`Returns Page - Barcode detected: ${decodedText}`, decodedResult);
    setSearchBarcode(decodedText); setIsScannerActive(false); 
    sonnerToast.success("Barcode Scanned! Searching..."); setScannerError(null);
    findSalesByBarcodeGlobal(decodedText);
  };

  const onScanFailureReturns: QrcodeErrorCallback = (errorMessage) => {
    if (!errorMessage.toLowerCase().includes("not found") && !errorMessage.toLowerCase().includes("insufficient") && !errorMessage.toLowerCase().includes("unable to query supported devices") && !errorMessage.toLowerCase().includes("significant")) {
      console.warn(`Returns Page - Barcode scan error: ${errorMessage}`);
    }
  };
  
  useEffect(() => {
    // Helper function to safely clear the scanner instance
    const safeClearScanner = async (scannerInstance: Html5Qrcode | null) => {
        if (scannerInstance) {
            try {
                if (scannerInstance.isScanning) {
                    await scannerInstance.stop();
                    console.log("Scanner stopped successfully during safeClear.");
                }
                await scannerInstance.clear();
                console.log("Scanner cleared successfully during safeClear.");
            } catch (e) {
                console.warn("Error during safeClearScanner:", e);
            }
        }
    };

    if (isScannerActive) {
      const scannerElement = document.getElementById(BARCODE_SCANNER_REGION_ID_RETURNS);
      if (!scannerElement) {
        setScannerError(`Scanner UI element '${BARCODE_SCANNER_REGION_ID_RETURNS}' not found.`);
        setIsScannerActive(false); return;
      }

      // Clear any existing instance before starting a new one
      if (html5QrCodeInstanceRef.current) {
          safeClearScanner(html5QrCodeInstanceRef.current).finally(() => {
            html5QrCodeInstanceRef.current = null;
            // Proceed to create and start new scanner after old one is handled
            startScanner();
          });
      } else {
          startScanner();
      }

      function startScanner() {
        const newHtml5QrCode = new Html5Qrcode(BARCODE_SCANNER_REGION_ID_RETURNS, { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13] });
        html5QrCodeInstanceRef.current = newHtml5QrCode;
        const config = { fps: 10, qrbox: { width: 280, height: 120 }, rememberLastUsedCamera: true, supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]};
        
        newHtml5QrCode.start({ facingMode: "environment" }, config, onScanSuccessReturns, onScanFailureReturns)
          .catch((err) => {
              const errorMsg = String(err);
              let friendlyMessage = `Failed to start camera: ${errorMsg}`;
              if (errorMsg.includes("NotFoundError") || errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) friendlyMessage = "Camera not found or permission denied.";
              else if (errorMsg.includes("OverconstrainedError")) friendlyMessage = "Cannot access camera.";
              setScannerError(friendlyMessage); sonnerToast.error(friendlyMessage); setIsScannerActive(false);
              safeClearScanner(html5QrCodeInstanceRef.current).finally(() => {
                html5QrCodeInstanceRef.current = null;
              });
          });
      }

    } else { // isScannerActive is false
        if (html5QrCodeInstanceRef.current) {
            const scannerToStop = html5QrCodeInstanceRef.current;
            html5QrCodeInstanceRef.current = null; // Set to null before async operations
            safeClearScanner(scannerToStop);
        }
    }

    return () => { // Cleanup function for when component unmounts or isScannerActive changes
        const scannerToCleanOnUnmount = html5QrCodeInstanceRef.current;
        if (scannerToCleanOnUnmount) {
            html5QrCodeInstanceRef.current = null;
            safeClearScanner(scannerToCleanOnUnmount);
        }
    };
  }, [isScannerActive]); // findSalesByBarcodeGlobal removed from dependencies, handled by onScanSuccess


  const toggleCameraScanner = () => {
    if (isScannerActive) {
      setIsScannerActive(false); 
    } else {
      setError(null); setScannerError(null); setIsScannerActive(true); 
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
    <main suppressHydrationWarning className="min-h-screen p-4 md:p-6 bg-slate-50 dark:bg-slate-900">
      <Toaster richColors position="top-right" />
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-2">
          <Link href="/vendor/scan" ><Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Scan</Button></Link>
          <h1 className="text-xl font-semibold text-center sm:text-left">Manage Returns - {user.name}</h1>
          <Button variant="ghost" size="sm" onClick={() => { logout(); router.push('/'); }}>Logout</Button>
        </div>

        <Card className="mb-6">
          <CardHeader><CardTitle>Find Item to Return (Any Staff, "SOLD" Status)</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
                <Button type="button" onClick={toggleCameraScanner} variant="outline" className="w-full" 
                  // FIX 2: Convert isUpdating to boolean for disabled prop
                  disabled={isSearching || (isUpdating !== null)}
                >
                    <Camera className="mr-2 h-4 w-4" /> {isScannerActive ? "Stop Camera Scan" : "Scan Barcode with Camera"}
                </Button>
                {isScannerActive && (
                  <div className="my-2 p-2 border rounded-md bg-gray-100 dark:bg-gray-800 shadow-inner">
                    <div id={BARCODE_SCANNER_REGION_ID_RETURNS} style={{ width: "100%", minHeight: "150px" }}></div>
                  </div>
                )}
                {scannerError && (<div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 dark:bg-red-900/30 p-3 rounded-md"><XCircle className="h-5 w-5 flex-shrink-0" /><p>{scannerError}</p></div>)}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="searchBarcode">Or, Enter Barcode Manually</Label>
              <div className="flex gap-2">
                <Input ref={searchBarcode_InputRef} id="searchBarcode" type="text" value={searchBarcode} onChange={(e) => setSearchBarcode(e.target.value)} placeholder="Enter or scan barcode" className="font-mono" disabled={isScannerActive}/>
                <Button onClick={handleBarcodeSearch} 
                  // FIX 2: Convert isUpdating to boolean
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
                  // FIX 2: Convert isUpdating to boolean
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
                          // FIX 2: Convert isUpdating to boolean
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
  );
}