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

    // Inner helper to add a week if it's valid
    const tryAddWeek = (key: string, startDay: number, endDayProposed: number) => {
        if (startDay > daysInMonth) { // If the week's start day is beyond the month's end, do nothing
            return;
        }

        const actualEndDay = Math.min(endDayProposed, daysInMonth);
        
        // This condition should ideally not be met if startDay checks are done prior,
        // but as a safeguard if startDay somehow ended up > actualEndDay.
        if (startDay > actualEndDay) {
            return;
        }

        const dayList: string[] = [];
        for (let d = startDay; d <= actualEndDay; d++) {
            dayList.push(`${year}-${monthStrFull}-${formatDay(d)}`);
        }

        // Only push if there are days in the list (i.e., startDay <= actualEndDay)
        if (dayList.length > 0) {
            weeks.push({
                key: key,
                label: `Week (${formatDay(startDay)}-${formatDay(actualEndDay)})`,
                startDateFull: `${year}-${monthStrFull}-${formatDay(startDay)}`,
                endDateFull: `${year}-${monthStrFull}-${formatDay(actualEndDay)}`,
                days: dayList,
            });
        }
    };

    // Week 1: 1-7
    tryAddWeek('week1', 1, 7);
    
    // Week 2: 8-14
    tryAddWeek('week2', 8, 14);

    // Week 3: 15-21
    tryAddWeek('week3', 15, 21);

    // Week 4: 22 to end of month
    // This will only add if day 22 is within the month.
    // endDayProposed is daysInMonth, so actualEndDay will be daysInMonth.
    tryAddWeek('week4', 22, daysInMonth); 
    
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
        
        const weekDefinitions = getWeekDefinitions(year, month); // <-- Uses the updated function
        const defaultStaffTargetDetail: StaffTargetDetail = { target: 0, incentivePercentage: 0.5 }; // Default incentive 0.5%

        if (!targetsDoc.exists) {
            const defaultWeeks: MonthlyTargetDoc['weeks'] = {};
            weekDefinitions.forEach(weekDef => {
                const staffTargets: { [staffId: string]: StaffTargetDetail } = {};
                staffFoundInSales.forEach(staffId => {
                    staffTargets[staffId] = { ...defaultStaffTargetDetail }; 
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
            const updatedWeeks: MonthlyTargetDoc['weeks'] = {};
            weekDefinitions.forEach(weekDef => {
                const existingWeek = monthlyTargetData.weeks[weekDef.key];
                const staffTargets: { [staffId: string]: StaffTargetDetail } = {};
                staffFoundInSales.forEach(staffId => {
                    staffTargets[staffId] = existingWeek?.staff?.[staffId] 
                                            ? { ...existingWeek.staff[staffId] } 
                                            : { ...defaultStaffTargetDetail }; 
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

            const weekTargetInfo = monthlyTargetData.weeks[weekDef.key]; // weekDef.key will now only be week1-week4
            const responseStaffData: { [staffId: string]: any } = {};
            let weekTotalIncentives = 0;

            staffFoundInSales.forEach(staffId => {
                const sales = parseFloat(weekSalesByStaff[staffId].toFixed(2));
                const staffTargetDetail = weekTargetInfo.staff[staffId] || defaultStaffTargetDetail;
                const target = staffTargetDetail.target;
                const incentivePct = staffTargetDetail.incentivePercentage;

                const isTargetMet = sales > target; // Note: original code was sales >= target for isTargetMet, sales > target for incentive calculation
                let incentive: number | string = "Not Eligible";
                if (isTargetMet && target > 0 && incentivePct > 0) { // Using sales > target for incentive
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
                    isTargetMet: sales >= target, // For coloring, uses >=
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
                    target: weekTargetInfo.overallTarget, // This will be the sum from inputs or 0 if not set
                    isTargetMet: weekOverallSales >= weekTargetInfo.overallTarget, // Comparison is with overall target from DB
                },
                staff: responseStaffData,
                totalIncentives: parseFloat(weekTotalIncentives.toFixed(2)),
            });
        });

        return NextResponse.json({
            selectedMonth: monthYear,
            staffDetails: staffDetails,
            weeklyData: weeklyDataResponse,
            rawTargetsFromDB: monthlyTargetData.weeks 
        });

    } catch (error: any) {
        console.error("Error in GET /api/manager/target-incentive:", error);
        return NextResponse.json({ message: 'Failed to fetch target/incentive data.', details: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { month, weeks: formWeeksData } = await req.json(); 

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
        const currentWeekDefinitions = getWeekDefinitions(year, m); // <-- Uses the updated function

        const dataToSave: Partial<MonthlyTargetDoc> = {
            month: month,
            weeks: {} as MonthlyTargetDoc['weeks']
        };

        currentWeekDefinitions.forEach(weekDef => { // Will iterate week1-week4 (or fewer)
            const receivedWeekData = formWeeksData[weekDef.key];
            if (!receivedWeekData) return; 

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
                overallTarget: parseFloat(receivedWeekData.overallTarget) || 0, // This is calculated on frontend and sent
                staff: staffDataToSave
            };
        });
        
        // Using set with merge:true will update or create the document.
        // If there was old `week5` data within the `weeks` map in Firestore,
        // this operation will not remove it if `dataToSave.weeks` doesn't contain `week5`.
        // However, the GET request logic already filters based on currentWeekDefinitions,
        // so old `week5` data won't be loaded or displayed.
        await targetsRef.set(dataToSave, { merge: true });

        return NextResponse.json({ message: 'Targets and incentives updated successfully.' });

    } catch (error: any) {
        console.error("Error in POST /api/manager/target-incentive:", error);
        return NextResponse.json({ message: 'Failed to update targets/incentive.', details: error.message }, { status: 500 });
    }
}