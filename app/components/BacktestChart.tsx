"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { IndicatorData, BacktestTrade, PositionSide } from "@/app/types";

interface BacktestChartProps {
  data: IndicatorData[];
  trades: BacktestTrade[];
  equityCurve: { time: number; equity: number }[];
  visibleCandles: number;
  onVisibleCandlesChange: (candles: number) => void;
  showEquityCurve?: boolean;
}

const MIN_CANDLES = 50;
const MAX_CANDLES = 1000;

const BacktestChart: React.FC<BacktestChartProps> = ({
  data,
  trades,
  equityCurve,
  visibleCandles,
  onVisibleCandlesChange,
  showEquityCurve = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hoveredTrade] = useState<BacktestTrade | null>(null);

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
      } else {
        // Horizontal scroll
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
    const padding = { top: 30, right: 80, bottom: 40, left: 10 };
    const chartHeight = showEquityCurve
      ? (height - padding.top - padding.bottom) * 0.7
      : height - padding.top - padding.bottom;
    const equityHeight = showEquityCurve ? (height - padding.top - padding.bottom) * 0.25 : 0;
    const chartWidth = width - padding.left - padding.right;

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    // Calculate price range
    const allPrices = visibleData.flatMap((d) => [d.high, d.low]);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.1;
    const domainMin = minPrice - pricePadding;
    const domainMax = maxPrice + pricePadding;

    const xScale = (index: number) => padding.left + (index / (visibleData.length - 1 || 1)) * chartWidth;
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

    // Draw SMA lines
    const drawIndicatorLine = (values: (number | undefined)[], color: string, lineWidth: number = 1.5) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      let started = false;
      visibleData.forEach((_, i) => {
        const val = values[startIndex + i];
        if (val !== undefined && val > 0) {
          const x = xScale(i);
          const y = yScale(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    };

    // Draw EMA 9 (fast) - yellow
    if (visibleData.some((d) => d.ema9)) {
      drawIndicatorLine(
        data.map((d) => d.ema9),
        "#fbbf24",
        1,
      );
    }

    // Draw EMA 21 (slow) - purple
    if (visibleData.some((d) => d.ema21)) {
      drawIndicatorLine(
        data.map((d) => d.ema21),
        "#a855f7",
        1,
      );
    }

    // Draw SMA 50 - blue
    if (visibleData.some((d) => d.sma50)) {
      drawIndicatorLine(
        data.map((d) => d.sma50),
        "#3b82f6",
        1,
      );
    }

    // Draw SMA 200 - orange
    if (visibleData.some((d) => d.sma200)) {
      drawIndicatorLine(
        data.map((d) => d.sma200),
        "#f97316",
        1,
      );
    }

    // Draw Donchian Channels - cyan (upper/lower bands and midline)
    if (visibleData.some((d) => d.upperBand)) {
      // Upper band - dashed
      ctx.setLineDash([4, 4]);
      drawIndicatorLine(
        data.map((d) => d.upperBand),
        "#06b6d4",
        1,
      );
      ctx.setLineDash([]);
    }
    if (visibleData.some((d) => d.lowerBand)) {
      // Lower band - dashed
      ctx.setLineDash([4, 4]);
      drawIndicatorLine(
        data.map((d) => d.lowerBand),
        "#06b6d4",
        1,
      );
      ctx.setLineDash([]);
    }
    if (visibleData.some((d) => d.midLine)) {
      // Mid line - dotted
      ctx.setLineDash([2, 2]);
      drawIndicatorLine(
        data.map((d) => d.midLine),
        "#22d3ee",
        0.8,
      );
      ctx.setLineDash([]);
    }

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

    // Draw trade markers
    const visibleTrades = trades.filter((trade) => {
      const entryIdx = data.findIndex((d) => d.time >= trade.entryTime);
      const exitIdx = data.findIndex((d) => d.time >= trade.exitTime);
      return (entryIdx >= startIndex && entryIdx < endIndex) || (exitIdx >= startIndex && exitIdx < endIndex);
    });

    visibleTrades.forEach((trade) => {
      const entryDataIdx = data.findIndex((d) => d.time >= trade.entryTime);
      const exitDataIdx = data.findIndex((d) => d.time >= trade.exitTime);

      // Draw entry marker
      if (entryDataIdx >= startIndex && entryDataIdx < endIndex) {
        const localIdx = entryDataIdx - startIndex;
        const x = xScale(localIdx);
        const y = yScale(trade.entryPrice);
        const isLong = trade.side === PositionSide.LONG;

        // Draw triangle marker
        ctx.beginPath();
        if (isLong) {
          ctx.moveTo(x, y + 15);
          ctx.lineTo(x - 8, y + 25);
          ctx.lineTo(x + 8, y + 25);
        } else {
          ctx.moveTo(x, y - 15);
          ctx.lineTo(x - 8, y - 25);
          ctx.lineTo(x + 8, y - 25);
        }
        ctx.closePath();
        ctx.fillStyle = isLong ? "#22c55e" : "#ef4444";
        ctx.fill();

        // Entry label
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(isLong ? "BUY" : "SELL", x, isLong ? y + 38 : y - 30);
      }

      // Draw exit marker
      if (exitDataIdx >= startIndex && exitDataIdx < endIndex) {
        const localIdx = exitDataIdx - startIndex;
        const x = xScale(localIdx);
        const y = yScale(trade.exitPrice);
        const isProfit = trade.pnl > 0;

        // Draw X marker for exit
        ctx.strokeStyle = isProfit ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 6);
        ctx.lineTo(x + 6, y + 6);
        ctx.moveTo(x + 6, y - 6);
        ctx.lineTo(x - 6, y + 6);
        ctx.stroke();

        // Exit label with P&L
        ctx.fillStyle = isProfit ? "#22c55e" : "#ef4444";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        const pnlText = `${isProfit ? "+" : ""}${trade.pnlPercent.toFixed(2)}%`;
        ctx.fillText(pnlText, x, y - 15);
      }

      // Draw connection line between entry and exit
      if (
        entryDataIdx >= startIndex &&
        entryDataIdx < endIndex &&
        exitDataIdx >= startIndex &&
        exitDataIdx < endIndex
      ) {
        const entryLocalIdx = entryDataIdx - startIndex;
        const exitLocalIdx = exitDataIdx - startIndex;
        const x1 = xScale(entryLocalIdx);
        const x2 = xScale(exitLocalIdx);
        const y1 = yScale(trade.entryPrice);
        const y2 = yScale(trade.exitPrice);

        ctx.strokeStyle = trade.pnl > 0 ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Draw equity curve if enabled
    if (showEquityCurve && equityCurve.length > 0) {
      const equityTop = padding.top + chartHeight + 20;
      const equityValues = equityCurve.map((e) => e.equity);
      const minEquity = Math.min(...equityValues);
      const maxEquity = Math.max(...equityValues);
      const equityRange = maxEquity - minEquity || 1;

      const equityYScale = (equity: number) =>
        equityTop + equityHeight - ((equity - minEquity) / equityRange) * equityHeight;

      // Equity background
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(padding.left, equityTop, chartWidth, equityHeight);

      // Draw equity line
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      equityCurve.forEach((point, i) => {
        const x = padding.left + (i / (equityCurve.length - 1 || 1)) * chartWidth;
        const y = equityYScale(point.equity);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Fill under the curve
      ctx.lineTo(padding.left + chartWidth, equityTop + equityHeight);
      ctx.lineTo(padding.left, equityTop + equityHeight);
      ctx.closePath();
      ctx.fillStyle = "rgba(96, 165, 250, 0.1)";
      ctx.fill();

      // Equity labels
      ctx.fillStyle = "#64748b";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${maxEquity.toFixed(0)}`, width - padding.right + 5, equityTop + 10);
      ctx.fillText(`$${minEquity.toFixed(0)}`, width - padding.right + 5, equityTop + equityHeight - 5);

      // Label
      ctx.fillStyle = "#60a5fa";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("EQUITY CURVE", padding.left + 5, equityTop + 15);
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

    // Title and legend
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Backtest Results", padding.left + 5, 18);

    // Legend
    ctx.font = "9px sans-serif";
    let legendX = padding.left + 130;
    const legendItems = [
      { label: "EMA 9", color: "#fbbf24" },
      { label: "EMA 21", color: "#a855f7" },
      { label: "SMA 50", color: "#3b82f6" },
      { label: "SMA 200", color: "#f97316" },
      { label: "Donchian", color: "#06b6d4" },
    ];
    legendItems.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX, 10, 12, 3);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(item.label, legendX + 16, 15);
      legendX += 60;
    });
  }, [data, trades, equityCurve, visibleCandles, scrollOffset, containerSize, showEquityCurve]);

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
      <div className='absolute top-2 right-20 flex items-center gap-2 bg-slate-800/80 rounded-lg px-2 py-1 z-10'>
        <button
          type='button'
          onClick={zoomIn}
          className='w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-lg font-bold'
          title='Zoom In'
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
          title='Zoom Out'
        >
          −
        </button>
      </div>
      {hoveredTrade && (
        <div
          className='absolute bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-lg z-20'
          style={{ top: 50, left: 50 }}
        >
          <div className='font-bold text-white mb-1'>Trade Details</div>
          <div className='text-slate-300'>Side: {hoveredTrade.side}</div>
          <div className='text-slate-300'>Entry: ${hoveredTrade.entryPrice.toFixed(2)}</div>
          <div className='text-slate-300'>Exit: ${hoveredTrade.exitPrice.toFixed(2)}</div>
          <div className={hoveredTrade.pnl > 0 ? "text-green-400" : "text-red-400"}>
            P&L: {hoveredTrade.pnl > 0 ? "+" : ""}${hoveredTrade.pnl.toFixed(2)} ({hoveredTrade.pnlPercent.toFixed(2)}%)
          </div>
        </div>
      )}
    </div>
  );
};

export default BacktestChart;
