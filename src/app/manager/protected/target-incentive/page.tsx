// src/app/manager/protected/target-incentive/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react'; // Added React explicitly
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, AlertCircle, TrendingUp, TrendingDown, Calculator } from 'lucide-react'; // Added Calculator icon
import { toast as sonnerToast, Toaster } from 'sonner';
import { cn } from "@/lib/utils"; // For conditional class names

// ... (interfaces remain the same as the previous frontend version)
interface StaffDetail { name: string; }
interface StaffSalesTargetIncentive {
    sales: number;
    target: number;
    incentivePercentage: number;
    isTargetMet: boolean;
    incentive: number | string;
}
interface OverallSalesTarget {
    sales: number;
    target: number; // Calculated on frontend
    isTargetMet: boolean;
}
interface WeeklyDisplayData {
    weekKey: string;
    weekLabel: string;
    startDate: string;
    endDate: string;
    overall: Omit<OverallSalesTarget, 'target'> & { targetFromDB?: number };
    staff: { [staffId: string]: StaffSalesTargetIncentive };
    totalIncentives: number;
}
interface FormStaffTargetDetail {
    target: number;
    incentivePercentage: number;
}
interface FormWeekDetail {
    label: string;
    startDate: string;
    endDate: string;
    staff: {
        [staffId: string]: FormStaffTargetDetail;
    };
}
interface ApiResponseData {
    selectedMonth: string;
    staffDetails: { [staffId: string]: StaffDetail };
    weeklyData: WeeklyDisplayData[];
    rawTargetsFromDB: {
        [weekKey: string]: {
            label: string;
            startDate: string;
            endDate: string;
            overallTarget?: number;
            staff: {
                [staffId: string]: { target: number; incentivePercentage: number; };
            };
        };
    };
}


const getCurrentMonthYYYYMM = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
};

const getMonthOptions = () => {
    const options = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        options.push({ value: `${year}-${month}`, label: date.toLocaleString('default', { month: 'long', year: 'numeric' }) });
    }
    return options;
};

// Helper to get a slightly different background color for staff rows
const getStaffRowBgClass = (index: number) => {
    return index % 2 === 0 ? "bg-slate-50 dark:bg-slate-800/30" : "bg-white dark:bg-background";
};


export default function TargetIncentivePage() {
    const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthYYYYMM());
    const [apiData, setApiData] = useState<ApiResponseData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formWeeklyTargets, setFormWeeklyTargets] = useState<{ [weekKey: string]: FormWeekDetail }>({});

    const monthOptions = useMemo(() => getMonthOptions(), []);
    const staffIds = useMemo(() => apiData ? Object.keys(apiData.staffDetails) : [], [apiData]);

    const calculateOverallTargetForWeek = useCallback((weekKey: string) => {
        if (!formWeeklyTargets[weekKey] || !formWeeklyTargets[weekKey].staff || staffIds.length === 0) return 0;
        return staffIds.reduce((sum, staffId) => {
            return sum + (formWeeklyTargets[weekKey].staff[staffId]?.target || 0);
        }, 0);
    }, [formWeeklyTargets, staffIds]);

    const fetchData = useCallback(async (monthToFetch: string) => {
        setIsLoading(true); setError(null); setApiData(null);
        try {
            const response = await fetch(`/api/manager/target-incentive?month=${monthToFetch}`);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to fetch data');
            }
            const data: ApiResponseData = await response.json();
            setApiData(data);
            const initialFormTargets: { [weekKey: string]: FormWeekDetail } = {};
            data.weeklyData.forEach(week => {
                initialFormTargets[week.weekKey] = {
                    label: week.weekLabel, startDate: week.startDate, endDate: week.endDate, staff: {}
                };
                Object.keys(data.staffDetails).forEach(staffId => {
                    const rawStaffTarget = data.rawTargetsFromDB?.[week.weekKey]?.staff?.[staffId];
                    const apiStaffData = week.staff[staffId];
                    initialFormTargets[week.weekKey].staff[staffId] = {
                        target: rawStaffTarget?.target ?? apiStaffData?.target ?? 0,
                        incentivePercentage: rawStaffTarget?.incentivePercentage ?? apiStaffData?.incentivePercentage ?? 0.5
                    };
                });
            });
            setFormWeeklyTargets(initialFormTargets);
        } catch (err: any) {
            setError(err.message); sonnerToast.error("Error fetching data: " + err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(selectedMonth); }, [selectedMonth, fetchData]);

    const handleFormChange = (weekKey: string, staffId: string, field: 'target' | 'incentivePercentage', value: string) => {
        const numericValue = parseFloat(value);
        setFormWeeklyTargets(prev => {
            const updated = JSON.parse(JSON.stringify(prev));
            if (!updated[weekKey]?.staff?.[staffId]) { // Ensure structure exists
                if (!updated[weekKey]) updated[weekKey] = { staff: {} } as FormWeekDetail;
                if (!updated[weekKey].staff) updated[weekKey].staff = {};
                updated[weekKey].staff[staffId] = { target: 0, incentivePercentage: 0 };
            }
            updated[weekKey].staff[staffId][field] = isNaN(numericValue) ? 0 : numericValue;
            return updated;
        });
    };
    
    const handleSaveTargets = async () => {
        setIsSaving(true); setError(null);
        try {
            const payloadWeeks: any = {};
            Object.keys(formWeeklyTargets).forEach(weekKey => {
                payloadWeeks[weekKey] = {
                    ...formWeeklyTargets[weekKey],
                    overallTarget: calculateOverallTargetForWeek(weekKey)
                };
            });
            const payload = { month: selectedMonth, weeks: payloadWeeks };
            const response = await fetch('/api/manager/target-incentive', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errData = await response.json(); throw new Error(errData.message || 'Failed to save targets');
            }
            sonnerToast.success('Targets and incentives saved successfully!');
            fetchData(selectedMonth); 
        } catch (err: any) {
            setError(err.message); sonnerToast.error("Error saving targets: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <Toaster richColors position="top-right" />
            <div className="container mx-auto px-2 sm:px-4 py-8"> {/* Reduced horizontal padding for mobile */}
                <Card>
                    <CardHeader className="px-3 sm:px-6"> {/* Reduced padding */}
                        <CardTitle className="text-xl sm:text-2xl">Staff Targets & Incentives</CardTitle> {/* Smaller title on mobile */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mt-3 sm:mt-4">
                             <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="w-full sm:w-[180px] text-sm sm:text-base"> {/* Smaller trigger on mobile */}
                                    <SelectValue placeholder="Select month" />
                                </SelectTrigger>
                                <SelectContent>
                                    {monthOptions.map(option => (
                                        <SelectItem key={option.value} value={option.value} className="text-sm sm:text-base">
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button onClick={handleSaveTargets} disabled={isSaving || isLoading} className="w-full sm:w-auto text-sm sm:text-base px-3 py-1.5 sm:px-4 sm:py-2"> {/* Smaller button on mobile */}
                                {isSaving ? <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" /> : <Save className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />}
                                Save
                            </Button>
                        </div>
                        {error && <p className="text-red-500 text-xs sm:text-sm mt-2 flex items-center"><AlertCircle className="mr-1 h-3 w-3 sm:h-4 sm:w-4" /> {error}</p>}
                    </CardHeader>
                    <CardContent className="overflow-x-auto px-0 sm:px-6"> {/* Allow horizontal scroll on card content */}
                        {isLoading && <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" /> <p className="ml-2 text-sm sm:text-base">Loading...</p></div>}
                        
                        {!isLoading && apiData && (
                            <Table className="mt-4 min-w-[700px] sm:min-w-[900px] text-xs sm:text-sm"> {/* Base smaller text, adjust min-width */}
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[150px] sm:w-[200px] sticky left-0 bg-background z-10 px-2 sm:px-4">Metric/Staff</TableHead> {/* Shorter label and padding */}
                                        {apiData.weeklyData.map(week => (
                                            <TableHead key={week.weekKey} className="text-center min-w-[90px] sm:min-w-[110px] px-1 sm:px-2">{week.weekLabel.replace("Week ", "W")}</TableHead> 
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow className="bg-slate-100 dark:bg-slate-800"><TableCell colSpan={apiData.weeklyData.length + 1} className="font-semibold sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 px-2 sm:px-4 py-2 text-sm sm:text-base">Sales & Targets</TableCell></TableRow>
                                    
                                    {staffIds.map((staffId, staffIndex) => (
                                        <React.Fragment key={staffId}>
                                            <TableRow className={cn(getStaffRowBgClass(staffIndex))}>
                                                <TableCell className="font-medium sticky left-0 z-10 px-2 sm:px-4 py-1.5 sm:py-2 whitespace-nowrap overflow-hidden text-ellipsis" style={{ backgroundColor: staffIndex % 2 === 0 ? 'var(--staff-row-even-bg, inherit)' : 'var(--staff-row-odd-bg, inherit)' }}>
                                                    Sales by {apiData.staffDetails[staffId]?.name || staffId}
                                                </TableCell>
                                                {apiData.weeklyData.map(week => (
                                                    <TableCell key={`${week.weekKey}-${staffId}-sales`} className="text-center py-1.5 sm:py-2">
                                                        <span className={week.staff[staffId]?.isTargetMet ? 'text-green-600' : (week.staff[staffId]?.target > 0 ? 'text-red-600' : 'text-gray-700 dark:text-gray-300')}>
                                                            {week.staff[staffId]?.sales.toLocaleString() || '0'}
                                                            {week.staff[staffId]?.target > 0 && (
                                                                week.staff[staffId]?.isTargetMet ? 
                                                                <TrendingUp className="inline ml-1 h-3 w-3 sm:h-4 sm:w-4"/> : 
                                                                <TrendingDown className="inline ml-1 h-3 w-3 sm:h-4 sm:w-4"/>
                                                            )}
                                                        </span>
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                            <TableRow className={cn(getStaffRowBgClass(staffIndex))}>
                                                <TableCell className="sticky left-0 z-10 px-2 sm:px-4 py-1.5 sm:py-2 whitespace-nowrap overflow-hidden text-ellipsis" style={{ backgroundColor: staffIndex % 2 === 0 ? 'var(--staff-row-even-bg, inherit)' : 'var(--staff-row-odd-bg, inherit)' }}>
                                                    Target for {apiData.staffDetails[staffId]?.name || staffId}
                                                </TableCell>
                                                {apiData.weeklyData.map(week => (
                                                    <TableCell key={`${week.weekKey}-${staffId}-target`} className="text-center py-1 sm:py-1.5">
                                                        <Input 
                                                            type="number" 
                                                            value={formWeeklyTargets[week.weekKey]?.staff[staffId]?.target ?? ''}
                                                            onChange={(e) => handleFormChange(week.weekKey, staffId, 'target', e.target.value)}
                                                            className="w-[70px] sm:w-[90px] mx-auto text-center h-7 sm:h-8 text-xs sm:text-sm" min="0"
                                                        />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                            <TableRow className={cn(getStaffRowBgClass(staffIndex))}>
                                                <TableCell className="sticky left-0 z-10 px-2 sm:px-4 py-1.5 sm:py-2 whitespace-nowrap overflow-hidden text-ellipsis" style={{ backgroundColor: staffIndex % 2 === 0 ? 'var(--staff-row-even-bg, inherit)' : 'var(--staff-row-odd-bg, inherit)' }}>
                                                    Inc. % for {apiData.staffDetails[staffId]?.name || staffId} {/* Abbreviated */}
                                                </TableCell>
                                                {apiData.weeklyData.map(week => (
                                                    <TableCell key={`${week.weekKey}-${staffId}-incentivePct`} className="text-center py-1 sm:py-1.5">
                                                        <Input 
                                                            type="number" 
                                                            value={formWeeklyTargets[week.weekKey]?.staff[staffId]?.incentivePercentage ?? ''}
                                                            onChange={(e) => handleFormChange(week.weekKey, staffId, 'incentivePercentage', e.target.value)}
                                                            className="w-[60px] sm:w-[70px] mx-auto text-center h-7 sm:h-8 text-xs sm:text-sm" min="0" step="0.01"
                                                        />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        </React.Fragment>
                                    ))}
                                    {/* Totals Section */}
                                    <TableRow className="font-semibold bg-blue-50 dark:bg-blue-900/40">
                                        <TableCell className="sticky left-0 bg-blue-50 dark:bg-blue-900/40 z-10 px-2 sm:px-4 py-1.5 sm:py-2">Total Sales (Week)</TableCell> {/* Abbreviated */}
                                         {apiData.weeklyData.map(week => (
                                            <TableCell key={`${week.weekKey}-totalsales`} className="text-center py-1.5 sm:py-2">
                                                 <span className={(week.overall?.sales >= calculateOverallTargetForWeek(week.weekKey) && calculateOverallTargetForWeek(week.weekKey) > 0) ? 'text-green-600' : (calculateOverallTargetForWeek(week.weekKey) > 0 ? 'text-red-600' : 'text-gray-700 dark:text-gray-300')}>
                                                    {week.overall?.sales.toLocaleString() || '0'}
                                                    {calculateOverallTargetForWeek(week.weekKey) > 0 && (
                                                         (week.overall?.sales >= calculateOverallTargetForWeek(week.weekKey)) ?
                                                         <TrendingUp className="inline ml-1 h-3 w-3 sm:h-4 sm:w-4"/> :
                                                         <TrendingDown className="inline ml-1 h-3 w-3 sm:h-4 sm:w-4"/>
                                                    )}
                                                 </span>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    <TableRow className="font-semibold bg-blue-50 dark:bg-blue-900/40">
                                        <TableCell className="sticky left-0 bg-blue-50 dark:bg-blue-900/40 z-10 px-2 sm:px-4 py-1.5 sm:py-2">Overall Target (Week)</TableCell> {/* Abbreviated */}
                                         {apiData.weeklyData.map(week => (
                                            <TableCell key={`${week.weekKey}-overalltarget`} className="text-center py-1.5 sm:py-2">
                                                {calculateOverallTargetForWeek(week.weekKey).toLocaleString()}
                                            </TableCell>
                                        ))}
                                    </TableRow>

                                    {/* Incentives Earned Section */}
                                    <TableRow className="bg-slate-100 dark:bg-slate-800"><TableCell colSpan={apiData.weeklyData.length + 1} className="font-semibold sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 px-2 sm:px-4 py-2 text-sm sm:text-base pt-4">Incentives Earned</TableCell></TableRow>
                                    {staffIds.map((staffId, staffIndex) => (
                                        <TableRow key={`${staffId}-incentive-display`} className={cn(getStaffRowBgClass(staffIndex))}>
                                            <TableCell className="sticky left-0 z-10 px-2 sm:px-4 py-1.5 sm:py-2 whitespace-nowrap overflow-hidden text-ellipsis" style={{ backgroundColor: staffIndex % 2 === 0 ? 'var(--staff-row-even-bg, inherit)' : 'var(--staff-row-odd-bg, inherit)' }}>
                                                Inc. for {apiData.staffDetails[staffId]?.name || staffId} {/* Abbreviated */}
                                            </TableCell>
                                            {apiData.weeklyData.map(week => {
                                                const staffPerf = week.staff[staffId];
                                                const incentiveVal = staffPerf?.incentive;
                                                const salesVal = staffPerf?.sales;
                                                const incentivePctVal = staffPerf?.incentivePercentage;
                                                return (
                                                <TableCell key={`${week.weekKey}-${staffId}-incentive-val`} className="text-center py-1.5 sm:py-2">
                                                    {typeof incentiveVal === 'number' ? 
                                                        (
                                                            <div className="flex flex-col items-center text-xs">
                                                                <span>{incentiveVal.toLocaleString()}</span>
                                                                <span className="text-muted-foreground">
                                                                    ({salesVal?.toLocaleString()} * {incentivePctVal}% / 100)
                                                                </span>
                                                            </div>
                                                        ) : 
                                                        <span className="text-xs text-muted-foreground">{incentiveVal || 'N/A'}</span>
                                                    }
                                                </TableCell>
                                            )})}
                                        </TableRow>
                                    ))}
                                     <TableRow className="font-semibold bg-blue-50 dark:bg-blue-900/40">
                                        <TableCell className="sticky left-0 bg-blue-50 dark:bg-blue-900/40 z-10 px-2 sm:px-4 py-1.5 sm:py-2">Total Incentives (W)</TableCell> {/* Abbreviated */}
                                         {apiData.weeklyData.map(week => (
                                            <TableCell key={`${week.weekKey}-totalincentives`} className="text-center py-1.5 sm:py-2">
                                                {week.totalIncentives.toLocaleString() || '0'}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableBody>
                            </Table>
                        )}
                        {!isLoading && !apiData && !error && <p className="text-center py-10 text-sm sm:text-base">No data to display.</p>} {/* Generic message */}
                    </CardContent>
                </Card>
                {/* CSS variables for staff row backgrounds */}
                <style jsx global>{`
                    :root {
                        --staff-row-even-bg: #f8fafc; /* slate-50 */
                        --staff-row-odd-bg: #ffffff; /* white */
                    }
                    [data-theme="dark"] {
                        --staff-row-even-bg: rgba(30, 41, 59, 0.3); /* Equivalent of dark:bg-slate-800/30 */
                        --staff-row-odd-bg: var(--background); /* From shadcn dark theme */
                    }
                `}</style>

            </div>
        </>
    );
}