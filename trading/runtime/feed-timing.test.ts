import { describe, expect, it } from 'vitest';
import { feedTiming } from './feed-timing';
import { etWallToUtcMs } from './time';

const NOW = etWallToUtcMs(2026, 11, 17, 11, 45, 20);

describe('feedTiming', () => {
  it('reports the newest raw row and the quote age against the wall clock', () => {
    const rows = [
      { time: '2026-11-17T11:15:00', open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
      { time: '2026-11-17T11:30:00', open: 10.5, high: 10.6, low: 10.4, close: 10.55, volume: 7 },
    ];
    const f = feedTiming(NOW, rows, { symbol: 'X', last: 10.55, trade_date: NOW - 15 * 60_000, bid: 10.5, ask: 10.6, bid_date: NOW - 15 * 60_000 });
    expect(f.wallClock).toBe(new Date(NOW).toISOString());
    expect(f.newestRawBar).toEqual({ time: new Date(etWallToUtcMs(2026, 11, 17, 11, 30)).toISOString(), open: 10.5, close: 10.55, volume: 7, minutesBehind: 15.33 });
    expect(f.quote?.lagMinutes).toBe(15);
    expect(f.quote?.tradeTime).toBe(new Date(NOW - 15 * 60_000).toISOString());
  });

  it('copes with no rows and a failed quote', () => {
    expect(feedTiming(NOW, [], null)).toEqual({ wallClock: new Date(NOW).toISOString(), newestRawBar: null, quote: null });
  });

  it('leaves the lag empty when the quote has no trade time', () => {
    expect(feedTiming(NOW, [], { symbol: 'X', last: 1 }).quote).toMatchObject({ tradeTime: null, lagMinutes: null, bid: null });
  });
});
