// Lookahead guards. A backtest that can see the future looks brilliant and
// means nothing, so these check the two ways it can happen here: a strategy
// or indicator reading bars after the one it's deciding on, and the engine
// filling at a price that wasn't available when the decision was made.

import { describe, expect, it } from "vitest";
import { AVAILABLE_STRATEGIES, getDefaultParams } from "@/app/strategies";
import {
  calculateIndicatorsWithParams,
  deriveRequiredIndicators,
  runBacktestWithParams,
  DEFAULT_SIZING,
  LEGACY_SIZING,
} from "./backtest-engine";
import type { IndicatorData, PricePoint } from "@/app/types";

const DAY = 24 * 60 * 60 * 1000;

/** Deterministic random numbers, so a failure reproduces. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random walk of weekday daily bars from 2020-01-02, with real ranges and gaps. */
function walk(n: number, seed: number, start = 100): PricePoint[] {
  const rand = rng(seed);
  const bars: PricePoint[] = [];
  let close = start;
  let t = Date.UTC(2020, 0, 2, 14, 30);
  while (bars.length < n) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const open = close * (1 + (rand() - 0.5) * 0.02);
      const next = open * (1 + (rand() - 0.5) * 0.04);
      const high = Math.max(open, next) * (1 + rand() * 0.01);
      const low = Math.min(open, next) * (1 - rand() * 0.01);
      bars.push({ time: t, open, high, low, close: next });
      close = next;
    }
    t += DAY;
  }
  return bars;
}

/** The same bars up to and including `cutoff`, a different market after it. */
function rewriteAfter(bars: PricePoint[], cutoff: number, seed: number): PricePoint[] {
  const future = walk(bars.length - cutoff - 1, seed, bars[cutoff].close * 1.3);
  return bars.map((b, i) => (i <= cutoff ? b : { ...future[i - cutoff - 1], time: b.time }));
}

function indicatorsFor(strategyId: string, raw: PricePoint[]): IndicatorData[] {
  const req = deriveRequiredIndicators(strategyId, [getDefaultParams(strategyId)]);
  return calculateIndicatorsWithParams(raw, req.requiredEMAs, req.requiredSMAs, req.requiredMACDs, req.requiredDonchianPeriods);
}

const N = 400;
const CUTOFFS = [210, 260, 330];

describe("no strategy or indicator reads bars after the one it decides on", () => {
  const original = walk(N, 1);

  for (const id of Object.keys(AVAILABLE_STRATEGIES)) {
    it(`${id}: indicators and signals up to a bar don't change when later bars do`, () => {
      const strategy = AVAILABLE_STRATEGIES[id];
      const params = getDefaultParams(id);
      const a = indicatorsFor(id, original);
      for (const cutoff of CUTOFFS) {
        const b = indicatorsFor(id, rewriteAfter(original, cutoff, cutoff));
        expect(b.slice(0, cutoff + 1)).toEqual(a.slice(0, cutoff + 1));
        for (let i = 1; i <= cutoff; i++) {
          for (const position of [null, "long", "short"] as const) {
            const ctx = { index: i, params, position };
            const sa = strategy.handler({ ...ctx, current: a[i], previous: a[i - 1], series: a });
            const sb = strategy.handler({ ...ctx, current: b[i], previous: b[i - 1], series: b });
            expect(sb.action, `${id} bar ${i} (${position}), future rewritten after ${cutoff}`).toBe(sa.action);
          }
        }
      }
    });
  }
});

describe("fills are prices that existed when the order went in", () => {
  it("fills a signal at the next bar's open, not the signal bar's close", () => {
    const data: IndicatorData[] = [
      { time: 0, open: 100, high: 100, low: 100, close: 100 },
      { time: DAY, open: 100, high: 101, low: 99, close: 100 },
      { time: 2 * DAY, open: 105, high: 106, low: 104, close: 105 },
      { time: 3 * DAY, open: 110, high: 111, low: 109, close: 110 },
      { time: 4 * DAY, open: 120, high: 121, low: 119, close: 120 },
    ];
    const signals: Record<number, "buy" | "sell"> = { 1: "buy", 3: "sell" };
    const r = runBacktestWithParams(
      data,
      { id: "s", name: "s", description: "", handler: ({ index }) => ({ action: signals[index] ?? "hold", reason: "" }) },
      {},
      10_000,
      { stopLossPercent: 0, takeProfitPercent: 0, sizing: LEGACY_SIZING },
    );
    expect(r.trades).toHaveLength(1);
    expect([r.trades[0].entryTime, r.trades[0].entryPrice]).toEqual([2 * DAY, 105]);
    expect([r.trades[0].exitTime, r.trades[0].exitPrice]).toEqual([4 * DAY, 120]);
  });

  it("drops an order decided on the last bar, which has no next open", () => {
    const data: IndicatorData[] = [0, 1, 2].map((i) => ({ time: i * DAY, open: 100, high: 100, low: 100, close: 100 }));
    const r = runBacktestWithParams(
      data,
      { id: "s", name: "s", description: "", handler: ({ index }) => ({ action: index === 2 ? "buy" : "hold", reason: "" }) },
      {},
      10_000,
      { stopLossPercent: 0, takeProfitPercent: 0, sizing: LEGACY_SIZING },
    );
    expect(r.trades).toHaveLength(0);
  });

  for (const id of Object.keys(AVAILABLE_STRATEGIES)) {
    it(`${id}: every fill is inside the range of the bar it fills on`, () => {
      const raw = walk(N, 7);
      const data = indicatorsFor(id, raw);
      const byTime = new Map(data.map((d) => [d.time, d]));
      const inRange = (time: number, price: number) => {
        const bar = byTime.get(time)!;
        return price >= bar.low - 1e-9 && price <= bar.high + 1e-9;
      };
      for (const sizing of [DEFAULT_SIZING, { ...DEFAULT_SIZING, useStopLoss: false }, { ...LEGACY_SIZING, useTakeProfit: true }]) {
        const r = runBacktestWithParams(
          data,
          AVAILABLE_STRATEGIES[id],
          getDefaultParams(id),
          10_000,
          { stopLossPercent: 1, takeProfitPercent: 3, sizing },
          true,
        );
        for (const t of r.trades) {
          expect(inRange(t.entryTime, t.entryPrice), `${id} entry ${t.entryPrice} at ${t.entryTime}`).toBe(true);
          expect(inRange(t.exitTime, t.exitPrice), `${id} exit ${t.exitPrice} at ${t.exitTime} (${t.reason})`).toBe(true);
          expect(t.exitTime).toBeGreaterThanOrEqual(t.entryTime);
        }
      }
    });
  }
});
