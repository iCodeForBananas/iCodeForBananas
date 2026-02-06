"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { PricePoint } from "@/app/types";

export interface OptionTrade {
  id: string;
  strike: number;
  premium: number;
  contracts: number;
  entryIndex: number;
  entryTime: number;
  entryUnderlying: number;
  entryCost: number;
  status: "open" | "closed";
  exitIndex?: number;
  exitTime?: number;
  exitUnderlying?: number;
  pnl?: number;
}

interface OptionsPracticeChartProps {
  data: PricePoint[];
  trade: OptionTrade | null;
  currentPrice: number;
  visibleIndex?: number;
  visibleCandles: number;
  onVisibleCandlesChange: (candles: number) => void;
  onChartClick?: (dataIndex: number) => void;
  strike?: number;
}

const MIN_CANDLES = 20;
const MAX_CANDLES = 500;

const OptionsPracticeChart: React.FC<OptionsPracticeChartProps> = ({
  data,
  trade,
  currentPrice,
  visibleIndex,
  visibleCandles,
  onVisibleCandlesChange,
  onChartClick,
  strike,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const chartMetaRef = useRef({
    startIndex: 0,
    visibleLength: 0,
    padding: { top: 20, right: 70, bottom: 30, left: 10 },
    chartWidth: 0,
    width: 0,
  });

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

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onChartClick || !data.length) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const { startIndex, visibleLength, padding, chartWidth, width } = chartMetaRef.current;
      if (visibleLength <= 0 || chartWidth <= 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < padding.left || x > width - padding.right) return;

      const relativeX = x - padding.left;
      const indexRatio = relativeX / chartWidth;
      const localIndex = Math.round(indexRatio * (visibleLength - 1));
      const clampedLocal = Math.max(0, Math.min(visibleLength - 1, localIndex));
      const dataIndex = startIndex + clampedLocal;
      onChartClick(dataIndex);
    },
    [onChartClick, data.length],
  );

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

    chartMetaRef.current = {
      startIndex,
      visibleLength: visibleData.length,
      padding,
      chartWidth,
      width,
    };

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    const allPrices = visibleData.flatMap((d) => [d.high, d.low]);
    const strikePrice = trade?.strike ?? strike;
    const entryPrice = trade?.entryUnderlying;
    const exitPrice = trade?.exitUnderlying;

    const allValues = [
      ...allPrices,
      currentPrice,
      strikePrice ?? 0,
      entryPrice ?? 0,
      exitPrice ?? 0,
    ].filter((v) => v > 0);

    const minPrice = Math.min(...allValues);
    const maxPrice = Math.max(...allValues);
    const priceRange = maxPrice - minPrice || 1;
    const pricePadding = priceRange * 0.1;
    const domainMin = minPrice - pricePadding;
    const domainMax = maxPrice + pricePadding;

    const xScale = (index: number) =>
      padding.left + (index / (visibleData.length - 1 || 1)) * chartWidth;
    const yScale = (price: number) =>
      padding.top + chartHeight - ((price - domainMin) / (domainMax - domainMin)) * chartHeight;

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

    const currentY = yScale(currentPrice);
    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, currentY);
    ctx.lineTo(width - padding.right, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(width - padding.right + 2, currentY - 10, 65, 20);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`$${currentPrice.toFixed(2)}`, width - padding.right + 5, currentY + 4);

    if (strikePrice) {
      const strikeY = yScale(strikePrice);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, strikeY);
      ctx.lineTo(width - padding.right, strikeY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(width - padding.right + 2, strikeY - 10, 65, 20);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 10px monospace";
      ctx.fillText(`K $${strikePrice.toFixed(2)}`, width - padding.right + 5, strikeY + 4);
    }

    if (trade) {
      const entryY = yScale(trade.entryUnderlying);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(padding.left, entryY);
      ctx.lineTo(width - padding.right, entryY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("ENTRY", padding.left + 5, entryY - 5);

      if (trade.exitUnderlying !== undefined) {
        const exitY = yScale(trade.exitUnderlying);
        ctx.strokeStyle = trade.pnl && trade.pnl >= 0 ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, exitY);
        ctx.lineTo(width - padding.right, exitY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = trade.pnl && trade.pnl >= 0 ? "#22c55e" : "#ef4444";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("EXIT", padding.left + 5, exitY - 5);
      }

      const entryLocal = trade.entryIndex - startIndex;
      if (entryLocal >= 0 && entryLocal < visibleData.length) {
        const x = xScale(entryLocal);
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(x, entryY + 15);
        ctx.lineTo(x - 8, entryY + 25);
        ctx.lineTo(x + 8, entryY + 25);
        ctx.closePath();
        ctx.fill();
      }

      if (trade.exitIndex !== undefined) {
        const exitLocal = trade.exitIndex - startIndex;
        if (exitLocal >= 0 && exitLocal < visibleData.length && trade.exitUnderlying !== undefined) {
          const x = xScale(exitLocal);
          const y = yScale(trade.exitUnderlying);
          ctx.strokeStyle = trade.pnl && trade.pnl >= 0 ? "#22c55e" : "#ef4444";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x - 6, y - 6);
          ctx.lineTo(x + 6, y + 6);
          ctx.moveTo(x + 6, y - 6);
          ctx.lineTo(x - 6, y + 6);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const timeLabels = 6;
    for (let i = 0; i <= timeLabels; i++) {
      const index = Math.floor((i / timeLabels) * (visibleData.length - 1 || 1));
      const x = xScale(index);
      const time = new Date(visibleData[index].time);
      ctx.fillText(time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), x, height - 10);
    }
  }, [data, trade, currentPrice, visibleCandles, visibleIndex, containerSize, strike]);

  if (!data || data.length === 0) {
    return (
      <div className='w-full h-full flex items-center justify-center bg-slate-900 text-slate-400'>
        No data to display
      </div>
    );
  }

  return (
    <div ref={containerRef} className='w-full h-full relative'>
      <canvas ref={canvasRef} className='w-full h-full' onClick={handleClick} />
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
      </div>
    </div>
  );
};

export default OptionsPracticeChart;
