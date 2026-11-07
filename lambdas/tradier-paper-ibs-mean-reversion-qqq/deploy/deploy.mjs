// Idempotent deploy of the IBS Mean Reversion QQQ paper-trading Lambda.
// Creates each resource if missing, updates it to match if it exists; a second
// run changes nothing.
//
//   node deploy.mjs [--account 123456789012] [--region us-east-1] [--yes]
//
// Credentials and region come from the SDK's default provider chain. The
// Tradier sandbox token and account id are read from TRADIER_SANDBOX_TOKEN and
// TRADIER_SANDBOX_ACCOUNT_ID and never printed.

import {
  IAMClient, GetRoleCommand, CreateRoleCommand, UpdateAssumeRolePolicyCommand, TagRoleCommand,
  AttachRolePolicyCommand, ListAttachedRolePoliciesCommand, GetRolePolicyCommand, PutRolePolicyCommand,
  waitUntilRoleExists,
} from '@aws-sdk/client-iam';
import {
  DynamoDBClient, DescribeTableCommand, CreateTableCommand, UpdateTableCommand, TagResourceCommand as DdbTagResourceCommand,
  DescribeContinuousBackupsCommand, UpdateContinuousBackupsCommand, waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import {
  SecretsManagerClient, DescribeSecretCommand, CreateSecretCommand, PutSecretValueCommand, GetSecretValueCommand,
  RestoreSecretCommand, TagResourceCommand as SmTagResourceCommand,
} from '@aws-sdk/client-secrets-manager';
import {
  LambdaClient, GetFunctionCommand, CreateFunctionCommand, UpdateFunctionConfigurationCommand, UpdateFunctionCodeCommand,
  GetFunctionConcurrencyCommand, PutFunctionConcurrencyCommand, TagResourceCommand as LambdaTagResourceCommand,
  GetFunctionEventInvokeConfigCommand, PutFunctionEventInvokeConfigCommand,
  waitUntilFunctionActiveV2, waitUntilFunctionUpdatedV2,
} from '@aws-sdk/client-lambda';
import {
  SchedulerClient, GetScheduleCommand, CreateScheduleCommand, UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import {
  NAMES, TAGS, SYMBOL, BASIC_EXECUTION_POLICY_ARN, SCHEDULE_EXPRESSION, SCHEDULE_TIMEZONE,
  confirmTarget, buildLambdaZip, isNotFound, sleep, tagList,
} from './common.mjs';

const changes = [];
const note = (resource, what) => {
  changes.push(`${resource}: ${what}`);
  console.log(`  ${what}`);
};
const canon = (doc) => JSON.stringify(sortKeys(typeof doc === 'string' ? JSON.parse(decodeURIComponent(doc)) : doc));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

async function retryOn(fn, matches, { attempts = 12, delayMs = 5000, label }) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts || !matches(err)) throw err;
      console.log(`  waiting for ${label} (${err.name}: ${err.message.slice(0, 120)}), retry ${i}/${attempts - 1}`);
      await sleep(delayMs);
    }
  }
}

// ---------------------------------------------------------------------------
// IAM roles
// ---------------------------------------------------------------------------
async function ensureRole(iam, { name, trust, description, managedPolicies = [], inlineName, inlinePolicy }) {
  let role;
  let created = false;
  try {
    role = (await iam.send(new GetRoleCommand({ RoleName: name }))).Role;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (!role) {
    role = (await iam.send(new CreateRoleCommand({
      RoleName: name,
      AssumeRolePolicyDocument: JSON.stringify(trust),
      Description: description,
      Tags: tagList(),
    }))).Role;
    created = true;
    note(name, 'created role');
    await waitUntilRoleExists({ client: iam, maxWaitTime: 60 }, { RoleName: name });
  } else {
    if (canon(role.AssumeRolePolicyDocument) !== canon(trust)) {
      await iam.send(new UpdateAssumeRolePolicyCommand({ RoleName: name, PolicyDocument: JSON.stringify(trust) }));
      note(name, 'updated trust policy');
    }
    const have = Object.fromEntries((role.Tags ?? []).map((t) => [t.Key, t.Value]));
    if (Object.entries(TAGS).some(([k, v]) => have[k] !== v)) {
      await iam.send(new TagRoleCommand({ RoleName: name, Tags: tagList() }));
      note(name, 'updated tags');
    }
  }

  const attached = (await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: name }))).AttachedPolicies ?? [];
  for (const arn of managedPolicies) {
    if (!attached.some((p) => p.PolicyArn === arn)) {
      await iam.send(new AttachRolePolicyCommand({ RoleName: name, PolicyArn: arn }));
      note(name, `attached ${arn}`);
    }
  }

  let current;
  try {
    current = (await iam.send(new GetRolePolicyCommand({ RoleName: name, PolicyName: inlineName }))).PolicyDocument;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (!current || canon(current) !== canon(inlinePolicy)) {
    await iam.send(new PutRolePolicyCommand({ RoleName: name, PolicyName: inlineName, PolicyDocument: JSON.stringify(inlinePolicy) }));
    note(name, `${current ? 'updated' : 'put'} inline policy ${inlineName}`);
  }
  console.log(`  ARN ${role.Arn}`);
  return { arn: role.Arn, created };
}

// ---------------------------------------------------------------------------
// DynamoDB
// ---------------------------------------------------------------------------
async function ensureTable(ddb) {
  let table;
  try {
    table = (await ddb.send(new DescribeTableCommand({ TableName: NAMES.table }))).Table;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (!table) {
    await ddb.send(new CreateTableCommand({
      TableName: NAMES.table,
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      Tags: tagList(),
    }));
    note(NAMES.table, 'created table');
    await waitUntilTableExists({ client: ddb, maxWaitTime: 120 }, { TableName: NAMES.table });
    table = (await ddb.send(new DescribeTableCommand({ TableName: NAMES.table }))).Table;
  } else {
    const keyOk = table.KeySchema?.length === 1 && table.KeySchema[0].AttributeName === 'pk' && table.KeySchema[0].KeyType === 'HASH';
    if (!keyOk) throw new Error(`Table ${NAMES.table} exists with a different key schema; fix by hand, not touching it`);
    if (table.BillingModeSummary?.BillingMode !== 'PAY_PER_REQUEST') {
      await ddb.send(new UpdateTableCommand({ TableName: NAMES.table, BillingMode: 'PAY_PER_REQUEST' }));
      note(NAMES.table, 'switched to on-demand billing');
      await waitUntilTableExists({ client: ddb, maxWaitTime: 300 }, { TableName: NAMES.table });
    }
    await ddb.send(new DdbTagResourceCommand({ ResourceArn: table.TableArn, Tags: tagList() }));
  }

  const backups = await ddb.send(new DescribeContinuousBackupsCommand({ TableName: NAMES.table }));
  if (backups.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus !== 'ENABLED') {
    await retryOn(
      () => ddb.send(new UpdateContinuousBackupsCommand({ TableName: NAMES.table, PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } })),
      (e) => e.name === 'ContinuousBackupsUnavailableException',
      { label: 'continuous backups to become available', attempts: 12, delayMs: 5000 },
    );
    note(NAMES.table, 'enabled point-in-time recovery');
  }
  console.log(`  ARN ${table.TableArn}`);
  return table.TableArn;
}

// ---------------------------------------------------------------------------
// Secrets Manager
// ---------------------------------------------------------------------------
async function ensureSecret(sm) {
  const token = process.env.TRADIER_SANDBOX_TOKEN;
  const accountId = process.env.TRADIER_SANDBOX_ACCOUNT_ID;
  const fromEnv = Boolean(token && accountId);
  const placeholder = { accessToken: 'REPLACE_WITH_TRADIER_SANDBOX_TOKEN', accountId: 'REPLACE_WITH_TRADIER_SANDBOX_ACCOUNT_ID' };
  const desired = fromEnv ? { accessToken: token, accountId } : placeholder;

  let desc;
  try {
    desc = await sm.send(new DescribeSecretCommand({ SecretId: NAMES.secret }));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  let usingPlaceholder = !fromEnv;
  if (!desc) {
    const r = await sm.send(new CreateSecretCommand({
      Name: NAMES.secret,
      Description: 'Tradier SANDBOX (paper) access token and account id for the IBS Mean Reversion QQQ Lambda',
      SecretString: JSON.stringify(desired),
      Tags: tagList(),
    }));
    note(NAMES.secret, `created secret (${fromEnv ? 'values from environment' : 'placeholder values'})`);
    desc = { ARN: r.ARN };
  } else {
    if (desc.DeletedDate) {
      await sm.send(new RestoreSecretCommand({ SecretId: NAMES.secret }));
      note(NAMES.secret, 'restored secret that was scheduled for deletion');
    }
    if (fromEnv) {
      const current = await sm.send(new GetSecretValueCommand({ SecretId: NAMES.secret }));
      let same = false;
      try {
        const v = JSON.parse(current.SecretString ?? '{}');
        same = v.accessToken === desired.accessToken && v.accountId === desired.accountId;
      } catch { /* not JSON: replace it */ }
      if (!same) {
        await sm.send(new PutSecretValueCommand({ SecretId: NAMES.secret, SecretString: JSON.stringify(desired) }));
        note(NAMES.secret, 'updated secret value from environment (value not shown)');
      }
    } else {
      const current = await sm.send(new GetSecretValueCommand({ SecretId: NAMES.secret }));
      try {
        const v = JSON.parse(current.SecretString ?? '{}');
        usingPlaceholder = v.accessToken === placeholder.accessToken || v.accountId === placeholder.accountId;
      } catch { usingPlaceholder = true; }
    }
    await sm.send(new SmTagResourceCommand({ SecretId: NAMES.secret, Tags: tagList() }));
  }
  console.log(`  ARN ${desc.ARN}`);
  return { arn: desc.ARN, usingPlaceholder };
}

// ---------------------------------------------------------------------------
// Lambda
// ---------------------------------------------------------------------------
async function ensureFunction(lambda, { roleArn, tableName, secretArn }) {
  const { zip, sha256, files } = buildLambdaZip();
  console.log(`  package: ${files.join(', ')} (${zip.length} bytes, sha256 ${sha256})`);
  const env = {
    TABLE_NAME: tableName,
    SECRET_ID: secretArn,
    SYMBOL,
    MAX_DAILY_LOSS_PCT: process.env.MAX_DAILY_LOSS_PCT ?? '2',
  };
  const desired = { Runtime: 'nodejs22.x', Handler: 'index.handler', Timeout: 60, MemorySize: 256, Role: roleArn };

  let fn;
  try {
    fn = await lambda.send(new GetFunctionCommand({ FunctionName: NAMES.fn }));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  if (!fn) {
    await retryOn(
      () => lambda.send(new CreateFunctionCommand({
        FunctionName: NAMES.fn,
        ...desired,
        Code: { ZipFile: zip },
        Architectures: ['arm64'],
        Description: 'Paper-trades IBS Mean Reversion on QQQ 15m bars via the Tradier SANDBOX API',
        Environment: { Variables: env },
        Tags: TAGS,
      })),
      (e) => e.name === 'InvalidParameterValueException' && /role|assume/i.test(e.message),
      { label: 'the new role to propagate', attempts: 15, delayMs: 4000 },
    );
    note(NAMES.fn, 'created function');
    await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: 180 }, { FunctionName: NAMES.fn });
  } else {
    const c = fn.Configuration;
    const envNow = c.Environment?.Variables ?? {};
    const configDiffers =
      c.Runtime !== desired.Runtime || c.Handler !== desired.Handler || c.Timeout !== desired.Timeout ||
      c.MemorySize !== desired.MemorySize || c.Role !== desired.Role ||
      canon(envNow) !== canon(env);
    if (configDiffers) {
      await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 180 }, { FunctionName: NAMES.fn });
      await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: NAMES.fn, ...desired, Environment: { Variables: env } }));
      note(NAMES.fn, 'updated configuration');
      await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 180 }, { FunctionName: NAMES.fn });
    }
    if (c.CodeSha256 !== sha256) {
      await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 180 }, { FunctionName: NAMES.fn });
      await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: NAMES.fn, ZipFile: zip, Architectures: c.Architectures ?? ['arm64'] }));
      note(NAMES.fn, 'updated code');
      await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 180 }, { FunctionName: NAMES.fn });
    }
    const tagsNow = fn.Tags ?? {};
    if (Object.entries(TAGS).some(([k, v]) => tagsNow[k] !== v)) {
      await lambda.send(new LambdaTagResourceCommand({ Resource: c.FunctionArn, Tags: TAGS }));
      note(NAMES.fn, 'updated tags');
    }
  }

  const conc = await lambda.send(new GetFunctionConcurrencyCommand({ FunctionName: NAMES.fn }));
  if (conc.ReservedConcurrentExecutions !== 1) {
    await lambda.send(new PutFunctionConcurrencyCommand({ FunctionName: NAMES.fn, ReservedConcurrentExecutions: 1 }));
    note(NAMES.fn, 'set reserved concurrency to 1');
  }

  // Async invocations (the scheduler's) are not retried by Lambda on a
  // function error, and are dropped if they can't start within 2 minutes:
  // a bar's decision is worthless that late. The scheduler's own retry policy
  // covers a failed delivery.
  let eic;
  try {
    eic = await lambda.send(new GetFunctionEventInvokeConfigCommand({ FunctionName: NAMES.fn }));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (!eic || eic.MaximumRetryAttempts !== 0 || eic.MaximumEventAgeInSeconds !== 120) {
    await lambda.send(new PutFunctionEventInvokeConfigCommand({ FunctionName: NAMES.fn, MaximumRetryAttempts: 0, MaximumEventAgeInSeconds: 120 }));
    note(NAMES.fn, 'set async retries to 0 and max event age to 120s');
  }

  const final = await lambda.send(new GetFunctionCommand({ FunctionName: NAMES.fn }));
  console.log(`  ARN ${final.Configuration.FunctionArn}`);
  return final.Configuration.FunctionArn;
}

// ---------------------------------------------------------------------------
// EventBridge Scheduler
// ---------------------------------------------------------------------------
async function ensureSchedule(scheduler, { functionArn, roleArn }) {
  const desired = {
    Name: NAMES.schedule,
    GroupName: 'default',
    Description: 'Runs the IBS Mean Reversion QQQ paper trader after each 15m bar closes (04:15-20:00 ET, weekdays)',
    ScheduleExpression: SCHEDULE_EXPRESSION,
    ScheduleExpressionTimezone: SCHEDULE_TIMEZONE,
    FlexibleTimeWindow: { Mode: 'OFF' },
    State: 'ENABLED',
    Target: {
      Arn: functionArn,
      RoleArn: roleArn,
      Input: JSON.stringify({ source: 'schedule' }),
      RetryPolicy: { MaximumRetryAttempts: 1, MaximumEventAgeInSeconds: 120 },
    },
  };
  let current;
  try {
    current = await scheduler.send(new GetScheduleCommand({ Name: NAMES.schedule, GroupName: 'default' }));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  const roleNotReady = (e) => e.name === 'ValidationException' && /role|assume|permission/i.test(e.message);
  if (!current) {
    const r = await retryOn(() => scheduler.send(new CreateScheduleCommand(desired)), roleNotReady, { label: 'the scheduler role to propagate', attempts: 15, delayMs: 4000 });
    note(NAMES.schedule, 'created schedule');
    console.log(`  ARN ${r.ScheduleArn}`);
    return r.ScheduleArn;
  }
  const same =
    current.ScheduleExpression === desired.ScheduleExpression &&
    current.ScheduleExpressionTimezone === desired.ScheduleExpressionTimezone &&
    current.State === desired.State &&
    current.Description === desired.Description &&
    current.FlexibleTimeWindow?.Mode === 'OFF' &&
    current.Target?.Arn === desired.Target.Arn &&
    current.Target?.RoleArn === desired.Target.RoleArn &&
    current.Target?.Input === desired.Target.Input &&
    current.Target?.RetryPolicy?.MaximumRetryAttempts === 1 &&
    current.Target?.RetryPolicy?.MaximumEventAgeInSeconds === 120;
  if (!same) {
    await retryOn(() => scheduler.send(new UpdateScheduleCommand(desired)), roleNotReady, { label: 'the scheduler role to propagate', attempts: 15, delayMs: 4000 });
    note(NAMES.schedule, 'updated schedule');
  }
  console.log(`  ARN ${current.Arn}`);
  return current.Arn;
}

// ---------------------------------------------------------------------------
async function main() {
  const me = await confirmTarget('Deploy');
  const region = me.region;
  const iam = new IAMClient({ region });
  const ddb = new DynamoDBClient({ region });
  const sm = new SecretsManagerClient({ region });
  const lambda = new LambdaClient({ region });
  const scheduler = new SchedulerClient({ region });

  console.log(`\nDynamoDB table ${NAMES.table}`);
  const tableArn = await ensureTable(ddb);

  console.log(`\nSecret ${NAMES.secret}`);
  const secret = await ensureSecret(sm);

  console.log(`\nExecution role ${NAMES.role}`);
  const role = await ensureRole(iam, {
    name: NAMES.role,
    description: 'Execution role for the IBS Mean Reversion QQQ paper-trading Lambda',
    trust: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
    },
    managedPolicies: [BASIC_EXECUTION_POLICY_ARN],
    inlineName: NAMES.rolePolicy,
    inlinePolicy: {
      Version: '2012-10-17',
      Statement: [
        { Sid: 'StateTable', Effect: 'Allow', Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'], Resource: tableArn },
        { Sid: 'TradierSandboxSecret', Effect: 'Allow', Action: 'secretsmanager:GetSecretValue', Resource: secret.arn },
      ],
    },
  });
  if (role.created) {
    // IAM is eventually consistent; CreateFunction also retries if Lambda
    // can't assume the role yet.
    console.log('  waiting 10s for the new role to propagate');
    await sleep(10_000);
  }

  console.log(`\nLambda function ${NAMES.fn}`);
  const functionArn = await ensureFunction(lambda, { roleArn: role.arn, tableName: NAMES.table, secretArn: secret.arn });

  console.log(`\nScheduler role ${NAMES.schedulerRole}`);
  const schedRole = await ensureRole(iam, {
    name: NAMES.schedulerRole,
    description: 'Lets EventBridge Scheduler invoke the IBS Mean Reversion QQQ paper-trading Lambda',
    trust: {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Service: 'scheduler.amazonaws.com' },
        Action: 'sts:AssumeRole',
        Condition: { StringEquals: { 'aws:SourceAccount': me.account } },
      }],
    },
    inlineName: NAMES.schedulerPolicy,
    inlinePolicy: {
      Version: '2012-10-17',
      Statement: [{ Sid: 'InvokeTrader', Effect: 'Allow', Action: 'lambda:InvokeFunction', Resource: functionArn }],
    },
  });
  if (schedRole.created) await sleep(10_000);

  console.log(`\nSchedule ${NAMES.schedule}`);
  await ensureSchedule(scheduler, { functionArn, roleArn: schedRole.arn });

  console.log(`\n${changes.length ? `${changes.length} change(s):\n  ${changes.join('\n  ')}` : 'No changes: everything already matches.'}`);
  if (secret.usingPlaceholder) {
    console.log(`
The secret holds PLACEHOLDER values; the function can't reach Tradier until it
has real ones. Set them on this machine and run deploy again (values are never
printed):

  PowerShell:  $env:TRADIER_SANDBOX_TOKEN = '<sandbox token>'; $env:TRADIER_SANDBOX_ACCOUNT_ID = '<VA... account id>'; node deploy.mjs
  bash:        TRADIER_SANDBOX_TOKEN='<sandbox token>' TRADIER_SANDBOX_ACCOUNT_ID='<VA... account id>' node deploy.mjs`);
  }
}

main().catch((err) => {
  console.error(`\nDeploy failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
