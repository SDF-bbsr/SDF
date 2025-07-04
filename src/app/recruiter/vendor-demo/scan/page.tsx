// src/app/recruiter/vendor-demo/scan/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
} from "@/components/ui/table";
import { toast as sonnerToast, Toaster } from "sonner";
import { Loader2, XCircle, CheckCircle2, ScanLine, LogOut, Camera, UploadCloud, AlertTriangle } from "lucide-react";
// REMOVED: import { useUser } from "@/context/UserContext";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// Interfaces remain the same
interface ScannedItemDetails {
  articleNumber: string; articleName: string; posDescription: string; metlerCode: string;
  hsnCode: string; taxPercentage: number; purchasePricePerKg: number; sellingRatePerKg: number;
  mrpPer100g: number; remark?: string; weightGrams: number; calculatedSellPrice: number;
  originalBarcode?: string;
}
interface BulkProcessedItem extends ScannedItemDetails { originalBarcode: string; }

const BARCODE_PREFIX = "2110000";
const ARTICLE_NO_IN_BARCODE_LENGTH = 9;
const WEIGHT_GRAMS_IN_BARCODE_LENGTH = 5;

// --- NEW: Static user for demo purposes ---
const demoUser = {
  id: 'Parimita',
  name: 'Parimita'
};

export default function VendorScanDemoPage() {
  // REMOVED: useUser hook
  const router = useRouter();

  const [barcode, setBarcode] = useState("");
  const [originalScannedBarcode, setOriginalScannedBarcode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [scannedItem, setScannedItem] = useState<ScannedItemDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isApiSupported, setIsApiSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [bulkBarcodeInput, setBulkBarcodeInput] = useState("");
  const [bulkProcessedItems, setBulkProcessedItems] = useState<BulkProcessedItem[]>([]);
  const [bulkInvalidBarcodes, setBulkInvalidBarcodes] = useState<string[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // REMOVED: Authentication check useEffect. Kept for auto-focus.
  useEffect(() => { 
    if (!isScannerActive && !isBulkAddModalOpen) {
      barcodeInputRef.current?.focus();
    }
  }, [isScannerActive, isBulkAddModalOpen]);

  useEffect(() => {
    if ('BarcodeDetector' in window) { setIsApiSupported(true); } 
    else { sonnerToast.warning("Built-in scanner is not supported on this device/browser."); }
  }, []);

  const parseBarcode = useCallback((fullBarcode: string): { articleNo: string; weightGrams: number } | null => {
    fullBarcode = fullBarcode.trim();
    if (fullBarcode.length >= (BARCODE_PREFIX.length + ARTICLE_NO_IN_BARCODE_LENGTH + WEIGHT_GRAMS_IN_BARCODE_LENGTH)) {
      const articleStartIndex = BARCODE_PREFIX.length;
      const articlePart = fullBarcode.substring(articleStartIndex, articleStartIndex + ARTICLE_NO_IN_BARCODE_LENGTH);
      const weightPart = fullBarcode.substring(articleStartIndex + ARTICLE_NO_IN_BARCODE_LENGTH, articleStartIndex + ARTICLE_NO_IN_BARCODE_LENGTH + WEIGHT_GRAMS_IN_BARCODE_LENGTH);
      const articleNo = articlePart; const weightGrams = parseInt(weightPart, 10);
      if (!isNaN(weightGrams) && articleNo.match(/^\d+$/) && articleNo.length === ARTICLE_NO_IN_BARCODE_LENGTH && weightGrams > 0) {
        return { articleNo, weightGrams };
      }
    }
    return null;
  }, []);

  // KEPT: This is a GET-like operation (product lookup) and is great for demo.
  const handleBarcodeSubmit = useCallback(async (e?: React.FormEvent<HTMLFormElement>, scannedValue?: string) => {
    if (e) e.preventDefault();
    const currentBarcodeValue = (scannedValue || barcode).trim();
    if (!currentBarcodeValue) { setError("Barcode cannot be empty."); sonnerToast.warning("Please enter or scan a barcode."); return; }
    setIsLoading(true); setError(null); setScannedItem(null); setOriginalScannedBarcode("");
    const parsed = parseBarcode(currentBarcodeValue);
    if (!parsed) { setIsLoading(false); setError("Invalid barcode format."); sonnerToast.error("Invalid barcode. Please check format."); if (!scannedValue) barcodeInputRef.current?.focus(); return; }
    const { articleNo, weightGrams } = parsed;
    try {
      const response = await fetch("/api/products/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleNo, weightGrams }), });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || "Failed to lookup item."); }
      const data: ScannedItemDetails = await response.json();
      setScannedItem(data); setOriginalScannedBarcode(currentBarcodeValue); sonnerToast.success(`Item Found: ${data.articleName}`);
    } catch (err: any) { setError(err.message); sonnerToast.error(err.message); setScannedItem(null); }
    finally { setIsLoading(false); if (!scannedValue) barcodeInputRef.current?.focus(); }
  }, [barcode, parseBarcode]);

  // Camera scanner logic is kept to demonstrate the feature.
  useEffect(() => {
    if (!isScannerActive || !isApiSupported) {
      return;
    }

    let stream: MediaStream | null = null;
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
            sonnerToast.info("Barcode Scanned via Camera!");
            setIsScannerActive(false); // This triggers the cleanup in the return function
            setBarcode(detectedValue);
            handleBarcodeSubmit(undefined, detectedValue);
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

    // Cleanup function
    return () => {
      stopScan();
    };
  }, [isScannerActive, isApiSupported, handleBarcodeSubmit]);


  const toggleCameraScanner = () => {
    if (isScannerActive) {
      setIsScannerActive(false);
    } else {
      if (!isApiSupported) {
        setScannerError("Barcode scanning is not supported by your browser. Try updating it or using a different one like Chrome on Android.");
        sonnerToast.error("Your browser doesn't support the built-in scanner.");
        return;
      }
      setError(null);
      setScannedItem(null);
      setBarcode("");
      setScannerError(null);
      setIsScannerActive(true);
    }
  };

  // MODIFIED: This POST functionality is disabled.
  const handleConfirmSale = () => { 
    sonnerToast.info("Sale confirmation is disabled in demo mode.", {
      description: "In the live application, this action would record the sale transaction.",
    });
  };

  const handleProcessBulkBarcodes = async () => {
    if (!bulkBarcodeInput.trim()) { sonnerToast.info("Please paste barcodes into the text area."); return; }
    setIsProcessingBulk(true); setBulkProcessedItems([]); setBulkInvalidBarcodes([]);
    const barcodeLines = bulkBarcodeInput.trim().split('\n');
    const processed: BulkProcessedItem[] = []; const invalids: string[] = [];
    for (const line of barcodeLines) {
      const currentBarcode = line.trim(); if (!currentBarcode) continue;
      const parsed = parseBarcode(currentBarcode);
      if (!parsed) { invalids.push(currentBarcode); continue; }
      const { articleNo, weightGrams } = parsed;
      try {
        const response = await fetch("/api/products/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleNo, weightGrams }), });
        if (!response.ok) { const errData = await response.json(); invalids.push(`${currentBarcode} (${errData.message || 'Product not found'})`); continue; }
        const itemDetails: ScannedItemDetails = await response.json();
        processed.push({ ...itemDetails, originalBarcode: currentBarcode });
      } catch (err) { invalids.push(`${currentBarcode} (Lookup failed)`); }
    }
    setBulkProcessedItems(processed); setBulkInvalidBarcodes(invalids); setIsProcessingBulk(false);
    if (processed.length > 0) sonnerToast.success(`${processed.length} items processed successfully.`);
    if (invalids.length > 0) sonnerToast.warning(`${invalids.length} barcodes were invalid or not found.`);
  };

  // MODIFIED: This POST functionality is disabled.
  const handleConfirmBulkSale = () => {
    sonnerToast.info("Bulk sale confirmation is disabled in demo mode.", {
      description: "In the live application, this would record all valid items.",
    });
  };

  return (
    <>
      <style jsx global>{`
        @keyframes vendor-scan-line-anim { 0% { top: 0; } 100% { top: calc(100% - 2px); } }
        .animate-scan-line-vendor { animation: vendor-scan-line-anim 2.5s ease-in-out infinite alternate; }
      `}</style>
      <Toaster richColors position="top-right" />
      <main className="flex min-h-screen flex-col items-center justify-start p-4 md:p-8 bg-slate-50 dark:bg-slate-900">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2 text-2xl"><ScanLine className="h-7 w-7 text-primary" />Sale Entry (Demo)</CardTitle>
              {/* MODIFIED: Exit button goes to recruiter portal */}
              <Button variant="ghost" size="sm" onClick={() => router.push('/recruiter/portal')}><LogOut className="mr-1 h-4 w-4" /> Exit Demo</Button>
            </div>
            {/* MODIFIED: Uses static demoUser name */}
            <CardDescription>Welcome, <strong style={{ fontSize: '1.1em' }}>{demoUser.name}</strong>! Scan or type barcode. Or use Bulk Add.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Button type="button" onClick={toggleCameraScanner} variant="outline" className="w-full" disabled={!isApiSupported || isLoading}>
                <Camera className="mr-2 h-4 w-4" />
                {isScannerActive ? "Stop Camera Scan" : (isApiSupported ? "Scan with Camera" : "Scanner Not Supported")}
              </Button>
              {isScannerActive && (
                <div className="my-2 p-1 border rounded-md bg-gray-900 shadow-inner relative overflow-hidden aspect-video">
                  <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-[90%] h-[50%] border-2 border-dashed border-white/50 rounded-lg" />
                  </div>
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500 animate-scan-line-vendor" />
                </div>
              )}
              {scannerError && (<div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 dark:bg-red-900/30 p-3 rounded-md"><XCircle className="h-5 w-5 shrink-0" /><p>{scannerError}</p></div>)}
            </div>
            <form onSubmit={(e) => handleBarcodeSubmit(e)} className="space-y-2">
              <p className="text-sm">[Eg: 2110000600038796004541 ]</p>
              <Label htmlFor="barcode-input">Barcode</Label>
              <Input id="barcode-input" ref={barcodeInputRef} type="text" inputMode="text" placeholder="Scan or type barcode..." value={barcode}
                onChange={(e) => { setBarcode(e.target.value); if (scannedItem) { setScannedItem(null); setOriginalScannedBarcode(""); setError(null);}}}
                disabled={isLoading || isScannerActive} className="text-lg"
              />
              <Button type="submit" className="w-full" disabled={isLoading || !barcode.trim() || isScannerActive}>
                {isLoading && !scannedItem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Lookup Item
              </Button>
            </form>
            {error && !isLoading && (<div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 p-3 rounded-md"><XCircle className="h-5 w-5" /><p>{error}</p></div>)}
            {scannedItem && !isLoading && (
              <Card className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700">
                <CardHeader><CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400"><CheckCircle2 className="h-6 w-6"/> Item Details</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p><strong>Name:</strong> {scannedItem.articleName}</p>
                  <p><strong>Scanned:</strong> {originalScannedBarcode}</p>
                  <p><strong>Article No:</strong> {scannedItem.articleNumber}</p>
                  <p><strong>Weight:</strong> {scannedItem.weightGrams}g</p>
                  <p className="text-lg font-semibold"><strong>Price:</strong> ₹{scannedItem.calculatedSellPrice.toFixed(2)}</p>
                </CardContent>
                <CardFooter>
                    {/* MODIFIED: Button calls the new info handler */}
                    <Button onClick={handleConfirmSale} className="w-full bg-green-600 hover:bg-green-700">Confirm Sale</Button>
                </CardFooter>
              </Card>
            )}
          </CardContent>
          <CardFooter className="flex-col space-y-2">
            <Button variant="outline" className="w-full" onClick={() => setIsBulkAddModalOpen(true)} disabled={isScannerActive || isLoading}>
                <UploadCloud className="mr-2 h-4 w-4"/> Bulk Add Sales by Barcode
            </Button>
            <div className="flex w-full gap-2">
              {/* MODIFIED: Links to other demo pages or are disabled */}
              <Button variant="secondary" className="flex-1" onClick={() => router.push('/recruiter/vendor-demo/sales-history')} disabled={isScannerActive || isLoading}>Sales Dashboard</Button>
              <Button variant="secondary" className="flex-1" onClick={() => router.push('/recruiter/vendor-demo/returns')} disabled={isScannerActive || isLoading}>Manage Returns</Button>
            </div>
          </CardFooter>
        </Card>

        <Dialog open={isBulkAddModalOpen} onOpenChange={(isOpen) => { if (!isOpen) { setBulkBarcodeInput(''); setBulkProcessedItems([]); setBulkInvalidBarcodes([]); } setIsBulkAddModalOpen(isOpen); }}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Bulk Add Sales</DialogTitle>
              <DialogDescription>Paste barcodes (one per line). Processed items will be shown below.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-grow overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
            <ScrollBar orientation="horizontal"/>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="bulkBarcodesVendor">Barcodes (one per line)</Label>
                    <Textarea id="bulkBarcodesVendor" value={bulkBarcodeInput} onChange={(e) => setBulkBarcodeInput(e.target.value)} placeholder={"2110000600038848000421\n2110000600038851002081\n..."} rows={5} className="font-mono text-xs" disabled={isProcessingBulk }/>
                  </div>
                  <Button onClick={handleProcessBulkBarcodes} disabled={isProcessingBulk || !bulkBarcodeInput.trim()}>
                    {isProcessingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Process Barcodes
                  </Button>
                  {bulkProcessedItems.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="font-semibold text-green-600 dark:text-green-400">Valid Items for Sale ({bulkProcessedItems.length}):</h3>
                      <h4 className="font-medium text-neutral-800 dark:text-neutral-400"> Scroll right to double check all values </h4>
                      <ScrollArea className="w-full rounded-md border">
                        <Table className="text-xs min-w-[550px] sm:min-w-[600px]"> 
                          <TableHeader><TableRow><TableHead className="py-2 px-2.5 min-w-[150px] sm:min-w-[200px]">Product</TableHead><TableHead className="text-right py-2 px-2.5 min-w-[70px] sm:min-w-[80px]">Weight</TableHead><TableHead className="text-right py-2 px-2.5 min-w-[80px] sm:min-w-[90px]">Price</TableHead><TableHead className="py-2 px-2.5 min-w-[150px] sm:min-w-[180px]">Barcode</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {bulkProcessedItems.map((item, index) => (
                              <TableRow key={`${item.originalBarcode}-${index}`}><TableCell className="py-1.5 px-2.5">{item.articleName} ({item.articleNumber})</TableCell><TableCell className="text-right py-1.5 px-2.5">{item.weightGrams}g</TableCell><TableCell className="text-right py-1.5 px-2.5">₹{item.calculatedSellPrice.toFixed(2)}</TableCell><TableCell className="font-mono py-1.5 px-2.5">{item.originalBarcode}</TableCell></TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>
                    </div>
                  )}
                  {bulkInvalidBarcodes.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="font-semibold text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle className="h-4 w-4"/> Invalid/Unfound ({bulkInvalidBarcodes.length}):</h3>
                      <ScrollArea className="max-h-28 w-full rounded-md border bg-red-50 dark:bg-red-900/20 p-2">
                        <ul className="list-disc list-inside text-xs">{bulkInvalidBarcodes.map((b, index) => (<li key={index} className="font-mono">{b}</li>))}</ul>
                        <ScrollBar orientation="vertical" />
                      </ScrollArea>
                    </div>
                  )}
                </div>
            </ScrollArea>
            <DialogFooter className="mt-auto pt-4 sm:pt-6 border-t px-4 sm:px-6 pb-4">
              <DialogClose asChild><Button variant="outline" disabled={isProcessingBulk}>Cancel</Button></DialogClose>
              {/* MODIFIED: Button calls the new info handler */}
              <Button onClick={handleConfirmBulkSale} disabled={isProcessingBulk || bulkProcessedItems.length === 0}>
                Confirm Sale of {bulkProcessedItems.length} Item(s)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}