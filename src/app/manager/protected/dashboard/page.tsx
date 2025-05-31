// src/app/manager/protected/dashboard/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShoppingBag, Users, Package } from 'lucide-react'; // Clock icon can be removed if not used elsewhere, as hourly data is now direct
import { 
  ResponsiveContainer, 
  LineChart, Line, 
  XAxis, YAxis, 
  CartesianGrid, Tooltip, 
  Legend, BarChart, Bar
} from 'recharts';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'; // Import ScrollArea and ScrollBar

// --- Interface definitions ---
interface SaleSummary {
  totalValue: number;
  totalPackets: number;
}
interface StaffSaleSummary extends SaleSummary {
  staffId: string;
  staffName?: string;
}
interface DailySalePoint {
  date: string;
  totalSales: number;
}
interface ItemSaleSummary {
  articleNo: string;
  articleName?: string;
  totalQuantitySold: number; // in grams
  totalValueSold: number;
}
interface HourlySalePoint {
  hour: string; // e.g., "09 AM", "05 PM"
  // hourNumeric is mainly for API side sorting, frontend uses 'hour' for display
  totalSales: number;
  transactionCount: number;
}
interface TodaySnapshot {
  totalSales: number;
  // totalReturns: number; // Can be removed if not being displayed based on earlier discussion
  salesPerStaff: StaffSaleSummary[];
  salesByHour?: HourlySalePoint[];
}
interface DashboardData {
  todaySnapshot: TodaySnapshot;
  salesTrendData: DailySalePoint[];
  topSellingItems: ItemSaleSummary[];
  targets: {
    dailyStoreTarget: number;
  };
}
// --- End Interface definitions ---


export default function ManagerDashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/manager/dashboard-summary');
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || 'Failed to load dashboard data');
        }
        const data: DashboardData = await response.json();
        setDashboardData(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="mt-4">Loading Dashboard Content...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-red-500">Error loading dashboard: {error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
      </div>
    );
  }

  if (!dashboardData) {
    return <div className="flex flex-1 items-center justify-center p-4">No dashboard data available.</div>;
  }

  const todayProgress = dashboardData.targets?.dailyStoreTarget
    ? (dashboardData.todaySnapshot.totalSales / dashboardData.targets.dailyStoreTarget) * 100
    : 0;

  // Check if there's any sales data for the hourly chart
  const hasSalesByHourData = dashboardData.todaySnapshot.salesByHour && 
                             dashboardData.todaySnapshot.salesByHour.some(h => h.totalSales > 0 || h.transactionCount > 0);

  return (
    <> 
      {/* Today's Snapshot */}
      <section>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales Today</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{dashboardData.todaySnapshot.totalSales.toFixed(2)}</div>
              {dashboardData.targets?.dailyStoreTarget && (
                <>
                  <p className="text-xs text-muted-foreground">
                      vs Target ₹{dashboardData.targets.dailyStoreTarget.toFixed(2)}
                  </p>
                  <Progress value={Math.min(todayProgress, 100)} className="mt-2 h-2" />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2 lg:col-span-2 xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sales by Staff Today</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="max-h-60 p-0"> {/* Adjusted padding for ScrollArea */}
               {dashboardData.todaySnapshot.salesPerStaff && dashboardData.todaySnapshot.salesPerStaff.length > 0 ? (
                <ScrollArea className="h-full w-full"> {/* Ensure ScrollArea takes full card content height */}
                    <Table className="text-sm"> {/* Add text-sm for consistency */}
                        <TableHeader>
                            <TableRow>
                                <TableHead className="px-4 py-2 min-w-[150px]">Staff</TableHead>
                                <TableHead className="text-right px-4 py-2 min-w-[100px]">Sales (₹)</TableHead>
                                <TableHead className="text-right px-4 py-2 min-w-[80px]">Packets</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {dashboardData.todaySnapshot.salesPerStaff.map(staff => (
                            <TableRow key={staff.staffId}>
                                <TableCell className="font-medium px-4 py-2">{staff.staffName || staff.staffId}</TableCell>
                                <TableCell className="text-right px-4 py-2">{staff.totalValue.toFixed(2)}</TableCell>
                                <TableCell className="text-right px-4 py-2">{staff.totalPackets}</TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" /> {/* Added for safety on very narrow screens */}
                </ScrollArea>
               ) : <p className="text-sm text-muted-foreground py-4 text-center h-full flex items-center justify-center">No sales by staff today.</p>}
            </CardContent>
          </Card>
          {/* You can add another <Card> here if you need a 4th item in the top row for xl screens */}
        </div>
      </section>
      
      {/* Sales Analysis - Charts */}
      <section className="mt-6 grid gap-6 md:grid-cols-1 lg:grid-cols-2"> {/* Changed md:grid-cols-2 to lg:grid-cols-2 for better chart width on medium screens */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Sales Trend (Last 30 Days)</h2>
          <Card>
            <CardContent className="pt-6 h-72 sm:h-80"> {/* Increased height slightly for better view */}
              {dashboardData.salesTrendData && dashboardData.salesTrendData.length > 0 ? (
                <ResponsiveContainer width="99%" height="100%">
                  <LineChart data={dashboardData.salesTrendData} margin={{ top: 5, right: 20, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(dateStr) => new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                      angle={-45} // Angled more for potentially more ticks
                      textAnchor="end"
                      height={60} // Increased height for angled labels
                      // Adjusted interval logic
                      interval={dashboardData.salesTrendData.length > 20 ? 'preserveStartEnd' : (dashboardData.salesTrendData.length > 10 ? 1 : 0) } 
                    />
                    <YAxis tickFormatter={(value: number) => `₹${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value.toFixed(0)}`} />
                    <Tooltip formatter={(value: number) => [`₹${value.toFixed(2)}`, "Total Sales"]} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }}/>
                    <Line type="monotone" dataKey="totalSales" stroke="#3b82f6" activeDot={{ r: 6 }} name="Total Sales (₹)" strokeWidth={2}/>
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground h-full flex items-center justify-center">Not enough data for sales trend.</p>}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Sales by Hour Today</h2>
          <Card>
            <CardContent className="pt-6 h-72 sm:h-80"> {/* Increased height slightly */}
              {hasSalesByHourData ? (
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={dashboardData.todaySnapshot.salesByHour} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" tickFormatter={(value: number) => `₹${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value.toFixed(0)}`}/>
                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" tickFormatter={(value: number) => `${value}`}/>
                    <Tooltip
                        formatter={(value: number, name: string) => {
                            if (name === "Total Sales (₹)") return [`₹${value.toFixed(2)}`, name]; // Match Bar name
                            if (name === "Transactions") return [String(value), name];
                            return [String(value), name];
                        }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="totalSales" fill="#3b82f6" name="Total Sales (₹)" />
                    <Bar yAxisId="right" dataKey="transactionCount" fill="#10b981" name="Transactions" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground h-full flex items-center justify-center">No sales data by hour for today yet.</p>}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Top Selling Items Today */}
       <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Top 5 Selling Items Today</h2>
          <Package className="h-5 w-5 text-muted-foreground" />
        </div>
        <Card>
          <CardContent className="pt-0"> {/* pt-0 if ScrollArea handles padding */}
            {dashboardData.topSellingItems && dashboardData.topSellingItems.length > 0 ? (
                <ScrollArea className="w-full whitespace-nowrap">
                    <Table className="min-w-[650px] text-sm"> {/* Added text-sm and slightly increased min-width */}
                        <TableHeader>
                            <TableRow>
                                <TableHead className="px-4 py-2 min-w-[250px]">Article Name</TableHead>
                                <TableHead className="px-4 py-2 min-w-[120px]">Article No</TableHead>
                                <TableHead className="text-right px-4 py-2 min-w-[130px]">Total Value (₹)</TableHead>
                                <TableHead className="text-right px-4 py-2 min-w-[100px]">Total Qty (g)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {dashboardData.topSellingItems.map(item => (
                            <TableRow key={item.articleNo}>
                                <TableCell className="font-medium px-4 py-2">{item.articleName || 'N/A'}</TableCell>
                                <TableCell className="px-4 py-2">{item.articleNo}</TableCell>
                                <TableCell className="text-right px-4 py-2">₹{item.totalValueSold.toFixed(2)}</TableCell>
                                <TableCell className="text-right px-4 py-2">{item.totalQuantitySold} g</TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            ): <p className="text-sm text-muted-foreground py-4 text-center">No items sold today yet.</p>}
          </CardContent>
        </Card>
      </section>
    </>
  );
}