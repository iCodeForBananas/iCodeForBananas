// RSI Mean Reversion Strategy
// Buy when RSI < oversold threshold, sell when RSI > overbought threshold

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'oversold',
    name: 'Oversold Level',
    description: 'RSI level below which to buy (default: 30)',
    type: 'number',
    default: 30,
    min: 10,
    max: 50,
    step: 5,
  },
  {
    key: 'overbought',
    name: 'Overbought Level',
    description: 'RSI level above which to sell (default: 70)',
    type: 'number',
    default: 70,
    min: 50,
    max: 90,
    step: 5,
  },
];

const handler: StrategyHandler = ({ current, params }) => {
  const oversold = (params.oversold as number) || 30;
  const overbought = (params.overbought as number) || 70;

  if (!current.rsi) {
    return { action: 'hold', reason: 'Waiting for RSI' };
  }

  // RSI below oversold - BUY signal
  if (current.rsi < oversold) {
    return { action: 'buy', reason: `RSI oversold (${current.rsi.toFixed(1)} < ${oversold})` };
  }

  // RSI above overbought - SELL signal
  if (current.rsi > overbought) {
    return { action: 'sell', reason: `RSI overbought (${current.rsi.toFixed(1)} > ${overbought})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'rsi-mean-reversion',
  name: 'RSI Mean Reversion',
  description: 'Buy when RSI is oversold, sell when RSI is overbought',
  handler,
  parameters,
};

export default strategy;
