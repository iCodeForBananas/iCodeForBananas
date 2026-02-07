// EMA Price Cross Strategy
// Enter (buy) when candle closes above the EMA
// Exit (sell) when candle closes below the EMA
// Uses closed candles and a single configurable EMA period

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'emaPeriod',
    name: 'EMA Period',
    description: 'Period for the EMA (default: 21)',
    type: 'number',
    default: 21,
    min: 2,
    max: 200,
    step: 1,
  },
];

const handler: StrategyHandler = ({ current, previous, params }) => {
  const emaPeriod = (params.emaPeriod as number) || 21;
  
  const emaKey = `ema${emaPeriod}` as keyof typeof current;
  
  const currentEma = current[emaKey] as number | undefined;
  const previousEma = previous?.[emaKey] as number | undefined;
  
  if (!currentEma || !previousEma || !previous) {
    return { action: 'hold', reason: 'Waiting for indicators' };
  }

  // Buy signal: current close is above EMA and previous close was at or below EMA
  if (current.close > currentEma && previous.close <= previousEma) {
    return { action: 'buy', reason: `Candle closed above EMA ${emaPeriod}` };
  }

  // Sell signal: current close is below EMA and previous close was at or above EMA
  if (current.close < currentEma && previous.close >= previousEma) {
    return { action: 'sell', reason: `Candle closed below EMA ${emaPeriod}` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'ema-price-cross',
  name: 'EMA Price Cross',
  description: 'Enter when candle closes above EMA, exit when it closes below',
  handler,
  parameters,
};

export default strategy;
