// Lambda entry point, shared by every deployment. The CDK stack bundles this
// file (with the strategy code from app/) into each deployment's function and
// passes that deployment, already resolved and validated, as JSON in DEPLOYMENT.
//
// Test event { "dryRun": true } runs everything and logs the orders it would
// place, without placing them, writing state or publishing metrics. Add
// "evaluateLatest": true to evaluate the newest bar even when it's stale.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { ResolvedDeployment } from './config';
import { runDeployment, type DeploymentState, type RunEvent, type StateStore } from './run';
import { createTradierClient, type TradierCreds } from './tradier';

const TABLE_NAME = process.env.TABLE_NAME;
const SECRET_ID = process.env.SECRET_ID;
const DEPLOYMENT: ResolvedDeployment = JSON.parse(process.env.DEPLOYMENT ?? 'null');
if (!TABLE_NAME || !SECRET_ID || !DEPLOYMENT) throw new Error('TABLE_NAME, SECRET_ID and DEPLOYMENT must be set');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
});
const secrets = new SecretsManagerClient({});

async function loadCreds(): Promise<TradierCreds> {
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  const parsed = JSON.parse(res.SecretString ?? '{}');
  if (!parsed.accessToken || !parsed.accountId) throw new Error('Tradier secret is missing accessToken or accountId');
  return { accessToken: parsed.accessToken, accountId: parsed.accountId };
}

// Module scope, so the credential cache survives warm invocations.
const tradier = createTradierClient(loadCreds);

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

export const handler = (event?: RunEvent) =>
  runDeployment(DEPLOYMENT, event, {
    tradier,
    store,
    now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => console.log(line),
  });
