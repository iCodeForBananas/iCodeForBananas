// SMA Crossover Strategy (Golden Cross / Death Cross)
// Buy when SMA 50 crosses above SMA 200, sell when it crosses below

import { StrategyDefinition, StrategyHandler } from './types';

const handler: StrategyHandler = ({ current, previous }) => {
  if (!current.sma50 || !current.sma200 || !previous?.sma50 || !previous?.sma200) {
    return { action: 'hold', reason: 'Waiting for SMAs' };
  }

  // Golden Cross: SMA 50 crosses above SMA 200
  if (previous.sma50 <= previous.sma200 && current.sma50 > current.sma200) {
    return { action: 'buy', reason: 'Golden Cross - SMA 50 crossed above SMA 200' };
  }

  // Death Cross: SMA 50 crosses below SMA 200
  if (previous.sma50 >= previous.sma200 && current.sma50 < current.sma200) {
    return { action: 'sell', reason: 'Death Cross - SMA 50 crossed below SMA 200' };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'sma-crossover',
  name: 'Golden Cross/Death Cross',
  description: 'Buy when SMA 50 crosses above SMA 200, sell on death cross',
  handler,
};

export default strategy;
