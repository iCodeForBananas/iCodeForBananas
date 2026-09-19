"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IndicatorData } from "@/app/types";
import { ParameterizedResult } from "@/app/strategies";
import type { BacktestDetailJob, BacktestJob, BacktestWorkerMessage, StrategyRun } from "./backtest.worker";

export type { StrategyRun };

export interface BacktestJobResult {
  results: ParameterizedResult[];
  indicatorDataByDataset: Record<string, IndicatorData[]>;
  failedDatasets: string[];
}

export interface BacktestDetail {
  result: ParameterizedResult;
  indicatorData: IndicatorData[];
}

export interface BacktestProgress {
  /** Variations finished so far, across every dataset and strategy. */
  completed: number;
  /** Variations in the whole run. 0 until the worker has counted them. */
  total: number;
  datasetIndex: number;
  datasetCount: number;
  currentDataset?: string;
  currentStrategy?: string;
  phase: "starting" | "loading" | "running";
  /** Date.now() when the run was started, for elapsed time and ETA. */
  startedAt: number;
}

export function useBacktestWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<{
    jobId: string;
    resolve: (value: BacktestJobResult) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const detailsRef = useRef(
    new Map<string, { resolve: (value: BacktestDetail) => void; reject: (err: Error) => void }>(),
  );
  const [progress, setProgress] = useState<BacktestProgress | null>(null);

  // Terminating the worker drops whatever it was doing, detail runs included.
  const rejectDetails = useCallback((reason: string) => {
    for (const d of detailsRef.current.values()) d.reject(new Error(reason));
    detailsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pendingRef.current?.reject(new Error("Worker terminated"));
      pendingRef.current = null;
      rejectDetails("Worker terminated");
    };
  }, [rejectDetails]);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("./backtest.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<BacktestWorkerMessage>) => {
      const msg = event.data;
      const detail = detailsRef.current.get(msg.jobId);
      if (detail) {
        detailsRef.current.delete(msg.jobId);
        if (msg.type === "detail") detail.resolve({ result: msg.result, indicatorData: msg.indicatorData });
        else if (msg.type === "error") detail.reject(new Error(msg.error));
        return;
      }
      const pending = pendingRef.current;
      if (!pending || msg.jobId !== pending.jobId) return;
      if (msg.type === "progress") {
        setProgress((prev) => ({
          completed: msg.completed,
          total: msg.total,
          datasetIndex: msg.datasetIndex,
          datasetCount: msg.datasetCount,
          currentDataset: msg.currentDataset,
          currentStrategy: msg.currentStrategy,
          phase: msg.phase,
          startedAt: prev?.startedAt ?? Date.now(),
        }));
        return;
      }
      if (msg.type === "done") {
        pendingRef.current = null;
        setProgress(null);
        pending.resolve({
          results: msg.results,
          indicatorDataByDataset: msg.indicatorDataByDataset,
          failedDatasets: msg.failedDatasets,
        });
        return;
      }
      if (msg.type === "error") {
        pendingRef.current = null;
        setProgress(null);
        pending.reject(new Error(msg.error));
      }
    });
    worker.addEventListener("error", (event) => {
      rejectDetails(event.message || "Worker error");
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      setProgress(null);
      pending.reject(new Error(event.message || "Worker error"));
    });
    workerRef.current = worker;
    return worker;
  }, [rejectDetails]);

  const run = useCallback(
    (selectedFiles: string[], runs: StrategyRun[]): Promise<BacktestJobResult> => {
      // Tearing down + respawning the worker is the cleanest way to cancel any
      // in-flight job — Web Workers don't expose cooperative cancellation.
      if (pendingRef.current) {
        workerRef.current?.terminate();
        workerRef.current = null;
        pendingRef.current.reject(new Error("Superseded by new job"));
        pendingRef.current = null;
        rejectDetails("Superseded by new job");
      }
      const worker = ensureWorker();
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job: BacktestJob = { type: "run", jobId, selectedFiles, runs };
      setProgress({
        completed: 0,
        total: 0,
        datasetIndex: 0,
        datasetCount: selectedFiles.length,
        phase: "starting",
        startedAt: Date.now(),
      });
      return new Promise<BacktestJobResult>((resolve, reject) => {
        pendingRef.current = { jobId, resolve, reject };
        worker.postMessage(job);
      });
    },
    [ensureWorker, rejectDetails],
  );

  /** Re-run one variation to get its trades and chart rows. */
  const detail = useCallback(
    (dataset: string, run: StrategyRun, params: Record<string, number | boolean | string>): Promise<BacktestDetail> => {
      const worker = ensureWorker();
      const jobId = `detail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job: BacktestDetailJob = { type: "detail", jobId, dataset, run, params };
      return new Promise<BacktestDetail>((resolve, reject) => {
        detailsRef.current.set(jobId, { resolve, reject });
        worker.postMessage(job);
      });
    },
    [ensureWorker],
  );

  const cancel = useCallback(() => {
    if (!pendingRef.current) return;
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current.reject(new Error("Cancelled"));
    pendingRef.current = null;
    rejectDetails("Cancelled");
    setProgress(null);
  }, [rejectDetails]);

  return { run, detail, cancel, progress };
}
