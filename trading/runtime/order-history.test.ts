import { describe, expect, it, vi } from 'vitest';
import { collectOrderHistory, HISTORY_MAX_PAGES, HISTORY_PAGE_SIZE } from './order-history';
import type { TradierOrder } from './tradier';

const page = (from: number, n: number): TradierOrder[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, status: 'filled', symbol: 'QQQ', side: 'buy', quantity: '10', exec_quantity: '10', avg_fill_price: '612.5', tag: `ibs-qqq-${from + i}`, transaction_date: '2026-11-17T14:30:05.000Z' }));

describe('collectOrderHistory', () => {
  it('pages until a short page and keeps only the fields the backfill needs', async () => {
    const orderHistory = vi.fn(async (p: number) => (p === 1 ? page(1, HISTORY_PAGE_SIZE) : page(1000, 3)));
    const r = await collectOrderHistory({ orderHistory });
    expect(r).toMatchObject({ pages: 2, complete: true });
    expect(r.orders).toHaveLength(HISTORY_PAGE_SIZE + 3);
    expect(r.orders[0]).toEqual({ id: '1', tag: 'ibs-qqq-1', symbol: 'QQQ', side: 'buy', status: 'filled', quantity: 10, execQuantity: 10, avgFillPrice: 612.5, createDate: null, transactionDate: '2026-11-17T14:30:05.000Z' });
  });

  it('stops when Tradier ignores paging and repeats the same page', async () => {
    const orderHistory = vi.fn(async () => page(1, HISTORY_PAGE_SIZE));
    const r = await collectOrderHistory({ orderHistory });
    expect(orderHistory).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ pages: 1, complete: true });
  });

  it('says when it gave up before the end', async () => {
    const orderHistory = vi.fn(async (p: number) => page(p * HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE));
    const r = await collectOrderHistory({ orderHistory });
    expect(r).toMatchObject({ pages: HISTORY_MAX_PAGES, complete: false });
  });
});
