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

const OSCILLATOR_STRATS = new Set([
  "rsi-mean-reversion",
  "rsi2",
  "macd-crossover",
  "stochastic",
  "momentum-roc",
]);

interface PriceLine {
  label: string;
  color: string;
  lineWidth: number;
  lineDash?: number[];
  values: (number | undefined)[];
}

interface ComputedData {
  priceLines: PriceLine[];
  supertrendBull?: boolean[];
  rsi2?: (number | undefined)[];
  stochK?: (number | undefined)[];
  stochD?: (number | undefined)[];
  roc?: (number | undefined)[];
}

function gp(params: Record<string, number | boolean | string> | undefined, key: string, def: number): number {
  const v = params?.[key];
  return typeof v === "number" ? v : def;
}

function calcATR(data: IndicatorData[], period: number): (number | undefined)[] {
  const n = data.length;
  const out: (number | undefined)[] = new Array(n).fill(undefined);
  let sum = 0;
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close),
    );
    if (i < period) {
      sum += tr;
    } else if (i === period) {
      sum += tr;
      out[i] = sum / period;
    } else {
      out[i] = (out[i - 1]! * (period - 1) + tr) / period;
    }
  }
  return out;
}

function calcEMA(data: IndicatorData[], period: number): (number | undefined)[] {
  const mult = 2 / (period + 1);
  const out: (number | undefined)[] = new Array(data.length).fill(undefined);
  let prev = data[0]?.close;
  if (prev === undefined) return out;
  out[0] = prev;
  for (let i = 1; i < data.length; i++) {
    prev = (data[i].close - prev!) * mult + prev!;
    out[i] = prev;
  }
  return out;
}

function calcRSI(data: IndicatorData[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(data.length).fill(undefined);
  let ag = 0,
    al = 0;
  for (let i = 1; i < data.length; i++) {
    const chg = data[i].close - data[i - 1].close;
    const gain = chg > 0 ? chg : 0;
    const loss = chg < 0 ? -chg : 0;
    if (i < period) {
      ag += gain;
      al += loss;
    } else if (i === period) {
      ag = (ag + gain) / period;
      al = (al + loss) / period;
      out[i] = 100 - 100 / (1 + (al === 0 ? Infinity : ag / al));
    } else {
      ag = (ag * (period - 1) + gain) / period;
      al = (al * (period - 1) + loss) / period;
      out[i] = 100 - 100 / (1 + (al === 0 ? Infinity : ag / al));
    }
  }
  return out;
}

function dv(data: IndicatorData[], key: string): (number | undefined)[] {
  return data.map((d) => (d as Record<string, unknown>)[key] as number | undefined);
}

function mkLine(
  label: string,
  color: string,
  lineWidth: number,
  values: (number | undefined)[],
  lineDash?: number[],
): PriceLine {
  return { label, color, lineWidth, values, lineDash };
}

function buildComputedData(
  data: IndicatorData[],
  strategyId: string | undefined,
  params: Record<string, number | boolean | string> | undefined,
): ComputedData {
  if (!strategyId || !data.length) return { priceLines: [] };
  const n = data.length;

  switch (strategyId) {
    case "ema-crossover": {
      const fast = gp(params, "fastPeriod", 9);
      const slow = gp(params, "slowPeriod", 21);
      return {
        priceLines: [
          mkLine(`EMA ${fast}`, "#fbbf24", 1, dv(data, `ema${fast}`)),
          mkLine(`EMA ${slow}`, "#a855f7", 1, dv(data, `ema${slow}`)),
        ],
      };
    }
    case "triple-ema": {
      const fast = gp(params, "fastPeriod", 4);
      const mid = gp(params, "midPeriod", 9);
      const slow = gp(params, "slowPeriod", 18);
      return {
        priceLines: [
          mkLine(`EMA ${fast}`, "#fbbf24", 1, dv(data, `ema${fast}`)),
          mkLine(`EMA ${mid}`, "#a855f7", 1, dv(data, `ema${mid}`)),
          mkLine(`EMA ${slow}`, "#3b82f6", 1, dv(data, `ema${slow}`)),
        ],
      };
    }
    case "sma-crossover": {
      const fast = gp(params, "fastPeriod", 50);
      const slow = gp(params, "slowPeriod", 200);
      return {
        priceLines: [
          mkLine(`SMA ${fast}`, "#3b82f6", 1, dv(data, `sma${fast}`)),
          mkLine(`SMA ${slow}`, "#f97316", 1, dv(data, `sma${slow}`)),
        ],
      };
    }
    case "ema-price-cross": {
      const period = gp(params, "emaPeriod", 21);
      return {
        priceLines: [mkLine(`EMA ${period}`, "#fbbf24", 1.5, dv(data, `ema${period}`))],
      };
    }
    case "donchian-channel": {
      const period = gp(params, "period", 20);
      return {
        priceLines: [
          mkLine(`Donchian ${period}`, "#06b6d4", 1, dv(data, `donchian_${period}_upperBand`), [4, 4]),
          mkLine("", "#06b6d4", 1, dv(data, `donchian_${period}_lowerBand`), [4, 4]),
          mkLine("", "#22d3ee", 0.8, dv(data, `donchian_${period}_midLine`), [2, 2]),
        ],
      };
    }
    case "breakout": {
      const lookback = gp(params, "lookbackPeriod", 20);
      const trailEma = gp(params, "trailingStopEmaPeriod", 21);
      const lines: PriceLine[] = [
        mkLine(`Donchian ${lookback}`, "#06b6d4", 1, dv(data, `donchian_${lookback}_upperBand`), [4, 4]),
        mkLine("", "#06b6d4", 1, dv(data, `donchian_${lookback}_lowerBand`), [4, 4]),
      ];
      if (trailEma > 0) {
        lines.push(mkLine(`EMA ${trailEma}`, "#f59e0b", 1.5, dv(data, `ema${trailEma}`)));
      }
      return { priceLines: lines };
    }
    case "bollinger-bands": {
      const period = gp(params, "period", 20);
      const stdDevMult = gp(params, "stdDev", 2);
      const bbMid: (number | undefined)[] = new Array(n).fill(undefined);
      const bbUpper: (number | undefined)[] = new Array(n).fill(undefined);
      const bbLower: (number | undefined)[] = new Array(n).fill(undefined);
      for (let i = period - 1; i < n; i++) {
        const closes = data.slice(i - period + 1, i + 1).map((d) => d.close);
        const mean = closes.reduce((a, b) => a + b, 0) / period;
        const sd = Math.sqrt(closes.reduce((s, c) => s + (c - mean) ** 2, 0) / period);
        bbMid[i] = mean;
        bbUpper[i] = mean + stdDevMult * sd;
        bbLower[i] = mean - stdDevMult * sd;
      }
      return {
        priceLines: [
          mkLine(`BB ${period}`, "#3b82f6", 1, bbMid),
          mkLine("Upper", "#3b82f6", 0.8, bbUpper, [3, 3]),
          mkLine("Lower", "#3b82f6", 0.8, bbLower, [3, 3]),
        ],
      };
    }
    case "keltner-channel": {
      const emaPeriod = gp(params, "emaPeriod", 20);
      const atrPeriod = gp(params, "atrPeriod", 10);
      const mult = gp(params, "multiplier", 2);
      const emas = calcEMA(data, emaPeriod);
      const atr = calcATR(data, atrPeriod);
      const kcUpper: (number | undefined)[] = new Array(n).fill(undefined);
      const kcLower: (number | undefined)[] = new Array(n).fill(undefined);
      for (let i = 0; i < n; i++) {
        if (emas[i] !== undefined && atr[i] !== undefined) {
          kcUpper[i] = emas[i]! + mult * atr[i]!;
          kcLower[i] = emas[i]! - mult * atr[i]!;
        }
      }
      return {
        priceLines: [
          mkLine(`KC EMA ${emaPeriod}`, "#8b5cf6", 1.5, emas),
          mkLine("Upper", "#8b5cf6", 0.8, kcUpper, [3, 3]),
          mkLine("Lower", "#8b5cf6", 0.8, kcLower, [3, 3]),
        ],
      };
    }
    case "supertrend": {
      const atrPeriod = gp(params, "atrPeriod", 10);
      const mult = gp(params, "multiplier", 3);
      const atr = calcATR(data, atrPeriod);
      const stLine: (number | undefined)[] = new Array(n).fill(undefined);
      const stBull: boolean[] = new Array(n).fill(true);
      let prevFU: number | undefined;
      let prevFL: number | undefined;
      let bull = true;

      for (let i = 1; i < n; i++) {
        if (atr[i] === undefined) continue;
        const hl2 = (data[i].high + data[i].low) / 2;
        const bu = hl2 + mult * atr[i]!;
        const bl = hl2 - mult * atr[i]!;
        const fu = prevFU === undefined || bu < prevFU || data[i - 1].close > prevFU ? bu : prevFU;
        const fl = prevFL === undefined || bl > prevFL || data[i - 1].close < prevFL ? bl : prevFL;
        if (bull) {
          if (data[i].close < fl) bull = false;
        } else {
          if (data[i].close > fu) bull = true;
        }
        stLine[i] = bull ? fl : fu;
        stBull[i] = bull;
        prevFU = fu;
        prevFL = fl;
      }
      return {
        priceLines: [mkLine("Supertrend", "#22c55e", 1.5, stLine)],
        supertrendBull: stBull,
      };
    }
    case "chandelier-exit": {
      const period = gp(params, "period", 22);
      const atrPeriod = gp(params, "atrPeriod", 22);
      const mult = gp(params, "multiplier", 3);
      const atr = calcATR(data, atrPeriod);
      const chandLine: (number | undefined)[] = new Array(n).fill(undefined);
      for (let i = period - 1; i < n; i++) {
        if (atr[i] === undefined) continue;
        const highestHigh = Math.max(...data.slice(i - period + 1, i + 1).map((d) => d.high));
        chandLine[i] = highestHigh - mult * atr[i]!;
      }
      return {
        priceLines: [mkLine("Chandelier Stop", "#f97316", 1.5, chandLine, [5, 5])],
      };
    }
    case "rsi-mean-reversion":
    case "macd-crossover":
      return { priceLines: [] };
    case "rsi2": {
      return { priceLines: [], rsi2: calcRSI(data, 2) };
    }
    case "stochastic": {
      const kPeriod = gp(params, "kPeriod", 14);
      const dPeriod = gp(params, "dPeriod", 3);
      const stochK: (number | undefined)[] = new Array(n).fill(undefined);
      const stochD: (number | undefined)[] = new Array(n).fill(undefined);
      for (let i = kPeriod - 1; i < n; i++) {
        const slice = data.slice(i - kPeriod + 1, i + 1);
        const lo = Math.min(...slice.map((d) => d.low));
        const hi = Math.max(...slice.map((d) => d.high));
        stochK[i] = hi === lo ? 50 : ((data[i].close - lo) / (hi - lo)) * 100;
      }
      for (let i = kPeriod + dPeriod - 2; i < n; i++) {
        const kSlice = stochK
          .slice(i - dPeriod + 1, i + 1)
          .filter((v): v is number => v !== undefined);
        if (kSlice.length === dPeriod) {
          stochD[i] = kSlice.reduce((a, b) => a + b, 0) / dPeriod;
        }
      }
      return { priceLines: [], stochK, stochD };
    }
    case "momentum-roc": {
      const rocPeriod = gp(params, "rocPeriod", 20);
      const roc: (number | undefined)[] = new Array(n).fill(undefined);
      for (let i = rocPeriod; i < n; i++) {
        const prev = data[i - rocPeriod].close;
        if (prev !== 0) roc[i] = ((data[i].close - prev) / prev) * 100;
      }
      return { priceLines: [], roc };
    }
    default:
      return { priceLines: [] };
  }
}

const BacktestChart: React.FC<BacktestChartProps> = ({
  data,
  trades,
  visibleCandles,
  onVisibleCandlesChange,
  selectedStrategyId,
  selectedTradeId,
  currentParams,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hoveredTrade] = useState<BacktestTrade | null>(null);

  const computed = useMemo(
    () => buildComputedData(data, selectedStrategyId, currentParams),
    [data, selectedStrategyId, currentParams],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  const prevSelectedTradeIdRef = useRef<string | null | undefined>(selectedTradeId);
  useEffect(() => {
    if (prevSelectedTradeIdRef.current === selectedTradeId) return;
    prevSelectedTradeIdRef.current = selectedTradeId;
    if (!selectedTradeId || !data || data.length === 0) return;
    const selectedTrade = trades.find((t) => t.id === selectedTradeId);
    if (!selectedTrade) return;
    const entryDataIdx = data.findIndex((d) => d.time >= selectedTrade.entryTime);
    if (entryDataIdx === -1) return;
    const halfVisibleCandles = Math.floor(visibleCandles / 2);
    const scrollOffsetToCenterTrade = Math.max(0, data.length - entryDataIdx - halfVisibleCandles);
    const maxScrollOffset = Math.max(0, data.length - visibleCandles);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing scroll position to external trade selection
    setScrollOffset(Math.max(0, Math.min(maxScrollOffset, scrollOffsetToCenterTrade)));
  }, [selectedTradeId, trades, data, visibleCandles]);

  const zoomIn = useCallback(() => {
    onVisibleCandlesChange(Math.max(MIN_CANDLES, Math.floor(visibleCandles * 0.8)));
  }, [visibleCandles, onVisibleCandlesChange]);

  const zoomOut = useCallback(() => {
    onVisibleCandlesChange(Math.min(MAX_CANDLES, Math.floor(visibleCandles * 1.25)));
  }, [visibleCandles, onVisibleCandlesChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      } else {
        e.preventDefault();
        const maxOffset = Math.max(0, data.length - visibleCandles);
        setScrollOffset((prev) => Math.max(0, Math.min(maxOffset, prev + Math.sign(e.deltaY) * 10)));
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomIn, zoomOut, data.length, visibleCandles]);

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

    const width = rect.width;
    const height = rect.height;
    const pad = { top: 30, right: 80, bottom: 40, left: 10 };
    const chartWidth = width - pad.left - pad.right;
    const totalDrawH = height - pad.top - pad.bottom;

    const hasOsc = selectedStrategyId ? OSCILLATOR_STRATS.has(selectedStrategyId) : false;
    const PANEL_GAP = 4;
    const priceH = hasOsc ? Math.floor(totalDrawH * 0.72) : totalDrawH;
    const oscTop = pad.top + priceH + PANEL_GAP;
    const oscH = hasOsc ? totalDrawH - priceH - PANEL_GAP : 0;

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    // Price domain — include indicator overlay values so they don't clip
    const allPrices = visibleData.flatMap((d) => [d.high, d.low]);
    for (const line of computed.priceLines) {
      for (let i = 0; i < visibleData.length; i++) {
        const val = line.values[startIndex + i];
        if (val !== undefined && isFinite(val) && val > 0) allPrices.push(val);
      }
    }
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice || 1;
    const pricePad = priceRange * 0.1;
    const domainMin = minPrice - pricePad;
    const domainMax = maxPrice + pricePad;

    const xScale = (i: number) => pad.left + (i / (visibleData.length - 1 || 1)) * chartWidth;
    const yScale = (price: number) =>
      pad.top + priceH - ((price - domainMin) / (domainMax - domainMin)) * priceH;

    // Price chart grid
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (i / gridLines) * priceH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      const price = domainMax - (i / gridLines) * (domainMax - domainMin);
      ctx.fillStyle = "#64748b";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${price.toFixed(2)}`, width - pad.right + 5, y + 4);
    }

    // Helper: draw a line on the price chart
    const drawPriceLine = (
      values: (number | undefined)[],
      color: string,
      lineWidth: number,
      lineDash?: number[],
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (lineDash) ctx.setLineDash(lineDash);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < visibleData.length; i++) {
        const val = values[startIndex + i];
        if (val !== undefined && isFinite(val)) {
          const x = xScale(i);
          const y = yScale(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        } else {
          started = false;
        }
      }
      ctx.stroke();
      if (lineDash) ctx.setLineDash([]);
    };

    // Draw price overlay indicators
    if (selectedStrategyId === "supertrend" && computed.supertrendBull && computed.priceLines.length > 0) {
      // Colored segments: green when bullish, red when bearish
      const stLine = computed.priceLines[0].values;
      const stBull = computed.supertrendBull;
      let prevBull: boolean | undefined;
      let segStarted = false;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < visibleData.length; i++) {
        const di = startIndex + i;
        const val = stLine[di];
        const bull = stBull[di];
        if (val === undefined || !isFinite(val)) {
          if (segStarted) {
            ctx.stroke();
            segStarted = false;
          }
          prevBull = undefined;
          continue;
        }
        const x = xScale(i);
        const y = yScale(val);
        if (!segStarted || bull !== prevBull) {
          if (segStarted) ctx.stroke();
          ctx.strokeStyle = bull ? "#22c55e" : "#ef4444";
          ctx.beginPath();
          ctx.moveTo(x, y);
          segStarted = true;
        } else {
          ctx.lineTo(x, y);
        }
        prevBull = bull;
      }
      if (segStarted) ctx.stroke();
    } else {
      for (const line of computed.priceLines) {
        drawPriceLine(line.values, line.color, line.lineWidth, line.lineDash);
      }
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
      const bodyBottom = yScale(Math.min(candle.open, candle.close));
      const bodyH = Math.max(bodyBottom - bodyTop, 1);
      ctx.fillStyle = isGreen ? color : "#1e293b";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyH);
      ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyH);
    });

    // Trade markers
    const visibleTrades = trades.filter((trade) => {
      const ei = data.findIndex((d) => d.time >= trade.entryTime);
      const xi = data.findIndex((d) => d.time >= trade.exitTime);
      return (ei >= startIndex && ei < endIndex) || (xi >= startIndex && xi < endIndex);
    });

    visibleTrades.forEach((trade) => {
      const entryDataIdx = data.findIndex((d) => d.time >= trade.entryTime);
      const exitDataIdx = data.findIndex((d) => d.time >= trade.exitTime);
      const isSelected = trade.id === selectedTradeId;

      if (isSelected && entryDataIdx >= startIndex && exitDataIdx >= startIndex) {
        const entryLocalIdx = Math.max(0, entryDataIdx - startIndex);
        const exitLocalIdx = Math.min(visibleData.length - 1, exitDataIdx - startIndex);
        const x1 = xScale(entryLocalIdx);
        const x2 = xScale(exitLocalIdx);
        const hPad = 20;
        ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
        ctx.fillRect(x1 - hPad, pad.top, x2 - x1 + hPad * 2, priceH);
        ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x1, pad.top);
        ctx.lineTo(x1, pad.top + priceH);
        ctx.moveTo(x2, pad.top);
        ctx.lineTo(x2, pad.top + priceH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (entryDataIdx >= startIndex && entryDataIdx < endIndex) {
        const localIdx = entryDataIdx - startIndex;
        const x = xScale(localIdx);
        const y = yScale(trade.entryPrice);
        const isLong = trade.side === PositionSide.LONG;
        const ms = isSelected ? 1.4 : 1;
        const baseOffset = 15 * ms;
        const tipOffset = 25 * ms;
        const w = 8 * ms;
        ctx.beginPath();
        if (isLong) {
          ctx.moveTo(x, y + baseOffset);
          ctx.lineTo(x - w, y + tipOffset);
          ctx.lineTo(x + w, y + tipOffset);
        } else {
          ctx.moveTo(x, y - baseOffset);
          ctx.lineTo(x - w, y - tipOffset);
          ctx.lineTo(x + w, y - tipOffset);
        }
        ctx.closePath();
        ctx.fillStyle = isLong ? "#22c55e" : "#ef4444";
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.fillStyle = "#ffffff";
        ctx.font = isSelected ? "bold 11px sans-serif" : "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(isLong ? "BUY" : "SELL", x, isLong ? y + tipOffset + 13 : y - tipOffset - 5);
      }

      if (exitDataIdx >= startIndex && exitDataIdx < endIndex) {
        const localIdx = exitDataIdx - startIndex;
        const x = xScale(localIdx);
        const y = yScale(trade.exitPrice);
        const isProfit = trade.pnl > 0;
        const ms = isSelected ? 8 : 6;
        ctx.strokeStyle = isProfit ? "#22c55e" : "#ef4444";
        ctx.lineWidth = isSelected ? 4 : 3;
        ctx.beginPath();
        ctx.moveTo(x - ms, y - ms);
        ctx.lineTo(x + ms, y + ms);
        ctx.moveTo(x + ms, y - ms);
        ctx.lineTo(x - ms, y + ms);
        ctx.stroke();
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, ms + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = isProfit ? "#22c55e" : "#ef4444";
        ctx.font = isSelected ? "bold 11px sans-serif" : "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          `${isProfit ? "+" : ""}${trade.pnlPercent.toFixed(2)}%`,
          x,
          y - (isSelected ? 20 : 15),
        );
      }

      if (
        entryDataIdx >= startIndex &&
        entryDataIdx < endIndex &&
        exitDataIdx >= startIndex &&
        exitDataIdx < endIndex
      ) {
        const x1 = xScale(entryDataIdx - startIndex);
        const x2 = xScale(exitDataIdx - startIndex);
        const y1 = yScale(trade.entryPrice);
        const y2 = yScale(trade.exitPrice);
        ctx.strokeStyle =
          trade.pnl > 0
            ? isSelected
              ? "rgba(34, 197, 94, 0.6)"
              : "rgba(34, 197, 94, 0.3)"
            : isSelected
              ? "rgba(239, 68, 68, 0.6)"
              : "rgba(239, 68, 68, 0.3)";
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Oscillator panel
    if (hasOsc && oscH > 0) {
      // Separator
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, oscTop);
      ctx.lineTo(width - pad.right, oscTop);
      ctx.stroke();

      // Oscillator y-scale (takes explicit min/max)
      const oscY = (v: number, min: number, max: number) =>
        oscTop + oscH - ((v - min) / ((max - min) || 1)) * oscH;

      const drawOscLine = (
        values: (number | undefined)[],
        color: string,
        lineWidth: number,
        min: number,
        max: number,
        lineDash?: number[],
      ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        if (lineDash) ctx.setLineDash(lineDash);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < visibleData.length; i++) {
          const val = values[startIndex + i];
          if (val !== undefined && isFinite(val)) {
            const x = xScale(i);
            const y = oscY(val, min, max);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          } else {
            started = false;
          }
        }
        ctx.stroke();
        if (lineDash) ctx.setLineDash([]);
      };

      const drawRefLine = (v: number, min: number, max: number, color: string, label: string) => {
        const y = oscY(v, min, max);
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "9px monospace";
        ctx.textAlign = "left";
        ctx.fillText(label, width - pad.right + 5, y + 3);
      };

      // Panel label (top-left of oscillator sub-panel)
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "left";

      if (selectedStrategyId === "rsi-mean-reversion") {
        ctx.fillText("RSI 14", pad.left + 5, oscTop + 12);
        const min = 0,
          max = 100;
        drawRefLine(70, min, max, "rgba(239,68,68,0.7)", "70");
        drawRefLine(30, min, max, "rgba(34,197,94,0.7)", "30");
        drawOscLine(
          data.map((d) => d.rsi),
          "#f59e0b",
          1.5,
          min,
          max,
        );
      } else if (selectedStrategyId === "rsi2") {
        const ob = gp(currentParams, "overbought", 90);
        const os = gp(currentParams, "oversold", 10);
        ctx.fillText("RSI 2", pad.left + 5, oscTop + 12);
        const min = 0,
          max = 100;
        if (computed.rsi2) drawOscLine(computed.rsi2, "#f59e0b", 1.5, min, max);
        drawRefLine(ob, min, max, "rgba(239,68,68,0.7)", ob.toString());
        drawRefLine(os, min, max, "rgba(34,197,94,0.7)", os.toString());
      } else if (selectedStrategyId === "macd-crossover") {
        ctx.fillText("MACD", pad.left + 5, oscTop + 12);
        const fast = gp(currentParams, "fastPeriod", 12);
        const slow = gp(currentParams, "slowPeriod", 26);
        const sig = gp(currentParams, "signalPeriod", 9);
        const mk = `macd_${fast}_${slow}_${sig}`;
        const sk = `macdSignal_${fast}_${slow}_${sig}`;
        const hk = `macdHistogram_${fast}_${slow}_${sig}`;
        const macdVals = data.map(
          (d) => ((d as Record<string, unknown>)[mk] as number | undefined) ?? d.macd,
        );
        const signalVals = data.map(
          (d) => ((d as Record<string, unknown>)[sk] as number | undefined) ?? d.macdSignal,
        );
        const histVals = data.map(
          (d) => ((d as Record<string, unknown>)[hk] as number | undefined) ?? d.macdHistogram,
        );
        // Dynamic domain from visible values
        const visVals = [...macdVals, ...signalVals, ...histVals]
          .slice(startIndex, endIndex + 3)
          .filter((v): v is number => v !== undefined && isFinite(v));
        let min = -0.5,
          max = 0.5;
        if (visVals.length > 0) {
          const vMin = Math.min(...visVals);
          const vMax = Math.max(...visVals);
          const vPad = (vMax - vMin) * 0.15 || 0.01;
          min = vMin - vPad;
          max = vMax + vPad;
        }
        // Histogram bars
        const barW = Math.max(1, (chartWidth / visibleData.length) * 0.5);
        for (let i = 0; i < visibleData.length; i++) {
          const hv = histVals[startIndex + i];
          if (hv === undefined || !isFinite(hv)) continue;
          const x = xScale(i);
          const zeroY = oscY(0, min, max);
          const barY = oscY(hv, min, max);
          ctx.fillStyle = hv >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)";
          if (hv >= 0) {
            ctx.fillRect(x - barW / 2, barY, barW, zeroY - barY);
          } else {
            ctx.fillRect(x - barW / 2, zeroY, barW, barY - zeroY);
          }
        }
        drawRefLine(0, min, max, "rgba(148,163,184,0.4)", "0");
        drawOscLine(macdVals, "#3b82f6", 1.5, min, max);
        drawOscLine(signalVals, "#f97316", 1, min, max);
      } else if (selectedStrategyId === "stochastic") {
        const ob = gp(currentParams, "overbought", 80);
        const os = gp(currentParams, "oversold", 20);
        ctx.fillText("Stochastic", pad.left + 5, oscTop + 12);
        const min = 0,
          max = 100;
        if (computed.stochK) drawOscLine(computed.stochK, "#3b82f6", 1.5, min, max);
        if (computed.stochD) drawOscLine(computed.stochD, "#f97316", 1, min, max);
        drawRefLine(ob, min, max, "rgba(239,68,68,0.7)", ob.toString());
        drawRefLine(os, min, max, "rgba(34,197,94,0.7)", os.toString());
      } else if (selectedStrategyId === "momentum-roc") {
        ctx.fillText("ROC", pad.left + 5, oscTop + 12);
        if (computed.roc) {
          const visROC = computed.roc
            .slice(startIndex, endIndex)
            .filter((v): v is number => v !== undefined && isFinite(v));
          let min = -5,
            max = 5;
          if (visROC.length > 0) {
            const vMin = Math.min(...visROC);
            const vMax = Math.max(...visROC);
            const vPad = (vMax - vMin) * 0.15 || 1;
            min = vMin - vPad;
            max = vMax + vPad;
          }
          drawRefLine(0, min, max, "rgba(148,163,184,0.4)", "0");
          drawOscLine(computed.roc, "#a855f7", 1.5, min, max);
        }
      }
    }

    // Time labels
    ctx.fillStyle = "#64748b";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const timeLabels = 6;
    for (let i = 0; i <= timeLabels; i++) {
      const index = Math.floor((i / timeLabels) * (visibleData.length - 1));
      if (index >= 0 && index < visibleData.length) {
        const x = xScale(index);
        const time = new Date(visibleData[index].time);
        ctx.fillText(time.toLocaleDateString([], { month: "short", day: "numeric" }), x, height - 10);
      }
    }

    // Chart title
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Price Chart", pad.left + 5, 18);

    // Legend
    const legendLines =
      selectedStrategyId === "supertrend"
        ? [
            { label: "Bullish", color: "#22c55e" },
            { label: "Bearish", color: "#ef4444" },
          ]
        : computed.priceLines.filter((l) => l.label).map((l) => ({ label: l.label, color: l.color }));

    ctx.font = "9px sans-serif";
    let legendX = pad.left + 100;
    for (const item of legendLines) {
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX, 10, 12, 3);
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText(item.label, legendX + 16, 15);
      legendX += ctx.measureText(item.label).width + 30;
    }
  }, [
    data,
    trades,
    visibleCandles,
    scrollOffset,
    containerSize,
    selectedStrategyId,
    selectedTradeId,
    computed,
    currentParams,
  ]);

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
        <button
          type="button"
          onClick={zoomIn}
          className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-lg font-bold"
          title="Zoom In"
        >
          +
        </button>
        <span className="text-slate-400 text-xs font-mono min-w-[60px] text-center">
          {Math.min(visibleCandles, data.length)} bars
        </span>
        <button
          type="button"
          onClick={zoomOut}
          className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-lg font-bold"
          title="Zoom Out"
        >
          −
        </button>
      </div>
      {hoveredTrade && (
        <div
          className="absolute bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-lg z-20"
          style={{ top: 50, left: 50 }}
        >
          <div className="font-bold text-white mb-1">Trade Details</div>
          <div className="text-slate-300">Side: {hoveredTrade.side}</div>
          <div className="text-slate-300">Entry: ${hoveredTrade.entryPrice.toFixed(2)}</div>
          <div className="text-slate-300">Exit: ${hoveredTrade.exitPrice.toFixed(2)}</div>
          <div className={hoveredTrade.pnl > 0 ? "text-green-400" : "text-red-400"}>
            P&L: {hoveredTrade.pnl > 0 ? "+" : ""}${hoveredTrade.pnl.toFixed(2)} (
            {hoveredTrade.pnlPercent.toFixed(2)}%)
          </div>
        </div>
      )}
    </div>
  );
};

export default BacktestChart;
