// src/app/(manager)/(protected)/stock/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/context/UserContext'; // To get recordedBy
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PackagePlus, Warehouse, RefreshCcw, Wrench } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';

// interface StockStatusItem {
//   articleNo: string;
//   articleName?: string;
//   openingStockKg: number;
//   openingStockDate?: string;
//   totalSoldKg: number;
//   totalReturnedKg: number;
//   calculatedCurrentStockKg: number;
// }

// interface ProductSelectItem { // For product dropdown
//     id: string;
//     name: string;
// }

export default function StockStatusPage() {
  // const { user } = useUser(); // For recordedBy
  // const [stockStatusData, setStockStatusData] = useState<StockStatusItem[]>([]);
  // const [productsForSelect, setProductsForSelect] = useState<ProductSelectItem[]>([]);
  // const [isLoading, setIsLoading] = useState(true);
  // const [isSubmitting, setIsSubmitting] = useState(false);
  // const [error, setError] = useState<string | null>(null);

  // const [stockEventForm, setStockEventForm] = useState({
  //   articleNo: '',
  //   type: 'OPENING_STOCK',
  //   quantityKg: '',
  //   eventDate: new Date().toISOString().split('T')[0], // Default to today
  //   notes: '',
  // });

  // // Fetch Product List for Select Dropdown
  // const fetchProductsForSelect = useCallback(async () => {
  //   try {
  //       const response = await fetch('/api/manager/products-list'); // Create this simple API
  //       if(!response.ok) throw new Error('Failed to fetch products');
  //       const data = await response.json();
  //       setProductsForSelect(data.map((p: any) => ({ id: p.id, name: p.name || p.id })));
  //       if (data.length > 0) {
  //           setStockEventForm(prev => ({...prev, articleNo: data[0].id}));
  //       }
  //   } catch (err: any) {
  //       sonnerToast.error("Failed to load products for dropdown: " + err.message);
  //   }
  // }, []);


  // const fetchStockStatus = useCallback(async () => {
  //   setIsLoading(true);
  //   setError(null);
  //   try {
  //     const response = await fetch('/api/manager/stock-status');
  //     if (!response.ok) {
  //       const errData = await response.json();
  //       throw new Error(errData.message || errData.details || 'Failed to fetch stock status');
  //     }
  //     const data: StockStatusItem[] = await response.json();
  //     setStockStatusData(data);
  //   } catch (err: any) {
  //     setError(err.message);
  //     setStockStatusData([]);
  //     sonnerToast.error(err.message);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // }, []);

  // useEffect(() => {
  //   fetchProductsForSelect();
  //   fetchStockStatus();
  // }, [fetchStockStatus, fetchProductsForSelect]);

  // const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  //   const { name, value } = e.target;
  //   setStockEventForm(prev => ({ ...prev, [name]: value }));
  // };
  //  const handleSelectChange = (name: string, value: string) => {
  //   setStockEventForm(prev => ({ ...prev, [name]: value }));
  // };


  // const handleSubmitStockEvent = async (e: React.FormEvent<HTMLFormElement>) => {
  //   e.preventDefault();
  //   if (!user?.id) {
  //       sonnerToast.error("User not identified. Please re-login.");
  //       return;
  //   }
  //   if (!stockEventForm.articleNo || !stockEventForm.type || !stockEventForm.quantityKg || !stockEventForm.eventDate) {
  //       sonnerToast.error("Please fill all required fields for stock event.");
  //       return;
  //   }
  //   setIsSubmitting(true);
  //   try {
  //     const response = await fetch('/api/manager/stock-events', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ ...stockEventForm, quantityKg: parseFloat(stockEventForm.quantityKg), recordedBy: user.id }),
  //     });
  //     if (!response.ok) {
  //       const errData = await response.json();
  //       throw new Error(errData.message || errData.details || 'Failed to add stock event');
  //     }
  //     sonnerToast.success('Stock event added successfully!');
  //     setStockEventForm({ // Reset form
  //       articleNo: productsForSelect.length > 0 ? productsForSelect[0].id : '',
  //       type: 'OPENING_STOCK',
  //       quantityKg: '',
  //       eventDate: new Date().toISOString().split('T')[0],
  //       notes: '',
  //     });
  //     fetchStockStatus(); // Refresh stock status table
  //   } catch (err: any) {
  //     sonnerToast.error("Error adding stock event: " + err.message);
  //   } finally {
  //     setIsSubmitting(false);
  //   }
  // };

  return (
    <>
      <Toaster richColors position="top-right" />
      {/* Add Stock Event Form */}
      {/* <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5" /> Add Stock Event</CardTitle>
          <CardDescription>Record opening stock, received stock, or adjustments.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitStockEvent} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="articleNo">Product (Article No)</Label>
              <Select name="articleNo" value={stockEventForm.articleNo} onValueChange={(value) => handleSelectChange('articleNo', value)} required>
                <SelectTrigger id="articleNo"><SelectValue placeholder="Select Product" /></SelectTrigger>
                <SelectContent>
                    {productsForSelect.length === 0 && <SelectItem value="" disabled>Loading products...</SelectItem>}
                    {productsForSelect.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.id})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="type">Event Type</Label>
              <Select name="type" value={stockEventForm.type} onValueChange={(value) => handleSelectChange('type', value)} required>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPENING_STOCK">Opening Stock</SelectItem>
                  <SelectItem value="STOCK_RECEIVED">Stock Received</SelectItem>
                  <SelectItem value="ADJUSTMENT_ADD">Adjustment (Add)</SelectItem>
                  <SelectItem value="ADJUSTMENT_SUBTRACT">Adjustment (Subtract)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="quantityKg">Quantity (kg)</Label>
              <Input type="number" id="quantityKg" name="quantityKg" step="0.001" value={stockEventForm.quantityKg} onChange={handleFormChange} required />
            </div>
            <div>
              <Label htmlFor="eventDate">Event Date</Label>
              <Input type="date" id="eventDate" name="eventDate" value={stockEventForm.eventDate} onChange={handleFormChange} required />
            </div>
            <div className="md:col-span-2 lg:col-span-full">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea id="notes" name="notes" value={stockEventForm.notes} onChange={handleFormChange} />
            </div>
            <Button type="submit" disabled={isSubmitting} className="md:col-start-1 lg:col-start-1">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-2 h-4 w-4" />}
              Add Event
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle className="flex items-center gap-2"><Warehouse className="h-5 w-5"/> Current Stock Status</CardTitle>
                <CardDescription>Calculated stock based on events and sales transactions.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchStockStatus} disabled={isLoading}>
                <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}/>
            </Button>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" /> <p className="ml-2">Loading stock status...</p>
            </div>
          )}
          {error && !isLoading && <p className="text-red-500 text-center py-10">Error: {error}</p>}
          
          {!isLoading && !error && (
            <>
              {stockStatusData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Article Name</TableHead>
                      <TableHead>Article No</TableHead>
                      <TableHead className="text-right">Opening Stock (kg)</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">As Of</TableHead>
                      <TableHead className="text-right">Total Sold (kg)</TableHead>
                      <TableHead className="text-right">Total Returned (kg)</TableHead>
                      <TableHead className="text-right font-semibold">Current Stock (kg)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockStatusData.map((item) => (
                      <TableRow key={item.articleNo} className={item.calculatedCurrentStockKg < 0 ? 'bg-red-50 hover:bg-red-100' : (item.calculatedCurrentStockKg < (item.openingStockKg * 0.1) && item.openingStockKg > 0 ? 'bg-yellow-50 hover:bg-yellow-100' : '')}>
                        <TableCell className="font-medium">{item.articleName || 'N/A'}</TableCell>
                        <TableCell>{item.articleNo}</TableCell>
                        <TableCell className="text-right">{item.openingStockKg.toFixed(3)}</TableCell>
                        <TableCell className="text-center hidden sm:table-cell text-xs">{item.openingStockDate ? new Date(item.openingStockDate  + 'T00:00:00').toLocaleDateString() : 'N/A'}</TableCell>
                        <TableCell className="text-right text-red-600">-{item.totalSoldKg.toFixed(3)}</TableCell>
                        <TableCell className="text-right text-green-600">+{item.totalReturnedKg.toFixed(3)}</TableCell>
                        <TableCell className="text-right font-semibold">{item.calculatedCurrentStockKg.toFixed(3)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-gray-500 py-10">No stock data available. Add products and stock events.</p>
              )}
            </>
          )}
        </CardContent>
      </Card> */}
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] p-4 md:p-8"> {/* Adjusted min-height */}
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-4">
              <Wrench className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-semibold">
              Stock Management - Under Construction
            </CardTitle>
            <CardDescription className="mt-2 text-muted-foreground">
              We're currently working hard to bring you a comprehensive stock management system.
              This page will soon allow you to track inventory, manage stock events, and view detailed status reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-4">
            <p className="text-sm text-muted-foreground">
              Please check back later for updates. Thank you for your patience!
            </p>
            <div className="mt-6">
              <Button variant="outline" onClick={() => window.location.href = '/manager/protected/dashboard'}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="mt-8 flex items-center text-sm text-muted-foreground">
          <Warehouse className="mr-2 h-4 w-4" />
          <span>Inventory & Stock Control Feature</span>
        </div>
      </div>
    </>
  );
}