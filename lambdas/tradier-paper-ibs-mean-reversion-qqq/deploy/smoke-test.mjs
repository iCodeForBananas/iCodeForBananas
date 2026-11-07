// Local smoke test: runs lambda/index.mjs against a fake Tradier sandbox, a
// fake DynamoDB table and a fake secret. No network, no AWS. Exercises entry,
// exit, shorts, stale data, duplicates, reconciliation, dry run, the
// regular-hours gate, the drawdown limit and the daily loss limit.
//
//   node smoke-test.mjs

import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const here = dirname(fileURLToPath(import.meta.url));
// Copy the Lambda next to deploy/node_modules so its @aws-sdk imports resolve
// to the same module instances patched below.
mkdirSync(join(here, '.smoke'), { recursive: true });
copyFileSync(join(here, '..', 'lambda', 'index.mjs'), join(here, '.smoke', 'index.mjs'));

process.env.TABLE_NAME = 'test-table';
process.env.SECRET_ID = 'test-secret';
process.env.SYMBOL = 'QQQ';
process.env.MAX_DAILY_LOSS_PCT = '2';
process.env.AWS_REGION = 'us-east-1';

// ---------------------------------------------------------------- fake AWS
let table = new Map();
let writes = 0;
DynamoDBDocumentClient.prototype.send = async function (cmd) {
  const name = cmd.constructor.name;
  if (name === 'GetCommand') return { Item: table.get(cmd.input.Key.pk) && structuredClone(table.get(cmd.input.Key.pk)) };
  if (name === 'PutCommand') {
    const prev = table.get(cmd.input.Item.pk);
    const t = cmd.input.ExpressionAttributeValues[':t'];
    if (prev && prev.lastProcessedBarTime != null && !(prev.lastProcessedBarTime < t)) {
      const e = new Error('The conditional request failed');
      e.name = 'ConditionalCheckFailedException';
      throw e;
    }
    table.set(cmd.input.Item.pk, structuredClone(cmd.input.Item));
    writes++;
    return {};
  }
  throw new Error(`unexpected ddb command ${name}`);
};
SecretsManagerClient.prototype.send = async function () {
  return { SecretString: JSON.stringify({ accessToken: 'test-token', accountId: 'VA000000' }) };
};

// ----------------------------------------------------------- fake Tradier
const BAR = 15 * 60 * 1000;
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const etString = (ms) => {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
};

const T = {
  equity: 10000,
  positions: [],
  orders: [],
  clockState: 'open',
  bars: [],
  nextOrderId: 1000,
  placed: [],
  fillPrice: null,
  dropNewest: false,
  requests: [],
};

function makeBars(lastBarOpenMs, n, last) {
  const bars = [];
  let price = 500;
  for (let i = n - 1; i >= 0; i--) {
    const t = lastBarOpenMs - i * BAR;
    price += Math.sin(i) * 0.5;
    bars.push({ time: etString(t), open: price, high: price + 1, low: price - 1, close: price + 0.2, volume: 1000 });
  }
  Object.assign(bars[bars.length - 1], last);
  return bars;
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  assert.equal(u.origin, 'https://sandbox.tradier.com', 'every call goes to the sandbox');
  assert.equal(init.headers.Authorization, 'Bearer test-token');
  const path = u.pathname.replace('/v1', '');
  const method = init.method ?? 'GET';
  T.requests.push(`${method} ${path}`);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (path === '/markets/clock') return json({ clock: { state: T.clockState, description: 'test' } });
  if (path === '/markets/timesales') {
    assert.equal(u.searchParams.get('session_filter'), 'all');
    assert.equal(u.searchParams.get('interval'), '15min');
    const data = T.dropNewest ? T.bars.slice(0, -1) : T.bars;
    return json({ series: { data } });
  }
  if (path === '/accounts/VA000000/balances') return json({ balances: { total_equity: T.equity } });
  if (path === '/accounts/VA000000/positions') return json({ positions: T.positions.length ? { position: T.positions } : 'null' });
  if (path === '/accounts/VA000000/orders' && method === 'GET') return json({ orders: T.orders.length ? { order: T.orders } : 'null' });
  if (path === '/accounts/VA000000/orders' && method === 'POST') {
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('class'), 'equity');
    assert.equal(form.get('type'), 'market');
    assert.equal(form.get('duration'), 'day');
    const id = T.nextOrderId++;
    const side = form.get('side');
    const qty = Number(form.get('quantity'));
    T.placed.push({ id, side, qty });
    const price = T.fillPrice ?? 500;
    T.orders.push({ id, symbol: 'QQQ', side, quantity: qty, status: 'filled', exec_quantity: qty, avg_fill_price: price });
    // Apply to positions.
    const dir = side === 'buy' || side === 'buy_to_cover' ? 1 : -1;
    const cur = T.positions.find((p) => p.symbol === 'QQQ');
    const newQty = (cur ? Number(cur.quantity) : 0) + dir * qty;
    T.positions = newQty === 0 ? [] : [{ symbol: 'QQQ', quantity: newQty, cost_basis: newQty * price, date_acquired: new Date().toISOString() }];
    return json({ order: { id, status: 'ok' } });
  }
  const m = /^\/accounts\/VA000000\/orders\/(\d+)$/.exec(path);
  if (m && method === 'GET') {
    const o = T.orders.find((x) => String(x.id) === m[1]);
    return o ? json({ order: o }) : json({ errors: { error: ['not found'] } }, 404);
  }
  if (m && method === 'DELETE') {
    const o = T.orders.find((x) => String(x.id) === m[1]);
    if (o) o.status = 'canceled';
    return json({ order: { id: Number(m[1]), status: 'ok' } });
  }
  throw new Error(`unexpected Tradier call ${method} ${path}`);
};

// --------------------------------------------------------------- clock
const realNow = Date.now.bind(Date);
let offset = 0;
Date.now = () => realNow() + offset;
/** Pretend it's `isoUtc` plus however long the test has been running. */
function setNow(isoUtc) {
  offset = Date.parse(isoUtc) - realNow();
}

// Capture the handler's JSON log line.
const lines = [];
const origLog = console.log;
console.log = (s) => {
  try {
    const j = JSON.parse(s);
    if (j.app) { lines.push(j); return; }
  } catch { /* not ours */ }
  origLog(s);
};
console.warn = () => {};

const { handler, ibs, etWallToUtcMs, parseEtTimestamp } = await import(pathToFileURL(join(here, '.smoke', 'index.mjs')).href);
const lastLine = () => lines[lines.length - 1];

let passed = 0;
async function scenario(name, fn) {
  try {
    await fn();
    passed++;
    origLog(`  ok  ${name}`);
  } catch (err) {
    origLog(`  FAIL ${name}\n${err.stack}\n${JSON.stringify(lastLine(), null, 2)}`);
    process.exitCode = 1;
  }
}

// Wed 2026-11-04 10:30:06 ET (EST, UTC-5): the 10:15 bar just closed.
const BOUNDARY = '2026-11-04T15:30:00.000Z';
const at = (minutesAfter = 0, seconds = 6) => new Date(Date.parse(BOUNDARY) + minutesAfter * 60000 + seconds * 1000).toISOString();
const barOpen = (minutesAfter = 0) => Date.parse(BOUNDARY) + minutesAfter * 60000 - BAR;
const reset = () => {
  table = new Map();
  writes = 0;
  Object.assign(T, { equity: 10000, positions: [], orders: [], clockState: 'open', placed: [], fillPrice: null, dropNewest: false, requests: [] });
};

origLog('pure helpers');
await scenario('IBS matches the backtest definition', async () => {
  assert.equal(ibs({ high: 10, low: 10, close: 10 }), 0.5);
  assert.equal(ibs({ high: 12, low: 10, close: 10.5 }), 0.25);
});
await scenario('US/Eastern timestamps convert to UTC across DST', async () => {
  assert.equal(new Date(parseEtTimestamp('2026-11-04T10:15:00')).toISOString(), '2026-11-04T15:15:00.000Z');
  assert.equal(new Date(parseEtTimestamp('2026-07-01T09:30:00')).toISOString(), '2026-07-01T13:30:00.000Z');
  assert.equal(new Date(etWallToUtcMs(2026, 3, 9, 4, 0)).toISOString(), '2026-03-09T08:00:00.000Z');
});

origLog('handler');
await scenario('low IBS while flat opens a long, sized floor(equity / close), fills, writes state', async () => {
  reset();
  setNow(at());
  T.bars = makeBars(barOpen(), 300, { open: 501, high: 502, low: 498, close: 498.4 }); // IBS 0.1
  T.fillPrice = 498.5;
  await handler({});
  const l = lastLine();
  assert.equal(l.signal.action, 'buy');
  assert.equal(l.action, 'entry long');
  assert.deepEqual(T.placed, [{ id: 1000, side: 'buy', qty: Math.floor(10000 / 498.4) }]);
  const s = table.get('QQQ#ibs-mean-reversion');
  assert.equal(s.position.side, 'long');
  assert.equal(s.position.shares, 20);
  assert.equal(s.position.entryPrice, 498.5);
  assert.equal(s.pendingOrderId, null);
  assert.equal(s.lastProcessedBarTime, barOpen());
  assert.equal(s.peakEquity, 10000);
});

await scenario('the same bar again is a duplicate and does nothing', async () => {
  setNow(at());
  const before = T.placed.length;
  await handler({});
  assert.equal(T.placed.length, before);
  assert.match(lastLine().why, /already processed/);
});

await scenario('IBS above exitIbs while long closes the long, realizes P&L, no reversal', async () => {
  setNow(at(15));
  T.bars = makeBars(barOpen(15), 300, { open: 500, high: 502, low: 498, close: 501.6 }); // IBS 0.9: also a short entry when flat
  T.fillPrice = 501;
  await handler({});
  const l = lastLine();
  assert.equal(l.signal.action, 'sell');
  assert.equal(l.action, 'exit long');
  assert.deepEqual(T.placed.at(-1), { id: 1001, side: 'sell', qty: 20 });
  const s = table.get('QQQ#ibs-mean-reversion');
  assert.equal(s.position, null);
  assert.equal(s.realizedPnlToday, (501 - 498.5) * 20);
  assert.equal(T.placed.length, 2, 'closing never reverses on the same bar');
});

await scenario('high IBS while flat opens a short with sell_short; low IBS covers with buy_to_cover', async () => {
  setNow(at(30));
  T.bars = makeBars(barOpen(30), 300, { open: 500, high: 502, low: 498, close: 501.6 });
  T.fillPrice = 501.5;
  await handler({});
  assert.equal(lastLine().action, 'entry short');
  assert.equal(T.placed.at(-1).side, 'sell_short');
  setNow(at(45));
  T.bars = makeBars(barOpen(45), 300, { open: 500, high: 502, low: 498, close: 498.8 }); // IBS 0.2 < 0.5
  T.fillPrice = 499;
  await handler({});
  assert.equal(lastLine().action, 'exit short');
  assert.equal(T.placed.at(-1).side, 'buy_to_cover');
  assert.equal(table.get('QQQ#ibs-mean-reversion').position, null);
});

await scenario('missing just-closed bar is stale: no orders, no state write', async () => {
  reset();
  setNow(at());
  T.bars = makeBars(barOpen(), 300, { open: 501, high: 502, low: 498, close: 498.4 });
  T.dropNewest = true;
  await handler({});
  assert.equal(lastLine().action, 'none');
  assert.match(lastLine().why, /stale/);
  assert.equal(T.placed.length, 0);
  assert.equal(writes, 0);
});

await scenario('invoked long after the bar closed: too late, nothing done', async () => {
  reset();
  setNow(at(5));
  T.bars = makeBars(barOpen(), 300, { open: 501, high: 502, low: 498, close: 498.4 });
  await handler({});
  assert.equal(T.placed.length, 0);
  assert.match(lastLine().why, /too late|stale/);
});

await scenario('fewer than 250 bars: nothing done', async () => {
  reset();
  setNow(at());
  T.bars = makeBars(barOpen(), 100, { open: 501, high: 502, low: 498, close: 498.4 });
  await handler({});
  assert.equal(T.placed.length, 0);
  assert.match(lastLine().why, /250/);
});

await scenario('dry run logs the order it would place and writes nothing', async () => {
  reset();
  setNow(at());
  T.bars = makeBars(barOpen(), 300, { open: 501, high: 502, low: 498, close: 498.4 });
  await handler({ dryRun: true });
  const l = lastLine();
  assert.equal(T.placed.length, 0);
  assert.equal(writes, 0);
  assert.equal(l.wouldPlace[0].side, 'buy');
  assert.equal(l.stateWritten, false);
  assert.ok(l.indicators.ibs < 0.2 && l.bar && l.signal);
});

await scenario('outside regular hours: evaluates and logs, places nothing', async () => {
  reset();
  // 07:00 ET pre-market bar close.
  setNow('2026-11-04T12:00:06.000Z');
  T.clockState = 'premarket';
  T.bars = makeBars(Date.parse('2026-11-04T12:00:00.000Z') - BAR, 300, { open: 501, high: 502, low: 498, close: 498.4 });
  await handler({});
  const l = lastLine();
  assert.equal(T.placed.length, 0);
  assert.equal(l.regularHours, false);
  assert.equal(l.wouldPlace[0].side, 'buy');
  assert.equal(writes, 1, 'the bar is still marked processed');
});

await scenario('Tradier position DynamoDB does not know about: trust Tradier, skip trading', async () => {
  reset();
  setNow(at());
  T.positions = [{ symbol: 'QQQ', quantity: 7, cost_basis: 3500, date_acquired: '2026-11-03T15:00:00Z' }];
  T.bars = makeBars(barOpen(), 300, { open: 500, high: 502, low: 498, close: 501.6 }); // would be an exit if long
  await handler({});
  const l = lastLine();
  assert.equal(T.placed.length, 0);
  assert.match(l.mismatch, /MISMATCH/);
  const s = table.get('QQQ#ibs-mean-reversion');
  assert.equal(s.position.side, 'long');
  assert.equal(s.position.shares, 7);
  assert.equal(s.position.entryPrice, 500);
});

await scenario('pending order still open at the next bar: wait, place nothing', async () => {
  reset();
  setNow(at());
  table.set('QQQ#ibs-mean-reversion', { pk: 'QQQ#ibs-mean-reversion', position: null, pendingOrderId: '77', pendingOrder: { id: '77', kind: 'entry', side: 'long', quantity: 5 }, lastProcessedBarTime: barOpen() - BAR, peakEquity: 10000, tradingDay: '2026-11-04', dayStartEquity: 10000, realizedPnlToday: 0 });
  T.orders = [{ id: 77, symbol: 'QQQ', side: 'buy', quantity: 5, status: 'open', exec_quantity: 0 }];
  T.bars = makeBars(barOpen(), 300, { open: 501, high: 502, low: 498, close: 498.4 });
  await handler({});
  assert.equal(T.placed.length, 0);
  assert.match(lastLine().why, /pending/);
  assert.equal(table.get('QQQ#ibs-mean-reversion').pendingOrderId, '77');
});

await scenario('rejected pending entry goes back to flat', async () => {
  reset();
  setNow(at());
  table.set('QQQ#ibs-mean-reversion', { pk: 'QQQ#ibs-mean-reversion', position: null, pendingOrderId: '78', pendingOrder: { id: '78', kind: 'entry', side: 'long', quantity: 5 }, lastProcessedBarTime: barOpen() - BAR, peakEquity: 10000, tradingDay: '2026-11-04', dayStartEquity: 10000, realizedPnlToday: 0 });
  T.orders = [{ id: 78, symbol: 'QQQ', side: 'buy', quantity: 5, status: 'rejected', exec_quantity: 0, reason_description: 'buying power' }];
  T.bars = makeBars(barOpen(), 300, { open: 500, high: 502, low: 498, close: 500 }); // hold
  await handler({});
  const s = table.get('QQQ#ibs-mean-reversion');
  assert.equal(s.pendingOrderId, null);
  assert.equal(s.position, null);
  assert.ok(lastLine().notes.some((n) => /rejected/.test(n)));
});

await scenario('drawdown 25% below peak: close the position, drop entries, pause 20 bars', async () => {
  reset();
  setNow(at());
  T.positions = [{ symbol: 'QQQ', quantity: 20, cost_basis: 10000, date_acquired: '2026-11-03T15:00:00Z' }];
  T.equity = 7400;
  table.set('QQQ#ibs-mean-reversion', { pk: 'QQQ#ibs-mean-reversion', position: { side: 'long', shares: 20, entryPrice: 500 }, pendingOrderId: null, pendingOrder: null, lastProcessedBarTime: barOpen() - BAR, peakEquity: 10000, tradingDay: '2026-11-04', dayStartEquity: 10000, realizedPnlToday: 0 });
  T.bars = makeBars(barOpen(), 300, { open: 500, high: 502, low: 498, close: 500 }); // hold
  T.fillPrice = 370;
  await handler({});
  const s = table.get('QQQ#ibs-mean-reversion');
  assert.equal(T.placed.at(-1).side, 'sell');
  assert.equal(s.position, null);
  assert.equal(s.peakEquity, 7400);
  assert.equal(s.drawdownTripBarTime, barOpen());
  assert.equal(s.entriesAllowedFrom, barOpen() + 21 * BAR);
  // Next bar: a buy signal is ignored during the pause.
  setNow(at(15));
  T.bars = makeBars(barOpen(15), 300, { open: 501, high: 502, low: 498, close: 498.4 });
  const n = T.placed.length;
  await handler({});
  assert.equal(T.placed.length, n);
  assert.match(lastLine().why, /drawdown pause/);
});

await scenario('daily realized loss at 2% of day-start equity blocks new entries', async () => {
  reset();
  setNow(at());
  table.set('QQQ#ibs-mean-reversion', { pk: 'QQQ#ibs-mean-reversion', position: null, pendingOrderId: null, pendingOrder: null, lastProcessedBarTime: barOpen() - BAR, peakEquity: 10000, tradingDay: '2026-11-04', dayStartEquity: 10000, realizedPnlToday: -200 });
  T.bars = makeBars(barOpen(), 300, { open: 501, high: 502, low: 498, close: 498.4 });
  await handler({});
  assert.equal(T.placed.length, 0);
  assert.match(lastLine().why, /daily loss/);
});

await scenario('a 4xx from Tradier is not retried and fails the invocation', async () => {
  reset();
  setNow(at());
  T.bars = makeBars(barOpen(), 300, { open: 501, high: 502, low: 498, close: 498.4 });
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/balances')) { calls++; return new Response('unauthorized', { status: 401 }); }
    return realFetch(url, init);
  };
  await assert.rejects(handler({}), /401/);
  globalThis.fetch = realFetch;
  assert.equal(calls, 1);
  assert.equal(lastLine().level, 'error');
  assert.equal(writes, 0);
});

origLog(`\n${passed} scenario(s) passed`);
