// src/app/(manager)/protected/dashboard/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShoppingBag, Users, Package, Clock } from 'lucide-react'; // Updated icons
import { 
  ResponsiveContainer, 
  LineChart, Line, 
  XAxis, YAxis, 
  CartesianGrid, Tooltip, 
  Legend, BarChart, Bar
} from 'recharts';


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
  totalSales: number;
  transactionCount: number;
}
interface TodaySnapshot {
  totalSales: number;
  totalReturns: number; // API might still send it, but we won't display it in a dedicated card
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

  return (
    <> 
      {/* Today's Snapshot */}
      <section>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"> {/* Adjusted grid for potentially more cards */}
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

          {/* Sales by Staff Today - Card now takes full width on smaller screens if 3 cols, or spans less on 4 cols */}
          <Card className="md:col-span-2 lg:col-span-2 xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sales by Staff Today</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pl-2 max-h-60 overflow-y-auto"> {/* Added max-height and scroll for many staff */}
               {dashboardData.todaySnapshot.salesPerStaff && dashboardData.todaySnapshot.salesPerStaff.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Staff</TableHead>
                            <TableHead className="text-right">Sales (₹)</TableHead>
                            <TableHead className="text-right">Packets</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {dashboardData.todaySnapshot.salesPerStaff.map(staff => (
                        <TableRow key={staff.staffId}>
                            <TableCell className="font-medium">{staff.staffName || staff.staffId}</TableCell>
                            <TableCell className="text-right">{staff.totalValue.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{staff.totalPackets}</TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
               ) : <p className="text-sm text-muted-foreground py-4 text-center">No sales by staff today.</p>}
            </CardContent>
          </Card>
        </div>
      </section>
      
      {/* Sales Analysis - Charts */}
      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold mb-3">Sales Trend (Last 30 Days)</h2>
          <Card>
            <CardContent className="pt-6 h-72">
              {dashboardData.salesTrendData && dashboardData.salesTrendData.length > 0 ? (
                <ResponsiveContainer width="99%" height="100%">
                  <LineChart data={dashboardData.salesTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(dateStr) => new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                      angle={-30}
                      textAnchor="end"
                      height={50} // Adjust height to accommodate angled labels
                      interval={dashboardData.salesTrendData.length > 15 ? Math.floor(dashboardData.salesTrendData.length / 10) : 0} // Show fewer ticks for many data points
                    />
                    <YAxis tickFormatter={(value: number) => `₹${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toFixed(0)}`} />
                    <Tooltip formatter={(value: number) => [`₹${value.toFixed(2)}`, "Total Sales"]} />
                    <Legend />
                    <Line type="monotone" dataKey="totalSales" stroke="#8884d8" activeDot={{ r: 6 }} name="Total Sales (₹)" strokeWidth={2}/>
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground h-full flex items-center justify-center">Not enough data for sales trend.</p>}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Sales by Hour Today</h2>
          <Card>
            <CardContent className="pt-6 h-72">
              {dashboardData.todaySnapshot.salesByHour && dashboardData.todaySnapshot.salesByHour.length > 0 ? (
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={dashboardData.todaySnapshot.salesByHour}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis yAxisId="left" orientation="left" stroke="#8884d8" tickFormatter={(value: number) => `₹${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toFixed(0)}`}/>
                    <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" tickFormatter={(value: number) => `${value}`}/>
                    <Tooltip
                        formatter={(value: number, name: string) => {
                            if (name === "Total Sales") return [`₹${value.toFixed(2)}`, name];
                            if (name === "Transactions") return [String(value), name];
                            return [String(value), name];
                        }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="totalSales" fill="#8884d8" name="Total Sales (₹)" />
                    <Bar yAxisId="right" dataKey="transactionCount" fill="#82ca9d" name="Transactions" />
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
          <CardContent className="pt-6">
            {dashboardData.topSellingItems && dashboardData.topSellingItems.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Article Name</TableHead>
                            <TableHead>Article No</TableHead>
                            <TableHead className="text-right">Total Value (₹)</TableHead>
                            <TableHead className="text-right">Total Qty (g)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {dashboardData.topSellingItems.map(item => (
                            <TableRow key={item.articleNo}>
                                <TableCell className="font-medium">{item.articleName || 'N/A'}</TableCell>
                                <TableCell>{item.articleNo}</TableCell>
                                <TableCell className="text-right">₹{item.totalValueSold.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{item.totalQuantitySold} g</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ): <p className="text-sm text-muted-foreground py-4 text-center">No items sold today yet.</p>}
          </CardContent>
        </Card>
      </section>
    </>
  );
}