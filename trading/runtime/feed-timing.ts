// How far behind the wall clock the sandbox's market data is when a run
// fires. Logged on every intraday run as `feed`, so the delay can be measured
// against a real-time source afterwards instead of assumed (DATA_DELAY_MS).

import type { TimesalesRow, TradierQuote } from './tradier';
import { parseEtTimestamp } from './time';

export interface FeedTiming {
  /** When the data was read, UTC. */
  wallClock: string;
  /** The newest timesales row Tradier returned, before any filtering, forming or not. */
  newestRawBar: { time: string; open: number; close: number; volume: number; minutesBehind: number } | null;
  /** The sandbox quote, with how old its last trade is. Null if the quote call failed. */
  quote: { last: number; tradeTime: string | null; lagMinutes: number | null; bid: number | null; ask: number | null; bidTime: string | null } | null;
}

const minutes = (ms: number) => Math.round((ms / 60_000) * 100) / 100;
const iso = (ms: unknown) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null);
const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * `minutesBehind` is the wall clock minus the newest row's open time: with a
 * 15-minute delay and 15-minute rows it's 15 to 30, on a real-time feed 0 to 15.
 */
export function feedTiming(nowMs: number, rows: TimesalesRow[], quote: TradierQuote | null): FeedTiming {
  let newest: { t: number; row: TimesalesRow } | null = null;
  for (const row of rows) {
    const t = parseEtTimestamp(row.time);
    if (Number.isFinite(t) && (!newest || t > newest.t)) newest = { t, row };
  }
  const trade = num(quote?.trade_date);
  return {
    wallClock: new Date(nowMs).toISOString(),
    newestRawBar: newest
      ? { time: new Date(newest.t).toISOString(), open: Number(newest.row.open), close: Number(newest.row.close), volume: Number(newest.row.volume ?? 0), minutesBehind: minutes(nowMs - newest.t) }
      : null,
    quote: quote
      ? { last: Number(quote.last), tradeTime: iso(trade), lagMinutes: trade ? minutes(nowMs - trade) : null, bid: num(quote.bid), ask: num(quote.ask), bidTime: iso(num(quote.bid_date)) }
      : null,
  };
}
