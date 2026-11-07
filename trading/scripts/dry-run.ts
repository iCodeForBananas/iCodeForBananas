// Invokes every deployment's Lambda with { "dryRun": true } and prints the
// JSON line it logged. Places no orders, writes no state, publishes no metrics.
//
//   cd trading && npm run dry-run [-- [--latest] <deployment-id> ...]
//
// --latest evaluates the newest bar even when it's stale, so a strategy's
// signal can be checked outside market hours.

import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { DEPLOYMENTS } from '../deployments';
import { functionName, resolveDeployment } from '../runtime/config';

const latest = process.argv.includes('--latest');
const only = process.argv.slice(2).filter((a) => a !== '--latest');
const lambda = new LambdaClient({});
const logs = new CloudWatchLogsClient({});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
for (const d of DEPLOYMENTS.map(resolveDeployment).filter((x) => only.length === 0 || only.includes(x.id))) {
  const name = functionName(d);
  const startTime = Date.now() - 5_000;
  const res = await lambda.send(new InvokeCommand({ FunctionName: name, Payload: Buffer.from(JSON.stringify({ dryRun: true, evaluateLatest: latest })) }));
  const payload = res.Payload ? Buffer.from(res.Payload).toString() : '';
  const requestId = res.$metadata.requestId;
  console.log(`\n=== ${d.id} (${name}) ${res.FunctionError ? `FUNCTION ERROR: ${payload}` : payload}`);
  if (res.FunctionError) failed++;

  let line: string | undefined;
  for (let k = 0; k < 12 && !line; k++) {
    await sleep(5_000);
    const ev = await logs.send(new FilterLogEventsCommand({ logGroupName: `/aws/lambda/${name}`, startTime, filterPattern: `"${requestId}"` }));
    const all = await logs.send(new FilterLogEventsCommand({ logGroupName: `/aws/lambda/${name}`, startTime, filterPattern: '{ $.dryRun IS TRUE }' }));
    const candidates = [...(ev.events ?? []), ...(all.events ?? [])].map((e) => e.message ?? '');
    line = candidates.map((m) => m.slice(m.indexOf('{'))).find((m) => m.startsWith('{') && m.includes('"deployment"'));
  }
  if (!line) {
    console.log('  (log line not found in CloudWatch yet)');
    failed++;
    continue;
  }
  const parsed = JSON.parse(line);
  console.log(JSON.stringify({ level: parsed.level, action: parsed.action, why: parsed.why, bar: parsed.bar, signal: parsed.signal, indicators: parsed.indicators, wouldPlace: parsed.wouldPlace, accountEquity: parsed.accountEquity, data: parsed.data, error: parsed.error }, null, 2));
  if (parsed.level === 'error') failed++;
}
process.exit(failed ? 1 : 0);
