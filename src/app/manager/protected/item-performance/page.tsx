// src/app/manager/protected/item-performance/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2, ListFilter, PackageSearch, TrendingUp, ChevronLeft, ChevronRight,
  Sparkles, ChevronDown, CalendarRange, Star, Gem, Lightbulb, AlertTriangle, TrendingDown, DollarSign, Target, Award // <-- ADDED ICONS
} from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

// Interfaces
interface AggregatedItemPerformance {
  articleNo: string;
  articleName: string;
  totalWeightSoldGrams: number;
  totalValueSold: number;
  totalPackets: number;
}

interface GrandTotals {
  totalValueSold: number;
  totalWeightSoldGrams: number;
  totalPacketsSold: number;
}

interface ItemPerformanceApiResponse {
  soldItemsPerformance: AggregatedItemPerformance[];
  grandTotals: GrandTotals;
}

// --- vvv ADD THESE NEW TYPE DEFINITIONS vvv ---
interface FirestoreTimestamp {
  _seconds: number;
  _nanoseconds: number;
}
interface DailyMoverItem {
  productName: string;
  yesterdaySales: number;
  averageDailySales: number;
  percentageChange: number;
}
interface WeeklyMoverItem {
  productName: string;
  changePercentage: number;
}
interface ConsistentPerformerItem {
  productName: string;
  averageDailySales: number;
}
interface ProfitQuadrantProduct {
  productName: string;
  salesVolume: number;
  profitMargin: number;
}
interface ProfitQuadrantSection {
  narrative: string;
  products: ProfitQuadrantProduct[];
}
interface AIProductPerformanceResponse {
  consistentPerformers: {
    narrative: string;
    products: ConsistentPerformerItem[];
  };
  dailyMovers: {
    narrative: string;
    standoutPerformers: DailyMoverItem[];
    underperformers: DailyMoverItem[];
  };
  lastUpdated: FirestoreTimestamp;
  priceSweetSpot: {
    narrative: string;
    sweetSpotRange: [number, number];
  };
  profitQuadrant: {
    cashCows: ProfitQuadrantSection;
    opportunities: ProfitQuadrantSection;
    problemChildren: ProfitQuadrantSection;
    stars: ProfitQuadrantSection;
  };
  sourceDateRange: {
    start: string;
    end: string;
  };
  type: string;
  weeklyMovers: {
    coolingOff: WeeklyMoverItem[];
    risingStars: WeeklyMoverItem[];
  };
}
// --- ^^^ END OF NEW TYPE DEFINITIONS ^^^ ---

type QuickPeriod = 'today' | 'last7d' | 'last30d' | 'thisWeek' | 'thisMonth' | 'custom';

const IST_TIMEZONE_CLIENT = 'Asia/Kolkata';
const getISODateStringForClient = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const getNowInClientIST = (): Date =>
  new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE_CLIENT }));

const PIE_CHART_COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AA336A',
  '#8A2BE2', '#A2D2FF', '#FF69B4', '#7FFF00', '#D2691E',
];
const TOP_N_ITEMS_FOR_BAR_CHART = 7;
const TOP_N_ITEMS_FOR_PIE_CHART = 10; // Includes "Others" if present

export default function ItemPerformancePage() {
  const [soldItemsPerformance, setSoldItemsPerformance] = useState<AggregatedItemPerformance[]>([]);
  const [grandTotals, setGrandTotals] = useState<GrandTotals | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuickPeriod, setActiveQuickPeriod] = useState<QuickPeriod>('today');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [productInsight, setProductInsight] = useState<AIProductPerformanceResponse | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(true);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [isInsightExpanded, setIsInsightExpanded] = useState(false); // To control the collapsible card

  const todayForInputMax = useMemo(() => getISODateStringForClient(getNowInClientIST()), []);

  const effectiveDateRange = useMemo(() => {
    const nowIST = getNowInClientIST();
    if (activeQuickPeriod === 'custom') {
      return { startDate: customDateRange.startDate, endDate: customDateRange.endDate };
    }
    let sDate = new Date(nowIST); // Default to today
    let eDate = new Date(nowIST); // Default to today

    switch (activeQuickPeriod) {
      case 'today':
        // sDate and eDate already set to today
        break;
      case 'last7d':
        sDate.setDate(nowIST.getDate() - 6);
        break;
      case 'last30d':
        sDate.setDate(nowIST.getDate() - 29);
        break;
      case 'thisWeek': {
        const day = nowIST.getDay(); // Sunday - 0, Monday - 1, ..., Saturday - 6
        sDate.setDate(nowIST.getDate() - day + (day === 0 ? -6 : 1)); // Set to Monday of current week
        eDate = new Date(sDate);
        eDate.setDate(sDate.getDate() + 6); // Set to Sunday of current week
        break;
      }
      case 'thisMonth':
        sDate = new Date(nowIST.getFullYear(), nowIST.getMonth(), 1);
        eDate = new Date(nowIST.getFullYear(), nowIST.getMonth() + 1, 0);
        break;
    }
    return {
      startDate: getISODateStringForClient(sDate),
      endDate: getISODateStringForClient(eDate),
    };
  }, [activeQuickPeriod, customDateRange]);

  const fetchItemPerformance = useCallback(async () => {
    if (!effectiveDateRange.startDate || !effectiveDateRange.endDate) {
      setSoldItemsPerformance([]);
      setGrandTotals(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setSoldItemsPerformance([]);
    setGrandTotals(null);

    try {
      const queryParams = new URLSearchParams({
        startDate: effectiveDateRange.startDate,
        endDate: effectiveDateRange.endDate,
      });
      const response = await fetch(
        `/api/manager/item-performance-data?${queryParams.toString()}`
      );
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(
          errData.message || errData.details || 'Failed to fetch item performance'
        );
      }
      const data: ItemPerformanceApiResponse = await response.json();
      setSoldItemsPerformance(data.soldItemsPerformance || []);
      setGrandTotals(
        data.grandTotals || {
          totalValueSold: 0,
          totalWeightSoldGrams: 0,
          totalPacketsSold: 0,
        }
      );
    } catch (err: any) {
      setError(err.message);
      sonnerToast.error(`Error fetching data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveDateRange]);

  useEffect(() => {
    if (effectiveDateRange.startDate && effectiveDateRange.endDate) {
      setCurrentPage(1);
      fetchItemPerformance();
    }
  }, [effectiveDateRange, fetchItemPerformance]);

  useEffect(() => {
    const fetchProductInsight = async () => {
      setIsInsightLoading(true);
      setInsightError(null);
      try {
        const response = await fetch('/api/insights/getinsights/product');
        if (response.status === 404) {
          setInsightError('No product performance insight has been generated yet.');
          return;
        }
        if (!response.ok) {
          throw new Error('Failed to fetch product performance analysis.');
        }
        const data: AIProductPerformanceResponse = await response.json();
        setProductInsight(data);
      } catch (err: any) {
        console.error("Could not fetch AI product insight:", err);
        setInsightError(err.message);
      } finally {
        setIsInsightLoading(false);
      }
    };
    fetchProductInsight();
  }, []); // Runs only once on mount

  const handleApplyCustomRange = () => {
    if (activeQuickPeriod === 'custom') {
      if (!customDateRange.startDate || !customDateRange.endDate) {
        sonnerToast.warning('Please select both start and end dates for custom range.');
        return;
      }
      if (new Date(customDateRange.startDate) > new Date(customDateRange.endDate)) {
        sonnerToast.error('Start date cannot be after end date.');
        return;
      }
      fetchItemPerformance(); // Explicitly call for button click
    }
  };

  const filteredAndSortedSoldItems = useMemo(() => {
    let items = soldItemsPerformance;
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          item.articleNo.toLowerCase().includes(lowerSearchTerm) ||
          (item.articleName && item.articleName.toLowerCase().includes(lowerSearchTerm))
      );
    }
    return items.sort((a, b) => b.totalValueSold - a.totalValueSold);
  }, [soldItemsPerformance, searchTerm]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedSoldItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedSoldItems, currentPage]);

  const totalTablePages = Math.ceil(filteredAndSortedSoldItems.length / ITEMS_PER_PAGE);

  const topNItemsForBarChart = useMemo(() => {
    return [...soldItemsPerformance]
      .sort((a, b) => b.totalValueSold - a.totalValueSold)
      .slice(0, TOP_N_ITEMS_FOR_BAR_CHART);
  }, [soldItemsPerformance]);

  const pieChartDataByValue = useMemo(() => {
    if (!soldItemsPerformance || soldItemsPerformance.length === 0) return [];
    const sortedByValue = [...soldItemsPerformance].sort(
      (a, b) => b.totalValueSold - a.totalValueSold
    );
    // Ensure "Others" is the last slice if it exists
    const topItems = sortedByValue.slice(0, TOP_N_ITEMS_FOR_PIE_CHART - 1);
    const otherItemsValue = sortedByValue
      .slice(TOP_N_ITEMS_FOR_PIE_CHART - 1)
      .reduce((sum, item) => sum + item.totalValueSold, 0);

    const chartData = topItems.map((item) => ({
      name: item.articleName || item.articleNo,
      value: item.totalValueSold,
    }));

    if (otherItemsValue > 0 && sortedByValue.length >= TOP_N_ITEMS_FOR_PIE_CHART) {
      chartData.push({ name: 'Others', value: otherItemsValue });
    }
    return chartData;
  }, [soldItemsPerformance]);

  const renderCustomizedPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent * 100 < 3) return null; // Hide labels for very small slices

    return (
      <text
        x={x} y={y}
        fill="#fff"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize="10px"
        fontWeight="500"
      >
        {`${name.length > 15 ? name.substring(0,12)+'...' : name} (${(percent * 100).toFixed(0)}%)`}
      </text>
    );
  };

  const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const formatTimestamp = (ts: FirestoreTimestamp | undefined) => {
    if (!ts?._seconds) return 'N/A';
    return new Date(ts._seconds * 1000).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const ProfitQuadrantCard = ({ title, icon: Icon, narrative, products, className }: { title: string, icon: React.ElementType, narrative: string, products: ProfitQuadrantProduct[], className: string }) => (
    <Card className={`flex flex-col ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-md">
          <Icon className="h-5 w-5" /> {title}
        </CardTitle>
        <CardDescription className="text-xs pt-1">{narrative}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-2 text-xs h-8">Product</TableHead>
              <TableHead className="text-right px-2 text-xs h-8">Sales</TableHead>
              <TableHead className="text-right px-2 text-xs h-8">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map(p => (
              <TableRow key={p.productName}>
                <TableCell className="font-medium text-xs px-2 py-1.5">{p.productName}</TableCell>
                <TableCell className="text-right text-xs px-2 py-1.5">{formatCurrency(p.salesVolume)}</TableCell>
                <TableCell className="text-right text-xs px-2 py-1.5">{(p.profitMargin * 100).toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const MoverList = ({ title, items, icon: Icon, className }: { title: string; items: { productName: string; percentageChange: number }[] | { productName: string; changePercentage: number }[]; icon: React.ElementType, className: string }) => (
    <div>
      <h4 className={`flex items-center gap-2 font-semibold mb-2 ${className}`}>
        <Icon className="h-4 w-4" /> {title}
      </h4>
      <ul className="space-y-1.5 text-sm">
        {items.map(item => {
          const change = 'percentageChange' in item ? item.percentageChange : item.changePercentage;
          return (
            <li key={item.productName} className="flex justify-between items-center text-xs border-b pb-1">
              <span>{item.productName}</span>
              <span className={`font-bold ${change > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {change.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );



  return (
    <div className="container mx-auto px-2 sm:px-4 py-4">
      <Toaster richColors position="top-right" />
       {/* --- vvv ADD THIS ENTIRE NEW AI ANALYZER CARD vvv --- */}
       <Card className="mb-6 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800">
        <CardHeader className="p-0">
          <button
            className="w-full flex justify-between items-center text-left p-4"
            onClick={() => setIsInsightExpanded(!isInsightExpanded)}
            aria-expanded={isInsightExpanded}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-blue-500 flex-shrink-0" />
              <div>
                <CardTitle className="text-lg text-blue-900 dark:text-blue-200">AI Product Performance Analyzer</CardTitle>
                {!isInsightLoading && productInsight && (
                  <CardDescription className="text-xs mt-1">
                    Updated: {formatTimestamp(productInsight.lastUpdated)} | Data for: {productInsight.sourceDateRange.start} to {productInsight.sourceDateRange.end}
                  </CardDescription>
                )}
              </div>
            </div>
            {isInsightExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
        </CardHeader>
        
        {isInsightExpanded && (
          <CardContent className="p-4 space-y-6">
            {isInsightLoading && <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/> Loading insights...</div>}
            {insightError && <div className="text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4"/> {insightError}</div>}
            {productInsight && !isInsightLoading && !insightError && (
              <div className="space-y-6">

                {/* --- Movers Section --- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader><CardTitle className="text-base">Daily Movers</CardTitle><CardDescription className="text-xs pt-1">{productInsight.dailyMovers.narrative}</CardDescription></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <MoverList title="Standout Performers" items={productInsight.dailyMovers.standoutPerformers} icon={TrendingUp} className="text-green-700 dark:text-green-400" />
                      <MoverList title="Underperformers" items={productInsight.dailyMovers.underperformers} icon={TrendingDown} className="text-red-600 dark:text-red-400" />
                    </CardContent>
                  </Card>
                   <Card>
                    <CardHeader><CardTitle className="text-base">Weekly Movers</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <MoverList title="Rising Stars" items={productInsight.weeklyMovers.risingStars} icon={TrendingUp} className="text-green-700 dark:text-green-400" />
                      <MoverList title="Cooling Off" items={productInsight.weeklyMovers.coolingOff} icon={TrendingDown} className="text-red-600 dark:text-red-400" />
                    </CardContent>
                  </Card>
                </div>

                {/* --- Profit Quadrant Section --- */}
                <div>
                  <h3 className="text-xl font-bold mb-4 text-center">Profit Quadrant Analysis</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ProfitQuadrantCard title="Stars" icon={Star} narrative={productInsight.profitQuadrant.stars.narrative} products={productInsight.profitQuadrant.stars.products} className="bg-green-50 dark:bg-green-900/30 border-green-200" />
                    <ProfitQuadrantCard title="Cash Cows" icon={Gem} narrative={productInsight.profitQuadrant.cashCows.narrative} products={productInsight.profitQuadrant.cashCows.products} className="bg-sky-50 dark:bg-sky-900/30 border-sky-200" />
                    <ProfitQuadrantCard title="Opportunities" icon={Lightbulb} narrative={productInsight.profitQuadrant.opportunities.narrative} products={productInsight.profitQuadrant.opportunities.products} className="bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200" />
                    <ProfitQuadrantCard title="Problem Children" icon={AlertTriangle} narrative={productInsight.profitQuadrant.problemChildren.narrative} products={productInsight.profitQuadrant.problemChildren.products} className="bg-red-50 dark:bg-red-900/30 border-red-200" />
                  </div>
                </div>

                {/* --- Consistent Performers & Price Sweet Spot --- */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                   <Card className="lg:col-span-2">
                      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="h-5 w-5 text-indigo-500" /> Consistent Performers</CardTitle><CardDescription className="text-xs pt-1">{productInsight.consistentPerformers.narrative}</CardDescription></CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                           {productInsight.consistentPerformers.products.map(p => (
                            <li key={p.productName} className="flex justify-between text-sm border-b pb-1.5">
                              <span>{p.productName}</span>
                              <span className="font-semibold text-muted-foreground">{formatCurrency(p.averageDailySales)} <span className="text-xs font-normal">/ day</span></span>
                            </li>
                           ))}
                        </ul>
                      </CardContent>
                   </Card>
                   <Card className="bg-fuchsia-100/60 dark:bg-fuchsia-900/30 border-fuchsia-300 flex flex-col justify-center items-center text-center">
                      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-5 w-5 text-fuchsia-600" /> Price Sweet Spot</CardTitle></CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-fuchsia-800 dark:text-fuchsia-300">
                          {formatCurrency(productInsight.priceSweetSpot.sweetSpotRange[0])} - {formatCurrency(productInsight.priceSweetSpot.sweetSpotRange[1])}
                        </div>
                        <p className="text-xs text-fuchsia-700 dark:text-fuchsia-400 mt-2">{productInsight.priceSweetSpot.narrative}</p>
                      </CardContent>
                   </Card>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
      {/* --- ^^^ END OF AI ANALYZER CARD ^^^ --- */}
      {/* Filters Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <ListFilter className="h-5 w-5" /> Filter Item Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="lg:col-span-1">
              <Label htmlFor="quickPeriod" className="text-xs sm:text-sm">Quick Period</Label>
              <Select
                value={activeQuickPeriod}
                onValueChange={(value) => setActiveQuickPeriod(value as QuickPeriod)}
              >
                <SelectTrigger id="quickPeriod" className="mt-1 h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last7d">Last 7 Days</SelectItem>
                  <SelectItem value="thisWeek">This Week (Mon-Sun)</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="last30d">Last 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {activeQuickPeriod === 'custom' && (
              <>
                <div className="lg:col-span-1">
                  <Label htmlFor="startDate" className="text-xs sm:text-sm">Start Date</Label>
                  <Input
                    type="date"
                    id="startDate"
                    value={customDateRange.startDate}
                    onChange={(e) =>
                      setCustomDateRange((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    className="mt-1 h-10 text-sm"
                    max={todayForInputMax}
                  />
                </div>
                <div className="lg:col-span-1">
                  <Label htmlFor="endDate" className="text-xs sm:text-sm">End Date</Label>
                  <Input
                    type="date"
                    id="endDate"
                    value={customDateRange.endDate}
                    onChange={(e) =>
                      setCustomDateRange((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    className="mt-1 h-10 text-sm"
                    max={todayForInputMax}
                  />
                </div>
              </>
            )}
            
            {/* Search input takes remaining space or specific columns */}
            <div className={`lg:col-span-1 ${activeQuickPeriod === 'custom' ? '' : 'lg:col-span-3 lg:col-start-2'}`}>
              <Label htmlFor="searchTerm" className="text-xs sm:text-sm">Search Sold Items (Name/No)</Label>
              <Input
                type="text"
                id="searchTerm"
                placeholder="Filter loaded items..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1); 
                }}
                className="mt-1 h-10 text-sm"
              />
            </div>

            {activeQuickPeriod === 'custom' && (
              <Button
                onClick={handleApplyCustomRange}
                disabled={
                  isLoading || !customDateRange.startDate || !customDateRange.endDate
                }
                className="h-10 text-sm lg:col-span-1 w-full sm:w-auto"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PackageSearch className="mr-2 h-4 w-4" />
                )}
                Apply Custom
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-3 text-lg">Loading item performance data...</p>
        </div>
      )}
      {error && !isLoading && (
        <p className="text-destructive text-center py-20 text-lg">Error: {error}</p>
      )}

      {!isLoading && !error && grandTotals && (
        <div className="space-y-6">
          {/* Grand Totals Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹{grandTotals.totalValueSold.toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Weight Sold</CardTitle>
                <PackageSearch className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(grandTotals.totalWeightSoldGrams / 1000).toFixed(3)} kg
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Packets Sold</CardTitle>
                <PackageSearch className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{grandTotals.totalPacketsSold}</div>
              </CardContent>
            </Card>
          </div>

          {/* Visualizations Section */}
          {soldItemsPerformance.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <TrendingUp className="h-5 w-5 text-blue-500" /> Top {TOP_N_ITEMS_FOR_BAR_CHART} Items (Value & Weight)
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Comparison by total value sold and total weight.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[350px] pt-2">
                  <ResponsiveContainer width="99%" height="100%">
                    <BarChart data={topNItemsForBarChart} margin={{ top: 5, right: 10, left: -25, bottom: 65 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="articleName" angle={-40} textAnchor="end" interval={0} tick={{ fontSize: 9 }} height={70}/>
                      <YAxis yAxisId="leftVal" orientation="left" stroke="#3b82f6" tick={{ fontSize: 10 }}
                        tickFormatter={(value) => `₹${value >= 1000 ? `${value / 1000}k` : value}`}
                      />
                      <YAxis yAxisId="rightKg" orientation="right" stroke="#10b981" tick={{ fontSize: 10 }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(1)}kg`}
                      />
                      <Tooltip
                        formatter={(value: ValueType, name: NameType) => {
                          if (name === 'Value (₹)') return [`₹${(value as number).toFixed(2)}`, 'Total Value'];
                          if (name === 'Weight (g)') return [`${((value as number) / 1000).toFixed(3)} kg`, 'Total Weight'];
                          return [String(value), String(name)];
                        }}
                      />
                      <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }} />
                      <Bar yAxisId="leftVal" dataKey="totalValueSold" fill="#3b82f6" name="Value (₹)" radius={[4,4,0,0]} barSize={20} />
                      <Bar yAxisId="rightKg" dataKey="totalWeightSoldGrams" fill="#10b981" name="Weight (g)" radius={[4,4,0,0]} barSize={20}/>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    {/* <PieChartIcon className="h-5 w-5 text-green-500" /> Replaced with TrendingUp for consistency */}
                    <TrendingUp className="h-5 w-5 text-green-500" /> Top {TOP_N_ITEMS_FOR_PIE_CHART} Sales Value Distribution
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Contribution of items to total sales value.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[350px] pt-2">
                  {pieChartDataByValue.length > 0 ? (
                    <ResponsiveContainer width="99%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartDataByValue}
                          cx="50%" cy="50%"
                          labelLine={false}
                          label={renderCustomizedPieLabel}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                          nameKey="name"
                        >
                          {pieChartDataByValue.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number, name: string) => [`${name}: ₹${value.toFixed(2)}`, null]} />
                        <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{fontSize: '10px', paddingTop: '15px', lineHeight: '1.5em'}} iconSize={10}/>
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="text-center text-muted-foreground h-full flex items-center justify-center text-sm">Not enough distinct items to display pie chart.</p>}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Sold Items Performance Data Display Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <PackageSearch className="h-5 w-5" /> All Sold Items Performance
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Detailed performance for items sold in the period: {' '}
                {effectiveDateRange.startDate && new Date(effectiveDateRange.startDate + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC' })} to {' '}
                {effectiveDateRange.endDate && new Date(effectiveDateRange.endDate + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC' })}.
                {searchTerm && ` (Filtered by: "${searchTerm}")`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {paginatedItems.length > 0 && grandTotals ? (
                <>
                  <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table className="text-xs ">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="py-2 px-2 ">Article Name</TableHead>
                          <TableHead className="py-2 px-2 ">Article No</TableHead>
                          <TableHead className="text-right py-2 px-2 ">Total Value (₹)</TableHead>
                          <TableHead className="text-right py-2 px-2 ">Avg. Price/Pkt (₹)</TableHead>
                          <TableHead className="text-right py-2 px-2 ">Total Weight (kg)</TableHead>
                          <TableHead className="text-right py-2 px-2 ">Packets</TableHead>
                          <TableHead className="text-right py-2 px-2 ">% of Total Value</TableHead>
                          <TableHead className="text-right py-2 px-2 ">% of Total Weight</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedItems.map((item) => (
                          <TableRow key={item.articleNo}>
                            <TableCell className="font-medium py-1.5 px-2">{item.articleName || 'N/A'}</TableCell>
                            <TableCell className="py-1.5 px-2">{item.articleNo}</TableCell>
                            <TableCell className="text-right py-1.5 px-2">₹{item.totalValueSold.toFixed(2)}</TableCell>
                            <TableCell className="text-right py-1.5 px-2">
                              ₹{item.totalPackets > 0 ? (item.totalValueSold / item.totalPackets).toFixed(2) : '0.00'}
                            </TableCell>
                            <TableCell className="text-right py-1.5 px-2">{(item.totalWeightSoldGrams / 1000).toFixed(3)} kg</TableCell>
                            <TableCell className="text-right py-1.5 px-2">{item.totalPackets}</TableCell>
                            <TableCell className="text-right py-1.5 px-2">
                              {grandTotals.totalValueSold > 0
                                ? ((item.totalValueSold / grandTotals.totalValueSold) * 100).toFixed(2)
                                : '0.00'}%
                            </TableCell>
                            <TableCell className="text-right py-1.5 px-2">
                              {grandTotals.totalWeightSoldGrams > 0
                                ? ((item.totalWeightSoldGrams / grandTotals.totalWeightSoldGrams) * 100).toFixed(2)
                                : '0.00'}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                  {totalTablePages > 1 && (
                    <div className="flex justify-center items-center space-x-2 mt-4">
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1 || isLoading}>
                        <ChevronLeft className="h-4 w-4" /> Prev
                      </Button>
                      <span className="text-sm">Page {currentPage} of {totalTablePages}</span>
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalTablePages, p + 1))} disabled={currentPage >= totalTablePages || isLoading}>
                        Next <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-muted-foreground py-10 text-sm">
                  {searchTerm ? 'No items match your search term.' : 'No item sales data found for the selected criteria.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {!isLoading && !error && (!grandTotals || soldItemsPerformance.length === 0) && (
        <p className="text-center text-muted-foreground py-10 text-sm">
          No performance data available for the current selection. Try adjusting the date range.
        </p>
      )}
    </div>
  );
}