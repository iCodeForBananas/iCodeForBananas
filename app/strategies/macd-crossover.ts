// MACD (Gerald Appel, late 1970s; "Technical Analysis: Power Tools for
// Active Investors", 2005)
// MACD is the 12-bar EMA of the close minus the 26-bar EMA; its signal line is
// a 9-bar EMA of MACD. Two published rules:
//   - signal: buy when MACD crosses above its signal line, exit when it
//     crosses back below (Appel's 12/26/9).
//   - zero: buy when MACD crosses above zero, i.e. the 12 EMA crosses the 26
//     EMA, exit when it crosses back. Chong & Ng ("Technical analysis and the
//     London stock exchange: testing the MACD and RSI rules using the FT30",
//     Applied Economics Letters, 2008) found both MACD(12,26,0) and (12,26,9)
//     beat buy and hold on 60 years of FT30 data; Chong, Ng & Liew (2014)
//     found the edge didn't hold in every market or subperiod.
// The trend filter is the usual practitioner addition: take longs only above
// the 200-bar SMA and shorts only below it. It's off by default: on this
// app's daily and hourly datasets it cut long-only returns for both rules,
// mostly by skipping the crosses that come off a bottom while price is still
// under its 200 SMA.
//
// The default is Appel's published signal-line rule. Defaults come from the
// literature, not from these datasets: picking whichever rule did best here
// would tune the default to the very data it's then judged on. (The zero-line
// rule did better on the daily datasets, the signal-line rule on hourly.)
//
// Entries need a fresh cross on the signal bar. Exits only need the MACD to
// be on the wrong side of its line, so an exit never waits for a cross that
// was missed or filtered out.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'fastPeriod',
    name: 'Fast EMA Period',
    description: 'Fast EMA length (Appel: 12). Must be shorter than the slow period',
    type: 'number',
    default: 12,
    min: 2,
    max: 50,
    step: 1,
  },
  {
    key: 'slowPeriod',
    name: 'Slow EMA Period',
    description: 'Slow EMA length (Appel: 26)',
    type: 'number',
    default: 26,
    min: 5,
    max: 100,
    step: 1,
  },
  {
    key: 'signalPeriod',
    name: 'Signal Period',
    description: 'Signal line EMA of MACD (Appel: 9). Unused by the zero-line rule',
    type: 'number',
    default: 9,
    min: 2,
    max: 50,
    step: 1,
  },
  {
    key: 'rule',
    name: 'Crossover',
    description: 'signal: MACD crosses its signal line. zero: MACD crosses zero (the fast EMA crosses the slow one)',
    type: 'select',
    default: 'signal',
    options: ['signal', 'zero'],
  },
  {
    key: 'trendFilter',
    name: 'Trend Filter (200 SMA)',
    description: 'Only buy above the 200 SMA, and only short below it',
    type: 'boolean',
    default: false,
  },
  {
    key: 'minHistogramPct',
    name: 'Min Cross Strength (%)',
    description: 'Entries only: the bar after the cross must have MACD past its line by this percent of price. Exits ignore it',
    type: 'number',
    default: 0,
    min: 0,
    max: 0.5,
    step: 0.05,
  },
];

const handler: StrategyHandler = ({ current, previous, params, position }) => {
  const fastPeriod = (params.fastPeriod as number) || 12;
  const slowPeriod = (params.slowPeriod as number) || 26;
  const signalPeriod = (params.signalPeriod as number) || 9;
  const rule = (params.rule as string) === 'zero' ? 'zero' : 'signal';
  const trendFilter = (params.trendFilter as boolean) ?? false;
  const minPct = (params.minHistogramPct as number) || 0;

  if (fastPeriod >= slowPeriod) return { action: 'hold', reason: 'Fast period must be shorter than slow' };

  const key = `${fastPeriod}_${slowPeriod}_${signalPeriod}`;
  const macd = current[`macd_${key}` as keyof typeof current] as number | undefined;
  const signal = current[`macdSignal_${key}` as keyof typeof current] as number | undefined;
  const prevMacd = previous?.[`macd_${key}` as keyof typeof current] as number | undefined;
  const prevSignal = previous?.[`macdSignal_${key}` as keyof typeof current] as number | undefined;
  if (macd === undefined || signal === undefined || prevMacd === undefined || prevSignal === undefined) {
    return { action: 'hold', reason: 'Waiting for MACD' };
  }

  // Distance of MACD past the line this rule crosses, now and a bar ago.
  const diff = rule === 'zero' ? macd : macd - signal;
  const prevDiff = rule === 'zero' ? prevMacd : prevMacd - prevSignal;
  const lineName = rule === 'zero' ? 'zero' : 'signal';
  const label = `MACD(${fastPeriod},${slowPeriod}${rule === 'signal' ? `,${signalPeriod}` : ''})`;

  if (position === 'long') {
    return diff < 0 ? { action: 'sell', reason: `${label} below ${lineName}` } : { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    return diff > 0 ? { action: 'buy', reason: `${label} above ${lineName}` } : { action: 'hold', reason: '' };
  }

  const strength = (Math.abs(diff) / current.close) * 100;
  if (strength < minPct) return { action: 'hold', reason: '' };
  const sma = current.sma200;
  if (prevDiff <= 0 && diff > 0 && (!trendFilter || (sma != null && current.close > sma))) {
    return { action: 'buy', reason: `${label} crossed above ${lineName}` };
  }
  if (prevDiff >= 0 && diff < 0 && (!trendFilter || (sma != null && current.close < sma))) {
    return { action: 'sell', reason: `${label} crossed below ${lineName}` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'macd-crossover',
  name: 'MACD Crossover',
  description:
    "Appel's MACD: buy when MACD crosses above its signal line (or zero), exit when it falls back below. Optional 200 SMA trend filter. Shorts mirror it.",
  handler,
  parameters,
};

export default strategy;
