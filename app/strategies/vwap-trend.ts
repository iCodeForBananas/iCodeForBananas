// VWAP Trend (Zarattini & Aziz, "Volume Weighted Average Price (VWAP): The
// Holy Grail for Day Trading Systems", 2023)
// The session VWAP is the average price everyone who traded today paid. Above
// it, today's buyers are in profit and the path of least resistance is up;
// below it, down. Long while price closes above VWAP, short below, switch on
// each cross, and be flat by the close. Zarattini & Aziz ran it on 1-minute
// QQQ and TQQQ; on hourly bars there are far fewer crosses, so fewer trades
// and lower costs. Needs intraday bars with volume.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';
import { sessionInfo, isIntraday, isFlattenBar } from './session';
import { sessionVwap } from './volume';

const parameters: StrategyParameter[] = [
  {
    key: 'bandPercent',
    name: 'Band (%)',
    description: 'Cross only counts once the close is this far past VWAP, to cut chop',
    type: 'number',
    default: 0,
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'skipBars',
    name: 'Skip Opening Bars',
    description: 'Session bars to wait before the first entry, while VWAP settles',
    type: 'number',
    default: 1,
    min: 0,
    max: 12,
    step: 1,
  },
];

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const band = ((params.bandPercent as number) ?? 0) / 100;
  const skipBars = (params.skipBars as number) ?? 1;

  const info = sessionInfo(series);
  if (!isIntraday(info, index)) return { action: 'hold', reason: 'Needs intraday bars' };
  const bar = info.sessionBar[index];
  const flatten = position && (bar <= 0 || isFlattenBar(info, index));
  if (flatten) return { action: position === 'long' ? 'sell' : 'buy', reason: 'Flat by the close' };
  if (bar < 0 || isFlattenBar(info, index)) return { action: 'hold', reason: '' };

  const vwap = sessionVwap(series)[index];
  if (Number.isNaN(vwap)) return { action: 'hold', reason: 'Needs volume' };
  const above = current.close > vwap * (1 + band);
  const below = current.close < vwap * (1 - band);
  const label = `close ${current.close.toFixed(2)}, VWAP ${vwap.toFixed(2)}`;

  if (position === 'long') return below ? { action: 'sell', reason: `Below VWAP: ${label}` } : { action: 'hold', reason: '' };
  if (position === 'short') return above ? { action: 'buy', reason: `Above VWAP: ${label}` } : { action: 'hold', reason: '' };
  if (bar < skipBars) return { action: 'hold', reason: '' };
  if (above) return { action: 'buy', reason: `Above VWAP: ${label}` };
  if (below) return { action: 'sell', reason: `Below VWAP: ${label}` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'vwap-trend',
  name: 'VWAP Trend',
  description: 'Intraday, needs volume: long while the close is above the session VWAP, short below it, flat by the close. Turn on reversal to flip on each cross.',
  handler,
  parameters,
};

export default strategy;
