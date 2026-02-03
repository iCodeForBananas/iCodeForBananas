// Trading Chart Types

export interface PricePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  donchianMiddle?: number;
  ema?: number;
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
