// The account's Tradier order history, for scripts/backfill-fills.ts. A
// Lambda invoked with { "orderHistory": true } returns it, so the backfill
// reads Tradier with the Lambda's own credentials and the token never leaves
// AWS. Read-only: it places, cancels and writes nothing.

import type { TradierApi, TradierOrder } from './tradier';

export const HISTORY_PAGE_SIZE = 500;
export const HISTORY_MAX_PAGES = 40;

/** What the backfill needs from an order, and nothing else of the account's. */
export interface HistoricalOrder {
  id: string;
  tag: string | null;
  symbol: string | null;
  side: string | null;
  status: string | null;
  quantity: number | null;
  execQuantity: number | null;
  avgFillPrice: number | null;
  createDate: string | null;
  transactionDate: string | null;
}

const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown) => (v == null || v === '' ? null : String(v));

export function toHistoricalOrder(o: TradierOrder): HistoricalOrder {
  return {
    id: String(o.id),
    tag: str(o.tag),
    symbol: str(o.symbol),
    side: str(o.side),
    status: str(o.status),
    quantity: num(o.quantity),
    execQuantity: num(o.exec_quantity),
    avgFillPrice: num(o.avg_fill_price),
    createDate: str(o.create_date),
    transactionDate: str(o.transaction_date),
  };
}

/** Pages through the history until a page is short, empty or repeats the last. */
export async function collectOrderHistory(tradier: Pick<TradierApi, 'orderHistory'>): Promise<{ orders: HistoricalOrder[]; pages: number; complete: boolean }> {
  const byId = new Map<string, HistoricalOrder>();
  let previousFirst: string | null = null;
  for (let page = 1; page <= HISTORY_MAX_PAGES; page++) {
    const rows = await tradier.orderHistory(page, HISTORY_PAGE_SIZE);
    const first = rows.length ? String(rows[0].id) : null;
    if (rows.length === 0 || first === previousFirst) return { orders: [...byId.values()], pages: page - 1, complete: true };
    for (const o of rows) byId.set(String(o.id), toHistoricalOrder(o));
    if (rows.length < HISTORY_PAGE_SIZE) return { orders: [...byId.values()], pages: page, complete: true };
    previousFirst = first;
  }
  return { orders: [...byId.values()], pages: HISTORY_MAX_PAGES, complete: false };
}
