"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
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

const MIN_CANDLES = 50;
const MAX_CANDLES = 1000;

// Strategies that show an oscillator sub-panel instead of price overlays
const OSCILLATOR_STRATEGIES = new Set([
  "macd-crossover",
  "rsi-mean-reversion",
  "rsi2",
  "stochastic",
  "momentum-roc",
]);

// ── Indicator helpers ────────────────────────────────────────────────────────

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
  dash?: number[];
};

type OscillatorData = {
  type: "rsi" | "macd" | "stochastic" | "roc";
  values: (number | undefined)[];
  values2?: (number | undefined)[];
  values3?: (number | undefined)[];
  label: string;
  level1?: number;
  level2?: number;
};

// ── Compute indicators per strategy ─────────────────────────────────────────

function computeIndicators(
  data: IndicatorData[],
  strategyId: string,
  params: Record<string, number | boolean | string>
): { priceLines: PriceLine[]; oscillator?: OscillatorData } {
  const closes = data.map((d) => d.close);
  const priceLines: PriceLine[] = [];
  let oscillator: OscillatorData | undefined;

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
      priceLines.push({ values: data.map((d) => d[`donchian_${period}_upperBand` as keyof IndicatorData] as number | undefined), color: "#06b6d4", label: `DC ${period}`, dash: [4, 4] });
      priceLines.push({ values: data.map((d) => d[`donchian_${period}_lowerBand` as keyof IndicatorData] as number | undefined), color: "#06b6d4", label: "", dash: [4, 4] });
      priceLines.push({ values: data.map((d) => d[`donchian_${period}_midLine` as keyof IndicatorData] as number | undefined), color: "#22d3ee", label: "", lineWidth: 0.8, dash: [2, 2] });
      break;
    }
    case "breakout": {
      const period = num("period", 20);
      priceLines.push({ values: data.map((d) => d[`donchian_${period}_upperBand` as keyof IndicatorData] as number | undefined), color: "#06b6d4", label: `Chan ${period}`, dash: [4, 4] });
      priceLines.push({ values: data.map((d) => d[`donchian_${period}_lowerBand` as keyof IndicatorData] as number | undefined), color: "#06b6d4", label: "", dash: [4, 4] });
      const trail = num("trailStopEMAPeriod", 0);
      if (trail > 0) {
        priceLines.push({ values: data.map((d) => d[`ema${trail}` as keyof IndicatorData] as number | undefined), color: "#f97316", label: `Trail EMA ${trail}`, dash: [3, 3] });
      }
      break;
    }
    case "bollinger-bands": {
      const period = num("period", 20);
      const mult = num("stdDev", 2);
      const sma = calcSMA(closes, period);
      const std = calcStdDev(closes, period);
      priceLines.push({ values: sma.map((s, i) => s !== undefined && std[i] !== undefined ? s + mult * std[i]! : undefined), color: "#a855f7", label: `BB±${mult}σ`, dash: [3, 3] });
      priceLines.push({ values: sma, color: "#3b82f6", label: `SMA ${period}`, lineWidth: 1 });
      priceLines.push({ values: sma.map((s, i) => s !== undefined && std[i] !== undefined ? s - mult * std[i]! : undefined), color: "#a855f7", label: "", dash: [3, 3] });
      break;
    }
    case "keltner-channel": {
      const emaPeriod = num("emaPeriod", 20);
      const atrPeriod = num("atrPeriod", 10);
      const mult = num("multiplier", 2);
      const ema = calcEMA(closes, emaPeriod);
      const atr = calcATR(data, atrPeriod);
      priceLines.push({ values: ema.map((e, i) => e !== undefined && atr[i] !== undefined ? e + mult * atr[i]! : undefined), color: "#06b6d4", label: `KC±${mult}ATR`, dash: [3, 3] });
      priceLines.push({ values: ema, color: "#3b82f6", label: `EMA ${emaPeriod}` });
      priceLines.push({ values: ema.map((e, i) => e !== undefined && atr[i] !== undefined ? e - mult * atr[i]! : undefined), color: "#06b6d4", label: "", dash: [3, 3] });
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
        if (dir === 1) bullLine[i] = st; else bearLine[i] = st;
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
      priceLines.push({ values: chandLong, color: "#f97316", label: "Chandelier Long", lineWidth: 1.5, dash: [4, 3] });
      break;
    }
    // Oscillator strategies
    case "macd-crossover": {
      oscillator = {
        type: "macd",
        values: data.map((d) => d.macd),
        values2: data.map((d) => d.macdSignal),
        values3: data.map((d) => d.macdHistogram),
        label: "MACD",
      };
      break;
    }
    case "rsi-mean-reversion": {
      oscillator = {
        type: "rsi",
        values: data.map((d) => d.rsi),
        label: "RSI 14",
        level1: num("overbought", 70),
        level2: num("oversold", 30),
      };
      break;
    }
    case "rsi2": {
      const period = 2;
      const rsiVals: (number | undefined)[] = new Array(data.length).fill(undefined);
      let ag = 0, al = 0;
      for (let i = 1; i < data.length; i++) {
        const ch = data[i].close - data[i - 1].close;
        const g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
        if (i < period) { ag += g; al += l; }
        else if (i === period) { ag = (ag + g) / period; al = (al + l) / period; }
        else { ag = (ag * (period - 1) + g) / period; al = (al * (period - 1) + l) / period; }
        if (i >= period) rsiVals[i] = 100 - 100 / (1 + (al === 0 ? 100 : ag / al));
      }
      oscillator = { type: "rsi", values: rsiVals, label: "RSI 2", level1: num("overbought", 90), level2: num("oversold", 10) };
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
      oscillator = { type: "stochastic", values: kVals, values2: dVals, label: "Stochastic", level1: num("overbought", 80), level2: num("oversold", 20) };
      break;
    }
    case "momentum-roc": {
      const rocPeriod = num("rocPeriod", 20);
      const smoothing = num("smoothing", 5);
      const raw: (number | undefined)[] = closes.map((c, i) =>
        i < rocPeriod ? undefined : ((c - closes[i - rocPeriod]) / closes[i - rocPeriod]) * 100
      );
      const smoothed: (number | undefined)[] = raw.map((_, i) => {
        if (raw[i] === undefined) return undefined;
        const sl = raw.slice(Math.max(0, i - smoothing + 1), i + 1).filter((v): v is number => v !== undefined);
        return sl.length < smoothing ? undefined : sl.reduce((a, b) => a + b, 0) / sl.length;
      });
      oscillator = { type: "roc", values: smoothed, label: `ROC(${rocPeriod})` };
      break;
    }
  }

  return { priceLines, oscillator };
}

function bisectTime(data: IndicatorData[], time: number): number {
  let lo = 0, hi = data.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (data[mid].time >= time) { result = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  return result;
}

// ── Component ────────────────────────────────────────────────────────────────

const BacktestChart: React.FC<BacktestChartProps> = ({
  data,
  trades,
  visibleCandles,
  onVisibleCandlesChange,
  selectedStrategyId,
  selectedTradeId,
  currentParams = {},
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hoveredTrade] = useState<BacktestTrade | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setContainerSize({ width, height });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Scroll to selected trade
  const prevSelectedTradeIdRef = useRef<string | null | undefined>(selectedTradeId);
  useEffect(() => {
    if (prevSelectedTradeIdRef.current === selectedTradeId) return;
    prevSelectedTradeIdRef.current = selectedTradeId;
    if (!selectedTradeId || !data || data.length === 0) return;
    const trade = trades.find((t) => t.id === selectedTradeId);
    if (!trade) return;
    const idx = bisectTime(data, trade.entryTime);
    if (idx === -1) return;
    const half = Math.floor(visibleCandles / 2);
    const target = Math.max(0, data.length - idx - half);
    const max = Math.max(0, data.length - visibleCandles);
    setScrollOffset(Math.max(0, Math.min(max, target)));
  }, [selectedTradeId, trades, data, visibleCandles]);

  const zoomIn = useCallback(() => onVisibleCandlesChange(Math.max(MIN_CANDLES, Math.floor(visibleCandles * 0.8))), [visibleCandles, onVisibleCandlesChange]);
  const zoomOut = useCallback(() => onVisibleCandlesChange(Math.min(MAX_CANDLES, Math.floor(visibleCandles * 1.25))), [visibleCandles, onVisibleCandlesChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.deltaY < 0 ? zoomIn() : zoomOut();
      } else {
        e.preventDefault();
        const max = Math.max(0, data.length - visibleCandles);
        setScrollOffset((prev) => Math.max(0, Math.min(max, prev + Math.sign(e.deltaY) * 10)));
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomIn, zoomOut, data.length, visibleCandles]);

  // Compute display indicators
  const { priceLines, oscillator } = useMemo(() => {
    if (!data || data.length === 0 || !selectedStrategyId) return { priceLines: [] };
    return computeIndicators(data, selectedStrategyId, currentParams);
  }, [data, selectedStrategyId, currentParams]);

  const hasOscillator = !!oscillator;

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data || data.length === 0) return;

    const startIndex = Math.max(0, data.length - visibleCandles - scrollOffset);
    const endIndex = Math.min(data.length, startIndex + visibleCandles);
    const visibleData = data.slice(startIndex, endIndex);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const pad = { top: 30, right: 80, bottom: 40, left: 10 };

    // Split height if oscillator
    const oscHeight = hasOscillator ? Math.floor(H * 0.28) : 0;
    const gap = hasOscillator ? 4 : 0;
    const priceH = H - oscHeight - gap - pad.bottom;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // ── Price chart area ──────────────────────────────────────────────────
    const chartWidth = W - pad.left - pad.right;
    const chartHeight = priceH - pad.top;

    const allPrices = visibleData.flatMap((d) => [d.high, d.low]);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const pRange = maxP - minP;
    const domainMin = minP - pRange * 0.1;
    const domainMax = maxP + pRange * 0.1;

    const xScale = (i: number) => pad.left + (i / Math.max(visibleData.length - 1, 1)) * chartWidth;
    const yScale = (p: number) => pad.top + chartHeight - ((p - domainMin) / (domainMax - domainMin)) * chartHeight;

    // Grid
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (i / 5) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      const price = domainMax - (i / 5) * (domainMax - domainMin);
      ctx.fillStyle = "#64748b";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${price.toFixed(2)}`, W - pad.right + 5, y + 4);
    }

    // Price overlay lines
    const drawLine = (values: (number | undefined)[], color: string, lw = 1, dash?: number[]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      visibleData.forEach((_, i) => {
        const val = values[startIndex + i];
        if (val !== undefined && val > 0) {
          const x = xScale(i);
          const y = yScale(val);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        } else { started = false; }
      });
      ctx.stroke();
      if (dash) ctx.setLineDash([]);
    };

    for (const line of priceLines) {
      drawLine(line.values, line.color, line.lineWidth ?? 1, line.dash);
    }

    // Candlesticks
    const candleWidth = Math.max(2, (chartWidth / visibleData.length) * 0.7);
    visibleData.forEach((candle, i) => {
      const x = xScale(i);
      const isGreen = candle.close >= candle.open;
      const color = isGreen ? "#10b981" : "#ef4444";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yScale(candle.high));
      ctx.lineTo(x, yScale(candle.low));
      ctx.stroke();
      const bodyTop = yScale(Math.max(candle.open, candle.close));
      const bodyH = Math.max(yScale(Math.min(candle.open, candle.close)) - bodyTop, 1);
      ctx.fillStyle = isGreen ? color : "#1e293b";
      ctx.strokeStyle = color;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyH);
      ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyH);
    });

    // Trade markers
    const tradeIndexCache = new Map(
      trades.map((t) => [t.id, { ei: bisectTime(data, t.entryTime), xi: bisectTime(data, t.exitTime) }])
    );

    const visibleTrades = trades.filter((t) => {
      const { ei, xi } = tradeIndexCache.get(t.id)!;
      return (ei >= startIndex && ei < endIndex) || (xi >= startIndex && xi < endIndex);
    });

    visibleTrades.forEach((trade) => {
      const { ei: entryIdx, xi: exitIdx } = tradeIndexCache.get(trade.id)!;
      const isSel = trade.id === selectedTradeId;

      if (isSel && entryIdx >= startIndex && exitIdx >= startIndex) {
        const x1 = xScale(Math.max(0, entryIdx - startIndex));
        const x2 = xScale(Math.min(visibleData.length - 1, exitIdx - startIndex));
        ctx.fillStyle = "rgba(59,130,246,0.15)";
        ctx.fillRect(x1 - 20, pad.top, x2 - x1 + 40, chartHeight);
        ctx.strokeStyle = "rgba(59,130,246,0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x1, pad.top); ctx.lineTo(x1, pad.top + chartHeight);
        ctx.moveTo(x2, pad.top); ctx.lineTo(x2, pad.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (entryIdx >= startIndex && entryIdx < endIndex) {
        const li = entryIdx - startIndex;
        const x = xScale(li);
        const y = yScale(trade.entryPrice);
        const isLong = trade.side === PositionSide.LONG;
        const ms = isSel ? 1.4 : 1;
        const bo = 15 * ms, to = 25 * ms, w = 8 * ms;
        ctx.beginPath();
        if (isLong) { ctx.moveTo(x, y + bo); ctx.lineTo(x - w, y + to); ctx.lineTo(x + w, y + to); }
        else { ctx.moveTo(x, y - bo); ctx.lineTo(x - w, y - to); ctx.lineTo(x + w, y - to); }
        ctx.closePath();
        ctx.fillStyle = isLong ? "#22c55e" : "#ef4444";
        ctx.fill();
        if (isSel) { ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 3; ctx.stroke(); }
        ctx.fillStyle = "#fff";
        ctx.font = isSel ? "bold 11px sans-serif" : "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(isLong ? "BUY" : "SELL", x, isLong ? y + to + 13 : y - to - 5);
      }

      if (exitIdx >= startIndex && exitIdx < endIndex) {
        const li = exitIdx - startIndex;
        const x = xScale(li);
        const y = yScale(trade.exitPrice);
        const isProfit = trade.pnl > 0;
        const ms = isSel ? 8 : 6;
        ctx.strokeStyle = isProfit ? "#22c55e" : "#ef4444";
        ctx.lineWidth = isSel ? 4 : 3;
        ctx.beginPath();
        ctx.moveTo(x - ms, y - ms); ctx.lineTo(x + ms, y + ms);
        ctx.moveTo(x + ms, y - ms); ctx.lineTo(x - ms, y + ms);
        ctx.stroke();
        if (isSel) { ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, ms + 5, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = isProfit ? "#22c55e" : "#ef4444";
        ctx.font = isSel ? "bold 11px sans-serif" : "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${isProfit ? "+" : ""}${trade.pnlPercent.toFixed(2)}%`, x, y - (isSel ? 20 : 15));
      }

      if (entryIdx >= startIndex && entryIdx < endIndex && exitIdx >= startIndex && exitIdx < endIndex) {
        const x1 = xScale(entryIdx - startIndex);
        const x2 = xScale(exitIdx - startIndex);
        ctx.strokeStyle = trade.pnl > 0 ? `rgba(34,197,94,${isSel ? 0.6 : 0.3})` : `rgba(239,68,68,${isSel ? 0.6 : 0.3})`;
        ctx.lineWidth = isSel ? 3 : 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, yScale(trade.entryPrice));
        ctx.lineTo(x2, yScale(trade.exitPrice));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Time labels
    ctx.fillStyle = "#64748b";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    for (let i = 0; i <= 6; i++) {
      const idx = Math.floor((i / 6) * (visibleData.length - 1));
      if (idx >= 0 && idx < visibleData.length) {
        const x = xScale(idx);
        const t = new Date(visibleData[idx].time);
        ctx.fillText(t.toLocaleDateString([], { month: "short", day: "numeric" }), x, H - oscHeight - gap - 10);
      }
    }

    // Price chart title + legend
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Price Chart", pad.left + 5, 18);

    const legendItems = priceLines.filter((l) => l.label);
    let legendX = pad.left + 95;
    ctx.font = "9px sans-serif";
    legendItems.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX, 10, 12, 3);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(item.label, legendX + 16, 15);
      legendX += item.label.length * 6 + 24;
    });

    // ── Oscillator sub-panel ──────────────────────────────────────────────
    if (hasOscillator && oscillator) {
      const oscTop = priceH + gap;
      const oscInnerH = oscHeight - 20; // room for label
      const oscBottom = oscTop + oscInnerH;

      // Panel background
      ctx.fillStyle = "#0d1929";
      ctx.fillRect(pad.left, oscTop, chartWidth, oscHeight);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.strokeRect(pad.left, oscTop, chartWidth, oscHeight);

      // Label
      ctx.fillStyle = "#64748b";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(oscillator.label, pad.left + 4, oscTop + 10);

      // Slice visible values
      const oVals = oscillator.values.slice(startIndex, endIndex);
      const oVals2 = oscillator.values2?.slice(startIndex, endIndex);
      const oVals3 = oscillator.values3?.slice(startIndex, endIndex);

      // Compute domain
      const allOsc = [...oVals, ...(oVals2 ?? []), ...(oVals3 ?? [])].filter((v): v is number => v !== undefined);
      if (allOsc.length === 0) return;

      let oscMin = Math.min(...allOsc);
      let oscMax = Math.max(...allOsc);

      // For RSI/Stochastic, fix domain 0-100
      if (oscillator.type === "rsi" || oscillator.type === "stochastic") {
        oscMin = 0; oscMax = 100;
      } else {
        const r = oscMax - oscMin || 1;
        oscMin -= r * 0.1; oscMax += r * 0.1;
      }

      const oscXScale = (i: number) => pad.left + (i / Math.max(oVals.length - 1, 1)) * chartWidth;
      const oscYScale = (v: number) => oscTop + 14 + (oscInnerH - 14) - ((v - oscMin) / (oscMax - oscMin)) * (oscInnerH - 14);

      // Zero/level reference lines
      const drawOscRef = (level: number, color: string, dash?: number[]) => {
        if (level < oscMin || level > oscMax) return;
        const y = oscYScale(level);
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartWidth, y);
        ctx.stroke();
        if (dash) ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "8px monospace";
        ctx.textAlign = "left";
        ctx.fillText(String(level), W - pad.right + 4, y + 3);
      };

      if (oscillator.level1 !== undefined) drawOscRef(oscillator.level1, "rgba(239,68,68,0.5)", [3, 3]);
      if (oscillator.level2 !== undefined) drawOscRef(oscillator.level2, "rgba(34,197,94,0.5)", [3, 3]);
      if (oscillator.type === "roc" || oscillator.type === "macd") drawOscRef(0, "rgba(148,163,184,0.4)", [2, 2]);

      const drawOscLine = (vals: (number | undefined)[], color: string, lw = 1) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        let started = false;
        vals.forEach((v, i) => {
          if (v === undefined) { started = false; return; }
          const x = oscXScale(i);
          const y = oscYScale(v);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };

      if (oscillator.type === "macd") {
        // Histogram bars
        oVals3?.forEach((v, i) => {
          if (v === undefined) return;
          const x = oscXScale(i);
          const zero = oscYScale(0);
          const y = oscYScale(v);
          const bw = Math.max(1, (chartWidth / oVals.length) * 0.6);
          ctx.fillStyle = v >= 0 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)";
          ctx.fillRect(x - bw / 2, Math.min(y, zero), bw, Math.abs(zero - y));
        });
        drawOscLine(oVals, "#3b82f6", 1.5);          // MACD line
        drawOscLine(oVals2 ?? [], "#f97316", 1);      // Signal line
      } else if (oscillator.type === "stochastic") {
        drawOscLine(oVals, "#fbbf24", 1.5);           // %K
        drawOscLine(oVals2 ?? [], "#a855f7", 1);      // %D
        // Legend
        ctx.font = "8px sans-serif";
        ctx.fillStyle = "#fbbf24"; ctx.fillText("%K", pad.left + chartWidth - 35, oscTop + 10);
        ctx.fillStyle = "#a855f7"; ctx.fillText("%D", pad.left + chartWidth - 20, oscTop + 10);
      } else {
        // RSI or ROC
        const color = oscillator.type === "rsi" ? "#22d3ee" : "#a855f7";
        drawOscLine(oVals, color, 1.5);
      }
    }
  }, [data, trades, visibleCandles, scrollOffset, containerSize, selectedStrategyId, selectedTradeId, priceLines, oscillator, hasOscillator]);

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400">
        No data to display
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-2 right-20 flex items-center gap-2 bg-slate-800/80 rounded-lg px-2 py-1 z-10">
        <button type="button" onClick={zoomIn} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-lg font-bold" title="Zoom In">+</button>
        <span className="text-slate-400 text-xs font-mono min-w-[60px] text-center">{Math.min(visibleCandles, data.length)} bars</span>
        <button type="button" onClick={zoomOut} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-lg font-bold" title="Zoom Out">−</button>
      </div>
      {hoveredTrade && (
        <div className="absolute bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-lg z-20" style={{ top: 50, left: 50 }}>
          <div className="font-bold text-white mb-1">Trade Details</div>
          <div className="text-slate-300">Side: {hoveredTrade.side}</div>
          <div className="text-slate-300">Entry: ${hoveredTrade.entryPrice.toFixed(2)}</div>
          <div className="text-slate-300">Exit: ${hoveredTrade.exitPrice.toFixed(2)}</div>
          <div className={hoveredTrade.pnl > 0 ? "text-green-400" : "text-red-400"}>
            P&L: {hoveredTrade.pnl > 0 ? "+" : ""}${hoveredTrade.pnl.toFixed(2)} ({hoveredTrade.pnlPercent.toFixed(2)}%)
          </div>
        </div>
      )}
    </div>
  );
};

export default BacktestChart;
