import { describe, expect, it } from "vitest";
import type { EquitySummary } from "@/app/lib/tradingEquity";
import type { GoLive } from "./goLive";
import { DEFAULT_SORT, nextSort, sortCurves } from "./leaderboardSort";

const curve = (id: string, over: Partial<EquitySummary> = {}) =>
  ({ id, label: id, returnPct: 0, maxDrawdownPct: 0, trades: 0, wins: 0, latestAt: 0, ...over }) as EquitySummary;
const go = (profitFactor: number | null) => ({ live: { profitFactor }, sample: { status: "edge" }, divergence: null }) as unknown as GoLive;
const ids = (cs: EquitySummary[]) => cs.map((c) => c.id);

describe("sortCurves", () => {
  const curves = [curve("b", { returnPct: 5, maxDrawdownPct: 3 }), curve("a", { returnPct: 9, maxDrawdownPct: 8 }), curve("c", { returnPct: -2, maxDrawdownPct: 1 })];

  it("sorts by return, best first, by default", () => {
    expect(ids(sortCurves(curves, new Map(), DEFAULT_SORT))).toEqual(["a", "b", "c"]);
  });

  it("sorts text and numbers both ways", () => {
    expect(ids(sortCurves(curves, new Map(), { key: "label", dir: "asc" }))).toEqual(["a", "b", "c"]);
    expect(ids(sortCurves(curves, new Map(), { key: "maxDrawdown", dir: "asc" }))).toEqual(["c", "b", "a"]);
    expect(ids(sortCurves(curves, new Map(), { key: "maxDrawdown", dir: "desc" }))).toEqual(["a", "b", "c"]);
  });

  it("puts missing values last in either direction", () => {
    const g = new Map([["a", go(2)], ["b", go(null)], ["c", go(0.5)]]);
    expect(ids(sortCurves(curves, g, { key: "profitFactor", dir: "desc" }))).toEqual(["a", "c", "b"]);
    expect(ids(sortCurves(curves, g, { key: "profitFactor", dir: "asc" }))).toEqual(["c", "a", "b"]);
  });
});

describe("nextSort", () => {
  it("flips the same column and starts a new one best first", () => {
    expect(nextSort(DEFAULT_SORT, "return")).toEqual({ key: "return", dir: "asc" });
    expect(nextSort(DEFAULT_SORT, "maxDrawdown")).toEqual({ key: "maxDrawdown", dir: "asc" });
    expect(nextSort(DEFAULT_SORT, "trades")).toEqual({ key: "trades", dir: "desc" });
  });
});
