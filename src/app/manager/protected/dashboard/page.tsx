// src/app/manager/protected/dashboard/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShoppingBag, Users, Package, Target, CalendarDays, TrendingUp } from 'lucide-react'; // Ensure all icons are imported
import { 
  ResponsiveContainer, 
  LineChart, Line, 
  XAxis, YAxis, 
  CartesianGrid, Tooltip, 
  Legend, BarChart, Bar
} from 'recharts';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

// --- Interface definitions (ensure these match your API response) ---
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
  salesPerStaff: StaffSaleSummary[];
  salesByHour?: HourlySalePoint[];
}

// MODIFIED WeeklyPacingInfo to match API
interface WeeklyPacingInfo {
  weekLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  overallTarget: number;
  achievedInWeekSoFar: number;
  remainingTargetAmountOverall: number; // Overall remaining for the week
  daysLeftInWeekIncludingToday: number;
  targetForTodayAndAverageRemaining: number | null; // THIS IS THE KEY NEW FIELD
  isTargetConfigured: boolean;
}

interface DashboardData {
  todaySnapshot: TodaySnapshot;
  salesTrendData: DailySalePoint[];
  topSellingItems: ItemSaleSummary[];
  weeklyPacing: WeeklyPacingInfo; 
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
        console.log("Fetched Dashboard Data for Pacing:", data); // For debugging
        setDashboardData(data);
      } catch (err: any)
{
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

  // Destructure for easier access
  const { todaySnapshot, weeklyPacing } = dashboardData;

  // Calculate progress for TODAY against its dynamic daily target
  const todayProgressVsDailyTarget = weeklyPacing?.isTargetConfigured && 
                                    weeklyPacing.targetForTodayAndAverageRemaining !== null && 
                                    weeklyPacing.targetForTodayAndAverageRemaining > 0
    ? (todaySnapshot.totalSales / weeklyPacing.targetForTodayAndAverageRemaining) * 100
    : 0;
  
  // Fallback if targetForToday is 0 (meaning already met or not applicable)
  // but sales are made, show 100% or a specific state.
  // If targetForToday is 0 because it's met, and today's sales are >0, it means overachieving.
  const displayProgress = (weeklyPacing?.isTargetConfigured && weeklyPacing.targetForTodayAndAverageRemaining === 0 && todaySnapshot.totalSales > 0)
    ? 100 
    : Math.min(todayProgressVsDailyTarget, 100);


  const hasSalesByHourData = todaySnapshot.salesByHour?.some(h => h.totalSales > 0 || h.transactionCount > 0);

  return (
    <> 
      {/* Today's Snapshot & Weekly Pacing */}
      <section>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Total Sales Today Card - Main value is today's sales, "vs Target" is weekly */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales Today</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{todaySnapshot.totalSales.toFixed(2)}</div>
              
              {weeklyPacing && weeklyPacing.isTargetConfigured ? (
                <>
                  {weeklyPacing.targetForTodayAndAverageRemaining !== null ? (
                    <p className="text-xs text-muted-foreground">
                      vs Today's Goal ₹{weeklyPacing.targetForTodayAndAverageRemaining.toFixed(2)}
                      {weeklyPacing.weekLabel && ` (${weeklyPacing.weekLabel})`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Pacing for {weeklyPacing.weekLabel || 'current week'}...
                    </p>
                  )}
                  <Progress 
                    value={displayProgress} 
                    className="mt-2 mb-2 h-2" 
                    aria-label={`${displayProgress.toFixed(0)}% of today's goal`}
                  />
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="flex items-center">
                      <Target className="h-3 w-3 mr-1.5 text-blue-500" />
                      <span>
                        Week Target: ₹{weeklyPacing.overallTarget.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Target className="h-3 w-3 mr-1.5 text-green-500" />
                      <span>
                        Week Achieved (so far): ₹{weeklyPacing.achievedInWeekSoFar.toFixed(2)}
                      </span>
                    </div>
                     {weeklyPacing.remainingTargetAmountOverall <= 0 && (
                       <div className="flex items-center">
                          {/* <CheckCircle className="h-3 w-3 mr-1.5 text-green-600" /> Using Target for consistency */}
                          <Target className="h-3 w-3 mr-1.5 text-green-600" />
                          <span className="text-green-600 font-semibold">Weekly Target Achieved! 🎉</span>
                       </div>
                    )}
                    {/* Message if today's goal is met/exceeded */}
                    {weeklyPacing.targetForTodayAndAverageRemaining !== null && todaySnapshot.totalSales >= weeklyPacing.targetForTodayAndAverageRemaining && weeklyPacing.targetForTodayAndAverageRemaining > 0 && (
                        <div className="flex items-center text-emerald-600 font-medium">
                             {/* <TrendingUp className="h-3 w-3 mr-1.5" /> */}
                             <span>Today's goal met/exceeded!</span>
                        </div>
                    )}
                    <div className="flex items-center">
                      <CalendarDays className="h-3 w-3 mr-1.5 text-sky-500" />
                      <span>
                        Days Left (Week): {weeklyPacing.daysLeftInWeekIncludingToday}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Weekly target not set for current period.</p>
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
                    <Table className=" text-sm"> {/* Added text-sm and slightly increased min-width */}
                        <TableHeader>
                            <TableRow>
                                <TableHead className="px-4 py-2 ">Article Name</TableHead>
                                <TableHead className="px-4 py-2 ">Article No</TableHead>
                                <TableHead className="text-right px-4 py-2 ">Total Value (₹)</TableHead>
                                <TableHead className="text-right px-4 py-2 ">Total Qty (g)</TableHead>
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