// Paper-trades IBS Mean Reversion on QQQ 15m bars through Tradier's SANDBOX API.
//
// One invocation handles the newest completed 15m bar: reconcile against
// Tradier, compute indicators, run the strategy, decide an exit or an entry,
// apply the account drawdown limit, place market orders (regular hours only),
// then write state to DynamoDB once, conditionally on lastProcessedBarTime.
//
// Runtime: Node.js 22.x, handler index.handler. No npm dependencies: global
// fetch for Tradier, and only the AWS SDK v3 clients the runtime bundles.
//
// Test event { "dryRun": true } runs everything and logs the orders it would
// place, without placing them or writing state.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// ---------------------------------------------------------------------------
// Hard guardrail: sandbox only. Not configurable by any environment variable.
// ---------------------------------------------------------------------------
const TRADIER_BASE_URL = 'https://sandbox.tradier.com/v1';
if (!TRADIER_BASE_URL.includes('sandbox.tradier.com')) {
  throw new Error(`Refusing to start: Tradier base URL ${TRADIER_BASE_URL} is not the sandbox`);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const STRATEGY_ID = 'ibs-mean-reversion';
const SYMBOL = process.env.SYMBOL || 'QQQ';
const TABLE_NAME = process.env.TABLE_NAME;
const SECRET_ID = process.env.SECRET_ID;
const MAX_DAILY_LOSS_PCT = parseFloat(process.env.MAX_DAILY_LOSS_PCT ?? '2');

// The backtest's parameters, exactly.
const PARAMS = { entryIbs: 20, exitIbs: 50, trendFilter: false };
const ENABLE_SHORTS = true;

const BAR_MS = 15 * 60 * 1000;
const TZ = 'America/New_York';
// A completed bar must be the one that closed at the latest 15m boundary, and
// the invocation must run within this long of that boundary.
const MAX_LATENESS_MS = 2 * 60 * 1000;
// Wait at least this long after a boundary before reading bars, then poll a
// few times for the just-closed bar to appear.
const SETTLE_MS = 5 * 1000;
const FRESHNESS_POLLS = 3;
const FRESHNESS_POLL_GAP_MS = 5 * 1000;
// Always the same window, so recursive indicators start from the same place.
const HISTORY_CALENDAR_DAYS = 10;
const MIN_BARS = 250;

const DRAWDOWN_LIMIT_PCT = 25;
const DRAWDOWN_PAUSE_BARS = 20;
const POSITION_SIZE_PCT = 100;

// How long to wait inside the invocation for a market order to show as filled.
const FILL_POLL_MS = 1500;
const FILL_POLL_ATTEMPTS = 6;

const OPEN_ORDER_STATUSES = new Set(['open', 'partially_filled', 'pending']);
const DEAD_ORDER_STATUSES = new Set(['rejected', 'canceled', 'cancelled', 'expired', 'error']);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
});
const secrets = new SecretsManagerClient({});

// ---------------------------------------------------------------------------
// Strategy (ported from app/strategies/ibs-mean-reversion.ts, unchanged logic)
// ---------------------------------------------------------------------------
export function ibs(bar) {
  const range = bar.high - bar.low;
  return range === 0 ? 0.5 : (bar.close - bar.low) / range;
}

export function strategyHandler({ current, params, position }) {
  const entryIbs = (params.entryIbs ?? 20) / 100;
  const exitIbs = (params.exitIbs ?? 80) / 100;
  const trendFilter = params.trendFilter ?? false;

  const value = ibs(current);
  const shortEntryIbs = 1 - entryIbs;
  const shortExitIbs = 1 - exitIbs;

  if (position === 'long') {
    if (value > exitIbs) {
      return { action: 'sell', reason: `IBS ${value.toFixed(2)} > ${exitIbs}` };
    }
    return { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    if (value < shortExitIbs) {
      return { action: 'buy', reason: `IBS ${value.toFixed(2)} < ${shortExitIbs.toFixed(2)}` };
    }
    return { action: 'hold', reason: '' };
  }

  const sma = current.sma200;
  const aboveTrend = !trendFilter || (sma != null && current.close > sma);
  const belowTrend = !trendFilter || (sma != null && current.close < sma);
  if (value < entryIbs && aboveTrend) {
    return { action: 'buy', reason: `IBS ${value.toFixed(2)} < ${entryIbs}` };
  }
  if (value > shortEntryIbs && belowTrend) {
    return { action: 'sell', reason: `IBS ${value.toFixed(2)} > ${shortEntryIbs.toFixed(2)}` };
  }

  return { action: 'hold', reason: '' };
}

// ---------------------------------------------------------------------------
// Indicators, over the whole fetched history, oldest first. Mirrors
// calculateIndicatorsWithParams in app/lib/backtest-engine.ts.
// ---------------------------------------------------------------------------
export function computeIndicators(bars, { smaPeriods = [200], emaPeriods = [9, 21], macds = [[12, 26, 9]], donchians = [20] } = {}) {
  const out = [];
  const emaState = {};
  const emaSum = {};
  let avgGain = 0;
  let avgLoss = 0;
  const rsiPeriod = 14;
  const atrPeriod = 14;
  let trSum = 0;
  let trCount = 0;
  let atr;
  const macdState = macds.map(([f, s, g]) => ({ f, s, g, fastSum: 0, slowSum: 0, fast: undefined, slow: undefined, signal: undefined }));

  for (let i = 0; i < bars.length; i++) {
    const c = bars[i];
    const row = { ...c };
    if (i > 0) {
      row.prevClose = bars[i - 1].close;
      row.prevHigh = bars[i - 1].high;
      row.prevLow = bars[i - 1].low;
    }

    for (const n of smaPeriods) {
      if (i >= n - 1) {
        let sum = 0;
        for (let j = i - n + 1; j <= i; j++) sum += bars[j].close;
        row[`sma${n}`] = sum / n;
      }
    }

    for (const n of emaPeriods) {
      if (i < n - 1) {
        emaSum[n] = (emaSum[n] ?? 0) + c.close;
      } else if (i === n - 1) {
        emaSum[n] = (emaSum[n] ?? 0) + c.close;
        emaState[n] = emaSum[n] / n;
      } else {
        emaState[n] = (c.close - emaState[n]) * (2 / (n + 1)) + emaState[n];
      }
      if (emaState[n] !== undefined) row[`ema${n}`] = emaState[n];
    }

    if (i > 0) {
      const change = c.close - bars[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      if (i < rsiPeriod) {
        avgGain += gain;
        avgLoss += loss;
      } else if (i === rsiPeriod) {
        avgGain = (avgGain + gain) / rsiPeriod;
        avgLoss = (avgLoss + loss) / rsiPeriod;
      } else {
        avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
        avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      }
      if (i >= rsiPeriod) {
        // Same as the backtest engine: no losses is 100, no movement is 50.
        row.rsi = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
      }
    }

    for (const m of macdState) {
      if (i < m.f - 1) m.fastSum += c.close;
      else if (i === m.f - 1) { m.fastSum += c.close; m.fast = m.fastSum / m.f; }
      else m.fast = (c.close - m.fast) * (2 / (m.f + 1)) + m.fast;
      if (i < m.s - 1) m.slowSum += c.close;
      else if (i === m.s - 1) { m.slowSum += c.close; m.slow = m.slowSum / m.s; }
      else m.slow = (c.close - m.slow) * (2 / (m.s + 1)) + m.slow;
      if (m.fast !== undefined && m.slow !== undefined && i >= m.s - 1) {
        const key = `${m.f}_${m.s}_${m.g}`;
        const macd = m.fast - m.slow;
        m.signal = m.signal === undefined ? macd : (macd - m.signal) * (2 / (m.g + 1)) + m.signal;
        row[`macd_${key}`] = macd;
        row[`macdSignal_${key}`] = m.signal;
        row[`macdHistogram_${key}`] = macd - m.signal;
        if (m.f === 12 && m.s === 26 && m.g === 9) {
          row.macd = macd;
          row.macdSignal = m.signal;
          row.macdHistogram = macd - m.signal;
        }
      }
    }

    if (i > 0) {
      const pc = bars[i - 1].close;
      const tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
      if (trCount < atrPeriod) {
        trSum += tr;
        trCount++;
        if (trCount === atrPeriod) atr = trSum / atrPeriod;
      } else {
        atr = (atr * (atrPeriod - 1) + tr) / atrPeriod;
      }
      if (atr !== undefined) row.atr = atr;
    }

    for (const n of donchians) {
      if (i >= n - 1) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - n + 1; j <= i; j++) {
          if (bars[j].high > hi) hi = bars[j].high;
          if (bars[j].low < lo) lo = bars[j].low;
        }
        row[`donchian_${n}_upperBand`] = hi;
        row[`donchian_${n}_lowerBand`] = lo;
        row[`donchian_${n}_midLine`] = (hi + lo) / 2;
        if (n === 20) {
          row.upperBand = hi;
          row.lowerBand = lo;
          row.midLine = (hi + lo) / 2;
        }
      }
    }

    out.push(row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// US/Eastern time helpers
// ---------------------------------------------------------------------------
const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function etParts(ms) {
  const p = Object.fromEntries(etFormatter.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

export function etDate(ms) {
  const p = etParts(ms);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** UTC epoch ms of a US/Eastern wall-clock time. */
export function etWallToUtcMs(year, month, day, hour, minute, second = 0) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = asUtc;
  for (let k = 0; k < 3; k++) {
    const p = etParts(guess);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const next = guess + (asUtc - shown);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** "2026-11-05T09:30:00" in US/Eastern -> UTC epoch ms. */
export function parseEtTimestamp(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(s));
  if (!m) return NaN;
  return etWallToUtcMs(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

function etMinutesOfDay(ms) {
  const p = etParts(ms);
  return p.hour * 60 + p.minute;
}

// ---------------------------------------------------------------------------
// Tradier
// ---------------------------------------------------------------------------
let cachedCreds = null;

async function getCreds() {
  if (cachedCreds) return cachedCreds;
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  const parsed = JSON.parse(res.SecretString ?? '{}');
  if (!parsed.accessToken || !parsed.accountId) throw new Error('Tradier secret is missing accessToken or accountId');
  cachedCreds = { accessToken: parsed.accessToken, accountId: parsed.accountId };
  return cachedCreds;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class TradierError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Calls Tradier. Retries network errors and 5xx with backoff, at most 3
 * attempts, never a 4xx. Order placement is never retried: a 5xx on a POST
 * may still have placed the order, and reconciliation catches it next time.
 */
async function tradier(path, { method = 'GET', query, form, retry = true } = {}) {
  const { accessToken } = await getCreds();
  const url = new URL(TRADIER_BASE_URL + path);
  if (!url.href.startsWith('https://sandbox.tradier.com/')) throw new Error(`Refusing non-sandbox URL ${url.href}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const init = {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  };
  if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString();
  }
  const attempts = retry ? 3 : 1;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      lastErr = new TradierError(`Network error on ${method} ${path}: ${err.message}`, 0);
      if (attempt < attempts) { await sleep(400 * 3 ** (attempt - 1)); continue; }
      throw lastErr;
    }
    const text = await res.text();
    if (res.status >= 500) {
      lastErr = new TradierError(`Tradier ${res.status} on ${method} ${path}`, res.status, text.slice(0, 500));
      if (attempt < attempts) { await sleep(400 * 3 ** (attempt - 1)); continue; }
      throw lastErr;
    }
    if (res.status >= 400) {
      throw new TradierError(`Tradier ${res.status} on ${method} ${path}: ${text.slice(0, 300)}`, res.status, text.slice(0, 500));
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new TradierError(`Tradier returned non-JSON on ${method} ${path}: ${text.slice(0, 200)}`, res.status);
    }
  }
  throw lastErr;
}

const asArray = (x) => (x == null || x === 'null' ? [] : Array.isArray(x) ? x : [x]);

async function getClock() {
  const r = await tradier('/markets/clock');
  return r?.clock ?? null;
}

async function getBalances(accountId) {
  const r = await tradier(`/accounts/${accountId}/balances`);
  return r?.balances ?? null;
}

async function getPositions(accountId) {
  const r = await tradier(`/accounts/${accountId}/positions`);
  return asArray(r?.positions?.position);
}

async function getOrders(accountId) {
  const r = await tradier(`/accounts/${accountId}/orders`, { query: { includeTags: 'true' } });
  return asArray(r?.orders?.order);
}

async function getOrder(accountId, orderId) {
  const r = await tradier(`/accounts/${accountId}/orders/${orderId}`, { query: { includeTags: 'true' } });
  return r?.order ?? null;
}

async function placeMarketOrder(accountId, { side, quantity, tag }) {
  const r = await tradier(`/accounts/${accountId}/orders`, {
    method: 'POST',
    retry: false,
    form: { class: 'equity', symbol: SYMBOL, side, quantity, type: 'market', duration: 'day', tag },
  });
  const id = r?.order?.id;
  if (!id) throw new Error(`Order placement returned no id: ${JSON.stringify(r).slice(0, 300)}`);
  return String(id);
}

async function cancelOrder(accountId, orderId) {
  return tradier(`/accounts/${accountId}/orders/${orderId}`, { method: 'DELETE', retry: false });
}

/** Completed 15m bars, oldest first, in UTC epoch ms (time = bar open). */
async function fetchBars(nowMs) {
  const startMs = nowMs - HISTORY_CALENDAR_DAYS * 24 * 60 * 60 * 1000;
  const s = etParts(startMs);
  const e = etParts(nowMs);
  const fmt = (p, h, m) => `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${h}:${m}`;
  const r = await tradier('/markets/timesales', {
    query: {
      symbol: SYMBOL,
      interval: '15min',
      start: fmt(s, '00', '00'),
      end: fmt(e, String(e.hour).padStart(2, '0'), String(e.minute).padStart(2, '0')),
      session_filter: 'all',
    },
  });
  const raw = asArray(r?.series?.data);
  const bars = [];
  let invalid = 0;
  for (const d of raw) {
    const time = parseEtTimestamp(d.time);
    const bar = {
      time,
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume ?? 0),
    };
    const ok =
      Number.isFinite(time) &&
      [bar.open, bar.high, bar.low, bar.close].every((v) => Number.isFinite(v) && v > 0) &&
      bar.high >= bar.low &&
      bar.high >= Math.max(bar.open, bar.close) - 1e-9 &&
      bar.low <= Math.min(bar.open, bar.close) + 1e-9;
    if (!ok) { invalid++; continue; }
    bars.push(bar);
  }
  bars.sort((a, b) => a.time - b.time);
  // De-duplicate on time, keeping the last copy.
  const dedup = [];
  for (const b of bars) {
    if (dedup.length && dedup[dedup.length - 1].time === b.time) dedup[dedup.length - 1] = b;
    else dedup.push(b);
  }
  // Drop the bar that is still forming (closes after now).
  const completed = dedup.filter((b) => b.time + BAR_MS <= nowMs);
  return { bars: completed, rawCount: raw.length, invalid, droppedForming: dedup.length - completed.length };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const PK = `${SYMBOL}#${STRATEGY_ID}`;

function freshState() {
  return {
    pk: PK,
    symbol: SYMBOL,
    strategyId: STRATEGY_ID,
    position: null,
    pendingOrderId: null,
    pendingOrder: null,
    lastProcessedBarTime: null,
    tradingDay: null,
    dayStartEquity: null,
    realizedPnlToday: 0,
    peakEquity: null,
    entriesAllowedFrom: null,
    drawdownTripBarTime: null,
  };
}

async function loadState() {
  const r = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: PK }, ConsistentRead: true }));
  return r.Item ? { ...freshState(), ...r.Item } : freshState();
}

async function saveState(state, barTime) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...state, lastProcessedBarTime: barTime, updatedAt: new Date().toISOString() },
      ConditionExpression: 'attribute_not_exists(pk) OR attribute_not_exists(lastProcessedBarTime) OR lastProcessedBarTime < :t',
      ExpressionAttributeValues: { ':t': barTime },
    }),
  );
}

// ---------------------------------------------------------------------------
// Order fills -> state
// ---------------------------------------------------------------------------
function applyFill(state, pending, order, notes) {
  const qty = Number(order.exec_quantity ?? 0);
  const price = Number(order.avg_fill_price ?? 0);
  if (!(qty > 0)) return;
  if (!(price > 0)) {
    notes.push(`order ${order.id} shows ${qty} filled but no avg_fill_price; leaving state for reconciliation`);
    return;
  }
  if (pending.kind === 'entry') {
    state.position = {
      side: pending.side,
      shares: qty,
      entryPrice: price,
      entryTime: order.transaction_date ? Date.parse(order.transaction_date) || Date.now() : Date.now(),
      stopLevel: null,
      targetLevel: null,
      exitOrderId: null,
    };
    notes.push(`entry ${pending.side} ${qty} @ ${price} filled (order ${order.id})`);
  } else if (pending.kind === 'exit' && state.position) {
    const dir = state.position.side === 'long' ? 1 : -1;
    const closed = Math.min(qty, state.position.shares);
    const pnl = (price - state.position.entryPrice) * closed * dir;
    state.realizedPnlToday = (state.realizedPnlToday ?? 0) + pnl;
    const remaining = state.position.shares - closed;
    notes.push(`exit ${closed} @ ${price} filled (order ${order.id}), realized ${pnl.toFixed(2)}`);
    state.position = remaining > 0 ? { ...state.position, shares: remaining, exitOrderId: null } : null;
  }
}

/** Resolve a pending order. Returns 'filled' | 'waiting' | 'dead'. */
function resolvePending(state, order, notes) {
  const pending = state.pendingOrder;
  const status = String(order?.status ?? 'unknown');
  if (status === 'filled') {
    applyFill(state, pending, order, notes);
    state.pendingOrder = null;
    state.pendingOrderId = null;
    return 'filled';
  }
  if (OPEN_ORDER_STATUSES.has(status)) {
    notes.push(`order ${pending.id} still ${status}; waiting`);
    return 'waiting';
  }
  if (DEAD_ORDER_STATUSES.has(status)) {
    notes.push(`order ${pending.id} ${status}${order?.reason_description ? `: ${order.reason_description}` : ''}`);
    // A partial fill before the cancel still happened.
    applyFill(state, pending, order, notes);
    if (pending.kind === 'exit' && state.position) state.position.exitOrderId = null;
    state.pendingOrder = null;
    state.pendingOrderId = null;
    return 'dead';
  }
  notes.push(`order ${pending.id} has unrecognized status ${status}; waiting`);
  return 'waiting';
}

async function waitForFill(accountId, orderId) {
  let order = null;
  for (let k = 0; k < FILL_POLL_ATTEMPTS; k++) {
    await sleep(FILL_POLL_MS);
    order = await getOrder(accountId, orderId);
    const st = String(order?.status ?? '');
    if (st === 'filled' || DEAD_ORDER_STATUSES.has(st)) return order;
  }
  return order;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export const handler = async (event = {}) => {
  const dryRun = event?.dryRun === true;
  const invokedAt = Date.now();
  const log = {
    level: 'info',
    app: 'tradier-paper-ibs-mean-reversion-qqq',
    strategy: STRATEGY_ID,
    symbol: SYMBOL,
    dryRun,
    invokedAt: new Date(invokedAt).toISOString(),
    params: PARAMS,
  };
  try {
    if (!TABLE_NAME || !SECRET_ID) throw new Error('TABLE_NAME and SECRET_ID must be set');
    if (!(MAX_DAILY_LOSS_PCT > 0)) throw new Error(`MAX_DAILY_LOSS_PCT must be positive, got ${process.env.MAX_DAILY_LOSS_PCT}`);

    // Read the just-closed bar a few seconds after the boundary.
    let now = Date.now();
    const boundary = Math.floor(now / BAR_MS) * BAR_MS;
    if (now - boundary < SETTLE_MS) {
      await sleep(SETTLE_MS - (now - boundary));
      now = Date.now();
    }
    log.expectedBarClose = new Date(boundary).toISOString();

    const { accountId } = await getCreds();

    // Reconciliation inputs first, before anything else.
    const [clock, balances, positions, orders, stored] = await Promise.all([
      getClock(),
      getBalances(accountId),
      getPositions(accountId),
      getOrders(accountId),
      loadState(),
    ]);
    const state = { ...stored };
    log.stateBefore = stored;
    log.clock = clock ? { state: clock.state, description: clock.description } : null;

    const equity = Number(balances?.total_equity);
    log.equity = equity;

    // Market data, polled briefly for the just-closed bar.
    let data;
    for (let k = 0; k < FRESHNESS_POLLS; k++) {
      data = await fetchBars(Date.now());
      const newest = data.bars[data.bars.length - 1];
      if (newest && newest.time + BAR_MS >= boundary) break;
      if (k < FRESHNESS_POLLS - 1) await sleep(FRESHNESS_POLL_GAP_MS);
    }
    const bars = data.bars;
    log.data = { rawBars: data.rawCount, invalidBars: data.invalid, droppedForming: data.droppedForming, completedBars: bars.length };

    const skip = (reason) => {
      log.action = 'none';
      log.why = reason;
      return { ok: true, action: 'none', reason };
    };

    // --- Data quality gates: never trade on missing, stale or incomplete data.
    if (bars.length === 0) return skip('no completed bars returned');
    const newest = bars[bars.length - 1];
    const barClose = newest.time + BAR_MS;
    log.bar = { time: new Date(newest.time).toISOString(), closeTime: new Date(barClose).toISOString(), open: newest.open, high: newest.high, low: newest.low, close: newest.close, volume: newest.volume };
    if (barClose < boundary) return skip(`stale data: newest completed bar closed ${new Date(barClose).toISOString()}, expected ${new Date(boundary).toISOString()}`);
    if (Date.now() - barClose > BAR_MS + MAX_LATENESS_MS) return skip('stale data: newest completed bar is older than one interval plus grace');
    if (invokedAt - boundary > MAX_LATENESS_MS) return skip(`invoked ${Math.round((invokedAt - boundary) / 1000)}s after the bar closed; too late to act on it`);
    if (bars.length < MIN_BARS) return skip(`only ${bars.length} completed bars; need ${MIN_BARS} for warm indicators`);
    if (!(equity > 0)) return skip(`balances returned no usable total_equity (${balances?.total_equity})`);

    const duplicate = state.lastProcessedBarTime != null && newest.time <= state.lastProcessedBarTime;
    if (duplicate && !dryRun) return skip(`bar ${log.bar.time} already processed (lastProcessedBarTime ${new Date(state.lastProcessedBarTime).toISOString()})`);
    if (duplicate) log.duplicateBar = true;

    // --- Indicators and the signal.
    const series = computeIndicators(bars);
    const index = series.length - 1;
    const current = series[index];
    const previous = series[index - 1];

    // --- Reconcile against Tradier. Tradier wins.
    const notes = [];
    let blockTrading = null;

    // Day roll (US/Eastern), before any fill adds realized P&L.
    const today = etDate(Date.now());
    if (state.tradingDay !== today) {
      state.tradingDay = today;
      state.dayStartEquity = equity;
      state.realizedPnlToday = 0;
      notes.push(`new trading day ${today}, starting equity ${equity}`);
    }

    if (state.pendingOrder) {
      let order = null;
      try {
        order = await getOrder(accountId, state.pendingOrder.id);
      } catch (err) {
        if (err.status === 404) order = { id: state.pendingOrder.id, status: 'error', exec_quantity: 0 };
        else throw err;
      }
      const outcome = resolvePending(state, order, notes);
      if (outcome === 'waiting') blockTrading = `order ${state.pendingOrder.id} still pending`;
    }

    const tPos = positions.find((p) => p.symbol === SYMBOL);
    const tQty = tPos ? Number(tPos.quantity) : 0;
    const sQty = state.position ? (state.position.side === 'long' ? 1 : -1) * state.position.shares : 0;
    const openForSymbol = orders.filter((o) => o.symbol === SYMBOL && OPEN_ORDER_STATUSES.has(String(o.status)));
    const unknownOpen = openForSymbol.filter((o) => String(o.id) !== String(state.pendingOrder?.id ?? ''));
    log.tradier = { positionQty: tQty, openOrders: openForSymbol.map((o) => ({ id: o.id, side: o.side, status: o.status, qty: o.quantity, tag: o.tag })) };

    if (!blockTrading && tQty !== sQty) {
      const msg = `RECONCILIATION MISMATCH: Tradier holds ${tQty} ${SYMBOL}, DynamoDB says ${sQty}. Trusting Tradier and skipping trading this bar.`;
      log.level = 'warn';
      log.mismatch = msg;
      console.warn(msg);
      state.position =
        tQty === 0
          ? null
          : {
              side: tQty > 0 ? 'long' : 'short',
              shares: Math.abs(tQty),
              entryPrice: Math.abs(Number(tPos.cost_basis) / tQty),
              entryTime: tPos.date_acquired ? Date.parse(tPos.date_acquired) : Date.now(),
              stopLevel: null,
              targetLevel: null,
              exitOrderId: null,
            };
      blockTrading = 'reconciliation mismatch';
    }
    if (unknownOpen.length > 0) {
      const msg = `RECONCILIATION MISMATCH: Tradier has open ${SYMBOL} orders DynamoDB doesn't know about (${unknownOpen.map((o) => o.id).join(', ')}). Skipping trading this bar.`;
      log.level = 'warn';
      log.mismatch = (log.mismatch ? log.mismatch + ' ' : '') + msg;
      console.warn(msg);
      blockTrading = blockTrading ?? 'unknown open orders';
    }

    const positionSide = state.position ? state.position.side : null;
    const signal = strategyHandler({ current, previous, index, series, params: PARAMS, position: positionSide });

    log.indicators = {
      ibs: ibs(current),
      close: current.close,
      high: current.high,
      low: current.low,
      sma200: current.sma200 ?? null,
      entryIbs: PARAMS.entryIbs / 100,
      exitIbs: PARAMS.exitIbs / 100,
      shortEntryIbs: 1 - PARAMS.entryIbs / 100,
      shortExitIbs: 1 - PARAMS.exitIbs / 100,
      // Logged for comparison with the backtest; the strategy doesn't read these.
      ema9: current.ema9 ?? null,
      ema21: current.ema21 ?? null,
      rsi: current.rsi ?? null,
      atr: current.atr ?? null,
      macd: current.macd ?? null,
    };
    log.signal = { action: signal.action, reason: signal.reason, positionGoingIn: positionSide };

    // --- Decide. Step 1: strategy exit. Step 2: entry (flat, no exit this bar).
    let decision = null; // { kind: 'exit'|'entry', side, orderSide, quantity, reason }
    const why = [];

    // Entry gates.
    const barsSinceTrip = state.drawdownTripBarTime != null ? series.filter((b) => b.time > state.drawdownTripBarTime).length : Infinity;
    const entriesPaused = barsSinceTrip < DRAWDOWN_PAUSE_BARS;
    const dailyLossLimit = (MAX_DAILY_LOSS_PCT / 100) * (state.dayStartEquity ?? equity);
    const dailyLossHit = (state.realizedPnlToday ?? 0) <= -dailyLossLimit;

    if (blockTrading) {
      why.push(`trading blocked: ${blockTrading}`);
    } else if (state.position && ((signal.action === 'sell' && positionSide === 'long') || (signal.action === 'buy' && positionSide === 'short'))) {
      decision = {
        kind: 'exit',
        side: positionSide,
        orderSide: positionSide === 'long' ? 'sell' : 'buy_to_cover',
        quantity: state.position.shares,
        reason: signal.reason,
      };
    } else if (!state.position && (signal.action === 'buy' || (signal.action === 'sell' && ENABLE_SHORTS))) {
      const side = signal.action === 'buy' ? 'long' : 'short';
      const shares = Math.floor((equity * (POSITION_SIZE_PCT / 100)) / current.close + 1e-9);
      if (entriesPaused) why.push(`entry ${side} skipped: drawdown pause, ${barsSinceTrip}/${DRAWDOWN_PAUSE_BARS} bars since the limit tripped`);
      else if (dailyLossHit) why.push(`entry ${side} skipped: daily loss ${state.realizedPnlToday.toFixed(2)} reached ${MAX_DAILY_LOSS_PCT}% of ${state.dayStartEquity}`);
      else if (!(shares > 0)) why.push(`entry ${side} skipped: size is 0 shares (equity ${equity}, close ${current.close})`);
      else decision = { kind: 'entry', side, orderSide: side === 'long' ? 'buy' : 'sell_short', quantity: shares, reason: signal.reason };
    } else if (signal.action !== 'hold') {
      why.push(`signal ${signal.action} ignored with position ${positionSide ?? 'flat'}`);
    } else {
      why.push('hold');
    }

    // --- Step 3: drawdown limit, last.
    let cancelIds = [];
    if (state.peakEquity == null || equity > state.peakEquity) state.peakEquity = equity;
    const tripCheckAllowed = barsSinceTrip >= DRAWDOWN_PAUSE_BARS + 1;
    const drawdownFloor = state.peakEquity * (1 - DRAWDOWN_LIMIT_PCT / 100);
    log.drawdown = { equity, peakEquity: state.peakEquity, floor: drawdownFloor, barsSinceTrip: Number.isFinite(barsSinceTrip) ? barsSinceTrip : null };
    if (tripCheckAllowed && equity <= drawdownFloor) {
      if (blockTrading) {
        why.push(`drawdown limit reached (equity ${equity} <= ${drawdownFloor.toFixed(2)}) but trading is blocked; will re-check next bar`);
      } else {
        why.push(`drawdown limit ${DRAWDOWN_LIMIT_PCT}% reached (equity ${equity} <= ${drawdownFloor.toFixed(2)}); sitting out ${DRAWDOWN_PAUSE_BARS} bars`);
        cancelIds = openForSymbol.map((o) => String(o.id));
        decision = state.position
          ? {
              kind: 'exit',
              side: state.position.side,
              orderSide: state.position.side === 'long' ? 'sell' : 'buy_to_cover',
              quantity: state.position.shares,
              reason: `Max drawdown ${DRAWDOWN_LIMIT_PCT}% reached; sitting out ${DRAWDOWN_PAUSE_BARS} bars`,
            }
          : null;
        state.drawdownTripBarTime = newest.time;
        // Clock estimate of the first bar entries may fill on again; the gate
        // itself counts real bars, which is never sooner.
        state.entriesAllowedFrom = newest.time + (DRAWDOWN_PAUSE_BARS + 1) * BAR_MS;
        state.peakEquity = equity;
      }
    }

    // --- Orders only in regular hours (market orders are regular-session only).
    const closeMin = etMinutesOfDay(barClose);
    const regularHours = clock?.state === 'open' && closeMin >= 9 * 60 + 30 && closeMin < 16 * 60;
    log.regularHours = regularHours;

    const ordersPlaced = [];
    const wouldPlace = [];
    if (decision) {
      const tag = `ibs-qqq-${newest.time}`;
      const intended = { kind: decision.kind, side: decision.orderSide, quantity: decision.quantity, type: 'market', duration: 'day', reason: decision.reason, cancelFirst: cancelIds, tag };
      if (dryRun || !regularHours) {
        wouldPlace.push(intended);
        why.push(dryRun ? 'dry run: no orders placed' : 'outside regular hours: logged what it would have done');
      } else {
        for (const id of cancelIds) {
          await cancelOrder(accountId, id);
          ordersPlaced.push({ cancelled: id });
        }
        const orderId = await placeMarketOrder(accountId, { side: decision.orderSide, quantity: decision.quantity, tag });
        ordersPlaced.push({ ...intended, orderId });
        state.pendingOrder = { id: orderId, kind: decision.kind, side: decision.side, orderSide: decision.orderSide, quantity: decision.quantity, barTime: newest.time, placedAt: Date.now(), reason: decision.reason };
        state.pendingOrderId = orderId;
        if (decision.kind === 'exit' && state.position) state.position.exitOrderId = orderId;
        const order = await waitForFill(accountId, orderId);
        resolvePending(state, order, notes);
      }
    }

    log.action = decision ? `${decision.kind} ${decision.side}` : 'none';
    log.why = why.join('; ');
    log.notes = notes;
    log.ordersPlaced = ordersPlaced;
    log.wouldPlace = wouldPlace;
    log.limits = { maxDailyLossPct: MAX_DAILY_LOSS_PCT, realizedPnlToday: state.realizedPnlToday, dayStartEquity: state.dayStartEquity, dailyLossHit, entriesPaused };
    log.stateAfter = state;

    if (!dryRun) {
      await saveState(state, newest.time);
      log.stateWritten = true;
    } else {
      log.stateWritten = false;
    }
    return { ok: true, action: log.action, dryRun };
  } catch (err) {
    log.level = 'error';
    log.error = { name: err?.name, message: err?.message, status: err?.status, stack: err?.stack?.split('\n').slice(0, 5).join(' | ') };
    throw err;
  } finally {
    log.durationMs = Date.now() - invokedAt;
    console.log(JSON.stringify(log));
  }
};
