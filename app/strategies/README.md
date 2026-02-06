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
  volume: number;      // Trading volume
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

## Strategy Behavior

- The backtest engine calls your handler for each candle in sequence
- When you return `'buy'`, a long position is opened at the current close price
- When you return `'sell'`, any open position is closed at the current close price
- Only one position can be open at a time
- If you `'buy'` when already in a position, the signal is ignored
- If you `'sell'` with no position, the signal is ignored

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
