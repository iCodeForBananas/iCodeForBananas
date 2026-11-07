// The live paper-trading deployments. Each entry becomes its own Lambda, its
// own EventBridge schedule (every bar close, weekdays 04:00-20:59 ET), its own
// state row and its own row on the TradierTrading CloudWatch dashboard. All of
// them share the Tradier sandbox secret, the state table and the runtime in
// trading/runtime, which runs the strategy straight from app/strategies.
//
// To add one: add an entry, then `cd trading && npx cdk deploy`. Synth fails
// with a list of problems if an entry is invalid (unknown strategy or
// parameter, two enabled entries on one symbol, allocations over 100%, ...).
//
// See runtime/config.ts for every field and its default.

import type { Deployment } from './runtime/config';

export const DEPLOYMENTS: Deployment[] = [
  {
    id: 'ibs-mean-reversion-qqq-15m',
    strategyId: 'ibs-mean-reversion',
    symbol: 'QQQ',
    interval: '15min',
    params: { entryIbs: 20, exitIbs: 50, trendFilter: false },
    enableShorts: true,
    allocationPct: 100,
    maxDailyLossPct: 2,
    drawdownLimitPct: 25,
    drawdownPauseBars: 20,
  },
];

/**
 * The Tradier sandbox secret: JSON {"accessToken": "...", "accountId": "VA..."}.
 * Created outside the stack, so redeploying or destroying the stack never
 * touches the credentials.
 */
export const TRADIER_SECRET_NAME = 'tradier-paper-ibs-mean-reversion-qqq/tradier-sandbox';
