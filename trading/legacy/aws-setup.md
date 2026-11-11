# Shared AWS setup

Every strategy Lambda in this repo uses the same pattern. The DynamoDB table, the
secret, and the IAM policy are shared; each strategy gets its own Lambda function
and its own EventBridge Scheduler schedule. Strategy-specific values (state key,
schedule, env var overrides) are in each strategy's README.

Replace `REGION` and `ACCOUNT` below with your AWS region and account ID.

## 1. DynamoDB — strategy state

| Setting | Value |
|---|---|
| Table name | `trading-bot-state` |
| Partition key | `symbolStrategy` (String) |
| Sort key | none |
| Capacity mode | On-demand |

One item per strategy, keyed `SYMBOL#strategy-id` (e.g. `LIN#bollinger-bands`).
The Lambda creates the item on its first successful run; you don't need to seed it.

## 2. Secrets Manager — Tradier sandbox credentials

| Setting | Value |
|---|---|
| Secret name | `tradier/sandbox` |
| Type | Other type of secret (key/value, stored as JSON) |

Secret value (placeholders — put the real values in Secrets Manager only, never in this repo):

```json
{
  "TRADIER_SANDBOX_TOKEN": "<your-tradier-sandbox-access-token>",
  "TRADIER_SANDBOX_ACCOUNT_ID": "<your-tradier-sandbox-account-id>"
}
```

## 3. Lambda function

| Setting | Value |
|---|---|
| Runtime | Node.js 22.x |
| Handler | `index.handler` |
| Timeout | 2 min |
| Memory | 256 MB |
| Code | paste/upload the strategy's `index.mjs` (no npm deps; AWS SDK v3 comes with the runtime) |

Common env vars (see the strategy README for the full list):

| Name | Value |
|---|---|
| `STATE_TABLE_NAME` | `trading-bot-state` |
| `TRADIER_SECRET_ID` | `tradier/sandbox` |
| `DRY_RUN` | `true` until the test plan passes |

There is deliberately **no base-URL env var**. The Tradier sandbox URL is hardcoded
and the code throws at startup if it isn't a sandbox URL.

## 4. IAM — Lambda execution role

Attach the AWS managed policy `AWSLambdaBasicExecutionRole` (CloudWatch Logs), plus
this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "StrategyState",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:UpdateItem"],
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT:table/trading-bot-state"
    },
    {
      "Sid": "TradierSandboxSecret",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:tradier/sandbox-*"
    }
  ]
}
```

The trailing `-*` on the secret ARN covers the random suffix Secrets Manager adds.

## 5. EventBridge Scheduler

| Setting | Value |
|---|---|
| Schedule type | Recurring, cron-based |
| Cron | per strategy (e.g. `cron(1 5-20 ? * MON-FRI *)`) |
| Time zone | `America/New_York` |
| Flexible time window | Off |
| Target | the strategy's Lambda function (Invoke) |
| Payload | `{}` |
| Retry policy | 0 retry attempts |

Retries are off on purpose: the Lambda is idempotent per bar, but a retried
invocation minutes late is not useful, and the next scheduled run picks up any
missed state.

## Checklist

- [ ] DynamoDB table `trading-bot-state` exists (partition key `symbolStrategy`, on-demand)
- [ ] Secret `tradier/sandbox` exists with both JSON keys
- [ ] Execution role has `AWSLambdaBasicExecutionRole` + the inline policy above
- [ ] Lambda created with Node.js 22.x, `index.handler`, 2 min, 256 MB, env vars set, `DRY_RUN=true`
- [ ] Strategy test plan passed (see the strategy README)
- [ ] EventBridge Scheduler schedule created
- [ ] After observing dry-run logs, flip `DRY_RUN=false`
