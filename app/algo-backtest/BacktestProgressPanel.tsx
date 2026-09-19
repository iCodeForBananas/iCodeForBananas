"use client";

import { useEffect, useState } from "react";
import type { BacktestProgress } from "./useBacktestWorker";

const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/**
 * What a running backtest is doing, counted in variations (one parameter set
 * on one dataset), since that's the unit the Run button promised. A per-dataset
 * count sat at 0 / 1 for the whole of a single-dataset run and looked frozen.
 */
export default function BacktestProgressPanel({
  progress,
  datasetLabel,
  onCancel,
}: {
  progress: BacktestProgress | null;
  datasetLabel: (file: string) => string;
  onCancel: () => void;
}) {
  // Re-render every second so elapsed time moves even between progress posts.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const fraction = total > 0 ? completed / total : 0;
  const percent = Math.floor(fraction * 100);
  const elapsed = progress ? now - progress.startedAt : 0;
  // Only estimate once there's enough done for the rate to mean something.
  const eta = fraction >= 0.02 && fraction < 1 ? (elapsed / fraction) * (1 - fraction) : null;

  const status = !progress || progress.phase === "starting"
    ? "Starting…"
    : progress.phase === "loading"
      ? `Loading ${datasetLabel(progress.currentDataset ?? "")} and computing indicators…`
      : `Testing ${progress.currentStrategy ?? "strategy"} on ${datasetLabel(progress.currentDataset ?? "")}`;

  return (
    <div className='flex-1 flex items-center justify-center p-8'>
      <div className='w-full max-w-md mx-auto' role='status' aria-live='polite'>
        <h2 className='text-17 font-semibold text-ink-primary'>Running backtest</h2>
        <p className='mt-1 text-13 text-ink-muted truncate' title={status}>{status}</p>

        <div className='mt-5 flex items-baseline justify-between gap-4'>
          <span className='text-24 font-semibold tabular-nums text-ink-primary'>
            {completed.toLocaleString()}
            <span className='text-15 font-normal text-ink-muted'>
              {" "}/ {total > 0 ? total.toLocaleString() : "…"} variations
            </span>
          </span>
          <span className='text-15 font-semibold tabular-nums text-primary-text'>{percent}%</span>
        </div>

        <div
          className='mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken'
          role='progressbar'
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
          aria-label='Variations completed'
        >
          <div
            className='h-full rounded-full bg-primary-solid transition-[width] duration-180 ease-ui motion-reduce:transition-none'
            style={{ width: `${fraction * 100}%` }}
          />
        </div>

        <div className='mt-2 flex justify-between text-12 text-ink-muted tabular-nums'>
          <span>
            {progress && progress.datasetCount > 1
              ? `Dataset ${Math.min(progress.datasetIndex + 1, progress.datasetCount)} of ${progress.datasetCount}`
              : "1 dataset"}
          </span>
          <span>
            {formatDuration(elapsed)} elapsed{eta !== null ? ` · ~${formatDuration(eta)} left` : ""}
          </span>
        </div>

        <button
          onClick={onCancel}
          className='mt-6 h-8 rounded-md border border-line-subtle bg-surface-raised px-3 text-13 text-ink-primary hover:bg-surface-overlay'
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
