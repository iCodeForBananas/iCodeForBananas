// Type definitions for strategy handlers

export interface OHLCBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // Optional since not all data sources provide volume
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
  // Dynamic indicators (keyed by period)
  [key: `sma${number}`]: number | undefined;
  [key: `ema${number}`]: number | undefined;
  // Dynamic MACD indicators (keyed by fast_slow_signal periods)
  [key: `macd_${number}_${number}_${number}`]: number | undefined;
  [key: `macdSignal_${number}_${number}_${number}`]: number | undefined;
  [key: `macdHistogram_${number}_${number}_${number}`]: number | undefined;
}

export interface StrategyContext {
  current: OHLCBar & IndicatorValues;
  previous: (OHLCBar & IndicatorValues) | null;
  index: number;
  series: (OHLCBar & IndicatorValues)[]; // Full historical series for lookback
  params: Record<string, number | boolean | string>; // Strategy parameters
}

export interface StrategySignal {
  action: 'buy' | 'sell' | 'hold';
  reason: string;
}

export type StrategyHandler = (context: StrategyContext) => StrategySignal;

// Strategy parameter definition for UI configuration
export interface StrategyParameter {
  key: string;
  name: string;
  description: string;
  type: 'number' | 'boolean' | 'select';
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  handler: StrategyHandler;
  parameters?: StrategyParameter[];
}

// Parameter variation for batch testing
export interface ParameterVariation {
  key: string;
  values: (number | boolean | string)[];
}

// Result for a single parameterized backtest run
export interface ParameterizedResult {
  params: Record<string, number | boolean | string>;
  label: string;
  dataset?: string; // Dataset file name for multi-dataset runs
  datasetLabel?: string; // Human-readable dataset label
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  buyAndHoldPnl: number;
  buyAndHoldPnlPercent: number;
  equityCurve: { time: number; equity: number }[];
  trades: {
    id: string;
    side: string;
    entryPrice: number;
    entryTime: number;
    exitPrice: number;
    exitTime: number;
    pnl: number;
    pnlPercent: number;
    reason: string;
    trailingSeries?: { time: number; price: number }[];
  }[];
}
