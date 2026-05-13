import { PricePoint, IndicatorData, BacktestTrade, PositionSide } from "@/app/types";
import { StrategyDefinition, ParameterizedResult, createParamLabel } from "@/app/strategies";

export const MAX_BATCH_RUNS = 50;
export const INITIAL_CAPITAL = 100000;

export interface MACDConfig {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

export interface RiskSettings {
  stopLossPercent: number;
  takeProfitPercent: number;
}

export interface ParameterVariationConfig {
  key: string;
  min: number;
  max: number;
  step: number;
}

export function generateRangeValues(min: number, max: number, step: number): number[] {
  if (step <= 0) return [min];
  const values: number[] = [];
  for (let v = min; v <= max + step * 1e-9; v += step) {
    values.push(Math.round(v / step) * step);
    if (values.length >= MAX_BATCH_RUNS) break;
  }
  return values;
}

export function generateCombinations(
  variations: ParameterVariationConfig[]
): Record<string, number | boolean | string>[] {
  if (variations.length === 0) return [{}];

  let combinations: Record<string, number | boolean | string>[] = [{}];

  for (const variation of variations) {
    const values = generateRangeValues(variation.min, variation.max, variation.step);
    if (values.length === 0) continue;

    const newCombinations: Record<string, number | boolean | string>[] = [];
    outer: for (const combo of combinations) {
      for (const value of values) {
        newCombinations.push({ ...combo, [variation.key]: value });
        if (newCombinations.length >= MAX_BATCH_RUNS) break outer;
      }
    }
    combinations = newCombinations;
  }

  return combinations;
}

export function calculateIndicatorsWithParams(
  data: PricePoint[],
  requiredEMAs: number[],
  requiredSMAs: number[],
  requiredMACDs: MACDConfig[] = [{ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }],
  requiredDonchianPeriods: number[] = [20]
): IndicatorData[] {
  const result: IndicatorData[] = [];

  const closePrices: number[] = [];

  // Running sums for SMAs — O(1) per period, no slice allocations
  const allSMAPeriods = new Set([20, 50, 200, ...requiredSMAs]);
  const smaSums: Record<number, number> = {};
  for (const period of allSMAPeriods) smaSums[period] = 0;

  // Track EMA values for each required period.
  // SMA-seeded: emaSums accumulates the first `period` closes, then becomes the
  // first EMA value at i === period - 1. Avoids the false-crossover-on-bar-1
  // bug that close[0] seeding caused (every EMA was identical at bar 0).
  const emaState: Record<number, number | undefined> = {};
  const emaSums: Record<number, number> = {};
  for (const period of requiredEMAs) {
    emaState[period] = undefined;
    emaSums[period] = 0;
  }

  // For RSI
  let avgGain = 0;
  let avgLoss = 0;
  const rsiPeriod = 14;

  // For MACD (dynamic configurations) — SMA-seeded fast/slow EMAs to match
  // the standalone EMA path. signalEma stays seeded with first MACD value
  // since signalPeriod runs over MACD differences, not closes.
  const macdState: Map<string, {
    fastEma: number | undefined;
    slowEma: number | undefined;
    signalEma: number | undefined;
    fastSum: number;
    slowSum: number;
  }> = new Map();
  for (const config of requiredMACDs) {
    const key = `${config.fastPeriod}_${config.slowPeriod}_${config.signalPeriod}`;
    macdState.set(key, {
      fastEma: undefined,
      slowEma: undefined,
      signalEma: undefined,
      fastSum: 0,
      slowSum: 0,
    });
  }

  // For ATR (Wilder's smoothing) — only store first atrPeriod TRs to seed the average
  let trSum = 0;
  let trCount = 0;
  const atrPeriod = 14;
  let atrValue: number | undefined = undefined;

  // For Donchian (dynamic periods)
  const donchianPeriods = new Set([20, ...requiredDonchianPeriods]);

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    closePrices.push(candle.close);

    const indicatorData: IndicatorData = { ...candle };

    if (i > 0) {
      indicatorData.prevClose = data[i - 1].close;
      indicatorData.prevHigh = data[i - 1].high;
      indicatorData.prevLow = data[i - 1].low;
    }

    // Running-sum SMAs — O(1) per period, no slice allocations
    for (const period of allSMAPeriods) {
      smaSums[period] += candle.close;
      if (i >= period) smaSums[period] -= closePrices[i - period];
      if (i >= period - 1) indicatorData[`sma${period}`] = smaSums[period] / period;
    }

    // Dynamic EMAs — SMA-seeded: undefined for the first (period - 1) bars,
    // then SMA of the first `period` closes, then standard EMA recurrence.
    for (const period of requiredEMAs) {
      if (i < period - 1) {
        emaSums[period] += candle.close;
      } else if (i === period - 1) {
        emaSums[period] += candle.close;
        emaState[period] = emaSums[period] / period;
      } else {
        const multiplier = 2 / (period + 1);
        const prevEma = emaState[period]!;
        emaState[period] = (candle.close - prevEma) * multiplier + prevEma;
      }
      indicatorData[`ema${period}`] = emaState[period];
    }

    indicatorData.ema9 = emaState[9];
    indicatorData.ema21 = emaState[21];

    // RSI
    if (i > 0) {
      const change = candle.close - data[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      if (i < rsiPeriod) {
        avgGain += gain;
        avgLoss += loss;
      } else if (i === rsiPeriod) {
        avgGain = (avgGain + gain) / rsiPeriod;
        avgLoss = (avgLoss + loss) / rsiPeriod;
      } else {
        avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
        avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      }

      if (i >= rsiPeriod) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        indicatorData.rsi = 100 - 100 / (1 + rs);
      }
    }

    // MACD (dynamic configurations) — fast/slow EMAs SMA-seeded.
    for (const config of requiredMACDs) {
      const key = `${config.fastPeriod}_${config.slowPeriod}_${config.signalPeriod}`;
      const state = macdState.get(key);
      if (!state) continue;

      // Fast EMA seed
      if (i < config.fastPeriod - 1) {
        state.fastSum += candle.close;
      } else if (i === config.fastPeriod - 1) {
        state.fastSum += candle.close;
        state.fastEma = state.fastSum / config.fastPeriod;
      } else {
        const fastMultiplier = 2 / (config.fastPeriod + 1);
        state.fastEma = (candle.close - state.fastEma!) * fastMultiplier + state.fastEma!;
      }

      // Slow EMA seed
      if (i < config.slowPeriod - 1) {
        state.slowSum += candle.close;
      } else if (i === config.slowPeriod - 1) {
        state.slowSum += candle.close;
        state.slowEma = state.slowSum / config.slowPeriod;
      } else {
        const slowMultiplier = 2 / (config.slowPeriod + 1);
        state.slowEma = (candle.close - state.slowEma!) * slowMultiplier + state.slowEma!;
      }

      if (state.fastEma !== undefined && state.slowEma !== undefined && i >= config.slowPeriod - 1) {
        const macdValue = state.fastEma - state.slowEma;
        indicatorData[`macd_${key}` as `macd_${number}_${number}_${number}`] = macdValue;

        const signalMultiplier = 2 / (config.signalPeriod + 1);
        if (state.signalEma === undefined) {
          state.signalEma = macdValue;
        } else {
          state.signalEma = (macdValue - state.signalEma) * signalMultiplier + state.signalEma;
        }
        indicatorData[`macdSignal_${key}` as `macdSignal_${number}_${number}_${number}`] = state.signalEma;

        if (state.signalEma !== undefined) {
          indicatorData[`macdHistogram_${key}` as `macdHistogram_${number}_${number}_${number}`] = macdValue - state.signalEma;
        }
      }

      if (config.fastPeriod === 12 && config.slowPeriod === 26 && config.signalPeriod === 9) {
        indicatorData.macd = indicatorData[`macd_${key}` as `macd_${number}_${number}_${number}`];
        indicatorData.macdSignal = indicatorData[`macdSignal_${key}` as `macdSignal_${number}_${number}_${number}`];
        indicatorData.macdHistogram = indicatorData[`macdHistogram_${key}` as `macdHistogram_${number}_${number}_${number}`];
      }
    }

    // ATR (Wilder's smoothing: seed with sum of first N TRs, then smooth)
    if (i > 0) {
      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - data[i - 1].close),
        Math.abs(candle.low - data[i - 1].close)
      );
      if (trCount < atrPeriod) {
        trSum += tr;
        trCount++;
        if (trCount === atrPeriod) atrValue = trSum / atrPeriod;
      } else {
        atrValue = (atrValue! * (atrPeriod - 1) + tr) / atrPeriod;
      }
      if (atrValue !== undefined) {
        indicatorData.atr = atrValue;
      }
    }

    // Donchian Channels — inline loop avoids slice/map/spread allocations
    for (const donchianPeriod of donchianPeriods) {
      if (i >= donchianPeriod - 1) {
        let upperBand = -Infinity;
        let lowerBand = Infinity;
        for (let j = i - donchianPeriod + 1; j <= i; j++) {
          if (data[j].high > upperBand) upperBand = data[j].high;
          if (data[j].low < lowerBand) lowerBand = data[j].low;
        }
        const midLine = (upperBand + lowerBand) / 2;

        indicatorData[`donchian_${donchianPeriod}_upperBand` as `donchian_${number}_upperBand`] = upperBand;
        indicatorData[`donchian_${donchianPeriod}_lowerBand` as `donchian_${number}_lowerBand`] = lowerBand;
        indicatorData[`donchian_${donchianPeriod}_midLine` as `donchian_${number}_midLine`] = midLine;

        if (donchianPeriod === 20) {
          indicatorData.upperBand = upperBand;
          indicatorData.lowerBand = lowerBand;
          indicatorData.midLine = midLine;
        }
      }
    }

    result.push(indicatorData);
  }

  return result;
}

export function runBacktestWithParams(
  data: IndicatorData[],
  strategy: StrategyDefinition,
  params: Record<string, number | boolean | string>,
  initialCapital: number,
  riskSettings?: RiskSettings,
  enableShorts: boolean = false
): ParameterizedResult {
  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];
  let equity = initialCapital;
  let position: {
    side: PositionSide;
    entryPrice: number;
    entryTime: number;
    entryIdx: number;
    stopLoss?: number;
    takeProfit?: number;
  } | null = null;
  let tradeId = 1;
  // Accumulates the stop level at each bar while a position is open.
  // Uses inflection-only storage: skips duplicate consecutive values (a fixed
  // SL never changes → stored as a single point; an EMA-based stop changes
  // every bar → all points stored, but capped at MAX_TRAIL_POINTS_PER_TRADE).
  let trailSeries: { time: number; price: number }[] = [];
  const MAX_TRAIL_POINTS_PER_TRADE = 500;

  const trailingStopEmaPeriod = (params.trailingStopEmaPeriod as number) ?? 0;
  // True when any stop is active — avoids building an unused array
  const hasStopMechanism = trailingStopEmaPeriod > 0 || (riskSettings?.stopLossPercent ?? 0) > 0;

  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];
    let exitedViaRiskThisBar = false;

    // Record the effective stop level at the start of this bar before any exit checks.
    // For EMA-based trailing stops the level ratchets with price; for fixed SL it is flat.
    if (position && hasStopMechanism && trailSeries.length < MAX_TRAIL_POINTS_PER_TRADE) {
      let stopLevel: number | undefined;
      if (trailingStopEmaPeriod > 0) {
        stopLevel = current[`ema${trailingStopEmaPeriod}` as keyof typeof current] as number | undefined;
      } else if (position.stopLoss !== undefined) {
        stopLevel = position.stopLoss;
      }
      // Inflection-only: skip if the stop level hasn't changed since last recorded point
      if (
        stopLevel !== undefined &&
        (trailSeries.length === 0 || trailSeries[trailSeries.length - 1].price !== stopLevel)
      ) {
        trailSeries.push({ time: current.time, price: stopLevel });
      }
    }

    if (position && riskSettings) {
      let exitPrice: number | null = null;
      let exitReason: string | null = null;

      if (position.side === PositionSide.LONG) {
        const slHit = position.stopLoss !== undefined && current.low <= position.stopLoss;
        const tpHit = position.takeProfit !== undefined && current.high >= position.takeProfit;

        if (slHit && tpHit) {
          const slDistance = Math.abs(current.open - position.stopLoss!);
          const tpDistance = Math.abs(current.open - position.takeProfit!);
          if (slDistance <= tpDistance) {
            exitPrice = position.stopLoss!;
            exitReason = `Stop loss hit at ${position.stopLoss!.toFixed(2)}`;
          } else {
            exitPrice = position.takeProfit!;
            exitReason = `Take profit hit at ${position.takeProfit!.toFixed(2)}`;
          }
        } else if (slHit) {
          exitPrice = position.stopLoss!;
          exitReason = `Stop loss hit at ${position.stopLoss!.toFixed(2)}`;
        } else if (tpHit) {
          exitPrice = position.takeProfit!;
          exitReason = `Take profit hit at ${position.takeProfit!.toFixed(2)}`;
        }
      } else if (position.side === PositionSide.SHORT) {
        const slHit = position.stopLoss !== undefined && current.high >= position.stopLoss;
        const tpHit = position.takeProfit !== undefined && current.low <= position.takeProfit;

        if (slHit && tpHit) {
          const slDistance = Math.abs(current.open - position.stopLoss!);
          const tpDistance = Math.abs(current.open - position.takeProfit!);
          if (slDistance <= tpDistance) {
            exitPrice = position.stopLoss!;
            exitReason = `Stop loss hit at ${position.stopLoss!.toFixed(2)}`;
          } else {
            exitPrice = position.takeProfit!;
            exitReason = `Take profit hit at ${position.takeProfit!.toFixed(2)}`;
          }
        } else if (slHit) {
          exitPrice = position.stopLoss!;
          exitReason = `Stop loss hit at ${position.stopLoss!.toFixed(2)}`;
        } else if (tpHit) {
          exitPrice = position.takeProfit!;
          exitReason = `Take profit hit at ${position.takeProfit!.toFixed(2)}`;
        }
      }

      if (exitPrice !== null && exitReason !== null) {
        const pnl =
          position.side === PositionSide.LONG
            ? (exitPrice - position.entryPrice) * (equity / position.entryPrice)
            : (position.entryPrice - exitPrice) * (equity / position.entryPrice);
        const pnlPercent =
          ((exitPrice - position.entryPrice) / position.entryPrice) *
          100 *
          (position.side === PositionSide.LONG ? 1 : -1);

        equity += pnl;
        trades.push({
          id: `trade-${tradeId++}`,
          side: position.side,
          entryPrice: position.entryPrice,
          entryTime: position.entryTime,
          exitPrice,
          exitTime: current.time,
          pnl,
          pnlPercent,
          reason: exitReason,
          trailingSeries: trailSeries.length > 0 ? [...trailSeries] : undefined,
        });
        position = null;
        trailSeries = [];
        exitedViaRiskThisBar = true;
      }
    }

    const signal = strategy.handler({
      current,
      previous,
      index: i,
      series: data, // full array — strategies use absolute `index`, not series.length
      params,
    });

    const closePosition = (exitPrice: number, exitReason: string) => {
      if (!position) return;
      const pnl =
        position.side === PositionSide.LONG
          ? (exitPrice - position.entryPrice) * (equity / position.entryPrice)
          : (position.entryPrice - exitPrice) * (equity / position.entryPrice);
      const pnlPercent =
        ((exitPrice - position.entryPrice) / position.entryPrice) *
        100 *
        (position.side === PositionSide.LONG ? 1 : -1);

      equity += pnl;
      trades.push({
        id: `trade-${tradeId++}`,
        side: position.side,
        entryPrice: position.entryPrice,
        entryTime: position.entryTime,
        exitPrice,
        exitTime: current.time,
        pnl,
        pnlPercent,
        reason: exitReason,
        trailingSeries: trailSeries.length > 0 ? [...trailSeries] : undefined,
      });
      position = null;
      trailSeries = [];
    };

    if (signal.action === "buy" && !position && !exitedViaRiskThisBar) {
      const entryPrice = current.close;
      let stopLoss: number | undefined;
      let takeProfit: number | undefined;
      if (riskSettings && riskSettings.stopLossPercent > 0) {
        stopLoss = entryPrice * (1 - riskSettings.stopLossPercent / 100);
      }
      if (riskSettings && riskSettings.takeProfitPercent > 0) {
        takeProfit = entryPrice * (1 + riskSettings.takeProfitPercent / 100);
      }
      position = { side: PositionSide.LONG, entryPrice, entryTime: current.time, entryIdx: i, stopLoss, takeProfit };
    } else if (signal.action === "buy" && position && position.side === PositionSide.SHORT) {
      let exitPrice = current.close;
      let exitReason = signal.reason;
      if (trailingStopEmaPeriod > 0) {
        const emaKey = `ema${trailingStopEmaPeriod}` as keyof typeof current;
        const trailingStopEma = current[emaKey] as number | undefined;
        if (trailingStopEma !== undefined && current.high >= trailingStopEma) {
          exitPrice = trailingStopEma;
          exitReason = `Trailing stop EMA ${trailingStopEmaPeriod} hit (exited at EMA ${trailingStopEma.toFixed(2)})`;
        }
      }
      closePosition(exitPrice, exitReason);
    } else if (signal.action === "sell" && position && position.side === PositionSide.LONG) {
      let exitPrice = current.close;
      let exitReason = signal.reason;
      if (trailingStopEmaPeriod > 0) {
        const emaKey = `ema${trailingStopEmaPeriod}` as keyof typeof current;
        const trailingStopEma = current[emaKey] as number | undefined;
        if (trailingStopEma !== undefined && current.low <= trailingStopEma) {
          exitPrice = trailingStopEma;
          exitReason = `Trailing stop EMA ${trailingStopEmaPeriod} hit (exited at EMA ${trailingStopEma.toFixed(2)})`;
        }
      }
      closePosition(exitPrice, exitReason);
    } else if (signal.action === "sell" && !position && enableShorts && !exitedViaRiskThisBar) {
      const entryPrice = current.close;
      let stopLoss: number | undefined;
      let takeProfit: number | undefined;
      if (riskSettings && riskSettings.stopLossPercent > 0) {
        stopLoss = entryPrice * (1 + riskSettings.stopLossPercent / 100);
      }
      if (riskSettings && riskSettings.takeProfitPercent > 0) {
        takeProfit = entryPrice * (1 - riskSettings.takeProfitPercent / 100);
      }
      position = { side: PositionSide.SHORT, entryPrice, entryTime: current.time, entryIdx: i, stopLoss, takeProfit };
    }

    equityCurve.push({ time: current.time, equity });
  }

  // Close any open position at end
  if (position && data.length > 0) {
    const lastCandle = data[data.length - 1];
    const pnl =
      position.side === PositionSide.LONG
        ? (lastCandle.close - position.entryPrice) * (equity / position.entryPrice)
        : (position.entryPrice - lastCandle.close) * (equity / position.entryPrice);
    const pnlPercent =
      ((lastCandle.close - position.entryPrice) / position.entryPrice) *
      100 *
      (position.side === PositionSide.LONG ? 1 : -1);

    equity += pnl;
    trades.push({
      id: `trade-${tradeId++}`,
      side: position.side,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
      exitPrice: lastCandle.close,
      exitTime: lastCandle.time,
      pnl,
      pnlPercent,
      reason: "End of data",
      trailingSeries: trailSeries.length > 0 ? [...trailSeries] : undefined,
    });
    equityCurve.push({ time: lastCandle.time, equity });
  }

  const winningTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl <= 0);
  const totalPnl = equity - initialCapital;
  const totalPnlPercent = (totalPnl / initialCapital) * 100;

  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0;

  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = peak - point.equity;
    const drawdownPercent = (drawdown / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
    }
  }

  const returns = equityCurve.slice(1).map((p, i) => (p.equity - equityCurve[i].equity) / equityCurve[i].equity);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev =
    returns.length > 0
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
      : 0;
  const sharpeRatio = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(252);

  const firstPrice = data[0]?.close || 0;
  const lastPrice = data[data.length - 1]?.close || 0;
  const buyAndHoldPnlPercent = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const buyAndHoldPnl = initialCapital * (buyAndHoldPnlPercent / 100);

  return {
    params,
    label: createParamLabel(params),
    totalPnl,
    totalPnlPercent,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    averageWin: avgWin,
    averageLoss: avgLoss,
    profitFactor,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    buyAndHoldPnl,
    buyAndHoldPnlPercent,
    equityCurve,
    trades: trades.map((t) => ({ ...t, side: t.side.toString() })),
  };
}

// Derive required indicator periods from strategy ID and parameter combinations
export function deriveRequiredIndicators(
  strategyId: string,
  combinations: Record<string, number | boolean | string>[]
) {
  const requiredEMAs = new Set<number>([9, 21]);
  const requiredSMAs = new Set<number>([20, 50, 200]);
  const requiredMACDsSet = new Set<string>();
  const requiredDonchianPeriods = new Set<number>([20]);

  for (const combo of combinations) {
    for (const [key, value] of Object.entries(combo)) {
      if (typeof value !== "number") continue;
      if (key.toLowerCase().includes("ema")) {
        requiredEMAs.add(value);
      } else if (key === "fastPeriod" || key === "slowPeriod" || key === "midPeriod") {
        if (strategyId.includes("ema")) {
          requiredEMAs.add(value);
        } else if (!strategyId.includes("macd")) {
          requiredSMAs.add(value);
        }
      }
    }

    if (strategyId.includes("macd")) {
      const fast = (combo.fastPeriod as number) || 12;
      const slow = (combo.slowPeriod as number) || 26;
      const signal = (combo.signalPeriod as number) || 9;
      requiredMACDsSet.add(`${fast}_${slow}_${signal}`);
    }

    if (strategyId.includes("donchian")) {
      requiredDonchianPeriods.add((combo.period as number) || 20);
      requiredDonchianPeriods.add((combo.centerLinePeriod as number) || 10);
    }
  }

  const requiredMACDs: MACDConfig[] = Array.from(requiredMACDsSet).map((k) => {
    const [fast, slow, signal] = k.split("_").map(Number);
    return { fastPeriod: fast, slowPeriod: slow, signalPeriod: signal };
  });
  if (!requiredMACDs.some((m) => m.fastPeriod === 12 && m.slowPeriod === 26 && m.signalPeriod === 9)) {
    requiredMACDs.push({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
  }

  return {
    requiredEMAs: Array.from(requiredEMAs),
    requiredSMAs: Array.from(requiredSMAs),
    requiredMACDs,
    requiredDonchianPeriods: Array.from(requiredDonchianPeriods),
  };
}
