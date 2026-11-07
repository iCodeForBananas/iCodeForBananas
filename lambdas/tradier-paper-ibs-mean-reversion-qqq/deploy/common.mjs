// Shared names, identity check and the zip builder for deploy/verify/teardown.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { deflateRawSync, crc32 } from 'node:zlib';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export const PREFIX = 'tradier-paper-ibs-mean-reversion-qqq';
export const NAMES = {
  role: `${PREFIX}-role`,
  rolePolicy: `${PREFIX}-access`,
  table: `${PREFIX}-state`,
  secret: `${PREFIX}/tradier-sandbox`,
  fn: PREFIX,
  schedule: `${PREFIX}-schedule`,
  schedulerRole: `${PREFIX}-scheduler-role`,
  schedulerPolicy: `${PREFIX}-invoke`,
  logGroup: `/aws/lambda/${PREFIX}`,
};
export const TAGS = { app: 'icodeforbananas-backtest', strategy: 'ibs-mean-reversion', symbol: 'QQQ' };
export const SYMBOL = 'QQQ';
export const BASIC_EXECUTION_POLICY_ARN = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';

// Fires at :00/:15/:30/:45 on weekdays from 04:00 to 20:45 ET, which covers
// every bar close of the pre-market, regular and after-hours session
// (04:15 to 20:00). The Lambda waits a few seconds past the boundary before
// reading bars, and decides whether orders are allowed.
export const SCHEDULE_EXPRESSION = 'cron(0,15,30,45 4-20 ? * MON-FRI *)';
export const SCHEDULE_TIMEZONE = 'America/New_York';

export const LAMBDA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'lambda');

export function region() {
  const r = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  return r || undefined;
}

/** Resolve credentials with the default chain and print who we are. */
export async function whoAmI() {
  const sts = new STSClient({});
  const id = await sts.send(new GetCallerIdentityCommand({}));
  const resolvedRegion = await sts.config.region();
  return { account: id.Account, arn: id.Arn, region: resolvedRegion };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { yes: false, account: undefined, region: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--yes' || argv[i] === '-y') out.yes = true;
    else if (argv[i] === '--account') out.account = argv[++i];
    else if (argv[i] === '--region') out.region = argv[++i];
  }
  return out;
}

/**
 * Print the identity and stop unless it matches what was confirmed. With
 * --account and --region it must match them exactly; without --yes it asks.
 */
export async function confirmTarget(action) {
  const args = parseArgs();
  const me = await whoAmI();
  console.log(`Account: ${me.account}\nPrincipal: ${me.arn}\nRegion: ${me.region}`);
  if (args.account && args.account !== me.account) throw new Error(`Refusing: expected account ${args.account}, credentials resolve to ${me.account}`);
  if (args.region && args.region !== me.region) throw new Error(`Refusing: expected region ${args.region}, resolved ${me.region}`);
  if (!args.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`${action} in account ${me.account}, region ${me.region}? Type "yes" to continue: `)).trim();
    rl.close();
    if (answer !== 'yes') throw new Error('Not confirmed; nothing changed.');
  }
  return me;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function tagList(keyName = 'Key', valueName = 'Value') {
  return Object.entries(TAGS).map(([k, v]) => ({ [keyName]: k, [valueName]: v }));
}

// ---------------------------------------------------------------------------
// Deterministic zip of lambda/ (fixed timestamps, sorted entries), so the
// same source gives the same CodeSha256 and a redeploy is a no-op.
// ---------------------------------------------------------------------------
function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

export function buildLambdaZip() {
  const files = listFiles(LAMBDA_DIR);
  const locals = [];
  const centrals = [];
  let offset = 0;
  // 1980-01-01 00:00, the DOS epoch.
  const dosTime = 0;
  const dosDate = (0 << 9) | (1 << 5) | 1;
  for (const file of files) {
    const name = Buffer.from(relative(LAMBDA_DIR, file).split('\\').join('/'));
    const data = readFileSync(file);
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // made by: Unix, v2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  const zip = Buffer.concat([...locals, centralBuf, end]);
  const sha256 = createHash('sha256').update(zip).digest('base64');
  return { zip, sha256, files: files.map((f) => relative(LAMBDA_DIR, f)) };
}

export function isNotFound(err) {
  const n = err?.name ?? '';
  return n === 'NoSuchEntityException' || n === 'NoSuchEntity' || n === 'ResourceNotFoundException' || err?.$metadata?.httpStatusCode === 404;
}
