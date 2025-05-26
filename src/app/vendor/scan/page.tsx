// src/app/vendor/scan/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
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

import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScanType,
  QrcodeErrorCallback,
  QrcodeSuccessCallback,
  Html5QrcodeResult,
  // VideoConstraints, // Not using for now
} from "html5-qrcode";

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

const BARCODE_SCANNER_REGION_ID = "barcode-scanner-live-region";

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
  const html5QrCodeInstanceRef = useRef<Html5Qrcode | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      router.push('/vendor/login');
    } else {
      if (!isScannerActive) {
        barcodeInputRef.current?.focus();
      }
    }
  }, [user, router, isScannerActive]);

  const onScanSuccess: QrcodeSuccessCallback = (decodedText, decodedResult: Html5QrcodeResult) => {
    console.log(`Barcode detected: ${decodedText}`, decodedResult);
    console.log(`Detected format: ${decodedResult.result.format?.formatName}`);
    setBarcode(decodedText);
    setIsScannerActive(false);
    sonnerToast.success("Barcode Scanned! Looking up item...");
    setScannerError(null);
    handleBarcodeSubmit(undefined, decodedText);
  };

  const onScanFailure: QrcodeErrorCallback = (errorMessage) => {
    // console.warn(`Barcode scan failure: ${errorMessage}`);
  };

  useEffect(() => {
    if (isScannerActive) {
      console.log("Attempting to start scanner...");
      setScannerError(null); // Clear previous scanner errors

      const scannerElement = document.getElementById(BARCODE_SCANNER_REGION_ID);
      if (!scannerElement) {
        console.error(`Scanner region element with ID '${BARCODE_SCANNER_REGION_ID}' not found.`);
        setScannerError("Scanner UI element not found. Cannot start scanner.");
        setIsScannerActive(false);
        return;
      }

      if (html5QrCodeInstanceRef.current) {
        console.log("Clearing previous scanner instance before starting new one.");
        const oldInstance = html5QrCodeInstanceRef.current;
        html5QrCodeInstanceRef.current = null;
        Promise.resolve(oldInstance.clear())
          .catch(e => console.error("Error clearing previous scanner instance:", e));
      }

      console.log("Creating new Html5Qrcode instance.");
      const newHtml5QrCode = new Html5Qrcode(
        BARCODE_SCANNER_REGION_ID,
        {
          verbose: true,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
          ]
        }
      );
      html5QrCodeInstanceRef.current = newHtml5QrCode;

      const config = {
        fps: 5,
        qrbox: undefined, // <<<< START WITH FULL VIEWFINDER SCAN
        // Example qrbox for later testing if full viewfinder works:
        // qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        //   const DYNAMIC_WIDTH_PERCENT = 0.85; 
        //   const DYNAMIC_HEIGHT_PERCENT_OF_WIDTH = 0.35; 
        //   const MIN_WIDTH = 280;
        //   const MIN_HEIGHT = 150; 
        //   let calculatedWidth = Math.floor(viewfinderWidth * DYNAMIC_WIDTH_PERCENT);
        //   let calculatedHeight = Math.floor(calculatedWidth * DYNAMIC_HEIGHT_PERCENT_OF_WIDTH);
        //   if (viewfinderHeight > viewfinderWidth) { 
        //     calculatedHeight = Math.floor(viewfinderHeight * 0.30); 
        //     calculatedWidth = Math.floor(calculatedHeight / DYNAMIC_HEIGHT_PERCENT_OF_WIDTH * 1.2); 
        //     calculatedWidth = Math.min(calculatedWidth, Math.floor(viewfinderWidth * 0.95));
        //   }
        //   const finalWidth = Math.max(MIN_WIDTH, calculatedWidth);
        //   const finalHeight = Math.max(MIN_HEIGHT, calculatedHeight);
        //   console.log(`Scanner qrbox: viewfinder(${viewfinderWidth}x${viewfinderHeight}), finalBox(${finalWidth}x${finalHeight})`);
        //   return { width: finalWidth, height: finalHeight };
        // },
        rememberLastUsedCamera: true,
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        // videoConstraints: undefined, // <<<< REMOVED for now to ensure camera starts
      };

      console.log("Calling html5QrCode.start() with config:", config);
      newHtml5QrCode.start(
        { facingMode: "environment" }, // <<<< REVERTED to simpler camera selection
        config,
        onScanSuccess,
        onScanFailure
      ).then(() => {
        console.log("Camera scanner started successfully.");
      }).catch((err) => {
        const errorMsg = String(err);
        let friendlyMessage = `Failed to start camera: ${errorMsg}`;
        if (errorMsg.includes("NotFoundError") || errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) {
            friendlyMessage = "Camera not found or permission denied. Please check browser settings and allow camera access.";
        } else if (errorMsg.includes("OverconstrainedError")) {
            friendlyMessage = "Cannot access camera. It might be in use by another app, or the requested constraints (like resolution) are not supported by your device.";
        } else if (errorMsg.includes("getUserMedia") && errorMsg.includes("is not a function")) {
            friendlyMessage = "Camera access (getUserMedia) is not supported by this browser or device, or you are not on HTTPS.";
        } else if (errorMsg.includes("DOMException")) {
             friendlyMessage = `Camera start failed (DOMException): ${errorMsg}. This could be due to permissions, camera in use, or unsupported features.`;
        }
        console.error("Scanner start error full object:", err);
        console.error("Scanner start error friendly message:", friendlyMessage);
        setScannerError(friendlyMessage);
        sonnerToast.error(friendlyMessage);
        setIsScannerActive(false); // Ensure scanner is marked as inactive on failure
        // Attempt to clear the instance if it was created but failed to start
        if (html5QrCodeInstanceRef.current === newHtml5QrCode) { // Check if it's the same instance
            const instanceToClear = html5QrCodeInstanceRef.current;
            html5QrCodeInstanceRef.current = null;
            Promise.resolve(instanceToClear.clear())
                .catch(e => console.warn("Failed to clear scanner after start error:", e));
        }
      });

    } else { // isScannerActive is false
      if (html5QrCodeInstanceRef.current) {
        console.log("Scanner is inactive, stopping and clearing instance.");
        const scannerToStop = html5QrCodeInstanceRef.current;
        html5QrCodeInstanceRef.current = null;
        scannerToStop.stop()
          .then(() => {
            console.log("Scanner explicitly stopped.");
            return scannerToStop.clear();
          })
          .then(() => {
            console.log("Scanner cleared after stop.");
          })
          .catch((err) => {
            console.error("Error during scanner stop/clear:", err);
            Promise.resolve(scannerToStop.clear())
              .catch(e => console.error("Error clearing scanner after stop failure:", e));
          });
      }
    }

    return () => {
      if (html5QrCodeInstanceRef.current) {
        console.log("useEffect cleanup: Stopping and clearing scanner.");
        const scannerToClean = html5QrCodeInstanceRef.current;
        html5QrCodeInstanceRef.current = null;
        scannerToClean.stop()
          .then(() => {
            console.log("Scanner stopped on cleanup.");
            return scannerToClean.clear();
          })
          .then(() => {
            console.log("Scanner cleared on cleanup.");
          })
          .catch(err => {
            console.error("Cleanup: Error stopping/clearing scanner", err);
            Promise.resolve(scannerToClean.clear())
              .catch(e => console.warn("Cleanup: Scanner clear failed after stop error:", e));
          });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScannerActive]); // onScanSuccess, onScanFailure, handleBarcodeSubmit are stable

  const toggleCameraScanner = () => {
    if (isScannerActive) {
      setIsScannerActive(false);
    } else {
      setError(null);
      setScannedItem(null);
      setBarcode("");
      setScannerError(null); // Clear previous scanner errors before trying again
      setIsScannerActive(true);
    }
  };

  // ... (parseBarcode, handleBarcodeSubmit, handleConfirmSale, handleLogout, and JSX remain the same)
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
    // console.warn("Barcode does not match expected format/length for parsing articleNo and weight:", fullBarcode);
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
              <div className="my-2 p-2 border rounded-md bg-gray-100 shadow-inner relative">
                <div id={BARCODE_SCANNER_REGION_ID} style={{ width: "100%", minHeight: "250px" }}>
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
  );
}