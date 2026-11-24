import { describe, expect, it } from "vitest";
import { AVAILABLE_STRATEGIES, getDefaultParams } from "@/app/strategies";
import { DEFAULT_SIZING } from "@/app/lib/backtest-engine";
import { APP_INTERVALS as RUNTIME_APP_INTERVALS, validateAppDeployment } from "@/trading/runtime/app-deployments";
import { APP_INTERVALS, NUMBER_FIELDS, buildDeployDraft } from "./deployConfig";
import type { DeployPromptInput, RunSettings } from "./deployPrompt";

const run = (sizing: Partial<RunSettings["sizing"]> = {}): RunSettings => ({
  stopLossPercent: 0,
  takeProfitPercent: 0,
  enableShorts: false,
  positionSizePercent: 100,
  commissionBps: 0,
  slippageBps: 0,
  sizing: { ...DEFAULT_SIZING, mode: "fixed", useStopLoss: false, useTakeProfit: false, maxDrawdownPercent: 25, drawdownPauseBars: 20, ...sizing },
});

const draft = (over: Partial<Omit<DeployPromptInput, "source">> = {}) =>
  buildDeployDraft({
    strategy: AVAILABLE_STRATEGIES["ibs-mean-reversion"],
    params: getDefaultParams("ibs-mean-reversion"),
    run: run(),
    symbol: "ZZZ",
    timeframe: "15m",
    backtest: { label: "ZZZ 15m", totalPnlPercent: 5, totalTrades: 10, winRate: 50, maxDrawdownPercent: 3, sharpeRatio: 1, initialCapital: 10_000 },
    ...over,
  });

describe("buildDeployDraft", () => {
  it("knows the dispatcher's intervals", () => {
    expect([...APP_INTERVALS]).toEqual([...RUNTIME_APP_INTERVALS]);
  });

  it("fills every field from a fixed-size run, and the runtime accepts it", () => {
    const d = draft();
    expect(d.blockers).toEqual([]);
    expect(d.unknown).toEqual({});
    expect(d.interval).toBe("15min");
    for (const k of NUMBER_FIELDS) expect(d.numbers[k]).not.toBeNull();
    const deployment = { strategyId: d.strategyId, symbol: d.symbol!, interval: d.interval as "15min", params: d.params, enableShorts: d.enableShorts, ...(d.numbers as Record<string, number>) };
    expect(validateAppDeployment(deployment, [])).toEqual([]);
  });

  it("leaves risk-based sizing blank for the user to fill in", () => {
    const d = draft({ run: run({ mode: "risk", useStopLoss: true }) });
    expect(d.numbers.positionSizePct).toBeNull();
    expect(d.unknown.positionSizePct).toContain("sized each trade by risk");
  });

  it("refuses 1-minute bars, an unknown dataset, and a run without settings", () => {
    expect(draft({ timeframe: "1m" }).blockers.join()).toContain("5min");
    expect(draft({ symbol: null }).blockers.join()).toContain("dataset");
    expect(draft({ run: null }).blockers.join()).toContain("settings weren't recorded");
  });
});
