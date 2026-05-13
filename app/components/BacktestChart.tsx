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
} from "lightweight-charts";
import { IndicatorData, BacktestTrade, PositionSide } from "@/app/types";

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

function calcEMA(closes: number[], period: number): (number | undefined)[] {
  const mult = 2 / (period + 1);
  let ema: number | undefined;
  return closes.map((c, i) => {
    ema = i === 0 ? c : (c - ema!) * mult + ema!;
    return i >= period - 1 ? ema : undefined;
  });
}

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
  let atr: number | undefined;
  return data.map((d, i) => {
    const tr =
      i === 0
        ? d.high - d.low
        : Math.max(d.high - d.low, Math.abs(d.high - data[i - 1].close), Math.abs(d.low - data[i - 1].close));
    atr = i === 0 ? tr : (atr! * (period - 1) + tr) / period;
    return i >= period - 1 ? atr : undefined;
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
  type: "rsi" | "macd" | "stochastic" | "roc";
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
): { priceLines: PriceLine[]; oscillator?: OscillatorPanel } {
  const closes = data.map((d) => d.close);
  const priceLines: PriceLine[] = [];
  let oscillator: OscillatorPanel | undefined;
  const num = (key: string, fallback: number) => ((params[key] as number) ?? fallback);

  switch (strategyId) {
    case "ema-crossover": {
      const fast = num("fastPeriod", 9);
      const slow = num("slowPeriod", 21);
      priceLines.push({ values: data.map((d) => d[`ema${fast}` as keyof IndicatorData] as number | undefined), color: "#fbbf24", label: `EMA ${fast}` });
      priceLines.push({ values: data.map((d) => d[`ema${slow}` as keyof IndicatorData] as number | undefined), color: "#a855f7", label: `EMA ${slow}` });
      break;
    }
    case "triple-ema": {
      const fast = num("fastPeriod", 4);
      const mid = num("midPeriod", 9);
      const slow = num("slowPeriod", 18);
      priceLines.push({ values: data.map((d) => d[`ema${fast}` as keyof IndicatorData] as number | undefined), color: "#fbbf24", label: `EMA ${fast}` });
      priceLines.push({ values: data.map((d) => d[`ema${mid}` as keyof IndicatorData] as number | undefined), color: "#22d3ee", label: `EMA ${mid}` });
      priceLines.push({ values: data.map((d) => d[`ema${slow}` as keyof IndicatorData] as number | undefined), color: "#a855f7", label: `EMA ${slow}` });
      break;
    }
    case "sma-crossover": {
      const fast = num("fastPeriod", 50);
      const slow = num("slowPeriod", 200);
      priceLines.push({ values: data.map((d) => d[`sma${fast}` as keyof IndicatorData] as number | undefined), color: "#3b82f6", label: `SMA ${fast}` });
      priceLines.push({ values: data.map((d) => d[`sma${slow}` as keyof IndicatorData] as number | undefined), color: "#f97316", label: `SMA ${slow}` });
      break;
    }
    case "ema-price-cross": {
      const period = num("emaPeriod", 20);
      priceLines.push({ values: data.map((d) => d[`ema${period}` as keyof IndicatorData] as number | undefined), color: "#fbbf24", label: `EMA ${period}` });
      break;
    }
    case "donchian-channel": {
      const period = num("period", 20);
      priceLines.push({ values: data.map((d) => d[`donchian_${period}_upperBand` as keyof IndicatorData] as number | undefined), color: "#06b6d4", label: `DC ${period}`, dashed: true });
      priceLines.push({ values: data.map((d) => d[`donchian_${period}_lowerBand` as keyof IndicatorData] as number | undefined), color: "#06b6d4", label: "", dashed: true });
      priceLines.push({ values: data.map((d) => d[`donchian_${period}_midLine` as keyof IndicatorData] as number | undefined), color: "#22d3ee", label: "", lineWidth: 1, dashed: true });
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
      priceLines.push({ values: upper, color: "#06b6d4", label: `${lookback}-bar high close`, dashed: true });
      priceLines.push({ values: lower, color: "#06b6d4", label: "", dashed: true });
      const trail = num("trailingStopEmaPeriod", 0);
      if (trail > 0) {
        priceLines.push({ values: data.map((d) => d[`ema${trail}` as keyof IndicatorData] as number | undefined), color: "#f97316", label: `Trail EMA ${trail}`, dashed: true });
      }
      break;
    }
    case "bollinger-bands": {
      const period = num("period", 20);
      const mult = num("stdDev", 2);
      const sma = calcSMA(closes, period);
      const std = calcStdDev(closes, period);
      priceLines.push({ values: sma.map((s, i) => s !== undefined && std[i] !== undefined ? s + mult * std[i]! : undefined), color: "#a855f7", label: `BB±${mult}σ`, dashed: true });
      priceLines.push({ values: sma, color: "#3b82f6", label: `SMA ${period}`, lineWidth: 1 });
      priceLines.push({ values: sma.map((s, i) => s !== undefined && std[i] !== undefined ? s - mult * std[i]! : undefined), color: "#a855f7", label: "", dashed: true });
      break;
    }
    case "keltner-channel": {
      const emaPeriod = num("emaPeriod", 20);
      const atrPeriod = num("atrPeriod", 10);
      const mult = num("multiplier", 2);
      const ema = calcEMA(closes, emaPeriod);
      const atr = calcATR(data, atrPeriod);
      priceLines.push({ values: ema.map((e, i) => e !== undefined && atr[i] !== undefined ? e + mult * atr[i]! : undefined), color: "#06b6d4", label: `KC±${mult}ATR`, dashed: true });
      priceLines.push({ values: ema, color: "#3b82f6", label: `EMA ${emaPeriod}` });
      priceLines.push({ values: ema.map((e, i) => e !== undefined && atr[i] !== undefined ? e - mult * atr[i]! : undefined), color: "#06b6d4", label: "", dashed: true });
      break;
    }
    case "supertrend": {
      const atrPeriod = num("atrPeriod", 10);
      const mult = num("multiplier", 3);
      const atr = calcATR(data, atrPeriod);
      const bullLine: (number | undefined)[] = new Array(data.length).fill(undefined);
      const bearLine: (number | undefined)[] = new Array(data.length).fill(undefined);
      let prevUp = 0, prevDn = 0, prevST = 0, dir = 1;
      for (let i = 0; i < data.length; i++) {
        const a = atr[i];
        if (a === undefined) continue;
        const hl2 = (data[i].high + data[i].low) / 2;
        let up = hl2 + mult * a;
        let dn = hl2 - mult * a;
        if (i > 0) {
          up = (up < prevUp || data[i - 1].close > prevUp) ? up : prevUp;
          dn = (dn > prevDn || data[i - 1].close < prevDn) ? dn : prevDn;
          dir = prevST === prevUp ? (data[i].close > up ? 1 : -1) : (data[i].close < dn ? -1 : 1);
        }
        const st = dir === 1 ? dn : up;
        if (dir === 1) bullLine[i] = st;
        else bearLine[i] = st;
        prevUp = up; prevDn = dn; prevST = st;
      }
      priceLines.push({ values: bullLine, color: "#22c55e", label: "Supertrend ↑", lineWidth: 2 });
      priceLines.push({ values: bearLine, color: "#ef4444", label: "", lineWidth: 2 });
      break;
    }
    case "chandelier-exit": {
      const period = num("period", 22);
      const atrPeriod = num("atrPeriod", 22);
      const mult = num("multiplier", 3);
      const atr = calcATR(data, atrPeriod);
      const chandLong: (number | undefined)[] = [];
      for (let i = 0; i < data.length; i++) {
        if (i < period - 1 || atr[i] === undefined) { chandLong.push(undefined); continue; }
        const hh = Math.max(...data.slice(i - period + 1, i + 1).map((d) => d.high));
        chandLong.push(hh - mult * atr[i]!);
      }
      priceLines.push({ values: chandLong, color: "#f97316", label: "Chandelier Long", lineWidth: 2, dashed: true });
      break;
    }
    case "macd-crossover": {
      oscillator = {
        type: "macd",
        series: [
          { values: data.map((d) => d.macd), color: "#3b82f6", label: "MACD" },
          { values: data.map((d) => d.macdSignal), color: "#f97316", label: "Signal" },
        ],
        histogram: { values: data.map((d) => d.macdHistogram), positiveColor: "#22c55e", negativeColor: "#ef4444" },
        hLines: [{ value: 0, color: "#475569", dashed: true }],
      };
      break;
    }
    case "rsi-mean-reversion": {
      const ob = num("overbought", 70);
      const os = num("oversold", 30);
      oscillator = {
        type: "rsi",
        series: [{ values: data.map((d) => d.rsi), color: "#a855f7", label: "RSI 14" }],
        hLines: [
          { value: ob, color: "#ef4444", dashed: true },
          { value: os, color: "#22c55e", dashed: true },
          { value: 50, color: "#475569", dashed: true },
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
        series: [{ values: rsiVals, color: "#a855f7", label: "RSI 2" }],
        hLines: [
          { value: num("overbought", 90), color: "#ef4444", dashed: true },
          { value: num("oversold", 10), color: "#22c55e", dashed: true },
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
          { values: kVals, color: "#3b82f6", label: "%K" },
          { values: dVals, color: "#f97316", label: "%D" },
        ],
        hLines: [
          { value: num("overbought", 80), color: "#ef4444", dashed: true },
          { value: num("oversold", 20), color: "#22c55e", dashed: true },
        ],
      };
      break;
    }
    case "momentum-roc": {
      const rocPeriod = num("rocPeriod", 20);
      const smoothing = num("smoothing", 5);
      const raw: (number | undefined)[] = closes.map((c, i) =>
        i < rocPeriod ? undefined : ((c - closes[i - rocPeriod]) / closes[i - rocPeriod]) * 100,
      );
      const smoothed: (number | undefined)[] = raw.map((_, i) => {
        if (raw[i] === undefined) return undefined;
        const sl = raw.slice(Math.max(0, i - smoothing + 1), i + 1).filter((v): v is number => v !== undefined);
        return sl.length < smoothing ? undefined : sl.reduce((a, b) => a + b, 0) / sl.length;
      });
      oscillator = {
        type: "roc",
        series: [{ values: smoothed, color: "#a855f7", label: `ROC(${rocPeriod})` }],
        hLines: [{ value: 0, color: "#475569", dashed: true }],
      };
      break;
    }
  }

  return { priceLines, oscillator };
}

// Map (number | undefined)[] → LineData[] aligned with chart bars by time.
function toLineData(times: number[], values: (number | undefined)[]): LineData<Time>[] {
  const out: LineData<Time>[] = [];
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (v === undefined || !Number.isFinite(v)) continue;
    out.push({ time: (times[i] / 1000) as Time, value: v });
  }
  return out;
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

  const { priceLines, oscillator } = useMemo(() => {
    if (!data || data.length === 0 || !selectedStrategyId) return { priceLines: [] as PriceLine[], oscillator: undefined };
    return computeIndicators(data, selectedStrategyId, currentParams);
  }, [data, selectedStrategyId, currentParams]);

  const hasOscillator = !!oscillator;

  // ── Set up the price chart once. The series get rebuilt when data/strategy
  // changes (it's cleaner than diffing line-by-line).
  useEffect(() => {
    const el = priceContainerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: { background: { color: "#0f172a" }, textColor: "#cbd5e1", attributionLogo: false },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155", timeVisible: true, secondsVisible: false },
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
      layout: { background: { color: "#0f172a" }, textColor: "#cbd5e1", attributionLogo: false },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155", timeVisible: true, secondsVisible: false, visible: false },
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
    if (!chart || !data || data.length === 0) return;

    // Candle series — recreate to avoid stale state across dataset switches.
    if (candleSeriesRef.current) {
      chart.removeSeries(candleSeriesRef.current);
      candleSeriesRef.current = null;
    }
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
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
      markers.push({
        time: (t.entryTime / 1000) as Time,
        position: isLong ? "belowBar" : "aboveBar",
        color: isSel ? "#3b82f6" : isLong ? "#22c55e" : "#ef4444",
        shape: isLong ? "arrowUp" : "arrowDown",
        text: isLong ? "BUY" : "SELL",
        size: isSel ? 2 : 1,
      });
      markers.push({
        time: (t.exitTime / 1000) as Time,
        position: isLong ? "aboveBar" : "belowBar",
        color: isSel ? "#3b82f6" : t.pnl > 0 ? "#22c55e" : "#ef4444",
        shape: "circle",
        text: t.pnl > 0 ? `+${t.pnlPercent.toFixed(1)}%` : `${t.pnlPercent.toFixed(1)}%`,
        size: isSel ? 2 : 1,
      });
    }
    // Sort markers by time — lightweight-charts requires ascending order.
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    markerPluginRef.current = createSeriesMarkers(candles, markers);

    // Trailing stop overlays — one line per trade with a non-empty trailingSeries.
    for (const t of trades) {
      const ts = t.trailingSeries;
      if (!ts || ts.length === 0) continue;
      const trailLine = chart.addSeries(LineSeries, {
        color: "#ef4444",
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
  }, [data, priceLines, trades, selectedTradeId]);

  // Push oscillator panel data.
  useEffect(() => {
    const chart = oscChartRef.current;
    if (!chart || !oscillator || !data || data.length === 0) return;

    for (const s of oscSeriesRef.current) chart.removeSeries(s);
    oscSeriesRef.current = [];

    const times = data.map((d) => d.time);

    if (oscillator.histogram) {
      const histo = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
      const histoData: HistogramData<Time>[] = [];
      for (let i = 0; i < times.length; i++) {
        const v = oscillator.histogram.values[i];
        if (v === undefined || !Number.isFinite(v)) continue;
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
    const from = Math.max(0, total - wanted);
    const to = total - 1;
    syncingRangeRef.current = true;
    ts.setVisibleLogicalRange({ from, to });
    if (oscChartRef.current) {
      oscChartRef.current.timeScale().setVisibleLogicalRange({ from, to });
    }
    syncingRangeRef.current = false;
    lastDataLenRef.current = total;
  }, [visibleCandles, data]);

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
    <div className='w-full h-full flex flex-col bg-slate-900 relative'>
      {/* Zoom controls */}
      <div className='absolute top-2 right-20 z-10 flex items-center gap-1 bg-slate-800/80 backdrop-blur rounded px-2 py-1'>
        <button
          onClick={zoomOut}
          className='px-2 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded'
          aria-label='Zoom out'
        >
          −
        </button>
        <span className='text-xs text-slate-400 w-16 text-center'>{visibleCandles} bars</span>
        <button
          onClick={zoomIn}
          className='px-2 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded'
          aria-label='Zoom in'
        >
          +
        </button>
      </div>

      <div ref={priceContainerRef} className={hasOscillator ? "flex-[3] min-h-0" : "flex-1 min-h-0"} />
      {hasOscillator && (
        <>
          <div className='h-px bg-slate-700' />
          <div ref={oscContainerRef} className='flex-1 min-h-0' />
        </>
      )}
    </div>
  );
};

export default BacktestChart;
