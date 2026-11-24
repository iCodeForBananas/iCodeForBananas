// Per-deployment Lambdas, one per entry: the old way to deploy a strategy.
// Empty on purpose. Every strategy now runs on the dispatcher
// (runtime/dispatch.ts) from public.strategy_deployments: deploy one from
// /algo-backtest with "Deploy strategy", manage them at /strategy-deployments,
// no CDK deploy. The 19 entries that were here moved there on 2026-11-24,
// state included (git history has them, with the reasoning for each setting).
//
// An entry here still works (its own Lambda and schedule; see the README),
// and while it's enabled the dispatcher refuses any deployment on its symbol.

import type { Deployment } from './runtime/config';

export const DEPLOYMENTS: Deployment[] = [];

/**
 * The Tradier sandbox secret: JSON {"accessToken": "...", "accountId": "VA..."}.
 * Created outside the stack, so redeploying or destroying the stack never
 * touches the credentials.
 */
export const TRADIER_SECRET_NAME = 'tradier-paper-ibs-mean-reversion-qqq/tradier-sandbox';

/**
 * Where the Lambdas report equity for the public /trading-leaderboard page: JSON
 * {"url": "...", "publishableKey": "...", "token": "..."}. Also created outside
 * the stack; until it exists, runs log the failed report and trade as normal.
 */
export const EQUITY_REPORTER_SECRET_NAME = 'tradier-trading/equity-reporter';
