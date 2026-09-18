// Supertrend Strategy
// ATR-based trend following indicator. One of the most widely used trend-following tools.
// Buy when price closes above the Supertrend line; sell when it closes below.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'atrPeriod',
    name: 'ATR Period',
    description: 'Period for ATR calculation (default: 10)',
    type: 'number',
    default: 10,
    min: 5,
    max: 30,
    step: 1,
  },
  {
    key: 'multiplier',
    name: 'ATR Multiplier',
    description: 'Multiplier applied to ATR for band width (default: 3.0)',
    type: 'number',
    default: 3.0,
    min: 1.0,
    max: 6.0,
    step: 0.5,
  },
];

// Supertrend requires stateful computation — replay from bar 0 each call using the full series.
const handler: StrategyHandler = ({ series, index, params }) => {
  const atrPeriod = (params.atrPeriod as number) ?? 10;
  const multiplier = (params.multiplier as number) ?? 3.0;

  if (index < atrPeriod + 2) return { action: 'hold', reason: 'Warming up' };

  // Wilder's ATR + proper ratcheted Supertrend bands, replayed from bar 1 to index.
  let trSum = 0, trCount = 0;
  let atr: number | undefined;
  let finalUp = 0, finalDn = 0;
  let dir = 1;           // 1 = uptrend, -1 = downtrend
  let prevDir = 1;
  let started = false;

  for (let i = 1; i <= index; i++) {
    const d = series[i];
    const p = series[i - 1];
    const tr = Math.max(d.high - d.low, Math.abs(d.high - p.close), Math.abs(d.low - p.close));

    if (trCount < atrPeriod) {
      trSum += tr;
      trCount++;
      if (trCount === atrPeriod) atr = trSum / atrPeriod;
    } else {
      atr = (atr! * (atrPeriod - 1) + tr) / atrPeriod;
    }

    if (atr === undefined) continue;

    const hl2 = (d.high + d.low) / 2;
    const rawUp = hl2 + multiplier * atr;
    const rawDn = hl2 - multiplier * atr;

    let newUp: number, newDn: number, newDir: number;
    if (!started) {
      newUp = rawUp;
      newDn = rawDn;
      newDir = d.close > rawUp ? 1 : -1;
      started = true;
    } else {
      newUp = (rawUp < finalUp || p.close > finalUp) ? rawUp : finalUp;
      newDn = (rawDn > finalDn || p.close < finalDn) ? rawDn : finalDn;
      newDir = dir === -1 ? (d.close > newUp ? 1 : -1) : (d.close < newDn ? -1 : 1);
    }

    prevDir = dir;
    dir = newDir;
    finalUp = newUp;
    finalDn = newDn;
  }

  if (!started) return { action: 'hold', reason: 'Warming up' };

  const st = dir === 1 ? finalDn : finalUp;

  if (prevDir === -1 && dir === 1) {
    return { action: 'buy', reason: `Supertrend flipped bullish (stop ${finalDn.toFixed(2)})` };
  }
  if (prevDir === 1 && dir === -1) {
    return { action: 'sell', reason: `Supertrend flipped bearish (stop ${finalUp.toFixed(2)})` };
  }

  return { action: 'hold', reason: `Supertrend ${dir === 1 ? 'bullish' : 'bearish'} (${st.toFixed(2)})` };
};

const strategy: StrategyDefinition = {
  id: 'supertrend',
  name: 'Supertrend',
  description: 'ATR-based trend following. Buy when price breaks above the Supertrend band, sell when it breaks below.',
  handler,
  parameters,
};

export default strategy;
