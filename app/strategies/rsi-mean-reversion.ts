// RSI Mean Reversion Strategy
// Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought)

import { StrategyDefinition, StrategyHandler } from './types';

const handler: StrategyHandler = ({ current }) => {
  if (!current.rsi) {
    return { action: 'hold', reason: 'Waiting for RSI' };
  }

  // RSI below 30 - oversold, BUY signal
  if (current.rsi < 30) {
    return { action: 'buy', reason: `RSI oversold (${current.rsi.toFixed(1)})` };
  }

  // RSI above 70 - overbought, SELL signal
  if (current.rsi > 70) {
    return { action: 'sell', reason: `RSI overbought (${current.rsi.toFixed(1)})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'rsi-mean-reversion',
  name: 'RSI Mean Reversion',
  description: 'Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought)',
  handler,
};

export default strategy;
