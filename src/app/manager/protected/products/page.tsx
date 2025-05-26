// src/app/manager/protected/prodcuts/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Loader2, PlusCircle, Edit2, Trash2, PackageSearch, RefreshCcw, UploadCloud, AlertTriangle, CheckCircle2, Search, Info } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

// Define the fixed fields configuration
// className now includes text-xs for table cells
const FIXED_PRODUCT_FIELDS_CONFIG = [
  { name: 'articleNumber', label: 'Article Number (ID)', type: 'text', required: true, placeholder: "e.g., 600038818", className: "min-w-[140px] text-xs" },
  { name: 'articleName', label: 'Article Name', type: 'text', required: true, placeholder: "e.g., SD KISMISS GREEN INDIAN LOOSE", className: "min-w-[220px] text-xs" },
  { name: 'posDescription', label: 'POS Description', type: 'text', required: false, placeholder: "e.g., KISMISS GREEN INDIAN", className: "min-w-[180px] text-xs" },
  { name: 'metlerCode', label: 'Metler Code', type: 'text', required: false, placeholder: "e.g., 86239", className: "min-w-[110px] text-xs" },
  { name: 'hsnCode', label: 'HSN Code', type: 'text', required: false, placeholder: "e.g., 8062010", className: "min-w-[110px] text-xs" },
  { name: 'taxPercentage', label: 'Tax %', type: 'number', required: false, placeholder: "e.g., 5", step: "0.01", className: "min-w-[90px] text-right text-xs" },
  { name: 'purchasePricePerKg', label: 'Purchase Price/Kg (₹)', type: 'number', required: false, placeholder: "e.g., 236", step: "0.01", className: "min-w-[150px] text-right text-xs" },
  { name: 'sellingRatePerKg', label: 'Selling Rate/Kg (₹)', type: 'number', required: false, placeholder: "e.g., 449", step: "0.01", className: "min-w-[150px] text-right text-xs" },
  { name: 'mrpPer100g', label: 'MRP/100g (₹)', type: 'number', required: false, placeholder: "e.g., 44.9", step: "0.01", className: "min-w-[130px] text-right text-xs" },
  { name: 'remark', label: 'Remark', type: 'textarea', required: false, placeholder: "e.g., SET 1", className: "min-w-[180px] text-xs" },
];

interface Product {
  id: string; 
  articleNumber: string;
  articleName: string;
  posDescription?: string | null;
  metlerCode?: string | null;
  hsnCode?: string | null;
  taxPercentage?: number | null;
  purchasePricePerKg?: number | null;
  sellingRatePerKg?: number | null;
  mrpPer100g?: number | null;
  remark?: string | null;
  createdAt?: any; 
  updatedAt?: any; 
  _isDeleting?: boolean; 
}

type ProductFormData = {
  [key: string]: string; 
};

const initialProductFormData: ProductFormData = FIXED_PRODUCT_FIELDS_CONFIG.reduce((acc, field) => {
  acc[field.name] = '';
  return acc;
}, {} as ProductFormData);

interface BulkProductItem {
  articleNumber: string; 
  articleName: string; 
  [key: string]: any; 
}

interface BulkAddPreview {
  totalProducts: number;
  validProductsForUpload: BulkProductItem[]; 
  errors: { index: number; message: string; articleNumber?: string }[];
}

export default function ProductManagementPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null); 
  const [productForm, setProductForm] = useState<ProductFormData>(initialProductFormData);

  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [bulkJsonInput, setBulkJsonInput] = useState('');
  const [bulkAddPreview, setBulkAddPreview] = useState<BulkAddPreview | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/manager/products');
      if (!response.ok) throw new Error('Failed to fetch products');
      const data: Product[] = await response.json();
      const processedData = data.map(p => ({...p, articleNumber: p.articleNumber || p.id }));
      setProducts(processedData.sort((a, b) => (a.articleName || "").localeCompare(b.articleName || "")));
    } catch (err: any) {
      setError(err.message);
      sonnerToast.error("Error fetching products: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProducts(products);
      return;
    }
    const lowercasedQuery = searchQuery.toLowerCase();
    const filtered = products.filter(product =>
      (product.articleName?.toLowerCase().includes(lowercasedQuery)) ||
      (product.id?.toLowerCase().includes(lowercasedQuery)) 
    );
    setFilteredProducts(filtered);
  }, [searchQuery, products]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target; 
    setProductForm(prev => ({
      ...prev,
      [name]: value, 
    }));
  };
  
  const openAddModal = () => {
    setEditingProduct(null);
    setProductForm(initialProductFormData); 
    setIsProductModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    const formState: ProductFormData = { ...initialProductFormData }; 
    
    FIXED_PRODUCT_FIELDS_CONFIG.forEach(field => {
        const key = field.name as keyof Product;
        let valueToSet = product[key];

        if (field.name === 'articleNumber' && !valueToSet) {
            valueToSet = product.id; 
        }

        if (valueToSet !== null && valueToSet !== undefined) {
            formState[field.name] = String(valueToSet);
        } else {
            formState[field.name] = ''; 
        }
    });

    setProductForm(formState);
    setIsProductModalOpen(true);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Are you sure you want to delete product "${product.articleName}" (ID: ${product.id})? This action cannot be undone.`)) {
      return;
    }
    const submittingProductId = product.id; 
    setProducts(prev => prev.map(p => p.id === submittingProductId ? {...p, _isDeleting: true} : p));

    try {
      const response = await fetch(`/api/manager/products/${product.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to delete product');
      }
      sonnerToast.success(`Product "${product.articleName}" (ID: ${product.id}) deleted successfully!`);
      fetchProducts(); 
    } catch (err: any) {
      sonnerToast.error("Error deleting product: " + err.message);
      setProducts(prev => prev.map(p => p.id === submittingProductId ? {...p, _isDeleting: false} : p));
    }
  };
  
  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const finalArticleNumber = String(productForm.articleNumber || '').trim();
    const finalArticleName = String(productForm.articleName || '').trim();

    if (!finalArticleNumber) {
      sonnerToast.error("Article Number (Product ID) is required.");
      setIsSubmitting(false);
      return;
    }
    if (!finalArticleName) {
      sonnerToast.error("Article Name is required.");
      setIsSubmitting(false);
      return;
    }
        
    const payload: { [key: string]: any } = {};

    FIXED_PRODUCT_FIELDS_CONFIG.forEach(fieldConf => {
        const formValue = productForm[fieldConf.name];
        if (fieldConf.name === 'articleNumber') {
            payload.articleNumber = finalArticleNumber; // This will be the new ID if changed
            return;
        }
        if (fieldConf.name === 'articleName') {
            payload.articleName = finalArticleName;
            return;
        }

        if (formValue === undefined || formValue === null || String(formValue).trim() === '') {
            payload[fieldConf.name] = null;
        } else if (fieldConf.type === 'number') {
            const num = parseFloat(String(formValue));
            if (isNaN(num)) {
                sonnerToast.error(`Invalid number format for ${fieldConf.label}. Please enter a valid number or leave it empty.`);
                setIsSubmitting(false); 
                throw new Error(`Invalid number for ${fieldConf.label}`); 
            }
            payload[fieldConf.name] = num;
        } else {
            payload[fieldConf.name] = String(formValue).trim();
        }
    });
        
    let url: string;
    let method: 'POST' | 'PUT';

    if (editingProduct) { 
        method = 'PUT';
        url = `/api/manager/products/${editingProduct.id}`; // Original ID in URL
        if (finalArticleNumber !== editingProduct.id) {
            // Backend will use payload.articleNumber as the new ID if different from URL param
            // and also as the new value for the articleNumber field in the document.
            // Sending newArticleNumber in payload is still a good explicit signal for ID change if backend specifically looks for it.
            payload.newArticleNumber = finalArticleNumber; 
        }
    } else { 
        method = 'POST';
        url = '/api/manager/products';
        // payload.articleNumber will be used as doc ID by backend
    }

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const responseBody = await response.json(); 

        if (!response.ok) {
            throw new Error(responseBody.message || (editingProduct ? 'Failed to update product' : 'Failed to create product'));
        }
        sonnerToast.success(responseBody.message || `Product ${editingProduct ? 'updated' : 'created'} successfully!`);
        
        setIsProductModalOpen(false);
        fetchProducts(); 
    } catch (err: any) {
        if (!err.message?.startsWith("Invalid number for")) {
            sonnerToast.error(err.message);
        }
    } finally {
        setIsSubmitting(false);
    }
  };

  const openBulkAddModal = () => {
    setBulkJsonInput(
`[
  {
    "articleNumber": "600038818",
    "articleName": "SD KISMISS GREEN INDIAN LOOSE",
    "posDescription": "KISMISS GREEN INDIAN",
    "metlerCode": "86239",
    "hsnCode": "8062010",
    "taxPercentage": "5",
    "purchasePricePerKg": "236",
    "sellingRatePerKg": "449",
    "mrpPer100g": "44.9",
    "remark": "SET 1 - From Bulk Add"
  },
  {
    "articleNumber": "600038819",
    "articleName": "CALIFORNIA ALMONDS JUMBO",
    "posDescription": "ALMONDS CAL JUMBO",
    "metlerCode": "12345",
    "hsnCode": "08021100",
    "taxPercentage": "12",
    "purchasePricePerKg": "600",
    "sellingRatePerKg": "999",
    "mrpPer100g": "99.9",
    "remark": "New stock"
  }
]`);
    setBulkAddPreview(null);
    setIsBulkProcessing(false);
    setIsBulkAddModalOpen(true);
  };

  const handleParseAndValidateBulkJson = () => {
    setBulkAddPreview(null); 
    setIsBulkProcessing(true);
    let parsedData: any[];
    try {
      parsedData = JSON.parse(bulkJsonInput);
      if (!Array.isArray(parsedData)) {
        throw new Error("Input must be a JSON array of product objects.");
      }
    } catch (e: any) {
      const errorMessage = "Invalid JSON: " + e.message;
      sonnerToast.error(errorMessage);
      setBulkAddPreview({ totalProducts: 0, validProductsForUpload: [], errors: [{ index: -1, message: errorMessage }] });
      setIsBulkProcessing(false);
      return;
    }

    const preview: BulkAddPreview = {
      totalProducts: parsedData.length,
      validProductsForUpload: [],
      errors: [],
    };
    const articleNumbersInBatch = new Set<string>();

    parsedData.forEach((item, index) => {
      let currentItemValid = true;
      if (typeof item !== 'object' || item === null) {
        preview.errors.push({ index, message: "Item is not a valid object." });
        return; 
      }
      const { articleNumber, articleName } = item;

      if (!articleNumber || typeof articleNumber !== 'string' || String(articleNumber).trim() === '') {
        preview.errors.push({ index, message: "Missing or invalid 'articleNumber'.", articleNumber: String(articleNumber || `Item ${index+1}`)});
        currentItemValid = false;
      } else if (articleNumbersInBatch.has(String(articleNumber).trim())) {
        preview.errors.push({ index, message: `Duplicate 'articleNumber': ${articleNumber}.`, articleNumber: String(articleNumber).trim() });
        currentItemValid = false; 
      } else {
        articleNumbersInBatch.add(String(articleNumber).trim());
      }
      if (!articleName || typeof articleName !== 'string' || String(articleName).trim() === '') {
        preview.errors.push({ index, message: "Missing or invalid 'articleName'.", articleNumber: String(articleNumber) });
        currentItemValid = false;
      }
      if (!currentItemValid) return;

      const productDataForUpload: BulkProductItem = { 
        articleNumber: String(articleNumber).trim(), 
        articleName: String(articleName).trim() 
      };
      FIXED_PRODUCT_FIELDS_CONFIG.forEach(fieldConf => {
        if (fieldConf.name === 'articleNumber' || fieldConf.name === 'articleName') return;
        const key = fieldConf.name;
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          const value = item[key];
          if (value === null || value === undefined || String(value).trim() === '') {
            productDataForUpload[key] = null;
          } else if (fieldConf.type === 'number') {
            const num = parseFloat(String(value));
            if (isNaN(num)) {
              preview.errors.push({ index, message: `Invalid number for '${key}': ${value}`, articleNumber: String(articleNumber) });
              currentItemValid = false; productDataForUpload[key] = null; 
            } else { productDataForUpload[key] = num; }
          } else { productDataForUpload[key] = String(value).trim(); }
        } else { productDataForUpload[key] = null; }
      });
      if (currentItemValid) { preview.validProductsForUpload.push(productDataForUpload); }
    });
    setBulkAddPreview(preview);
    setIsBulkProcessing(false);
    if (preview.errors.length > 0) {
        sonnerToast.warning(`Found ${preview.errors.length} issue(s). Review below.`);
    } else if (preview.validProductsForUpload.length > 0) {
        sonnerToast.success(`${preview.validProductsForUpload.length} products parsed successfully.`);
    } else if (parsedData.length > 0) {
        sonnerToast.error("No valid products found after validation.");
    } else { sonnerToast.info("No products in JSON data."); }
  };

  const handleBulkSubmit = async () => {
    if (!bulkAddPreview || bulkAddPreview.validProductsForUpload.length === 0) {
      sonnerToast.error("No valid products to submit."); return;
    }
    if (!confirm(`Add ${bulkAddPreview.validProductsForUpload.length} products?`)) { return; }
    setIsBulkProcessing(true);
    try {
      const response = await fetch('/api/manager/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkAddPreview.validProductsForUpload),
      });
      const result = await response.json();
      if (!response.ok && response.status !== 207) { throw new Error(result.message || "Bulk add failed."); }
      let successCount = 0, failureCount = 0;
      if (result.results && Array.isArray(result.results)) { 
        result.results.forEach((item: {articleNumber: string, success: boolean, message?: string}) => {
            if (item.success) successCount++;
            else { failureCount++; sonnerToast.error(`Failed for ${item.articleNumber}: ${item.message || 'Unknown'}`); }
        });
      } else if (response.ok) { successCount = bulkAddPreview.validProductsForUpload.length; }
      sonnerToast.success(`${result.message || `${successCount} products processed.`} ${failureCount > 0 ? `${failureCount} failed.` : ''}`);
      if (successCount > 0) {
        fetchProducts(); setIsBulkAddModalOpen(false); 
        setBulkJsonInput('[\n  {\n    "articleNumber": "PROD001",\n    "articleName": "Sample 1",\n    "sellingRatePerKg": "100"\n  }\n]');
        setBulkAddPreview(null);
      }
    } catch (err: any) { sonnerToast.error("Bulk submit error: " + err.message);
    } finally { setIsBulkProcessing(false); }
  };

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex flex-wrap items-center gap-2"> 
            <Button onClick={openAddModal}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Product
            </Button>
            <Button onClick={openBulkAddModal} variant="outline">
                <UploadCloud className="mr-2 h-4 w-4" /> Bulk Add
            </Button>
            <Button variant="outline" onClick={fetchProducts} disabled={isLoading}>
                <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <div className="relative flex items-center">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search Name or Article No..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-2 h-9 w-full sm:w-auto md:min-w-[250px]" 
                />
            </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PackageSearch className="h-5 w-5"/> Product List</CardTitle>
          <CardDescription>
            Manage your products. All fields are displayed. Table is horizontally scrollable.
            <br className="hidden sm:block"/>
            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Info size={14} /> For optimal viewing, adjust browser zoom to 50% (Ctrl + '-'/'+').
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">Loading products...</p>
            </div>
          )}
          {error && !isLoading && <p className="text-destructive text-center py-10">Error: {error}</p>}
          
          {!isLoading && !error && (
            <>
              {products.length > 0 ? (
                filteredProducts.length > 0 ? (
                  <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table className="text-xs"> {/* Apply base text-xs to table */}
                      <TableHeader>
                        <TableRow>
                          {FIXED_PRODUCT_FIELDS_CONFIG.map(field => (
                            <TableHead key={field.name} className={`${field.className || ''} py-2 px-3`}>
                              {field.label}
                            </TableHead>
                          ))}
                          <TableHead className="text-center min-w-[110px] py-2 px-3 text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProducts.map((product) => (
                          <TableRow key={product.id} className={`${product._isDeleting ? "opacity-50" : ""} hover:bg-muted/50`}>
                            {FIXED_PRODUCT_FIELDS_CONFIG.map(fieldConf => {
                              const value = product[fieldConf.name as keyof Product];
                              let displayValue: React.ReactNode = '-';
                              
                              if (value !== undefined && value !== null && String(value).trim() !== '') {
                                if (fieldConf.type === 'number' && typeof value === 'number') {
                                    if (fieldConf.name.toLowerCase().includes('price') || fieldConf.name.toLowerCase().includes('rate') || fieldConf.name.toLowerCase().includes('mrp')) {
                                      displayValue = `₹${value.toFixed(2)}`;
                                    } else if (fieldConf.name.toLowerCase().includes('percentage')) {
                                      displayValue = `${value.toFixed(fieldConf.step === "0.01" ? 2 : 0)}%`;
                                    } else {
                                      displayValue = value.toString();
                                    }
                                } else {
                                   displayValue = String(value);
                                }
                              }
                              return (
                                <TableCell key={fieldConf.name} className={`${fieldConf.className || ''} py-2 px-3`}>
                                  {displayValue}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center space-x-1 py-1.5 px-3"> {/* Reduced py for denser action buttons */}
                              <Button variant="outline" size="sm" onClick={() => openEditModal(product)} title="Edit Product" disabled={product._isDeleting || isSubmitting} className="h-7 px-2"> {/* Smaller buttons */}
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm" 
                                onClick={() => handleDeleteProduct(product)} 
                                title="Delete Product" 
                                disabled={product._isDeleting || (isSubmitting && editingProduct?.id === product.id)}
                                className="h-7 px-2" // Smaller buttons
                              >
                                {product._isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  <p className="text-center text-muted-foreground py-10">
                    No products found matching: "{searchQuery}".
                  </p>
                )
              ) : (
                <p className="text-center text-muted-foreground py-10">
                  No products found. Add a new product or use Bulk Add.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Product Dialog */}
      <Dialog open={isProductModalOpen} onOpenChange={setIsProductModalOpen}>
        <DialogContent className="sm:max-w-[625px] max-h-[90vh]">
          <ScrollArea className="max-h-[85vh] p-1">
            <DialogHeader className="px-6 pt-6">
              <DialogTitle>{editingProduct ? `Edit Product: ${productForm.articleName || editingProduct.articleName}` : 'Add New Product'}</DialogTitle>
              <DialogDescription>
                {editingProduct ? `Update details for Article Number: ${editingProduct.id}.` : 'Enter details for the new product.'}
                {' Fields marked with * are required.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleFormSubmit} className="grid gap-4 py-4 px-6">
              {FIXED_PRODUCT_FIELDS_CONFIG.map(field => (
                <div key={field.name} className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor={field.name} className="text-right col-span-1">
                    {field.label} {field.required && '*'}
                  </Label>
                  {field.type === 'textarea' ? (
                    <Textarea
                      id={field.name}
                      name={field.name}
                      value={productForm[field.name] || ''}
                      onChange={handleInputChange}
                      className="col-span-3"
                      placeholder={field.placeholder}
                      required={field.required}
                      rows={2}
                    />
                  ) : (
                    <Input
                      id={field.name}
                      name={field.name}
                      type={field.type} 
                      value={productForm[field.name] || ''}
                      onChange={handleInputChange}
                      className="col-span-3"
                      placeholder={field.placeholder}
                      required={field.required}
                      step={field.step || (field.type === 'number' ? 'any' : undefined)}
                      // Article Number field is editable for ID change during edit
                    />
                  )}
                </div>
              ))}
              <DialogFooter className="mt-6">
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingProduct ? 'Save Changes' : 'Create Product'}
                </Button>
              </DialogFooter>
            </form>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Products Dialog */}
      <Dialog open={isBulkAddModalOpen} onOpenChange={(isOpen) => {
          setIsBulkAddModalOpen(isOpen);
          if (!isOpen) { 
              setBulkJsonInput('[\n  {\n    "articleNumber": "PROD001",\n    "articleName": "Sample Product 1",\n    "sellingRatePerKg": "100.50"\n  }\n]');
              setBulkAddPreview(null);
          }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Bulk Add Products</DialogTitle>
                <DialogDescription>
                    Paste a JSON array of product objects. Each object must have `articleNumber` and `articleName`.
                    Other fields are optional and default to null if not provided.
                </DialogDescription>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-4 py-4 flex-grow overflow-hidden">
                <div className="flex flex-col">
                    <Label htmlFor="bulkJsonInput" className="mb-1">JSON Input</Label>
                    <Textarea
                        id="bulkJsonInput"
                        value={bulkJsonInput}
                        onChange={(e) => setBulkJsonInput(e.target.value)}
                        placeholder='[{"articleNumber": "ID1", "articleName": "Name1", ...}, ...]'
                        className="flex-grow font-mono text-xs resize-none min-h-[300px] md:min-h-0"
                    />
                </div>
                <div className="flex flex-col">
                    <Label className="mb-1">Preview & Validation</Label>
                    <ScrollArea className="border rounded-md p-3 bg-muted/40 flex-grow min-h-[300px] md:min-h-0">
                        {isBulkProcessing && !bulkAddPreview && <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin" /> <span className="ml-2">Processing...</span></div>}
                        {!isBulkProcessing && !bulkAddPreview && <p className="text-sm text-muted-foreground">Click "Parse & Validate JSON".</p>}
                        {!isBulkProcessing && bulkAddPreview && (
                            <div>
                                <p className="text-sm">Items in JSON: {bulkAddPreview.totalProducts}</p>
                                <p className={`text-sm ${bulkAddPreview.validProductsForUpload.length > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                                    <CheckCircle2 className="inline h-4 w-4 mr-1"/>
                                    Valid for upload: {bulkAddPreview.validProductsForUpload.length}
                                </p>
                                {bulkAddPreview.errors.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-sm text-red-600 font-semibold">
                                            <AlertTriangle className="inline h-4 w-4 mr-1"/>
                                            Errors ({bulkAddPreview.errors.length}):
                                        </p>
                                        <ul className="list-disc list-inside text-xs max-h-60 overflow-y-auto">
                                            {bulkAddPreview.errors.map((err, i) => (
                                                <li key={i} className="text-red-700">
                                                    {err.articleNumber ? `ID "${err.articleNumber}" (Item ${err.index + 1})` : `Item ${err.index + 1}`}: {err.message}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {bulkAddPreview.validProductsForUpload.length > 0 && bulkAddPreview.errors.length === 0 && (
                                    <p className="text-sm text-green-600 mt-2">All products valid.</p>
                                )}
                                {bulkAddPreview.validProductsForUpload.length > 0 && (
                                     <details className="mt-2 text-xs">
                                        <summary>View Valid ({bulkAddPreview.validProductsForUpload.length})</summary>
                                        <pre className="mt-1 p-2 bg-background border rounded text-[10px] max-h-60 overflow-auto">
                                            {JSON.stringify(bulkAddPreview.validProductsForUpload, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={handleParseAndValidateBulkJson} disabled={isBulkProcessing || !bulkJsonInput.trim()}>
                    {isBulkProcessing && !bulkAddPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    Parse & Validate
                </Button>
                <DialogClose asChild>
                    <Button type="button" variant="ghost">Cancel</Button>
                </DialogClose>
                <Button 
                    type="button" 
                    onClick={handleBulkSubmit} 
                    disabled={isBulkProcessing || !bulkAddPreview || bulkAddPreview.validProductsForUpload.length === 0}
                >
                    {isBulkProcessing && bulkAddPreview && bulkAddPreview.validProductsForUpload.length > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    Submit {bulkAddPreview?.validProductsForUpload.length || 0} Products
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}