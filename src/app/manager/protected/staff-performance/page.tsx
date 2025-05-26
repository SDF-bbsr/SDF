// src/app/manager/protected/staff-performance/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Added Table components
import { Loader2, UserCheck, BarChart3, Percent, BadgeDollarSign, PackageCheck, TableIcon } from 'lucide-react'; // Added TableIcon
import { toast as sonnerToast, Toaster } from 'sonner';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'; // Added ScrollArea for table

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

const getDefaultDateRange = () => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
        startDate: firstDayOfMonth.toISOString().split('T')[0],
        endDate: lastDayOfMonth.toISOString().split('T')[0],
    };
};

export default function StaffPerformancePage() {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [performanceData, setPerformanceData] = useState<StaffPerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStaff = async () => {
      setIsLoadingStaff(true);
      try {
        const response = await fetch('/api/manager/staff-list'); // Ensure this API returns {id, name, role}
        if (!response.ok) throw new Error('Failed to fetch staff list');
        const data: StaffMember[] = await response.json();
        const vendors = data.filter(staff => staff.role === 'vendor');
        setStaffList(vendors);
        if (vendors.length > 0) {
          setSelectedStaffId(vendors[0].id);
        }
      } catch (err: any) {
        sonnerToast.error("Error fetching staff: " + err.message);
      } finally {
        setIsLoadingStaff(false);
      }
    };
    fetchStaff();
  }, []);

  const fetchPerformanceData = useCallback(async () => {
    if (!selectedStaffId || !dateRange.startDate || !dateRange.endDate) {
      setPerformanceData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        staffId: selectedStaffId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      const response = await fetch(`/api/manager/staff-performance-data?${queryParams.toString()}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || errData.details || 'Failed to fetch performance data');
      }
      const data: StaffPerformanceData = await response.json();
      setPerformanceData(data);
    } catch (err: any) {
      setError(err.message);
      setPerformanceData(null);
      sonnerToast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStaffId, dateRange]);

  useEffect(() => {
    if (selectedStaffId && dateRange.startDate && dateRange.endDate) {
      fetchPerformanceData();
    }
  }, [selectedStaffId, dateRange, fetchPerformanceData]);


  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const StatCard = ({ title, value, icon: Icon, unit }: { title: string; value: string | number; icon: React.ElementType, unit?: string }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value} {unit || ''}</div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <Toaster richColors position="top-right" />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Staff and Date Range</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input type="date" id="startDate" value={dateRange.startDate} onChange={(e) => handleDateChange('startDate', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input type="date" id="endDate" value={dateRange.endDate} onChange={(e) => handleDateChange('endDate', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">Loading performance data...</p></div>}
      {error && !isLoading && <p className="text-destructive text-center py-10">Error: {error}</p>}
      
      {!isLoading && !error && performanceData && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard title="Total Sales Value" value={`₹${performanceData.summary.totalSalesValue.toFixed(2)}`} icon={BadgeDollarSign} />
            <StatCard title="Total Packets Sold" value={performanceData.summary.totalPackets} icon={PackageCheck} />
            <StatCard title="Avg. Value per Packet" value={`₹${performanceData.summary.averagePacketValue.toFixed(2)}`} icon={Percent} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5"/> Daily Sales Trend (Chart)</CardTitle>
              <CardDescription>
                Sales performance for {staffList.find(s => s.id === selectedStaffId)?.name || 'Selected Staff'} from {new Date(dateRange.startDate  + 'T00:00:00').toLocaleDateString()} to {new Date(dateRange.endDate + 'T00:00:00').toLocaleDateString()}.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[350px] pt-4">
              {performanceData.dailySalesTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData.dailySalesTrend} margin={{ top: 5, right: 30, left: 5, bottom: 25 }}> {/* Adjusted margins */}
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                        dataKey="date" 
                        tickFormatter={(dateStr) => new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} // DD-Mon format
                        angle={-45}
                        textAnchor="end"
                        height={60} // Increased height for angled labels
                        interval={Math.max(0, Math.floor(performanceData.dailySalesTrend.length / 15) -1)} // Show fewer ticks if many data points
                    />
                    <YAxis yAxisId="left" label={{ value: 'Sales (₹)', angle: -90, position: 'insideLeft', offset: 15, style: {textAnchor: 'middle'} }} />
                    <YAxis yAxisId="right" orientation="right" label={{ value: 'Packets', angle: 90, position: 'insideRight', offset: 15, style: {textAnchor: 'middle'} }} />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === 'Total Sales') return [`₹${Number(value).toFixed(2)}`, name];
                        if (name === 'Packets Sold') return [value, name];
                        return [value, name];
                      }}
                      labelFormatter={(label) => new Date(label + 'T00:00:00').toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
                    />
                    <Legend wrapperStyle={{paddingTop: '20px'}} />
                    <Line yAxisId="left" type="monotone" dataKey="totalSales" stroke="#8884d8" name="Total Sales (₹)" activeDot={{ r: 6 }} dot={{r:3}} />
                    <Line yAxisId="right" type="monotone" dataKey="packetCount" stroke="#82ca9d" name="Packets Sold" activeDot={{ r: 6 }} dot={{r:3}} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground h-full flex items-center justify-center">No sales data for this period to display trend.</p>
              )}
            </CardContent>
          </Card>

          {/* Daily Sales Data Table */}
          {performanceData.dailySalesTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TableIcon className="h-5 w-5"/> Daily Sales Data</CardTitle>
                <CardDescription>Tabular view of the daily sales trend data shown in the chart above.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="w-full whitespace-nowrap rounded-md border max-h-[400px]">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-2 px-3">Date</TableHead>
                        <TableHead className="text-right py-2 px-3">Total Sales (₹)</TableHead>
                        <TableHead className="text-right py-2 px-3">Packets Sold</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {performanceData.dailySalesTrend.map((dayData) => (
                        <TableRow key={dayData.date} className="hover:bg-muted/50">
                          <TableCell className="font-medium">
                            {new Date(dayData.date + 'T00:00:00').toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </TableCell>
                          <TableCell className="text-right">₹{dayData.totalSales.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{dayData.packetCount}</TableCell>
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
       {!isLoading && !error && !performanceData && selectedStaffId && (
         <p className="text-center text-muted-foreground py-10">Select/confirm staff and date range to view performance, or no data found for the current selection.</p>
       )}
       {!isLoading && !error && !performanceData && !selectedStaffId && !isLoadingStaff && staffList.length > 0 && (
         <p className="text-center text-muted-foreground py-10">Please select a staff member to view their performance.</p>
       )}
       {!isLoading && !error && !performanceData && !selectedStaffId && !isLoadingStaff && staffList.length === 0 && (
         <p className="text-center text-muted-foreground py-10">No vendor staff found to display performance. Please add vendor staff first.</p>
       )}
    </>
  );
}