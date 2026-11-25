// Money Flow Index (Gene Quong & Avrum Soudack, 1989; a TradingView built-in)
// A volume-weighted RSI: typical price times volume, split into up and down
// flow over 14 bars. Below 20, selling has been heavy on real volume; above
// 80, buying has. Used here as mean reversion: buy when MFI turns back up
// through the oversold line, sell when it reaches the exit level. Shorts
// mirror it. Needs bars with volume.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';
import { memo } from './ta';
import { hasVolume, typicalPrice } from './volume';

const parameters: StrategyParameter[] = [
  { key: 'period', name: 'MFI Period', description: 'Bars of money flow (standard: 14)', type: 'number', default: 14, min: 5, max: 30, step: 1 },
  { key: 'oversold', name: 'Oversold', description: 'Buy when MFI crosses back above this (standard: 20)', type: 'number', default: 20, min: 5, max: 40, step: 5 },
  { key: 'exitLevel', name: 'Exit Level', description: 'Sell a long when MFI rises above this', type: 'number', default: 70, min: 50, max: 95, step: 5 },
  { key: 'trendFilter', name: 'Trend Filter (200 SMA)', description: 'Only buy above the 200 SMA, and only short below it', type: 'boolean', default: true },
];

export function getMfi(series: OHLCBar[], period: number): number[] {
  return memo(series, `mfi${period}`, () => {
    const n = series.length;
    const out = new Array(n).fill(NaN);
    const pos = new Array(n).fill(NaN);
    const neg = new Array(n).fill(NaN);
    for (let i = 1; i < n; i++) {
      if (!hasVolume(series[i]) || !hasVolume(series[i - 1])) continue;
      const tp = typicalPrice(series[i]);
      const prev = typicalPrice(series[i - 1]);
      const flow = tp * series[i].volume!;
      pos[i] = tp > prev ? flow : 0;
      neg[i] = tp < prev ? flow : 0;
    }
    for (let i = period; i < n; i++) {
      let p = 0;
      let m = 0;
      let ok = true;
      for (let k = i - period + 1; k <= i; k++) {
        if (Number.isNaN(pos[k])) {
          ok = false;
          break;
        }
        p += pos[k];
        m += neg[k];
      }
      if (ok) out[i] = p + m === 0 ? 50 : m === 0 ? 100 : 100 - 100 / (1 + p / m);
    }
    return out;
  });
}

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const period = (params.period as number) ?? 14;
  const oversold = (params.oversold as number) ?? 20;
  const exitLevel = (params.exitLevel as number) ?? 70;
  const trendFilter = (params.trendFilter as boolean) ?? true;
  if (index < 1) return { action: 'hold', reason: 'Warming up' };
  const mfi = getMfi(series, period);
  const now = mfi[index];
  const before = mfi[index - 1];
  if (Number.isNaN(now) || Number.isNaN(before)) return { action: 'hold', reason: 'Needs volume' };

  if (position === 'long') return now > exitLevel ? { action: 'sell', reason: `MFI ${now.toFixed(1)} > ${exitLevel}` } : { action: 'hold', reason: '' };
  if (position === 'short') return now < 100 - exitLevel ? { action: 'buy', reason: `MFI ${now.toFixed(1)} < ${100 - exitLevel}` } : { action: 'hold', reason: '' };

  const sma = current.sma200;
  const up = !trendFilter || (sma != null && current.close > sma);
  const down = !trendFilter || (sma != null && current.close < sma);
  if (up && before <= oversold && now > oversold) return { action: 'buy', reason: `MFI turned up through ${oversold} (${now.toFixed(1)})` };
  if (down && before >= 100 - oversold && now < 100 - oversold) return { action: 'sell', reason: `MFI turned down through ${100 - oversold} (${now.toFixed(1)})` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'money-flow-index',
  name: 'Money Flow Index',
  description: 'Volume-weighted RSI mean reversion: buy when MFI turns back up through 20 above the 200 SMA, sell above 70. Shorts mirror it. Needs volume.',
  handler,
  parameters,
};

export default strategy;
