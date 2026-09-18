import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

// Smoothed Moving Average (SMMA / RMA) — first value is SMA, subsequent values are smoothed
function calculateSMMA(closes: number[], period: number): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  result[period - 1] = sum / period;

  for (let i = period; i < closes.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + closes[i]) / period;
  }

  return result;
}

// Cache SMMA results per (series reference × params) so we only compute once per backtest run
// The backtest engine now passes the full data array as `series`, so the reference is stable.
const smmaCache = new WeakMap<object, Map<string, { jaw: number[]; teeth: number[]; lips: number[] }>>();

const parameters: StrategyParameter[] = [
  {
    key: 'jawPeriod',
    name: 'Jaw Period',
    description: 'SMMA period for the Jaw — the slowest line (default: 13)',
    type: 'number',
    default: 13,
    min: 5,
    max: 50,
    step: 1,
  },
  {
    key: 'jawShift',
    name: 'Jaw Shift',
    description: 'Bars the Jaw is offset into the future (default: 8)',
    type: 'number',
    default: 8,
    min: 1,
    max: 20,
    step: 1,
  },
  {
    key: 'teethPeriod',
    name: 'Teeth Period',
    description: 'SMMA period for the Teeth — the middle line (default: 8)',
    type: 'number',
    default: 8,
    min: 3,
    max: 30,
    step: 1,
  },
  {
    key: 'teethShift',
    name: 'Teeth Shift',
    description: 'Bars the Teeth is offset into the future (default: 5)',
    type: 'number',
    default: 5,
    min: 1,
    max: 15,
    step: 1,
  },
  {
    key: 'lipsPeriod',
    name: 'Lips Period',
    description: 'SMMA period for the Lips — the fastest line (default: 5)',
    type: 'number',
    default: 5,
    min: 2,
    max: 20,
    step: 1,
  },
  {
    key: 'lipsShift',
    name: 'Lips Shift',
    description: 'Bars the Lips is offset into the future (default: 3)',
    type: 'number',
    default: 3,
    min: 1,
    max: 10,
    step: 1,
  },
];

const handler: StrategyHandler = ({ index, series, params }) => {
  const jawPeriod = (params.jawPeriod as number) || 13;
  const jawShift = (params.jawShift as number) || 8;
  const teethPeriod = (params.teethPeriod as number) || 8;
  const teethShift = (params.teethShift as number) || 5;
  const lipsPeriod = (params.lipsPeriod as number) || 5;
  const lipsShift = (params.lipsShift as number) || 3;

  const minBars = Math.max(jawPeriod + jawShift, teethPeriod + teethShift, lipsPeriod + lipsShift) + 1;

  if (index < minBars) {
    return { action: 'hold', reason: 'Waiting for Alligator indicators' };
  }

  // Compute SMMA once per (series, params) combination — cached by series reference
  const paramKey = `${jawPeriod}_${teethPeriod}_${lipsPeriod}`;
  let seriesCache = smmaCache.get(series as unknown as object);
  if (!seriesCache) {
    seriesCache = new Map();
    smmaCache.set(series as unknown as object, seriesCache);
  }
  let smma = seriesCache.get(paramKey);
  if (!smma) {
    const closes = series.map((bar) => bar.close);
    smma = {
      jaw: calculateSMMA(closes, jawPeriod),
      teeth: calculateSMMA(closes, teethPeriod),
      lips: calculateSMMA(closes, lipsPeriod),
    };
    seriesCache.set(paramKey, smma);
  }

  const { jaw: jawSmma, teeth: teethSmma, lips: lipsSmma } = smma;

  // In backtesting the forward shift is simulated by reading 'shift' bars in the past
  const jaw = jawSmma[index - jawShift];
  const teeth = teethSmma[index - teethShift];
  const lips = lipsSmma[index - lipsShift];

  const prevJaw = jawSmma[index - jawShift - 1];
  const prevTeeth = teethSmma[index - teethShift - 1];
  const prevLips = lipsSmma[index - lipsShift - 1];

  if (
    isNaN(jaw) || isNaN(teeth) || isNaN(lips) ||
    isNaN(prevJaw) || isNaN(prevTeeth) || isNaN(prevLips)
  ) {
    return { action: 'hold', reason: 'Waiting for Alligator indicators' };
  }

  // Bullish: Lips crosses above Teeth while Teeth is already above Jaw (mouth opens upward)
  if (prevLips <= prevTeeth && lips > teeth && teeth > jaw) {
    return {
      action: 'buy',
      reason: `Alligator mouth opens up — Lips(${lips.toFixed(2)}) > Teeth(${teeth.toFixed(2)}) > Jaw(${jaw.toFixed(2)})`,
    };
  }

  // Bearish: Lips crosses below Teeth while Teeth is already below Jaw (mouth opens downward)
  if (prevLips >= prevTeeth && lips < teeth && teeth < jaw) {
    return {
      action: 'sell',
      reason: `Alligator mouth opens down — Lips(${lips.toFixed(2)}) < Teeth(${teeth.toFixed(2)}) < Jaw(${jaw.toFixed(2)})`,
    };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'alligator',
  name: 'Alligator',
  description:
    "Bill Williams' Alligator: three SMAs (Jaw 13/8, Teeth 8/5, Lips 5/3) with time offsets. Buys when the mouth opens upward (Lips > Teeth > Jaw crossover), sells when it opens downward.",
  handler,
  parameters,
};

export default strategy;
