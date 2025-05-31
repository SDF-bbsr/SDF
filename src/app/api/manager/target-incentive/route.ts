// src/app/api/manager/target-incentive/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

interface DailyStaffSaleDoc {
    date: string;
    staffStats: {
        [staffId: string]: {
            name: string;
            totalSalesValue: number;
            totalTransactions: number;
        };
    };
}

interface StaffTargetDetail {
    target: number;
    incentivePercentage: number;
}

interface MonthlyTargetDoc {
    month: string;
    weeks: {
        [weekKey: string]: { // week1, week2, ...
            label: string;
            startDate: string; // YYYY-MM-DD
            endDate: string;   // YYYY-MM-DD
            overallTarget: number;
            staff: {
                [staffId: string]: StaffTargetDetail;
            };
        };
    };
}

// Helper to get week definitions for a given year and month (1-indexed)
function getWeekDefinitions(year: number, month: number) { // month is 1-indexed
    const weeks: { key: string; label: string; startDateFull: string; endDateFull: string; days: string[]; }[] = [];
    const daysInMonth = new Date(year, month, 0).getDate(); // For Date object, month is 0-indexed

    const formatDay = (d: number) => String(d).padStart(2, '0');
    const monthStrFull = String(month).padStart(2, '0'); // Month for YYYY-MM-DD

    const addWeek = (key: string, startDay: number, endDayNum: number) => {
        const actualEndDay = Math.min(endDayNum, daysInMonth);
        const dayList: string[] = [];
        for (let d = startDay; d <= actualEndDay; d++) {
            dayList.push(`${year}-${monthStrFull}-${formatDay(d)}`);
        }
        weeks.push({
            key: key,
            label: `Week (${formatDay(startDay)}-${formatDay(actualEndDay)})`,
            startDateFull: `${year}-${monthStrFull}-${formatDay(startDay)}`,
            endDateFull: `${year}-${monthStrFull}-${formatDay(actualEndDay)}`,
            days: dayList,
        });
    };

    addWeek('week1', 1, 7);
    if (daysInMonth >= 8) addWeek('week2', 8, 14);
    if (daysInMonth >= 15) addWeek('week3', 15, 21);
    if (daysInMonth >= 22) addWeek('week4', 22, 28);
    if (daysInMonth >= 29) addWeek('week5', 29, daysInMonth);
    
    return weeks;
}


export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const monthYear = searchParams.get('month'); // Expected format YYYY-MM

        if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
            return NextResponse.json({ message: 'Valid month parameter (YYYY-MM) is required.' }, { status: 400 });
        }

        const [yearStr, monthStr] = monthYear.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10); // 1-indexed month

        const firstDayOfMonth = `${monthYear}-01`;
        const tempDate = new Date(year, month, 0);
        const lastDayOfMonth = `${monthYear}-${String(tempDate.getDate()).padStart(2, '0')}`;
        
        const salesSnapshot = await db.collection('dailyStaffSales')
            .where('date', '>=', firstDayOfMonth)
            .where('date', '<=', lastDayOfMonth)
            .orderBy('date', 'asc')
            .get();

        const dailySalesData: DailyStaffSaleDoc[] = salesSnapshot.docs.map(doc => doc.data() as DailyStaffSaleDoc);
        const staffFoundInSales: Set<string> = new Set();
        dailySalesData.forEach(day => {
            if (day.staffStats) Object.keys(day.staffStats).forEach(staffId => staffFoundInSales.add(staffId));
        });

        const targetsRef = db.collection('monthlyTargets').doc(monthYear);
        let targetsDoc = await targetsRef.get();
        let monthlyTargetData: MonthlyTargetDoc;
        
        const weekDefinitions = getWeekDefinitions(year, month);
        const defaultStaffTargetDetail: StaffTargetDetail = { target: 0, incentivePercentage: 0.5 }; // Default incentive 0.5%

        if (!targetsDoc.exists) {
            const defaultWeeks: MonthlyTargetDoc['weeks'] = {};
            weekDefinitions.forEach(weekDef => {
                const staffTargets: { [staffId: string]: StaffTargetDetail } = {};
                staffFoundInSales.forEach(staffId => {
                    staffTargets[staffId] = { ...defaultStaffTargetDetail }; // Create a new object
                });
                defaultWeeks[weekDef.key] = {
                    label: weekDef.label,
                    startDate: weekDef.startDateFull,
                    endDate: weekDef.endDateFull,
                    overallTarget: 0,
                    staff: staffTargets,
                };
            });
            monthlyTargetData = { month: monthYear, weeks: defaultWeeks };
        } else {
            monthlyTargetData = targetsDoc.data() as MonthlyTargetDoc;
            // Ensure all staff and weeks have entries, using new definitions
            const updatedWeeks: MonthlyTargetDoc['weeks'] = {};
            weekDefinitions.forEach(weekDef => {
                const existingWeek = monthlyTargetData.weeks[weekDef.key];
                const staffTargets: { [staffId: string]: StaffTargetDetail } = {};
                staffFoundInSales.forEach(staffId => {
                    staffTargets[staffId] = existingWeek?.staff?.[staffId] 
                                            ? { ...existingWeek.staff[staffId] } // existing
                                            : { ...defaultStaffTargetDetail }; // default for new staff in existing week
                });
                updatedWeeks[weekDef.key] = {
                    label: existingWeek?.label || weekDef.label,
                    startDate: existingWeek?.startDate || weekDef.startDateFull,
                    endDate: existingWeek?.endDate || weekDef.endDateFull,
                    overallTarget: existingWeek?.overallTarget || 0,
                    staff: staffTargets,
                };
            });
             monthlyTargetData.weeks = updatedWeeks;
        }
        
        const staffDetails: { [staffId: string]: { name: string } } = {};
        const staffCollectionDocs = await db.collection('staff').get();
        staffCollectionDocs.forEach(doc => {
            if (staffFoundInSales.has(doc.id)) {
                 staffDetails[doc.id] = { name: doc.data().name || doc.id };
            }
        });
        staffFoundInSales.forEach(id => {
            if (!staffDetails[id]) staffDetails[id] = {name: id};
        });

        const weeklyDataResponse: any[] = [];
        weekDefinitions.forEach(weekDef => {
            const weekSalesByStaff: { [staffId: string]: number } = {};
            staffFoundInSales.forEach(id => weekSalesByStaff[id] = 0);
            let weekOverallSales = 0;

            weekDef.days.forEach(dayStr => {
                const dayData = dailySalesData.find(ds => ds.date === dayStr);
                if (dayData?.staffStats) {
                    Object.entries(dayData.staffStats).forEach(([staffId, stats]) => {
                        if (staffFoundInSales.has(staffId)) {
                            weekSalesByStaff[staffId] = (weekSalesByStaff[staffId] || 0) + (stats.totalSalesValue || 0);
                            weekOverallSales += (stats.totalSalesValue || 0);
                        }
                    });
                }
            });

            const weekTargetInfo = monthlyTargetData.weeks[weekDef.key];
            const responseStaffData: { [staffId: string]: any } = {};
            let weekTotalIncentives = 0;

            staffFoundInSales.forEach(staffId => {
                const sales = parseFloat(weekSalesByStaff[staffId].toFixed(2));
                const staffTargetDetail = weekTargetInfo.staff[staffId] || defaultStaffTargetDetail;
                const target = staffTargetDetail.target;
                const incentivePct = staffTargetDetail.incentivePercentage;

                const isTargetMet = sales > target;
                let incentive: number | string = "Not Eligible";
                if (isTargetMet && target > 0 && incentivePct > 0) {
                    incentive = parseFloat((sales * (incentivePct / 100)).toFixed(2));
                    weekTotalIncentives += incentive;
                } else if (target <= 0) {
                    incentive = "Not Eligible (No Target)";
                } else if (incentivePct <=0) {
                    incentive = "Not Eligible (No Incentive %)";
                }


                responseStaffData[staffId] = {
                    sales: sales,
                    target: target,
                    incentivePercentage: incentivePct,
                    isTargetMet: sales >= target, // For coloring
                    incentive: incentive,
                };
            });
            
            weeklyDataResponse.push({
                weekKey: weekDef.key,
                weekLabel: weekDef.label,
                startDate: weekDef.startDateFull,
                endDate: weekDef.endDateFull,
                overall: {
                    sales: parseFloat(weekOverallSales.toFixed(2)),
                    target: weekTargetInfo.overallTarget,
                    isTargetMet: weekOverallSales >= weekTargetInfo.overallTarget,
                },
                staff: responseStaffData,
                totalIncentives: parseFloat(weekTotalIncentives.toFixed(2)),
            });
        });

        return NextResponse.json({
            selectedMonth: monthYear,
            staffDetails: staffDetails,
            weeklyData: weeklyDataResponse,
            rawTargetsFromDB: monthlyTargetData.weeks // Crucial for initializing form inputs
        });

    } catch (error: any) {
        console.error("Error in GET /api/manager/target-incentive:", error);
        return NextResponse.json({ message: 'Failed to fetch target/incentive data.', details: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { month, weeks: formWeeksData } = await req.json(); // formWeeksData is what frontend sends

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ message: 'Valid month (YYYY-MM) is required.' }, { status: 400 });
        }
        if (formWeeksData === undefined ) {
            return NextResponse.json({ message: 'Weeks data is required.' }, { status: 400 });
        }

        const targetsRef = db.collection('monthlyTargets').doc(month);
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const m = parseInt(monthStr, 10);
        const currentWeekDefinitions = getWeekDefinitions(year, m);

        const dataToSave: Partial<MonthlyTargetDoc> = {
            month: month,
            weeks: {} as MonthlyTargetDoc['weeks']
        };

        currentWeekDefinitions.forEach(weekDef => {
            const receivedWeekData = formWeeksData[weekDef.key];
            if (!receivedWeekData) return; // Skip if frontend didn't send data for this defined week

            const staffDataToSave: { [staffId: string]: StaffTargetDetail } = {};
            if (receivedWeekData.staff && typeof receivedWeekData.staff === 'object') {
                for (const staffId in receivedWeekData.staff) {
                    const staffFormInput = receivedWeekData.staff[staffId];
                    staffDataToSave[staffId] = {
                        target: parseFloat(staffFormInput.target) || 0,
                        incentivePercentage: parseFloat(staffFormInput.incentivePercentage) || 0
                    };
                }
            }
            
            dataToSave.weeks![weekDef.key] = {
                label: receivedWeekData.label || weekDef.label,
                startDate: receivedWeekData.startDate || weekDef.startDateFull,
                endDate: receivedWeekData.endDate || weekDef.endDateFull,
                overallTarget: parseFloat(receivedWeekData.overallTarget) || 0,
                staff: staffDataToSave
            };
        });
        

        await targetsRef.set(dataToSave, { merge: true });

        return NextResponse.json({ message: 'Targets and incentives updated successfully.' });

    } catch (error: any) {
        console.error("Error in POST /api/manager/target-incentive:", error);
        return NextResponse.json({ message: 'Failed to update targets/incentive.', details: error.message }, { status: 500 });
    }
}