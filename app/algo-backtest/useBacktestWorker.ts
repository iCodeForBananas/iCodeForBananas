"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IndicatorData } from "@/app/types";
import { ParameterizedResult } from "@/app/strategies";
import { ParameterVariationConfig } from "@/app/lib/backtest-engine";
import type { BacktestJob, BacktestWorkerMessage } from "./backtest.worker";

interface StrategyRun {
  strategyId: string;
  paramVariations: ParameterVariationConfig[];
  currentParams: Record<string, number | boolean | string>;
  stopLossPercent: number;
  takeProfitPercent: number;
  enableShorts: boolean;
}

export interface BacktestJobResult {
  results: ParameterizedResult[];
  indicatorDataByDataset: Record<string, IndicatorData[]>;
  failedDatasets: string[];
}

export interface BacktestProgress {
  completed: number;
  total: number;
  currentDataset?: string;
}

export function useBacktestWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<{
    jobId: string;
    resolve: (value: BacktestJobResult) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const [progress, setProgress] = useState<BacktestProgress | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pendingRef.current?.reject(new Error("Worker terminated"));
      pendingRef.current = null;
    };
  }, []);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("./backtest.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<BacktestWorkerMessage>) => {
      const msg = event.data;
      const pending = pendingRef.current;
      if (!pending || msg.jobId !== pending.jobId) return;
      if (msg.type === "progress") {
        setProgress({ completed: msg.completed, total: msg.total, currentDataset: msg.currentDataset });
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
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      setProgress(null);
      pending.reject(new Error(event.message || "Worker error"));
    });
    workerRef.current = worker;
    return worker;
  }, []);

  const run = useCallback(
    (selectedFiles: string[], runs: StrategyRun[]): Promise<BacktestJobResult> => {
      // Tearing down + respawning the worker is the cleanest way to cancel any
      // in-flight job — Web Workers don't expose cooperative cancellation.
      if (pendingRef.current) {
        workerRef.current?.terminate();
        workerRef.current = null;
        pendingRef.current.reject(new Error("Superseded by new job"));
        pendingRef.current = null;
      }
      const worker = ensureWorker();
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job: BacktestJob = { type: "run", jobId, selectedFiles, runs };
      setProgress({ completed: 0, total: selectedFiles.length });
      return new Promise<BacktestJobResult>((resolve, reject) => {
        pendingRef.current = { jobId, resolve, reject };
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
    setProgress(null);
  }, []);

  return { run, cancel, progress };
}
