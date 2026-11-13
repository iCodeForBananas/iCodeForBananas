import { describe, expect, it } from "vitest";
import { deploymentDetails } from "./deploymentDetails";

describe("deploymentDetails", () => {
  it("reads an IBS deployment's thresholds, filter and sides back from its id", () => {
    const d = deploymentDetails({ id: "ibs-mean-reversion-avgo-1h-35-75-n-ls", strategyId: "ibs-mean-reversion", symbol: "AVGO", interval: "1h" });
    expect(d.sides).toBe("Long and short");
    expect(d.params).toEqual([
      { name: "Entry IBS", value: "35%" },
      { name: "Exit IBS", value: "75%" },
      { name: "Trend Filter (200 SMA)", value: "Off" },
    ]);
    expect(d.description).toMatch(/Internal Bar Strength/);
  });

  it("reads minute intervals and long-only deployments", () => {
    const d = deploymentDetails({ id: "ema-price-cross-mu-30m-63-ls", strategyId: "ema-price-cross", symbol: "MU", interval: "30min" });
    expect(d.params).toEqual([{ name: expect.any(String), value: "63" }]);
    const l = deploymentDetails({ id: "ema-crossover-aapl-1d-3-161-l", strategyId: "ema-crossover", symbol: "AAPL", interval: "1d" });
    expect(l.sides).toBe("Long only");
    expect(l.params.map((p) => p.value)).toEqual(["3", "161"]);
  });

  it("keeps the description but no values when the id doesn't parse", () => {
    for (const id of ["my-custom-id", "ibs-mean-reversion-avgo-1h-35-ls", "ibs-mean-reversion-avgo-1h-35-75-x-ls", "ibs-mean-reversion-avgo-1h-35-75-n-xx"]) {
      const d = deploymentDetails({ id, strategyId: "ibs-mean-reversion", symbol: "AVGO", interval: "1h" });
      expect(d.params).toEqual([]);
      expect(d.sides).toBeNull();
      expect(d.description).not.toBeNull();
    }
    expect(deploymentDetails({ id: "x", strategyId: "gone", symbol: "A", interval: "1d" }).description).toBeNull();
  });
});
