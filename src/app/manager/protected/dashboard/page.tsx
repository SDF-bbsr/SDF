// src/app/manager/protected/dashboard/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  Loader2, ShoppingBag, Users, Package, Target, CalendarDays, 
  Sparkles, TrendingUp, ListChecks, BookOpenText, // Keep these
  ChevronDown, ChevronRight, DollarSign, Clock, Trophy // <-- ADD THESE ICONS
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, Line, 
  XAxis, YAxis, 
  CartesianGrid, Tooltip, 
  Legend, BarChart, Bar
} from 'recharts';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

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
  totalQuantitySold: number;
  totalValueSold: number;
}
interface HourlySalePoint {
  hour: string;
  totalSales: number;
  transactionCount: number;
}
interface TodaySnapshot {
  totalSales: number;
  salesPerStaff: StaffSaleSummary[];
  salesByHour?: HourlySalePoint[];
}
interface WeeklyPacingInfo {
  weekLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  overallTarget: number;
  achievedInWeekSoFar: number;
  remainingTargetAmountOverall: number;
  daysLeftInWeekIncludingToday: number;
  targetForTodayAndAverageRemaining: number | null;
  isTargetConfigured: boolean;
}
interface DashboardData {
  todaySnapshot: TodaySnapshot;
  salesTrendData: DailySalePoint[];
  topSellingItems: ItemSaleSummary[];
  weeklyPacing: WeeklyPacingInfo; 
}

// NEW: Interface for the AI Sales Insight
interface AIInsightResponse {
    title: string;
    summary: string;
    salesForecast: {
        predictedSales: [number, number];
        reasoning: string;
        confidence: 'Low' | 'Medium' | 'High' | 'Actual';
    };
    analysis: string;
    recommendations: string[];
    // Handle Firestore timestamp object
    lastUpdated: {
        _seconds: number;
        _nanoseconds: number;
    };
}
// --- End Interface definitions ---


// --- Helper Components & Functions ---

// Helper function to format the last updated timestamp from Firestore
const formatLastUpdated = (timestamp: { _seconds: number }) => {
  if (!timestamp?._seconds) return "Not available";
  return new Date(timestamp._seconds * 1000).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

// --- vvv MODIFY THE AIInsightCard COMPONENT vvv ---
const AIInsightCard = ({ insight, isLoading, isExpanded, onToggle }: {
  insight: AIInsightResponse | null;
  isLoading: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
// Skeleton loader for when the insight is fetching
if (isLoading) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <CardTitle>Loading AI Sales Insight...</CardTitle>
      </CardHeader>
    </Card>
  );
}

// Render a minimal message if no insight is available
if (!insight) {
  return (
      <Card className="border-dashed">
          <CardHeader>
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-6 w-6"/>
                  <span>AI Sales Insight Not Available</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground pt-1">No sales insight has been generated for today yet.</p>
          </CardHeader>
      </Card>
  );
}

const confidenceColor = {
  High: 'text-green-600 bg-green-100 dark:bg-green-900/50',
  Medium: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/50',
  Low: 'text-red-600 bg-red-100 dark:bg-red-900/50',
  Actual: 'text-blue-600 bg-blue-100 dark:bg-blue-900/50',
};

return (
  <Card className="w-full bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 transition-all">
    <CardHeader className="p-0">
      <button className="w-full flex justify-between items-center text-left p-4" onClick={onToggle}>
          <div className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-blue-500" />
              <div>
                  <CardTitle className="text-lg text-blue-900 dark:text-blue-300">{insight.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Last generated: {formatLastUpdated(insight.lastUpdated)}</p>
              </div>
          </div>
          {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
      </button>
    </CardHeader>
    
    {isExpanded && (
      <CardContent className="p-4 pt-0">
        <div className="border-t border-blue-200 dark:border-blue-700/50 pt-4">
          <p className="text-sm text-foreground/80 mb-6 italic">
            {insight.summary}
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left side: Forecast and Analysis */}
            <div className="space-y-6">
              <div className="p-4 rounded-lg bg-background/50">
                <h3 className="font-semibold flex items-center gap-2 mb-2"><TrendingUp className="h-5 w-5 text-primary" /> Sales Forecast</h3>
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                  ₹{insight.salesForecast.predictedSales[0].toLocaleString()} - ₹{insight.salesForecast.predictedSales[1].toLocaleString()}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${confidenceColor[insight.salesForecast.confidence]}`}>
                    {insight.salesForecast.confidence} Confidence
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2 italic">"{insight.salesForecast.reasoning}"</p>
              </div>
              <div className="p-4 rounded-lg bg-background/50">
                <h3 className="font-semibold flex items-center gap-2 mb-2"><BookOpenText className="h-5 w-5 text-primary" /> Analysis</h3>
                <p className="text-sm text-muted-foreground">{insight.analysis}</p>
              </div>
            </div>
            {/* Right side: Recommendations */}
            <div className="p-4 rounded-lg bg-background/50">
              <h3 className="font-semibold flex items-center gap-2 mb-3"><ListChecks className="h-5 w-5 text-primary" /> Recommendations</h3>
              <ul className="space-y-3">
                {insight.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2.5 text-sm">
                    <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-blue-500 flex-shrink-0"></div>
                    <span className="text-muted-foreground">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    )}
  </Card>
);
};


export default function ManagerDashboardPage() {
  // State for main dashboard data
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for AI insight data
  const [aiInsight, setAiInsight] = useState<AIInsightResponse | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(true);

  const [isInsightExpanded, setIsInsightExpanded] = useState(false);

  useEffect(() => {
    // Fetches the primary dashboard data
    const fetchDashboardData = async () => {
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
      }
    };

    // Fetches the AI insight data
    const fetchInsightData = async () => {
      try {
        const response = await fetch('/api/insights/getinsights/dashboard');
        // A 404 is not an error, it just means no insight is available yet.
        if (response.status === 404) {
          setAiInsight(null);
          return;
        }
        if (!response.ok) {
          console.error('Failed to fetch AI insight');
          setAiInsight(null); // Silently fail without blocking the page
          return;
        }
        const data: AIInsightResponse = await response.json();
        setAiInsight(data);
      } catch (err: any) {
        console.error("Error fetching AI insight:", err);
        setAiInsight(null); // Handle network or parsing errors
      }
    };

    // Main function to load all data concurrently
    const loadAllData = async () => {
      setIsLoading(true);
      setIsInsightLoading(true);
      setError(null);
      
      // Fetch all data in parallel
      await Promise.all([
        fetchDashboardData(),
        fetchInsightData()
      ]);

      setIsLoading(false);
      setIsInsightLoading(false);
    };

    loadAllData();
  }, []);

  // Main loader for the core dashboard content
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="ml-4">Loading Dashboard Content...</p>
      </div>
    );
  }

  // Error screen if core data fails to load
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-red-500">Error loading dashboard: {error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
      </div>
    );
  }

  // If core data is not available after loading (should be rare)
  if (!dashboardData) {
    return <div className="flex flex-1 items-center justify-center p-4">No dashboard data available.</div>;
  }

  // Destructure for easier access (only after dashboardData is confirmed to exist)
  const { todaySnapshot, weeklyPacing, salesTrendData, topSellingItems } = dashboardData;

  const todayProgressVsDailyTarget = weeklyPacing?.isTargetConfigured && 
                                    weeklyPacing.targetForTodayAndAverageRemaining !== null && 
                                    weeklyPacing.targetForTodayAndAverageRemaining > 0
    ? (todaySnapshot.totalSales / weeklyPacing.targetForTodayAndAverageRemaining) * 100
    : 0;
  
  const displayProgress = (weeklyPacing?.isTargetConfigured && weeklyPacing.targetForTodayAndAverageRemaining === 0 && todaySnapshot.totalSales > 0)
    ? 100 
    : Math.min(todayProgressVsDailyTarget, 100);

  const hasSalesByHourData = todaySnapshot.salesByHour?.some(h => h.totalSales > 0 || h.transactionCount > 0);

  return (
    <>
      {/* --- AI Insight Section --- */}
      <div className="p-4 md:p-8 pt-6">
        <AIInsightCard 
              insight={aiInsight} 
              isLoading={isInsightLoading}
              isExpanded={isInsightExpanded}
              onToggle={() => setIsInsightExpanded(!isInsightExpanded)}
        />
      </div>
       
      {/* Today's Snapshot & Weekly Pacing */}
      <section>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Total Sales Today Card */}
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
                      <span>Week Target: ₹{weeklyPacing.overallTarget.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center">
                      <Target className="h-3 w-3 mr-1.5 text-green-500" />
                      <span>Week Achieved (so far): ₹{weeklyPacing.achievedInWeekSoFar.toFixed(2)}</span>
                    </div>
                     {weeklyPacing.remainingTargetAmountOverall <= 0 && (
                       <div className="flex items-center">
                          <Target className="h-3 w-3 mr-1.5 text-green-600" />
                          <span className="text-green-600 font-semibold">Weekly Target Achieved! 🎉</span>
                       </div>
                    )}
                    {weeklyPacing.targetForTodayAndAverageRemaining !== null && todaySnapshot.totalSales >= weeklyPacing.targetForTodayAndAverageRemaining && weeklyPacing.targetForTodayAndAverageRemaining > 0 && (
                        <div className="flex items-center text-emerald-600 font-medium">
                             <span>Today's goal met/exceeded!</span>
                        </div>
                    )}
                    <div className="flex items-center">
                      <CalendarDays className="h-3 w-3 mr-1.5 text-sky-500" />
                      <span>Days Left (Week): {weeklyPacing.daysLeftInWeekIncludingToday}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Weekly target not set for current period.</p>
              )}
            </CardContent>
          </Card>

          {/* Sales by Staff Card */}
          <Card className="md:col-span-2 lg:col-span-2 xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sales by Staff Today</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="max-h-60 p-0">
               {dashboardData.todaySnapshot.salesPerStaff && dashboardData.todaySnapshot.salesPerStaff.length > 0 ? (
                <ScrollArea className="h-full w-full">
                    <Table className="text-sm">
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
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
               ) : <p className="text-sm text-muted-foreground py-4 text-center h-full flex items-center justify-center">No sales by staff today.</p>}
            </CardContent>
          </Card>
        </div>
      </section>
      
      {/* Sales Analysis - Charts */}
      <section className="mt-6 grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold mb-3">Sales Trend (Last 30 Days)</h2>
          <Card>
            <CardContent className="pt-6 h-72 sm:h-80">
              {dashboardData.salesTrendData && dashboardData.salesTrendData.length > 0 ? (
                <ResponsiveContainer width="99%" height="100%">
                  <LineChart data={dashboardData.salesTrendData} margin={{ top: 5, right: 20, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(dateStr) => new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                      angle={-45}
                      textAnchor="end"
                      height={60}
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
            <CardContent className="pt-6 h-72 sm:h-80">
              {hasSalesByHourData ? (
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={dashboardData.todaySnapshot.salesByHour} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" tickFormatter={(value: number) => `₹${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value.toFixed(0)}`}/>
                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" tickFormatter={(value: number) => `${value}`}/>
                    <Tooltip
                        formatter={(value: number, name: string) => {
                            if (name === "Total Sales (₹)") return [`₹${value.toFixed(2)}`, name];
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
          <CardContent className="pt-0">
            {dashboardData.topSellingItems && dashboardData.topSellingItems.length > 0 ? (
                <ScrollArea className="w-full whitespace-nowrap">
                    <Table className=" text-sm">
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