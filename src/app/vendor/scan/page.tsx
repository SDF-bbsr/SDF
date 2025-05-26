// src/app/vendor/scan/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast as sonnerToast } from "sonner";
import { Loader2, XCircle, CheckCircle2, ScanLine, LogOut, Camera } from "lucide-react";
import { useUser } from "@/context/UserContext";
import Quagga, { QuaggaConfig, QuaggaDetectionResult } from 'quagga'; // Import QuaggaJS and types

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
}

const QUAGGA_SCANNER_REGION_ID = "quagga-scanner-live-region";

export default function VendorScanPage() {
  const { user, logout } = useUser();
  const router = useRouter();

  const [barcode, setBarcode] = useState("");
  const [originalScannedBarcode, setOriginalScannedBarcode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmingSale, setIsConfirmingSale] = useState(false);
  const [scannedItem, setScannedItem] = useState<ScannedItemDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isQuaggaInitialized, setIsQuaggaInitialized] = useState(false); // Track init state

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  const firstScannerEffectRun = useRef(true);


  useEffect(() => {
    if (!user) {
      router.push('/vendor/login');
    } else {
      if (!isScannerActive) {
        barcodeInputRef.current?.focus();
      }
    }
  }, [user, router, isScannerActive]);

  // Type the result parameter
  const onDetected = useCallback((result: QuaggaDetectionResult) => {
    if (result && result.codeResult && result.codeResult.code) {
      console.log("QuaggaJS Detected:", result.codeResult.code);
      sonnerToast.success("Barcode Scanned! Looking up item...");
      setBarcode(result.codeResult.code);
      setIsScannerActive(false);
      setScannerError(null);
      // Assuming handleBarcodeSubmit is stable or its dependencies are in this useCallback's array
      handleBarcodeSubmit(undefined, result.codeResult.code);
    }
  }, []); // Add dependencies for handleBarcodeSubmit if it uses props/state from outside


  const stopQuaggaScanner = useCallback(() => {
    if (isQuaggaInitialized) { // Only stop if it was successfully initialized
      console.log("Stopping QuaggaJS scanner...");
      Quagga.offDetected(onDetected);
      Quagga.offProcessed();
      Quagga.stop();
      setIsQuaggaInitialized(false); // Reset init state
      console.log("QuaggaJS scanner stopped.");
    }
  }, [onDetected, isQuaggaInitialized]);

  useEffect(() => {
    return () => {
        // Cleanup on component unmount
        stopQuaggaScanner();
    };
  }, [stopQuaggaScanner]);


  useEffect(() => {
    if (firstScannerEffectRun.current) {
      firstScannerEffectRun.current = false;
      return;
    }

    if (isScannerActive) {
      if (!scannerContainerRef.current) {
        console.error("Scanner container div not found.");
        setScannerError("Scanner UI element not ready.");
        setIsScannerActive(false);
        return;
      }
      console.log("Attempting to start QuaggaJS scanner...");
      setScannerError(null);

      const quaggaConfig: QuaggaConfig = { // Use the imported QuaggaConfig type
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerContainerRef.current,
          constraints: {
            // width: { min: 640, ideal: 1280, max: 1920 },
            // height: { min: 480, ideal: 720, max: 1080 },
            // aspectRatio: { ideal: 16/9 }, // You can try with or without this
            facingMode: "environment",
          },
          area: { top: "20%", right: "5%", left: "5%", bottom: "20%" },
          singleChannel: false
        },
        numOfWorkers: navigator.hardwareConcurrency > 1 ? navigator.hardwareConcurrency -1 : 1, // Leave one core for UI
        locate: true,
        frequency: 10,
        decoder: {
          readers: [ "code_128_reader", "ean_reader" ],
          debug: {
            drawBoundingBox: true,
            showFrequency: true,
            drawScanline: true,
            showPattern: false, // Can be noisy
          },
          multiple: false,
        },
        locator: {
          halfSample: true,
          patchSize: "large", // Try 'large' or 'x-large' for Code 128
          debug: { showCanvas: false }, // Keep others false unless deep debugging locator
        },
      };

      // Type the err parameter for the init callback
      Quagga.init(quaggaConfig, (err: any) => { // Using 'any' for err as defined in .d.ts
        if (err) {
          console.error("QuaggaJS initialization error:", err);
          const errMsg = typeof err === 'string' ? err : (err.message || 'Unknown initialization error');
          setScannerError(`Scanner init failed: ${errMsg}`);
          sonnerToast.error(`Scanner init failed: ${errMsg}`);
          setIsScannerActive(false);
          setIsQuaggaInitialized(false);
          return;
        }
        console.log("QuaggaJS initialized successfully. Starting scanner...");
        setIsQuaggaInitialized(true); // Set init state
        Quagga.start();
        Quagga.onDetected(onDetected);
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
      stopQuaggaScanner();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScannerActive, onDetected, stopQuaggaScanner]); // isQuaggaInitialized removed as it's managed internally by stop


  const toggleCameraScanner = () => {
    if (isScannerActive) {
      setIsScannerActive(false);
    } else {
      setError(null);
      setScannedItem(null);
      setBarcode("");
      setScannerError(null);
      setIsScannerActive(true);
    }
  };

  // ... (rest of the component: parseBarcode, handleBarcodeSubmit, handleConfirmSale, handleLogout, JSX)
  const parseBarcode = (fullBarcode: string): { articleNo: string; weightGrams: number } | null => {
    if (fullBarcode.length >= 21) {
        const articlePart = fullBarcode.substring(7, 16);
        const weightPart = fullBarcode.substring(16, 21);
        const articleNo = articlePart;
        const weightGrams = parseInt(weightPart, 10);
        if (!isNaN(weightGrams) && articleNo) {
            return { articleNo, weightGrams };
        }
    }
    return null;
  };

  const handleBarcodeSubmit = async (e?: React.FormEvent<HTMLFormElement>, scannedValue?: string) => {
    if (e) e.preventDefault();
    const currentBarcodeValue = (scannedValue || barcode).trim();

    if (!currentBarcodeValue) {
      setError("Barcode cannot be empty.");
      sonnerToast.warning("Please enter or scan a barcode.");
      return;
    }
    setIsLoading(true);
    setIsConfirmingSale(false);
    setError(null);
    setScannedItem(null);
    setOriginalScannedBarcode("");

    const parsed = parseBarcode(currentBarcodeValue);
    if (!parsed) {
      setIsLoading(false);
      setError("Invalid barcode format. Could not extract product details.");
      sonnerToast.error("Invalid barcode. Please scan or type a valid product barcode.");
      if (!scannedValue) barcodeInputRef.current?.focus();
      return;
    }
    const { articleNo, weightGrams } = parsed;

    try {
      const response = await fetch("/api/products/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleNo, weightGrams }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to lookup item. Product not found or invalid data.");
      }
      const data: ScannedItemDetails = await response.json();
      setScannedItem(data);
      setOriginalScannedBarcode(currentBarcodeValue);
      sonnerToast.success(`Item Found: ${data.articleName}`);
    } catch (err: any) {
      setError(err.message || "An error occurred while looking up the item.");
      sonnerToast.error(err.message || "Error looking up item.");
      setScannedItem(null);
    } finally {
      setIsLoading(false);
      if (!scannedValue) {
        barcodeInputRef.current?.focus();
      }
    }
  };

  const handleConfirmSale = async () => {
    if (!scannedItem || !user?.id || !originalScannedBarcode) {
      sonnerToast.error("No item scanned, user not identified, or original barcode missing. Cannot confirm sale.");
      return;
    }
    setIsConfirmingSale(true);
    setError(null);

    const salePayload = {
      barcodeScanned: originalScannedBarcode,
      staffId: user.id,
      weightGrams: scannedItem.weightGrams,
      calculatedSellPrice: scannedItem.calculatedSellPrice,
      articleNo: scannedItem.articleNumber,
      product_articleNumber: scannedItem.articleNumber,
      product_articleName: scannedItem.articleName,
      product_posDescription: scannedItem.posDescription,
      product_metlerCode: scannedItem.metlerCode,
      product_hsnCode: scannedItem.hsnCode,
      product_taxPercentage: scannedItem.taxPercentage,
      product_purchasePricePerKg: scannedItem.purchasePricePerKg,
      product_sellingRatePerKg: scannedItem.sellingRatePerKg,
      product_mrpPer100g: scannedItem.mrpPer100g,
      product_remark: scannedItem.remark !== undefined ? scannedItem.remark : null,
    };

    try {
      const response = await fetch("/api/sales/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salePayload),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to record sale");
      }
      sonnerToast.success(
        `Sale Confirmed: ${scannedItem.articleName} by ${user.name || 'Staff'}`
      );
      setScannedItem(null);
      setOriginalScannedBarcode("");
      setBarcode("");
      barcodeInputRef.current?.focus();
    } catch (err: any) {
      setError(err.message || "An error occurred during sale confirmation.");
      sonnerToast.error(err.message || "Error confirming sale.");
    } finally {
      setIsConfirmingSale(false);
    }
  };

  const handleLogout = () => {
    logout();
    if (isScannerActive) setIsScannerActive(false);
    router.push('/');
  };

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="mt-4">Loading user data...</p>
      </main>
    );
  }

  return (
    <>
      <style jsx global>{`
        #${QUAGGA_SCANNER_REGION_ID} {
          position: relative;
          width: 100%;
          min-height: 280px; /* Slightly increased min-height */
          overflow: hidden;
          background-color: #333; /* Dark background while camera loads */
        }
        #${QUAGGA_SCANNER_REGION_ID} video,
        #${QUAGGA_SCANNER_REGION_ID} canvas.drawingBuffer { /* Apply to drawingBuffer too */
          position: absolute;
          left: 0;
          top: 0;
          width: 100% !important;
          height: 100% !important;
        }
        #${QUAGGA_SCANNER_REGION_ID} video {
           object-fit: cover; /* Or 'contain' if you prefer letterboxing */
        }
        #${QUAGGA_SCANNER_REGION_ID} canvas.drawingBuffer {
          z-index: 10;
        }
      `}</style>
      <main className="flex min-h-screen flex-col items-center justify-start p-4 md:p-12 bg-slate-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ScanLine className="h-7 w-7 text-blue-600" />
                Sale Entry
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="mr-1 h-4 w-4" /> Logout
              </Button>
            </div>
            <CardDescription>
              Welcome, {user.name || 'Staff'}! Scan or type the barcode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Button
                type="button"
                onClick={toggleCameraScanner}
                variant="outline"
                className="w-full"
                disabled={isLoading || isConfirmingSale}
              >
                <Camera className="mr-2 h-4 w-4" />
                {isScannerActive ? "Stop Camera Scan" : "Scan with Camera"}
              </Button>

              {isScannerActive && (
                <div className="my-2 p-1 border rounded-md bg-gray-200 shadow-inner">
                  <div id={QUAGGA_SCANNER_REGION_ID} ref={scannerContainerRef}>
                  </div>
                </div>
              )}
              {scannerError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 p-3 rounded-md">
                  <XCircle className="h-5 w-5 flex-shrink-0" />
                  <p>{scannerError}</p>
                </div>
              )}
            </div>

            <form onSubmit={(e) => handleBarcodeSubmit(e)} className="space-y-2">
              <Label htmlFor="barcode-input">Barcode</Label>
              <Input
                id="barcode-input"
                ref={barcodeInputRef}
                type="text"
                inputMode="text"
                placeholder="Scan or type barcode..."
                value={barcode}
                onChange={(e) => {
                  setBarcode(e.target.value);
                  if (scannedItem && e.target.value !== originalScannedBarcode) {
                      setScannedItem(null);
                      setOriginalScannedBarcode("");
                      setError(null);
                  }
                }}
                disabled={isLoading || isConfirmingSale || isScannerActive}
                className="text-lg"
              />
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || isConfirmingSale || !barcode.trim() || isScannerActive}
              >
                {isLoading && !scannedItem && !isConfirmingSale ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Lookup Item
              </Button>
            </form>

            {error && !(isLoading || isConfirmingSale) && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 p-3 rounded-md">
                <XCircle className="h-5 w-5" />
                <p>{error}</p>
              </div>
            )}

            {scannedItem && !(isLoading || isConfirmingSale) && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-6 w-6"/> Item Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p><strong>Name:</strong> {scannedItem.articleName}</p>
                  <p><strong>Scanned Barcode:</strong> {originalScannedBarcode}</p>
                  <p><strong>Article No:</strong> {scannedItem.articleNumber}</p>
                  <p><strong>Weight:</strong> {scannedItem.weightGrams}g</p>
                  <p className="text-lg font-semibold">
                    <strong>Price:</strong> ₹{scannedItem.calculatedSellPrice.toFixed(2)}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={handleConfirmSale}
                    className="w-full bg-green-600 hover:bg-green-700"
                    disabled={isConfirmingSale || isLoading}
                  >
                    {isConfirmingSale ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Confirm Sale
                  </Button>
                </CardFooter>
              </Card>
            )}
          </CardContent>
          <CardFooter>
            <div className="flex w-full gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => router.push('/vendor/sales-history')} disabled={isScannerActive || isLoading || isConfirmingSale}>
                Daily Sales Dashboard
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => router.push('/vendor/returns')} disabled={isScannerActive || isLoading || isConfirmingSale}>
                Manage Returns
              </Button>
            </div>
          </CardFooter>
        </Card>
      </main>
    </>
  );
}