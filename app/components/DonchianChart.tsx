"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Position, PositionSide } from "@/app/types";

interface DonchianPricePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  entryUpper?: number;
  entryLower?: number;
  entryMiddle?: number;
  exitUpper?: number;
  exitLower?: number;
  exitMiddle?: number;
  atr?: number;
}

interface DonchianChartProps {
  data: DonchianPricePoint[];
  positions: Position[];
  currentPrice: number;
  visibleIndex?: number;
  entryPeriod: number;
  onEntryPeriodChange: (period: number) => void;
  exitPeriod: number;
  onExitPeriodChange: (period: number) => void;
  visibleCandles: number;
  onVisibleCandlesChange: (candles: number) => void;
}

const MIN_CANDLES = 20;
const MAX_CANDLES = 500;

const DonchianChart: React.FC<DonchianChartProps> = ({
  data,
  positions,
  currentPrice,
  visibleIndex,
  entryPeriod,
  onEntryPeriodChange,
  exitPeriod,
  onExitPeriodChange,
  visibleCandles,
  onVisibleCandlesChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Watch for container size changes
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

  // Handle mouse wheel zoom
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

    // Clear canvas
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    // Calculate price range including channels
    const allPrices = visibleData.flatMap((d) => [d.high, d.low]);
    const entryChannels = visibleData
      .flatMap((d) => [d.entryUpper, d.entryLower])
      .filter((v): v is number => v !== undefined && v > 0);
    const exitChannels = visibleData
      .flatMap((d) => [d.exitUpper, d.exitLower])
      .filter((v): v is number => v !== undefined && v > 0);
    const stopLossPrices = positions
      .filter((p) => p.status === "open")
      .map((p) => p.currentStopLoss ?? p.stopLoss)
      .filter((v): v is number => v !== undefined && v > 0);
    const allValues = [...allPrices, ...entryChannels, ...exitChannels, ...stopLossPrices, currentPrice].filter(
      (v) => v > 0,
    );

    const minPrice = Math.min(...allValues);
    const maxPrice = Math.max(...allValues);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.1;
    const domainMin = minPrice - pricePadding;
    const domainMax = maxPrice + pricePadding;

    // Scale functions
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

    // Draw 20-day Entry Channel (filled area - green/teal)
    ctx.beginPath();
    let startedUpper = false;
    visibleData.forEach((candle, i) => {
      if (candle.entryUpper !== undefined) {
        const x = xScale(i);
        const y = yScale(candle.entryUpper);
        if (!startedUpper) {
          ctx.moveTo(x, y);
          startedUpper = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    // Draw back along the lower channel
    for (let i = visibleData.length - 1; i >= 0; i--) {
      const candle = visibleData[i];
      if (candle.entryLower !== undefined) {
        const x = xScale(i);
        const y = yScale(candle.entryLower);
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(16, 185, 129, 0.1)"; // emerald with low opacity
    ctx.fill();

    // Draw Entry Channel Upper line (green)
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    visibleData.forEach((candle, i) => {
      if (candle.entryUpper !== undefined) {
        const x = xScale(i);
        const y = yScale(candle.entryUpper);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // Draw Entry Channel Lower line (green)
    ctx.beginPath();
    started = false;
    visibleData.forEach((candle, i) => {
      if (candle.entryLower !== undefined) {
        const x = xScale(i);
        const y = yScale(candle.entryLower);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // Draw 10-day Exit Channel (dashed orange lines)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#f97316"; // orange
    ctx.lineWidth = 1.5;

    // Exit Upper
    ctx.beginPath();
    started = false;
    visibleData.forEach((candle, i) => {
      if (candle.exitUpper !== undefined) {
        const x = xScale(i);
        const y = yScale(candle.exitUpper);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // Exit Lower
    ctx.beginPath();
    started = false;
    visibleData.forEach((candle, i) => {
      if (candle.exitLower !== undefined) {
        const x = xScale(i);
        const y = yScale(candle.exitLower);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw candlesticks
    const candleWidth = Math.max(2, (chartWidth / visibleData.length) * 0.7);
    visibleData.forEach((candle, i) => {
      const x = xScale(i);
      const isGreen = candle.close >= candle.open;
      const color = isGreen ? "#10b981" : "#ef4444";

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yScale(candle.high));
      ctx.lineTo(x, yScale(candle.low));
      ctx.stroke();

      // Body
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

    // Draw breakout signals (highlight current candle if breaking out)
    // Compare current close to PREVIOUS bar's channel for true breakout detection
    if (visibleData.length > 1) {
      const lastCandle = visibleData[visibleData.length - 1];
      const prevCandle = visibleData[visibleData.length - 2];
      const lastX = xScale(visibleData.length - 1);

      // Long breakout signal (current close >= previous bar's upper channel)
      if (prevCandle.entryUpper !== undefined && lastCandle.close >= prevCandle.entryUpper) {
        ctx.beginPath();
        ctx.arc(lastX, yScale(prevCandle.entryUpper) - 15, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#10b981";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("▲", lastX, yScale(prevCandle.entryUpper) - 11);
      }

      // Short breakout signal (current close <= previous bar's lower channel)
      if (prevCandle.entryLower !== undefined && lastCandle.close <= prevCandle.entryLower) {
        ctx.beginPath();
        ctx.arc(lastX, yScale(prevCandle.entryLower) + 15, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("▼", lastX, yScale(prevCandle.entryLower) + 19);
      }
    }

    // Draw position entry lines
    positions
      .filter((pos) => pos.status === "open")
      .forEach((pos) => {
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

    // Draw current exit stop line for open positions
    positions
      .filter((pos) => pos.status === "open")
      .forEach((pos) => {
        const lastCandle = visibleData[visibleData.length - 1];
        const exitStop = pos.side === PositionSide.LONG ? lastCandle?.exitLower : lastCandle?.exitUpper;

        if (exitStop) {
          const stopY = yScale(exitStop);

          // Draw dashed orange line for exit stop
          ctx.strokeStyle = "#f97316";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 3]);
          ctx.beginPath();
          ctx.moveTo(padding.left, stopY);
          ctx.lineTo(width - padding.right, stopY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Stop loss label on the right
          ctx.fillStyle = "#f97316";
          ctx.fillRect(width - padding.right + 2, stopY - 10, 65, 20);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "left";
          ctx.fillText(`EXIT $${exitStop.toFixed(2)}`, width - padding.right + 4, stopY + 4);

          // Label on the left side
          ctx.fillStyle = "#f97316";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(`${exitPeriod}D EXIT`, padding.left + 5, stopY - 5);
        }
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
      // For daily data, show date instead of time
      const dateStr = time.toLocaleDateString([], { month: "short", day: "numeric" });
      ctx.fillText(dateStr, x, height - 10);
    }

    // Draw channel labels on the last candle
    if (visibleData.length > 0) {
      const lastCandle = visibleData[visibleData.length - 1];
      const lastX = xScale(visibleData.length - 1);

      if (lastCandle.entryUpper !== undefined) {
        ctx.fillStyle = "#10b981";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${entryPeriod}D HIGH`, lastX + 10, yScale(lastCandle.entryUpper) + 3);
      }

      if (lastCandle.entryLower !== undefined) {
        ctx.fillStyle = "#10b981";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${entryPeriod}D LOW`, lastX + 10, yScale(lastCandle.entryLower) + 3);
      }
    }
  }, [data, positions, currentPrice, visibleCandles, visibleIndex, containerSize, entryPeriod, exitPeriod]);

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
      <div className='absolute top-2 left-2 flex flex-wrap items-center gap-2 sm:gap-4 bg-slate-800/90 rounded-lg px-2 py-1 z-10 pointer-events-auto'>
        {/* Zoom controls */}
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

        {/* Entry Period control */}
        <div className='flex items-center gap-2 border-l border-slate-600 pl-2 sm:pl-4'>
          <span className='text-emerald-400 text-xs'>Entry:</span>
          <button
            type='button'
            onClick={() => onEntryPeriodChange(Math.max(5, entryPeriod - 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Decrease entry period'
          >
            −
          </button>
          <span className='text-emerald-400 text-xs font-mono min-w-[30px] text-center'>{entryPeriod}D</span>
          <button
            type='button'
            onClick={() => onEntryPeriodChange(Math.min(100, entryPeriod + 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Increase entry period'
          >
            +
          </button>
        </div>

        {/* Exit Period control */}
        <div className='flex items-center gap-2 border-l border-slate-600 pl-2 sm:pl-4'>
          <span className='text-orange-400 text-xs'>Exit:</span>
          <button
            type='button'
            onClick={() => onExitPeriodChange(Math.max(5, exitPeriod - 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Decrease exit period'
          >
            −
          </button>
          <span className='text-orange-400 text-xs font-mono min-w-[30px] text-center'>{exitPeriod}D</span>
          <button
            type='button'
            onClick={() => onExitPeriodChange(Math.min(50, exitPeriod + 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Increase exit period'
          >
            +
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className='absolute bottom-8 left-2 flex items-center gap-4 bg-slate-800/80 rounded-lg px-3 py-1.5 text-xs'>
        <div className='flex items-center gap-1'>
          <div className='w-4 h-0.5 bg-emerald-500'></div>
          <span className='text-emerald-400'>{entryPeriod}D Entry</span>
        </div>
        <div className='flex items-center gap-1'>
          <div className='w-4 h-0.5 bg-orange-500' style={{ borderStyle: "dashed" }}></div>
          <span className='text-orange-400'>{exitPeriod}D Exit</span>
        </div>
      </div>
    </div>
  );
};

export default DonchianChart;
