"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { IndicatorData, BacktestTrade, PositionSide } from "@/app/types";

interface BacktestChartProps {
  data: IndicatorData[];
  trades: BacktestTrade[];
  visibleCandles: number;
  onVisibleCandlesChange: (candles: number) => void;
  selectedStrategyId?: string;
  selectedTradeId?: string | null;
}

const MIN_CANDLES = 50;
const MAX_CANDLES = 1000;

// Strategy indicator configuration - defines which indicators to show for each strategy
interface IndicatorConfig {
  key: string;
  label: string;
  color: string;
  lineWidth?: number;
  lineDash?: number[];
}

interface StrategyIndicatorConfig {
  indicators: IndicatorConfig[];
}

const STRATEGY_INDICATORS: Record<string, StrategyIndicatorConfig> = {
  'ema-crossover': {
    indicators: [
      { key: 'ema9', label: 'EMA 9', color: '#fbbf24', lineWidth: 1 },
      { key: 'ema21', label: 'EMA 21', color: '#a855f7', lineWidth: 1 },
    ],
  },
  'sma-crossover': {
    indicators: [
      { key: 'sma50', label: 'SMA 50', color: '#3b82f6', lineWidth: 1 },
      { key: 'sma200', label: 'SMA 200', color: '#f97316', lineWidth: 1 },
    ],
  },
  'bollinger-bands': {
    indicators: [
      { key: 'sma20', label: 'SMA 20', color: '#3b82f6', lineWidth: 1 },
    ],
  },
  'donchian-channel': {
    indicators: [
      { key: 'upperBand', label: 'Donchian', color: '#06b6d4', lineWidth: 1, lineDash: [4, 4] },
      { key: 'lowerBand', label: '', color: '#06b6d4', lineWidth: 1, lineDash: [4, 4] },
      { key: 'midLine', label: '', color: '#22d3ee', lineWidth: 0.8, lineDash: [2, 2] },
    ],
  },
  // MACD and RSI don't have price chart overlays (they're oscillators)
  'macd-crossover': { indicators: [] },
  'rsi-mean-reversion': { indicators: [] },
};

const BacktestChart: React.FC<BacktestChartProps> = ({
  data,
  trades,
  visibleCandles,
  onVisibleCandlesChange,
  selectedStrategyId,
  selectedTradeId,
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

  // Scroll to selected trade when selectedTradeId changes
  // Using a ref to track previous value to avoid setState on initial mount
  const prevSelectedTradeIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Skip on initial mount or if selectedTradeId hasn't changed
    if (prevSelectedTradeIdRef.current === undefined) {
      prevSelectedTradeIdRef.current = selectedTradeId;
      return;
    }
    if (prevSelectedTradeIdRef.current === selectedTradeId) return;
    prevSelectedTradeIdRef.current = selectedTradeId;
    
    if (!selectedTradeId || !data || data.length === 0) return;
    
    const selectedTrade = trades.find(t => t.id === selectedTradeId);
    if (!selectedTrade) return;
    
    // Find the data index for the entry time of the selected trade
    const entryDataIdx = data.findIndex((d) => d.time >= selectedTrade.entryTime);
    if (entryDataIdx === -1) return;
    
    // Calculate the scroll offset to center the trade in the view
    // We want to position the trade in the middle of the visible area
    const centerOffset = Math.floor(visibleCandles / 2);
    const targetOffset = Math.max(0, data.length - entryDataIdx - centerOffset);
    const maxOffset = Math.max(0, data.length - visibleCandles);
    
    // Use requestAnimationFrame to batch the state update
    requestAnimationFrame(() => {
      setScrollOffset(Math.max(0, Math.min(maxOffset, targetOffset)));
    });
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
    const chartHeight = height - padding.top - padding.bottom;
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

    // Draw indicators based on strategy configuration
    const strategyConfig = selectedStrategyId ? STRATEGY_INDICATORS[selectedStrategyId] : undefined;
    if (strategyConfig) {
      for (const indicator of strategyConfig.indicators) {
        const indicatorKey = indicator.key as keyof IndicatorData;
        if (visibleData.some((d) => d[indicatorKey] !== undefined)) {
          if (indicator.lineDash) {
            ctx.setLineDash(indicator.lineDash);
          }
          drawIndicatorLine(
            data.map((d) => d[indicatorKey] as number | undefined),
            indicator.color,
            indicator.lineWidth ?? 1,
          );
          if (indicator.lineDash) {
            ctx.setLineDash([]);
          }
        }
      }
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
      const isSelected = trade.id === selectedTradeId;

      // Draw highlight background for selected trade
      if (isSelected && entryDataIdx >= startIndex && exitDataIdx >= startIndex) {
        const entryLocalIdx = Math.max(0, entryDataIdx - startIndex);
        const exitLocalIdx = Math.min(visibleData.length - 1, exitDataIdx - startIndex);
        const x1 = xScale(entryLocalIdx);
        const x2 = xScale(exitLocalIdx);
        const highlightPadding = 20;
        
        // Draw a semi-transparent highlight box around the selected trade
        ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
        ctx.fillRect(
          x1 - highlightPadding,
          padding.top,
          (x2 - x1) + (highlightPadding * 2),
          chartHeight
        );
        
        // Draw vertical lines at entry and exit
        ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x1, padding.top);
        ctx.lineTo(x1, padding.top + chartHeight);
        ctx.moveTo(x2, padding.top);
        ctx.lineTo(x2, padding.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw entry marker
      if (entryDataIdx >= startIndex && entryDataIdx < endIndex) {
        const localIdx = entryDataIdx - startIndex;
        const x = xScale(localIdx);
        const y = yScale(trade.entryPrice);
        const isLong = trade.side === PositionSide.LONG;

        // Draw larger triangle marker for selected trade
        const markerScale = isSelected ? 1.4 : 1;
        const baseOffset = 15 * markerScale;
        const tipOffset = 25 * markerScale;
        const width = 8 * markerScale;

        // Draw triangle marker
        ctx.beginPath();
        if (isLong) {
          ctx.moveTo(x, y + baseOffset);
          ctx.lineTo(x - width, y + tipOffset);
          ctx.lineTo(x + width, y + tipOffset);
        } else {
          ctx.moveTo(x, y - baseOffset);
          ctx.lineTo(x - width, y - tipOffset);
          ctx.lineTo(x + width, y - tipOffset);
        }
        ctx.closePath();
        ctx.fillStyle = isLong ? "#22c55e" : "#ef4444";
        ctx.fill();
        
        // Draw outline ring for selected trade marker
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Entry label
        ctx.fillStyle = "#ffffff";
        ctx.font = isSelected ? "bold 11px sans-serif" : "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(isLong ? "BUY" : "SELL", x, isLong ? y + tipOffset + 13 : y - tipOffset - 5);
      }

      // Draw exit marker
      if (exitDataIdx >= startIndex && exitDataIdx < endIndex) {
        const localIdx = exitDataIdx - startIndex;
        const x = xScale(localIdx);
        const y = yScale(trade.exitPrice);
        const isProfit = trade.pnl > 0;
        const markerSize = isSelected ? 8 : 6;

        // Draw X marker for exit
        ctx.strokeStyle = isProfit ? "#22c55e" : "#ef4444";
        ctx.lineWidth = isSelected ? 4 : 3;
        ctx.beginPath();
        ctx.moveTo(x - markerSize, y - markerSize);
        ctx.lineTo(x + markerSize, y + markerSize);
        ctx.moveTo(x + markerSize, y - markerSize);
        ctx.lineTo(x - markerSize, y + markerSize);
        ctx.stroke();
        
        // Draw circle around exit marker for selected trade
        if (isSelected) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, markerSize + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Exit label with P&L
        ctx.fillStyle = isProfit ? "#22c55e" : "#ef4444";
        ctx.font = isSelected ? "bold 11px sans-serif" : "bold 9px sans-serif";
        ctx.textAlign = "center";
        const pnlText = `${isProfit ? "+" : ""}${trade.pnlPercent.toFixed(2)}%`;
        ctx.fillText(pnlText, x, y - (isSelected ? 20 : 15));
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

        // Use more prominent line for selected trade
        if (isSelected) {
          ctx.strokeStyle = trade.pnl > 0 ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)";
          ctx.lineWidth = 3;
        } else {
          ctx.strokeStyle = trade.pnl > 0 ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";
          ctx.lineWidth = 2;
        }
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

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
    ctx.fillText("Price Chart", padding.left + 5, 18);

    // Legend - derive from strategy configuration (only show indicators with labels)
    ctx.font = "9px sans-serif";
    let legendX = padding.left + 100;
    const legendItems = strategyConfig?.indicators
      .filter((ind) => ind.label) // Only show indicators with labels
      .map((ind) => ({ label: ind.label, color: ind.color })) ?? [];

    legendItems.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX, 10, 12, 3);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(item.label, legendX + 16, 15);
      legendX += 60;
    });
  }, [data, trades, visibleCandles, scrollOffset, containerSize, selectedStrategyId, selectedTradeId]);

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
