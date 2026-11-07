// Deletes everything deploy.mjs created, after printing it and asking.
//
//   node teardown.mjs [--account 123456789012] [--region us-east-1] [--yes]
//
// The secret is scheduled for deletion with the standard 30-day recovery
// window, not force-deleted. The function's log group (/aws/lambda/<name>) is
// created by Lambda, not by deploy.mjs, so it is left alone; pass
// --delete-logs to remove it too.

import {
  IAMClient, GetRoleCommand, ListAttachedRolePoliciesCommand, DetachRolePolicyCommand, ListRolePoliciesCommand,
  DeleteRolePolicyCommand, DeleteRoleCommand,
} from '@aws-sdk/client-iam';
import { DynamoDBClient, DescribeTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, DescribeSecretCommand, DeleteSecretCommand } from '@aws-sdk/client-secrets-manager';
import { LambdaClient, GetFunctionCommand, DeleteFunctionCommand } from '@aws-sdk/client-lambda';
import { SchedulerClient, GetScheduleCommand, DeleteScheduleCommand } from '@aws-sdk/client-scheduler';
import { CloudWatchLogsClient, DeleteLogGroupCommand, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { NAMES, confirmTarget, isNotFound, whoAmI } from './common.mjs';

const exists = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
};

async function main() {
  const deleteLogs = process.argv.includes('--delete-logs');
  const { region } = await whoAmI();
  const iam = new IAMClient({ region });
  const ddb = new DynamoDBClient({ region });
  const sm = new SecretsManagerClient({ region });
  const lambda = new LambdaClient({ region });
  const scheduler = new SchedulerClient({ region });
  const logs = new CloudWatchLogsClient({ region });

  const schedule = await exists(() => scheduler.send(new GetScheduleCommand({ Name: NAMES.schedule, GroupName: 'default' })));
  const fn = await exists(() => lambda.send(new GetFunctionCommand({ FunctionName: NAMES.fn })));
  const schedRole = await exists(() => iam.send(new GetRoleCommand({ RoleName: NAMES.schedulerRole })));
  const role = await exists(() => iam.send(new GetRoleCommand({ RoleName: NAMES.role })));
  const table = await exists(() => ddb.send(new DescribeTableCommand({ TableName: NAMES.table })));
  const secret = await exists(() => sm.send(new DescribeSecretCommand({ SecretId: NAMES.secret })));
  const logGroup = deleteLogs
    ? (await logs.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: NAMES.logGroup }))).logGroups?.find((g) => g.logGroupName === NAMES.logGroup)
    : null;

  const plan = [
    schedule && `schedule        ${schedule.Arn}`,
    fn && `function        ${fn.Configuration.FunctionArn}`,
    schedRole && `role            ${schedRole.Role.Arn} (and its inline policy)`,
    role && `role            ${role.Role.Arn} (and its attached/inline policies)`,
    table && `table           ${table.Table.TableArn} (ALL position/P&L state is lost)`,
    secret && !secret.DeletedDate && `secret          ${secret.ARN} (scheduled for deletion, 30-day recovery window)`,
    logGroup && `log group       ${logGroup.arn}`,
  ].filter(Boolean);

  if (plan.length === 0) {
    console.log('Nothing to delete.');
    return;
  }
  console.log('Will delete:\n  ' + plan.join('\n  ') + '\n');
  console.log('Open positions in the Tradier sandbox account are NOT closed by this. Flatten them first if you want to.\n');
  await confirmTarget('Delete all of the above');

  if (schedule) {
    await scheduler.send(new DeleteScheduleCommand({ Name: NAMES.schedule, GroupName: 'default' }));
    console.log(`deleted schedule ${NAMES.schedule}`);
  }
  if (fn) {
    await lambda.send(new DeleteFunctionCommand({ FunctionName: NAMES.fn }));
    console.log(`deleted function ${NAMES.fn}`);
  }
  for (const r of [schedRole && NAMES.schedulerRole, role && NAMES.role].filter(Boolean)) {
    for (const p of (await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: r }))).AttachedPolicies ?? []) {
      await iam.send(new DetachRolePolicyCommand({ RoleName: r, PolicyArn: p.PolicyArn }));
    }
    for (const name of (await iam.send(new ListRolePoliciesCommand({ RoleName: r }))).PolicyNames ?? []) {
      await iam.send(new DeleteRolePolicyCommand({ RoleName: r, PolicyName: name }));
    }
    await iam.send(new DeleteRoleCommand({ RoleName: r }));
    console.log(`deleted role ${r}`);
  }
  if (table) {
    await ddb.send(new DeleteTableCommand({ TableName: NAMES.table }));
    console.log(`deleted table ${NAMES.table}`);
  }
  if (secret && !secret.DeletedDate) {
    const r = await sm.send(new DeleteSecretCommand({ SecretId: NAMES.secret, RecoveryWindowInDays: 30 }));
    console.log(`scheduled secret ${NAMES.secret} for deletion on ${r.DeletionDate?.toISOString?.() ?? r.DeletionDate}`);
  }
  if (logGroup) {
    await logs.send(new DeleteLogGroupCommand({ logGroupName: NAMES.logGroup }));
    console.log(`deleted log group ${NAMES.logGroup}`);
  }
  console.log('Teardown complete.');
}

main().catch((err) => {
  console.error(`\nTeardown failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
