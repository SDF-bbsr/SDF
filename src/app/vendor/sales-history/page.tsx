// src/app/vendor/sales-history/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react'; // Added useCallback
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, RefreshCw, List, CalendarDays } from 'lucide-react'; // Added List, CalendarDays
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'; // Added ScrollArea, ScrollBar for tables

interface SaleTransaction {
  id: string;
  articleNo: string;
  weightGrams: number;
  calculatedSellPrice: number;
  timestamp: string; // ISO String
  dateOfSale: string; // YYYY-MM-DD format
}

interface SalesStats {
  totalValue: number;
  totalPackets: number;
}

interface SalesHistoryData {
  stats: {
    today: SalesStats;
    last7Days: SalesStats;
    last30Days: SalesStats;
  };
  transactions: SaleTransaction[];
}

interface DailySummary {
  date: string;
  totalPacketsSold: number;
  totalSaleValue: number;
}

type ViewMode = 'individual' | 'daily';

export default function VendorSalesHistoryPage() {
  const { user, logout } = useUser();
  const router = useRouter();
  const [historyData, setHistoryData] = useState<SalesHistoryData | null>(null);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
  });
  const [viewMode, setViewMode] = useState<ViewMode>('daily'); // Default to daily summary

  const fetchHistory = useCallback(async () => { // Wrapped in useCallback
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);

    const queryParams = new URLSearchParams();
    queryParams.append('staffId', user.id);
    if (filters.startDate) queryParams.append('startDate', filters.startDate);
    if (filters.endDate) queryParams.append('endDate', filters.endDate);
    // Fetch more if daily summary is default, or if a wide date range is selected
    // Let API handle limit for now, client can process what it gets
    // queryParams.append('limit', '500'); 

    try {
      const response = await fetch(`/api/sales/vendor-history?${queryParams.toString()}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to fetch sales history');
      }
      const data: SalesHistoryData = await response.json();
      setHistoryData(data);
    } catch (err: any) {
      setError(err.message);
      setHistoryData(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, filters]); // Dependencies for useCallback

  useEffect(() => {
    if (!user) {
      router.push('/vendor/login');
    } else {
      fetchHistory();
    }
  }, [user, router, fetchHistory]); // fetchHistory is now stable

  // Calculate daily summaries when historyData changes
  useEffect(() => {
    if (historyData && historyData.transactions) {
      const summaries: { [date: string]: Omit<DailySummary, 'date'> } = {};
      historyData.transactions.forEach(tx => {
        const date = tx.dateOfSale; // Assumes YYYY-MM-DD format
        if (!summaries[date]) {
          summaries[date] = { totalPacketsSold: 0, totalSaleValue: 0 };
        }
        summaries[date].totalPacketsSold += 1;
        summaries[date].totalSaleValue += tx.calculatedSellPrice;
      });

      const formattedSummaries = Object.entries(summaries)
        .map(([date, data]) => ({
          date,
          ...data,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date descending
      setDailySummaries(formattedSummaries);
    } else {
      setDailySummaries([]);
    }
  }, [historyData]);


  const handleApplyFilters = () => {
    if (user) {
      fetchHistory();
    }
  };

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </main>
    );
  }

  const StatCard = ({ title, value, packets }: { title: string; value: number; packets: number }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl md:text-3xl">₹{value.toFixed(2)}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{packets} packets</p>
      </CardContent>
    </Card>
  );

  return (
    <main className="min-h-screen p-4 md:p-8 bg-slate-50 dark:bg-slate-900">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex flex-wrap gap-2 justify-between items-center">
          <Link href="/vendor/scan" >
            <Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Scan</Button>
          </Link>
          <h1 className="text-xl md:text-2xl font-semibold">Sales History - {user.name}</h1>
          <Button variant="ghost" size="sm" onClick={() => { logout(); router.push('/'); }}>Logout</Button>
        </div>

        {isLoading && !historyData && (<div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin inline-block text-primary" /> Loading stats...</div>)}
        {historyData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatCard title="Today's Sales" value={historyData.stats.today.totalValue} packets={historyData.stats.today.totalPackets} />
            <StatCard title="Last 7 Days" value={historyData.stats.last7Days.totalValue} packets={historyData.stats.last7Days.totalPackets} />
            <StatCard title="Last 30 Days" value={historyData.stats.last30Days.totalValue} packets={historyData.stats.last30Days.totalPackets} />
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter Transactions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
            <div className="flex-grow space-y-1 w-full sm:w-auto">
              <Label htmlFor="startDate">Start Date</Label>
              <Input type="date" id="startDate" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}/>
            </div>
            <div className="flex-grow space-y-1 w-full sm:w-auto">
              <Label htmlFor="endDate">End Date</Label>
              <Input type="date" id="endDate" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}/>
            </div>
            <Button onClick={handleApplyFilters} disabled={isLoading} className="w-full sm:w-auto">
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Apply Filters
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{viewMode === 'individual' ? 'Individual Transactions' : 'Daily Sales Summary'}</CardTitle>
              <CardDescription>
                {viewMode === 'individual' 
                  ? "Detailed list of sales." 
                  : "Summary of sales per day."} Apply filters for specific date ranges.
              </CardDescription>
            </div>
            <Button onClick={() => setViewMode(prev => prev === 'individual' ? 'daily' : 'individual')} variant="outline">
              {viewMode === 'individual' ? <CalendarDays className="mr-2 h-4 w-4" /> : <List className="mr-2 h-4 w-4" />}
              {viewMode === 'individual' ? 'View Daily Summary' : 'View Individual Sales'}
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            )}
            {error && !isLoading && (
              <p className="text-destructive text-center py-10">Error: {error}</p>
            )}
            {!isLoading && !error && historyData && (
              viewMode === 'individual' ? (
                historyData.transactions.length > 0 ? (
                  <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="py-2 px-3">Date</TableHead>
                          <TableHead className="py-2 px-3">Time</TableHead>
                          <TableHead className="py-2 px-3">Article No</TableHead>
                          <TableHead className="text-right py-2 px-3">Weight (g)</TableHead>
                          <TableHead className="text-right py-2 px-3">Sell Price (₹)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyData.transactions.map((tx) => (
                          <TableRow key={tx.id} className="hover:bg-muted/50">
                            <TableCell>{new Date(tx.timestamp).toLocaleDateString()}</TableCell>
                            <TableCell>{new Date(tx.timestamp).toLocaleTimeString()}</TableCell>
                            <TableCell>{tx.articleNo}</TableCell>
                            <TableCell className="text-right">{tx.weightGrams}</TableCell>
                            <TableCell className="text-right">{tx.calculatedSellPrice.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  <p className="text-center py-10 text-muted-foreground">No individual transactions found for your criteria.</p>
                )
              ) : ( // Daily Summary View
                dailySummaries.length > 0 ? (
                  <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="py-2 px-3">Date</TableHead>
                          <TableHead className="text-right py-2 px-3">Total Packets Sold</TableHead>
                          <TableHead className="text-right py-2 px-3">Total Sale Value (₹)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailySummaries.map((summary) => (
                          <TableRow key={summary.date} className="hover:bg-muted/50">
                            <TableCell className="font-medium">
                              {new Date(summary.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                            </TableCell>
                            <TableCell className="text-right">{summary.totalPacketsSold}</TableCell>
                            <TableCell className="text-right">₹{summary.totalSaleValue.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  <p className="text-center py-10 text-muted-foreground">No data available to generate daily summary for your criteria.</p>
                )
              )
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}