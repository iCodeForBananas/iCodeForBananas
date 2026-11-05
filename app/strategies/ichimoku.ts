// Ichimoku Cloud (Goichi Hosoda, "Ichimoku Kinko Hyo", 1969)
// Three midpoints of the recent range:
//   - Tenkan-sen, the 9-bar midpoint (conversion line),
//   - Kijun-sen, the 26-bar midpoint (base line),
//   - the cloud: Senkou A, the average of the two, and Senkou B, the 52-bar
//     midpoint, both plotted 26 bars ahead.
// The textbook trend entry (Elliott, "Ichimoku Charts", 2007; Patel, "Trading
// with Ichimoku Clouds", 2010): buy when the close is above the cloud, the
// Tenkan is above the Kijun and the close is above the close 26 bars ago (the
// Chikou span). Exit when the close falls back under the Kijun, or under the
// cloud for a looser exit. Shorts mirror it.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';

// Midpoint of the high/low over the `period` bars ending at each bar, cached
// per (series, period). O(n) with monotonic deques, so 52-bar windows stay
// cheap on minute data.
const midCache = new WeakMap<OHLCBar[], Map<number, number[]>>();

export function midpointArray(series: OHLCBar[], period: number): number[] {
  let byPeriod = midCache.get(series);
  if (!byPeriod) {
    byPeriod = new Map();
    midCache.set(series, byPeriod);
  }
  const cached = byPeriod.get(period);
  if (cached) return cached;

  const result: number[] = new Array(series.length).fill(NaN);
  const highs: number[] = [];
  const lows: number[] = [];
  let hHead = 0, lHead = 0;
  for (let i = 0; i < series.length; i++) {
    while (highs.length > hHead && series[highs[highs.length - 1]].high <= series[i].high) highs.pop();
    highs.push(i);
    while (lows.length > lHead && series[lows[lows.length - 1]].low >= series[i].low) lows.pop();
    lows.push(i);
    if (highs[hHead] <= i - period) hHead++;
    if (lows[lHead] <= i - period) lHead++;
    if (i >= period - 1) result[i] = (series[highs[hHead]].high + series[lows[lHead]].low) / 2;
  }

  byPeriod.set(period, result);
  return result;
}

export interface IchimokuLines {
  tenkan: number;
  kijun: number;
  /** The cloud at this bar: computed `displacement` bars back, as plotted. */
  senkouA: number;
  senkouB: number;
}

export function ichimokuAt(series: OHLCBar[], index: number, tenkanPeriod: number, kijunPeriod: number, senkouPeriod: number): IchimokuLines {
  const tenkan = midpointArray(series, tenkanPeriod);
  const kijun = midpointArray(series, kijunPeriod);
  const senkou = midpointArray(series, senkouPeriod);
  const back = index - kijunPeriod;
  return {
    tenkan: tenkan[index],
    kijun: kijun[index],
    senkouA: back >= 0 ? (tenkan[back] + kijun[back]) / 2 : NaN,
    senkouB: back >= 0 ? senkou[back] : NaN,
  };
}

const parameters: StrategyParameter[] = [
  {
    key: 'tenkanPeriod',
    name: 'Tenkan Period',
    description: 'Conversion line midpoint length (Hosoda: 9)',
    type: 'number',
    default: 9,
    min: 5,
    max: 20,
    step: 1,
  },
  {
    key: 'kijunPeriod',
    name: 'Kijun Period',
    description: 'Base line midpoint length, also the cloud and Chikou displacement (Hosoda: 26)',
    type: 'number',
    default: 26,
    min: 15,
    max: 60,
    step: 1,
  },
  {
    key: 'senkouPeriod',
    name: 'Senkou B Period',
    description: 'Slow cloud edge midpoint length (Hosoda: 52)',
    type: 'number',
    default: 52,
    min: 30,
    max: 120,
    step: 2,
  },
  {
    key: 'chikouFilter',
    name: 'Chikou Confirmation',
    description: 'Also require the close to be beyond the close one Kijun period ago',
    type: 'boolean',
    default: true,
  },
  {
    key: 'exitLine',
    name: 'Exit Line',
    description: 'Close a trade when the close crosses back through the Kijun (tighter) or the far side of the cloud (looser)',
    type: 'select',
    default: 'kijun',
    options: ['kijun', 'cloud'],
  },
];

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const tenkanPeriod = (params.tenkanPeriod as number) || 9;
  const kijunPeriod = (params.kijunPeriod as number) || 26;
  const senkouPeriod = (params.senkouPeriod as number) || 52;
  const chikouFilter = (params.chikouFilter as boolean) ?? true;
  const exitLine = (params.exitLine as string) || 'kijun';

  const { tenkan, kijun, senkouA, senkouB } = ichimokuAt(series, index, tenkanPeriod, kijunPeriod, senkouPeriod);
  if ([tenkan, kijun, senkouA, senkouB].some(Number.isNaN)) return { action: 'hold', reason: 'Warming up' };

  const close = current.close;
  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);

  if (position === 'long') {
    const exitLevel = exitLine === 'cloud' ? cloudBottom : kijun;
    if (close < exitLevel) return { action: 'sell', reason: `Close ${close.toFixed(2)} below ${exitLine === 'cloud' ? 'cloud' : 'Kijun'} ${exitLevel.toFixed(2)}` };
    return { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    const exitLevel = exitLine === 'cloud' ? cloudTop : kijun;
    if (close > exitLevel) return { action: 'buy', reason: `Close ${close.toFixed(2)} above ${exitLine === 'cloud' ? 'cloud' : 'Kijun'} ${exitLevel.toFixed(2)}` };
    return { action: 'hold', reason: '' };
  }

  const chikouRef = index - kijunPeriod >= 0 ? series[index - kijunPeriod].close : NaN;
  if (close > cloudTop && tenkan > kijun && (!chikouFilter || close > chikouRef)) {
    return { action: 'buy', reason: `Above cloud ${cloudTop.toFixed(2)}, Tenkan over Kijun` };
  }
  if (close < cloudBottom && tenkan < kijun && (!chikouFilter || close < chikouRef)) {
    return { action: 'sell', reason: `Below cloud ${cloudBottom.toFixed(2)}, Tenkan under Kijun` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'ichimoku',
  name: 'Ichimoku Cloud',
  description: 'Buy above the cloud with the Tenkan over the Kijun and Chikou confirming; exit back under the Kijun. Shorts mirror it.',
  handler,
  parameters,
};

export default strategy;
