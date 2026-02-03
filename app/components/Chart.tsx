"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { PricePoint, Position, PositionSide } from "@/app/types";

interface ChartProps {
  data: PricePoint[];
  positions: Position[];
  currentPrice: number;
  visibleIndex?: number; // If provided, zoom slices from this index backwards
  trailstopSmaPeriod: number;
  onTrailstopSmaPeriodChange: (period: number) => void;
}

const MIN_CANDLES = 20;
const MAX_CANDLES = 500;
const DEFAULT_CANDLES = 200;

const Chart: React.FC<ChartProps> = ({
  data,
  positions,
  currentPrice,
  visibleIndex,
  trailstopSmaPeriod,
  onTrailstopSmaPeriodChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCandles, setVisibleCandles] = useState(DEFAULT_CANDLES);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Watch for container size changes (including sidebar toggle)
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
    setVisibleCandles((prev) => Math.max(MIN_CANDLES, Math.floor(prev * 0.8)));
  }, []);

  const zoomOut = useCallback(() => {
    setVisibleCandles((prev) => Math.min(MAX_CANDLES, Math.floor(prev * 1.25)));
  }, []);

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

    // Determine the end index for visible data
    const endIndex = visibleIndex !== undefined ? Math.min(visibleIndex + 1, data.length) : data.length;
    // Slice data to show only visible candles (ending at endIndex)
    const startIndex = Math.max(0, endIndex - visibleCandles);
    const visibleData = data.slice(startIndex, endIndex);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match container
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

    // Calculate price range from visible data
    const allPrices = visibleData.flatMap((d) => [d.high, d.low]);
    const smas = visibleData.flatMap((d) => [d.trailstopSma]).filter((v): v is number => v !== undefined && v > 0);
    // Include current stop loss in price range so it's always visible
    const stopLossPrices = positions
      .filter((p) => p.status === "open")
      .map((p) => p.currentStopLoss ?? p.stopLoss)
      .filter((v): v is number => v !== undefined && v > 0);
    const allValues = [...allPrices, ...smas, ...stopLossPrices, currentPrice].filter((v) => v > 0);

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

      // Price labels
      const price = domainMax - (i / gridLines) * (domainMax - domainMin);
      ctx.fillStyle = "#64748b";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${price.toFixed(2)}`, width - padding.right + 5, y + 4);
    }

    // Draw Trailstop SMA (cyan or red if position open)
    let started = false;
    const hasOpenPosition = positions.some((p) => p.status === "open");
    ctx.strokeStyle = hasOpenPosition ? "#ef4444" : "#22d3ee";
    ctx.lineWidth = hasOpenPosition ? 2.5 : 1.5;
    ctx.beginPath();
    started = false;
    visibleData.forEach((candle, i) => {
      if (candle.trailstopSma) {
        const x = xScale(i);
        const y = yScale(candle.trailstopSma);
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

    // Draw current stop loss line (red horizontal line)
    positions
      .filter((pos) => pos.status === "open")
      .forEach((pos) => {
        const stopPrice = pos.currentStopLoss ?? pos.stopLoss;
        if (stopPrice) {
          const stopY = yScale(stopPrice);

          // Draw solid red line for current stop
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
          const label = pos.currentStopLoss === pos.entryPrice ? "STOP (B/E)" : "STOP";
          ctx.fillText(label, padding.left + 5, stopY - 5);
        }
      });

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
          <span className='text-slate-400 text-xs'>Trail SMA:</span>
          <button
            type='button'
            onClick={() => onTrailstopSmaPeriodChange(Math.max(5, trailstopSmaPeriod - 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Decrease SMA period'
          >
            −
          </button>
          <span className='text-cyan-400 text-xs font-mono min-w-[30px] text-center'>{trailstopSmaPeriod}</span>
          <button
            type='button'
            onClick={() => onTrailstopSmaPeriodChange(Math.min(200, trailstopSmaPeriod + 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Increase SMA period'
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chart;
