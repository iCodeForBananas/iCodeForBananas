// Verifies every deployed resource with read calls (not the deploy output),
// then invokes the function once with { "dryRun": true } and reads its JSON
// log line back from CloudWatch Logs.
//
//   node verify.mjs [--account 123456789012] [--region us-east-1] [--no-invoke]

import { IAMClient, GetRoleCommand, ListAttachedRolePoliciesCommand, ListRolePoliciesCommand, GetRolePolicyCommand } from '@aws-sdk/client-iam';
import { DynamoDBClient, DescribeTableCommand, DescribeContinuousBackupsCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, DescribeSecretCommand } from '@aws-sdk/client-secrets-manager';
import { LambdaClient, GetFunctionConfigurationCommand, GetFunctionConcurrencyCommand, GetFunctionEventInvokeConfigCommand, InvokeCommand } from '@aws-sdk/client-lambda';
import { SchedulerClient, GetScheduleCommand } from '@aws-sdk/client-scheduler';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { NAMES, TAGS, SYMBOL, BASIC_EXECUTION_POLICY_ARN, SCHEDULE_EXPRESSION, SCHEDULE_TIMEZONE, whoAmI, parseArgs, sleep } from './common.mjs';

const rows = [];
const check = (resource, arn, label, ok, detail = '') => {
  rows.push({ resource, arn, label, ok });
  console.log(`  [${ok ? 'ok' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
};
const doc = (s) => JSON.parse(decodeURIComponent(s));
const asList = (x) => (Array.isArray(x) ? x : [x]);

async function main() {
  const args = parseArgs();
  const noInvoke = process.argv.includes('--no-invoke');
  const me = await whoAmI();
  console.log(`Account ${me.account}, principal ${me.arn}, region ${me.region}`);
  if (args.account && args.account !== me.account) throw new Error(`Expected account ${args.account}, got ${me.account}`);
  if (args.region && args.region !== me.region) throw new Error(`Expected region ${args.region}, got ${me.region}`);
  const region = me.region;
  const iam = new IAMClient({ region });
  const ddb = new DynamoDBClient({ region });
  const sm = new SecretsManagerClient({ region });
  const lambda = new LambdaClient({ region });
  const scheduler = new SchedulerClient({ region });
  const logs = new CloudWatchLogsClient({ region });

  // DynamoDB
  console.log(`\n${NAMES.table}`);
  const t = (await ddb.send(new DescribeTableCommand({ TableName: NAMES.table }))).Table;
  check(NAMES.table, t.TableArn, 'status ACTIVE', t.TableStatus === 'ACTIVE', t.TableStatus);
  check(NAMES.table, t.TableArn, 'key schema pk (S, HASH)', t.KeySchema.length === 1 && t.KeySchema[0].AttributeName === 'pk' && t.KeySchema[0].KeyType === 'HASH' && t.AttributeDefinitions.find((a) => a.AttributeName === 'pk')?.AttributeType === 'S');
  check(NAMES.table, t.TableArn, 'on-demand billing', t.BillingModeSummary?.BillingMode === 'PAY_PER_REQUEST', t.BillingModeSummary?.BillingMode);
  const pitr = await ddb.send(new DescribeContinuousBackupsCommand({ TableName: NAMES.table }));
  check(NAMES.table, t.TableArn, 'point-in-time recovery enabled', pitr.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus === 'ENABLED');

  // Secret (described only; the value is never read here)
  console.log(`\n${NAMES.secret}`);
  const s = await sm.send(new DescribeSecretCommand({ SecretId: NAMES.secret }));
  check(NAMES.secret, s.ARN, 'exists and is not scheduled for deletion', !s.DeletedDate);
  const sTags = Object.fromEntries((s.Tags ?? []).map((x) => [x.Key, x.Value]));
  check(NAMES.secret, s.ARN, 'tagged', Object.entries(TAGS).every(([k, v]) => sTags[k] === v));

  // Execution role
  console.log(`\n${NAMES.role}`);
  const r = (await iam.send(new GetRoleCommand({ RoleName: NAMES.role }))).Role;
  const trust = doc(r.AssumeRolePolicyDocument);
  check(NAMES.role, r.Arn, 'trusted by lambda.amazonaws.com only', trust.Statement.length === 1 && asList(trust.Statement[0].Principal.Service).join() === 'lambda.amazonaws.com');
  const attached = (await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: NAMES.role }))).AttachedPolicies.map((p) => p.PolicyArn);
  check(NAMES.role, r.Arn, 'managed policies = AWSLambdaBasicExecutionRole only', attached.length === 1 && attached[0] === BASIC_EXECUTION_POLICY_ARN, attached.join(', '));
  const inline = (await iam.send(new ListRolePoliciesCommand({ RoleName: NAMES.role }))).PolicyNames;
  check(NAMES.role, r.Arn, `inline policies = ${NAMES.rolePolicy} only`, inline.length === 1 && inline[0] === NAMES.rolePolicy, inline.join(', '));
  const pol = doc((await iam.send(new GetRolePolicyCommand({ RoleName: NAMES.role, PolicyName: NAMES.rolePolicy }))).PolicyDocument);
  const stmts = pol.Statement;
  const ddbStmt = stmts.find((x) => asList(x.Action).some((a) => a.startsWith('dynamodb:')));
  const smStmt = stmts.find((x) => asList(x.Action).some((a) => a.startsWith('secretsmanager:')));
  check(NAMES.role, r.Arn, 'exactly 2 Allow statements, no wildcards', stmts.length === 2 && stmts.every((x) => x.Effect === 'Allow' && !JSON.stringify(x).includes('*')));
  check(NAMES.role, r.Arn, 'dynamodb Get/Put/UpdateItem on this table only', ddbStmt && asList(ddbStmt.Action).sort().join() === 'dynamodb:GetItem,dynamodb:PutItem,dynamodb:UpdateItem' && asList(ddbStmt.Resource).join() === t.TableArn);
  check(NAMES.role, r.Arn, 'secretsmanager:GetSecretValue on this secret only', smStmt && asList(smStmt.Action).join() === 'secretsmanager:GetSecretValue' && asList(smStmt.Resource).join() === s.ARN);

  // Function
  console.log(`\n${NAMES.fn}`);
  const f = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: NAMES.fn }));
  const conc = await lambda.send(new GetFunctionConcurrencyCommand({ FunctionName: NAMES.fn }));
  const env = f.Environment?.Variables ?? {};
  check(NAMES.fn, f.FunctionArn, 'runtime nodejs22.x', f.Runtime === 'nodejs22.x', f.Runtime);
  check(NAMES.fn, f.FunctionArn, 'handler index.handler', f.Handler === 'index.handler');
  check(NAMES.fn, f.FunctionArn, 'timeout 60s', f.Timeout === 60);
  check(NAMES.fn, f.FunctionArn, 'memory 256 MB', f.MemorySize === 256);
  check(NAMES.fn, f.FunctionArn, 'reserved concurrency 1', conc.ReservedConcurrentExecutions === 1, String(conc.ReservedConcurrentExecutions));
  check(NAMES.fn, f.FunctionArn, 'role is the execution role', f.Role === r.Arn);
  check(NAMES.fn, f.FunctionArn, 'env TABLE_NAME, SECRET_ID, SYMBOL, MAX_DAILY_LOSS_PCT', env.TABLE_NAME === NAMES.table && env.SECRET_ID === s.ARN && env.SYMBOL === SYMBOL && Number(env.MAX_DAILY_LOSS_PCT) > 0, `MAX_DAILY_LOSS_PCT=${env.MAX_DAILY_LOSS_PCT}`);
  check(NAMES.fn, f.FunctionArn, 'no Tradier token or account id in env', !Object.keys(env).some((k) => /TOKEN|ACCOUNT/i.test(k)));
  check(NAMES.fn, f.FunctionArn, 'State Active', f.State === 'Active', f.State);
  check(NAMES.fn, f.FunctionArn, 'LastUpdateStatus Successful', f.LastUpdateStatus === 'Successful', f.LastUpdateStatus);
  const eic = await lambda.send(new GetFunctionEventInvokeConfigCommand({ FunctionName: NAMES.fn }));
  check(NAMES.fn, f.FunctionArn, 'async retries 0, max event age 120s', eic.MaximumRetryAttempts === 0 && eic.MaximumEventAgeInSeconds === 120);

  // Scheduler role
  console.log(`\n${NAMES.schedulerRole}`);
  const sr = (await iam.send(new GetRoleCommand({ RoleName: NAMES.schedulerRole }))).Role;
  const strust = doc(sr.AssumeRolePolicyDocument);
  check(NAMES.schedulerRole, sr.Arn, 'trusted by scheduler.amazonaws.com, this account only', strust.Statement.length === 1 && asList(strust.Statement[0].Principal.Service).join() === 'scheduler.amazonaws.com' && strust.Statement[0].Condition?.StringEquals?.['aws:SourceAccount'] === me.account);
  const sattached = (await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: NAMES.schedulerRole }))).AttachedPolicies;
  const sinline = (await iam.send(new ListRolePoliciesCommand({ RoleName: NAMES.schedulerRole }))).PolicyNames;
  check(NAMES.schedulerRole, sr.Arn, `no managed policies, inline = ${NAMES.schedulerPolicy} only`, sattached.length === 0 && sinline.length === 1 && sinline[0] === NAMES.schedulerPolicy);
  const spol = doc((await iam.send(new GetRolePolicyCommand({ RoleName: NAMES.schedulerRole, PolicyName: NAMES.schedulerPolicy }))).PolicyDocument);
  check(NAMES.schedulerRole, sr.Arn, 'lambda:InvokeFunction on this function only', spol.Statement.length === 1 && spol.Statement[0].Effect === 'Allow' && asList(spol.Statement[0].Action).join() === 'lambda:InvokeFunction' && asList(spol.Statement[0].Resource).join() === f.FunctionArn);

  // Schedule
  console.log(`\n${NAMES.schedule}`);
  const sc = await scheduler.send(new GetScheduleCommand({ Name: NAMES.schedule, GroupName: 'default' }));
  check(NAMES.schedule, sc.Arn, `expression ${SCHEDULE_EXPRESSION}`, sc.ScheduleExpression === SCHEDULE_EXPRESSION, sc.ScheduleExpression);
  check(NAMES.schedule, sc.Arn, `timezone ${SCHEDULE_TIMEZONE}`, sc.ScheduleExpressionTimezone === SCHEDULE_TIMEZONE);
  check(NAMES.schedule, sc.Arn, 'target is the function', sc.Target?.Arn === f.FunctionArn);
  check(NAMES.schedule, sc.Arn, 'role is the scheduler role', sc.Target?.RoleArn === sr.Arn);
  check(NAMES.schedule, sc.Arn, 'retry policy at most 1 retry', (sc.Target?.RetryPolicy?.MaximumRetryAttempts ?? 185) <= 1, String(sc.Target?.RetryPolicy?.MaximumRetryAttempts));
  check(NAMES.schedule, sc.Arn, 'ENABLED', sc.State === 'ENABLED', sc.State);

  // Dry-run invoke, then read the log line back from CloudWatch Logs.
  if (!noInvoke) {
    console.log(`\nDry-run invoke`);
    const started = Date.now();
    const inv = await lambda.send(new InvokeCommand({ FunctionName: NAMES.fn, InvocationType: 'RequestResponse', Payload: Buffer.from(JSON.stringify({ dryRun: true })) }));
    const payload = Buffer.from(inv.Payload ?? []).toString();
    const requestId = inv.$metadata.requestId;
    check(NAMES.fn, f.FunctionArn, 'dry-run invoke returned without a function error', !inv.FunctionError, inv.FunctionError ? payload.slice(0, 300) : payload);
    let line = null;
    for (let k = 0; k < 20 && !line; k++) {
      await sleep(3000);
      const ev = await logs.send(new FilterLogEventsCommand({ logGroupName: NAMES.logGroup, startTime: started - 5000, filterPattern: `"${requestId}"` }));
      for (const e of ev.events ?? []) {
        const i = e.message.indexOf('{');
        if (i < 0) continue;
        try {
          const j = JSON.parse(e.message.slice(i));
          if (j.app === NAMES.fn) line = j;
        } catch { /* not our JSON line */ }
      }
    }
    check(NAMES.fn, f.FunctionArn, 'JSON log line found in CloudWatch Logs', Boolean(line));
    if (line) {
      console.log(JSON.stringify(line, null, 2));
      check(NAMES.fn, f.FunctionArn, 'log line has no error', line.level !== 'error', line.error?.message ?? '');
      check(NAMES.fn, f.FunctionArn, 'log line is a dry run', line.dryRun === true);
      check(NAMES.fn, f.FunctionArn, 'log line shows the bar', Boolean(line.bar), line.bar ? `${line.bar.time} O${line.bar.open} H${line.bar.high} L${line.bar.low} C${line.bar.close}` : line.why);
      check(NAMES.fn, f.FunctionArn, 'log line shows indicators and signal', Boolean(line.indicators && line.signal), line.signal ? `${line.signal.action} ${line.signal.reason}` : line.why);
      check(NAMES.fn, f.FunctionArn, 'log line says what it did or would do', typeof line.action === 'string', `${line.action}: ${line.why}`);
    }
  }

  const failed = rows.filter((x) => !x.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} checks passed`);
  const byResource = new Map();
  for (const row of rows) {
    const prev = byResource.get(row.resource) ?? { arn: row.arn, ok: true };
    byResource.set(row.resource, { arn: prev.arn, ok: prev.ok && row.ok });
  }
  console.log('\n| Resource | ARN | Verified |\n|---|---|---|');
  for (const [name, v] of byResource) console.log(`| ${name} | ${v.arn} | ${v.ok ? 'yes' : 'no'} |`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(`\nVerify failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
