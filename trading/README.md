# Tradier paper trading (CDK)

One CDK stack, `TradierTrading`, that paper-trades strategies from
`app/strategies` against the **Tradier sandbox**. Each entry in
[`deployments.ts`](deployments.ts) becomes its own Lambda, schedule, state row,
errors alarm and section on the `TradierTrading` CloudWatch dashboard. They all
share one runtime ([`runtime/`](runtime)), one DynamoDB table and one Tradier
secret.

The live Lambda runs the **same code the backtester runs**: the strategy's own
`handler` from `app/strategies/<id>.ts` and the indicators from
`calculateIndicatorsWithParams` in `app/lib/backtest-engine.ts`, bundled in by
esbuild. Change a strategy, redeploy, and live trading changes with it.

## Add a strategy

1. Add an entry to `DEPLOYMENTS` in [`deployments.ts`](deployments.ts):

   ```ts
   {
     id: 'rsi2-spy-5m',          // names the Lambda, state row and dashboard section; never rename a live one
     strategyId: 'rsi2',         // a key of AVAILABLE_STRATEGIES
     symbol: 'SPY',
     interval: '5min',           // 1min | 5min | 15min
     params: { oversold: 10 },   // on top of the strategy's defaults
     allocationPct: 30,          // enabled deployments must sum to <= 100
   }
   ```

   Every field and default is in [`runtime/config.ts`](runtime/config.ts).
   Synth refuses an unknown strategy or parameter, two **enabled** deployments
   on one symbol (one account holds one net position per symbol), or
   allocations over 100%.
2. Deploy and check it:

   ```
   cd trading
   npx cdk diff
   npx cdk deploy
   npm run dry-run -- rsi2-spy-5m
   ```

To pause one, set `enabled: false` and deploy (its schedule is disabled; the
Lambda stays). To remove one, flatten its position in Tradier first, then
delete the entry and deploy.

## What runs, every bar close

Weekdays 04:00-20:59 ET, at each `interval` boundary (EventBridge Scheduler,
America/New_York):

1. Reconcile with Tradier (Tradier wins): resolve the pending order, adopt
   Tradier's position on a mismatch, and skip trading the bar on any mismatch
   or unknown open order.
2. Fetch the same fixed window of `timesales` (`session_filter=all`), drop
   invalid, duplicate and still-forming bars, and skip unless the bar that
   just closed is there, the run started within 2 minutes of it, and there are
   at least `minBars` bars.
3. Indicators from the engine, signal from the strategy. Exit first; otherwise
   enter when flat (never both on one bar), sized at `positionSizePct` of the
   deployment's equity, subject to the daily loss limit and the drawdown pause.
   The drawdown limit is checked last and closes the position when it trips.
4. Market orders only when Tradier's clock is `open` and the bar closed in
   09:30-16:00 ET. An order POST is never retried.
5. One conditional state write, and one JSON log line with metrics.

**Deployment equity** = its allocation of the account at its first run + its
realized P&L + open P&L at the bar's close. Sizing, the daily loss limit and the
drawdown limit all use it, so strategies don't eat each other's risk budget.

## Live stats: the dashboard

Each run's log line is in CloudWatch [Embedded Metric
Format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html):
the Lambda writes no extra API calls, and CloudWatch extracts the metrics under
namespace `TradierTrading`, dimension `Deployment`. The full list is in
[`runtime/metrics.ts`](runtime/metrics.ts): equity, realized/open/today P&L,
drawdown %, position, signal, orders, fills, trades closed, winners, skips,
stale-data skips, reconciliation mismatches, errors and bar lag.

The `TradierTrading` dashboard (its URL is a stack output) shows all
deployments together, then a section per deployment with current values,
totals over the selected range, graphs and a table of its latest decisions.
Dry runs never publish metrics.

## Operations

| | |
|---|---|
| Deploy / redeploy | `cd trading && npx cdk deploy` |
| See what would change | `npx cdk diff` |
| Dry-run every deployment | `npm run dry-run` |
| Pause everything | set every `enabled: false` and deploy, or `aws scheduler update-schedule` each `tradier-<id>` schedule with `--state DISABLED` |
| Tear down | flatten positions in Tradier, then `npx cdk destroy`. The state table is retained; delete it by hand if you mean to. |

The Tradier secret (`TRADIER_SECRET_NAME` in `deployments.ts`, JSON
`{"accessToken": "...", "accountId": "VA..."}`) lives outside the stack, so
deploys and `cdk destroy` never touch it. To change the credentials:

```
aws secretsmanager put-secret-value --secret-id <name> --secret-string file://creds.json
```

The base URL is hardcoded to `https://sandbox.tradier.com/v1` and checked on
every request; nothing can point it at live trading.

## Tests

`npm test` at the repo root runs `runtime/*.test.ts`: the whole run against a
fake Tradier and store (entries, exits, shorts, stale data, reconciliation,
pending and rejected orders, drawdown, daily loss, dry run, errors), config
validation, metrics, and that the series is identical to the engine's.
`npm run typecheck` here type-checks the stack, the runtime and the `app/` code
it bundles (the root `tsconfig.json` excludes `trading/` so the Next build
never needs the CDK packages).
