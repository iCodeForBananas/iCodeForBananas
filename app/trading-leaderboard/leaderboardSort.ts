import type { EquitySummary } from "@/app/lib/tradingEquity";
import type { DivergenceStatus, SampleStatus } from "@/app/lib/tradeStats";
import type { GoLive } from "./goLive";

export type SortKey = "label" | "return" | "divergence" | "sample" | "maxDrawdown" | "profitFactor" | "perTrade" | "trades" | "winRate" | "updated";
export type SortDir = "asc" | "desc";
export interface Sort {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: Sort = { key: "return", dir: "desc" };

/** The direction a column sorts in on its first click: best first. */
export const FIRST_DIR: Record<SortKey, SortDir> = {
  label: "asc",
  return: "desc",
  divergence: "asc",
  sample: "asc",
  maxDrawdown: "asc",
  profitFactor: "desc",
  perTrade: "desc",
  trades: "desc",
  winRate: "desc",
  updated: "desc",
};

// Status columns sort by how good the status is, best first.
const DIVERGENCE_RANK: Record<DivergenceStatus, number> = { "in-line": 0, better: 1, worse: 2, "too-early": 3, "no-backtest": 4, unavailable: 5 };
const SAMPLE_RANK: Record<SampleStatus, number> = { edge: 0, unproven: 1, negative: 2, insufficient: 3 };

function value(c: EquitySummary, go: GoLive | undefined, key: SortKey): number | string | null {
  switch (key) {
    case "label":
      return c.label.toLowerCase();
    case "return":
      return c.returnPct;
    case "divergence":
      return go?.divergence ? DIVERGENCE_RANK[go.divergence.status] : null;
    case "sample":
      return go ? SAMPLE_RANK[go.sample.status] : null;
    case "maxDrawdown":
      return c.maxDrawdownPct;
    case "profitFactor":
      return go?.live?.profitFactor ?? null;
    case "perTrade":
      return go?.live?.expectancyPct ?? null;
    case "trades":
      return c.trades;
    case "winRate":
      return c.trades > 0 ? c.wins / c.trades : null;
    case "updated":
      return c.latestAt;
  }
}

/** The click on a header: the same column flips direction, a new one starts best first. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: FIRST_DIR[key] };
}

/**
 * Sorts by the chosen column; missing values always go last, and ties fall
 * back to return so the order is stable between refreshes.
 */
export function sortCurves(curves: EquitySummary[], goLive: Map<string, GoLive>, sort: Sort): EquitySummary[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...curves].sort((a, b) => {
    const va = value(a, goLive.get(a.id), sort.key);
    const vb = value(b, goLive.get(b.id), sort.key);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else if (va !== vb) {
      return sign * (typeof va === "string" ? va.localeCompare(vb as string) : (va as number) < (vb as number) ? -1 : 1);
    }
    return b.returnPct - a.returnPct;
  });
}
