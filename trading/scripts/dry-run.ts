// Dry-runs deployments through the dispatcher Lambda and prints each one's
// JSON log line. Places no orders, writes no state, publishes no metrics.
//
//   cd trading && npm run dry-run [-- [--latest] <deployment-id> ...]
//
// With no ids it runs every enabled deployment. --latest evaluates the newest
// bar even when it's stale, so a strategy's signal can be checked outside
// market hours.

import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { DispatchResult } from '../runtime/dispatch';

const DISPATCHER = 'tradier-dispatcher';
const latest = process.argv.includes('--latest');
const ids = process.argv.slice(2).filter((a) => a !== '--latest');
const lambda = new LambdaClient({});
const logs = new CloudWatchLogsClient({});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const startTime = Date.now() - 5_000;
const event = { dryRun: true, evaluateLatest: latest, ...(ids.length ? { ids } : { all: true }) };
const res = await lambda.send(new InvokeCommand({ FunctionName: DISPATCHER, Payload: Buffer.from(JSON.stringify(event)) }));
const payload = res.Payload ? Buffer.from(res.Payload).toString() : '';
if (res.FunctionError) {
  console.log(`FUNCTION ERROR: ${payload}`);
  process.exit(1);
}
const result = JSON.parse(payload) as DispatchResult;
for (const r of result.rejected) console.log(`REJECTED ${r.id}: ${r.errors.join('; ')}`);

// Each run's line lands in the dispatcher's log group, tagged with its deployment.
const lines = new Map<string, Record<string, unknown>>();
for (let k = 0; k < 12 && lines.size < result.due.length; k++) {
  await sleep(5_000);
  let nextToken: string | undefined;
  do {
    const r = await logs.send(new FilterLogEventsCommand({ logGroupName: `/aws/lambda/${DISPATCHER}`, startTime, filterPattern: '{ $.dryRun IS TRUE }', nextToken }));
    for (const e of r.events ?? []) {
      const m = e.message ?? '';
      const line = JSON.parse(m.slice(m.indexOf('{')));
      if (typeof line.deployment === 'string') lines.set(line.deployment, line);
    }
    nextToken = r.nextToken;
  } while (nextToken);
}

let failed = result.rejected.length;
for (const o of result.outcomes) {
  const p = lines.get(o.id);
  console.log(`\n=== ${o.id}: ${o.error ? `ERROR ${o.error}` : o.action}`);
  if (!p) {
    console.log('  (log line not found in CloudWatch yet)');
    failed++;
    continue;
  }
  console.log(JSON.stringify({ level: p.level, action: p.action, why: p.why, bar: p.bar, signal: p.signal, indicators: p.indicators, wouldPlace: p.wouldPlace, data: p.data, error: p.error }, null, 2));
  if (p.level === 'error') failed++;
}
process.exit(failed ? 1 : 0);
