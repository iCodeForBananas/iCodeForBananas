// Bars from Tradier timesales, and indicators computed by the backtest engine
// itself, so a live signal sees exactly what the backtest would on that bar.

import { calculateIndicatorsWithParams, deriveRequiredIndicators } from '@/app/lib/backtest-engine';
import type { IndicatorValues, OHLCBar } from '@/app/strategies';
import type { ParamValue } from './config';
import type { HistoryRow, TimesalesRow } from './tradier';
import { SESSION_CLOSE_MIN, SESSION_OPEN_MIN, etMinutesOfDay, etParts, etWallToUtcMs, parseEtTimestamp, sessionBounds } from './time';

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

/** A daily bar's time is its session's 09:30 ET open; it closes at 16:00 ET that day. */
export function sessionClose(barTime: number): number {
  const p = etParts(barTime);
  return etWallToUtcMs(p.year, p.month, p.day, 16, 0);
}

/** Valid, de-duplicated daily bars, oldest first. A session that hasn't closed by `nowMs` (16:00 ET) is dropped. */
export function parseDailyBars(rows: HistoryRow[], nowMs: number): ParsedBars {
  const asTimesales: TimesalesRow[] = rows.map((r) => ({ ...r, time: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) ? `${r.date}T09:30:00` : 'invalid' }));
  // parseBars drops a bar whose time + interval is after now: for a session
  // that is 09:30 + 6h30m = 16:00 ET.
  return parseBars(asTimesales, 390 * 60_000, nowMs);
}

/**
 * The bars that open inside the regular session, 09:30-16:00 ET. The
 * backtest data holds only these, so the live series must too: a pre-market
 * or after-hours bar would add candles, and EMA inputs, the backtest never saw.
 */
export function regularSessionBars(bars: Bar[]): Bar[] {
  return bars.filter((b) => {
    const min = etMinutesOfDay(b.time);
    return min >= SESSION_OPEN_MIN && min < SESSION_CLOSE_MIN;
  });
}

/**
 * When an intraday bar of `intervalMs` opening at `time` closes: a whole
 * interval later, or at 16:00 ET for a session's last, shorter bar (the
 * 15:30 hourly bar, as in the backtest data).
 */
export function intradayBarClose(time: number, intervalMs: number): number {
  return Math.min(time + intervalMs, sessionBounds(time).close);
}

/** The start of the `targetMs` bar holding `time`: 09:30 ET plus whole intervals. */
function sessionBucketStart(time: number, targetMs: number): number {
  const { open } = sessionBounds(time);
  return open + Math.floor((time - open) / targetMs) * targetMs;
}

/**
 * Aggregates completed regular-session source bars into bars of `targetMs`,
 * counted from the 09:30 ET open the way the backtest data's are: 30-minute
 * bars at 09:30, 10:00, ...; hourly at 09:30, 10:30, ... 14:30, then 15:30-16:00.
 * A bar that hasn't closed by `nowMs` is dropped, and so is the newest one
 * unless its final source bar is there: a 30-minute bar is never built from
 * only its first half. Older bars keep whatever source bars traded.
 */
export function aggregateBars(bars: Bar[], sourceMs: number, targetMs: number, nowMs: number): { bars: Bar[]; droppedIncomplete: number } {
  if (sourceMs === targetMs) return { bars, droppedIncomplete: 0 };
  const out: (Bar & { lastSub: number })[] = [];
  for (const b of bars) {
    const start = sessionBucketStart(b.time, targetMs);
    const cur = out[out.length - 1];
    if (cur && cur.time === start) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
      cur.lastSub = b.time;
    } else {
      out.push({ time: start, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, lastSub: b.time });
    }
  }
  let droppedIncomplete = 0;
  const closed = out.filter((b) => intradayBarClose(b.time, targetMs) <= nowMs);
  droppedIncomplete += out.length - closed.length;
  const last = closed[closed.length - 1];
  if (last && last.lastSub + sourceMs !== intradayBarClose(last.time, targetMs)) {
    closed.pop();
    droppedIncomplete++;
  }
  return { bars: closed.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })), droppedIncomplete };
}

export type SeriesBar = OHLCBar & IndicatorValues & Record<string, unknown>;

/** The engine's indicators over the whole window, for the periods this strategy's params need. */
export function computeSeries(bars: Bar[], strategyId: string, params: Record<string, ParamValue>): SeriesBar[] {
  const req = deriveRequiredIndicators(strategyId, [params]);
  return calculateIndicatorsWithParams(bars, req.requiredEMAs, req.requiredSMAs, req.requiredMACDs, req.requiredDonchianPeriods) as unknown as SeriesBar[];
}
