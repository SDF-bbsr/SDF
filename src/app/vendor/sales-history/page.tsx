"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, List, CalendarDays, RefreshCw, ChevronLeft, ChevronRight, Target, TrendingUp, TrendingDown } from 'lucide-react'; // Added Target
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Progress } from "@/components/ui/progress"; // Assuming you have a Progress component or will add one

// --- Interfaces (Matching API Response) ---
interface SaleTransaction {
  id: string;
  articleNo: string;
  productName?: string;
  weightGrams: number;
  calculatedSellPrice: number;
  timestamp: string; // ISO String
  dateOfSale: string; // YYYY-MM-DD
}

interface StaffSalesSummaryType {
  totalSalesValue: number;
  totalTransactions: number;
  displayDate?: string;
}

// New interface for weekly target data from API
interface CurrentWeekTargetInfo {
    achievedAmount: number;
    targetAmount: number;
    weekLabel: string;
    startDate: string;
    endDate: string;
    isSet: boolean;
    staffName?: string;
}

interface OverallStats { // Only today's stats remain here
  today: StaffSalesSummaryType;
}

interface ApiStatsResponse { // To handle the full API response structure
    stats: OverallStats;
    currentWeekTarget: CurrentWeekTargetInfo | null;
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

const IST_TIMEZONE_CLIENT = 'Asia/Kolkata';
const getISODateStringForClient = (date: Date): string => {
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
  const [currentWeekTarget, setCurrentWeekTarget] = useState<CurrentWeekTargetInfo | null>(null); // State for new target card

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
  }, []);

  const [dailySummaryRange, setDailySummaryRange] = useState({ 
    startDate: defaultDateRanges.last7Days.start,
    endDate: defaultDateRanges.last7Days.end 
  });


  useEffect(() => {
    if (!user) {
      router.push('/vendor/login');
      return;
    }
    const fetchOverallData = async () => { // Renamed to fetch all initial data
      setIsLoadingStats(true); setError(null);
      try {
        // Pass staffName if you want it back for display, API makes it optional
        const response = await fetch(`/api/sales/vendor-history?staffId=${user.id}&staffName=${encodeURIComponent(user.name)}&mode=stats`);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Failed to fetch sales statistics');
        }
        const data: ApiStatsResponse = await response.json();
        setOverallStats(data.stats);
        setCurrentWeekTarget(data.currentWeekTarget); // Set the new target data

        if(data.stats?.today?.totalSalesValue === undefined) {
            console.warn("Today's stats might be missing from API response", data.stats);
        }
      } catch (err: any) { setError(err.message); toast.error(err.message); }
      finally { setIsLoadingStats(false); }
    };
    fetchOverallData();
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
  }, [user]);

  useEffect(() => {
    if (viewMode === 'dailySummary' && dailySummaryRange.startDate && dailySummaryRange.endDate) {
        fetchDailySummaries(dailySummaryRange.startDate, dailySummaryRange.endDate);
    }
  }, [viewMode, dailySummaryRange, fetchDailySummaries]);

  const fetchTransactions = useCallback(async (periodType: TransactionPeriod, page: number = 1, customSDate?: string, customEDate?: string) => {
    if (!user?.id) return;
    setIsLoadingTransactions(true); setError(null);
    setCurrentTransactionPeriod(periodType);

    const params = new URLSearchParams({ staffId: user.id, mode: 'transactions', page: String(page), limit: '30' });
    let sDate = '', eDate = '';
    const nowIST = getNowInClientIST();

    if (periodType === 'today') {
      sDate = getISODateStringForClient(nowIST); eDate = sDate;
    } else if (periodType === 'thisWeek') {
      // For "This Week" filter, use Monday-Sunday logic
      const currentDay = nowIST.getDay(); // 0 (Sun) - 6 (Sat)
      const diffToMonday = nowIST.getDate() - currentDay + (currentDay === 0 ? -6 : 1); // Adjust for Sunday
      const startOfWeek = new Date(nowIST.setDate(diffToMonday));
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      sDate = getISODateStringForClient(startOfWeek);
      eDate = getISODateStringForClient(endOfWeek);
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

  // New Target Card Component
  const WeeklyTargetCard = ({ data, isLoading }: { data: CurrentWeekTargetInfo | null; isLoading: boolean }) => {
    if (isLoading) {
      return (
        <Card className="md:col-span-2"> {/* Span 2 columns if you want it wider */}
          <CardHeader><CardTitle>This Week's Target</CardTitle></CardHeader>
          <CardContent className="flex justify-center items-center h-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      );
    }
    if (!data) {
      return (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center"><Target className="mr-2 h-5 w-5 text-muted-foreground"/>This Week's Target</CardTitle>
            <CardDescription>Data for current week's target is unavailable.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center py-4">Could not load target information.</p>
          </CardContent>
        </Card>
      );
    }

    const { achievedAmount, targetAmount, weekLabel, isSet, staffName, startDate, endDate } = data; // Added startDate, endDate
    
    // Calculate actual percentage without premature rounding for display
    const rawPercentage = targetAmount > 0 ? (achievedAmount / targetAmount) * 100 : 0;
    
    // For the progress bar, cap at 100
    const progressBarPercentage = Math.min(rawPercentage, 100); 

    const isTargetExceeded = rawPercentage > 100 && targetAmount > 0; // Use rawPercentage for more accurate check

    // Format dates for display
    const formatDatePart = (dateString: string) => {
        if (!dateString || dateString.length < 10) return '';
        // Assuming dateString is "YYYY-MM-DD"
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}`; // DD-MM
        }
        return dateString.substring(5); // Fallback MM-DD
    };
    const displayStartDate = formatDatePart(startDate);
    const displayEndDate = formatDatePart(endDate);

    return (
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center text-lg sm:text-xl">
            <Target className="mr-2 h-5 w-5 text-primary"/>
            {staffName ? `${staffName}'s Target` : "This Week's Target"} 
          </CardTitle>
          {/* Displaying Week Label and the actual date range */}
          <CardDescription>{weekLabel} ({displayStartDate} to {displayEndDate})</CardDescription>
        </CardHeader>
        <CardContent>
          {!isSet ? (
            <p className="text-center text-muted-foreground py-4">Target not set for this week.</p>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <span className={`text-2xl font-bold ${isTargetExceeded ? 'text-green-500' : ''}`}>
                  ₹{achievedAmount.toFixed(2)}
                </span>
                <span className="text-sm text-muted-foreground">
                  / ₹{targetAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Achieved</span>
                <span>Target</span>
              </div>
              <Progress value={progressBarPercentage} className="h-3 mt-2" />
              
              {/* Updated conditional rendering for percentage text */}
              {isTargetExceeded ? (
                <p className="text-sm text-green-600 font-medium flex items-center">
                  <TrendingUp className="mr-1 h-4 w-4"/> Target Achieved!
                </p>
              ) : targetAmount > 0 ? ( // Only show percentage if target is set
                <p className="text-sm text-orange-600 font-medium flex items-center">
                    {rawPercentage.toFixed(2)}% of target reached
                </p>
              ) : null}

            </div>
          )}
        </CardContent>
      </Card>
    );
  };
  
  const todayForInputMax = useMemo(() => getISODateStringForClient(new Date()), []);

  if (!user) { 
    return (<main className="flex min-h-screen flex-col items-center justify-center p-4"><Loader2 className="h-12 w-12 animate-spin text-primary" /></main>);
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-6xl mx-auto">
            <div className="mb-6 flex flex-wrap gap-2 justify-between items-center">
            <Link href="/vendor/scan" passHref><Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Scan</Button></Link>
            <h1 className="text-xl md:text-2xl font-semibold">Sales Dashboard - {user.name}</h1>
            <Button variant="ghost" size="sm" onClick={() => { logout(); router.push('/'); }}>Logout</Button>
            </div>

            {/* Stats Cards - MODIFIED */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatCard title="Today's Sales" value={overallStats?.today?.totalSalesValue} packets={overallStats?.today?.totalTransactions} displayDate={overallStats?.today?.displayDate} />
              {/* WeeklyTargetCard will take up 2 columns if md:col-span-2 is used */}
              <WeeklyTargetCard data={currentWeekTarget} isLoading={isLoadingStats} />
              {/* Removed: This Week's Sales and This Month's Sales cards */}
            </div>
            
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

            <Card>
                <CardHeader>
                    <CardTitle>{viewMode === 'dailySummary' ? 'Daily Sales Summary' : 'Individual Transactions'}</CardTitle>
                    <CardDescription>
                        {viewMode === 'dailySummary' ? `Showing daily totals for ${dailySummaryRange.startDate || 'default range'} to ${dailySummaryRange.endDate || ''}` : 
                        currentTransactionPeriod ? `Showing ${currentTransactionPeriod.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase())} transactions` : 'Select a period or apply custom dates to view transactions.'}
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