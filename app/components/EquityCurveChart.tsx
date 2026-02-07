"use client";

import React, { useRef, useEffect, useState } from "react";

interface EquityCurveChartProps {
  equityCurve: { time: number; equity: number }[];
  initialCapital?: number;
}

const EquityCurveChart: React.FC<EquityCurveChartProps> = ({
  equityCurve,
  initialCapital = 100000,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || equityCurve.length === 0) return;

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
    const padding = { top: 30, right: 80, bottom: 30, left: 10 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    // Calculate equity range
    const equityValues = equityCurve.map((e) => e.equity);
    const minEquity = Math.min(...equityValues, initialCapital);
    const maxEquity = Math.max(...equityValues, initialCapital);
    const equityRange = maxEquity - minEquity || 1;
    const equityPadding = equityRange * 0.1;
    const domainMin = minEquity - equityPadding;
    const domainMax = maxEquity + equityPadding;

    const xScale = (index: number) =>
      padding.left + (index / (equityCurve.length - 1 || 1)) * chartWidth;
    const yScale = (equity: number) =>
      padding.top + chartHeight - ((equity - domainMin) / (domainMax - domainMin)) * chartHeight;

    // Draw grid lines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i / gridLines) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const equity = domainMax - (i / gridLines) * (domainMax - domainMin);
      ctx.fillStyle = "#64748b";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${equity.toFixed(0)}`, width - padding.right + 5, y + 4);
    }

    // Draw initial capital reference line
    const initialY = yScale(initialCapital);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, initialY);
    ctx.lineTo(width - padding.right, initialY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw equity curve
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    equityCurve.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.equity);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under the curve with gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    gradient.addColorStop(0, "rgba(96, 165, 250, 0.3)");
    gradient.addColorStop(1, "rgba(96, 165, 250, 0.05)");

    ctx.beginPath();
    equityCurve.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.equity);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xScale(equityCurve.length - 1), padding.top + chartHeight);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw time labels
    ctx.fillStyle = "#64748b";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const timeLabels = 5;
    for (let i = 0; i <= timeLabels; i++) {
      const index = Math.floor((i / timeLabels) * (equityCurve.length - 1));
      if (index >= 0 && index < equityCurve.length) {
        const x = xScale(index);
        const time = new Date(equityCurve[index].time);
        ctx.fillText(time.toLocaleDateString([], { month: "short", day: "numeric" }), x, height - 8);
      }
    }

    // Title
    ctx.fillStyle = "#60a5fa";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("EQUITY CURVE", padding.left + 5, 18);

    // Current equity value
    const lastEquity = equityCurve[equityCurve.length - 1]?.equity || initialCapital;
    const pnl = lastEquity - initialCapital;
    const pnlPercent = (pnl / initialCapital) * 100;
    const pnlColor = pnl >= 0 ? "#22c55e" : "#ef4444";

    ctx.fillStyle = pnlColor;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      `$${lastEquity.toFixed(0)} (${pnl >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%)`,
      width - padding.right,
      18
    );
  }, [equityCurve, initialCapital, containerSize]);

  if (equityCurve.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400 text-sm">
        No equity data
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default EquityCurveChart;
