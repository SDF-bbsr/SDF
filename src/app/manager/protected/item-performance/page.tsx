"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ListFilter, PackageSearch, ShoppingBasket, TrendingUp, PieChart as PieChartIcon, PackageX } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  Legend,
  PieChart, Pie, Cell,
  TooltipProps
} from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface ItemPerformance {
  articleNo: string;
  articleName?: string;
  totalWeightSoldGrams: number;
  totalValueSold: number;
  totalPackets: number;
}

interface ProductInfo {
  articleNo: string;
  articleName?: string;
}

interface GrandTotals {
  totalValueSold: number;
  totalWeightSoldGrams: number;
}

interface FullItemPerformanceResponse {
  soldItemsPerformance: ItemPerformance[];
  grandTotals: GrandTotals;
  zeroSalesItems: ProductInfo[];
}

// Helper to get default date range (e.g., this month)
const getDefaultDateRange = () => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
        startDate: firstDayOfMonth.toISOString().split('T')[0],
        endDate: lastDayOfMonth.toISOString().split('T')[0],
    };
};

const PIE_CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AA336A', '#8A2BE2', '#A2D2FF'];
const TOP_N_ITEMS_FOR_CHART = 7;


export default function ItemPerformancePage() {
  const [soldItemsPerformance, setSoldItemsPerformance] = useState<ItemPerformance[]>([]);
  const [grandTotals, setGrandTotals] = useState<GrandTotals | null>(null);
  const [zeroSalesItems, setZeroSalesItems] = useState<ProductInfo[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [searchTerm, setSearchTerm] = useState('');

  const fetchItemPerformance = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate) {
        sonnerToast.info("Please select a valid date range.");
        return;
    }
    setIsLoading(true);
    setError(null);
    setSoldItemsPerformance([]);
    setGrandTotals(null);
    setZeroSalesItems([]);

    try {
      const queryParams = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      const response = await fetch(`/api/manager/item-performance-data?${queryParams.toString()}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || errData.details || 'Failed to fetch item performance data');
      }
      const data: FullItemPerformanceResponse = await response.json();
      setSoldItemsPerformance(data.soldItemsPerformance);
      setGrandTotals(data.grandTotals);
      setZeroSalesItems(data.zeroSalesItems);
    } catch (err: any) {
      setError(err.message);
      sonnerToast.error(`Error fetching data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchItemPerformance();
  }, [fetchItemPerformance]);

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };
  
  const filteredSoldItems = useMemo(() => {
    if (!searchTerm) return soldItemsPerformance;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return soldItemsPerformance.filter(item => 
        item.articleNo.toLowerCase().includes(lowerSearchTerm) ||
        (item.articleName && item.articleName.toLowerCase().includes(lowerSearchTerm))
    );
  }, [soldItemsPerformance, searchTerm]);

  const topNItemsForBarChart = useMemo(() => {
    return [...soldItemsPerformance] // Create a new array to sort
      .sort((a, b) => b.totalValueSold - a.totalValueSold)
      .slice(0, TOP_N_ITEMS_FOR_CHART);
  }, [soldItemsPerformance]);

  const pieChartData = useMemo(() => {
    if (!soldItemsPerformance || soldItemsPerformance.length === 0) return [];
    const sortedByValue = [...soldItemsPerformance].sort((a,b) => b.totalValueSold - a.totalValueSold);
    const topItems = sortedByValue.slice(0, TOP_N_ITEMS_FOR_CHART -1); // -1 to leave space for 'Others'
    const otherItemsValue = sortedByValue.slice(TOP_N_ITEMS_FOR_CHART -1).reduce((sum, item) => sum + item.totalValueSold, 0);
    
    const chartData = topItems.map(item => ({
        name: item.articleName || item.articleNo,
        value: item.totalValueSold
    }));

    if (otherItemsValue > 0) {
        chartData.push({ name: 'Others', value: otherItemsValue });
    }
    return chartData;
  }, [soldItemsPerformance]);

  const renderCustomizedPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
  
    if (percent * 100 < 3) return null; // Don't render label for very small slices
  
    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="11px" fontWeight="medium">
        {`${name} (${(percent * 100).toFixed(0)}%)`}
      </text>
    );
  };

  return (
    <>
      <Toaster richColors position="top-right" />
      {/* Filters Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListFilter className="h-5 w-5"/> Filter Item Performance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input type="date" id="startDate" value={dateRange.startDate} onChange={(e) => handleDateChange('startDate', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input type="date" id="endDate" value={dateRange.endDate} onChange={(e) => handleDateChange('endDate', e.target.value)} />
          </div>
          <div className="md:col-span-2 lg:col-span-1">
            <Label htmlFor="searchTerm">Search Sold Items (Name/No)</Label>
            <Input 
                type="text" 
                id="searchTerm"
                placeholder="Enter Article No or Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button onClick={fetchItemPerformance} disabled={isLoading} className="h-10">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageSearch className="mr-2 h-4 w-4" />}
            Load Data
          </Button>
        </CardContent>
      </Card>

      {/* Visualizations Section */}
      {(!isLoading && !error && soldItemsPerformance.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-500"/> Top {TOP_N_ITEMS_FOR_CHART} Items Comparison</CardTitle>
                    <CardDescription>By total value sold, total weight, and packets.</CardDescription>
                </CardHeader>
                <CardContent className="h-[350px]">
                    <ResponsiveContainer width="99%" height="100%">
                        <BarChart data={topNItemsForBarChart} margin={{ top: 5, right: 0, left: -20, bottom: 50 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="articleName" angle={-30} textAnchor="end" interval={0} tick={{ fontSize: 10 }}/>
                            <YAxis yAxisId="left" orientation="left" stroke="#8884d8" tickFormatter={(value) => `₹${value >= 1000 ? `${value/1000}k` : value}`} />
                            <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" tickFormatter={(value) => `${value/1000}kg`}/>
                            <Tooltip
                                formatter={(value: ValueType, name: NameType, props: TooltipProps<ValueType, NameType>) => {
                                    if (name === "totalValueSold") return [`₹${(value as number).toFixed(2)}`, "Total Value"];
                                    if (name === "totalWeightSoldGrams") return [`${((value as number)/1000).toFixed(3)} kg`, "Total Weight"];
                                    if (name === "totalPackets") return [String(value), "Total Packets"];
                                    return [String(value), String(name)];
                                }}
                            />
                            <Legend verticalAlign="top" wrapperStyle={{paddingBottom: "10px"}} />
                            <Bar yAxisId="left" dataKey="totalValueSold" fill="#8884d8" name="Total Value (₹)" />
                            <Bar yAxisId="right" dataKey="totalWeightSoldGrams" fill="#82ca9d" name="Total Weight (g)" />
                            {/* <Bar yAxisId="left" dataKey="totalPackets" fill="#ffc658" name="Packets" /> */} {/* Optional: Add packets */}
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><PieChartIcon className="h-5 w-5 text-green-500"/> Sales Value Distribution</CardTitle>
                    <CardDescription>Contribution of items to total sales value.</CardDescription>
                </CardHeader>
                <CardContent className="h-[350px]">
                    <ResponsiveContainer width="99%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieChartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={renderCustomizedPieLabel}
                                outerRadius={110}
                                fill="#8884d8"
                                dataKey="value"
                                nameKey="name"
                            >
                            {pieChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} />
                            ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `₹${value.toFixed(2)}`} />
                            <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{fontSize: "12px", paddingTop: "10px"}}/>
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
      )}


      {/* Sold Items Performance Data Display */}
      <Card className="mb-6">
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShoppingBasket className="h-5 w-5"/> Item Sales Performance Details</CardTitle>
            <CardDescription>
                Showing performance for items sold between {dateRange.startDate && new Date(dateRange.startDate  + 'T00:00:00Z').toLocaleDateString()} to {dateRange.endDate && new Date(dateRange.endDate + 'T00:00:00Z').toLocaleDateString()}.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {isLoading && (
            <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="ml-2">Loading item performance...</p>
            </div>
            )}
            {error && !isLoading && <p className="text-red-500 text-center py-10">Error: {error}</p>}
            
            {!isLoading && !error && (
            <>
                {filteredSoldItems.length > 0 && grandTotals ? (
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead className="w-[200px]">Article Name</TableHead>
                        <TableHead>Article No</TableHead>
                        <TableHead className="text-right">Total Value (₹)</TableHead>
                        <TableHead className="text-right">Avg. Price/Pkt (₹)</TableHead>
                        <TableHead className="text-right">Total Weight (kg)</TableHead>
                        <TableHead className="text-right">Total Packets</TableHead>
                        <TableHead className="text-right">% of Total Value</TableHead>
                        <TableHead className="text-right">% of Total Weight</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredSoldItems.map((item) => (
                        <TableRow key={item.articleNo}>
                        <TableCell className="font-medium">{item.articleName || 'N/A'}</TableCell>
                        <TableCell>{item.articleNo}</TableCell>
                        <TableCell className="text-right">₹{item.totalValueSold.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                            ₹{item.totalPackets > 0 ? (item.totalValueSold / item.totalPackets).toFixed(2) : '0.00'}
                        </TableCell>
                        <TableCell className="text-right">{(item.totalWeightSoldGrams / 1000).toFixed(3)} kg</TableCell>
                        <TableCell className="text-right">{item.totalPackets}</TableCell>
                        <TableCell className="text-right">
                            {grandTotals.totalValueSold > 0 ? 
                                ((item.totalValueSold / grandTotals.totalValueSold) * 100).toFixed(2) : '0.00'}%
                        </TableCell>
                        <TableCell className="text-right">
                            {grandTotals.totalWeightSoldGrams > 0 ? 
                                ((item.totalWeightSoldGrams / grandTotals.totalWeightSoldGrams) * 100).toFixed(2) : '0.00'}%
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                ) : (
                <p className="text-center text-gray-500 py-10">No item sales data found for the selected criteria.</p>
                )}
            </>
            )}
        </CardContent>
      </Card>

      {/* Zero Sales Items Table */}
      {!isLoading && !error && (
         <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><PackageX className="h-5 w-5 text-orange-500"/> Items with No Sales</CardTitle>
                <CardDescription>
                    Products in master list not sold between {dateRange.startDate && new Date(dateRange.startDate  + 'T00:00:00Z').toLocaleDateString()} to {dateRange.endDate && new Date(dateRange.endDate + 'T00:00:00Z').toLocaleDateString()}.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {zeroSalesItems.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[300px]">Article Name</TableHead>
                                <TableHead>Article No</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {zeroSalesItems.map((item) => (
                                <TableRow key={item.articleNo}>
                                    <TableCell className="font-medium">{item.articleName || 'N/A'}</TableCell>
                                    <TableCell>{item.articleNo}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <p className="text-center text-gray-500 py-10">All products had sales in this period, or no products found in master list.</p>
                )}
            </CardContent>
         </Card>
      )}
    </>
  );
}