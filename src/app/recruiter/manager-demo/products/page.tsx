// src/app/recruiter/manager-demo/products/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Loader2, PlusCircle, Edit2, Trash2, PackageSearch, RefreshCcw, UploadCloud, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const FIXED_PRODUCT_FIELDS_CONFIG = [
  { name: 'articleNumber', label: 'Article Number (ID)', type: 'text', required: true, placeholder: "e.g., 600038818", className: " text-xs" },
  { name: 'articleName', label: 'Article Name', type: 'text', required: true, placeholder: "e.g., SD KISMISS GREEN INDIAN LOOSE", className: " text-xs" },
  { name: 'posDescription', label: 'POS Description', type: 'text', required: false, placeholder: "e.g., KISMISS GREEN INDIAN", className: " text-xs" },
  { name: 'metlerCode', label: 'Metler Code', type: 'text', required: false, placeholder: "e.g., 86239", className: " text-xs" },
  { name: 'hsnCode', label: 'HSN Code', type: 'text', required: false, placeholder: "e.g., 8062010", className: " text-xs" },
  { name: 'taxPercentage', label: 'Tax %', type: 'number', required: false, placeholder: "e.g., 5", step: "0.01", className: " text-right text-xs" },
  { name: 'purchasePricePerKg', label: 'Purchase Price/Kg (₹)', type: 'number', required: false, placeholder: "e.g., 236", step: "0.01", className: " text-right text-xs" },
  { name: 'sellingRatePerKg', label: 'Selling Rate/Kg (₹)', type: 'number', required: false, placeholder: "e.g., 449", step: "0.01", className: " text-right text-xs" },
  { name: 'mrpPer100g', label: 'MRP/100g (₹)', type: 'number', required: false, placeholder: "e.g., 44.9", step: "0.01", className: " text-right text-xs" },
  { name: 'remark', label: 'Remark', type: 'textarea', required: false, placeholder: "e.g., SET 1", className: " text-xs" },
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
    // Set loading state for the specific button
    const submittingProductId = product.id; 
    setProducts(prev => prev.map(p => p.id === submittingProductId ? {...p, _isDeleting: true} : p));

    // Simulate the API call delay
    setTimeout(() => {
        // Show the info toast explaining this is a demo
        sonnerToast.info("This is a demo environment.", {
            description: `Deleting products is disabled. In a real application, this would remove "${product.articleName}".`,
        });
        
        // Reset loading state
        setProducts(prev => prev.map(p => p.id === submittingProductId ? {...p, _isDeleting: false} : p));
    }, 600); // 1-second delay for simulation
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
  
  // Simulate the API call delay
  setTimeout(() => {
      const action = editingProduct ? "Editing" : "Adding";
      // Show the info toast explaining this is a demo
      sonnerToast.info("This is a demo environment.", {
          description: `${action} products is disabled. In a real application, this action would save the product details.`,
      });

      // Reset state and close the modal
      setIsSubmitting(false);
      setIsProductModalOpen(false);
  }, 600); // 1-second delay for simulation
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
        sonnerToast.error("No valid products to submit.");
        return;
    }
    
    setIsBulkProcessing(true);

    // Simulate the API call delay
    setTimeout(() => {
        // Show the info toast explaining this is a demo
        sonnerToast.info("This is a demo environment.", {
            description: `Bulk adding products is disabled. In a real application, ${bulkAddPreview.validProductsForUpload.length} products would be uploaded.`,
        });
        
        // Reset state and close the modal
        setIsBulkProcessing(false);
        setIsBulkAddModalOpen(false);
    }, 600); // 1-second delay for simulation
};

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="container mx-auto px-2 sm:px-4 py-4">
        <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex flex-wrap items-center gap-2"> 
              <Button onClick={openAddModal} size="sm">
                  <PlusCircle className="mr-1.5 h-4 w-4" /> Add Product
              </Button>
              <Button onClick={openBulkAddModal} variant="outline" size="sm">
                  <UploadCloud className="mr-1.5 h-4 w-4" /> Bulk Add
              </Button>
              <Button variant="outline" onClick={fetchProducts} disabled={isLoading} size="sm">
                  <RefreshCcw className={`mr-1.5 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
          </div>
          <div className="relative flex items-center w-full sm:w-auto">
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl"><PackageSearch className="h-5 w-5"/> Product List</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Manage your products.
              <span className="hidden sm:inline"> All fields are displayed.</span>
              <span className="block"> The table below is horizontally scrollable on smaller screens.</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2 text-sm sm:text-base">Loading products...</p>
              </div>
            )}
            {error && !isLoading && <p className="text-destructive text-center py-10 text-sm sm:text-base">Error: {error}</p>}
            
            {!isLoading && !error && (
              <>
                {products.length > 0 ? (
                  filteredProducts.length > 0 ? (
                    <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-center py-2 px-2 sm:px-3 text-xs">Actions</TableHead>
                            {FIXED_PRODUCT_FIELDS_CONFIG.map(field => (
                              <TableHead key={field.name} className={`${field.className || ''} py-2 px-2 sm:px-3`}>
                                {field.label}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProducts.map((product) => (
                            <TableRow key={product.id} className={`${product._isDeleting ? "opacity-50" : ""} hover:bg-muted/50`}>
                              <TableCell className="text-center space-x-1 py-1 px-2 sm:py-1.5 sm:px-3">
                                <Button variant="outline" size="icon" onClick={() => openEditModal(product)} title="Edit Product" disabled={product._isDeleting || isSubmitting} className="h-7 w-7">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="icon" 
                                  onClick={() => handleDeleteProduct(product)} 
                                  title="Delete Product" 
                                  disabled={product._isDeleting || (isSubmitting && editingProduct?.id === product.id)}
                                  className="h-7 w-7"
                                  >
                                  {product._isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                              </TableCell>
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
                                      <TableCell key={fieldConf.name} className={`${fieldConf.className || ''} py-1.5 px-2 sm:py-2 sm:px-3`}>
                                        {displayValue}
                                      </TableCell>
                                    );
                                  })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                  ) : (
                    <p className="text-center text-muted-foreground py-10 text-sm sm:text-base">
                      No products found matching: "{searchQuery}".
                    </p>
                  )
                ) : (
                  <p className="text-center text-muted-foreground py-10 text-sm sm:text-base">
                    No products found. Add a new product or use Bulk Add.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Product Dialog */}
        <Dialog open={isProductModalOpen} onOpenChange={setIsProductModalOpen}>
          <DialogContent className="sm:max-w-[625px] max-h-[90vh] flex flex-col">
            <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 sm:pb-3">
              <DialogTitle className="text-lg sm:text-xl">{editingProduct ? `Edit Product: ${productForm.articleName || editingProduct?.articleName || ''}` : 'Add New Product'}</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {editingProduct ? `Update details for Article Number: ${editingProduct.id}.` : 'Enter details for the new product.'}
                {' Fields marked with * are required.'}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-grow"> {/* ScrollArea wraps only the form content */}
              <form onSubmit={handleFormSubmit} id="product-form" className="space-y-3 sm:space-y-4 px-4 sm:px-6 py-4">
                {FIXED_PRODUCT_FIELDS_CONFIG.map(field => (
                  <div key={field.name} className="grid grid-cols-1 gap-1 sm:grid-cols-4 sm:gap-x-4 sm:items-center">
                    <Label htmlFor={field.name} className="text-xs sm:text-sm sm:text-right sm:col-span-1">
                      {field.label} {field.required && '*'}
                    </Label>
                    {field.type === 'textarea' ? (
                      <Textarea
                        id={field.name}
                        name={field.name}
                        value={productForm[field.name] || ''}
                        onChange={handleInputChange}
                        className="sm:col-span-3 text-sm"
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
                        className="sm:col-span-3 text-sm h-9"
                        placeholder={field.placeholder}
                        required={field.required}
                        step={field.step || (field.type === 'number' ? 'any' : undefined)}
                      />
                    )}
                  </div>
                ))}
                 {/* Moved DialogFooter content inside form for proper submission */}
                <div className="flex justify-end space-x-2 pt-4 border-t mt-4 sm:mt-6">
                    <DialogClose asChild>
                        <Button type="button" variant="outline" size="sm">Cancel</Button>
                    </DialogClose>
                    <Button type="submit" form="product-form" disabled={isSubmitting} size="sm">
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingProduct ? 'Save Changes' : 'Create Product'}
                    </Button>
                </div>
              </form>
            </ScrollArea>
             {/* DialogFooter can be empty or removed if buttons are inside form */}
          </DialogContent>
        </Dialog>

        {/* Bulk Add Products Dialog */}
        <Dialog open={isBulkAddModalOpen} onOpenChange={(isOpen) => {
            if (!isOpen) { 
                setBulkJsonInput('[\n  {\n    "articleNumber": "PROD001",\n    "articleName": "Sample Product 1",\n    "sellingRatePerKg": "100.50"\n  }\n]');
                setBulkAddPreview(null);
            }
            setIsBulkAddModalOpen(isOpen);
        }}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
              <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 sm:pb-3 sticky top-0 bg-background z-10 border-b">
                  <DialogTitle className="text-lg sm:text-xl">Bulk Add Products</DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm">
                      Paste a JSON array of product objects. Each object must have `articleNumber` and `articleName`.
                      Other fields are optional.
                  </DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-grow overflow-y-auto">
                <div className="grid md:grid-cols-2 gap-4 p-4 sm:p-6">
                    <div className="flex flex-col">
                        <Label htmlFor="bulkJsonInput" className="mb-1 text-xs sm:text-sm">JSON Input</Label>
                        <Textarea
                            id="bulkJsonInput"
                            value={bulkJsonInput}
                            onChange={(e) => setBulkJsonInput(e.target.value)}
                            placeholder='[{"articleNumber": "ID1", "articleName": "Name1", ...}, ...]'
                            className="flex-grow font-mono text-xs resize-none min-h-[250px] sm:min-h-[300px]"
                        />
                    </div>
                    <div className="flex flex-col">
                        <Label className="mb-1 text-xs sm:text-sm">Preview & Validation</Label>
                        <ScrollArea className="border rounded-md p-2 sm:p-3 bg-muted/40 flex-grow min-h-[250px] sm:min-h-[300px]">
                            {isBulkProcessing && !bulkAddPreview && <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" /> <span className="ml-2 text-xs sm:text-sm">Processing...</span></div>}
                            {!isBulkProcessing && !bulkAddPreview && <p className="text-xs sm:text-sm text-muted-foreground p-4 text-center">Click "Parse & Validate JSON".</p>}
                            {!isBulkProcessing && bulkAddPreview && (
                                <div>
                                    <p className="text-xs sm:text-sm">Items in JSON: {bulkAddPreview.totalProducts}</p>
                                    <p className={`text-xs sm:text-sm ${bulkAddPreview.validProductsForUpload.length > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                                        <CheckCircle2 className="inline h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1"/>
                                        Valid for upload: {bulkAddPreview.validProductsForUpload.length}
                                    </p>
                                    {bulkAddPreview.errors.length > 0 && (
                                        <div className="mt-1 sm:mt-2">
                                            <p className="text-xs sm:text-sm text-red-600 font-semibold">
                                                <AlertTriangle className="inline h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1"/>
                                                Errors ({bulkAddPreview.errors.length}):
                                            </p>
                                            <ul className="list-disc list-inside text-[11px] sm:text-xs max-h-40 sm:max-h-60 overflow-y-auto pl-1">
                                                {bulkAddPreview.errors.map((err, i) => (
                                                    <li key={i} className="text-red-700">
                                                        {err.articleNumber ? `ID "${err.articleNumber}" (Item ${err.index + 1})` : `Item ${err.index + 1}`}: {err.message}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {bulkAddPreview.validProductsForUpload.length > 0 && bulkAddPreview.errors.length === 0 && (
                                        <p className="text-xs sm:text-sm text-green-600 mt-1 sm:mt-2">All products valid.</p>
                                    )}
                                    {bulkAddPreview.validProductsForUpload.length > 0 && (
                                         <details className="mt-1 sm:mt-2 text-xs">
                                            <summary className="cursor-pointer">View Valid ({bulkAddPreview.validProductsForUpload.length})</summary>
                                            <pre className="mt-1 p-1 sm:p-2 bg-background border rounded text-[10px] max-h-40 sm:max-h-60 overflow-auto">
                                                {JSON.stringify(bulkAddPreview.validProductsForUpload, null, 2)}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </div>
              </ScrollArea>
              <DialogFooter className="px-4 sm:px-6 pb-4 pt-3 sm:pt-4 border-t sticky bottom-0 bg-background z-10">
                  <Button type="button" variant="outline" onClick={handleParseAndValidateBulkJson} disabled={isBulkProcessing || !bulkJsonInput.trim()} size="sm">
                      {isBulkProcessing && !bulkAddPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                      Parse & Validate
                  </Button>
                  <DialogClose asChild>
                      <Button type="button" variant="ghost" size="sm">Cancel</Button>
                  </DialogClose>
                  <Button 
                      type="button" 
                      onClick={handleBulkSubmit} 
                      disabled={isBulkProcessing || !bulkAddPreview || bulkAddPreview.validProductsForUpload.length === 0}
                      size="sm"
                  >
                      {isBulkProcessing && bulkAddPreview && bulkAddPreview.validProductsForUpload.length > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                      Submit {bulkAddPreview?.validProductsForUpload.length || 0} Products
                  </Button>
              </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}