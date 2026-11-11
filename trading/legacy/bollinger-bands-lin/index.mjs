/**
 * Bollinger Bands paper-trader for LIN on 1h bars.
 * Tradier SANDBOX ONLY. Node.js 22.x, handler = index.handler, no npm dependencies.
 *
 * Strategy: bollinger-bands, period=9, stdDev=1, long only.
 * Entries/exits at market right after the newest completed 1h bar closes.
 * Stop loss 1% below the entry's avg_fill_price, as a resting GTC stop order at Tradier.
 * No take profit, no trailing stop.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// ---------------------------------------------------------------------------
// Hard guardrail: sandbox only. Not configurable.
// ---------------------------------------------------------------------------
const TRADIER_BASE_URL = 'https://sandbox.tradier.com/v1';
if (!TRADIER_BASE_URL.includes('sandbox.tradier.com')) {
  throw new Error('GUARDRAIL: TRADIER_BASE_URL must point at sandbox.tradier.com');
}

// ---------------------------------------------------------------------------
// Fixed strategy / risk configuration (mirrors the backtest)
// ---------------------------------------------------------------------------
const SYMBOL = 'LIN';
const STRATEGY_ID = 'bollinger-bands';
const PARAMS = { period: 9, stdDev: 1 };
const BAR_INTERVAL_MS = 60 * 60 * 1000; // 1h
const TIMESALES_INTERVAL = '15min'; // aggregated into 1h
const SESSION_FILTER = 'all'; // backtest data included pre/post market
const STOP_LOSS_PCT = 0.01; // 1% against entry fill
const TAKE_PROFIT_PCT = null; // none in the backtest
const EQUITY_FRACTION = 1.0; // 100% of total_equity per new position
const DAY_ORDER_DURATION = 'day';
const EXIT_ORDER_DURATION = 'gtc';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const TABLE_NAME = process.env.STATE_TABLE_NAME || 'trading-bot-state';
const SECRET_ID = process.env.TRADIER_SECRET_ID || 'tradier/sandbox';
const MAX_DAILY_LOSS_PCT = numEnv('MAX_DAILY_LOSS_PCT', 2);
const LOOKBACK_DAYS = Math.max(5, Math.floor(numEnv('LOOKBACK_DAYS', 45)));
const MIN_BARS = Math.max(50, Math.floor(numEnv('MIN_BARS', 250)));
const STALENESS_GRACE_MIN = numEnv('STALENESS_GRACE_MIN', 10);
const DRY_RUN = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';

function numEnv(name, dflt) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return dflt;
  const v = Number(raw);
  return Number.isFinite(v) ? v : dflt;
}

const STATE_KEY = `${SYMBOL}#${STRATEGY_ID}`;

// ---------------------------------------------------------------------------
// AWS clients (module scope so they are reused across warm invocations)
// ---------------------------------------------------------------------------
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const sm = new SecretsManagerClient({});
let cachedSecret = null; // { token, accountId }

async function getSecret() {
  if (cachedSecret) return cachedSecret;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  if (!res.SecretString) throw new Error(`Secret ${SECRET_ID} has no SecretString`);
  let parsed;
  try {
    parsed = JSON.parse(res.SecretString);
  } catch {
    throw new Error(`Secret ${SECRET_ID} is not valid JSON`);
  }
  const token = parsed.TRADIER_SANDBOX_TOKEN || parsed.access_token || parsed.token;
  const accountId = parsed.TRADIER_SANDBOX_ACCOUNT_ID || parsed.account_id || parsed.accountId;
  if (!token || !accountId) {
    throw new Error(
      `Secret ${SECRET_ID} must contain TRADIER_SANDBOX_TOKEN and TRADIER_SANDBOX_ACCOUNT_ID`
    );
  }
  cachedSecret = { token: String(token), accountId: String(accountId) };
  return cachedSecret;
}

// ---------------------------------------------------------------------------
// Time helpers (US/Eastern <-> UTC epoch ms) without dependencies
// ---------------------------------------------------------------------------
const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function etParts(ms) {
  const p = {};
  for (const { type, value } of ET_FMT.formatToParts(ms)) {
    if (type !== 'literal') p[type] = value;
  }
  return {
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour) % 24,
    mi: Number(p.minute),
    s: Number(p.second),
  };
}

/** "2026-10-01T09:45:00" (US/Eastern wall clock) -> UTC epoch ms */
function etStringToUtcMs(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(str));
  if (!m) return NaN;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  let ts = naive;
  for (let i = 0; i < 3; i++) {
    const p = etParts(ts);
    const asIfUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    const delta = naive - asIfUtc;
    if (delta === 0) break;
    ts += delta;
  }
  return ts;
}

function etDateString(ms) {
  const p = etParts(ms);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function etTimesalesStamp(ms) {
  const p = etParts(ms);
  return `${etDateString(ms)} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}

function etMinutesOfDay(ms) {
  const p = etParts(ms);
  return p.h * 60 + p.mi;
}

/** Regular session: weekday, 9:30am-4:00pm ET. Market holidays are not checked;
 *  the broker rejecting an order on a holiday is the backstop. */
function isRegularHours(ms) {
  const p = etParts(ms);
  const weekdayIdx = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay(); // 0=Sun
  if (weekdayIdx === 0 || weekdayIdx === 6) return false;
  const mins = p.h * 60 + p.mi;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Tradier HTTP with bounded retry (network errors and 5xx only; never 4xx)
// ---------------------------------------------------------------------------
async function tradier(method, path, { query, form, token } = {}) {
  const url = new URL(`${TRADIER_BASE_URL}${path}`);
  if (!url.host.endsWith('sandbox.tradier.com')) {
    throw new Error('GUARDRAIL: refusing to call a non-sandbox host');
  }
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const init = { method, headers };
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  }

  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastErr = new Error(`network error calling ${method} ${path}: ${err.message}`);
      if (attempt === MAX_ATTEMPTS) throw lastErr;
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }
    const text = await res.text();
    if (res.status >= 500) {
      lastErr = new Error(`Tradier ${res.status} on ${method} ${path}: ${text.slice(0, 400)}`);
      if (attempt === MAX_ATTEMPTS) throw lastErr;
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }
    if (!res.ok) {
      // 4xx: permanent, never retried.
      throw new Error(`Tradier ${res.status} on ${method} ${path}: ${text.slice(0, 400)}`);
    }
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Tradier returned non-JSON on ${method} ${path}: ${text.slice(0, 200)}`);
    }
  }
  throw lastErr;
}

/** Tradier returns single objects, arrays, or the string "null". Normalize to an array. */
function asArray(node) {
  if (node === null || node === undefined || node === 'null') return [];
  return Array.isArray(node) ? node : [node];
}

// ---------------------------------------------------------------------------
// Market data: 15min timesales -> 1h bars (UTC epoch ms, oldest first)
// ---------------------------------------------------------------------------
async function fetchHourBars(token, now) {
  const start = etTimesalesStamp(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const end = etTimesalesStamp(now + 24 * 60 * 60 * 1000);
  const json = await tradier('GET', '/markets/timesales', {
    token,
    query: {
      symbol: SYMBOL,
      interval: TIMESALES_INTERVAL,
      start,
      end,
      session_filter: SESSION_FILTER,
    },
  });
  const raw = asArray(json?.series?.data);
  const buckets = new Map();
  let badRows = 0;

  for (const row of raw) {
    const t = etStringToUtcMs(row.time);
    if (!Number.isFinite(t)) {
      badRows++;
      continue;
    }
    const o = Number(row.open);
    const h = Number(row.high);
    const l = Number(row.low);
    const c = Number(row.close);
    const v = Number(row.volume ?? 0);
    if (![o, h, l, c].every(Number.isFinite)) {
      badRows++;
      continue;
    }
    const barTime = Math.floor(t / BAR_INTERVAL_MS) * BAR_INTERVAL_MS;
    const b = buckets.get(barTime);
    if (!b) {
      buckets.set(barTime, {
        time: barTime,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: Number.isFinite(v) ? v : 0,
        firstSub: t,
        lastSub: t,
        subBars: 1,
      });
    } else {
      b.high = Math.max(b.high, h);
      b.low = Math.min(b.low, l);
      b.volume += Number.isFinite(v) ? v : 0;
      b.subBars += 1;
      if (t > b.lastSub) {
        b.lastSub = t;
        b.close = c;
      }
      if (t < b.firstSub) {
        b.firstSub = t;
        b.open = o;
      }
    }
  }

  const bars = [...buckets.values()].sort((a, b) => a.time - b.time);
  for (const b of bars) {
    delete b.lastSub;
    delete b.firstSub;
  }
  return { bars, badRows, rawCount: raw.length };
}

// ---------------------------------------------------------------------------
// Indicators, computed over the whole series, oldest bar first
// ---------------------------------------------------------------------------
function sma(values, n, i) {
  if (i < n - 1) return undefined;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += values[k];
  return s / n;
}

function emaSeries(values, n) {
  const out = new Array(values.length).fill(undefined);
  if (values.length < n) return out;
  let seed = 0;
  for (let i = 0; i < n; i++) seed += values[i];
  out[n - 1] = seed / n;
  const k = 2 / (n + 1);
  for (let i = n; i < values.length; i++) {
    out[i] = (values[i] - out[i - 1]) * k + out[i - 1];
  }
  return out;
}

function rsiSeries(closes, n = 14) {
  const out = new Array(closes.length).fill(undefined);
  if (closes.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss += -d;
  }
  let avgGain = gain / n;
  let avgLoss = loss / n;
  out[n] = rsiFrom(avgGain, avgLoss);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (n - 1) + g) / n;
    avgLoss = (avgLoss * (n - 1) + l) / n;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

function rsiFrom(avgGain, avgLoss) {
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atrSeries(bars, n = 14) {
  const out = new Array(bars.length).fill(undefined);
  if (bars.length <= n) return out;
  const tr = new Array(bars.length).fill(undefined);
  for (let i = 1; i < bars.length; i++) {
    const pc = bars[i - 1].close;
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - pc),
      Math.abs(bars[i].low - pc)
    );
  }
  let seed = 0;
  for (let i = 1; i <= n; i++) seed += tr[i];
  out[n] = seed / n;
  for (let i = n + 1; i < bars.length; i++) {
    out[i] = (out[i - 1] * (n - 1) + tr[i]) / n;
  }
  return out;
}

function macdSeries(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const ef = emaSeries(closes, fast);
  const es = emaSeries(closes, slow);
  const macd = closes.map((_, i) =>
    ef[i] !== undefined && es[i] !== undefined ? ef[i] - es[i] : undefined
  );
  const firstIdx = macd.findIndex((v) => v !== undefined);
  const signal = new Array(closes.length).fill(undefined);
  const hist = new Array(closes.length).fill(undefined);
  if (firstIdx >= 0) {
    const k = 2 / (signalPeriod + 1);
    let prev = macd[firstIdx];
    signal[firstIdx] = prev;
    hist[firstIdx] = macd[firstIdx] - prev;
    for (let i = firstIdx + 1; i < closes.length; i++) {
      if (macd[i] === undefined) continue;
      prev = (macd[i] - prev) * k + prev;
      signal[i] = prev;
      hist[i] = macd[i] - prev;
    }
  }
  return { macd, signal, hist };
}

function donchian(bars, n, i) {
  if (i < n - 1) return { upperBand: undefined, lowerBand: undefined, midLine: undefined };
  let hi = -Infinity;
  let lo = Infinity;
  for (let k = i - n + 1; k <= i; k++) {
    hi = Math.max(hi, bars[k].high);
    lo = Math.min(lo, bars[k].low);
  }
  return { upperBand: hi, lowerBand: lo, midLine: (hi + lo) / 2 };
}

function buildSeries(bars) {
  const closes = bars.map((b) => b.close);
  const emaPeriods = [9, 21, 12, 26];
  const emas = {};
  for (const n of emaPeriods) emas[n] = emaSeries(closes, n);
  const rsi = rsiSeries(closes, 14);
  const atr = atrSeries(bars, 14);
  const { macd, signal, hist } = macdSeries(closes, 12, 26, 9);

  return bars.map((b, i) => {
    const row = { ...b };
    row.sma9 = sma(closes, 9, i);
    row.sma20 = sma(closes, 20, i);
    row.sma50 = sma(closes, 50, i);
    row[`sma${PARAMS.period}`] = sma(closes, PARAMS.period, i);
    for (const n of emaPeriods) row[`ema${n}`] = emas[n][i];
    row.rsi = rsi[i];
    row.atr = atr[i];
    row.macd_12_26_9 = macd[i];
    row.macdSignal_12_26_9 = signal[i];
    row.macdHistogram_12_26_9 = hist[i];
    row.macd = macd[i];
    row.macdSignal = signal[i];
    row.macdHistogram = hist[i];
    const d20 = donchian(bars, 20, i);
    row.donchian_20_upperBand = d20.upperBand;
    row.donchian_20_lowerBand = d20.lowerBand;
    row.donchian_20_midLine = d20.midLine;
    row.upperBand = d20.upperBand;
    row.lowerBand = d20.lowerBand;
    row.midLine = d20.midLine;
    row.prevClose = i > 0 ? bars[i - 1].close : undefined;
    row.prevHigh = i > 0 ? bars[i - 1].high : undefined;
    row.prevLow = i > 0 ? bars[i - 1].low : undefined;
    return row;
  });
}

// ---------------------------------------------------------------------------
// Strategy handler: direct port of the backtester's TypeScript, behavior unchanged
// ---------------------------------------------------------------------------
function strategyHandler({ current, previous, params, series, index }) {
  const period = params.period || 20;
  const stdDev = params.stdDev || 2;

  if (index < period - 1) {
    return { action: 'hold', reason: 'Waiting for Bollinger Bands' };
  }

  const closes = series.slice(index - period + 1, index + 1).map((d) => d.close);

  const smaVal = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, price) => sum + Math.pow(price - smaVal, 2), 0) / period;
  const std = Math.sqrt(variance);

  const upperBand = smaVal + stdDev * std;
  const lowerBand = smaVal - stdDev * std;

  const currentPrice = current.close;
  const previousPrice = previous?.close;

  if (!previousPrice) {
    return { action: 'hold', reason: 'Waiting for previous price' };
  }

  if (previousPrice > lowerBand && currentPrice < lowerBand) {
    return {
      action: 'buy',
      reason: `Price touched lower Bollinger Band (${currentPrice.toFixed(2)} < ${lowerBand.toFixed(2)})`,
    };
  }

  if (previousPrice < upperBand && currentPrice > upperBand) {
    return {
      action: 'sell',
      reason: `Price touched upper Bollinger Band (${currentPrice.toFixed(2)} > ${upperBand.toFixed(2)})`,
    };
  }

  return { action: 'hold', reason: '' };
}

/** Recompute the bands for logging, with the same math as the handler. */
function bollinger(series, index, period, stdDev) {
  if (index < period - 1) return {};
  const closes = series.slice(index - period + 1, index + 1).map((d) => d.close);
  const mid = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((s, p) => s + Math.pow(p - mid, 2), 0) / period;
  const std = Math.sqrt(variance);
  return {
    bbMiddle: round(mid),
    bbUpper: round(mid + stdDev * std),
    bbLower: round(mid - stdDev * std),
    bbStdDev: round(std),
  };
}

const round = (v, dp = 4) =>
  typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(dp)) : undefined;

// ---------------------------------------------------------------------------
// DynamoDB state
// ---------------------------------------------------------------------------
const EMPTY_STATE = {
  position: null,
  pendingOrderId: null,
  lastProcessedBarTime: null,
  tradingDay: null,
  dayStartEquity: null,
  realizedPnlToday: 0,
};

async function readState() {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { symbolStrategy: STATE_KEY } })
  );
  const item = res.Item || {};
  return {
    ...EMPTY_STATE,
    ...item,
    position: item.position ?? null,
    pendingOrderId: item.pendingOrderId ?? null,
    lastProcessedBarTime:
      item.lastProcessedBarTime === undefined || item.lastProcessedBarTime === null
        ? null
        : Number(item.lastProcessedBarTime),
    realizedPnlToday: Number(item.realizedPnlToday ?? 0),
    dayStartEquity:
      item.dayStartEquity === undefined || item.dayStartEquity === null
        ? null
        : Number(item.dayStartEquity),
  };
}

/**
 * Single write at the very end of the invocation.
 * mode 'advance' claims a new bar (idempotency guard); mode 'same' only persists
 * bookkeeping for a bar already processed.
 */
async function writeState(state, barTime, mode) {
  const names = {
    '#p': 'position',
    '#po': 'pendingOrderId',
    '#lb': 'lastProcessedBarTime',
    '#td': 'tradingDay',
    '#de': 'dayStartEquity',
    '#pnl': 'realizedPnlToday',
    '#ua': 'updatedAt',
  };
  const values = {
    ':p': state.position ?? null,
    ':po': state.pendingOrderId ?? null,
    ':lb': barTime,
    ':td': state.tradingDay ?? null,
    ':de': state.dayStartEquity ?? null,
    ':pnl': Number(state.realizedPnlToday ?? 0),
    ':ua': new Date().toISOString(),
  };
  const cmd = {
    TableName: TABLE_NAME,
    Key: { symbolStrategy: STATE_KEY },
    UpdateExpression:
      'SET #p = :p, #po = :po, #lb = :lb, #td = :td, #de = :de, #pnl = :pnl, #ua = :ua',
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression:
      mode === 'advance'
        ? 'attribute_not_exists(#lb) OR #lb < :lb'
        : 'attribute_not_exists(#lb) OR #lb = :lb',
  };
  await ddb.send(new UpdateCommand(cmd));
}

// ---------------------------------------------------------------------------
// Tradier account helpers
// ---------------------------------------------------------------------------
async function getEquity(token, accountId) {
  const json = await tradier('GET', `/accounts/${accountId}/balances`, { token });
  const eq = Number(json?.balances?.total_equity);
  return Number.isFinite(eq) ? eq : null;
}

async function getPositionQty(token, accountId) {
  const json = await tradier('GET', `/accounts/${accountId}/positions`, { token });
  const rows = asArray(json?.positions?.position);
  let qty = 0;
  for (const r of rows) {
    if (String(r.symbol).toUpperCase() === SYMBOL) qty += Number(r.quantity) || 0;
  }
  return qty;
}

const OPEN_STATUSES = new Set(['open', 'partially_filled', 'pending', 'submitted', 'accepted']);

async function getOrders(token, accountId) {
  const json = await tradier('GET', `/accounts/${accountId}/orders`, {
    token,
    query: { includeTags: 'true' },
  });
  return asArray(json?.orders?.order).filter(
    (o) => String(o.symbol || '').toUpperCase() === SYMBOL
  );
}

async function getOrder(token, accountId, orderId) {
  const json = await tradier('GET', `/accounts/${accountId}/orders/${orderId}`, { token });
  return json?.order ?? null;
}

async function placeOrder(token, accountId, form) {
  const json = await tradier('POST', `/accounts/${accountId}/orders`, { token, form });
  const id = json?.order?.id;
  if (!id) throw new Error(`Order placement returned no id: ${JSON.stringify(json).slice(0, 300)}`);
  return String(id);
}

async function cancelOrder(token, accountId, orderId) {
  await tradier('DELETE', `/accounts/${accountId}/orders/${orderId}`, { token });
}

const CANCELLED_STATUSES = new Set(['canceled', 'cancelled', 'rejected', 'expired', 'error']);

/** Poll an order a few times looking for a terminal state. */
async function awaitOrder(token, accountId, orderId, attempts = 6, delayMs = 2000) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    last = await getOrder(token, accountId, orderId);
    const status = String(last?.status || '').toLowerCase();
    if (status === 'filled' || CANCELLED_STATUSES.has(status)) return last;
    await sleep(delayMs);
  }
  return last;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export const handler = async (event) => {
  const now = Date.now();
  const log = {
    ts: new Date(now).toISOString(),
    env: 'tradier-sandbox',
    baseUrl: TRADIER_BASE_URL,
    symbol: SYMBOL,
    strategyId: STRATEGY_ID,
    params: PARAMS,
    dryRun: DRY_RUN,
    ordersAllowed: isRegularHours(now),
    etNow: etTimesalesStamp(now),
    actions: [],
    orders: [],
    notes: [],
  };

  try {
    const { token, accountId } = await getSecret();
    log.accountId = mask(accountId);

    const state = await readState();
    const incoming = JSON.parse(JSON.stringify(state));

    // --- market data ----------------------------------------------------
    const { bars, badRows, rawCount } = await fetchHourBars(token, now);
    log.data = { rawTimesalesRows: rawCount, droppedRows: badRows, hourBars: bars.length };

    // Drop the bar that is still forming.
    const completed = bars.filter((b) => b.time + BAR_INTERVAL_MS <= now);
    log.data.completedBars = completed.length;
    if (bars.length > completed.length) {
      log.notes.push(`dropped forming bar at ${new Date(bars[bars.length - 1].time).toISOString()}`);
    }

    if (completed.length < MIN_BARS) {
      log.decision = 'no_action';
      log.reason = `insufficient history: ${completed.length} completed 1h bars < MIN_BARS ${MIN_BARS}`;
      return finish(log, null, null, null);
    }

    const series = buildSeries(completed);
    const index = series.length - 1;
    const current = series[index];
    const previous = series[index - 1];
    const barTime = current.time;
    const barAgeMs = now - (barTime + BAR_INTERVAL_MS);

    log.bar = {
      barTime: new Date(barTime).toISOString(),
      barTimeEt: etTimesalesStamp(barTime),
      barTimeMs: barTime,
      open: current.open,
      high: current.high,
      low: current.low,
      close: current.close,
      volume: current.volume,
      subBars: current.subBars,
      ageMinutes: round(barAgeMs / 60000, 1),
    };
    log.indicators = {
      ...bollinger(series, index, PARAMS.period, PARAMS.stdDev),
      previousClose: previous?.close,
      sma9: round(current.sma9),
      ema9: round(current.ema9),
      ema21: round(current.ema21),
      rsi: round(current.rsi, 2),
      atr: round(current.atr),
      macd: round(current.macd),
      macdSignal: round(current.macdSignal),
      macdHistogram: round(current.macdHistogram),
      donchian20Upper: round(current.upperBand),
      donchian20Lower: round(current.lowerBand),
      prevClose: round(current.prevClose),
    };

    // --- staleness ------------------------------------------------------
    if (barAgeMs > BAR_INTERVAL_MS + STALENESS_GRACE_MIN * 60 * 1000) {
      log.decision = 'no_action';
      log.reason = `stale data: newest completed bar is ${Math.round(barAgeMs / 60000)} min old (limit ${60 + STALENESS_GRACE_MIN} min)`;
      return finish(log, null, null, null);
    }
    if (!Number.isFinite(current.close) || !previous || !Number.isFinite(previous.close)) {
      log.decision = 'no_action';
      log.reason = 'incomplete bar data';
      return finish(log, null, null, null);
    }

    // --- reconcile against Tradier --------------------------------------
    const [brokerQty, brokerOrders, equity] = await Promise.all([
      getPositionQty(token, accountId),
      getOrders(token, accountId),
      getEquity(token, accountId),
    ]);
    const openOrders = brokerOrders.filter((o) =>
      OPEN_STATUSES.has(String(o.status || '').toLowerCase())
    );
    log.broker = {
      positionQty: brokerQty,
      openOrderIds: openOrders.map((o) => String(o.id)),
      totalEquity: equity,
    };

    if (equity === null || !Number.isFinite(equity) || equity <= 0) {
      log.decision = 'no_action';
      log.reason = 'could not read a usable total_equity from Tradier balances';
      return finish(log, null, null, null);
    }

    // --- trading-day bookkeeping ---------------------------------------
    const today = etDateString(now);
    if (state.tradingDay !== today) {
      state.tradingDay = today;
      state.dayStartEquity = equity;
      state.realizedPnlToday = 0;
      log.notes.push(`new trading day ${today}, dayStartEquity=${equity}`);
    }
    if (!Number.isFinite(state.dayStartEquity) || state.dayStartEquity === null) {
      state.dayStartEquity = equity;
    }

    const alreadyProcessed =
      state.lastProcessedBarTime !== null && barTime <= state.lastProcessedBarTime;
    log.alreadyProcessedBar = alreadyProcessed;

    // --- mismatch detection ---------------------------------------------
    const ddbShares = state.position ? Number(state.position.shares) : 0;
    const trackedIds = new Set(
      [state.pendingOrderId, state.position?.exitOrderId].filter(Boolean).map(String)
    );
    const untracked = openOrders.filter((o) => !trackedIds.has(String(o.id)));

    // An open order may have filled since we last looked: resolve tracked orders
    // before judging the position mismatch.
    let exitedThisBar = false;

    // 1. Pending entry order from a previous invocation.
    if (state.pendingOrderId) {
      const ord = await getOrder(token, accountId, state.pendingOrderId);
      const status = String(ord?.status || '').toLowerCase();
      log.pendingOrder = { id: String(state.pendingOrderId), status };
      if (status === 'filled') {
        const fill = Number(ord.avg_fill_price);
        const qty = Math.floor(Number(ord.exec_quantity ?? ord.quantity) || 0);
        if (Number.isFinite(fill) && fill > 0 && qty > 0) {
          state.position = {
            side: 'long',
            shares: qty,
            entryPrice: fill,
            entryTime: new Date(now).toISOString(),
            stopLevel: round(fill * (1 - STOP_LOSS_PCT), 2),
            targetLevel: null,
            exitOrderId: null,
          };
          state.pendingOrderId = null;
          log.actions.push('entry order from previous invocation confirmed filled');
          const stopId = await ensureStopOrder(token, accountId, state, log);
          if (stopId) state.position.exitOrderId = stopId;
        } else {
          log.notes.push('entry order filled but avg_fill_price/quantity unusable; waiting');
        }
      } else if (OPEN_STATUSES.has(status)) {
        log.decision = 'no_action';
        log.reason = `entry order ${state.pendingOrderId} still ${status}; waiting rather than placing another`;
        return finish(log, state, barTime, alreadyProcessed ? 'same' : 'advance');
      } else {
        log.notes.push(`entry order ${state.pendingOrderId} ended ${status}; returning to flat`);
        state.pendingOrderId = null;
        state.position = null;
      }
    }

    // 2. Resting stop order.
    if (state.position?.exitOrderId) {
      const ord = await getOrder(token, accountId, state.position.exitOrderId);
      const status = String(ord?.status || '').toLowerCase();
      log.exitOrder = { id: String(state.position.exitOrderId), status };
      if (status === 'filled') {
        const fill = Number(ord.avg_fill_price);
        const pnl = (fill - state.position.entryPrice) * state.position.shares;
        state.realizedPnlToday = Number(state.realizedPnlToday ?? 0) + pnl;
        log.actions.push(`stop loss filled at ${fill}, realized P&L ${round(pnl, 2)}`);
        log.orders.push({ kind: 'stop_fill', id: String(ord.id), fill, pnl: round(pnl, 2) });
        state.position = null;
        exitedThisBar = true;
      } else if (CANCELLED_STATUSES.has(status)) {
        log.notes.push(
          `LOUD: resting stop ${state.position.exitOrderId} is ${status} while still long; replacing it`
        );
        state.position.exitOrderId = null;
        const stopId = await ensureStopOrder(token, accountId, state, log);
        if (stopId) state.position.exitOrderId = stopId;
        log.decision = 'no_action';
        log.reason = 'stop order was missing and had to be replaced; skipping trading this bar';
        return finish(log, state, barTime, alreadyProcessed ? 'same' : 'advance');
      }
    }

    // 3. Position / order mismatch versus Tradier.
    const expectedShares = state.position ? Number(state.position.shares) : 0;
    if (expectedShares !== brokerQty || untracked.length > 0) {
      log.mismatch = {
        ddbSharesBefore: ddbShares,
        ddbSharesAfterOrderResolution: expectedShares,
        brokerQty,
        untrackedOpenOrderIds: untracked.map((o) => String(o.id)),
      };
      log.notes.push(
        'LOUD MISMATCH: Tradier and DynamoDB disagree. Trusting Tradier, skipping trading this invocation.'
      );
      log.decision = 'no_action';
      log.reason = 'state mismatch with broker';
      // Trust Tradier for the share count where we can, but do not invent an entry price.
      if (brokerQty === 0) state.position = null;
      else if (state.position) state.position.shares = brokerQty;
      return finish(log, state, barTime, alreadyProcessed ? 'same' : 'advance');
    }

    // --- strategy signal -------------------------------------------------
    const positionSide = state.position ? state.position.side : null;
    const signal = strategyHandler({
      current,
      previous,
      index,
      series,
      params: PARAMS,
      position: positionSide,
    });
    log.position = state.position
      ? {
          side: state.position.side,
          shares: state.position.shares,
          entryPrice: state.position.entryPrice,
          stopLevel: state.position.stopLevel,
          exitOrderId: state.position.exitOrderId,
        }
      : null;
    log.signal = { action: signal.action, reason: signal.reason };

    if (alreadyProcessed) {
      log.decision = 'no_action';
      log.reason = `bar ${new Date(barTime).toISOString()} was already processed (lastProcessedBarTime=${state.lastProcessedBarTime}); duplicate invocation`;
      return finish(log, state, barTime, 'same');
    }

    const ordersAllowed = isRegularHours(now);
    const dailyLossLimit = (MAX_DAILY_LOSS_PCT / 100) * state.dayStartEquity;
    const dailyLossHit = Number(state.realizedPnlToday ?? 0) <= -dailyLossLimit;
    log.risk = {
      maxDailyLossPct: MAX_DAILY_LOSS_PCT,
      dayStartEquity: state.dayStartEquity,
      realizedPnlToday: round(state.realizedPnlToday, 2),
      dailyLossLimit: round(dailyLossLimit, 2),
      dailyLossHit,
      takeProfitPct: TAKE_PROFIT_PCT,
      stopLossPct: STOP_LOSS_PCT,
      commissionBps: 0,
      slippageBps: 0,
    };

    // --- exit on a sell signal while long --------------------------------
    if (signal.action === 'sell' && state.position && !exitedThisBar) {
      if (!ordersAllowed || DRY_RUN) {
        log.decision = 'would_exit';
        log.reason = DRY_RUN
          ? 'DRY_RUN: would close the long at market'
          : 'outside regular hours (9:30-16:00 ET): would close the long at market, but market orders are regular-session only';
        return finish(log, state, barTime, 'advance');
      }
      // Cancel the resting stop first and confirm the cancel.
      if (state.position.exitOrderId) {
        await cancelOrder(token, accountId, state.position.exitOrderId);
        const after = await awaitOrder(token, accountId, state.position.exitOrderId, 6, 1500);
        const st = String(after?.status || '').toLowerCase();
        if (st === 'filled') {
          const fill = Number(after.avg_fill_price);
          const pnl = (fill - state.position.entryPrice) * state.position.shares;
          state.realizedPnlToday = Number(state.realizedPnlToday ?? 0) + pnl;
          log.actions.push(`stop filled while cancelling, at ${fill}; position already closed`);
          state.position = null;
          log.decision = 'exit_via_stop';
          return finish(log, state, barTime, 'advance');
        }
        if (!CANCELLED_STATUSES.has(st)) {
          log.decision = 'no_action';
          log.reason = `could not confirm cancel of stop ${state.position.exitOrderId} (status ${st}); not sending a market sell on top of a live stop`;
          return finish(log, state, barTime, 'advance');
        }
        log.actions.push(`cancelled resting stop ${state.position.exitOrderId} (status ${st})`);
        state.position.exitOrderId = null;
      }
      const sellId = await placeOrder(token, accountId, {
        class: 'equity',
        symbol: SYMBOL,
        side: 'sell',
        quantity: String(state.position.shares),
        type: 'market',
        duration: DAY_ORDER_DURATION,
      });
      log.orders.push({ kind: 'exit_market', id: sellId, quantity: state.position.shares });
      const filled = await awaitOrder(token, accountId, sellId);
      const st = String(filled?.status || '').toLowerCase();
      if (st === 'filled') {
        const fill = Number(filled.avg_fill_price);
        const pnl = (fill - state.position.entryPrice) * state.position.shares;
        state.realizedPnlToday = Number(state.realizedPnlToday ?? 0) + pnl;
        log.actions.push(`closed long at market, fill ${fill}, realized P&L ${round(pnl, 2)}`);
        state.position = null;
        state.pendingOrderId = null;
      } else {
        log.actions.push(`exit market order ${sellId} not yet filled (status ${st}); will resolve next invocation`);
        state.position.exitOrderId = sellId;
      }
      log.decision = 'exit';
      // Closing does not reverse: no entry on this bar.
      return finish(log, state, barTime, 'advance');
    }

    if (signal.action === 'sell' && !state.position) {
      log.decision = 'no_action';
      log.reason = 'sell signal while flat: long-only strategy does nothing';
      return finish(log, state, barTime, 'advance');
    }

    // --- entry -----------------------------------------------------------
    if (signal.action === 'buy') {
      if (state.position || state.pendingOrderId) {
        log.decision = 'no_action';
        log.reason = 'buy signal ignored: position or order already live (one position at a time)';
        return finish(log, state, barTime, 'advance');
      }
      if (exitedThisBar) {
        log.decision = 'no_action';
        log.reason = 'buy signal ignored: an exit happened on this same bar; a new position can only open on a later bar';
        return finish(log, state, barTime, 'advance');
      }
      if (dailyLossHit) {
        log.decision = 'no_action';
        log.reason = `buy signal ignored: max daily loss of ${MAX_DAILY_LOSS_PCT}% reached (realized ${round(state.realizedPnlToday, 2)} vs limit ${round(-dailyLossLimit, 2)})`;
        return finish(log, state, barTime, 'advance');
      }
      const shares = Math.floor((equity * EQUITY_FRACTION) / current.close);
      log.sizing = { equity, fraction: EQUITY_FRACTION, lastClose: current.close, shares };
      if (shares < 1) {
        log.decision = 'no_action';
        log.reason = `position size computed to 0 shares (equity ${equity} / close ${current.close}); skipping trade`;
        return finish(log, state, barTime, 'advance');
      }
      if (!ordersAllowed || DRY_RUN) {
        log.decision = 'would_enter';
        log.reason = DRY_RUN
          ? `DRY_RUN: would buy ${shares} ${SYMBOL} at market`
          : `outside regular hours (9:30-16:00 ET): would buy ${shares} ${SYMBOL} at market, but market orders are regular-session only`;
        return finish(log, state, barTime, 'advance');
      }
      const buyId = await placeOrder(token, accountId, {
        class: 'equity',
        symbol: SYMBOL,
        side: 'buy',
        quantity: String(shares),
        type: 'market',
        duration: DAY_ORDER_DURATION,
      });
      state.pendingOrderId = buyId;
      log.orders.push({ kind: 'entry_market', id: buyId, quantity: shares });
      const filled = await awaitOrder(token, accountId, buyId);
      const st = String(filled?.status || '').toLowerCase();
      if (st === 'filled') {
        const fill = Number(filled.avg_fill_price);
        const qty = Math.floor(Number(filled.exec_quantity ?? shares) || shares);
        state.position = {
          side: 'long',
          shares: qty,
          entryPrice: fill,
          entryTime: new Date(now).toISOString(),
          stopLevel: round(fill * (1 - STOP_LOSS_PCT), 2),
          targetLevel: null,
          exitOrderId: null,
        };
        state.pendingOrderId = null;
        log.actions.push(`opened long ${qty} ${SYMBOL} at ${fill}`);
        const stopId = await ensureStopOrder(token, accountId, state, log);
        if (stopId) state.position.exitOrderId = stopId;
        log.decision = 'enter';
      } else if (CANCELLED_STATUSES.has(st)) {
        log.notes.push(`entry order ${buyId} ended ${st}; back to flat`);
        state.pendingOrderId = null;
        state.position = null;
        log.decision = 'entry_failed';
      } else {
        log.decision = 'entry_pending';
        log.reason = `entry order ${buyId} status ${st}; will confirm next invocation before placing the stop`;
      }
      return finish(log, state, barTime, 'advance');
    }

    log.decision = 'hold';
    log.reason = signal.reason || 'no signal';
    return finish(log, state, barTime, 'advance');
  } catch (err) {
    log.decision = 'error';
    log.error = { message: err?.message, name: err?.name, stack: err?.stack };
    console.error(JSON.stringify(log));
    throw err;
  }
};

/** Place the resting 1% stop for an open long. Returns the order id, or null. */
async function ensureStopOrder(token, accountId, state, log) {
  if (!state.position) return null;
  if (DRY_RUN) {
    log.notes.push(`DRY_RUN: would place GTC stop at ${state.position.stopLevel}`);
    return null;
  }
  try {
    const id = await placeOrder(token, accountId, {
      class: 'equity',
      symbol: SYMBOL,
      side: 'sell',
      quantity: String(state.position.shares),
      type: 'stop',
      stop: String(state.position.stopLevel),
      duration: EXIT_ORDER_DURATION,
    });
    log.orders.push({
      kind: 'resting_stop',
      id,
      stop: state.position.stopLevel,
      quantity: state.position.shares,
    });
    log.actions.push(`placed GTC stop ${id} at ${state.position.stopLevel}`);
    return id;
  } catch (err) {
    log.notes.push(`LOUD: failed to place protective stop: ${err.message}`);
    return null;
  }
}

/** Emit the single JSON log line and persist state exactly once. */
async function finish(log, state, barTime, mode) {
  if (state && barTime !== null && mode) {
    log.state = {
      position: state.position,
      pendingOrderId: state.pendingOrderId,
      lastProcessedBarTime: barTime,
      tradingDay: state.tradingDay,
      dayStartEquity: state.dayStartEquity,
      realizedPnlToday: round(state.realizedPnlToday, 2),
    };
    try {
      await writeState(state, barTime, mode);
      log.statePersisted = true;
    } catch (err) {
      if (err?.name === 'ConditionalCheckFailedException') {
        log.statePersisted = false;
        log.notes.push(
          'state write skipped: lastProcessedBarTime condition failed (concurrent or duplicate invocation)'
        );
      } else {
        throw err;
      }
    }
  } else {
    log.statePersisted = false;
  }
  console.log(JSON.stringify(log));
  return log;
}

function mask(s) {
  const str = String(s);
  return str.length <= 4 ? '****' : `****${str.slice(-4)}`;
}
