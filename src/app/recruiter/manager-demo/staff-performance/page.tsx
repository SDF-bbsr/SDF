// src/app/manager/protected/staff-performance/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, UserCheck, BarChart3, Percent, BadgeDollarSign, PackageCheck, TableIcon, Filter } from 'lucide-react'; // Added Filter
import { toast as sonnerToast, Toaster } from 'sonner';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface StaffMember {
  id: string;
  name: string;
  role?: string;
}

interface PerformanceSummary {
  totalSalesValue: number;
  totalPackets: number;
  averagePacketValue: number;
}

interface DailySalePoint {
  date: string; // YYYY-MM-DD
  totalSales: number;
  packetCount: number;
}

interface StaffPerformanceData {
  summary: PerformanceSummary;
  dailySalesTrend: DailySalePoint[];
}

type QuickPeriod = 'today' | 'last7d' | 'thisMonth' | 'custom';

const IST_TIMEZONE_CLIENT = 'Asia/Kolkata';
const getISODateStringForClient = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const getNowInClientIST = (): Date => new Date(new Date().toLocaleString("en-US", { timeZone: IST_TIMEZONE_CLIENT }));


export default function StaffPerformancePage() {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  
  const [activeQuickPeriod, setActiveQuickPeriod] = useState<QuickPeriod>('today');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  
  const [performanceData, setPerformanceData] = useState<StaffPerformanceData | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false); // Combined loading state
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate effective date range based on quick period or custom input
  const effectiveDateRange = useMemo(() => {
    const nowIST = getNowInClientIST();
    if (activeQuickPeriod === 'custom') {
      return { startDate: customDateRange.startDate, endDate: customDateRange.endDate };
    }
    let sDate = nowIST;
    let eDate = nowIST;
    switch(activeQuickPeriod) {
      case 'today':
        break;
      case 'last7d':
        sDate = new Date(nowIST);
        sDate.setDate(nowIST.getDate() - 6);
        break;
      case 'thisMonth':
        sDate = new Date(nowIST.getFullYear(), nowIST.getMonth(), 1);
        eDate = new Date(nowIST.getFullYear(), nowIST.getMonth() + 1, 0);
        break;
    }
    return { 
      startDate: getISODateStringForClient(sDate), 
      endDate: getISODateStringForClient(eDate) 
    };
  }, [activeQuickPeriod, customDateRange]);


  useEffect(() => {
    const fetchStaff = async () => {
      setIsLoadingStaff(true);
      try {
        const response = await fetch('/api/manager/staff-list');
        if (!response.ok) throw new Error('Failed to fetch staff list');
        const data: StaffMember[] = await response.json();
        const vendors = data.filter(staff => staff.role === 'vendor');
        setStaffList(vendors);
        if (vendors.length > 0 && !selectedStaffId) { // Set selectedStaffId only if not already set
          setSelectedStaffId(vendors[0].id);
        }
      } catch (err: any) { sonnerToast.error("Error fetching staff: " + err.message); } 
      finally { setIsLoadingStaff(false); }
    };
    fetchStaff();
  }, [selectedStaffId]); // Re-run if selectedStaffId changes to ensure it's valid, though initial set is main goal

  const fetchPerformanceData = useCallback(async () => {
    if (!selectedStaffId || !effectiveDateRange.startDate || !effectiveDateRange.endDate) {
      setPerformanceData(null); // Clear data if inputs are invalid
      if (selectedStaffId && (!effectiveDateRange.startDate || !effectiveDateRange.endDate) && activeQuickPeriod === 'custom') {
        // Only show warning for custom if dates are missing, not for initial load of quick periods
        // sonnerToast.warning("Please select valid start and end dates for custom range.");
      }
      return;
    }
    setIsLoadingData(true); setError(null);
    try {
      const queryParams = new URLSearchParams({
        staffId: selectedStaffId,
        startDate: effectiveDateRange.startDate,
        endDate: effectiveDateRange.endDate,
      });
      const response = await fetch(`/api/manager/staff-performance-data?${queryParams.toString()}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || errData.details || 'Failed to fetch performance data');
      }
      const data: StaffPerformanceData = await response.json();
      setPerformanceData(data);
    } catch (err: any) { setError(err.message); setPerformanceData(null); sonnerToast.error("Fetch error: " + err.message); } 
    finally { setIsLoadingData(false); }
  }, [selectedStaffId, effectiveDateRange]);

  useEffect(() => {
    // Fetch data when selectedStaffId or effectiveDateRange (derived from activeQuickPeriod/customDateRange) changes
    if (selectedStaffId && effectiveDateRange.startDate && effectiveDateRange.endDate) {
      fetchPerformanceData();
    } else if (selectedStaffId) { // Staff selected but dates might be invalid for custom
        setPerformanceData(null); // Clear previous data
    }
  }, [selectedStaffId, effectiveDateRange, fetchPerformanceData]);


  const handleApplyFilters = () => { // Explicit button to apply filters
    if (activeQuickPeriod === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) {
        sonnerToast.warning("For custom range, please provide both start and end dates.");
        return;
    }
    if (customDateRange.startDate && customDateRange.endDate && new Date(customDateRange.startDate) > new Date(customDateRange.endDate)) {
        sonnerToast.error("Start date cannot be after end date.");
        return;
    }
    // fetchPerformanceData will be triggered by the useEffect watching effectiveDateRange
    // No direct call here, just ensure states are set correctly for the useEffect.
    // This function might not be strictly necessary if useEffect handles all changes.
    // However, an explicit apply button can be good UX for custom ranges.
    // For quick periods, selection itself triggers the change via useEffect.
    if (selectedStaffId && effectiveDateRange.startDate && effectiveDateRange.endDate) {
        fetchPerformanceData();
    }
  };


  const StatCard = ({ title, value, icon: Icon, unit }: { title: string; value: string | number; icon: React.ElementType, unit?: string }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}{unit ? ` ${unit}`: ''}</div>
      </CardContent>
    </Card>
  );

  const todayForInputMax = useMemo(() => getISODateStringForClient(getNowInClientIST()), []);

  return (
    <>
      <Toaster richColors position="top-right" />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Select Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <Label htmlFor="staffSelect">Staff Member (Vendor)</Label>
            {isLoadingStaff ? <Loader2 className="h-5 w-5 animate-spin mt-2" /> : (
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId} disabled={staffList.length === 0}>
                <SelectTrigger id="staffSelect">
                  <SelectValue placeholder={staffList.length === 0 ? "No vendors found" : "Select Staff"} />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map(staff => (
                    <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="lg:col-span-1">
            <Label htmlFor="quickPeriod">Period</Label>
            <Select value={activeQuickPeriod} onValueChange={(value) => setActiveQuickPeriod(value as QuickPeriod)}>
                <SelectTrigger id="quickPeriod"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="last7d">Last 7 Days</SelectItem>
                    <SelectItem value="thisMonth">This Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
            </Select>
          </div>
          {activeQuickPeriod === 'custom' && (
            <>
              <div>
                <Label htmlFor="customStartDate">Start Date</Label>
                <Input type="date" id="customStartDate" value={customDateRange.startDate} onChange={(e) => setCustomDateRange(prev => ({...prev, startDate: e.target.value}))} max={todayForInputMax}/>
              </div>
              <div>
                <Label htmlFor="customEndDate">End Date</Label>
                <Input type="date" id="customEndDate" value={customDateRange.endDate} onChange={(e) => setCustomDateRange(prev => ({...prev, endDate: e.target.value}))} max={todayForInputMax}/>
              </div>
            </>
          )}
          {/* Apply button is more relevant for custom range if quick periods auto-update */}
          {activeQuickPeriod === 'custom' && (
            <Button onClick={handleApplyFilters} disabled={isLoadingData || !customDateRange.startDate || !customDateRange.endDate} className="h-10">
                {isLoadingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                Apply Custom Range
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoadingData && <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">Loading performance data...</p></div>}
      {error && !isLoadingData && <p className="text-destructive text-center py-10">Error: {error}</p>}
      
      {!isLoadingData && !error && performanceData && selectedStaffId && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Total Sales Value" value={`₹${(performanceData.summary.totalSalesValue || 0).toFixed(2)}`} icon={BadgeDollarSign} />
            <StatCard title="Total Packets Sold" value={performanceData.summary.totalPackets || 0} icon={PackageCheck} />
            <StatCard title="Avg. Value per Packet" value={`₹${(performanceData.summary.averagePacketValue || 0).toFixed(2)}`} icon={Percent} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5"/> Daily Sales Trend</CardTitle>
              <CardDescription>
                Performance for {staffList.find(s => s.id === selectedStaffId)?.name || 'Selected Staff'} from {effectiveDateRange.startDate} to {effectiveDateRange.endDate}.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[350px] pt-4">
              {performanceData.dailySalesTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData.dailySalesTrend} margin={{ top: 5, right: 30, left: 5, bottom: 35 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                        dataKey="date" 
                        tickFormatter={(dateStr) => new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-GB', {timeZone: 'UTC', day: '2-digit', month: 'short' })}
                        angle={-45} textAnchor="end" height={70} interval={'preserveStartEnd'} 
                    />
                    <YAxis yAxisId="left" orientation="left" stroke="#8884d8" label={{ value: 'Sales (₹)', angle: -90, position: 'insideLeft', offset: 0, style: {textAnchor: 'middle'} }} tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(0)}k` : String(value)} />
                    <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" label={{ value: 'Packets', angle: 90, position: 'insideRight', offset: 0, style: {textAnchor: 'middle'} }} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === 'Total Sales (₹)') return [`₹${Number(value).toFixed(2)}`, name];
                        if (name === 'Packets Sold') return [value, name];
                        return [String(value), name];
                      }}
                      labelFormatter={(label) => new Date(label + 'T00:00:00Z').toLocaleDateString('en-GB', {timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })}
                    />
                    <Legend wrapperStyle={{paddingTop: '25px'}} />
                    <Line yAxisId="left" type="monotone" dataKey="totalSales" stroke="#8884d8" name="Total Sales (₹)" activeDot={{ r: 6 }} dot={{r:3}} />
                    <Line yAxisId="right" type="monotone" dataKey="packetCount" stroke="#82ca9d" name="Packets Sold" activeDot={{ r: 6 }} dot={{r:3}} />
                  </LineChart>
                </ResponsiveContainer>
              ) : ( <p className="text-center text-muted-foreground h-full flex items-center justify-center">No sales data for this period to display trend.</p> )}
            </CardContent>
          </Card>

          {performanceData.dailySalesTrend.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TableIcon className="h-5 w-5"/> Daily Sales Data</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="w-full whitespace-nowrap rounded-md border max-h-[400px]">
                  <Table className="text-xs">
                    <TableHeader><TableRow><TableHead className="py-2 px-3">Date</TableHead><TableHead className="text-right py-2 px-3">Total Sales (₹)</TableHead><TableHead className="text-right py-2 px-3">Packets Sold</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {performanceData.dailySalesTrend.map((dayData) => (
                        <TableRow key={dayData.date} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{new Date(dayData.date + 'T00:00:00Z').toLocaleDateString('en-GB', {timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })}</TableCell>
                          <TableCell className="text-right">₹{(dayData.totalSales || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{dayData.packetCount || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      )}
       {!isLoadingData && !error && !performanceData && selectedStaffId && (
         <p className="text-center text-muted-foreground py-10">No performance data found for {staffList.find(s => s.id === selectedStaffId)?.name || 'the selected staff'} in the chosen period.</p>
       )}
       {!isLoadingData && !error && !performanceData && !selectedStaffId && !isLoadingStaff && staffList.length > 0 && (
         <p className="text-center text-muted-foreground py-10">Please select a staff member to view their performance.</p>
       )}
       {!isLoadingData && !error && !performanceData && !selectedStaffId && !isLoadingStaff && staffList.length === 0 && (
         <p className="text-center text-muted-foreground py-10">No vendor staff found. Please add vendor staff via the Staff Management page.</p>
       )}
    </>
  );
}