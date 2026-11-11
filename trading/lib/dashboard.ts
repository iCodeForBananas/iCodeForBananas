// The TradierTrading CloudWatch dashboard: an overview across every
// deployment, then a section per deployment. Generated from deployments.ts, so
// a new strategy gets its graphs on the next deploy.

import { Duration } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import type * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { INTERVALS, type ResolvedDeployment } from '../runtime/config';
import { METRIC_DIMENSION, METRIC_NAMESPACE, type MetricName } from '../runtime/metrics';

export interface DeployedStrategy {
  deployment: ResolvedDeployment;
  fn: lambda.IFunction;
  logGroup: logs.ILogGroup;
  errorsAlarm: cloudwatch.IAlarm;
}

const WIDTH = 24;

function metric(d: ResolvedDeployment, name: MetricName, statistic: 'Maximum' | 'Sum' | 'Average', label?: string, color?: string) {
  return new cloudwatch.Metric({
    namespace: METRIC_NAMESPACE,
    metricName: name,
    dimensionsMap: { [METRIC_DIMENSION]: d.id },
    statistic,
    period: Duration.minutes(INTERVALS[d.interval]),
    label: label ?? name,
    color,
  });
}

/** Gauges are written once per bar, so Maximum over one bar is that bar's value. */
const gauge = (d: ResolvedDeployment, name: MetricName, label?: string, color?: string) => metric(d, name, 'Maximum', label, color);
const counter = (d: ResolvedDeployment, name: MetricName, label?: string, color?: string) => metric(d, name, 'Sum', label, color);

export function buildDashboard(scope: Construct, deployed: DeployedStrategy[]): cloudwatch.Dashboard {
  const dashboard = new cloudwatch.Dashboard(scope, 'Dashboard', {
    dashboardName: 'TradierTrading',
    defaultInterval: Duration.days(7),
    periodOverride: cloudwatch.PeriodOverride.INHERIT,
  });

  const list = deployed.map(({ deployment: d }) => `\`${d.id}\` ${d.strategyId} on ${d.symbol} ${d.interval}${d.enabled ? '' : ' (disabled)'}`).join(' · ');
  dashboard.addWidgets(
    new cloudwatch.TextWidget({
      markdown: `# Tradier sandbox paper trading\n${list || 'No deployments.'}\n\nStrategy equity = the deployment's own starting equity + its realized P&L + open P&L at the last bar's close. Dry runs never publish metrics.`,
      width: WIDTH,
      height: 3,
    }),
  );

  if (deployed.length > 0) {
    const first = deployed[0].deployment;
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Strategy equity, all deployments',
        left: deployed.map(({ deployment: d }) => gauge(d, 'StrategyEquity', d.id)),
        leftYAxis: { showUnits: false },
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Realized P&L, all deployments',
        left: deployed.map(({ deployment: d }) => gauge(d, 'RealizedPnlTotal', d.id)),
        leftYAxis: { showUnits: false },
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Tradier account equity',
        left: [gauge(first, 'AccountEquity', 'total_equity')],
        leftYAxis: { showUnits: false },
        width: 6,
        height: 6,
      }),
    );
    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: 'Errors alarms',
        alarms: deployed.map((x) => x.errorsAlarm),
        width: WIDTH,
        height: 2,
      }),
    );
  }

  for (const { deployment: d, fn, logGroup } of deployed) {
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `## ${d.id}\n${d.strategyId} on **${d.symbol}** ${d.interval} · params \`${JSON.stringify(d.params)}\` · starts at $${d.startingEquity.toLocaleString('en-US')} · shorts ${d.enableShorts ? 'on' : 'off'} · max daily loss ${d.maxDailyLossPct}% · drawdown limit ${d.drawdownLimitPct}% / ${d.drawdownPauseBars} bars`,
        width: WIDTH,
        height: 2,
      }),
    );
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Now',
        metrics: [gauge(d, 'StrategyEquity', 'Equity'), gauge(d, 'RealizedPnlTotal', 'Realized P&L'), gauge(d, 'UnrealizedPnl', 'Open P&L'), gauge(d, 'DrawdownPct', 'Drawdown %'), gauge(d, 'PositionShares', 'Position')],
        width: 12,
        height: 3,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Over the selected range',
        metrics: [counter(d, 'TradesClosed', 'Trades closed'), counter(d, 'WinningTrades', 'Winners'), counter(d, 'OrdersPlaced', 'Orders'), counter(d, 'BarsProcessed', 'Bars traded on'), counter(d, 'StaleData', 'Stale-data skips')],
        setPeriodToTimeRange: true,
        width: 12,
        height: 3,
      }),
    );
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Equity',
        left: [gauge(d, 'StrategyEquity', 'Strategy equity')],
        leftYAxis: { showUnits: false },
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'P&L',
        left: [gauge(d, 'RealizedPnlTotal', 'Realized (total)'), gauge(d, 'UnrealizedPnl', 'Open'), gauge(d, 'RealizedPnlToday', 'Realized today')],
        leftYAxis: { showUnits: false },
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Drawdown % and position',
        left: [gauge(d, 'DrawdownPct', 'Drawdown %', '#d62728')],
        right: [gauge(d, 'PositionShares', 'Shares (short < 0)', '#1f77b4')],
        leftYAxis: { min: 0, showUnits: false },
        rightYAxis: { showUnits: false },
        width: 8,
        height: 6,
      }),
    );
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Signals and trading',
        left: [gauge(d, 'Signal', 'Signal (1 buy, -1 sell)')],
        right: [counter(d, 'OrdersPlaced', 'Orders'), counter(d, 'Fills', 'Fills'), counter(d, 'TradesClosed', 'Trades closed'), counter(d, 'WinningTrades', 'Winners')],
        leftYAxis: { min: -1, max: 1, showUnits: false },
        rightYAxis: { min: 0, showUnits: false },
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Health',
        left: [
          counter(d, 'BarsProcessed', 'Bars processed'),
          counter(d, 'Skipped', 'Skipped'),
          counter(d, 'StaleData', 'Stale data'),
          counter(d, 'ReconciliationMismatch', 'Reconciliation mismatch'),
          counter(d, 'Errors', 'Errors', '#d62728'),
        ],
        right: [gauge(d, 'BarLagSeconds', 'Bar lag (s)')],
        leftYAxis: { min: 0, showUnits: false },
        rightYAxis: { min: 0, showUnits: false },
        stacked: false,
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda',
        left: [fn.metricInvocations({ statistic: 'Sum', period: Duration.minutes(INTERVALS[d.interval]) }), fn.metricErrors({ statistic: 'Sum', period: Duration.minutes(INTERVALS[d.interval]) })],
        right: [fn.metricDuration({ statistic: 'Maximum', period: Duration.minutes(INTERVALS[d.interval]) })],
        width: 8,
        height: 6,
      }),
    );
    dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        title: `${d.id}: latest decisions`,
        logGroupNames: [logGroup.logGroupName],
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        queryLines: [
          'fields @timestamp, level, action, bar.close as close, signal.action as signal, why, mismatch, error.message as error',
          'filter ispresent(deployment)',
          'sort @timestamp desc',
          'limit 50',
        ],
        width: WIDTH,
        height: 8,
      }),
    );
  }
  return dashboard;
}
