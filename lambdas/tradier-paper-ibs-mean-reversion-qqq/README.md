# IBS Mean Reversion, QQQ 15m: Tradier sandbox paper trader

An AWS Lambda that paper-trades the backtester's `ibs-mean-reversion` strategy
(entryIbs 20, exitIbs 50, no trend filter, long and short) on QQQ 15-minute
bars through the **Tradier sandbox only**. The base URL is a hardcoded
constant and the code refuses to start if it isn't `sandbox.tradier.com`.

- `lambda/index.mjs`: the function (Node.js 22.x, `index.handler`, no npm deps).
- `deploy/deploy.mjs`: idempotent deploy with the AWS SDK v3.
- `deploy/verify.mjs`: read-only checks of every resource plus a dry-run invoke and its CloudWatch log line.
- `deploy/teardown.mjs`: deletes everything after asking.
- `deploy/smoke-test.mjs`: runs the handler locally against a fake Tradier, DynamoDB and Secrets Manager.

## Commands

From `deploy/`, with AWS credentials and a region resolvable by the default
provider chain (`aws configure sso` or `aws configure`, plus `AWS_REGION`):

```bash
npm install
node smoke-test.mjs
node deploy.mjs --account <12-digit id> --region <region>
node verify.mjs --account <12-digit id> --region <region>
node teardown.mjs --account <12-digit id> --region <region>
```

Real sandbox credentials go in through the environment on your machine,
never through code or chat. `deploy.mjs` writes them to Secrets Manager:

```powershell
$env:TRADIER_SANDBOX_TOKEN = '<sandbox token>'; $env:TRADIER_SANDBOX_ACCOUNT_ID = '<VA... id>'; node deploy.mjs
```

Pause and resume trading without deleting anything:

```bash
aws scheduler update-schedule --cli-input-json "$(aws scheduler get-schedule --name tradier-paper-ibs-mean-reversion-qqq-schedule --query '{Name:Name,GroupName:GroupName,ScheduleExpression:ScheduleExpression,ScheduleExpressionTimezone:ScheduleExpressionTimezone,FlexibleTimeWindow:FlexibleTimeWindow,Target:Target,Description:Description}' --output json)" --state DISABLED
```

Running `node deploy.mjs` again sets it back to `ENABLED`.

## Choices where the spec was ambiguous (the more conservative reading)

- **Freshness.** The newest completed bar must be the one that closed at the
  latest 15-minute boundary, and the invocation must start within 2 minutes of
  it. Otherwise nothing happens and nothing is written. Missing pre-market bars
  (no trades in a quiet 15 minutes) therefore skip that bar.
- **Fewer than 250 completed bars** in the fixed 10-calendar-day window: no trading.
- **Regular hours** means Tradier's clock says `open` *and* the bar closed in
  [09:30, 16:00) ET, so the order fills at a regular-session open. Outside it
  the bar is still evaluated, logged and marked processed.
- **Drawdown pause** counts 20 real bars after the trip bar, as the backtest
  does, not 20 × 15 minutes of clock time. `entriesAllowedFrom` is stored as
  the clock estimate; the bar count, which is never sooner, is what gates.
  After a trip, `peakEquity` resets to the equity marked on the trip bar (as in
  the backtest), since the close fills later.
- **Order POSTs are never retried**, even on a 5xx, because the order may
  already exist; reconciliation picks it up next bar. GETs retry network
  errors and 5xx up to 3 attempts; 4xx never.
- **Lambda async retries are off** (0 retries, 2-minute max event age); the
  scheduler's retry policy (1 retry, 2 minutes) covers delivery failures.
- **RSI** follows the backtest engine exactly (no losses is 100, no movement
  is 50). The strategy doesn't read it; it's logged for comparison.
- The schedule fires `cron(0,15,30,45 4-20 ? * MON-FRI *)` in
  America/New_York, covering every bar close from 04:15 to 20:00. Firings with
  no new bar log "stale" and do nothing. EventBridge Scheduler schedules can't
  carry tags, so the schedule is the one untagged resource.
