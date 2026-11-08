"use client";

import React, { useEffect, useRef, useMemo, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  LineStyle,
  CrosshairMode,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type LogicalRange,
  type SeriesMarker,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type WhitespaceData,
} from "lightweight-charts";
import { Text } from "@radix-ui/themes";
import { Button } from "@/app/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { IndicatorData, BacktestTrade, PositionSide } from "@/app/types";
import { useChartTheme, type ChartTheme } from "./chartTheme";
import { calculateSMMA } from "@/app/strategies/alligator";
import { getSmoothedRocArray } from "@/app/strategies/momentum-roc";
import { getRsiArray, cumulativeRsiAt } from "@/app/strategies/cumulative-rsi";
import { ibs } from "@/app/strategies/ibs-mean-reversion";
import { priorChannel } from "@/app/strategies/turtle";
import { lookbackReturn } from "@/app/strategies/time-series-momentum";
import { getConnorsRsiArray } from "@/app/strategies/connors-rsi";
import { monthCalendar } from "@/app/strategies/turn-of-month";
import { ichimokuAt } from "@/app/strategies/ichimoku";
import { getKamaArray } from "@/app/strategies/kama-trend";
import { getZoneSeries, zoneParamsFrom } from "@/app/strategies/supply-demand";
import { getDmi } from "@/app/strategies/adx-dmi";
import { getRegressionMomentum, getSmaArray } from "@/app/strategies/regression-momentum";
import { getPercentB } from "@/app/strategies/connors-percent-b";

interface BacktestChartProps {
  data: IndicatorData[];
  trades: BacktestTrade[];
  visibleCandles: number;
  onVisibleCandlesChange: (candles: number) => void;
  selectedStrategyId?: string;
  selectedTradeId?: string | null;
  currentParams?: Record<string, number | boolean | string>;
}

const MIN_CANDLES = 10;
const MAX_CANDLES = 1000;

// ── Indicator helpers (kept inline for parity with previous chart) ──────────


function calcSMA(closes: number[], period: number): (number | undefined)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return undefined;
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function calcStdDev(closes: number[], period: number): (number | undefined)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return undefined;
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    return Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  });
}

function calcATR(data: IndicatorData[], period: number): (number | undefined)[] {
  let trSum = 0;
  let trCount = 0;
  let atr: number | undefined;
  return data.map((d, i) => {
    if (i === 0) return undefined;
    const tr = Math.max(d.high - d.low, Math.abs(d.high - data[i - 1].close), Math.abs(d.low - data[i - 1].close));
    if (trCount < period) {
      trSum += tr;
      trCount++;
      if (trCount === period) atr = trSum / period;
    } else {
      atr = (atr! * (period - 1) + tr) / period;
    }
    return atr;
  });
}

type PriceLine = {
  values: (number | undefined)[];
  color: string;
  label: string;
  lineWidth?: number;
  dashed?: boolean;
};

type OscillatorPanel = {
  type: "rsi" | "macd" | "stochastic" | "roc" | "ibs" | "calendar";
  series: { values: (number | undefined)[]; color: string; label: string; lineWidth?: number }[];
  histogram?: { values: (number | undefined)[]; positiveColor: string; negativeColor: string };
  hLines?: { value: number; color: string; dashed: boolean }[];
};

// Map a strategy id + its params to overlay lines and (optionally) an oscillator
// panel. Logic preserved verbatim from the previous canvas chart.
function computeIndicators(
  data: IndicatorData[],
  strategyId: string,
  params: Record<string, number | boolean | string>,
  c: ChartTheme,
): { priceLines: PriceLine[]; oscillator?: OscillatorPanel } {
  const closes = data.map((d) => d.close);
  const priceLines: PriceLine[] = [];
  let oscillator: OscillatorPanel | undefined;
  const num = (key: string, fallback: number) => ((params[key] as number) ?? fallback);

  switch (strategyId) {
    case "ema-crossover": {
      const fast = num("fastPeriod", 9);
      const slow = num("slowPeriod", 21);
      priceLines.push({ values: data.map((d) => d[`ema${fast}` as keyof IndicatorData] as number | undefined), color: c.yellow, label: `EMA ${fast}` });
      priceLines.push({ values: data.map((d) => d[`ema${slow}` as keyof IndicatorData] as number | undefined), color: c.magenta, label: `EMA ${slow}` });
      break;
    }
    case "triple-ema": {
      const fast = num("fastPeriod", 4);
      const mid = num("midPeriod", 9);
      const slow = num("slowPeriod", 18);
      priceLines.push({ values: data.map((d) => d[`ema${fast}` as keyof IndicatorData] as number | undefined), color: c.yellow, label: `EMA ${fast}` });
      priceLines.push({ values: data.map((d) => d[`ema${mid}` as keyof IndicatorData] as number | undefined), color: c.brightCyan, label: `EMA ${mid}` });
      priceLines.push({ values: data.map((d) => d[`ema${slow}` as keyof IndicatorData] as number | undefined), color: c.magenta, label: `EMA ${slow}` });
      break;
    }
    case "sma-crossover": {
      const fast = num("fastPeriod", 50);
      const slow = num("slowPeriod", 200);
      priceLines.push({ values: data.map((d) => d[`sma${fast}` as keyof IndicatorData] as number | undefined), color: c.blue, label: `SMA ${fast}` });
      priceLines.push({ values: data.map((d) => d[`sma${slow}` as keyof IndicatorData] as number | undefined), color: c.yellow, label: `SMA ${slow}` });
      break;
    }
    case "ema-pullback": {
      const fast = num("fastPeriod", 20);
      const slow = num("slowPeriod", 50);
      priceLines.push({ values: data.map((d) => d[`ema${fast}` as keyof IndicatorData] as number | undefined), color: c.yellow, label: `EMA ${fast}` });
      priceLines.push({ values: data.map((d) => d[`ema${slow}` as keyof IndicatorData] as number | undefined), color: c.magenta, label: `EMA ${slow}` });
      break;
    }
    case "ema-price-cross": {
      const period = num("emaPeriod", 20);
      priceLines.push({ values: data.map((d) => d[`ema${period}` as keyof IndicatorData] as number | undefined), color: c.yellow, label: `EMA ${period}` });
      break;
    }
    case "donchian-channel": {
      // The strategy tests each close against the previous bar's channel (the
      // current bar's own high/low is inside its band), so draw it one bar late
      // — a breakout is then a close through the drawn line.
      const period = num("period", 20);
      const center = num("centerLinePeriod", 10);
      const prevBar = (key: string) =>
        data.map((_, i) => (i === 0 ? undefined : (data[i - 1][key as keyof IndicatorData] as number | undefined)));
      priceLines.push({ values: prevBar(`donchian_${period}_upperBand`), color: c.cyan, label: `DC ${period}`, dashed: true });
      priceLines.push({ values: prevBar(`donchian_${period}_lowerBand`), color: c.cyan, label: "", dashed: true });
      priceLines.push({ values: prevBar(`donchian_${center}_midLine`), color: c.brightCyan, label: `Mid ${center}`, lineWidth: 1, dashed: true });
      break;
    }
    case "alligator": {
      // Each SMMA is read `shift` bars back, as the strategy reads it.
      const line = (period: number, shift: number) => {
        const smma = calculateSMMA(closes, period);
        return data.map((_, i) => {
          const v = smma[i - shift];
          return v === undefined || Number.isNaN(v) ? undefined : v;
        });
      };
      priceLines.push({ values: line(num("jawPeriod", 13), num("jawShift", 8)), color: c.blue, label: "Jaw" });
      priceLines.push({ values: line(num("teethPeriod", 8), num("teethShift", 5)), color: c.red, label: "Teeth" });
      priceLines.push({ values: line(num("lipsPeriod", 5), num("lipsShift", 3)), color: c.green, label: "Lips" });
      break;
    }
    case "breakout": {
      // Highest/lowest CLOSE over the lookback (matches strategy semantics).
      const lookback = num("lookbackPeriod", 20);
      const upper: (number | undefined)[] = new Array(data.length).fill(undefined);
      const lower: (number | undefined)[] = new Array(data.length).fill(undefined);
      for (let i = lookback; i < data.length; i++) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - lookback; j < i; j++) {
          const c = closes[j];
          if (c > hi) hi = c;
          if (c < lo) lo = c;
        }
        upper[i] = hi;
        lower[i] = lo;
      }
      priceLines.push({ values: upper, color: c.cyan, label: `${lookback}-bar high close`, dashed: true });
      priceLines.push({ values: lower, color: c.cyan, label: "", dashed: true });
      const trail = num("trailingStopEmaPeriod", 0);
      if (trail > 0) {
        priceLines.push({ values: data.map((d) => d[`ema${trail}` as keyof IndicatorData] as number | undefined), color: c.yellow, label: `Trail EMA ${trail}`, dashed: true });
      }
      break;
    }
    case "bollinger-bands": {
      const period = num("period", 20);
      const mult = num("stdDev", 2);
      const sma = calcSMA(closes, period);
      const std = calcStdDev(closes, period);
      priceLines.push({ values: sma.map((s, i) => s !== undefined && std[i] !== undefined ? s + mult * std[i]! : undefined), color: c.magenta, label: `BB±${mult}σ`, dashed: true });
      priceLines.push({ values: sma, color: c.blue, label: `SMA ${period}`, lineWidth: 1 });
      priceLines.push({ values: sma.map((s, i) => s !== undefined && std[i] !== undefined ? s - mult * std[i]! : undefined), color: c.magenta, label: "", dashed: true });
      break;
    }
    case "keltner-channel": {
      const emaPeriod = num("emaPeriod", 20);
      const atrPeriod = num("atrPeriod", 10);
      const mult = num("multiplier", 2);
      const ema = data.map((d) => d[`ema${emaPeriod}` as keyof IndicatorData] as number | undefined);
      const atr = calcATR(data, atrPeriod);
      priceLines.push({ values: ema.map((e, i) => e !== undefined && atr[i] !== undefined ? e + mult * atr[i]! : undefined), color: c.cyan, label: `KC±${mult}ATR`, dashed: true });
      priceLines.push({ values: ema, color: c.blue, label: `EMA ${emaPeriod}` });
      priceLines.push({ values: ema.map((e, i) => e !== undefined && atr[i] !== undefined ? e - mult * atr[i]! : undefined), color: c.cyan, label: "", dashed: true });
      break;
    }
    case "macd-crossover": {
      // The strategy reads the MACD built from this result's own periods, not
      // the default 12/26/9 — plot that same one or the crosses won't match.
      const k = `${num("fastPeriod", 12)}_${num("slowPeriod", 26)}_${num("signalPeriod", 9)}`;
      const field = (name: string) => data.map((d) => d[`${name}_${k}` as keyof IndicatorData] as number | undefined);
      if (params.trendFilter ?? false) {
        priceLines.push({ values: data.map((d) => d.sma200), color: c.yellow, label: "SMA 200" });
      }
      oscillator = {
        type: "macd",
        series: [
          { values: field("macd"), color: c.blue, label: `MACD ${k.replace(/_/g, "/")}` },
          { values: field("macdSignal"), color: c.yellow, label: "Signal" },
        ],
        histogram: { values: field("macdHistogram"), positiveColor: c.green, negativeColor: c.red },
        hLines: [{ value: 0, color: c.muted, dashed: true }],
      };
      break;
    }
    case "rsi-mean-reversion": {
      const ob = num("overbought", 70);
      const os = num("oversold", 30);
      oscillator = {
        type: "rsi",
        series: [{ values: data.map((d) => d.rsi), color: c.magenta, label: "RSI 14" }],
        hLines: [
          { value: ob, color: c.red, dashed: true },
          { value: os, color: c.green, dashed: true },
          { value: 50, color: c.muted, dashed: true },
        ],
      };
      break;
    }
    case "rsi2": {
      const period = 2;
      const rsiVals: (number | undefined)[] = new Array(data.length).fill(undefined);
      let ag = 0, al = 0;
      for (let i = 1; i < data.length; i++) {
        const ch = data[i].close - data[i - 1].close;
        const g = ch > 0 ? ch : 0;
        const l = ch < 0 ? -ch : 0;
        if (i < period) { ag += g; al += l; }
        else if (i === period) { ag = (ag + g) / period; al = (al + l) / period; }
        else { ag = (ag * (period - 1) + g) / period; al = (al * (period - 1) + l) / period; }
        if (i >= period) rsiVals[i] = 100 - 100 / (1 + (al === 0 ? 100 : ag / al));
      }
      oscillator = {
        type: "rsi",
        series: [{ values: rsiVals, color: c.magenta, label: "RSI 2" }],
        hLines: [
          { value: num("overbought", 90), color: c.red, dashed: true },
          { value: num("oversold", 10), color: c.green, dashed: true },
        ],
      };
      break;
    }
    case "stochastic": {
      const kPeriod = num("kPeriod", 14);
      const dPeriod = num("dPeriod", 3);
      const kVals: (number | undefined)[] = [];
      for (let i = 0; i < data.length; i++) {
        if (i < kPeriod - 1) { kVals.push(undefined); continue; }
        const sl = data.slice(i - kPeriod + 1, i + 1);
        const hh = Math.max(...sl.map((d) => d.high));
        const ll = Math.min(...sl.map((d) => d.low));
        const rng = hh - ll;
        kVals.push(rng === 0 ? 50 : ((data[i].close - ll) / rng) * 100);
      }
      const dVals: (number | undefined)[] = kVals.map((_, i) => {
        if (i < kPeriod - 1 + dPeriod - 1) return undefined;
        const sl = kVals.slice(i - dPeriod + 1, i + 1).filter((v): v is number => v !== undefined);
        return sl.length === dPeriod ? sl.reduce((a, b) => a + b, 0) / dPeriod : undefined;
      });
      oscillator = {
        type: "stochastic",
        series: [
          { values: kVals, color: c.blue, label: "%K" },
          { values: dVals, color: c.yellow, label: "%D" },
        ],
        hLines: [
          { value: num("overbought", 80), color: c.red, dashed: true },
          { value: num("oversold", 20), color: c.green, dashed: true },
        ],
      };
      break;
    }
    case "faber-trend": {
      const period = num("smaPeriod", 200);
      const band = num("bandPercent", 1) / 100;
      const sma = data.map((d) => d[`sma${period}` as keyof IndicatorData] as number | undefined);
      priceLines.push({ values: sma, color: c.yellow, label: `SMA ${period}`, lineWidth: 2 });
      if (band > 0) {
        priceLines.push({ values: sma.map((v) => (v === undefined ? undefined : v * (1 + band))), color: c.muted, label: "", lineWidth: 1, dashed: true });
        priceLines.push({ values: sma.map((v) => (v === undefined ? undefined : v * (1 - band))), color: c.muted, label: "", lineWidth: 1, dashed: true });
      }
      break;
    }
    case "turtle": {
      // Channels of the bars before each one, the levels the strategy compares
      // that bar's close against.
      const channel = (period: number) => data.map((_, i) => priorChannel(data, i, period));
      const entry = channel(num("entryPeriod", 20));
      const exit = channel(num("exitPeriod", 10));
      priceLines.push({ values: entry.map((c) => c?.high), color: c.green, label: "Entry high" });
      priceLines.push({ values: entry.map((c) => c?.low), color: c.red, label: "Entry low" });
      priceLines.push({ values: exit.map((c) => c?.high), color: c.muted, label: "Exit high", dashed: true });
      priceLines.push({ values: exit.map((c) => c?.low), color: c.muted, label: "Exit low", dashed: true });
      break;
    }
    case "double-7s": {
      if (params.trendFilter ?? true) {
        priceLines.push({ values: data.map((d) => d.sma200), color: c.yellow, label: "SMA 200" });
      }
      break;
    }
    case "cumulative-rsi": {
      const period = num("rsiPeriod", 2);
      const days = num("sumDays", 2);
      const rsi = getRsiArray(data, period);
      if (params.trendFilter ?? true) {
        priceLines.push({ values: data.map((d) => d.sma200), color: c.yellow, label: "SMA 200" });
      }
      oscillator = {
        type: "rsi",
        series: [
          { values: rsi.map((v) => (Number.isNaN(v) ? undefined : v)), color: c.magenta, label: `RSI ${period}` },
          { values: rsi.map((_, i) => { const c = cumulativeRsiAt(rsi, i, days); return Number.isNaN(c) ? undefined : c; }), color: c.blue, label: `Sum of ${days}` },
        ],
        hLines: [
          { value: num("exitLevel", 65), color: c.red, dashed: true },
          { value: num("entryLevel", 35), color: c.green, dashed: true },
        ],
      };
      break;
    }
    case "ibs-mean-reversion": {
      if (params.trendFilter ?? false) {
        priceLines.push({ values: data.map((d) => d.sma200), color: c.yellow, label: "SMA 200" });
      }
      oscillator = {
        type: "ibs",
        series: [{ values: data.map((d) => ibs(d)), color: c.magenta, label: "IBS" }],
        hLines: [
          { value: num("exitIbs", 80) / 100, color: c.red, dashed: true },
          { value: num("entryIbs", 20) / 100, color: c.green, dashed: true },
        ],
      };
      break;
    }
    case "time-series-momentum": {
      const lookback = num("lookback", 252);
      const skip = num("skipBars", 0);
      const threshold = num("threshold", 0);
      oscillator = {
        type: "roc",
        series: [{
          values: data.map((_, i) => { const r = lookbackReturn(data, i, lookback, skip); return Number.isNaN(r) ? undefined : r; }),
          color: c.magenta,
          label: `${lookback}-bar return %`,
        }],
        hLines: threshold > 0
          ? [{ value: threshold, color: c.green, dashed: true }, { value: -threshold, color: c.red, dashed: true }]
          : [{ value: 0, color: c.muted, dashed: true }],
      };
      break;
    }
    case "connors-rsi": {
      const crsi = getConnorsRsiArray(data, num("rsiPeriod", 3), num("streakPeriod", 2), num("rankPeriod", 100));
      if (params.trendFilter ?? true) {
        priceLines.push({ values: data.map((d) => d.sma200), color: c.yellow, label: "SMA 200" });
      }
      oscillator = {
        type: "rsi",
        series: [{ values: crsi.map((v) => (Number.isNaN(v) ? undefined : v)), color: c.magenta, label: "ConnorsRSI" }],
        hLines: [
          { value: num("exitLevel", 70), color: c.red, dashed: true },
          { value: num("entryLevel", 10), color: c.green, dashed: true },
        ],
      };
      break;
    }
    case "turn-of-month": {
      // Trading day of the month, and days left in it, at each bar: the
      // strategy buys where days left reaches the entry line and sells where
      // the day of the month reaches the exit line.
      const calendar = monthCalendar(data);
      oscillator = {
        type: "calendar",
        series: [
          { values: calendar.dayOfMonth, color: c.blue, label: "Trading day" },
          { values: calendar.daysLeft, color: c.magenta, label: "Days left" },
        ],
        hLines: [
          { value: num("exitDay", 3), color: c.red, dashed: true },
          { value: num("entryDaysBefore", 1) - 1, color: c.green, dashed: true },
        ],
      };
      break;
    }
    case "ichimoku": {
      const tenkanPeriod = num("tenkanPeriod", 9);
      const kijunPeriod = num("kijunPeriod", 26);
      const senkouPeriod = num("senkouPeriod", 52);
      const lines = data.map((_, i) => ichimokuAt(data, i, tenkanPeriod, kijunPeriod, senkouPeriod));
      const defined = (v: number) => (Number.isNaN(v) ? undefined : v);
      priceLines.push({ values: lines.map((l) => defined(l.tenkan)), color: c.blue, label: `Tenkan ${tenkanPeriod}`, lineWidth: 1 });
      priceLines.push({ values: lines.map((l) => defined(l.kijun)), color: c.red, label: `Kijun ${kijunPeriod}` });
      priceLines.push({ values: lines.map((l) => defined(l.senkouA)), color: c.green, label: "Senkou A", lineWidth: 1, dashed: true });
      priceLines.push({ values: lines.map((l) => defined(l.senkouB)), color: c.yellow, label: "Senkou B", lineWidth: 1, dashed: true });
      break;
    }
    case "supply-demand": {
      // The nearest demand zone under price and supply zone over it, as they
      // stood going into each bar: what that bar's close is judged against.
      // A gap where the nearest zone changes keeps one zone's edge from being
      // joined to the next.
      const zones = getZoneSeries(data, zoneParamsFrom(params));
      const edge = (arr: Float64Array, pair: Float64Array) =>
        data.map((_, i) => {
          if (i < 1 || Number.isNaN(arr[i - 1])) return undefined;
          if (i >= 2 && (arr[i - 2] !== arr[i - 1] || pair[i - 2] !== pair[i - 1])) return undefined;
          return arr[i - 1];
        });
      priceLines.push({ values: edge(zones.demandTop, zones.demandBottom), color: c.green, label: "Demand", lineWidth: 2 });
      priceLines.push({ values: edge(zones.demandBottom, zones.demandTop), color: c.green, label: "", lineWidth: 1, dashed: true });
      priceLines.push({ values: edge(zones.supplyBottom, zones.supplyTop), color: c.red, label: "Supply", lineWidth: 2 });
      priceLines.push({ values: edge(zones.supplyTop, zones.supplyBottom), color: c.red, label: "", lineWidth: 1, dashed: true });
      break;
    }
    case "adx-dmi": {
      const { plusDi, minusDi, adx } = getDmi(data, num("period", 14));
      const defined = (arr: number[]) => arr.map((v) => (Number.isNaN(v) ? undefined : v));
      oscillator = {
        type: "rsi",
        series: [
          { values: defined(plusDi), color: c.green, label: "+DI" },
          { values: defined(minusDi), color: c.red, label: "-DI" },
          { values: defined(adx), color: c.foreground, label: "ADX", lineWidth: 2 },
        ],
        hLines: [{ value: num("adxThreshold", 20), color: c.muted, dashed: true }],
      };
      break;
    }
    case "regression-momentum": {
      const maPeriod = num("maPeriod", 100);
      const { score } = getRegressionMomentum(data, num("lookback", 90), Number(params.barsPerYear) || 252);
      const sma = getSmaArray(data, maPeriod);
      priceLines.push({ values: sma.map((v) => (Number.isNaN(v) ? undefined : v)), color: c.yellow, label: `SMA ${maPeriod}`, lineWidth: 2 });
      const minScore = num("minScore", 30);
      oscillator = {
        type: "roc",
        series: [{ values: score.map((v) => (Number.isNaN(v) ? undefined : v)), color: c.magenta, label: "Slope x R² %/yr" }],
        hLines: [
          { value: minScore, color: c.green, dashed: true },
          { value: num("exitScore", 0), color: c.red, dashed: true },
          { value: -minScore, color: c.green, dashed: true },
        ],
      };
      break;
    }
    case "connors-r3": {
      if (params.trendFilter ?? true) {
        priceLines.push({ values: data.map((d) => d.sma200), color: c.yellow, label: "SMA 200" });
      }
      const rsi = getRsiArray(data, 2);
      oscillator = {
        type: "rsi",
        series: [{ values: rsi.map((v) => (Number.isNaN(v) ? undefined : v)), color: c.magenta, label: "RSI(2)" }],
        hLines: [
          { value: num("exitLevel", 70), color: c.red, dashed: true },
          { value: num("startLevel", 60), color: c.muted, dashed: true },
          { value: num("entryLevel", 10), color: c.green, dashed: true },
        ],
      };
      break;
    }
    case "connors-percent-b": {
      if (params.trendFilter ?? true) {
        priceLines.push({ values: data.map((d) => d.sma200), color: c.yellow, label: "SMA 200" });
      }
      const pctB = getPercentB(data, num("period", 5), num("stdDev", 1));
      oscillator = {
        type: "ibs",
        series: [{ values: pctB.map((v) => (Number.isNaN(v) ? undefined : v)), color: c.magenta, label: "%b" }],
        hLines: [
          { value: num("exitPctB", 80) / 100, color: c.red, dashed: true },
          { value: num("entryPctB", 20) / 100, color: c.green, dashed: true },
        ],
      };
      break;
    }
    case "kama-trend": {
      const kama = getKamaArray(data, num("erPeriod", 10), num("fastLength", 2), num("slowLength", 30));
      priceLines.push({ values: kama.map((v) => (Number.isNaN(v) ? undefined : v)), color: c.yellow, label: "KAMA", lineWidth: 2 });
      break;
    }
    case "momentum-roc": {
      // The series the strategy trades on: EMA-smoothed ROC once there's
      // enough history for it, raw ROC before that.
      const rocPeriod = num("rocPeriod", 20);
      const smoothing = num("smoothing", 5);
      const ema = smoothing > 1 && data.length > rocPeriod ? getSmoothedRocArray(data, rocPeriod, smoothing) : [];
      const smoothed: (number | undefined)[] = closes.map((c, i) => {
        if (i < rocPeriod) return undefined;
        if (smoothing > 1 && i >= rocPeriod + smoothing && !Number.isNaN(ema[i])) return ema[i];
        return ((c - closes[i - rocPeriod]) / closes[i - rocPeriod]) * 100;
      });
      oscillator = {
        type: "roc",
        series: [{ values: smoothed, color: c.magenta, label: `ROC(${rocPeriod})` }],
        hLines: [
          { value: num("entryThreshold", 2), color: c.green, dashed: true },
          { value: num("exitThreshold", 0), color: c.red, dashed: true },
        ],
      };
      break;
    }
  }

  return { priceLines, oscillator };
}

// Map (number | undefined)[] → one point per chart bar. Bars with no value
// become whitespace instead of being dropped: the price and oscillator panes
// are synced by logical (bar) index, so the oscillator has to hold every bar
// the candles do, or its warm-up gap shifts every line left of the trades.
function toLineData(times: number[], values: (number | undefined)[]): (LineData<Time> | WhitespaceData<Time>)[] {
  return times.map((t, i) => {
    const v = values[i];
    const time = (t / 1000) as Time;
    return v === undefined || !Number.isFinite(v) ? { time } : { time, value: v };
  });
}

/** Surface, text, grid and scale colors for a chart, from the design tokens. */
function chartChrome(c: ChartTheme) {
  return {
    layout: { background: { color: c.background }, textColor: c.text },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderColor: c.border },
    timeScale: { borderColor: c.border },
  };
}

const BacktestChart: React.FC<BacktestChartProps> = ({
  data,
  trades,
  visibleCandles,
  onVisibleCandlesChange,
  selectedStrategyId,
  selectedTradeId,
  currentParams = {},
}) => {
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const oscContainerRef = useRef<HTMLDivElement>(null);
  const priceChartRef = useRef<IChartApi | null>(null);
  const oscChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const oscSeriesRef = useRef<ISeriesApi<"Line" | "Histogram">[]>([]);
  const trailSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const markerPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const syncingRangeRef = useRef(false);
  const colors = useChartTheme();

  const { priceLines, oscillator } = useMemo(() => {
    if (!colors || !data || data.length === 0 || !selectedStrategyId) return { priceLines: [] as PriceLine[], oscillator: undefined };
    return computeIndicators(data, selectedStrategyId, currentParams, colors);
  }, [data, selectedStrategyId, currentParams, colors]);

  const hasOscillator = !!oscillator;

  // ── Set up the price chart once. The series get rebuilt when data/strategy
  // changes (it's cleaner than diffing line-by-line).
  useEffect(() => {
    const el = priceContainerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: { attributionLogo: false },
      timeScale: { timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    priceChartRef.current = chart;
    return () => {
      chart.remove();
      priceChartRef.current = null;
      candleSeriesRef.current = null;
      overlaySeriesRef.current = [];
      trailSeriesRef.current = [];
      markerPluginRef.current = null;
    };
  }, []);

  // Oscillator chart lifecycle (only when needed).
  useEffect(() => {
    const el = oscContainerRef.current;
    if (!el || !hasOscillator) return;
    const chart = createChart(el, {
      layout: { attributionLogo: false },
      timeScale: { timeVisible: true, secondsVisible: false, visible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    oscChartRef.current = chart;
    return () => {
      chart.remove();
      oscChartRef.current = null;
      oscSeriesRef.current = [];
    };
  }, [hasOscillator]);

  // Chart chrome and candle colors follow the theme. Runs after the create
  // effects above (same render), and again whenever light/dark flips.
  useEffect(() => {
    if (!colors) return;
    priceChartRef.current?.applyOptions(chartChrome(colors));
    oscChartRef.current?.applyOptions(chartChrome(colors));
    candleSeriesRef.current?.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
  }, [colors, hasOscillator, data]);

  // Sync time scales between price + oscillator charts.
  useEffect(() => {
    const price = priceChartRef.current;
    const osc = oscChartRef.current;
    if (!price || !osc) return;
    const onPrice = (range: LogicalRange | null) => {
      if (syncingRangeRef.current || !range) return;
      syncingRangeRef.current = true;
      osc.timeScale().setVisibleLogicalRange(range);
      syncingRangeRef.current = false;
    };
    const onOsc = (range: LogicalRange | null) => {
      if (syncingRangeRef.current || !range) return;
      syncingRangeRef.current = true;
      price.timeScale().setVisibleLogicalRange(range);
      syncingRangeRef.current = false;
    };
    price.timeScale().subscribeVisibleLogicalRangeChange(onPrice);
    osc.timeScale().subscribeVisibleLogicalRangeChange(onOsc);
    return () => {
      price.timeScale().unsubscribeVisibleLogicalRangeChange(onPrice);
      osc.timeScale().unsubscribeVisibleLogicalRangeChange(onOsc);
    };
  }, [hasOscillator]);

  // Push candles + overlays whenever inputs change.
  useEffect(() => {
    const chart = priceChartRef.current;
    if (!chart || !colors || !data || data.length === 0) return;

    // Candle series — recreate to avoid stale state across dataset switches.
    if (candleSeriesRef.current) {
      chart.removeSeries(candleSeriesRef.current);
      candleSeriesRef.current = null;
    }
    const { up, down } = colors;
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    });
    const candleData: CandlestickData<Time>[] = data.map((d) => ({
      time: (d.time / 1000) as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candles.setData(candleData);
    candleSeriesRef.current = candles;

    // Clear old overlays.
    for (const s of overlaySeriesRef.current) chart.removeSeries(s);
    overlaySeriesRef.current = [];
    for (const s of trailSeriesRef.current) chart.removeSeries(s);
    trailSeriesRef.current = [];
    if (markerPluginRef.current) {
      markerPluginRef.current.detach();
      markerPluginRef.current = null;
    }

    const times = data.map((d) => d.time);

    // Indicator overlays.
    for (const line of priceLines) {
      const series = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: (line.lineWidth ?? 1.5) as 1 | 2 | 3 | 4,
        lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: !!line.label,
        title: line.label || undefined,
        crosshairMarkerVisible: false,
      });
      series.setData(toLineData(times, line.values));
      overlaySeriesRef.current.push(series);
    }

    // Trade markers — BUY/SELL with shape + color matching previous chart.
    const markers: SeriesMarker<Time>[] = [];
    for (const t of trades) {
      const isLong = (t.side as PositionSide | string) === PositionSide.LONG || t.side === "LONG";
      const isSel = t.id === selectedTradeId;
      // Stop-loss and trailing-stop exits fire when price moves against the
      // position, so the exit is at the bottom for longs (belowBar) and at the
      // top for shorts (aboveBar) — matching where the EMA/SL trail line ends.
      const isStopExit = t.reason.includes("Stop loss hit") || t.reason.includes("Trailing stop");
      const exitPosition: "aboveBar" | "belowBar" = isLong
        ? (isStopExit ? "belowBar" : "aboveBar")
        : (isStopExit ? "aboveBar" : "belowBar");
      markers.push({
        time: (t.entryTime / 1000) as Time,
        position: isLong ? "belowBar" : "aboveBar",
        color: isSel ? colors.blue : isLong ? colors.green : colors.red,
        shape: isLong ? "arrowUp" : "arrowDown",
        text: isLong ? "BUY" : "SELL",
        size: isSel ? 2 : 1,
      });
      markers.push({
        time: (t.exitTime / 1000) as Time,
        position: exitPosition,
        color: isSel ? colors.blue : t.pnl > 0 ? colors.green : colors.red,
        shape: "circle",
        // Two decimals: a fill at the next open often lands within a few
        // hundredths of a percent of entry, which one decimal shows as 0.0%.
        text: t.pnl > 0 ? `+${t.pnlPercent.toFixed(2)}%` : `${t.pnlPercent.toFixed(2)}%`,
        size: isSel ? 2 : 1,
      });
    }
    // Sort markers by time — lightweight-charts requires ascending order.
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    markerPluginRef.current = createSeriesMarkers(candles, markers);

    // Trailing stop overlays — one line per trade with a non-empty trailingSeries.
    // When a specific trade is selected, only show that trade's trail to avoid
    // overlapping lines from other trades cluttering the view.
    for (const t of trades) {
      const ts = t.trailingSeries;
      if (!ts || ts.length === 0) continue;
      if (selectedTradeId && t.id !== selectedTradeId) continue;
      const trailLine = chart.addSeries(LineSeries, {
        color: colors.red,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const lineData: LineData<Time>[] = ts
        .map((p) => ({ time: (p.time / 1000) as Time, value: p.price }))
        .sort((a, b) => (a.time as number) - (b.time as number));
      // Deduplicate identical timestamps (lightweight-charts disallows them).
      const dedup: LineData<Time>[] = [];
      for (const d of lineData) {
        if (dedup.length === 0 || dedup[dedup.length - 1].time !== d.time) dedup.push(d);
      }
      trailLine.setData(dedup);
      trailSeriesRef.current.push(trailLine);
    }
  }, [data, priceLines, trades, selectedTradeId, colors]);

  // Push oscillator panel data.
  useEffect(() => {
    const chart = oscChartRef.current;
    if (!chart || !oscillator || !data || data.length === 0) return;

    for (const s of oscSeriesRef.current) chart.removeSeries(s);
    oscSeriesRef.current = [];

    const times = data.map((d) => d.time);

    if (oscillator.histogram) {
      const histo = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
      const histoData: (HistogramData<Time> | WhitespaceData<Time>)[] = [];
      for (let i = 0; i < times.length; i++) {
        const v = oscillator.histogram.values[i];
        if (v === undefined || !Number.isFinite(v)) {
          histoData.push({ time: (times[i] / 1000) as Time });
          continue;
        }
        histoData.push({
          time: (times[i] / 1000) as Time,
          value: v,
          color: v >= 0 ? oscillator.histogram.positiveColor : oscillator.histogram.negativeColor,
        });
      }
      histo.setData(histoData);
      oscSeriesRef.current.push(histo);
    }

    for (const line of oscillator.series) {
      const s = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: (line.lineWidth ?? 1.5) as 1 | 2 | 3 | 4,
        priceLineVisible: false,
        lastValueVisible: true,
        title: line.label,
        crosshairMarkerVisible: false,
      });
      s.setData(toLineData(times, line.values));
      oscSeriesRef.current.push(s);
    }

    // Horizontal reference lines via createPriceLine on the first series.
    const first = oscSeriesRef.current[oscSeriesRef.current.length - 1];
    if (first && oscillator.hLines) {
      for (const h of oscillator.hLines) {
        first.createPriceLine({
          price: h.value,
          color: h.color,
          lineWidth: 1,
          lineStyle: h.dashed ? LineStyle.Dashed : LineStyle.Solid,
          axisLabelVisible: true,
          title: "",
        });
      }
    }
  }, [oscillator, data]);

  // Apply visibleCandles by computing the rightmost N bars whenever data or
  // visibleCandles changes. Skipped while the user pans (range changes from
  // their gesture) — we only force the range on explicit zoom / new dataset.
  const lastDataLenRef = useRef<number>(0);
  useEffect(() => {
    const chart = priceChartRef.current;
    if (!chart || data.length === 0) return;
    const ts = chart.timeScale();
    const total = data.length;
    const wanted = Math.min(Math.max(visibleCandles, MIN_CANDLES), Math.min(MAX_CANDLES, total));
    let to = total - 1;
    // A strategy that holds for years (RSI mean reversion often does) can have
    // no entry in the last `wanted` bars, which leaves the default view with no
    // trades on it. Pull the window back so the latest entry sits two thirds in.
    if (trades.length > 0) {
      const lastEntryTime = Math.max(...trades.map((t) => t.entryTime));
      let lastEntryIdx = total - 1;
      for (let i = 0; i < total; i++) {
        if (data[i].time >= lastEntryTime) { lastEntryIdx = i; break; }
      }
      if (lastEntryIdx < total - wanted) {
        to = Math.min(total - 1, lastEntryIdx + Math.floor(wanted / 3));
      }
    }
    const from = Math.max(0, to - wanted);
    syncingRangeRef.current = true;
    ts.setVisibleLogicalRange({ from, to });
    if (oscChartRef.current) {
      oscChartRef.current.timeScale().setVisibleLogicalRange({ from, to });
    }
    syncingRangeRef.current = false;
    lastDataLenRef.current = total;
  }, [visibleCandles, data, trades]);

  // Scroll to selected trade.
  useEffect(() => {
    const chart = priceChartRef.current;
    if (!chart || !selectedTradeId || data.length === 0) return;
    const trade = trades.find((t) => t.id === selectedTradeId);
    if (!trade) return;
    // Find logical index of entry bar.
    let idx = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i].time >= trade.entryTime) { idx = i; break; }
    }
    if (idx === -1) idx = data.length - 1;
    const half = Math.floor(visibleCandles / 2);
    const from = Math.max(0, idx - half);
    const to = Math.min(data.length - 1, from + visibleCandles - 1);
    syncingRangeRef.current = true;
    chart.timeScale().setVisibleLogicalRange({ from, to });
    if (oscChartRef.current) {
      oscChartRef.current.timeScale().setVisibleLogicalRange({ from, to });
    }
    syncingRangeRef.current = false;
  }, [selectedTradeId, trades, data, visibleCandles]);

  const zoomIn = useCallback(() => {
    onVisibleCandlesChange(Math.max(MIN_CANDLES, Math.floor(visibleCandles * 0.8)));
  }, [visibleCandles, onVisibleCandlesChange]);
  const zoomOut = useCallback(() => {
    onVisibleCandlesChange(Math.min(MAX_CANDLES, Math.floor(visibleCandles * 1.25)));
  }, [visibleCandles, onVisibleCandlesChange]);

  return (
    <div className='w-full h-full flex flex-col bg-surface-raised relative'>
      {/* Zoom controls */}
      <div className='absolute top-2 right-20 z-10 flex items-center gap-1 rounded-md border border-line-subtle bg-surface-overlay/90 px-1 py-1 backdrop-blur'>
        <Button size='icon-sm' variant='ghost' onClick={zoomOut} aria-label='Zoom out'>
          <Minus className='size-3.5' />
        </Button>
        <Text size='1' color='gray' className='w-16 text-center tabular-nums'>
          {visibleCandles} bars
        </Text>
        <Button size='icon-sm' variant='ghost' onClick={zoomIn} aria-label='Zoom in'>
          <Plus className='size-3.5' />
        </Button>
      </div>

      <div ref={priceContainerRef} className={hasOscillator ? "flex-[3] min-h-0" : "flex-1 min-h-0"} />
      {hasOscillator && (
        <>
          <div className='h-px bg-line-subtle' />
          <div ref={oscContainerRef} className='flex-1 min-h-0' />
        </>
      )}
    </div>
  );
};

export default BacktestChart;
