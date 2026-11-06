// Supply & Demand Zones (support and resistance as price areas, not lines)
//
// Published basis:
//   - Sam Seiden (Online Trading Academy), "supply and demand" zones: a base
//     of "boring" candles (body at most half the bar's range) that price
//     leaves with an "exciting" candle (big body, big range). A base before a
//     rally is demand, before a drop is supply. The zone runs from the base's
//     extreme wick (the distal line) to its bodies (the proximal line). Odds
//     enhancers: strength of the departure, little time spent in the base,
//     and freshness, since every retest uses up the orders resting there.
//   - Swing pivots (Bill Williams' fractals; Bulkowski): a bar whose high or
//     low beats the k bars on each side. It can only be known k bars later.
//   - Osler, "Support for Resistance" (FRBNY Economic Policy Review, 2000)
//     and "Currency Orders and Exchange Rate Dynamics" (Journal of Finance,
//     2003): published support/resistance levels predicted intraday trend
//     interruptions (bounces) well beyond chance, and clustered stop orders
//     just past them made trends accelerate once a level broke (breakouts).
//   - Brock, Lakonishok & LeBaron, "Simple Technical Trading Rules and the
//     Stochastic Properties of Stock Returns" (Journal of Finance, 1992):
//     buying breaks above the prior local maximum (resistance) earned excess
//     returns on the DJIA from 1897 to 1986. Sullivan, Timmermann & White
//     (1999) found the edge largely gone after 1986 once data snooping was
//     accounted for.
//
// How it trades, every decision on a closed bar (the engine fills at the next
// bar's open):
//   - Bounce: a bar dips into a fresh demand zone and closes back above it:
//     buy. A bar pokes into a fresh supply zone and closes back below it: sell
//     short. "Fresh" is the touch number of this visit, capped by maxTouches.
//   - Breakout: a bar closes through a supply zone's far edge: buy. Through a
//     demand zone's far edge: sell short.
//   - A close beyond a zone's distal line invalidates it. With flipBroken on,
//     the broken zone becomes one of the other kind (broken resistance is new
//     support), the polarity principle.
//   - Exit a long when any demand zone below breaks (the structure that
//     justified it failed) or, with exitAt "opposing", when price reaches a
//     supply zone. Shorts mirror it.
//
// Zones are built by one forward pass over closed bars, so a zone exists from
// the bar that completes it (the impulse bar, or the bar that confirms a
// pivot) and nothing earlier can see it.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';

export type ZoneSource = 'base' | 'pivot';

export interface ZoneParams {
  zoneSource: ZoneSource;
  atrPeriod: number;
  impulseAtr: number;
  maxBaseBars: number;
  pivotStrength: number;
  maxTouches: number;
  maxZoneAge: number;
  flipBroken: boolean;
}

/** Per-bar event flags, decided at that bar's close. */
export const EVENT = {
  DEMAND_BOUNCE: 1,
  SUPPLY_BOUNCE: 2,
  DEMAND_BROKEN: 4,
  SUPPLY_BROKEN: 8,
  DEMAND_TOUCHED: 16,
  SUPPLY_TOUCHED: 32,
} as const;

export interface ZoneSeries {
  events: Uint8Array;
  /** Nearest active demand zone under the close after each bar, NaN if none. */
  demandTop: Float64Array;
  demandBottom: Float64Array;
  /** Nearest active supply zone over the close after each bar, NaN if none. */
  supplyTop: Float64Array;
  supplyBottom: Float64Array;
  /** How many zones each side holds after each bar. */
  zoneCount: Uint16Array;
}

interface Zone {
  kind: 'demand' | 'supply';
  /** Edge price meets first: a demand zone's top, a supply zone's bottom. */
  proximal: number;
  /** Far edge: a close beyond it breaks the zone. */
  distal: number;
  born: number;
  touches: number;
  /** Whether the previous bar was inside the zone, so a visit counts once. */
  inside: boolean;
}

// Most recent zones kept per side. Old zones far from price rarely matter,
// and the cap keeps a pass over a million minute bars linear.
const MAX_ZONES = 24;

export const DEFAULT_ZONE_PARAMS: ZoneParams = {
  zoneSource: 'base',
  atrPeriod: 14,
  impulseAtr: 1.5,
  maxBaseBars: 4,
  pivotStrength: 5,
  maxTouches: 2,
  maxZoneAge: 0,
  flipBroken: true,
};

/** Wilder's ATR, seeded with the mean of the first `period` true ranges. NaN until then. */
function wilderAtr(series: OHLCBar[], period: number): Float64Array {
  const out = new Float64Array(series.length).fill(NaN);
  let sum = 0;
  let atr = NaN;
  for (let i = 1; i < series.length; i++) {
    const b = series[i], pc = series[i - 1].close;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
    if (i <= period) {
      sum += tr;
      if (i === period) atr = sum / period;
    } else {
      atr = (atr * (period - 1) + tr) / period;
    }
    out[i] = atr;
  }
  return out;
}

function isBoring(b: OHLCBar): boolean {
  const range = b.high - b.low;
  return range === 0 || Math.abs(b.close - b.open) <= range / 2;
}

/**
 * The zone a base + impulse completes at bar `i`, if bar i is an impulse
 * leaving a base of 1..maxBaseBars boring candles.
 */
function baseZoneAt(series: OHLCBar[], atr: Float64Array, i: number, p: ZoneParams): Zone | null {
  const bar = series[i];
  const a = atr[i - 1];
  if (!(a > 0)) return null;
  const range = bar.high - bar.low;
  const body = Math.abs(bar.close - bar.open);
  if (range < p.impulseAtr * a || body <= range / 2) return null;

  // The boring candles right before the impulse. A longer run than allowed
  // is time spent at the level, which Seiden counts against a zone: no zone.
  let baseLen = 0;
  while (baseLen <= p.maxBaseBars && i - 1 - baseLen >= 0 && isBoring(series[i - 1 - baseLen])) baseLen++;
  if (baseLen === 0 || baseLen > p.maxBaseBars) return null;
  const start = i - baseLen;

  let hi = -Infinity, lo = Infinity, bodyHi = -Infinity, bodyLo = Infinity;
  for (let j = start; j < i; j++) {
    const b = series[j];
    hi = Math.max(hi, b.high);
    lo = Math.min(lo, b.low);
    bodyHi = Math.max(bodyHi, b.open, b.close);
    bodyLo = Math.min(bodyLo, b.open, b.close);
  }
  // A zone needs some width to be touched without being broken.
  const minWidth = 0.1 * a;
  if (bar.close > bar.open && bar.close > hi) {
    return { kind: 'demand', proximal: Math.max(bodyHi, lo + minWidth), distal: lo, born: i, touches: 0, inside: false };
  }
  if (bar.close < bar.open && bar.close < lo) {
    return { kind: 'supply', proximal: Math.min(bodyLo, hi - minWidth), distal: hi, born: i, touches: 0, inside: false };
  }
  return null;
}

/**
 * Zones from the swing pivot at bar i - k, which bar i is the first to
 * confirm: its high (low) beats the k bars before it and isn't exceeded by
 * the k after.
 */
function pivotZonesAt(series: OHLCBar[], atr: Float64Array, i: number, k: number): Zone[] {
  const j = i - k;
  if (j - k < 0) return [];
  const a = atr[j];
  if (!(a > 0)) return [];
  const pb = series[j];
  let isHigh = true, isLow = true;
  for (let m = 1; m <= k && (isHigh || isLow); m++) {
    const before = series[j - m], after = series[j + m];
    if (!(pb.high > before.high && pb.high >= after.high)) isHigh = false;
    if (!(pb.low < before.low && pb.low <= after.low)) isLow = false;
  }
  const zones: Zone[] = [];
  const minWidth = 0.1 * a;
  if (isHigh) zones.push({ kind: 'supply', proximal: Math.min(Math.max(pb.open, pb.close), pb.high - minWidth), distal: pb.high, born: i, touches: 0, inside: false });
  if (isLow) zones.push({ kind: 'demand', proximal: Math.max(Math.min(pb.open, pb.close), pb.low + minWidth), distal: pb.low, born: i, touches: 0, inside: false });
  return zones;
}

function computeZones(series: OHLCBar[], p: ZoneParams): ZoneSeries {
  const n = series.length;
  const out: ZoneSeries = {
    events: new Uint8Array(n),
    demandTop: new Float64Array(n).fill(NaN),
    demandBottom: new Float64Array(n).fill(NaN),
    supplyTop: new Float64Array(n).fill(NaN),
    supplyBottom: new Float64Array(n).fill(NaN),
    zoneCount: new Uint16Array(n),
  };
  const atr = wilderAtr(series, p.atrPeriod);
  let demand: Zone[] = [];
  let supply: Zone[] = [];

  for (let i = 1; i < n; i++) {
    const bar = series[i];
    let ev = 0;
    const flippedToDemand: Zone[] = [];
    const flippedToSupply: Zone[] = [];

    // 1. This bar against the zones that existed before it.
    demand = demand.filter((z) => {
      if (p.maxZoneAge > 0 && i - z.born > p.maxZoneAge) return false;
      if (bar.close < z.distal) {
        ev |= EVENT.DEMAND_BROKEN;
        // A broken demand zone flips: its bottom, now over price, is the
        // edge it meets first as supply.
        if (p.flipBroken) flippedToSupply.push({ kind: 'supply', proximal: z.distal, distal: z.proximal, born: i, touches: 0, inside: false });
        return false;
      }
      const entered = bar.low <= z.proximal;
      if (entered) {
        ev |= EVENT.DEMAND_TOUCHED;
        if (!z.inside) z.touches++;
        if (bar.close > z.proximal && z.touches <= p.maxTouches) ev |= EVENT.DEMAND_BOUNCE;
      }
      // Still in the zone at the close: the visit carries on into the next bar.
      z.inside = entered && bar.close <= z.proximal;
      return true;
    });
    supply = supply.filter((z) => {
      if (p.maxZoneAge > 0 && i - z.born > p.maxZoneAge) return false;
      if (bar.close > z.distal) {
        ev |= EVENT.SUPPLY_BROKEN;
        // A broken supply zone flips: its far edge, now under price, is the
        // edge it meets first as demand.
        if (p.flipBroken) flippedToDemand.push({ kind: 'demand', proximal: z.distal, distal: z.proximal, born: i, touches: 0, inside: false });
        return false;
      }
      const entered = bar.high >= z.proximal;
      if (entered) {
        ev |= EVENT.SUPPLY_TOUCHED;
        if (!z.inside) z.touches++;
        if (bar.close < z.proximal && z.touches <= p.maxTouches) ev |= EVENT.SUPPLY_BOUNCE;
      }
      z.inside = entered && bar.close >= z.proximal;
      return true;
    });
    supply.push(...flippedToSupply);
    demand.push(...flippedToDemand);

    // 2. Zones this bar completes. They exist from the next bar on.
    const fresh = p.zoneSource === 'pivot' ? pivotZonesAt(series, atr, i, p.pivotStrength) : [baseZoneAt(series, atr, i, p)];
    for (const z of fresh) {
      if (!z) continue;
      // Only a zone still on the right side of the close can hold price.
      if (z.kind === 'demand' && bar.close > z.distal) demand.push(z);
      if (z.kind === 'supply' && bar.close < z.distal) supply.push(z);
    }
    if (demand.length > MAX_ZONES) demand = demand.slice(-MAX_ZONES);
    if (supply.length > MAX_ZONES) supply = supply.slice(-MAX_ZONES);

    out.events[i] = ev;
    out.zoneCount[i] = Math.min(65535, demand.length + supply.length);
    let best: Zone | null = null;
    for (const z of demand) if (z.distal < bar.close && (!best || z.proximal > best.proximal)) best = z;
    if (best) {
      out.demandTop[i] = best.proximal;
      out.demandBottom[i] = best.distal;
    }
    best = null;
    for (const z of supply) if (z.distal > bar.close && (!best || z.proximal < best.proximal)) best = z;
    if (best) {
      out.supplyTop[i] = best.distal;
      out.supplyBottom[i] = best.proximal;
    }
  }
  return out;
}

// Zone passes are cached per series, and only the last few parameter sets,
// so a parameter sweep over minute data doesn't hold one pass per variation.
const zoneCache = new WeakMap<object, Map<string, ZoneSeries>>();
const CACHE_PER_SERIES = 4;

export function zoneParamsFrom(params: Record<string, number | boolean | string>): ZoneParams {
  const d = DEFAULT_ZONE_PARAMS;
  const num = (key: keyof ZoneParams, fallback: number) => {
    const v = params[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };
  return {
    zoneSource: params.zoneSource === 'pivot' ? 'pivot' : 'base',
    atrPeriod: Math.max(1, Math.round(num('atrPeriod', d.atrPeriod))),
    impulseAtr: num('impulseAtr', d.impulseAtr),
    maxBaseBars: Math.max(1, Math.round(num('maxBaseBars', d.maxBaseBars))),
    pivotStrength: Math.max(1, Math.round(num('pivotStrength', d.pivotStrength))),
    maxTouches: Math.max(1, Math.round(num('maxTouches', d.maxTouches))),
    maxZoneAge: Math.max(0, Math.round(num('maxZoneAge', d.maxZoneAge))),
    flipBroken: typeof params.flipBroken === 'boolean' ? params.flipBroken : d.flipBroken,
  };
}

export function getZoneSeries(series: OHLCBar[], p: ZoneParams): ZoneSeries {
  let bySeries = zoneCache.get(series);
  if (!bySeries) {
    bySeries = new Map();
    zoneCache.set(series, bySeries);
  }
  const key = JSON.stringify(p);
  const cached = bySeries.get(key);
  if (cached) return cached;
  const result = computeZones(series, p);
  if (bySeries.size >= CACHE_PER_SERIES) bySeries.delete(bySeries.keys().next().value as string);
  bySeries.set(key, result);
  return result;
}

const parameters: StrategyParameter[] = [
  {
    key: 'mode',
    name: 'Trade',
    description: 'Bounces off fresh zones, breakouts through them, or both',
    type: 'select',
    default: 'bounce',
    options: ['bounce', 'breakout', 'both'],
  },
  {
    key: 'zoneSource',
    name: 'Zone Source',
    description: 'base: a tight base left by a big impulse candle (Seiden). pivot: swing highs/lows, known only pivotStrength bars later',
    type: 'select',
    default: 'base',
    options: ['base', 'pivot'],
  },
  {
    key: 'impulseAtr',
    name: 'Impulse Size (ATR)',
    description: 'Base zones: the departing candle must span at least this many ATRs, with a body over half its range',
    type: 'number',
    default: 1.5,
    min: 0.5,
    max: 4,
    step: 0.25,
  },
  {
    key: 'maxBaseBars',
    name: 'Max Base Bars',
    description: 'Base zones: most boring candles (body at most half the range) a base can hold; longer is time at the level',
    type: 'number',
    default: 4,
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: 'pivotStrength',
    name: 'Pivot Strength',
    description: 'Pivot zones: bars on each side a swing must beat; the zone appears that many bars after the pivot',
    type: 'number',
    default: 5,
    min: 2,
    max: 20,
    step: 1,
  },
  {
    key: 'maxTouches',
    name: 'Max Touches',
    description: 'Freshness: bounce only on a zone\'s first N retests (1 = untested zones only)',
    type: 'number',
    default: 2,
    min: 1,
    max: 5,
    step: 1,
  },
  {
    key: 'maxZoneAge',
    name: 'Max Zone Age',
    description: 'Drop zones older than this many bars (0 = keep until broken)',
    type: 'number',
    default: 0,
    min: 0,
    max: 1000,
    step: 50,
  },
  {
    key: 'flipBroken',
    name: 'Flip Broken Zones',
    description: 'A zone closed through becomes the opposite kind: broken resistance turns into support',
    type: 'boolean',
    default: true,
  },
  {
    key: 'exitAt',
    name: 'Exit',
    description: 'opposing: exit at the next opposing zone or when a zone behind breaks. break: hold until a zone behind breaks',
    type: 'select',
    default: 'opposing',
    options: ['opposing', 'break'],
  },
  {
    key: 'atrPeriod',
    name: 'ATR Period',
    description: 'ATR length used to size impulses and minimum zone width',
    type: 'number',
    default: 14,
    min: 5,
    max: 50,
    step: 1,
  },
];

const fmt = (v: number) => (Number.isNaN(v) ? '?' : v.toFixed(2));

const handler: StrategyHandler = ({ series, index, params, position }) => {
  const zones = getZoneSeries(series, zoneParamsFrom(params));
  const ev = zones.events[index];
  const mode = (params.mode as string) || 'bounce';
  const exitAt = (params.exitAt as string) || 'opposing';
  const demandZone = `${fmt(zones.demandBottom[index])}-${fmt(zones.demandTop[index])}`;
  const supplyZone = `${fmt(zones.supplyBottom[index])}-${fmt(zones.supplyTop[index])}`;

  if (position === 'long') {
    if (ev & EVENT.DEMAND_BROKEN) return { action: 'sell', reason: 'Closed through a demand zone' };
    if (exitAt === 'opposing' && ev & EVENT.SUPPLY_TOUCHED) return { action: 'sell', reason: 'Reached a supply zone' };
    return { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    if (ev & EVENT.SUPPLY_BROKEN) return { action: 'buy', reason: 'Closed through a supply zone' };
    if (exitAt === 'opposing' && ev & EVENT.DEMAND_TOUCHED) return { action: 'buy', reason: 'Reached a demand zone' };
    return { action: 'hold', reason: '' };
  }

  const bounce = mode === 'bounce' || mode === 'both';
  const breakout = mode === 'breakout' || mode === 'both';
  const goLong = (bounce && ev & EVENT.DEMAND_BOUNCE) || (breakout && ev & EVENT.SUPPLY_BROKEN);
  const goShort = (bounce && ev & EVENT.SUPPLY_BOUNCE) || (breakout && ev & EVENT.DEMAND_BROKEN);
  if (goLong && !goShort) {
    return { action: 'buy', reason: ev & EVENT.DEMAND_BOUNCE && bounce ? `Bounced off demand ${demandZone}` : `Broke out above supply, now demand ${demandZone}` };
  }
  if (goShort && !goLong) {
    return { action: 'sell', reason: ev & EVENT.SUPPLY_BOUNCE && bounce ? `Rejected at supply ${supplyZone}` : `Broke down through demand, now supply ${supplyZone}` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'supply-demand',
  name: 'Supply & Demand Zones',
  description: 'Support/resistance zones from bases left by impulse moves (or swing pivots). Buy bounces off fresh demand or breakouts through supply; exit at the opposing zone or when a zone breaks. Shorts mirror it.',
  handler,
  parameters,
};

export default strategy;
