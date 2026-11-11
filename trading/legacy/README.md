# Legacy standalone Lambdas

Not deployed by the CDK stack, and not what trades today. These are the
hand-deployed, single-file Lambdas from before `TradierTrading`, moved here from
the old local `trading-strategies` repo so all the trading code lives in one
place.

- [`bollinger-bands-lin/`](bollinger-bands-lin): Bollinger Bands on LIN 1h, a
  self-contained `index.mjs` (Node.js 22.x, `index.handler`) and its notes.
- [`aws-setup.md`](aws-setup.md): the manual AWS setup those Lambdas used (table
  `trading-bot-state`, secret `tradier/sandbox`, IAM, scheduler).

The live system is the CDK stack in [`..`](..): to trade Bollinger Bands now,
add a `strategyId: 'bollinger-bands'` entry to `deployments.ts` and deploy,
which runs the backtester's own `app/strategies/bollinger-bands.ts`.

No credentials are kept here: the code reads them from Secrets Manager at run
time, and the docs show placeholders only.
