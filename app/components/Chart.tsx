"use client";

import React, { useRef, useEffect } from "react";
import { PricePoint, Position, PositionSide } from "@/app/types";

interface ChartProps {
  data: PricePoint[];
  positions: Position[];
  currentPrice: number;
}

const Chart: React.FC<ChartProps> = ({ data, positions, currentPrice }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data || data.length === 0) return;

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

    // Calculate price range
    const allPrices = data.flatMap((d) => [d.high, d.low]);
    const smas = data.flatMap((d) => [d.sma20, d.sma200]).filter((v): v is number => v !== undefined && v > 0);
    const allValues = [...allPrices, ...smas, currentPrice].filter((v) => v > 0);

    const minPrice = Math.min(...allValues);
    const maxPrice = Math.max(...allValues);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.1;
    const domainMin = minPrice - pricePadding;
    const domainMax = maxPrice + pricePadding;

    // Scale functions
    const xScale = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
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

    // Draw SMA200 (yellow)
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    data.forEach((candle, i) => {
      if (candle.sma200) {
        const x = xScale(i);
        const y = yScale(candle.sma200);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // Draw SMA20 (cyan or red if position open)
    const hasOpenPosition = positions.some((p) => p.status === "open");
    ctx.strokeStyle = hasOpenPosition ? "#ef4444" : "#22d3ee";
    ctx.lineWidth = hasOpenPosition ? 2.5 : 1.5;
    ctx.beginPath();
    started = false;
    data.forEach((candle, i) => {
      if (candle.sma20) {
        const x = xScale(i);
        const y = yScale(candle.sma20);
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
    const candleWidth = Math.max(2, (chartWidth / data.length) * 0.7);
    data.forEach((candle, i) => {
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
      const index = Math.floor((i / timeLabels) * (data.length - 1));
      const x = xScale(index);
      const time = new Date(data[index].time);
      ctx.fillText(time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), x, height - 10);
    }
  }, [data, positions, currentPrice]);

  if (!data || data.length === 0) {
    return (
      <div className='w-full h-full flex items-center justify-center bg-slate-900 text-slate-400'>
        No data to display
      </div>
    );
  }

  return (
    <div ref={containerRef} className='w-full h-full'>
      <canvas ref={canvasRef} className='w-full h-full' />
    </div>
  );
};

export default Chart;
