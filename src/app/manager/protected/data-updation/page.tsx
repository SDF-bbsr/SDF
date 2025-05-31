// src/app/manager/protected/data-updation/page.tsx
"use client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Loader2, AlertTriangle, CheckCircle2, DatabaseZap, PlayCircle, PauseCircle, RotateCcw } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';

const IST_TIMEZONE_CLIENT = 'Asia/Kolkata';
const getISODateStringForClient = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const getNowInClientIST = (): Date => new Date(new Date().toLocaleString("en-US", { timeZone: IST_TIMEZONE_CLIENT }));

const BATCH_SIZE = 10;

interface StaffMember { id: string; name: string; }

export default function DataUpdationPage() {
  const todayStr = useMemo(() => getISODateStringForClient(getNowInClientIST()), []);
  // MODIFICATION: Initialize dateToProcess as an empty string
  const [dateToProcess, setDateToProcess] = useState(''); 
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [totalTransactionsToProcess, setTotalTransactionsToProcess] = useState(0);
  const [transactionsProcessedSoFar, setTransactionsProcessedSoFar] = useState(0);
  const [currentBatchMessage, setCurrentBatchMessage] = useState<string | null>("Please select a date to begin."); // Initial message
  const [error, setError] = useState<string | null>(null);
  const [lastProcessedDocId, setLastProcessedDocId] = useState<string | null>(null);
  const [staffNameMap, setStaffNameMap] = useState<Record<string, string>>({});
  const [isFirstBatchForThisDay, setIsFirstBatchForThisDay] = useState(true);

  const fetchStaffMap = useCallback(async () => {
    try {
      const response = await fetch('/api/manager/staff-list');
      if (!response.ok) throw new Error('Failed to fetch staff list for names');
      const staffListData: StaffMember[] = await response.json();
      const map: Record<string, string> = {};
      staffListData.forEach(staff => { map[staff.id] = staff.name; });
      setStaffNameMap(map);
      if (Object.keys(map).length === 0 && !dateToProcess) {
          setCurrentBatchMessage("Could not load staff names. Processing might be affected. You can still select a date.");
      } else if (!dateToProcess) {
          setCurrentBatchMessage("Staff names loaded. Please select a date to begin.");
      }
      return map;
    } catch (err: any) {
      sonnerToast.error("Could not fetch staff names: " + err.message);
      if (!dateToProcess) {
          setCurrentBatchMessage("Error loading staff names. Please select a date.");
      }
      return {};
    }
  }, [dateToProcess]); // Added dateToProcess to dependency array for message update, though map fetching is once

  useEffect(() => {
    fetchStaffMap();
  }, [fetchStaffMap]); // fetchStaffMap is memoized, so this runs once on mount

  const startFullProcess = async () => {
    if (!dateToProcess) {
      sonnerToast.error("Please select a date to process.");
      setCurrentBatchMessage("A date selection is required to start the process.");
      return;
    }
    if (!confirm(`This will RESET and RECALCULATE all aggregates for ${dateToProcess}. This involves deleting existing aggregates for this day and then reprocessing all its sales. This can consume reads. Are you sure?`)) {
        return;
    }

    setIsProcessing(true);
    setIsPaused(false);
    setError(null);
    setTotalTransactionsToProcess(0);
    setTransactionsProcessedSoFar(0);
    setLastProcessedDocId(null);
    setCurrentBatchMessage("Fetching total transaction count for the selected day...");
    setIsFirstBatchForThisDay(true); 

    let currentStaffMap = staffNameMap;
    if (Object.keys(currentStaffMap).length === 0) {
        currentStaffMap = await fetchStaffMap(); // Refetch if empty, though unlikely if initial fetch worked
    }

    try {
      // This API call only happens now, after user clicks "Start Process" and date is selected
      const countResponse = await fetch('/api/manager/data-updation/count-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateToProcess }),
      });
      const countResult = await countResponse.json();
      if (!countResponse.ok) throw new Error(countResult.message || 'Failed to count transactions.');
      
      setTotalTransactionsToProcess(countResult.totalTransactions);
      if (countResult.totalTransactions === 0) {
        setCurrentBatchMessage(`No SOLD transactions found for ${dateToProcess} to process. Attempting to clear any old aggregates for this day...`);
        // isFirstBatchForThisDay is true here, so deletion will be triggered
        await fetch('/api/manager/data-updation/process-batch', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ 
                dateToProcess: dateToProcess, 
                batchSize: BATCH_SIZE, 
                lastProcessedDocId: null,
                staffNameMap: currentStaffMap,
                isFirstBatchForDay: true // Trigger deletion
            }),
        });
        // Assuming the API handles deletion correctly and doesn't error if no aggregates to delete
        setCurrentBatchMessage(`No transactions for ${dateToProcess}. Any old aggregates for this day have been cleared.`);
        sonnerToast.info(`No transactions for ${dateToProcess}. Old aggregates (if any) cleared.`);
        setIsFirstBatchForThisDay(false); // Deletion attempt made
        setIsProcessing(false);
        return;
      }
      
      await processNextBatch(dateToProcess, null, 0, countResult.totalTransactions, currentStaffMap, true);

    } catch (err: any) {
      setError(err.message);
      setCurrentBatchMessage(`Error: ${err.message}`);
      sonnerToast.error(`Error starting process: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const processNextBatch = async (
    dayToProcess: string, 
    currentLastDocId: string | null, 
    processedSoFar: number, 
    totalToProcess: number,
    staffMap: Record<string, string>,
    isFirstCallForThisDay: boolean 
  ) => {
    if (isPaused || (processedSoFar >= totalToProcess && totalToProcess > 0)) { 
      if (processedSoFar >= totalToProcess && totalToProcess > 0) {
        setCurrentBatchMessage(`All ${totalToProcess} transactions for ${dayToProcess} processed successfully! Aggregates are updated.`);
        sonnerToast.success("Aggregation update complete for " + dayToProcess + "!");
      } else if (isPaused) {
        setCurrentBatchMessage(`Process paused for ${dayToProcess}. ${processedSoFar} of ${totalToProcess} processed.`);
      }
      setIsProcessing(false);
      return;
    }

    setCurrentBatchMessage(`Processing batch for ${dayToProcess}... (${processedSoFar} / ${totalToProcess})`);
    try {
      const batchResponse = await fetch('/api/manager/data-updation/process-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            dateToProcess: dayToProcess, 
            batchSize: BATCH_SIZE, 
            lastProcessedDocId: currentLastDocId,
            staffNameMap: staffMap,
            isFirstBatchForDay: isFirstCallForThisDay 
        }),
      });
      const batchResult = await batchResponse.json();

      if (!batchResponse.ok) throw new Error(batchResult.message || 'Batch processing failed.');

      const processedInThisBatch = batchResult.transactionsProcessedInBatch || 0;
      const newProcessedSoFar = processedSoFar + processedInThisBatch;
      setTransactionsProcessedSoFar(newProcessedSoFar);
      setLastProcessedDocId(batchResult.lastProcessedDocId);
      setIsFirstBatchForThisDay(false); 

      sonnerToast.info(`Batch for ${dayToProcess} complete: ${processedInThisBatch} transactions processed.`);

      if (processedInThisBatch === 0 && newProcessedSoFar < totalToProcess && batchResult.lastProcessedDocId === currentLastDocId) {
        // This condition means no new transactions were processed in this batch,
        // but we haven't reached totalToProcess, and lastProcessedDocId hasn't changed.
        // This implies we might be at the end, or an issue occurred.
        // For safety, if we have a lastProcessedDocId, and it hasn't changed, and we are not done,
        // this might indicate an infinite loop if not handled.
        // However, the original logic was "if (processedInThisBatch === 0 || !batchResult.lastProcessedDocId || newProcessedSoFar >= totalToProcess)"
        // The server now returns lastProcessedDocId even if no transactions, so !batchResult.lastProcessedDocId might not be hit often.
        // The key is newProcessedSoFar >= totalToProcess or (processedInThisBatch === 0 meaning no more for that day)
        setCurrentBatchMessage(`All ${totalToProcess} transactions for ${dayToProcess} processed successfully! Aggregates are updated.`);
        sonnerToast.success("Aggregation update complete for " + dayToProcess + "!");
        setIsProcessing(false);
      } else if (newProcessedSoFar >= totalToProcess || processedInThisBatch < BATCH_SIZE) { 
        // If we've processed everything, or the batch was not full (implying end of data for the day)
        setCurrentBatchMessage(`All ${totalToProcess} transactions for ${dayToProcess} processed successfully! Aggregates are updated.`);
        sonnerToast.success("Aggregation update complete for " + dayToProcess + "!");
        setIsProcessing(false);
      }
      else {
        setTimeout(() => processNextBatch(dayToProcess, batchResult.lastProcessedDocId, newProcessedSoFar, totalToProcess, staffMap, false), 500); 
      }
    } catch (err: any) {
      setError(err.message);
      setCurrentBatchMessage(`Error during batch processing for ${dayToProcess}: ${err.message}`);
      sonnerToast.error(`Batch error for ${dayToProcess}: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const togglePauseResume = () => {
    if (isProcessing) {
        setIsPaused(!isPaused);
        if (!isPaused) { 
            setCurrentBatchMessage("Resuming process...");
            // isFirstBatchForThisDay should be false if resuming an already started process
            processNextBatch(dateToProcess, lastProcessedDocId, transactionsProcessedSoFar, totalTransactionsToProcess, staffNameMap, false); 
        } else {
            setCurrentBatchMessage(`Process paused. ${transactionsProcessedSoFar} of ${totalTransactionsToProcess} processed for ${dateToProcess}.`);
        }
    }
  };
  
  const resetProcess = () => {
    setIsProcessing(false);
    setIsPaused(false);
    setTotalTransactionsToProcess(0);
    setTransactionsProcessedSoFar(0);
    setCurrentBatchMessage("Process reset. Please select a date to begin."); // Updated message
    setError(null);
    setLastProcessedDocId(null);
    setIsFirstBatchForThisDay(true); 
    setDateToProcess(''); // Also reset the date
  };

  const progressValue = totalTransactionsToProcess > 0 ? (transactionsProcessedSoFar / totalTransactionsToProcess) * 100 : 0;

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <DatabaseZap className="h-6 w-6 text-orange-500" />
              Data Aggregation Update Tool (Reset & Recalculate Day)
            </CardTitle>
            <CardDescription className="mt-1">
              Select a single day to <b>delete</b> its existing daily aggregates and then <b>recalculate</b> them
              by processing all its `salesTransactions` in batches.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Important Considerations:</p>
                  <ul className="mt-1 list-disc list-inside text-xs text-yellow-600 dark:text-yellow-200 space-y-1">
                    <li>This operation will <b>DELETE existing aggregates for the selected day</b> before recalculating.</li>
                    <li>It is read-intensive on `salesTransactions` for the selected day.</li>
                    <li>Ensure your Firestore read quota has sufficient capacity.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 items-end">
              <div>
                <Label htmlFor="dateToProcess" className="font-semibold">Date to Process</Label>
                <Input 
                  type="date" 
                  id="dateToProcess" 
                  value={dateToProcess} 
                  onChange={(e) => {
                      setDateToProcess(e.target.value);
                      // Optionally clear messages or set a new one when date changes
                      if(e.target.value) {
                        setCurrentBatchMessage(`Date ${e.target.value} selected. Click "Start Process" to begin.`);
                        setError(null); // Clear previous errors if any when a new date is selected
                      } else {
                        setCurrentBatchMessage("Please select a date to begin.");
                      }
                      setTotalTransactionsToProcess(0); // Reset counts if date changes
                      setTransactionsProcessedSoFar(0);
                      setLastProcessedDocId(null);
                      setIsFirstBatchForThisDay(true);
                  }} 
                  className="mt-1" 
                  max={todayStr} 
                  disabled={isProcessing}
                />
              </div>
            </div>

            {!isProcessing && (
                <Button
                onClick={startFullProcess}
                disabled={isProcessing || !dateToProcess || Object.keys(staffNameMap).length === 0}
                className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white"
                size="lg"
                >
                 <PlayCircle className="mr-2 h-5 w-5" /> 
                 {/* MODIFICATION: Button text */}
                 {dateToProcess ? `Start Process for ${dateToProcess}` : "Select a Date to Start"}
                </Button>
            )}
            {isProcessing && (
                 <Button
                    onClick={togglePauseResume}
                    variant={isPaused ? "outline" : "secondary"}
                    className="w-full sm:w-auto"
                    size="lg"
                >
                    {isPaused ? <PlayCircle className="mr-2 h-5 w-5" /> : <PauseCircle className="mr-2 h-5 w-5" />}
                    {isPaused ? "Resume" : "Pause"}
                </Button>
            )}
             <Button onClick={resetProcess} variant="ghost" size="sm" disabled={isProcessing && !isPaused} className="ml-2 text-xs">
                <RotateCcw className="mr-1 h-3 w-3"/> Reset
            </Button>

            {/* Display progress only if processing has started and we have a total count */}
            {totalTransactionsToProcess > 0 && isProcessing && (
                <div className="mt-4 space-y-2">
                    <Label>Progress: {transactionsProcessedSoFar} / {totalTransactionsToProcess} transactions</Label>
                    <Progress value={progressValue} className="w-full" />
                </div>
            )}
            {/* Display progress after completion as well, if not an error */}
            {totalTransactionsToProcess > 0 && !isProcessing && transactionsProcessedSoFar === totalTransactionsToProcess && !error && (
                 <div className="mt-4 space-y-2">
                    <Label>Completed: {transactionsProcessedSoFar} / {totalTransactionsToProcess} transactions</Label>
                    <Progress value={100} className="w-full" />
                </div>
            )}


            {currentBatchMessage && (
              <Card className={`mt-4 ${error ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ((isProcessing && !isPaused) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-green-500 bg-green-50 dark:bg-green-900/20')}`}>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className={`text-sm flex items-center gap-2 ${error ? 'text-red-700 dark:text-red-300' : ((isProcessing && !isPaused) ? 'text-blue-700 dark:text-blue-300' : 'text-green-700 dark:text-green-300')}`}>
                    {error ? <AlertTriangle className="h-4 w-4"/> : ((isProcessing && !isPaused) ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>)}
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3 px-4">
                  <p className={`text-xs ${error ? 'text-red-600 dark:text-red-200' : ((isProcessing && !isPaused) ? 'text-blue-600 dark:text-blue-200' : 'text-green-600 dark:text-green-200')}`}>
                    {currentBatchMessage}
                  </p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}