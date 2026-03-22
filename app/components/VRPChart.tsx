"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { PricePoint, Position, PositionSide } from "@/app/types";

interface VRPChartProps {
  data: PricePoint[];
  positions: Position[];
  currentPrice: number;
  visibleIndex?: number;
  rvPeriod: number; // Period for calculating realized volatility
  onRvPeriodChange: (period: number) => void;
  ivMultiplier: number; // Simulated IV multiplier (since we don't have real IV data)
  onIvMultiplierChange: (multiplier: number) => void;
  visibleCandles: number;
  onVisibleCandlesChange: (candles: number) => void;
}

const MIN_CANDLES = 20;
const MAX_CANDLES = 500;

// Calculate realized volatility (annualized standard deviation of returns)
function calculateRealizedVolatility(data: PricePoint[], endIndex: number, period: number): number {
  if (endIndex < period || period < 2) return 0;

  const returns: number[] = [];
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    if (i > 0 && data[i] && data[i - 1]) {
      const logReturn = Math.log(data[i].close / data[i - 1].close);
      returns.push(logReturn);
    }
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Annualize (assuming ~252 trading days, scale based on timeframe)
  // For intraday data, we approximate with daily scaling
  const annualizationFactor = Math.sqrt(252);
  return stdDev * annualizationFactor * 100; // Convert to percentage
}

// Simulate implied volatility based on realized volatility with a premium
// In reality, you'd get IV from options data (VIX for S&P, option chains, etc.)
function calculateImpliedVolatility(
  realizedVol: number,
  priceData: PricePoint[],
  endIndex: number,
  multiplier: number,
): number {
  if (realizedVol === 0) return 0;

  // Base IV premium - IV typically trades at a premium to RV
  let ivPremium = multiplier;

  // Add fear premium based on recent price action
  if (endIndex >= 5 && priceData[endIndex]) {
    const recentReturn = (priceData[endIndex].close - priceData[endIndex - 5].close) / priceData[endIndex - 5].close;
    // Increase IV premium after drops (fear), decrease after rallies (complacency)
    if (recentReturn < -0.02) {
      ivPremium += 0.2 * Math.abs(recentReturn / 0.02); // Fear spike
    } else if (recentReturn > 0.02) {
      ivPremium -= 0.05 * (recentReturn / 0.02); // Complacency
    }
  }

  // Clamp the premium
  ivPremium = Math.max(1.0, Math.min(1.8, ivPremium));

  return realizedVol * ivPremium;
}

// Calculate VRP data for all visible candles
interface VRPData {
  rv: number;
  iv: number;
  vrp: number; // IV - RV (the premium)
  vrpPercent: number; // VRP as percentage of RV
}

function calculateVRPData(data: PricePoint[], rvPeriod: number, ivMultiplier: number): VRPData[] {
  const vrpData: VRPData[] = [];

  for (let i = 0; i < data.length; i++) {
    const rv = calculateRealizedVolatility(data, i, rvPeriod);
    const iv = calculateImpliedVolatility(rv, data, i, ivMultiplier);
    const vrp = iv - rv;
    const vrpPercent = rv > 0 ? (vrp / rv) * 100 : 0;

    vrpData.push({ rv, iv, vrp, vrpPercent });
  }

  return vrpData;
}

const VRPChart: React.FC<VRPChartProps> = ({
  data,
  positions,
  currentPrice,
  visibleIndex,
  rvPeriod,
  onRvPeriodChange,
  ivMultiplier,
  onIvMultiplierChange,
  visibleCandles,
  onVisibleCandlesChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Memoize expensive VRP calculation — only recompute when data/params change
  const allVrpData = React.useMemo(
    () => calculateVRPData(data, rvPeriod, ivMultiplier),
    [data, rvPeriod, ivMultiplier]
  );

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

    // Use memoized VRP data (computed outside this effect)

    // Determine the end index for visible data
    const endIndex = visibleIndex !== undefined ? Math.min(visibleIndex + 1, data.length) : data.length;
    const startIndex = Math.max(0, endIndex - visibleCandles);
    const visibleData = data.slice(startIndex, endIndex);
    const visibleVrpData = allVrpData.slice(startIndex, endIndex);

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

    // Split the chart: top 60% for price, bottom 40% for VRP
    const priceChartHeight = (height - padding.top - padding.bottom) * 0.55;
    const vrpChartHeight = (height - padding.top - padding.bottom) * 0.35;
    const chartGap = 20;
    const chartWidth = width - padding.left - padding.right;

    // Clear canvas
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    // === PRICE CHART (TOP) ===
    const allPrices = visibleData.flatMap((d) => [d.high, d.low]);
    const stopLossPrices = positions
      .filter((p) => p.status === "open")
      .map((p) => p.currentStopLoss ?? p.stopLoss)
      .filter((v): v is number => v !== undefined && v > 0);
    const allPriceValues = [...allPrices, ...stopLossPrices, currentPrice].filter((v) => v > 0);

    const minPrice = Math.min(...allPriceValues);
    const maxPrice = Math.max(...allPriceValues);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.1;
    const priceDomainMin = minPrice - pricePadding;
    const priceDomainMax = maxPrice + pricePadding;

    const xScale = (index: number) => padding.left + (index / (visibleData.length - 1)) * chartWidth;
    const priceYScale = (price: number) =>
      padding.top +
      priceChartHeight -
      ((price - priceDomainMin) / (priceDomainMax - priceDomainMin)) * priceChartHeight;

    // Draw price grid lines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    const priceGridLines = 4;
    for (let i = 0; i <= priceGridLines; i++) {
      const y = padding.top + (i / priceGridLines) * priceChartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const price = priceDomainMax - (i / priceGridLines) * (priceDomainMax - priceDomainMin);
      ctx.fillStyle = "#64748b";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${price.toFixed(2)}`, width - padding.right + 5, y + 4);
    }

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
      ctx.moveTo(x, priceYScale(candle.high));
      ctx.lineTo(x, priceYScale(candle.low));
      ctx.stroke();

      // Body
      const bodyTop = priceYScale(Math.max(candle.open, candle.close));
      const bodyBottom = priceYScale(Math.min(candle.open, candle.close));
      const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

      ctx.fillStyle = isGreen ? color : "#1e293b";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // Draw current price line
    const currentY = priceYScale(currentPrice);
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
    ctx.font = "bold 10px monospace";
    ctx.fillText(`$${currentPrice.toFixed(2)}`, width - padding.right + 5, currentY + 4);

    // Draw position entry lines
    positions
      .filter((pos) => pos.status === "open")
      .forEach((pos) => {
        const y = priceYScale(pos.entryPrice);
        const color = pos.side === PositionSide.LONG ? "#10b981" : "#f43f5e";

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = color;
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${pos.side} @${pos.entryPrice.toFixed(2)}`, padding.left + 5, y - 5);
      });

    // === VRP CHART (BOTTOM) ===
    const vrpChartTop = padding.top + priceChartHeight + chartGap;

    // Calculate VRP chart domain
    const allVrpValues = visibleVrpData.flatMap((d) => [d.iv, d.rv]).filter((v) => v > 0);
    const vrpMin = 0;
    const vrpMax = allVrpValues.length > 0 ? Math.max(...allVrpValues) * 1.1 : 30;

    const vrpYScale = (vol: number) =>
      vrpChartTop + vrpChartHeight - ((vol - vrpMin) / (vrpMax - vrpMin)) * vrpChartHeight;

    // Draw VRP chart separator
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, vrpChartTop - chartGap / 2);
    ctx.lineTo(width - padding.right, vrpChartTop - chartGap / 2);
    ctx.stroke();

    // VRP chart title
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Variance Risk Premium (IV vs RV)", padding.left, vrpChartTop - 5);

    // Draw VRP grid lines
    const vrpGridLines = 3;
    for (let i = 0; i <= vrpGridLines; i++) {
      const y = vrpChartTop + (i / vrpGridLines) * vrpChartHeight;
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const vol = vrpMax - (i / vrpGridLines) * (vrpMax - vrpMin);
      ctx.fillStyle = "#64748b";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${vol.toFixed(1)}%`, width - padding.right + 5, y + 3);
    }

    // Draw IV line (purple/violet - represents fear/insurance premium)
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let ivStarted = false;
    visibleVrpData.forEach((vrp, i) => {
      if (vrp.iv > 0) {
        const x = xScale(i);
        const y = vrpYScale(vrp.iv);
        if (!ivStarted) {
          ctx.moveTo(x, y);
          ivStarted = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // Draw RV line (cyan - actual realized volatility)
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let rvStarted = false;
    visibleVrpData.forEach((vrp, i) => {
      if (vrp.rv > 0) {
        const x = xScale(i);
        const y = vrpYScale(vrp.rv);
        if (!rvStarted) {
          ctx.moveTo(x, y);
          rvStarted = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // Fill the VRP area (between IV and RV)
    ctx.beginPath();
    const fillPoints: { x: number; ivY: number; rvY: number }[] = [];

    visibleVrpData.forEach((vrp, i) => {
      if (vrp.iv > 0 && vrp.rv > 0) {
        const x = xScale(i);
        fillPoints.push({ x, ivY: vrpYScale(vrp.iv), rvY: vrpYScale(vrp.rv) });
      }
    });

    if (fillPoints.length > 1) {
      // Draw IV line forward
      ctx.beginPath();
      ctx.moveTo(fillPoints[0].x, fillPoints[0].ivY);
      fillPoints.forEach((p) => ctx.lineTo(p.x, p.ivY));
      // Draw RV line backward
      for (let i = fillPoints.length - 1; i >= 0; i--) {
        ctx.lineTo(fillPoints[i].x, fillPoints[i].rvY);
      }
      ctx.closePath();

      // Fill with gradient based on VRP (positive = green, means IV > RV = edge)
      const currentVrp = visibleVrpData[visibleVrpData.length - 1];
      if (currentVrp && currentVrp.vrp > 0) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.2)"; // Green - positive VRP (sell premium)
      } else {
        ctx.fillStyle = "rgba(239, 68, 68, 0.2)"; // Red - negative VRP (avoid selling)
      }
      ctx.fill();
    }

    // Draw VRP signal indicator
    const lastVrpData = visibleVrpData[visibleVrpData.length - 1];
    if (lastVrpData && lastVrpData.rv > 0) {
      const signalX = width - padding.right - 60;
      const signalY = vrpChartTop + 20;

      const vrpValue = lastVrpData.vrp;
      const isPositiveVrp = vrpValue > 0;

      ctx.fillStyle = isPositiveVrp ? "#22c55e" : "#ef4444";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(isPositiveVrp ? "SELL PREMIUM ✓" : "AVOID SELLING ✗", signalX + 55, signalY);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "9px monospace";
      ctx.fillText(`VRP: ${vrpValue.toFixed(2)}%`, signalX + 55, signalY + 14);
    }

    // Legend
    const legendY = vrpChartTop + vrpChartHeight + 15;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";

    // IV legend
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(padding.left, legendY - 8, 12, 3);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("IV (Implied)", padding.left + 16, legendY);

    // RV legend
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(padding.left + 90, legendY - 8, 12, 3);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("RV (Realized)", padding.left + 106, legendY);

    // Current values
    if (lastVrpData && lastVrpData.rv > 0) {
      ctx.fillStyle = "#a855f7";
      ctx.fillText(`IV: ${lastVrpData.iv.toFixed(1)}%`, padding.left + 200, legendY);
      ctx.fillStyle = "#22d3ee";
      ctx.fillText(`RV: ${lastVrpData.rv.toFixed(1)}%`, padding.left + 280, legendY);
    }

    // Time labels
    ctx.fillStyle = "#64748b";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const timeLabels = 6;
    for (let i = 0; i <= timeLabels; i++) {
      const index = Math.floor((i / timeLabels) * (visibleData.length - 1));
      const x = xScale(index);
      const time = new Date(visibleData[index].time);
      ctx.fillText(time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), x, height - 5);
    }
  }, [data, positions, currentPrice, visibleCandles, visibleIndex, containerSize, allVrpData]);

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
          <span className='text-slate-400 text-xs'>RV Period:</span>
          <button
            type='button'
            onClick={() => onRvPeriodChange(Math.max(5, rvPeriod - 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Decrease RV period'
          >
            −
          </button>
          <span className='text-cyan-400 text-xs font-mono min-w-[30px] text-center'>{rvPeriod}</span>
          <button
            type='button'
            onClick={() => onRvPeriodChange(Math.min(100, rvPeriod + 5))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Increase RV period'
          >
            +
          </button>
        </div>
        <div className='flex items-center gap-2 border-l border-slate-600 pl-4'>
          <span className='text-slate-400 text-xs'>IV Premium:</span>
          <button
            type='button'
            onClick={() => onIvMultiplierChange(Math.max(1.0, ivMultiplier - 0.05))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Decrease IV multiplier'
          >
            −
          </button>
          <span className='text-purple-400 text-xs font-mono min-w-[40px] text-center'>
            {(ivMultiplier * 100 - 100).toFixed(0)}%
          </span>
          <button
            type='button'
            onClick={() => onIvMultiplierChange(Math.min(2.0, ivMultiplier + 0.05))}
            className='w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-sm font-bold'
            title='Increase IV multiplier'
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default VRPChart;
