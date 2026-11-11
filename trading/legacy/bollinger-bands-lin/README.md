# Bollinger Bands — LIN — 1h

AWS Lambda that paper-trades a Bollinger Bands strategy on LIN using 1h bars,
through the **Tradier sandbox API only**. Sandbox paper trading — no real money.

## Strategy parameters

| Param | Value |
|---|---|
| Strategy ID | `bollinger-bands` |
| Symbol | LIN |
| Bars | 1h (built from 15min timesales, `session_filter=all`) |
| Period | 9 |
| Std dev | 1 |
| Side | Long only, one position at a time |
| Entry | Buy at market when close crosses **below** the lower band (prev close > lower, current close < lower) |
| Exit | Sell at market when close crosses **above** the upper band (no reversal into a short) |
| Stop loss | 1% below entry `avg_fill_price`, resting GTC stop at Tradier |
| Take profit | None |
| Sizing | 100% of Tradier `total_equity` / last close, floored to whole shares |
| Daily loss limit | No new entries once realized P&L today ≤ −`MAX_DAILY_LOSS_PCT`% of day-start equity |
| Order hours | Orders placed only 9:30am–4:00pm ET, weekdays |

## AWS configuration

Shared setup (table, secret, IAM, scheduler) is in [docs/aws-setup.md](../aws-setup.md).
Strategy-specific values:

| Item | Value |
|---|---|
| DynamoDB item key | `symbolStrategy = LIN#bollinger-bands` |
| Lambda runtime / handler | Node.js 22.x, `index.handler` |
| Timeout / memory | 2 min / 256 MB |
| Schedule | `cron(1 5-20 ? * MON-FRI *)`, `America/New_York`, payload `{}`, 0 retries |

The schedule fires at :01 past each hour from 5:01am to 8:01pm ET. Order placement
is gated in code to 9:30am–4:00pm ET; outside that window it logs what it *would* do.

### Environment variables

| Name | Value | Notes |
|---|---|---|
| `STATE_TABLE_NAME` | `trading-bot-state` | |
| `TRADIER_SECRET_ID` | `tradier/sandbox` | JSON keys `TRADIER_SANDBOX_TOKEN`, `TRADIER_SANDBOX_ACCOUNT_ID` |
| `MAX_DAILY_LOSS_PCT` | `2` | |
| `LOOKBACK_DAYS` | `45` | Days of 15min timesales fetched (min 5) |
| `MIN_BARS` | `250` | Completed 1h bars required before trading (min 50) |
| `STALENESS_GRACE_MIN` | `10` | Newest completed bar may be at most 60 + this many minutes old |
| `DRY_RUN` | `true` initially | Logs `would_enter` / `would_exit` instead of placing orders |

No base-URL env var: `https://sandbox.tradier.com/v1` is hardcoded and the code
throws at startup (and before every request) if the host isn't `sandbox.tradier.com`.

### Setup checklist

- [ ] DynamoDB table `trading-bot-state` (partition key `symbolStrategy`, String, on-demand)
- [ ] Secret `tradier/sandbox` with `TRADIER_SANDBOX_TOKEN` and `TRADIER_SANDBOX_ACCOUNT_ID`
- [ ] Execution role: `AWSLambdaBasicExecutionRole` + `dynamodb:GetItem`/`dynamodb:UpdateItem` on the table ARN + `secretsmanager:GetSecretValue` on `arn:aws:secretsmanager:REGION:ACCOUNT:secret:tradier/sandbox-*`
- [ ] Lambda: Node.js 22.x, `index.handler`, 2 min, 256 MB, paste `index.mjs`, set env vars above with `DRY_RUN=true`
- [ ] Run the test plan below
- [ ] EventBridge Scheduler: `cron(1 5-20 ? * MON-FRI *)`, `America/New_York`, payload `{}`, 0 retries
- [ ] Watch dry-run logs for a few sessions, then set `DRY_RUN=false`

## Test plan

1. With `DRY_RUN=true`, run once from the Lambda console **Test** tab with event `{}`.
   Expect a single JSON log line with:
   - `decision`: `hold`, `would_enter`, or `no_action` (`would_exit` is also possible if already long)
   - `baseUrl: "https://sandbox.tradier.com/v1"`
   - `data.hourBars` in the hundreds
   - `bar.ageMinutes` near 1 (when run just after the top of the hour)
   - an `indicators` block with `bbMiddle`, `bbUpper`, `bbLower`
   - `broker.totalEquity` matching the sandbox account
   - `accountId` masked (`****1234`) and no token anywhere in the log
2. Run again immediately. Expect `alreadyProcessedBar: true`.
3. Check the DynamoDB item `LIN#bollinger-bands` has `lastProcessedBarTime`,
   `tradingDay`, `dayStartEquity`, `realizedPnlToday: 0`, and `position: null`.

## Resolved ambiguities

- **Insufficient history:** fewer than `MIN_BARS` (250) completed 1h bars → no trading at all (`decision: no_action`).
- **Bar alignment:** 1h bars are clock-hour aligned (10:00–11:00, …), not anchored to the 9:30 open.
- **The 15:00–16:00 bar is never traded live.** It closes at 16:00, so the 16:01
  invocation is outside regular hours and only logs a `would_*` decision. This is the
  main source of live-vs-backtest divergence.
- **Stop order type:** `class=equity`, `type=stop`, `duration=gtc` — not an OCO bracket, since there's no take profit.
- **Missing stop:** a resting stop found cancelled/rejected while still long is re-placed, and that invocation skips trading.
- **Tradier/DynamoDB mismatch** (share count differs, or untracked open orders exist):
  trading halts for the invocation and stays halted until fixed by hand.
- **Duplicate-bar invocations** still reconcile with Tradier and record fills, but take no new action.
- **RSI with `avgLoss = 0`** yields 99.0099 (RS is capped at 100). RSI is logged only; it doesn't drive this strategy.
- **Day-start equity** is captured at the first invocation of each ET calendar date.

## Backtest reference

For comparison only — **not a guarantee** of live or paper results.

| Metric | Value |
|---|---|
| Data | `LIN-1h-2026-09-21.csv` |
| Starting equity | $100,000 |
| Total return | +501.49% |
| Trades | 587 |
| Win rate | 63.5% |
| Max drawdown | 16.25% |
| Sharpe | 2.84 |

This Lambda is sandbox paper trading only.
