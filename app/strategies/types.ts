// Type definitions for strategy handlers

export interface OHLCBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorValues {
  sma20?: number;
  sma50?: number;
  sma200?: number;
  ema9?: number;
  ema21?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  atr?: number;
  upperBand?: number;
  lowerBand?: number;
  midLine?: number;
  prevClose?: number;
  prevHigh?: number;
  prevLow?: number;
}

export interface StrategyContext {
  current: OHLCBar & IndicatorValues;
  previous: (OHLCBar & IndicatorValues) | null;
  index: number;
  series: (OHLCBar & IndicatorValues)[]; // Full historical series for lookback
}

export interface StrategySignal {
  action: 'buy' | 'sell' | 'hold';
  reason: string;
}

export type StrategyHandler = (context: StrategyContext) => StrategySignal;

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  handler: StrategyHandler;
}
