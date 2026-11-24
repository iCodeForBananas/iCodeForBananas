// Lambda entry point for the dispatcher (runtime/dispatch.ts): one function,
// invoked every 5 minutes on weekdays, that runs every deployment published
// from the backtester. Unlike handler.ts it bundles every strategy in the
// registry, and reads its deployments from Supabase on each tick.
//
// Test events:
//   { "dryRun": true, "ids": ["<deployment id>"], "evaluateLatest": true }
//     runs those deployments now, places nothing, writes nothing.
//   { "dryRun": true } runs whatever is due at this tick, the same way.
//   { "dryRun": true, "all": true, "evaluateLatest": true } runs every enabled one (scripts/dry-run.ts).
//   { "listDeployments": true } returns the enabled deployments, resolved.
//   { "orderHistory": true } returns Tradier's order history, read-only
//     (runtime/order-history.ts), for scripts/backfill-fills.ts.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { AVAILABLE_STRATEGIES } from '@/app/strategies';
import { DEPLOYMENTS } from '../deployments';
import type { AppDeploymentRow } from './app-deployments';
import { dispatch, selectRunnable, type DeploymentSource, type DispatchEvent } from './dispatch';
import { createEquityReporter, REPORT_TIMEOUT_MS, type EquityReporterConfig } from './equity-report';
import { collectOrderHistory } from './order-history';
import type { DeploymentState, StateStore } from './run';
import { createTradierClient, type TradierCreds } from './tradier';

const TABLE_NAME = process.env.TABLE_NAME;
const SECRET_ID = process.env.SECRET_ID;
const EQUITY_SECRET_ID = process.env.EQUITY_SECRET_ID;
if (!TABLE_NAME || !SECRET_ID || !EQUITY_SECRET_ID) throw new Error('TABLE_NAME, SECRET_ID and EQUITY_SECRET_ID must be set');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
});
const secrets = new SecretsManagerClient({});

async function secretJson(id: string): Promise<Record<string, string>> {
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: id }));
  return JSON.parse(res.SecretString ?? '{}');
}

async function loadCreds(): Promise<TradierCreds> {
  const parsed = await secretJson(SECRET_ID!);
  if (!parsed.accessToken || !parsed.accountId) throw new Error('Tradier secret is missing accessToken or accountId');
  return { accessToken: parsed.accessToken, accountId: parsed.accountId };
}

let supabaseConfig: EquityReporterConfig | null = null;
async function loadSupabaseConfig(): Promise<EquityReporterConfig> {
  const parsed = await secretJson(EQUITY_SECRET_ID!);
  if (!parsed.url || !parsed.publishableKey || !parsed.token) throw new Error('Equity reporter secret is missing url, publishableKey or token');
  return { url: parsed.url, publishableKey: parsed.publishableKey, token: parsed.token };
}

// Module scope, so credentials stay cached across warm invocations.
const tradier = createTradierClient(loadCreds);
const equityReporter = createEquityReporter(loadSupabaseConfig);

/** Calls a token-guarded Supabase RPC, the same way the equity reporter does. */
async function rpc<T>(fn: string, args: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const cfg = (supabaseConfig ??= await loadSupabaseConfig());
  const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: cfg.token, ...args }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) supabaseConfig = null;
    throw new Error(`Supabase ${fn} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const source: DeploymentSource = {
  list: async () => (await rpc<AppDeploymentRow[] | null>('strategy_deployments_to_run', {}, 10_000)) ?? [],
  reportRun: async (o) => {
    await rpc('report_strategy_deployment_run', {
      p_id: o.id,
      p_at: new Date(o.at).toISOString(),
      p_action: o.action,
      p_reason: o.reason,
      p_error: o.error,
    }, REPORT_TIMEOUT_MS);
  },
};

const store: StateStore = {
  async load(pk) {
    const r = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk }, ConsistentRead: true }));
    return (r.Item as Partial<DeploymentState> | undefined) ?? null;
  },
  async save(state, barTime) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...state, lastProcessedBarTime: barTime, updatedAt: new Date().toISOString() },
        ConditionExpression: 'attribute_not_exists(pk) OR attribute_not_exists(lastProcessedBarTime) OR lastProcessedBarTime < :t',
        ExpressionAttributeValues: { ':t': barTime },
      }),
    );
  },
};

export const handler = async (event?: DispatchEvent & { orderHistory?: boolean; listDeployments?: boolean }) => {
  if (event?.orderHistory === true) return collectOrderHistory(tradier);
  if (event?.listDeployments === true) return selectRunnable(await source.list(), DEPLOYMENTS);
  return dispatch(event, {
    source,
    strategies: AVAILABLE_STRATEGIES,
    codeDeployments: DEPLOYMENTS,
    tradier,
    store,
    equityReporter,
    now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => console.log(line),
  });
};
