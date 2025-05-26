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

// Barcode Scanner Imports
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScanType,
  QrcodeErrorCallback,
  QrcodeSuccessCallback
} from "html5-qrcode";

// MODIFIED: Updated ScannedItemDetails interface
interface ScannedItemDetails {
  articleNumber: string;
  articleName: string;
  posDescription: string;
  metlerCode: string; // Assuming this is still a string
  hsnCode: string;    // Assuming this is still a string
  taxPercentage: number; // Changed to number
  purchasePricePerKg: number; // Changed to number
  sellingRatePerKg: number; // Changed to number
  mrpPer100g: number; // Changed to number
  remark?: string;

  // Fields specific to the scan/sale context (added/calculated by lookup API)
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
  const [scannedItem, setScannedItem] = useState<ScannedItemDetails | null>(null); // Uses updated interface
  const [error, setError] = useState<string | null>(null);

  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const html5QrCodeInstanceRef = useRef<Html5Qrcode | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      router.push('/vendor/login');
    } else {
      barcodeInputRef.current?.focus();
    }
  }, [user, router]);

  const onScanSuccess: QrcodeSuccessCallback = (decodedText, decodedResult) => {
    console.log(`Barcode detected: ${decodedText}`, decodedResult);
    setBarcode(decodedText);
    setIsScannerActive(false); 
    sonnerToast.success("Barcode Scanned! Verify and submit.");
    barcodeInputRef.current?.focus();
    setScannerError(null);
  };

  const onScanFailure: QrcodeErrorCallback = (errorMessage) => {
    if (
      !errorMessage.toLowerCase().includes("not found") &&
      !errorMessage.toLowerCase().includes("insufficient") &&
      !errorMessage.toLowerCase().includes("unable to query supported devices") &&
      !errorMessage.toLowerCase().includes("noisgnificant")
    ) {
      console.warn(`Barcode scan error: ${errorMessage}`);
    }
  };

  useEffect(() => {
    if (isScannerActive) {
      const scannerElement = document.getElementById(BARCODE_SCANNER_REGION_ID);
      if (!scannerElement) {
        console.error(`Scanner region element with ID '${BARCODE_SCANNER_REGION_ID}' not found.`);
        setScannerError("Scanner UI element not found. Cannot start scanner.");
        setIsScannerActive(false);
        return;
      }

      if (html5QrCodeInstanceRef.current) {
         console.warn("Scanner starting: Previous instance found, attempting to clear it first.");
         Promise.resolve(html5QrCodeInstanceRef.current.clear())
            .catch(e => console.error("Error clearing previous scanner instance before starting new one:", e))
            .finally(() => {
                html5QrCodeInstanceRef.current = null; 
            });
      }

      const newHtml5QrCode = new Html5Qrcode(
        BARCODE_SCANNER_REGION_ID,
        {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODE_39,
          ]
        }
      );
      html5QrCodeInstanceRef.current = newHtml5QrCode;

      const config = {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const boxWidth = Math.floor(viewfinderWidth * 0.85);
          const boxHeight = Math.floor(Math.min(viewfinderHeight * 0.30, boxWidth * 0.20));
          return {
            width: Math.max(280, boxWidth),
            height: Math.max(100, boxHeight)
          };
        },
        rememberLastUsedCamera: true,
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
      };

      newHtml5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanFailure
      ).catch((err) => {
        const errorMsg = String(err);
        let friendlyMessage = `Failed to start camera: ${errorMsg}`;
        if (errorMsg.includes("NotFoundError") || errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) {
            friendlyMessage = "Camera not found or permission denied. Please check browser settings and allow camera access.";
        } else if (errorMsg.includes("OverconstrainedError")) {
            friendlyMessage = "Cannot access camera. It might be in use or resolution not supported.";
        }
        console.error("Scanner start error:", friendlyMessage, err);
        setScannerError(friendlyMessage);
        sonnerToast.error(friendlyMessage);
        setIsScannerActive(false);
        if (html5QrCodeInstanceRef.current) {
            Promise.resolve(html5QrCodeInstanceRef.current.clear())
                .catch(e => console.warn("Failed to clear scanner after start error:", e))
                .finally(() => { html5QrCodeInstanceRef.current = null; });
        }
      });

    } else { 
      if (html5QrCodeInstanceRef.current && html5QrCodeInstanceRef.current.isScanning) {
        const scannerToStop = html5QrCodeInstanceRef.current;
        scannerToStop.stop()
          .then(() => { console.log("Scanner explicitly stopped via button/state change."); })
          .catch((err) => { console.error("Failed to stop scanner explicitly:", err); })
          .finally(() => {
            Promise.resolve(scannerToStop.clear())
              .catch(e => console.warn("Failed to clear scanner after explicit stop:", e))
              .finally(() => {
                if(html5QrCodeInstanceRef.current === scannerToStop) {
                    html5QrCodeInstanceRef.current = null;
                }
              });
          });
      } else if (html5QrCodeInstanceRef.current && !html5QrCodeInstanceRef.current.isScanning) {
        Promise.resolve(html5QrCodeInstanceRef.current.clear())
            .catch(e => console.warn("Failed to clear non-scanning scanner instance:", e))
            .finally(() => { html5QrCodeInstanceRef.current = null; });
      }
    }

    return () => {
      const scannerToClean = html5QrCodeInstanceRef.current;
      if (scannerToClean) {
        html5QrCodeInstanceRef.current = null; 

        if (scannerToClean.isScanning) {
          scannerToClean.stop()
            .then(() => {
              console.log("Scanner stopped on cleanup (unmount/dependency change).");
              Promise.resolve(scannerToClean.clear()) 
                .catch(e => console.warn("Scanner clear failed (after successful stop during cleanup):", e));
            })
            .catch(err => {
              console.error("Cleanup: Failed to stop scanner (unmount/dependency change)", err);
              Promise.resolve(scannerToClean.clear()) 
                .catch(e => console.warn("Scanner clear failed (after stop attempt failed during cleanup):", e));
            });
        } else {
          Promise.resolve(scannerToClean.clear())
            .catch(e => console.warn("Scanner clear failed (was not scanning during cleanup):", e));
        }
      }
    };
  }, [isScannerActive]);

  const toggleCameraScanner = () => {
    if (isScannerActive) {
      setIsScannerActive(false); 
    } else {
      setError(null);
      setScannerError(null);
      setIsScannerActive(true); 
    }
  };

  const parseBarcode = (fullBarcode: string): { articleNo: string; weightGrams: number } | null => {
    if (fullBarcode.length >= 21) {
        const articlePart = fullBarcode.substring(7, 16);
        const weightPart = fullBarcode.substring(16, 21);
        const articleNo = articlePart;
        const weightGrams = parseInt(weightPart);
        if (!isNaN(weightGrams) && articleNo) {
            return { articleNo, weightGrams };
        }
    }
    setError("Invalid barcode format or length.");
    sonnerToast.error("Invalid barcode format or length. Expected 21+ digits.");
    return null;
  };

  const handleBarcodeSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    const currentBarcodeValue = barcode.trim();
    if (!currentBarcodeValue) {
      setError("Barcode cannot be empty.");
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
      barcodeInputRef.current?.focus();
      return;
    }
    const { articleNo, weightGrams } = parsed;

    try {
      // Ensure /api/products/lookup returns data matching the new ScannedItemDetails interface
      const response = await fetch("/api/products/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleNo, weightGrams }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to lookup item");
      }
      const data: ScannedItemDetails = await response.json(); // Expects new structure
      setScannedItem(data);
      setOriginalScannedBarcode(currentBarcodeValue);
      sonnerToast.success(`Item Found: ${data.articleName}`);
    } catch (err: any) {
      setError(err.message || "An error occurred.");
      sonnerToast.error(err.message || "Error looking up item.");
      setScannedItem(null);
    } finally {
      setIsLoading(false);
      barcodeInputRef.current?.focus();
    }
  };

  const handleConfirmSale = async () => {
    if (!scannedItem || !user?.id || !originalScannedBarcode) {
      sonnerToast.error("No item scanned, user not identified, or original barcode missing.");
      return;
    }
    setIsConfirmingSale(true);
    setIsLoading(false); // Should be false when confirming sale starts, true during the async operation
    setError(null);

    // MODIFIED: Prepare payload with all product details, prefixed
    const salePayload = {
      barcodeScanned: originalScannedBarcode,
      staffId: user.id,
      
      // Transaction-specific fields (weight, calculated price)
      weightGrams: scannedItem.weightGrams,
      calculatedSellPrice: scannedItem.calculatedSellPrice,
      
      // Main product identifier for the transaction (maps to existing 'articleNo' field in salesTransaction)
      articleNo: scannedItem.articleNumber, 
      
      // Snapshot of product data, prefixed
      // This includes articleNumber from the product again, under a prefixed name
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
        body: JSON.stringify(salePayload), // Send the more detailed payload
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to record sale");
      }
      sonnerToast.success(
        `Sale Confirmed: ${scannedItem.articleName} by ${user.name}`
      );
      setScannedItem(null);
      setOriginalScannedBarcode("");
      setBarcode("");
    } catch (err: any) {
      setError(err.message || "An error occurred during sale confirmation.");
      sonnerToast.error(err.message || "Error confirming sale.");
    } finally {
      setIsConfirmingSale(false);
      barcodeInputRef.current?.focus();
    }
  };

  const handleLogout = () => {
    logout();
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
            Welcome, {user.name}! Scan or type the barcode.
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
              <div className="my-2 p-2 border rounded-md bg-gray-100 shadow-inner">
                <div id={BARCODE_SCANNER_REGION_ID} style={{ width: "100%", minHeight: "150px" }}></div>
              </div>
            )}
            {scannerError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 p-3 rounded-md">
                <XCircle className="h-5 w-5 flex-shrink-0" />
                <p>{scannerError}</p>
              </div>
            )}
          </div>

          <form onSubmit={handleBarcodeSubmit} className="space-y-2">
            <Label htmlFor="barcode-input">Barcode</Label>
            <Input
              id="barcode-input"
              ref={barcodeInputRef}
              type="text"
              inputMode="numeric"
              placeholder="Scan or type barcode..."
              value={barcode}
              onChange={(e) => {
                setBarcode(e.target.value);
                if (scannedItem && e.target.value !== originalScannedBarcode) {
                    setScannedItem(null);
                    setOriginalScannedBarcode("");
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
              {isLoading && !scannedItem ? (
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
                <p><strong>Original Barcode:</strong> {originalScannedBarcode}</p>
                {/* MODIFIED: Display articleNumber from the new interface */}
                <p><strong>Article No:</strong> {scannedItem.articleNumber}</p>
                <p><strong>Weight:</strong> {scannedItem.weightGrams}g</p>
                {/* You can add more product details here if needed for display */}
                {/* e.g., <p><strong>POS Desc:</strong> {scannedItem.posDescription}</p> */}
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
            <Button variant="secondary" className="flex-1" onClick={() => router.push('/vendor/sales-history')}>
              Daily Sales Dashboard
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => router.push('/vendor/returns')}>
              Manage Returns
            </Button>
          </div>
        </CardFooter>
      </Card>
    </main>
  );
}