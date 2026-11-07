// The whole paper-trading system: shared state table, shared Tradier secret
// (referenced, not owned), one scheduler role, and per deployment a Lambda,
// its log group, its schedule and an errors alarm. Plus the dashboard.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { INTERVALS, functionName, type ResolvedDeployment } from '../runtime/config';
import { METRIC_DIMENSION, METRIC_NAMESPACE } from '../runtime/metrics';
import { buildDashboard, type DeployedStrategy } from './dashboard';

const here = path.dirname(fileURLToPath(import.meta.url));
const TRADING_DIR = path.join(here, '..');
const REPO_ROOT = path.join(TRADING_DIR, '..');

export interface TradingStackProps extends StackProps {
  deployments: ResolvedDeployment[];
  tradierSecretName: string;
}

/** Every bar close on weekdays, 04:00-20:59 ET: pre-market, regular and after-hours. */
export function scheduleExpression(d: ResolvedDeployment): string {
  const minutes = INTERVALS[d.interval];
  // Hourly bars close on the hour; the minute field only takes steps under 60.
  return minutes >= 60 ? 'cron(0 4-20 ? * MON-FRI *)' : `cron(0/${minutes} 4-20 ? * MON-FRI *)`;
}

export class TradingStack extends Stack {
  constructor(scope: Construct, id: string, props: TradingStackProps) {
    super(scope, id, props);

    const table = new dynamodb.TableV2(this, 'State', {
      tableName: 'tradier-trading-state',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // Positions and P&L history: keep it even if the stack is destroyed.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const secret = secretsmanager.Secret.fromSecretNameV2(this, 'TradierSecret', props.tradierSecretName);

    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': this.account } },
      }),
      description: 'Lets EventBridge Scheduler invoke the Tradier strategy Lambdas',
    });

    const deployed: DeployedStrategy[] = [];
    for (const d of props.deployments) {
      const name = functionName(d);
      const logGroup = new logs.LogGroup(this, `Logs-${d.id}`, {
        logGroupName: `/aws/lambda/${name}`,
        retention: logs.RetentionDays.THREE_MONTHS,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const fn = new NodejsFunction(this, `Fn-${d.id}`, {
        functionName: name,
        description: `Tradier sandbox paper trader: ${d.strategyId} on ${d.symbol} ${d.interval}`,
        entry: path.join(TRADING_DIR, 'runtime', 'handler.ts'),
        handler: 'handler',
        projectRoot: REPO_ROOT,
        depsLockFilePath: path.join(TRADING_DIR, 'package-lock.json'),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(60),
        // One run at a time per deployment; never two handling the same bar.
        reservedConcurrentExecutions: 1,
        // A failed run is not retried: the next bar is the next chance.
        retryAttempts: 0,
        maxEventAge: Duration.seconds(120),
        logGroup,
        environment: {
          TABLE_NAME: table.tableName,
          SECRET_ID: props.tradierSecretName,
          DEPLOYMENT: JSON.stringify(d),
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          format: OutputFormat.ESM,
          target: 'node22',
          sourceMap: true,
          minify: false,
          // The runtime ships the AWS SDK v3.
          externalModules: ['@aws-sdk/*'],
          mainFields: ['module', 'main'],
        },
      });
      table.grant(fn, 'dynamodb:GetItem', 'dynamodb:PutItem');
      secret.grantRead(fn);
      fn.grantInvoke(schedulerRole);

      const schedule = new scheduler.CfnSchedule(this, `Schedule-${d.id}`, {
        name,
        description: `Every ${d.interval} bar close, weekdays 04:00-20:59 ET`,
        scheduleExpression: scheduleExpression(d),
        scheduleExpressionTimezone: 'America/New_York',
        flexibleTimeWindow: { mode: 'OFF' },
        state: d.enabled ? 'ENABLED' : 'DISABLED',
        target: {
          arn: fn.functionArn,
          roleArn: schedulerRole.roleArn,
          input: '{}',
          retryPolicy: { maximumRetryAttempts: 1, maximumEventAgeInSeconds: 120 },
        },
      });

      const errorsAlarm = new cloudwatch.Alarm(this, `ErrorsAlarm-${d.id}`, {
        alarmName: `${name}-errors`,
        alarmDescription: `${d.id} threw on a run (see its log group)`,
        metric: new cloudwatch.Metric({
          namespace: METRIC_NAMESPACE,
          metricName: 'Errors',
          dimensionsMap: { [METRIC_DIMENSION]: d.id },
          statistic: 'Sum',
          period: Duration.minutes(INTERVALS[d.interval]),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      deployed.push({ deployment: d, fn, logGroup, errorsAlarm });
      new CfnOutput(this, `Function-${d.id}`, { value: fn.functionArn });
      new CfnOutput(this, `ScheduleArn-${d.id}`, { value: schedule.attrArn });
    }

    const dashboard = buildDashboard(this, deployed);
    new CfnOutput(this, 'StateTable', { value: table.tableArn });
    new CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards/dashboard/${dashboard.dashboardName}`,
    });
  }
}
