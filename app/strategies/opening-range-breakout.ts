// Opening Range Breakout (Toby Crabel, "Day Trading with Short Term Price
// Patterns and Opening Range Breakout", 1990; Zarattini, Barbon & Aziz, "A
// Profitable Day Trading Strategy for the U.S. Equity Market", 2024)
// The first stretch of the session sets a range. A close above its high
// buys, a close below its low shorts, at most one trade a session, and every
// trade is flat by the close. The other side of the range is the stop.
// Zarattini et al. found the edge on liquid stocks with the 5-minute range;
// on hourly bars the first bar (9:30 to 10:30) is the range.
// Intraday bars only: on daily bars it never trades.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';
import { sessionInfo, isIntraday, isFlattenBar } from './session';
import { openingRelativeVolume } from './volume';

const parameters: StrategyParameter[] = [
  {
    key: 'rangeBars',
    name: 'Opening Range (bars)',
    description: 'Bars at the start of the session that set the range (hourly: 1 = first hour)',
    type: 'number',
    default: 1,
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: 'lastEntryBar',
    name: 'Last Entry Bar',
    description: 'No new breakouts after this bar of the session (hourly: 3 = the 12:30 bar)',
    type: 'number',
    default: 3,
    min: 1,
    max: 78,
    step: 1,
  },
  {
    key: 'rangeStop',
    name: 'Stop at Other Side',
    description: 'Exit a long on a close below the range low, a short on a close above its high',
    type: 'boolean',
    default: true,
  },
  {
    key: 'minOpeningRvol',
    name: 'Min Opening Rel. Volume',
    description: 'Only trade when the first bar volume is this multiple of its 14-day average (0 = off; Zarattini et al. used stocks in play)',
    type: 'number',
    default: 0,
    min: 0,
    max: 5,
    step: 0.5,
  },
];

export interface OpeningRange {
  high: number;
  low: number;
}

/** The range of the session's first `bars` bars, once they have all closed by `index`. */
export function openingRange(series: { high: number; low: number }[], start: number, index: number, bars: number): OpeningRange | null {
  if (start < 0 || index < start + bars - 1) return null;
  let high = -Infinity;
  let low = Infinity;
  for (let i = start; i < start + bars; i++) {
    if (series[i].high > high) high = series[i].high;
    if (series[i].low < low) low = series[i].low;
  }
  return { high, low };
}

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const rangeBars = (params.rangeBars as number) ?? 1;
  const lastEntryBar = (params.lastEntryBar as number) ?? 3;
  const rangeStop = (params.rangeStop as boolean) ?? true;
  const minRvol = (params.minOpeningRvol as number) ?? 0;

  const info = sessionInfo(series);
  if (!isIntraday(info, index)) return { action: 'hold', reason: 'Needs intraday bars' };
  const bar = info.sessionBar[index];
  const start = info.sessionStart[index];

  if (position) {
    // A position still open at a session's first bar was held overnight (an early close).
    if (bar <= 0) return { action: position === 'long' ? 'sell' : 'buy', reason: 'Held past the close' };
    if (isFlattenBar(info, index)) return { action: position === 'long' ? 'sell' : 'buy', reason: 'Flat by the close' };
    const range = openingRange(series, start, index, rangeBars);
    if (rangeStop && range) {
      if (position === 'long' && current.close < range.low) return { action: 'sell', reason: `Closed below range low ${range.low.toFixed(2)}` };
      if (position === 'short' && current.close > range.high) return { action: 'buy', reason: `Closed above range high ${range.high.toFixed(2)}` };
    }
    return { action: 'hold', reason: '' };
  }

  if (bar < rangeBars || bar > lastEntryBar || isFlattenBar(info, index)) return { action: 'hold', reason: '' };
  const range = openingRange(series, start, index, rangeBars);
  if (!range) return { action: 'hold', reason: '' };
  if (minRvol > 0) {
    const rvol = openingRelativeVolume(series, index, 14);
    if (!(rvol >= minRvol)) return { action: 'hold', reason: '' };
  }

  // One trade a session: skip if an earlier bar this session already broke out.
  for (let i = start + rangeBars; i < index; i++) {
    if (series[i].close > range.high || series[i].close < range.low) return { action: 'hold', reason: '' };
  }
  if (current.close > range.high) return { action: 'buy', reason: `Broke opening range high ${range.high.toFixed(2)}` };
  if (current.close < range.low) return { action: 'sell', reason: `Broke opening range low ${range.low.toFixed(2)}` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'opening-range-breakout',
  name: 'Opening Range Breakout',
  description: 'Intraday: buy a close above the opening range high, short a close below its low, one trade a session, flat by the close. On hourly bars the range is the first hour.',
  handler,
  parameters,
};

export default strategy;
