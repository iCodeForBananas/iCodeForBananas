// Trading Chart Types

export interface PricePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  donchianMiddle?: number;
  ema?: number;
  trailstopSma?: number;
}

export enum PositionSide {
  LONG = "LONG",
  SHORT = "SHORT",
}

export interface Position {
  id: string;
  side: PositionSide;
  entryPrice: number;
  size: number;
  entryTime: number;
  exitPrice?: number;
  exitTime?: number;
  stopLoss?: number; // Initial stop loss at entry
  currentStopLoss?: number; // Trailing stop loss (updates as trade progresses)
  pnl?: number;
  status: "open" | "closed";
}

export interface Account {
  balance: number;
  riskPercentage: number;
}

// Algo Backtest Types

export interface TradeSignal {
  type: "entry" | "exit";
  side: PositionSide;
  price: number;
  time: number;
  reason: string;
}

export interface BacktestTrade {
  id: string;
  side: PositionSide;
  entryPrice: number;
  entryTime: number;
  exitPrice: number;
  exitTime: number;
  pnl: number;
  pnlPercent: number;
  reason: string;
  /** Per-bar trailing stop prices, recorded from entry to exit. Only present when
   *  a stop was active (EMA-based or fixed percentage). Used for chart visualization. */
  trailingSeries?: { time: number; price: number }[];
}

export interface BacktestResult {
  trades: BacktestTrade[];
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
}

export interface StrategyCondition {
  id: string;
  name: string;
  code: string;
  description: string;
}

// Extended price point with computed indicators for strategy
export interface IndicatorData extends PricePoint {
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
  // Dynamic indicators (keyed by period) for parameterized strategies
  [key: `sma${number}`]: number | undefined;
  [key: `ema${number}`]: number | undefined;
  // Dynamic MACD indicators (keyed by fast_slow_signal periods)
  [key: `macd_${number}_${number}_${number}`]: number | undefined;
  [key: `macdSignal_${number}_${number}_${number}`]: number | undefined;
  [key: `macdHistogram_${number}_${number}_${number}`]: number | undefined;
  // Dynamic Donchian indicators (keyed by period)
  [key: `donchian_${number}_upperBand`]: number | undefined;
  [key: `donchian_${number}_lowerBand`]: number | undefined;
  [key: `donchian_${number}_midLine`]: number | undefined;
}
