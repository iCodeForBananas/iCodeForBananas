# Trading Strategy Schema Documentation

This directory contains trading strategies for the algo-backtest feature. Each strategy is a TypeScript module that exports a `StrategyDefinition` object.

## Architecture

The strategy system uses a **Lambda-style handler pattern** that provides:
- **Type Safety**: Full TypeScript support with autocomplete
- **Security**: No eval() or dynamic code execution
- **Testability**: Strategies are pure functions that can be unit tested
- **AI-Friendly**: Clear schema for AI code generation

## TypeScript Schema

### Core Types

```typescript
// OHLC candlestick data
export interface OHLCBar {
  time: number;        // Unix timestamp
  open: number;        // Opening price
  high: number;        // Highest price
  low: number;         // Lowest price
  close: number;       // Closing price
  volume?: number;     // Trading volume (optional, may not be available from all data sources)
}

// Technical indicators (all optional, may not be available for early candles)
export interface IndicatorValues {
  sma20?: number;           // 20-period Simple Moving Average
  sma50?: number;           // 50-period Simple Moving Average
  sma200?: number;          // 200-period Simple Moving Average
  ema9?: number;            // 9-period Exponential Moving Average
  ema21?: number;           // 21-period Exponential Moving Average
  rsi?: number;             // Relative Strength Index (0-100)
  macd?: number;            // MACD line
  macdSignal?: number;      // MACD signal line
  macdHistogram?: number;   // MACD histogram
  atr?: number;             // Average True Range
  upperBand?: number;       // Donchian Channel upper band (20-period high)
  lowerBand?: number;       // Donchian Channel lower band (20-period low)
  midLine?: number;         // Donchian Channel midline
  prevClose?: number;       // Previous candle close
  prevHigh?: number;        // Previous candle high
  prevLow?: number;         // Previous candle low
}

// Context provided to the strategy handler
export interface StrategyContext {
  current: OHLCBar & IndicatorValues;     // Current candle with indicators
  previous: (OHLCBar & IndicatorValues) | null;  // Previous candle (null for first candle)
  index: number;                           // Current candle index in the series
  series: (OHLCBar & IndicatorValues)[];  // Full historical series for lookback
}

// Signal returned by the strategy
export interface StrategySignal {
  action: 'buy' | 'sell' | 'hold';  // Trading action
  reason: string;                    // Human-readable reason for the action
}

// Strategy handler function signature
export type StrategyHandler = (context: StrategyContext) => StrategySignal;

// Complete strategy definition
export interface StrategyDefinition {
  id: string;              // Unique identifier (kebab-case)
  name: string;            // Display name
  description: string;     // Brief description
  handler: StrategyHandler; // The strategy function
}
```

## Example Strategy Implementation

Here's a complete example of an EMA crossover strategy:

```typescript
// app/strategies/ema-crossover.ts
import { StrategyDefinition, StrategyHandler } from './types';

const handler: StrategyHandler = ({ current, previous }) => {
  // Always check if required indicators are available
  if (!current.ema9 || !current.ema21 || !previous?.ema9 || !previous?.ema21) {
    return { action: 'hold', reason: 'Waiting for indicators' };
  }

  // Bullish crossover: EMA 9 crosses above EMA 21
  if (previous.ema9 <= previous.ema21 && current.ema9 > current.ema21) {
    return { action: 'buy', reason: 'EMA 9 crossed above EMA 21' };
  }

  // Bearish crossover: EMA 9 crosses below EMA 21
  if (previous.ema9 >= previous.ema21 && current.ema9 < current.ema21) {
    return { action: 'sell', reason: 'EMA 9 crossed below EMA 21' };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'ema-crossover',
  name: 'EMA Crossover',
  description: 'Buy when EMA 9 crosses above EMA 21, sell when it crosses below',
  handler,
};

export default strategy;
```

## Guidelines for Creating New Strategies

### 1. Always Validate Indicator Availability

Indicators may not be available for the first N candles (where N is the indicator period). Always check:

```typescript
if (!current.sma20 || !previous?.sma20) {
  return { action: 'hold', reason: 'Waiting for indicators' };
}
```

### 2. Use Previous Candle for Crossover Detection

To detect crossovers, compare current and previous values:

```typescript
// Bullish crossover
if (previous.ema9 <= previous.ema21 && current.ema9 > current.ema21) {
  return { action: 'buy', reason: 'Bullish crossover' };
}
```

### 3. Provide Clear Reasons

The `reason` field appears in the trade log. Make it informative:

```typescript
// Good
return { action: 'buy', reason: `RSI oversold (${current.rsi.toFixed(1)})` };

// Less useful
return { action: 'buy', reason: 'buy signal' };
```

### 4. Use the Series for Lookback Logic

The `series` array contains all historical data up to the current point. Use it for complex lookback:

```typescript
const handler: StrategyHandler = ({ current, index, series }) => {
  // Look back 10 candles to find the highest high
  const lookback = 10;
  if (index < lookback) {
    return { action: 'hold', reason: 'Not enough data' };
  }
  
  const recentCandles = series.slice(index - lookback, index);
  const highestHigh = Math.max(...recentCandles.map(c => c.high));
  
  if (current.close > highestHigh) {
    return { action: 'buy', reason: '10-period breakout' };
  }
  
  return { action: 'hold', reason: '' };
};
```

### 5. Keep It Pure

Strategy handlers should be pure functions:
- No side effects
- No external state
- Same input → same output
- Don't mutate the context

## Adding a New Strategy to the Dropdown

To add a new strategy:

1. **Create the strategy file** in `app/strategies/`:
   ```typescript
   // app/strategies/my-strategy.ts
   import { StrategyDefinition, StrategyHandler } from './types';
   
   const handler: StrategyHandler = ({ current, previous }) => {
     // Your logic here
     return { action: 'hold', reason: '' };
   };
   
   const strategy: StrategyDefinition = {
     id: 'my-strategy',
     name: 'My Strategy',
     description: 'Brief description',
     handler,
   };
   
   export default strategy;
   ```

2. **Register it** in `app/strategies/index.ts`:
   ```typescript
   import myStrategy from './my-strategy';
   
   export const AVAILABLE_STRATEGIES: Record<string, StrategyDefinition> = {
     // ... existing strategies
     'my-strategy': myStrategy,
   };
   ```

3. **Test it** by selecting it from the dropdown in the UI.

## Available Indicators

The backtest engine pre-calculates these indicators for every candle:

| Indicator | Description | Period |
|-----------|-------------|--------|
| `sma20` | Simple Moving Average | 20 |
| `sma50` | Simple Moving Average | 50 |
| `sma200` | Simple Moving Average | 200 |
| `ema9` | Exponential Moving Average | 9 |
| `ema21` | Exponential Moving Average | 21 |
| `rsi` | Relative Strength Index | 14 |
| `macd` | MACD line | 12/26 |
| `macdSignal` | MACD signal line | 9 |
| `macdHistogram` | MACD histogram | - |
| `atr` | Average True Range | 14 |
| `upperBand` | Donchian upper band | 20 |
| `lowerBand` | Donchian lower band | 20 |
| `midLine` | Donchian midline | 20 |

## Volume

Bars carry `volume` when the source has it: the bundled CSVs in `public/data`
and the live Tradier feed both do. It is optional, so check before use.
`volume.ts` has ready-made helpers that return `NaN` when volume is missing:

| Helper | What it gives |
|--------|---------------|
| `hasVolume(bar)` | Whether the bar has volume |
| `sessionVwap(series)` | Session VWAP per bar, reset each day |
| `relativeVolume(series, i, n)` | Bar volume over the prior `n` bars' average |
| `openingRelativeVolume(series, i, days)` | Opening bar volume vs. the same bar of prior sessions |
| `onBalanceVolume(series)` | Granville's OBV |

## Intraday Strategies

`session.ts` gives each bar its New York date, minute, place in the regular
session and bar length, using only that bar and earlier ones:

```typescript
const info = sessionInfo(series);
if (!isIntraday(info, index)) return { action: 'hold', reason: 'Needs intraday bars' };
info.sessionBar[index];        // 0 = first bar of the session (9:30)
info.sessionStart[index];      // index of the session's first bar
isFlattenBar(info, index);     // last decision that fills before the close
```

Orders fill at the next bar's open, so "flat by the close" means exiting on
`isFlattenBar`: on hourly bars that is the 14:30 bar, filled at the 15:30 open.

| Strategy | Source | Idea |
|----------|--------|------|
| `opening-range-breakout` | Crabel 1990; Zarattini, Barbon & Aziz 2024 | Trade a break of the first hour's range; optional opening relative volume filter |
| `intraday-momentum` | Gao, Han, Li & Zhou, JFE 2018 | The morning move predicts the move into the close |
| `vwap-trend` | Zarattini & Aziz 2023 | Long above session VWAP, short below |

## Candlestick Patterns

`candle-patterns.ts` detects engulfing, hammer / shooting star, morning /
evening star, piercing line / dark cloud cover, harami, three white soldiers /
black crows and inside bar breakouts. Shapes are measured as proportions of
the bar (body, range, shadows) and "long" bodies against the average of the
last 10, so the rules work on any price and timeframe. Use them in any strategy:

```typescript
import { detectPattern, detectPatterns } from './candle-patterns';
detectPattern(series, index, 'engulfing', 5); // 1 bullish, -1 bearish, 0 none
detectPatterns(series, index, ['hammer', 'star'], 5); // { bull: [...], bear: [...] }
```

The last argument requires a prior move against a reversal (a decline before a
bullish one). Patterns alone are a weak edge on US stocks (Marshall, Young &
Rose 2006), so `candlestick-patterns` adds context: the prior move, an optional
200 SMA filter and a relative volume filter, and exits after a fixed hold.

## Strategy Behavior

- The backtest engine calls your handler for each candle in sequence
- When you return `'buy'`, a long position is opened at the current close price
- When you return `'sell'`, any open position is closed at the current close price
- Only one position can be open at a time
- If you `'buy'` when already in a position, the signal is ignored
- When **Enable Short Entries** is turned on:
  - A `'sell'` signal with no open position opens a short position
  - A `'buy'` signal closes an open short position
  - All strategies support short trades via their symmetric buy/sell signals

## Risk Management (Stop Loss / Take Profit)

The backtest engine supports configurable stop loss and take profit levels:

- **Entry**: Trades always enter at the bar's close price
- **Stop Loss**: If configured (> 0%), the stop loss is set as a percentage below the entry price
- **Take Profit**: If configured (> 0%), the take profit is set as a percentage above the entry price
- **Intra-bar Exits**: On each bar, the engine checks if the high-low range would hit the SL or TP:
  - For long positions: If the bar's low <= stop loss price, the trade exits at the stop loss price
  - For long positions: If the bar's high >= take profit price, the trade exits at the take profit price
- **Priority**: Stop loss and take profit are checked before strategy signals for that bar
- **Exit Price**: When SL/TP is hit, the trade exits at the exact SL/TP price, not the bar's close

This ensures realistic backtesting where trades can exit mid-bar when risk levels are breached.

## AI Code Generation Prompt Template

If asking an AI to generate a strategy, use this template:

```
Create a trading strategy for the algo-backtest feature using the Lambda-style handler pattern.

Requirements:
- Import types from './types'
- Create a StrategyHandler function
- Check for indicator availability before using them
- Return StrategySignal with action ('buy'|'sell'|'hold') and reason
- Export a StrategyDefinition with id, name, description, and handler

Available indicators: sma20, sma50, sma200, ema9, ema21, rsi, macd, macdSignal, 
macdHistogram, atr, upperBand, lowerBand, midLine

Context includes:
- current: Current candle with indicators
- previous: Previous candle (may be null)
- index: Current candle index
- series: Full historical data for lookback

Strategy concept: [describe your strategy logic here]

File name should be: app/strategies/[strategy-id].ts
Then register it in app/strategies/index.ts
```

## Best Practices

1. **Start Simple**: Begin with basic logic, test it, then add complexity
2. **Test Edge Cases**: What happens with the first candle? What if indicators are undefined?
3. **Use TypeScript**: Let the type system catch errors before runtime
4. **Add Comments**: Explain the strategy logic for future readers
5. **Monitor Performance**: Check win rate, profit factor, and drawdown in the UI

## Security Note

This architecture eliminates the security risks of `eval()` and `new Function()`:
- All code is statically compiled
- No runtime code execution
- Full TypeScript type checking
- Strategies can be code-reviewed and tested

## Support

For questions or issues, see the main project README or open an issue on GitHub.
