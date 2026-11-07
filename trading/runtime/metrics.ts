// CloudWatch Embedded Metric Format. The runtime's one JSON log line per
// invocation carries an `_aws` block, and CloudWatch Logs turns the named
// top-level fields into metrics: no PutMetricData calls, no extra IAM.
// https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html

export const METRIC_NAMESPACE = 'TradierTrading';
export const METRIC_DIMENSION = 'Deployment';

/** Every metric the runtime publishes, and its unit. The dashboard reads the same list. */
export const METRICS = {
  // Gauges, one value per processed bar.
  AccountEquity: 'None',
  StrategyEquity: 'None',
  RealizedPnlTotal: 'None',
  RealizedPnlToday: 'None',
  UnrealizedPnl: 'None',
  DrawdownPct: 'Percent',
  PositionShares: 'Count',
  Signal: 'None', // 1 buy, -1 sell, 0 hold
  BarLagSeconds: 'Seconds',
  // Counters, summed over a period.
  Invocations: 'Count',
  BarsProcessed: 'Count',
  Skipped: 'Count',
  StaleData: 'Count',
  OrdersPlaced: 'Count',
  Fills: 'Count',
  TradesClosed: 'Count',
  WinningTrades: 'Count',
  ReconciliationMismatch: 'Count',
  Errors: 'Count',
} as const;

export type MetricName = keyof typeof METRICS;

/** The `_aws` block plus the metric fields, to spread into the log line. Undefined or non-finite values are left out. */
export function emfFields(deploymentId: string, values: Partial<Record<MetricName, number | null | undefined>>, timestampMs: number): Record<string, unknown> {
  const present = (Object.keys(values) as MetricName[]).filter((k) => {
    const v = values[k];
    return typeof v === 'number' && Number.isFinite(v);
  });
  const fields: Record<string, unknown> = { [METRIC_DIMENSION]: deploymentId };
  for (const k of present) fields[k] = values[k];
  if (present.length === 0) return {};
  fields._aws = {
    Timestamp: timestampMs,
    CloudWatchMetrics: [
      {
        Namespace: METRIC_NAMESPACE,
        Dimensions: [[METRIC_DIMENSION]],
        Metrics: present.map((Name) => ({ Name, Unit: METRICS[Name] })),
      },
    ],
  };
  return fields;
}
