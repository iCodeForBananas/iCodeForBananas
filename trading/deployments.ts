// The live paper-trading deployments. Each entry becomes its own Lambda, its
// own EventBridge schedule (every bar close, weekdays 04:00-20:59 ET), its own
// state row and its own row on the TradierTrading CloudWatch dashboard. All of
// them share the Tradier sandbox secret, the state table and the runtime in
// trading/runtime, which runs the strategy straight from app/strategies.
//
// Each entry's id, and so its Lambda's name, is built from its settings:
// strategy-symbol-interval-<param values>-<ls|l>, e.g.
// tradier-ibs-mean-reversion-qqq-15m-20-50-n-ls. Changing a setting makes a new
// deployment with fresh state and removes the old one, so flatten its position
// in Tradier first (or let the new one adopt it on its first run).
//
// To add one: add an entry, then `cd trading && npx cdk deploy`. Synth fails
// with a list of problems if an entry is invalid (unknown strategy or
// parameter, two enabled entries on one symbol, allocations over 100%, ...).
//
// See runtime/config.ts for every field and its default.

import type { Deployment } from './runtime/config';

// Each backtest sized at 100% of the account. They share one sandbox account,
// so each of the six enabled ones gets 16%, leaving 4% as cash.
const SHARED_RISK = { allocationPct: 16, maxDailyLossPct: 2, drawdownLimitPct: 25, drawdownPauseBars: 20 } as const;

export const DEPLOYMENTS: Deployment[] = [
  {
    strategyId: 'ibs-mean-reversion',
    symbol: 'QQQ',
    interval: '15min',
    params: { entryIbs: 20, exitIbs: 50, trendFilter: false },
    enableShorts: true,
    ...SHARED_RISK,
  },
  {
    strategyId: 'ibs-mean-reversion',
    symbol: 'TXN',
    interval: '15min',
    params: { entryIbs: 25, exitIbs: 75, trendFilter: false },
    enableShorts: true,
    ...SHARED_RISK,
    // The backtest warmed up on at least 375 bars; 14 days covers thin extended-hours sessions.
    minBars: 375,
    historyDays: 14,
  },
  {
    strategyId: 'ibs-mean-reversion',
    symbol: 'AMZN',
    interval: '15min',
    params: { entryIbs: 25, exitIbs: 90, trendFilter: false },
    enableShorts: true,
    ...SHARED_RISK,
    // The backtest warmed up on at least 450 bars.
    minBars: 450,
    historyDays: 14,
  },
  {
    strategyId: 'ibs-mean-reversion',
    symbol: 'AVGO',
    // Built from 15-minute timesales; see aggregateBars in runtime/market.ts.
    interval: '30min',
    params: { entryIbs: 40, exitIbs: 80, trendFilter: false },
    enableShorts: true,
    ...SHARED_RISK,
    // The backtest warmed up on at least 400 bars: about 13 trading days of 30-minute bars.
    minBars: 400,
    historyDays: 21,
  },
  {
    strategyId: 'ibs-mean-reversion',
    symbol: 'TQQQ',
    interval: '15min',
    params: { entryIbs: 20, exitIbs: 50, trendFilter: false },
    enableShorts: true,
    ...SHARED_RISK,
  },
  {
    strategyId: 'ema-crossover',
    symbol: 'TSLA',
    // Built from 15-minute timesales, aligned to the ET hour.
    interval: '1h',
    params: { fastPeriod: 50, slowPeriod: 31 },
    // Long only: a sell while flat does nothing.
    enableShorts: false,
    ...SHARED_RISK,
    // 250 one-hour bars is about 16 trading days of all-session data.
    historyDays: 30,
  },
  {
    strategyId: 'ema-price-cross',
    symbol: 'TQQQ',
    interval: '1h',
    params: { emaPeriod: 2 },
    enableShorts: true,
    ...SHARED_RISK,
    historyDays: 30,
    // TQQQ is already traded by the IBS deployment above, and one account holds
    // one net position per symbol. Deployed, but its schedule stays off until
    // one of the two is chosen.
    enabled: false,
  },
];

/**
 * The Tradier sandbox secret: JSON {"accessToken": "...", "accountId": "VA..."}.
 * Created outside the stack, so redeploying or destroying the stack never
 * touches the credentials.
 */
export const TRADIER_SECRET_NAME = 'tradier-paper-ibs-mean-reversion-qqq/tradier-sandbox';
