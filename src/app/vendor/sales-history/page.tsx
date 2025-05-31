// src/app/vendor/sales-history/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react'; // Added useMemo
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, List, CalendarDays, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface SaleTransaction {
  id: string;
  articleNo: string;
  productName?: string;
  weightGrams: number;
  calculatedSellPrice: number;
  timestamp: string;
  dateOfSale: string;
}

interface StaffSalesSummaryType {
  totalSalesValue: number;
  totalTransactions: number;
  displayDate?: string;
}

interface OverallStats {
  today: StaffSalesSummaryType;
  thisWeek: StaffSalesSummaryType;
  thisMonth: StaffSalesSummaryType;
}

interface DailySummaryViewData {
  date: string;
  totalSalesValue: number;
  totalTransactions: number;
}

interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

type ViewMode = 'dailySummary' | 'transactions';
type TransactionPeriod = 'today' | 'thisWeek' | 'thisMonth' | 'custom';

// Client-side date helpers
const IST_TIMEZONE_CLIENT = 'Asia/Kolkata'; // Use a distinct name for client-side constant
const getISODateStringForClient = (date: Date): string => {
  // This function should reliably produce YYYY-MM-DD for the given Date object's "wall clock" time
  // Assuming the Date object has already been adjusted to represent IST if needed.
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNowInClientIST = (): Date => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: IST_TIMEZONE_CLIENT }));
};


export default function VendorSalesHistoryPage() {
  const { user, logout } = useUser();
  const router = useRouter();

  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [dailySummaries, setDailySummaries] = useState<DailySummaryViewData[]>([]);
  const [transactions, setTransactions] = useState<SaleTransaction[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('dailySummary');
  const [currentTransactionPeriod, setCurrentTransactionPeriod] = useState<TransactionPeriod | null>(null);
  const [customDateFilters, setCustomDateFilters] = useState({ startDate: '', endDate: '' });
  
  // Derive default date ranges using useMemo to avoid re-calculating on every render
  const defaultDateRanges = useMemo(() => {
    const nowIST = getNowInClientIST();
    const today = getISODateStringForClient(nowIST);
    
    const endLast7 = new Date(nowIST);
    const startLast7 = new Date(nowIST);
    startLast7.setDate(nowIST.getDate() - 6);

    return {
        today,
        last7Days: { 
            start: getISODateStringForClient(startLast7), 
            end: getISODateStringForClient(endLast7) 
        },
    };
  }, []); // Empty dependency array: calculate once

  const [dailySummaryRange, setDailySummaryRange] = useState({ 
    startDate: defaultDateRanges.last7Days.start, // Default to last 7 days
    endDate: defaultDateRanges.last7Days.end 
  });


  useEffect(() => {
    if (!user) {
      router.push('/vendor/login');
      return;
    }
    const fetchStatsData = async () => { // Renamed to avoid conflict
      setIsLoadingStats(true); setError(null);
      try {
        const response = await fetch(`/api/sales/vendor-history?staffId=${user.id}&mode=stats`);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Failed to fetch sales statistics');
        }
        const data = await response.json();
        setOverallStats(data.stats);
        if(data.stats?.today?.totalSalesValue === undefined) { // Check if today's data specifically is missing
            console.warn("Today's stats might be missing from API response", data.stats);
        }
      } catch (err: any) { setError(err.message); toast.error(err.message); }
      finally { setIsLoadingStats(false); }
    };
    fetchStatsData();
  }, [user, router]);

  const fetchDailySummaries = useCallback(async (start: string, end: string) => {
    if (!user?.id || !start || !end) return;
    setIsLoadingDaily(true); setError(null);
    const params = new URLSearchParams({ staffId: user.id, mode: 'dailySummaries', startDate: start, endDate: end });
    try {
      const response = await fetch(`/api/sales/vendor-history?${params.toString()}`);
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.message ||'Failed to fetch daily summaries');}
      const data = await response.json();
      setDailySummaries(data.dailySummaries || []);
    } catch (err: any) { setError(err.message); toast.error(err.message); setDailySummaries([]); }
    finally { setIsLoadingDaily(false); }
  }, [user]); // Removed dailySummaryRange from deps, pass dates directly

  // Fetch daily summaries when range is set/changed OR viewMode becomes 'dailySummary'
  useEffect(() => {
    if (viewMode === 'dailySummary' && dailySummaryRange.startDate && dailySummaryRange.endDate) {
        fetchDailySummaries(dailySummaryRange.startDate, dailySummaryRange.endDate);
    }
  }, [viewMode, dailySummaryRange, fetchDailySummaries]);

  const fetchTransactions = useCallback(async (periodType: TransactionPeriod, page: number = 1, customSDate?: string, customEDate?: string) => {
    if (!user?.id) return;
    setIsLoadingTransactions(true); setError(null);
    // setTransactions([]); // Clear previous only if it's a new type of request, not for pagination
    // setPagination(null);  
    setCurrentTransactionPeriod(periodType);

    const params = new URLSearchParams({ staffId: user.id, mode: 'transactions', page: String(page), limit: '30' });
    let sDate = '', eDate = '';
    const nowIST = getNowInClientIST();

    if (periodType === 'today') {
      sDate = getISODateStringForClient(nowIST); eDate = sDate;
    } else if (periodType === 'thisWeek') {
      const endOfWeek = new Date(nowIST);
      const startOfWeek = new Date(nowIST);
      const day = nowIST.getDay();
      const diffToMonday = nowIST.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diffToMonday);
      sDate = getISODateStringForClient(startOfWeek); eDate = getISODateStringForClient(endOfWeek); // Note: endOfWeek needs to be end of current week
      const tempEnd = new Date(startOfWeek);
      tempEnd.setDate(startOfWeek.getDate() + 6);
      eDate = getISODateStringForClient(tempEnd);

    } else if (periodType === 'thisMonth') {
      const startOfMonth = new Date(nowIST.getFullYear(), nowIST.getMonth(), 1);
      const endOfMonth = new Date(nowIST.getFullYear(), nowIST.getMonth() + 1, 0);
      sDate = getISODateStringForClient(startOfMonth); eDate = getISODateStringForClient(endOfMonth);
    } else if (periodType === 'custom' && customSDate && customEDate) {
      sDate = customSDate; eDate = customEDate;
    } else { setIsLoadingTransactions(false); return; }
    
    params.append('startDate', sDate);
    params.append('endDate', eDate);

    try {
      const response = await fetch(`/api/sales/vendor-history?${params.toString()}`);
      if (!response.ok) {const errData = await response.json(); throw new Error(errData.message || 'Failed to fetch transactions');}
      const data = await response.json();
      setTransactions(data.transactions || []);
      setPagination(data.pagination || null);
    } catch (err: any) { setError(err.message); toast.error(err.message); setTransactions([]); setPagination(null); }
    finally { setIsLoadingTransactions(false); }
  }, [user]);


  useEffect(() => {
    if (viewMode === 'transactions' && !currentTransactionPeriod) {
        fetchTransactions('today', 1);
    }
    // Daily summary is fetched by its own effect based on dailySummaryRange
  }, [viewMode, currentTransactionPeriod, fetchTransactions]);


  const handleCustomDateFilterApply = () => {
    if (!customDateFilters.startDate || !customDateFilters.endDate) {
        toast.warning("Please select both start and end dates.");
        return;
    }
    if (new Date(customDateFilters.startDate) > new Date(customDateFilters.endDate)) {
        toast.error("Start date cannot be after end date.");
        return;
    }

    if (viewMode === 'dailySummary') {
        setDailySummaryRange({ startDate: customDateFilters.startDate, endDate: customDateFilters.endDate});
    } else if (viewMode === 'transactions') {
        fetchTransactions('custom', 1, customDateFilters.startDate, customDateFilters.endDate);
    }
  };
  
  const StatCard = ({ title, value, packets, displayDate }: { title: string; value?: number; packets?: number; displayDate?: string }) => (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription className="flex justify-between items-center text-xs sm:text-sm">
            <span>{title}</span>
            {displayDate && <span className="text-muted-foreground">{displayDate}</span>}
        </CardDescription>
        <CardTitle className="text-xl sm:text-2xl md:text-3xl pt-1">
          {isLoadingStats ? <Loader2 className="h-5 w-5 animate-spin" /> : (value !== undefined ? `₹${value.toFixed(2)}` : '₹0.00')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground">
          {isLoadingStats ? '-' : (packets !== undefined ? `${packets} packets` : '0 packets')}
        </p>
      </CardContent>
    </Card>
  );
  
  // Correctly get today's date for input max attribute
  const todayForInputMax = useMemo(() => getISODateStringForClient(new Date()), []);


  if (!user) { 
    return (<main className="flex min-h-screen flex-col items-center justify-center p-4"><Loader2 className="h-12 w-12 animate-spin text-primary" /></main>);
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-6 flex flex-wrap gap-2 justify-between items-center">
            <Link href="/vendor/scan" passHref><Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Scan</Button></Link>
            <h1 className="text-xl md:text-2xl font-semibold">Sales Dashboard - {user.name}</h1>
            <Button variant="ghost" size="sm" onClick={() => { logout(); router.push('/'); }}>Logout</Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <StatCard title="Today's Sales" value={overallStats?.today?.totalSalesValue} packets={overallStats?.today?.totalTransactions} displayDate={overallStats?.today?.displayDate} />
            <StatCard title="This Week's Sales" value={overallStats?.thisWeek?.totalSalesValue} packets={overallStats?.thisWeek?.totalTransactions} displayDate={overallStats?.thisWeek?.displayDate} />
            <StatCard title="This Month's Sales" value={overallStats?.thisMonth?.totalSalesValue} packets={overallStats?.thisMonth?.totalTransactions} displayDate={overallStats?.thisMonth?.displayDate} />
            </div>
            
            {/* View Options & Filters Card */}
            <Card className="mb-6">
                <CardHeader><CardTitle>View Options & Filters</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => { setViewMode('dailySummary'); setCurrentTransactionPeriod(null);}} variant={viewMode === 'dailySummary' ? 'default' : 'outline'}><CalendarDays className="mr-2 h-4 w-4"/>Daily Summary</Button>
                        <Button onClick={() => setViewMode('transactions')} variant={viewMode === 'transactions' ? 'default' : 'outline'}><List className="mr-2 h-4 w-4"/>Individual Transactions</Button>
                    </div>
                    {viewMode === 'transactions' && (
                        <div className="flex flex-wrap gap-2 border-t pt-4">
                            <Button onClick={() => fetchTransactions('today', 1)} variant={currentTransactionPeriod === 'today' ? "secondary" : "outline"} size="sm" disabled={isLoadingTransactions}>Today</Button>
                            <Button onClick={() => fetchTransactions('thisWeek', 1)} variant={currentTransactionPeriod === 'thisWeek' ? "secondary" : "outline"} size="sm" disabled={isLoadingTransactions}>This Week</Button>
                            <Button onClick={() => fetchTransactions('thisMonth', 1)} variant={currentTransactionPeriod === 'thisMonth' ? "secondary" : "outline"} size="sm" disabled={isLoadingTransactions}>This Month</Button>
                        </div>
                    )}
                    <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end border-t pt-4">
                        <div className="flex-grow space-y-1 w-full sm:w-auto">
                            <Label htmlFor="customStartDate">Start Date</Label>
                            <Input type="date" id="customStartDate" value={customDateFilters.startDate} onChange={(e) => setCustomDateFilters(prev => ({...prev, startDate: e.target.value}))} max={todayForInputMax}/>
                        </div>
                        <div className="flex-grow space-y-1 w-full sm:w-auto">
                            <Label htmlFor="customEndDate">End Date</Label>
                            <Input type="date" id="customEndDate" value={customDateFilters.endDate} onChange={(e) => setCustomDateFilters(prev => ({...prev, endDate: e.target.value}))} max={todayForInputMax}/>
                        </div>
                        <Button onClick={handleCustomDateFilterApply} disabled={isLoadingDaily || isLoadingTransactions} className="w-full sm:w-auto">
                            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingDaily || isLoadingTransactions ? 'animate-spin' : ''}`} />
                            {viewMode === 'dailySummary' ? 'Apply to Daily View' : 'Search Custom Range'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Data Display Card */}
            <Card>
                <CardHeader>
                    <CardTitle>{viewMode === 'dailySummary' ? 'Daily Sales Summary' : 'Individual Transactions'}</CardTitle>
                    <CardDescription>
                        {viewMode === 'dailySummary' ? `Showing daily totals for ${dailySummaryRange.startDate || 'default range'} to ${dailySummaryRange.endDate || ''}` : 
                        currentTransactionPeriod ? `Showing ${currentTransactionPeriod.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} transactions` : 'Select a period or apply custom dates to view transactions.'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {error && <p className="text-destructive text-center py-10">Error: {error}</p>}
                    {(isLoadingDaily && viewMode === 'dailySummary') && <div className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> Loading daily summaries...</div>}
                    {(isLoadingTransactions && viewMode === 'transactions') && <div className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> Loading transactions...</div>}
                    
                    {viewMode === 'dailySummary' && !isLoadingDaily && !error && (
                        dailySummaries.length > 0 ? (
                            <ScrollArea className="w-full whitespace-nowrap rounded-md border"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Total Packets</TableHead><TableHead className="text-right">Total Value (₹)</TableHead></TableRow></TableHeader><TableBody>{dailySummaries.map(s => (<TableRow key={s.date}><TableCell>{new Date(s.date + 'T00:00:00Z').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</TableCell><TableCell className="text-right">{s.totalTransactions}</TableCell><TableCell className="text-right">₹{s.totalSalesValue.toFixed(2)}</TableCell></TableRow>))}</TableBody></Table><ScrollBar orientation="horizontal"/></ScrollArea>
                        ) : <p className="text-center py-10 text-muted-foreground">No daily summaries found for the selected period.</p>
                    )}

                    {viewMode === 'transactions' && !isLoadingTransactions && !error && (
                        transactions.length > 0 ? (
                            <><ScrollArea className="w-full whitespace-nowrap rounded-md border"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Product</TableHead><TableHead>Article No</TableHead><TableHead className="text-right">Weight (g)</TableHead><TableHead className="text-right">Price (₹)</TableHead></TableRow></TableHeader><TableBody>{transactions.map(tx => (<TableRow key={tx.id}><TableCell>{new Date(tx.timestamp).toLocaleDateString()}</TableCell><TableCell>{new Date(tx.timestamp).toLocaleTimeString()}</TableCell><TableCell>{tx.productName || 'N/A'}</TableCell><TableCell>{tx.articleNo}</TableCell><TableCell className="text-right">{tx.weightGrams}</TableCell><TableCell className="text-right">₹{tx.calculatedSellPrice.toFixed(2)}</TableCell></TableRow>))}</TableBody></Table><ScrollBar orientation="horizontal"/></ScrollArea>
                            {pagination && pagination.totalPages > 1 && (
                                <div className="flex justify-center items-center space-x-2 mt-4">
                                    <Button variant="outline" size="sm" onClick={() => currentTransactionPeriod && fetchTransactions(currentTransactionPeriod, pagination.currentPage - 1, currentTransactionPeriod === 'custom' ? customDateFilters.startDate : undefined, currentTransactionPeriod === 'custom' ? customDateFilters.endDate : undefined)} disabled={pagination.currentPage <= 1 || isLoadingTransactions}><ChevronLeft className="h-4 w-4"/> Prev</Button>
                                    <span className="text-sm">Page {pagination.currentPage} of {pagination.totalPages}</span>
                                    <Button variant="outline" size="sm" onClick={() => currentTransactionPeriod && fetchTransactions(currentTransactionPeriod, pagination.currentPage + 1, currentTransactionPeriod === 'custom' ? customDateFilters.startDate : undefined, currentTransactionPeriod === 'custom' ? customDateFilters.endDate : undefined)} disabled={pagination.currentPage >= pagination.totalPages || isLoadingTransactions}>Next <ChevronRight className="h-4 w-4"/></Button>
                                </div>
                            )}</>
                        ) : (currentTransactionPeriod || (customDateFilters.startDate && customDateFilters.endDate && viewMode === 'transactions')) ? <p className="text-center py-10 text-muted-foreground">No transactions found for the selected period.</p> : <p className="text-center py-10 text-muted-foreground">Select a period or apply custom dates to view transactions.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    </main>
  );
}