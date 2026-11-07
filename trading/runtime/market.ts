// Bars from Tradier timesales, and indicators computed by the backtest engine
// itself, so a live signal sees exactly what the backtest would on that bar.

import { calculateIndicatorsWithParams, deriveRequiredIndicators } from '@/app/lib/backtest-engine';
import type { IndicatorValues, OHLCBar } from '@/app/strategies';
import type { ParamValue } from './config';
import type { TimesalesRow } from './tradier';
import { parseEtTimestamp } from './time';

export interface Bar {
  time: number; // bar open, UTC epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ParsedBars {
  bars: Bar[];
  rawCount: number;
  invalid: number;
  droppedForming: number;
}

/** Valid, de-duplicated, completed bars, oldest first. The bar still forming at `nowMs` is dropped. */
export function parseBars(rows: TimesalesRow[], intervalMs: number, nowMs: number): ParsedBars {
  const bars: Bar[] = [];
  let invalid = 0;
  for (const d of rows) {
    const bar: Bar = {
      time: parseEtTimestamp(d.time),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume ?? 0),
    };
    const ok =
      Number.isFinite(bar.time) &&
      [bar.open, bar.high, bar.low, bar.close].every((v) => Number.isFinite(v) && v > 0) &&
      bar.high >= bar.low &&
      bar.high >= Math.max(bar.open, bar.close) - 1e-9 &&
      bar.low <= Math.min(bar.open, bar.close) + 1e-9;
    if (ok) bars.push(bar);
    else invalid++;
  }
  bars.sort((a, b) => a.time - b.time);
  const dedup: Bar[] = [];
  for (const b of bars) {
    if (dedup.length && dedup[dedup.length - 1].time === b.time) dedup[dedup.length - 1] = b;
    else dedup.push(b);
  }
  const completed = dedup.filter((b) => b.time + intervalMs <= nowMs);
  return { bars: completed, rawCount: rows.length, invalid, droppedForming: dedup.length - completed.length };
}

export type SeriesBar = OHLCBar & IndicatorValues & Record<string, unknown>;

/** The engine's indicators over the whole window, for the periods this strategy's params need. */
export function computeSeries(bars: Bar[], strategyId: string, params: Record<string, ParamValue>): SeriesBar[] {
  const req = deriveRequiredIndicators(strategyId, [params]);
  return calculateIndicatorsWithParams(bars, req.requiredEMAs, req.requiredSMAs, req.requiredMACDs, req.requiredDonchianPeriods) as unknown as SeriesBar[];
}
