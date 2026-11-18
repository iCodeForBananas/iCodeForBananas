// How many bars a strategy needs before its signal on the newest bar is the
// one it would give with all of history behind it. The live runtime
// (trading/runtime) computes indicators over only the bars it fetches each run,
// so this is the floor for a deployment's minBars.
//
// Derived from what the strategy actually reads, not from its parameter
// values: its own handler runs over a synthetic series whose bars record every
// field read and how far back. Each field read has a known warmup (SMA N needs
// N bars; an EMA needs its N plus enough bars for its seed to fade), so the
// requirement is the largest offset + warmup over everything read. A trend
// filter that's off reads no SMA, so it adds nothing; an IBS percent or an
// RSI level is never read as a bar field, so it adds nothing either.
//
// Some strategies compute their own indicators over the whole series (Wilder
// RSI, SMMA, KAMA, regressions). Those reads reach bar 0, so they can't be
// derived this way. For them the warmup is measured: the shortest window whose
// signals match a full-history run at every point checked on the synthetic
// series, plus half again as margin. Either way the result says how it was
// found, and when neither works it says so rather than guessing.

import type { StrategyDefinition, StrategyContext } from "@/app/strategies/types";
import type { IndicatorData, PricePoint } from "@/app/types";
import { calculateIndicatorsWithParams, deriveRequiredIndicators } from "./backtest-engine";

type Params = Record<string, number | boolean | string>;

/** One thing the strategy reads, and the bars it needs. */
export interface WarmupPart {
  /** What is read, e.g. "EMA 14" or "close, 3 bars back". */
  label: string;
  /** Bars needed for it to be ready on the newest bar. */
  bars: number;
  /** Why that many, for the prompt. */
  why: string;
}

export type Warmup =
  | { kind: "derived"; bars: number; parts: WarmupPart[] }
  | { kind: "measured"; bars: number; matchedFrom: number; checked: number; parts: WarmupPart[] }
  | { kind: "unknown"; reason: string; parts: WarmupPart[] };

/** How far below a long-run value a recursive average's seed may leave it: 0.1%. */
const SETTLE_TOLERANCE = 0.001;
/** Bars for a recursive average with smoothing `alpha` to forget its seed to SETTLE_TOLERANCE. */
export const settleBars = (alpha: number) => Math.ceil(Math.log(SETTLE_TOLERANCE) / Math.log(1 - alpha));

const RSI_ATR_PERIOD = 14;

/**
 * Bars a field of the engine's bars (calculateIndicatorsWithParams) needs to
 * be ready, or null for a field the engine doesn't compute.
 */
export function fieldWarmup(key: string): { label: string; bars: number; why: string } | null {
  if (["time", "open", "high", "low", "close", "volume"].includes(key)) return { label: "price bars", bars: 1, why: "the bar itself" };
  if (["prevClose", "prevHigh", "prevLow"].includes(key)) return { label: key, bars: 2, why: "the bar before" };
  let m = /^sma(\d+)$/.exec(key);
  if (m) {
    const n = Number(m[1]);
    return { label: `SMA ${n}`, bars: n, why: `${n} closes` };
  }
  m = /^ema(\d+)$/.exec(key);
  if (m) {
    const n = Number(m[1]);
    const s = settleBars(2 / (n + 1));
    return { label: `EMA ${n}`, bars: n + s, why: `${n} to seed it, ${s} more for the seed to fade under 0.1%` };
  }
  if (key === "rsi" || key === "atr") {
    const s = settleBars(1 / RSI_ATR_PERIOD);
    return { label: `${key.toUpperCase()} ${RSI_ATR_PERIOD}`, bars: RSI_ATR_PERIOD + 1 + s, why: `${RSI_ATR_PERIOD + 1} to seed it, ${s} more for Wilder smoothing to fade under 0.1%` };
  }
  m = /^(macd|macdSignal|macdHistogram)(?:_(\d+)_(\d+)_(\d+))?$/.exec(key);
  if (m) {
    const [fast, slow, signal] = m[2] ? [Number(m[2]), Number(m[3]), Number(m[4])] : [12, 26, 9];
    const line = slow + settleBars(2 / (slow + 1));
    const bars = m[1] === "macd" ? line : line + settleBars(2 / (signal + 1));
    return { label: `MACD ${fast}/${slow}/${signal}${m[1] === "macd" ? "" : m[1] === "macdSignal" ? " signal" : " histogram"}`, bars, why: m[1] === "macd" ? `the slow EMA's ${line}` : `the slow EMA's ${line}, then the signal EMA settling` };
  }
  m = /^donchian_(\d+)_(upperBand|lowerBand|midLine)$/.exec(key);
  if (m) return { label: `Donchian ${m[1]}`, bars: Number(m[1]), why: `${m[1]} bars of highs and lows` };
  if (["upperBand", "lowerBand", "midLine"].includes(key)) return { label: "Donchian 20", bars: 20, why: "20 bars of highs and lows" };
  return null;
}

const DAY = 24 * 60 * 60 * 1000;

/** Deterministic random numbers, so the same strategy and params always give the same answer. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random walk of weekday daily bars, with real ranges and gaps, so signals fire both ways. */
export function syntheticBars(n: number, seed = 7): PricePoint[] {
  const rand = rng(seed);
  const bars: PricePoint[] = [];
  let close = 100;
  let t = Date.UTC(2010, 0, 4, 14, 30);
  while (bars.length < n) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const open = close * (1 + (rand() - 0.5) * 0.02);
      const next = open * (1 + (rand() - 0.5) * 0.04);
      const high = Math.max(open, next) * (1 + rand() * 0.01);
      const low = Math.min(open, next) * (1 - rand() * 0.01);
      bars.push({ time: t, open, high, low, close: next });
      close = next;
    }
    t += DAY;
  }
  return bars;
}

/** The bars the runtime builds from the bars it fetched (trading/runtime/market.ts computeSeries). */
function seriesFor(strategyId: string, params: Params, bars: PricePoint[]): IndicatorData[] {
  const req = deriveRequiredIndicators(strategyId, [params]);
  return calculateIndicatorsWithParams(bars, req.requiredEMAs, req.requiredSMAs, req.requiredMACDs, req.requiredDonchianPeriods);
}

type Position = StrategyContext["position"];
const POSITIONS: Position[] = [null, "long", "short"];

/** The largest window searched; more than any daily deployment can fetch (3,650 days). */
const MAX_WINDOW = 2600;
/** Bars of synthetic history: the largest window, plus room for the points checked. */
const SERIES_LENGTH = MAX_WINDOW + 400;
/** Bars, from the end, at which the handler is traced or its signals compared. */
const PROBES = Array.from({ length: 120 }, (_, i) => SERIES_LENGTH - 1 - i * 3);

const call = (strategy: StrategyDefinition, series: IndicatorData[], index: number, params: Params, position: Position) => {
  const s = series as StrategyContext["series"];
  return strategy.handler({ current: s[index], previous: s[index - 1] ?? null, index, series: s, params, position });
};

/**
 * Every bar field the handler reads, with the furthest back it reads it, and
 * whether it reads the start of the series (whole-history computations).
 */
function trace(strategy: StrategyDefinition, params: Params, series: IndicatorData[]) {
  const furthest = new Map<string, number>();
  let probe = 0;
  let readsFromStart = false;
  const elements = new Map<number, object>();
  const element = (i: number) => {
    let el = elements.get(i);
    if (!el) {
      el = new Proxy(series[i] as object, {
        get(target, key, receiver) {
          if (typeof key === "string") {
            if (i === 0) readsFromStart = true;
            const back = probe - i;
            if (back >= 0 && back > (furthest.get(key) ?? -1)) furthest.set(key, back);
          }
          return Reflect.get(target, key, receiver);
        },
      });
      elements.set(i, el);
    }
    return el;
  };
  // One proxy for every call, so a strategy's per-series cache works as it would.
  const proxied = new Proxy(series, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) {
        const i = Number(key);
        return i < target.length ? element(i) : undefined;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  for (const index of PROBES) {
    probe = index;
    for (const position of POSITIONS) call(strategy, proxied, index, params, position);
  }
  return { furthest, readsFromStart };
}

/** The handler's signals at the probes, given `window` bars of history each time, all match a full-history run. */
function matchesFullHistory(strategy: StrategyDefinition, params: Params, bars: PricePoint[], full: IndicatorData[], window: number): boolean {
  for (const index of PROBES) {
    const truncated = seriesFor(strategy.id, params, bars.slice(index - window + 1, index + 1));
    for (const position of POSITIONS) {
      const a = call(strategy, full, index, params, position);
      const b = call(strategy, truncated, truncated.length - 1, params, position);
      if (a.action !== b.action || a.reason !== b.reason) return false;
    }
  }
  return true;
}

/** Every signal at the probes, as one comparable list. */
function signals(strategy: StrategyDefinition, params: Params, series: IndicatorData[]): string[] {
  const out: string[] = [];
  for (const index of PROBES) {
    for (const position of POSITIONS) {
      try {
        const s = call(strategy, series, index, params, position);
        out.push(`${s.action}|${s.reason}`);
      } catch {
        out.push("threw");
      }
    }
  }
  return out;
}

const PRICE_FIELDS = new Set(["time", "open", "high", "low", "close", "volume", "prevClose", "prevHigh", "prevLow"]);

/** The bars `strategy` needs at `params` before its newest signal is the one full history gives. */
export function strategyWarmup(strategy: StrategyDefinition, params: Params): Warmup {
  const bars = syntheticBars(SERIES_LENGTH);
  const full = seriesFor(strategy.id, params, bars);
  const { furthest, readsFromStart } = trace(strategy, params, full);
  const baseline = signals(strategy, params, full).join("\n");

  // An indicator read only counts if the signals depend on it: IBS reads the
  // 200 SMA on every bar but ignores it with the trend filter off.
  const matters = (key: string) => {
    const without = full.map((b) => ({ ...b, [key]: undefined }) as IndicatorData);
    return signals(strategy, params, without).join("\n") !== baseline;
  };

  const parts: WarmupPart[] = [];
  const unknown: string[] = [];
  let pricesBack = -1;
  for (const [key, back] of furthest) {
    const w = fieldWarmup(key);
    if (!w) {
      // Something on the bar that isn't an engine field (e.g. a method); only a problem if it's data the engine never fills.
      if (!full.some((b) => (b as unknown as Record<string, unknown>)[key] !== undefined) && matters(key)) unknown.push(key);
      continue;
    }
    if (readsFromStart && back >= PROBES[PROBES.length - 1] - 1) continue; // part of a whole-history pass, measured below
    if (PRICE_FIELDS.has(key)) {
      pricesBack = Math.max(pricesBack, back + w.bars - 1);
      continue;
    }
    if (!matters(key)) continue;
    parts.push({ label: w.label, bars: back + w.bars, why: back > 0 ? `${w.why}, read ${back} bar${back === 1 ? "" : "s"} back` : w.why });
  }
  if (pricesBack >= 0) {
    parts.push({ label: pricesBack > 0 ? `prices ${pricesBack} bar${pricesBack === 1 ? "" : "s"} back` : "the bar's own prices", bars: pricesBack + 1, why: pricesBack > 0 ? `it reads bar prices up to ${pricesBack} back` : "it reads only the bar being decided on" });
  }
  // The largest need per indicator, biggest first.
  const byLabel = new Map<string, WarmupPart>();
  for (const p of parts) {
    const prev = byLabel.get(p.label);
    if (!prev || p.bars > prev.bars) byLabel.set(p.label, p);
  }
  const merged = [...byLabel.values()].sort((a, b) => b.bars - a.bars);
  const derived = Math.max(1, ...merged.map((p) => p.bars));

  if (unknown.length) {
    return { kind: "unknown", reason: `it reads ${unknown.map((k) => `\`${k}\``).join(", ")}, which the engine doesn't compute`, parts: merged };
  }
  if (!readsFromStart) return { kind: "derived", bars: derived, parts: merged };

  // Whole-history reads: measure. Grow the window until every probe matches, then narrow it.
  let lo = Math.max(1, derived - 1);
  let hi = 0;
  for (let w = Math.max(2, derived); w <= MAX_WINDOW; w = Math.min(MAX_WINDOW, Math.ceil(w * 1.3))) {
    if (matchesFullHistory(strategy, params, bars, full, w)) {
      hi = w;
      break;
    }
    lo = w;
    if (w === MAX_WINDOW) break;
  }
  if (!hi) {
    return { kind: "unknown", reason: `it computes over its whole history and its signals still differed from a full-history run with ${MAX_WINDOW} bars`, parts: merged };
  }
  // Matching at the derived floor means the whole-history part is ready by then too.
  if (hi === Math.max(2, derived)) return { kind: "derived", bars: derived, parts: merged };
  while (hi - lo > Math.max(1, Math.floor(hi * 0.02))) {
    const mid = Math.floor((lo + hi) / 2);
    if (matchesFullHistory(strategy, params, bars, full, mid)) hi = mid;
    else lo = mid;
  }
  return { kind: "measured", bars: Math.max(derived, Math.ceil(hi * 1.5)), matchedFrom: hi, checked: PROBES.length * POSITIONS.length, parts: merged };
}
