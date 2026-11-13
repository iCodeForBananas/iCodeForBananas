// The whole paper-trading system: shared state table, shared Tradier secret
// (referenced, not owned), one scheduler role, and per deployment a Lambda,
// its log group, its schedule and an errors alarm. Plus the dashboard.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { DATA_DELAY_MS, INTERVALS, functionName, type ResolvedDeployment } from '../runtime/config';
import { METRIC_DIMENSION, METRIC_NAMESPACE } from '../runtime/metrics';
import { buildDashboard, type DeployedStrategy } from './dashboard';

const here = path.dirname(fileURLToPath(import.meta.url));
const TRADING_DIR = path.join(here, '..');
const REPO_ROOT = path.join(TRADING_DIR, '..');

export interface TradingStackProps extends StackProps {
  deployments: ResolvedDeployment[];
  tradierSecretName: string;
  equityReporterSecretName: string;
}

/** 15 minutes after every regular-session bar close on weekdays (16:30 ET for daily bars). */
export function scheduleExpression(d: ResolvedDeployment): string {
  const minutes = INTERVALS[d.interval];
  // Daily: 16:30 ET, after the close. Sandbox data runs 15 minutes behind, so
  // the session's bar isn't final until after 16:15.
  if (minutes >= 1440) return 'cron(30 16 ? * MON-FRI *)';
  // Intraday bars are regular-session only, counted from 09:30 ET like the
  // backtest data, and sandbox data is 15 minutes behind (DATA_DELAY_MS), so
  // each run fires 15 minutes after a bar closes, from the first bar's close
  // through 16:15. Hourly bars close on the half hour, and the last at 16:00,
  // so they need both :45 and :15; runs that land between bars exit at once.
  const offset = DATA_DELAY_MS / 60_000;
  const firstHour = Math.floor((9 * 60 + 30 + minutes + offset) / 60);
  const hours = `${firstHour}-16`;
  return minutes >= 60 ? `cron(${offset},${(30 + offset) % 60} ${hours} ? * MON-FRI *)` : `cron(${offset % minutes}/${minutes} ${hours} ? * MON-FRI *)`;
}

const minutesOf = (d: ResolvedDeployment) => INTERVALS[d.interval];

/** The deployment's strategy source, relative to the repo root (esbuild's working directory). */
function strategyEntry(d: ResolvedDeployment): string {
  const rel = `./app/strategies/${d.strategyId}.ts`;
  if (!fs.existsSync(path.join(REPO_ROOT, rel))) throw new Error(`No strategy file ${rel} for ${d.id}`);
  return rel;
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
    const equitySecret = secretsmanager.Secret.fromSecretNameV2(this, 'EquityReporterSecret', props.equityReporterSecretName);

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
          EQUITY_SECRET_ID: props.equityReporterSecretName,
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
          // Bundle only this deployment's strategy (see runtime/handler.ts).
          esbuildArgs: { '--alias:@trading/strategy': strategyEntry(d) },
        },
      });
      // Its own state row only: the key is the deployment id.
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
          resources: [table.tableArn],
          conditions: { 'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': [d.id] } },
        }),
      );
      secret.grantRead(fn);
      equitySecret.grantRead(fn);
      fn.grantInvoke(schedulerRole);

      const schedule = new scheduler.CfnSchedule(this, `Schedule-${d.id}`, {
        name,
        description: minutesOf(d) >= 1440 ? 'Weekdays 16:30 ET, after the close' : `${DATA_DELAY_MS / 60_000} minutes after every ${d.interval} regular-session bar close, weekdays`,
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

      for (const resource of [fn, logGroup, schedule, errorsAlarm]) {
        Tags.of(resource).add('strategy', d.strategyId);
        Tags.of(resource).add('symbol', d.symbol);
      }

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
