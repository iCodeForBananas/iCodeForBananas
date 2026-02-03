"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { PricePoint, Position, PositionSide } from "@/app/types";

export interface ScalpingPosition extends Position {
  takeProfit1R?: number;
  takeProfit2R?: number;
  initialRisk?: number;
}

interface ScalpingChartProps {
  data: PricePoint[];
  positions: ScalpingPosition[];
  currentPrice: number;
  visibleIndex?: number;
  emaPeriod: number;
  onEmaPeriodChange: (period: number) => void;
  visibleCandles: number;
  onVisibleCandlesChange: (candles: number) => void;
}

const MIN_CANDLES = 20;
const MAX_CANDLES = 500;

const ScalpingChart: React.FC<ScalpingChartProps> = ({
  data,
  positions,
  currentPrice,
  visibleIndex,
  emaPeriod,
  onEmaPeriodChange,
  visibleCandles,
  onVisibleCandlesChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

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
        if (e.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomIn, zoomOut]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data || data.length === 0) return;

    const endIndex = visibleIndex !== undefined ? Math.min(visibleIndex + 1, data.length) : data.length;
    const startIndex = Math.max(0, endIndex - visibleCandles);
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
    const padding = { top: 20, right: 70, bottom: 30, left: 10 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    // Calculate price range from visible data including TP levels
    const allPrices = visibleData.flatMap((d) => [d.high, d.low]);
    const emaValues = visibleData
      .flatMap((d) => [(d as PricePoint & { ema?: number }).ema])
      .filter((v): v is number => v !== undefined && v > 0);

    // Include stop loss and TP levels in price range
    const openPositions = positions.filter((p) => p.status === "open");
    const stopLossPrices = openPositions
      .map((p) => p.currentStopLoss ?? p.stopLoss)
      .filter((v): v is number => v !== undefined && v > 0);
    const tp1Prices = openPositions.map((p) => p.takeProfit1R).filter((v): v is number => v !== undefined && v > 0);
    const tp2Prices = openPositions.map((p) => p.takeProfit2R).filter((v): v is number => v !== undefined && v > 0);

    const allValues = [...allPrices, ...emaValues, ...stopLossPrices, ...tp1Prices, ...tp2Prices, currentPrice].filter(
      (v) => v > 0,
    );

    const minPrice = Math.min(...allValues);
    const maxPrice = Math.max(...allValues);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.1;
    const domainMin = minPrice - pricePadding;
    const domainMax = maxPrice + pricePadding;

    const xScale = (index: number) => padding.left + (index / (visibleData.length - 1)) * chartWidth;
    const yScale = (price: number) =>
      padding.top + chartHeight - ((price - domainMin) / (domainMax - domainMin)) * chartHeight;

    // Draw grid lines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i / gridLines) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const price = domainMax - (i / gridLines) * (domainMax - domainMin);
      ctx.fillStyle = "#64748b";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${price.toFixed(2)}`, width - padding.right + 5, y + 4);
    }

    // Draw EMA line
    let started = false;
    const hasOpenPosition = positions.some((p) => p.status === "open");
    ctx.strokeStyle = hasOpenPosition ? "#f59e0b" : "#a855f7";
    ctx.lineWidth = hasOpenPosition ? 2.5 : 1.5;
    ctx.beginPath();
    started = false;
    visibleData.forEach((candle, i) => {
      const ema = (candle as PricePoint & { ema?: number }).ema;
      if (ema) {
        const x = xScale(i);
        const y = yScale(ema);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // Draw candlesticks
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
      const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

      ctx.fillStyle = isGreen ? color : "#1e293b";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // Draw current price line
    const currentY = yScale(currentPrice);
    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, currentY);
    ctx.lineTo(width - padding.right, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current price label
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(width - padding.right + 2, currentY - 10, 65, 20);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`$${currentPrice.toFixed(2)}`, width - padding.right + 5, currentY + 4);

    // Draw take profit and stop loss lines for open positions
    openPositions.forEach((pos) => {
      // Draw 1R Take Profit line (green dashed)
      if (pos.takeProfit1R) {
        const tp1Y = yScale(pos.takeProfit1R);
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, tp1Y);
        ctx.lineTo(width - padding.right, tp1Y);
        ctx.stroke();
        ctx.setLineDash([]);

        // TP1 label on the right
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(width - padding.right + 2, tp1Y - 10, 65, 20);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`TP1 $${pos.takeProfit1R.toFixed(2)}`, width - padding.right + 4, tp1Y + 4);

        // Label on the left
        ctx.fillStyle = "#22c55e";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("TAKE PROFIT 1R", padding.left + 5, tp1Y - 5);
      }

      // Draw 2R Take Profit line (cyan dashed)
      if (pos.takeProfit2R) {
        const tp2Y = yScale(pos.takeProfit2R);
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, tp2Y);
        ctx.lineTo(width - padding.right, tp2Y);
        ctx.stroke();
        ctx.setLineDash([]);

        // TP2 label on the right
        ctx.fillStyle = "#06b6d4";
        ctx.fillRect(width - padding.right + 2, tp2Y - 10, 65, 20);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`TP2 $${pos.takeProfit2R.toFixed(2)}`, width - padding.right + 4, tp2Y + 4);

        // Label on the left
        ctx.fillStyle = "#06b6d4";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("TAKE PROFIT 2R", padding.left + 5, tp2Y - 5);
      }

      // Draw current stop loss line (red solid)
      const stopPrice = pos.currentStopLoss ?? pos.stopLoss;
      if (stopPrice) {
        const stopY = yScale(stopPrice);

        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(padding.left, stopY);
        ctx.lineTo(width - padding.right, stopY);
        ctx.stroke();

        // Stop loss label on the right
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(width - padding.right + 2, stopY - 10, 65, 20);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`SL $${stopPrice.toFixed(2)}`, width - padding.right + 4, stopY + 4);

        // Label on the left side
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "left";
        const label = pos.currentStopLoss === pos.entryPrice ? "STOP (B/E)" : "TRAIL STOP";
        ctx.fillText(label, padding.left + 5, stopY - 5);
      }
    });

    // Draw position entry lines
    openPositions.forEach((pos) => {
      const y = yScale(pos.entryPrice);
      const color = pos.side === PositionSide.LONG ? "#10b981" : "#f43f5e";

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Label
      ctx.fillStyle = color;
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${pos.side} @${pos.entryPrice.toFixed(2)}`, padding.left + 5, y - 5);
    });

    // Time labels
    ctx.fillStyle = "#64748b";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const timeLabels = 6;
    for (let i = 0; i <= timeLabels; i++) {
      const index = Math.floor((i / timeLabels) * (visibleData.length - 1));
      const x = xScale(index);
      const time = new Date(visibleData[index].time);
      ctx.fillText(time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), x, height - 10);
    }
  }, [data, positions, currentPrice, visibleCandles, visibleIndex, containerSize]);

  if (!data || data.length === 0) {
    return (
      <div className='w-full h-full flex items-center justify-center bg-slate-900 text-slate-400'>
        No data to display
      </div>
    );
  }

  return (
    <div ref={containerRef} className='w-full h-full relative'>
      <canvas ref={canvasRef} className='w-full h-full' />
      <div className='absolute top-2 left-2 flex items-center gap-4 bg-slate-800/80 rounded-lg px-2 py-1 z-10 pointer-events-auto'>
        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={zoomIn}
            className='w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-lg font-bold'
            title='Zoom In (fewer candles)'
          >
            +
          </button>
          <span className='text-slate-400 text-xs font-mono min-w-[60px] text-center'>
            {Math.min(visibleCandles, data.length)} bars
          </span>
          <button
            type='button'
            onClick={zoomOut}
            className='w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-lg font-bold'
            title='Zoom Out (more candles)'
          >
            −
          </button>
        </div>
        <div className='flex items-center gap-2 border-l border-slate-600 pl-4'>
          <span className='text-slate-400 text-xs'>EMA:</span>
          <button
            type='button'
            onClick={() => onEmaPeriodChange(Math.max(5, emaPeriod - 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Decrease EMA period'
          >
            −
          </button>
          <span className='text-purple-400 text-xs font-mono min-w-[30px] text-center'>{emaPeriod}</span>
          <button
            type='button'
            onClick={() => onEmaPeriodChange(Math.min(200, emaPeriod + 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Increase EMA period'
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScalpingChart;
