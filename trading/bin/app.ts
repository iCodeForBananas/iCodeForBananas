// CDK app: validates deployments.ts and synthesizes the TradierTrading stack.
//   cd trading && npx cdk deploy

import { App, Tags } from 'aws-cdk-lib';
import { DEPLOYMENTS, TRADIER_SECRET_NAME } from '../deployments';
import { resolveDeployment, validateDeployments } from '../runtime/config';
import { TradingStack } from '../lib/trading-stack';

const errors = validateDeployments(DEPLOYMENTS);
if (errors.length > 0) {
  console.error(`deployments.ts has ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}

const app = new App();
new TradingStack(app, 'TradierTrading', {
  description: 'Tradier sandbox paper-trading strategies (one Lambda per deployment) and their dashboard',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  deployments: DEPLOYMENTS.map(resolveDeployment),
  tradierSecretName: TRADIER_SECRET_NAME,
});
Tags.of(app).add('app', 'tradier-trading');
