import { describe, expect, it } from "vitest";
import { AVAILABLE_STRATEGIES, getDefaultParams } from "@/app/strategies";
import { fieldWarmup, settleBars, strategyWarmup, type Warmup } from "./strategyWarmup";

const warmup = (id: string, params: Record<string, number | boolean | string> = {}) =>
  strategyWarmup(AVAILABLE_STRATEGIES[id], { ...getDefaultParams(id), ...params });
const bars = (w: Warmup) => (w.kind === "unknown" ? NaN : w.bars);

describe("fieldWarmup", () => {
  it("needs N bars for SMA N and N plus the seed fading for EMA N", () => {
    expect(fieldWarmup("sma200")?.bars).toBe(200);
    expect(fieldWarmup("ema14")?.bars).toBe(14 + settleBars(2 / 15));
    expect(fieldWarmup("ema14")?.bars).toBe(63);
  });

  it("knows the engine's fixed-period fields and nothing else", () => {
    expect(fieldWarmup("close")?.bars).toBe(1);
    expect(fieldWarmup("prevClose")?.bars).toBe(2);
    expect(fieldWarmup("rsi")?.label).toBe("RSI 14");
    expect(fieldWarmup("macdHistogram_12_26_9")?.bars).toBeGreaterThan(fieldWarmup("macd_12_26_9")!.bars);
    expect(fieldWarmup("donchian_55_upperBand")?.bars).toBe(55);
    expect(fieldWarmup("somethingElse")).toBeNull();
  });
});

describe("strategyWarmup", () => {
  // The old prompt took 5x the largest parameter value, so a percent like
  // exitIbs 76 became "5x the longest parameter (76)".
  it("ignores parameters that aren't lookbacks: IBS percents", () => {
    const off = warmup("ibs-mean-reversion", { entryIbs: 20, exitIbs: 76, trendFilter: false });
    expect(off).toMatchObject({ kind: "derived", bars: 1 });
    expect(bars(warmup("ibs-mean-reversion", { entryIbs: 35, exitIbs: 95, trendFilter: false }))).toBe(1);
  });

  it("counts the 200 SMA only when the trend filter reads it", () => {
    const on = warmup("ibs-mean-reversion", { entryIbs: 20, exitIbs: 76, trendFilter: true });
    expect(on).toMatchObject({ kind: "derived", bars: 200 });
    expect(on.parts.map((p) => p.label)).toContain("SMA 200");
  });

  it("ignores Connors %b's percent levels", () => {
    expect(bars(warmup("connors-percent-b", { exitPctB: 67 }))).toBe(bars(warmup("connors-percent-b", { exitPctB: 80 })));
    const filtered = warmup("connors-percent-b", { exitPctB: 67, trendFilter: true });
    expect(filtered.kind).not.toBe("unknown");
    expect(bars(filtered)).toBe(200);
  });

  // The old prompt floored at 26, a MACD period EMA Price Cross never reads.
  it("derives EMA Price Cross from its own EMA, not MACD's 26", () => {
    const w = warmup("ema-price-cross", { emaPeriod: 14 });
    expect(w.kind).toBe("derived");
    // EMA 14 read on the previous bar too: one more than the EMA's own 63.
    expect(bars(w)).toBe(64);
    expect(w.parts.map((p) => p.label)).not.toContain("MACD 12/26/9");
    expect(w.parts.map((p) => p.label)).toEqual(["EMA 14", "prices 1 bar back"]);
  });

  it("follows the configured periods", () => {
    expect(bars(warmup("sma-crossover", { fastPeriod: 10, slowPeriod: 30 }))).toBe(31);
    expect(bars(warmup("turtle", { entryPeriod: 55, exitPeriod: 20 }))).toBe(56);
  });

  it("measures strategies that compute over their whole history, and says so", () => {
    const w = warmup("alligator");
    expect(w.kind).toBe("measured");
    if (w.kind !== "measured") return;
    expect(w.bars).toBeGreaterThanOrEqual(w.matchedFrom);
    // Jaw 13 SMMA, shifted 8: at least that many bars before it means anything.
    expect(w.matchedFrom).toBeGreaterThan(13 + 8);
  });

  it("works out every strategy at its defaults", () => {
    for (const id of Object.keys(AVAILABLE_STRATEGIES)) {
      const w = warmup(id);
      expect(w.kind, id).not.toBe("unknown");
      expect(bars(w), id).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);
});
