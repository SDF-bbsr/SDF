// src/app/vendor/scan/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; // For bulk add
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"; // For bulk add dialog
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"; // For displaying bulk processed items
import { toast as sonnerToast, Toaster } from "sonner"; // Added Toaster
import { Loader2, XCircle, CheckCircle2, ScanLine, LogOut, Camera, UploadCloud, AlertTriangle } from "lucide-react"; // Added UploadCloud, AlertTriangle
import { useUser } from "@/context/UserContext";
import Quagga, { QuaggaConfig, QuaggaDetectionResult } from 'quagga';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";


interface ScannedItemDetails {
  articleNumber: string;
  articleName: string;
  posDescription: string;
  metlerCode: string;
  hsnCode: string;
  taxPercentage: number;
  purchasePricePerKg: number;
  sellingRatePerKg: number;
  mrpPer100g: number;
  remark?: string;
  weightGrams: number;
  calculatedSellPrice: number;
  originalBarcode?: string; // To keep track of which barcode resulted in this item
}

// For items processed in bulk, before final confirmation
interface BulkProcessedItem extends ScannedItemDetails {
  originalBarcode: string; // Ensure original barcode is always present
}

const QUAGGA_SCANNER_REGION_ID = "quagga-scanner-live-region";
// Barcode parsing constants (assuming they are defined globally or copied here)
const BARCODE_PREFIX = "2110000";
const ARTICLE_NO_IN_BARCODE_LENGTH = 9;
const WEIGHT_GRAMS_IN_BARCODE_LENGTH = 5;
// const CHECK_DIGIT_PLACEHOLDER = "1"; // Not used in parsing, but for construction if needed

export default function VendorScanPage() {
  const { user, logout } = useUser();
  const router = useRouter();

  const [barcode, setBarcode] = useState("");
  const [originalScannedBarcode, setOriginalScannedBarcode] = useState(""); // For single scan
  const [isLoading, setIsLoading] = useState(false); // For single lookup
  const [isConfirmingSale, setIsConfirmingSale] = useState(false); // For single confirm
  const [scannedItem, setScannedItem] = useState<ScannedItemDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isQuaggaInitialized, setIsQuaggaInitialized] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const firstScannerEffectRun = useRef(true);

  // --- State for Bulk Add ---
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [bulkBarcodeInput, setBulkBarcodeInput] = useState("");
  const [bulkProcessedItems, setBulkProcessedItems] = useState<BulkProcessedItem[]>([]);
  const [bulkInvalidBarcodes, setBulkInvalidBarcodes] = useState<string[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false); // For "Process Barcodes" button
  const [isConfirmingBulkSale, setIsConfirmingBulkSale] = useState(false); // For "Confirm Bulk Sale"


  useEffect(() => { /* ... (user auth and focus logic - no change) ... */
    if (!user) { router.push('/vendor/login'); } 
    else { if (!isScannerActive && !isBulkAddModalOpen) { barcodeInputRef.current?.focus(); } }
  }, [user, router, isScannerActive, isBulkAddModalOpen]);


  const parseBarcode = useCallback((fullBarcode: string): { articleNo: string; weightGrams: number } | null => {
    fullBarcode = fullBarcode.trim();
    if (fullBarcode.length >= (BARCODE_PREFIX.length + ARTICLE_NO_IN_BARCODE_LENGTH + WEIGHT_GRAMS_IN_BARCODE_LENGTH)) { // Use const BARCODE_PREFIX.length
        // Assuming prefix is not part of articleNo or weight, but helps identify the start
        const articleStartIndex = BARCODE_PREFIX.length;
        const articlePart = fullBarcode.substring(articleStartIndex, articleStartIndex + ARTICLE_NO_IN_BARCODE_LENGTH);
        const weightPart = fullBarcode.substring(articleStartIndex + ARTICLE_NO_IN_BARCODE_LENGTH, articleStartIndex + ARTICLE_NO_IN_BARCODE_LENGTH + WEIGHT_GRAMS_IN_BARCODE_LENGTH);
        
        const articleNo = articlePart;
        const weightGrams = parseInt(weightPart, 10);
        
        if (!isNaN(weightGrams) && articleNo.match(/^\d+$/) && articleNo.length === ARTICLE_NO_IN_BARCODE_LENGTH && weightGrams > 0) { // ensure articleNo is all digits
            return { articleNo, weightGrams };
        }
    }
    return null;
  }, []);

  const handleBarcodeSubmit = useCallback(async (e?: React.FormEvent<HTMLFormElement>, scannedValue?: string) => {
    if (e) e.preventDefault();
    const currentBarcodeValue = (scannedValue || barcode).trim();

    if (!currentBarcodeValue) { setError("Barcode cannot be empty."); sonnerToast.warning("Please enter or scan a barcode."); return; }
    setIsLoading(true); setIsConfirmingSale(false); setError(null); setScannedItem(null); setOriginalScannedBarcode("");

    const parsed = parseBarcode(currentBarcodeValue);
    if (!parsed) {
      setIsLoading(false); setError("Invalid barcode format."); sonnerToast.error("Invalid barcode. Please check format.");
      if (!scannedValue) barcodeInputRef.current?.focus();
      return;
    }
    const { articleNo, weightGrams } = parsed;

    try {
      const response = await fetch("/api/products/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleNo, weightGrams }), });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || "Failed to lookup item."); }
      const data: ScannedItemDetails = await response.json();
      setScannedItem(data); setOriginalScannedBarcode(currentBarcodeValue); sonnerToast.success(`Item Found: ${data.articleName}`);
    } catch (err: any) { setError(err.message); sonnerToast.error(err.message); setScannedItem(null);
    } finally { setIsLoading(false); if (!scannedValue) barcodeInputRef.current?.focus(); }
  }, [barcode, parseBarcode]); // Added parseBarcode to dependencies


  const onDetected = useCallback((result: QuaggaDetectionResult) => { /* ... (no change from your provided code) ... */
    if (result && result.codeResult && result.codeResult.code) {
      console.log("QuaggaJS Detected:", result.codeResult.code);
      sonnerToast.info("Barcode Scanned via Camera!"); // Changed toast type
      setBarcode(result.codeResult.code); // Set the input field as well
      setIsScannerActive(false); // Stop scanner after successful scan
      setScannerError(null);
      handleBarcodeSubmit(undefined, result.codeResult.code); // Pass scanned value to submit
    }
  }, [handleBarcodeSubmit]); // handleBarcodeSubmit is a dependency

  const stopQuaggaScanner = useCallback(() => { /* ... (no change from your provided code) ... */
    if (isQuaggaInitialized) { Quagga.offDetected(onDetected); Quagga.offProcessed(); Quagga.stop(); setIsQuaggaInitialized(false); console.log("Quagga scanner stopped.");}
  }, [onDetected, isQuaggaInitialized]);
  
  useEffect(() => { return () => { stopQuaggaScanner(); }; }, [stopQuaggaScanner]);
  useEffect(() => { /* ... (Quagga init/start/stop effect - no change from your provided code) ... */
    if (firstScannerEffectRun.current) { firstScannerEffectRun.current = false; return; }
    if (isScannerActive) { if (!scannerContainerRef.current) { setScannerError("Scanner UI element not ready."); setIsScannerActive(false); return; } setScannerError(null);
      const quaggaConfig: QuaggaConfig = { inputStream: { name: "Live", type: "LiveStream", target: scannerContainerRef.current!, constraints: { facingMode: "environment", }, area: { top: "20%", right: "5%", left: "5%", bottom: "20%" }, singleChannel: false }, numOfWorkers: navigator.hardwareConcurrency > 1 ? navigator.hardwareConcurrency -1 : 1, locate: true, frequency: 10, decoder: { readers: [ "code_128_reader", "ean_reader" ], debug: { drawBoundingBox: true, showFrequency: false, drawScanline: true, showPattern: false, }, multiple: false, }, locator: { halfSample: true, patchSize: "large", debug: { showCanvas: false }, }, };
      Quagga.init(quaggaConfig, (err: any) => { if (err) { console.error("Quagga init error:", err); const errMsg = typeof err === 'string' ? err : (err.message || 'Unknown init error'); setScannerError(`Scanner init failed: ${errMsg}`); sonnerToast.error(`Scanner init failed: ${errMsg}`); setIsScannerActive(false); setIsQuaggaInitialized(false); return; } console.log("Quagga initialized. Starting..."); setIsQuaggaInitialized(true); Quagga.start(); Quagga.onDetected(onDetected); Quagga.onProcessed((result: any) => { const drawingCtx = Quagga.canvas.ctx.overlay; const drawingCanvas = Quagga.canvas.dom.overlay; if (result && drawingCanvas && drawingCtx) { if (result.boxes) { drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.width as any || "0"), parseInt(drawingCanvas.height as any || "0")); result.boxes.filter((box: any) => box !== result.box).forEach((box: any) => { Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, { color: 'green', lineWidth: 2 }); }); } if (result.box) { Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, { color: '#00F', lineWidth: 2 }); } if (result.codeResult && result.codeResult.code) { Quagga.ImageDebug.drawPath(result.line, { x: 'x', y: 'y' }, drawingCtx, { color: 'red', lineWidth: 3 }); } } }); });
    } else { stopQuaggaScanner(); }
  }, [isScannerActive, onDetected, stopQuaggaScanner]);


  const toggleCameraScanner = () => { /* ... (no change from your provided code) ... */
    if (isScannerActive) setIsScannerActive(false);
    else { setError(null); setScannedItem(null); setBarcode(""); setScannerError(null); setIsScannerActive(true); }
  };

  const handleConfirmSale = async () => { /* ... (no change for single sale confirm) ... */ 
    if (!scannedItem || !user?.id || !originalScannedBarcode) { sonnerToast.error("No item/user/barcode for sale."); return; }
    setIsConfirmingSale(true); setError(null);
    const salePayload = { barcodeScanned: originalScannedBarcode, staffId: user.id, weightGrams: scannedItem.weightGrams, calculatedSellPrice: scannedItem.calculatedSellPrice, articleNo: scannedItem.articleNumber, product_articleNumber: scannedItem.articleNumber, product_articleName: scannedItem.articleName, product_posDescription: scannedItem.posDescription, product_metlerCode: scannedItem.metlerCode, product_hsnCode: scannedItem.hsnCode, product_taxPercentage: scannedItem.taxPercentage, product_purchasePricePerKg: scannedItem.purchasePricePerKg, product_sellingRatePerKg: scannedItem.sellingRatePerKg, product_mrpPer100g: scannedItem.mrpPer100g, product_remark: scannedItem.remark !== undefined ? scannedItem.remark : null, };
    try { const response = await fetch("/api/sales/record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(salePayload), }); if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || "Failed to record sale"); } sonnerToast.success(`Sale Confirmed: ${scannedItem.articleName}`); setScannedItem(null); setOriginalScannedBarcode(""); setBarcode(""); barcodeInputRef.current?.focus();
    } catch (err: any) { setError(err.message); sonnerToast.error(err.message);
    } finally { setIsConfirmingSale(false); }
  };

  // --- Bulk Add Logic ---
  const handleProcessBulkBarcodes = async () => {
    if (!bulkBarcodeInput.trim()) {
      sonnerToast.info("Please paste barcodes into the text area.");
      return;
    }
    setIsProcessingBulk(true);
    setBulkProcessedItems([]);
    setBulkInvalidBarcodes([]);
    const barcodeLines = bulkBarcodeInput.trim().split('\n');
    const processed: BulkProcessedItem[] = [];
    const invalids: string[] = [];

    for (const line of barcodeLines) {
      const currentBarcode = line.trim();
      if (!currentBarcode) continue;

      const parsed = parseBarcode(currentBarcode);
      if (!parsed) {
        invalids.push(currentBarcode);
        continue;
      }
      const { articleNo, weightGrams } = parsed;
      try {
        const response = await fetch("/api/products/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleNo, weightGrams }), });
        if (!response.ok) {
          invalids.push(`${currentBarcode} (Product not found or error)`);
          continue;
        }
        const itemDetails: ScannedItemDetails = await response.json();
        processed.push({ ...itemDetails, originalBarcode: currentBarcode });
      } catch (err) {
        invalids.push(`${currentBarcode} (Lookup failed)`);
      }
    }
    setBulkProcessedItems(processed);
    setBulkInvalidBarcodes(invalids);
    setIsProcessingBulk(false);
    if (processed.length > 0) sonnerToast.success(`${processed.length} items processed successfully.`);
    if (invalids.length > 0) sonnerToast.warning(`${invalids.length} barcodes were invalid or not found.`);
  };

  const handleConfirmBulkSale = async () => {
    if (bulkProcessedItems.length === 0 || !user?.id) {
      sonnerToast.error("No valid items to confirm or user not identified.");
      return;
    }
    if (!confirm(`Are you sure you want to confirm the sale of ${bulkProcessedItems.length} item(s)?`)) return;

    setIsConfirmingBulkSale(true);

    // Frontend now sends a simpler payload for each item.
    // Product details and final price calculation will happen on the server.
    const salesToRecordPayload = bulkProcessedItems.map(item => ({
      barcodeScanned: item.originalBarcode, // The full original barcode
      articleNo: item.articleNumber,       // Parsed article number
      weightGrams: item.weightGrams,       // Parsed weight
      staffId: user.id,
      // NO dateOfSale needed from frontend, server will use current IST date
      // NO calculatedSellPrice from frontend, server will calculate
      // NO product_* fields from frontend, server will look up
    }));

    try {
      const response = await fetch("/api/sales/bulk-record", { // Using the new vendor-specific bulk API
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales: salesToRecordPayload }), // API expects { sales: [...] }
      });
      const result = await response.json();
      if (!response.ok && response.status !== 207) { // 207 is Multi-Status, still process results
        throw new Error(result.message || "Bulk sale confirmation failed.");
      }
      
      // Handle response that might include successful and failed records
      let successMsg = "";
      if (result.successfulRecords > 0) {
        successMsg += `${result.successfulRecords} sales confirmed. `;
      }
      if (result.failedRecords > 0) {
        successMsg += `${result.failedRecords} failed.`;
        sonnerToast.warning(`Bulk sale: ${result.failedRecords} items failed. Check details if provided.`);
        // Optionally display detailed errors from result.errors if you want
        if (result.errors && result.errors.length > 0) {
            console.error("Bulk sale failures:", result.errors);
            result.errors.forEach((err: {barcode: string, message: string}) => {
                sonnerToast.error(`Barcode ${err.barcode}: ${err.message}`);
            });
        }
      } else if (result.successfulRecords > 0) {
        sonnerToast.success(successMsg || "Bulk sales processed.");
      } else if (!result.message && result.successfulRecords === 0 && result.failedRecords === 0) {
        sonnerToast.info("No sales were processed in the bulk request.");
      } else if (result.message) {
        // General message from API if no specific counts
        if (response.ok || response.status === 207) sonnerToast.success(result.message);
        else sonnerToast.error(result.message);
      }


      setIsBulkAddModalOpen(false);
      setBulkBarcodeInput("");
      setBulkProcessedItems([]);
      setBulkInvalidBarcodes([]);
    } catch (err: any) {
      sonnerToast.error("Error confirming bulk sale: " + err.message);
    } finally {
      setIsConfirmingBulkSale(false);
    }
  };


  const handleLogout = () => { /* ... (no change) ... */ logout(); if (isScannerActive) setIsScannerActive(false); router.push('/'); };
  if (!user) { /* ... (no change) ... */ return (<main className="flex min-h-screen flex-col items-center justify-center p-4"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="mt-4">Loading...</p></main>); }

  return (
    <>
      <style jsx global>{`/* ... (Quagga styles - no change) ... */ #${QUAGGA_SCANNER_REGION_ID} { position: relative; width: 100%; min-height: 280px; overflow: hidden; background-color: #333; } #${QUAGGA_SCANNER_REGION_ID} video, #${QUAGGA_SCANNER_REGION_ID} canvas.drawingBuffer { position: absolute; left: 0; top: 0; width: 100% !important; height: 100% !important; } #${QUAGGA_SCANNER_REGION_ID} video { object-fit: cover; } #${QUAGGA_SCANNER_REGION_ID} canvas.drawingBuffer { z-index: 10; } `}</style>
      <Toaster richColors position="top-right" />
      <main className="flex min-h-screen flex-col items-center justify-start p-4 md:p-8 bg-slate-50 dark:bg-slate-900">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2 text-2xl"><ScanLine className="h-7 w-7 text-primary" />Sale Entry</CardTitle>
              <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="mr-1 h-4 w-4" /> Logout</Button>
            </div>
            <CardDescription>Welcome, <strong style={{ fontSize: '1.1em' }}>{user.name || 'Staff'}</strong>! Scan or type barcode. Or use Bulk Add.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Single Scan Section */}
            <div className="space-y-2">
              <Button type="button" onClick={toggleCameraScanner} variant="outline" className="w-full" disabled={isLoading || isConfirmingSale || isConfirmingBulkSale}>
                <Camera className="mr-2 h-4 w-4" />{isScannerActive ? "Stop Camera Scan" : "Scan with Camera"}
              </Button>
              {isScannerActive && (<div className="my-2 p-1 border rounded-md bg-gray-200 dark:bg-gray-800 shadow-inner"><div id={QUAGGA_SCANNER_REGION_ID} ref={scannerContainerRef}></div></div>)}
              {scannerError && (<div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 dark:bg-red-900/30 p-3 rounded-md"><XCircle className="h-5 w-5 shrink-0" /><p>{scannerError}</p></div>)}
            </div>
            <form onSubmit={(e) => handleBarcodeSubmit(e)} className="space-y-2">
              <Label htmlFor="barcode-input">Barcode</Label>
              <Input id="barcode-input" ref={barcodeInputRef} type="text" inputMode="text" placeholder="Scan or type barcode..." value={barcode}
                onChange={(e) => { setBarcode(e.target.value); if (scannedItem && e.target.value !== originalScannedBarcode) { setScannedItem(null); setOriginalScannedBarcode(""); setError(null);}}}
                disabled={isLoading || isConfirmingSale || isScannerActive || isConfirmingBulkSale} className="text-lg"
              />
              <Button type="submit" className="w-full" disabled={isLoading || isConfirmingSale || !barcode.trim() || isScannerActive || isConfirmingBulkSale}>
                {isLoading && !scannedItem && !isConfirmingSale ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : null}Lookup Item
              </Button>
            </form>
            {error && !(isLoading || isConfirmingSale) && (<div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 p-3 rounded-md"><XCircle className="h-5 w-5" /><p>{error}</p></div>)}
            {scannedItem && !(isLoading || isConfirmingSale) && (
              <Card className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700">
                <CardHeader><CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400"><CheckCircle2 className="h-6 w-6"/> Item Details</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p><strong>Name:</strong> {scannedItem.articleName}</p>
                  <p><strong>Scanned:</strong> {originalScannedBarcode}</p>
                  <p><strong>Article No:</strong> {scannedItem.articleNumber}</p>
                  <p><strong>Weight:</strong> {scannedItem.weightGrams}g</p>
                  <p className="text-lg font-semibold"><strong>Price:</strong> ₹{scannedItem.calculatedSellPrice.toFixed(2)}</p>
                </CardContent>
                <CardFooter><Button onClick={handleConfirmSale} className="w-full bg-green-600 hover:bg-green-700" disabled={isConfirmingSale || isLoading}>{isConfirmingSale ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : null}Confirm Sale</Button></CardFooter>
              </Card>
            )}
          </CardContent>
          <CardFooter className="flex-col space-y-2">
            <Button variant="outline" className="w-full" onClick={() => setIsBulkAddModalOpen(true)} disabled={isScannerActive || isLoading || isConfirmingSale || isConfirmingBulkSale}>
                <UploadCloud className="mr-2 h-4 w-4"/> Bulk Add Sales by Barcode
            </Button>
            <div className="flex w-full gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => router.push('/vendor/sales-history')} disabled={isScannerActive || isLoading || isConfirmingSale || isConfirmingBulkSale}>Sales Dashboard</Button>
              <Button variant="secondary" className="flex-1" onClick={() => router.push('/vendor/returns')} disabled={isScannerActive || isLoading || isConfirmingSale || isConfirmingBulkSale}>Manage Returns</Button>
            </div>
          </CardFooter>
        </Card>

        {/* Bulk Add Sales Dialog for Vendor */}
        <Dialog open={isBulkAddModalOpen} onOpenChange={(isOpen) => {
            setIsBulkAddModalOpen(isOpen);
            if (!isOpen) { // Reset on close
                setBulkBarcodeInput('');
                setBulkProcessedItems([]);
                setBulkInvalidBarcodes([]);
            }
        }}>
          {/* MODIFIED DialogContent className for better width on mobile */}
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Bulk Add Sales</DialogTitle>
              <DialogDescription>
                Paste barcodes (one per line). Processed items will be shown below.
              </DialogDescription>
            </DialogHeader>
            {/* Outer ScrollArea for the entire dialog body if it gets too tall */}
            <ScrollArea className="flex-grow overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6"> {/* Negative margins to extend scroll to edges, then padding back */}
                <ScrollBar orientation="horizontal"/>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="bulkBarcodesVendor">Barcodes (one per line)</Label>
                    <Textarea
                      id="bulkBarcodesVendor"
                      value={bulkBarcodeInput}
                      onChange={(e) => setBulkBarcodeInput(e.target.value)}
                      placeholder={"2110000600038848000421\n2110000600038851002081\n..."}
                      rows={5} // Further reduced rows for very small screens
                      className="font-mono text-xs"
                      disabled={isProcessingBulk || isConfirmingBulkSale}
                    />
                  </div>
                  <Button onClick={handleProcessBulkBarcodes} disabled={isProcessingBulk || isConfirmingBulkSale || !bulkBarcodeInput.trim()}>
                    {isProcessingBulk && !isConfirmingBulkSale ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Process Barcodes
                  </Button>

                  {bulkProcessedItems.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="font-semibold text-green-600 dark:text-green-400">Valid Items for Sale ({bulkProcessedItems.length}):</h3>
                      <h4 className="font-medium text-neutral-800 dark:text-neutral-400"> Scroll right to double check all values </h4>
                      {/* ScrollArea for the table itself */}
                      <ScrollArea className="w-full rounded-md border"> {/* Removed whitespace-nowrap here, let table define its width */}
                        {/* Table needs a min-width that's greater than the typical mobile viewport width */}
                        <Table className="text-xs min-w-[550px] sm:min-w-[600px]"> 
                          <TableHeader>
                            <TableRow>
                              <TableHead className="py-2 px-2.5 min-w-[150px] sm:min-w-[200px]">Product</TableHead>
                              <TableHead className="text-right py-2 px-2.5 min-w-[70px] sm:min-w-[80px]">Weight</TableHead>
                              <TableHead className="text-right py-2 px-2.5 min-w-[80px] sm:min-w-[90px]">Price</TableHead>
                              <TableHead className="py-2 px-2.5 min-w-[150px] sm:min-w-[180px]">Barcode</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bulkProcessedItems.map((item, index) => (
                              <TableRow key={`${item.originalBarcode}-${index}`}>
                                <TableCell className="py-1.5 px-2.5">{item.articleName} ({item.articleNumber})</TableCell>
                                <TableCell className="text-right py-1.5 px-2.5">{item.weightGrams}g</TableCell>
                                <TableCell className="text-right py-1.5 px-2.5">₹{item.calculatedSellPrice.toFixed(2)}</TableCell>
                                <TableCell className="font-mono py-1.5 px-2.5">{item.originalBarcode}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>
                    </div>
                  )}

                  {bulkInvalidBarcodes.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4"/> Invalid/Unfound ({bulkInvalidBarcodes.length}):
                      </h3>
                      <ScrollArea className="max-h-28 w-full rounded-md border bg-red-50 dark:bg-red-900/20 p-2"> {/* Reduced max-h */}
                        <ul className="list-disc list-inside text-xs">
                          {bulkInvalidBarcodes.map((b, index) => (
                            <li key={index} className="font-mono">{b}</li>
                          ))}
                        </ul>
                         <ScrollBar orientation="vertical" />
                      </ScrollArea>
                    </div>
                  )}
                </div>
            </ScrollArea>
            <DialogFooter className="mt-auto pt-4 sm:pt-6 border-t px-4 sm:px-6 pb-4"> {/* Adjusted padding */}
              <DialogClose asChild><Button variant="outline" disabled={isProcessingBulk || isConfirmingBulkSale}>Cancel</Button></DialogClose>
              <Button 
                onClick={handleConfirmBulkSale} 
                disabled={isProcessingBulk || isConfirmingBulkSale || bulkProcessedItems.length === 0}
              >
                {isConfirmingBulkSale ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm Sale of {bulkProcessedItems.length} Item(s)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}