// Tradier SANDBOX client, shared by every deployment. Global fetch only.

// Hard guardrail: sandbox only. Not configurable by any environment variable.
export const TRADIER_BASE_URL = 'https://sandbox.tradier.com/v1';
if (!TRADIER_BASE_URL.includes('sandbox.tradier.com')) {
  throw new Error(`Refusing to start: Tradier base URL ${TRADIER_BASE_URL} is not the sandbox`);
}

export interface TradierCreds {
  accessToken: string;
  accountId: string;
}

export class TradierError extends Error {
  constructor(message: string, readonly status: number, readonly body?: string) {
    super(message);
    this.name = 'TradierError';
  }
}

export interface TradierOrder {
  id: string | number;
  status?: string;
  symbol?: string;
  side?: string;
  quantity?: number | string;
  exec_quantity?: number | string;
  avg_fill_price?: number | string;
  transaction_date?: string;
  reason_description?: string;
  tag?: string;
}

export interface TradierPosition {
  symbol: string;
  quantity: number | string;
  cost_basis: number | string;
  date_acquired?: string;
}

export interface TimesalesRow {
  time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume?: number | string;
}

/** What the runtime needs from Tradier; the tests substitute a fake. */
export interface TradierApi {
  accountId(): Promise<string>;
  clock(): Promise<{ state?: string; description?: string } | null>;
  balances(): Promise<{ total_equity?: number | string } | null>;
  positions(): Promise<TradierPosition[]>;
  orders(): Promise<TradierOrder[]>;
  order(orderId: string): Promise<TradierOrder | null>;
  placeMarketOrder(o: { symbol: string; side: string; quantity: number; tag: string }): Promise<string>;
  cancelOrder(orderId: string): Promise<void>;
  timesales(q: { symbol: string; interval: string; start: string; end: string }): Promise<TimesalesRow[]>;
}

const asArray = <T>(x: T | T[] | null | undefined | 'null'): T[] => (x == null || x === 'null' ? [] : Array.isArray(x) ? x : [x]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * @param loadCreds reads the secret. Cached until Tradier rejects the token
 * (401), so a replaced or rotated secret is picked up on the next call.
 */
export function createTradierClient(loadCreds: () => Promise<TradierCreds>, fetchImpl: typeof fetch = fetch): TradierApi {
  let cached: TradierCreds | null = null;
  const creds = async () => (cached ??= await loadCreds());

  /** Retries network errors and 5xx (3 attempts), never a 4xx and never an order write. */
  async function call(path: string, { method = 'GET', query, form, retry = true }: { method?: string; query?: Record<string, string>; form?: Record<string, string | number>; retry?: boolean } = {}) {
    const { accessToken } = await creds();
    const url = new URL(TRADIER_BASE_URL + path);
    if (!url.href.startsWith('https://sandbox.tradier.com/')) throw new Error(`Refusing non-sandbox URL ${url.href}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    let body: string | undefined;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString();
    }
    const attempts = retry ? 3 : 1;
    let lastErr: Error | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(url, { method, headers, body, signal: AbortSignal.timeout(10_000) });
      } catch (err) {
        lastErr = new TradierError(`Network error on ${method} ${path}: ${(err as Error).message}`, 0);
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
        // A rejected token means the cached secret is stale: read it again next time.
        if (res.status === 401) cached = null;
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

  const acct = async () => (await creds()).accountId;

  return {
    accountId: acct,
    clock: async () => (await call('/markets/clock'))?.clock ?? null,
    balances: async () => (await call(`/accounts/${await acct()}/balances`))?.balances ?? null,
    positions: async () => asArray((await call(`/accounts/${await acct()}/positions`))?.positions?.position),
    orders: async () => asArray((await call(`/accounts/${await acct()}/orders`, { query: { includeTags: 'true' } }))?.orders?.order),
    order: async (id) => (await call(`/accounts/${await acct()}/orders/${id}`, { query: { includeTags: 'true' } }))?.order ?? null,
    async placeMarketOrder({ symbol, side, quantity, tag }) {
      const r = await call(`/accounts/${await acct()}/orders`, {
        method: 'POST',
        retry: false,
        form: { class: 'equity', symbol, side, quantity, type: 'market', duration: 'day', tag },
      });
      const id = r?.order?.id;
      if (!id) throw new Error(`Order placement returned no id: ${JSON.stringify(r).slice(0, 300)}`);
      return String(id);
    },
    async cancelOrder(id) {
      await call(`/accounts/${await acct()}/orders/${id}`, { method: 'DELETE', retry: false });
    },
    timesales: async ({ symbol, interval, start, end }) =>
      asArray((await call('/markets/timesales', { query: { symbol, interval, start, end, session_filter: 'all' } }))?.series?.data),
  };
}
