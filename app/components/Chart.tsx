"use client";

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  Bar,
} from "recharts";
import { PricePoint, Position, PositionSide } from "@/app/types";

interface ChartProps {
  data: PricePoint[];
  positions: Position[];
  currentPrice: number;
}

// Custom Candlestick Shape that works with Recharts coordinate system
interface CandlestickRenderProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: any;
  yAxis?: any;
  yAxisMap?: any;
  data?: PricePoint[];
  chartHeight?: number;
  domainMin?: number;
  domainMax?: number;
}

const renderCandlestick = (props: CandlestickRenderProps) => {
  const {
    x = 0,
    width = 10,
    index = 0,
    data: chartData,
    yAxis,
    yAxisMap,
    chartHeight,
    domainMin = 0,
    domainMax = 1,
  } = props;
  if (!chartData || !chartData[index]) return null;

  const candle = chartData[index];
  const { open, close, high, low } = candle;

  const isGreen = close >= open;
  const fillColor = isGreen ? "#10b981" : "#ef4444";
  const wickColor = isGreen ? "#10b981" : "#ef4444";

  // Calculate dimensions
  const candleWidth = Math.max(width * 0.6, 3);
  const wickWidth = Math.min(width * 0.15, 2);

  // Use the chart's Y-axis scale to get pixel positions
  // yAxis might be passed directly, or we might need to look in yAxisMap
  let scale;
  if (yAxis && yAxis.scale) {
    scale = yAxis.scale;
  } else if (yAxisMap) {
    // Try to get the axis from the map (default id is "0")
    const axis = yAxisMap[0] || yAxisMap["0"] || (Object.values(yAxisMap)[0] as any);
    if (axis && axis.scale) {
      scale = axis.scale;
    }
  } else if (chartHeight) {
    // Fallback: Manually calculate scale if we have the domain and chart height
    // Note: margin top/bottom matches the ComposedChart margin (10, 10)
    const availableHeight = chartHeight - 20;
    scale = (val: number) => {
      // Linear interpolation: domainMax -> 10, domainMin -> chartHeight - 10
      // 0 to 1 normalization
      const normalized = (val - domainMin) / (domainMax - domainMin);
      // In SVG, y increases downwards.
      // max val => top (margin.top)
      // min val => bottom (chartHeight - margin.bottom)
      return 10 + (1 - normalized) * availableHeight;
    };
  }

  if (!scale) return null;

  const openY = scale(open);
  const closeY = scale(close);
  const highY = scale(high);
  const lowY = scale(low);

  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.abs(closeY - openY) || 1;

  return (
    <g>
      {/* Wick (high to low) */}
      <line x1={x + width / 2} y1={highY} x2={x + width / 2} y2={lowY} stroke={wickColor} strokeWidth={wickWidth} />
      {/* Body (open to close) */}
      <rect
        x={x + (width - candleWidth) / 2}
        y={bodyTop}
        width={candleWidth}
        height={bodyHeight}
        fill={isGreen ? fillColor : "#0f172a"}
        stroke={fillColor}
        strokeWidth={1.5}
      />
    </g>
  );
};

interface TooltipPayload {
  dataKey: string;
  value: number;
  payload: PricePoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const sma20Data = payload.find((p) => p.dataKey === "sma20");
    const sma200Data = payload.find((p) => p.dataKey === "sma200");

    return (
      <div className='bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-2xl text-xs font-mono'>
        <p className='text-slate-500 mb-2 border-b border-slate-800 pb-1'>{new Date(data.time).toLocaleTimeString()}</p>
        <div className='space-y-1'>
          <p className='flex justify-between gap-4'>
            <span className='text-slate-400'>OPEN:</span>
            <span className='text-white'>${data.open.toFixed(2)}</span>
          </p>
          <p className='flex justify-between gap-4'>
            <span className='text-slate-400'>HIGH:</span>
            <span className='text-green-400'>${data.high.toFixed(2)}</span>
          </p>
          <p className='flex justify-between gap-4'>
            <span className='text-slate-400'>LOW:</span>
            <span className='text-red-400'>${data.low.toFixed(2)}</span>
          </p>
          <p className='flex justify-between gap-4'>
            <span className='text-slate-400'>CLOSE:</span>
            <span className='text-white font-bold'>${data.close.toFixed(2)}</span>
          </p>
          {sma20Data && sma20Data.value && (
            <p className='flex justify-between gap-4'>
              <span className='text-cyan-400'>SMA 20:</span>
              <span className='text-cyan-200'>${sma20Data.value.toFixed(2)}</span>
            </p>
          )}
          {sma200Data && sma200Data.value && (
            <p className='flex justify-between gap-4'>
              <span className='text-yellow-400'>SMA 200:</span>
              <span className='text-yellow-200'>${sma200Data.value.toFixed(2)}</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const Chart: React.FC<ChartProps> = ({ data, positions, currentPrice }) => {
  if (!data || data.length === 0) return null;

  const allPrices = data.flatMap((d) => [d.open, d.high, d.low, d.close]);
  const smas = data.flatMap((d) => [d.sma20 || 0, d.sma200 || 0]).filter((v) => v > 0);

  const allValues = [...allPrices, ...smas, currentPrice].filter((v) => v > 0);
  const absoluteMin = Math.min(...allValues);
  const absoluteMax = Math.max(...allValues);
  const padding = (absoluteMax - absoluteMin) * 0.1 || 1.0;
  const domainMin = absoluteMin - padding;
  const domainMax = absoluteMax + padding;

  return (
    <div className='w-full h-full'>
      <ResponsiveContainer width='100%' height='100%'>
        {({ height }) => (
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#1e293b' vertical={false} opacity={0.5} />
            <XAxis
              dataKey='time'
              tickFormatter={(time) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              tick={{ fill: "#64748b", fontSize: 9 }}
              interval='preserveStartEnd'
            />
            <YAxis
              domain={[domainMin, domainMax]}
              orientation='right'
              tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }}
              tickFormatter={(val) => val.toFixed(2)}
              width={60}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} isAnimationActive={false} />

            {/* Moving Averages */}
            {/* SMA20 - highlighted in red when position is open, cyan otherwise */}
            <Line
              type='monotone'
              dataKey='sma20'
              stroke={positions.filter((pos) => pos.status === "open").length > 0 ? "#ff0000" : "#22d3ee"}
              strokeWidth={positions.filter((pos) => pos.status === "open").length > 0 ? 2.5 : 1.5}
              dot={false}
              isAnimationActive={false}
              strokeOpacity={1}
            />
            <Line
              type='monotone'
              dataKey='sma200'
              stroke='#facc15'
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              strokeOpacity={0.8}
            />

            {/* Candlesticks using custom shape */}
            <Bar
              dataKey='high'
              shape={(props: CandlestickRenderProps) =>
                renderCandlestick({ ...props, data, chartHeight: height, domainMin, domainMax })
              }
              isAnimationActive={false}
              fill='#transparent'
            />

            {/* Current Market Price Tracker */}
            <ReferenceLine
              y={currentPrice}
              stroke='#94a3b8'
              strokeDasharray='3 3'
              strokeWidth={1}
              label={{
                position: "right",
                value: `${currentPrice.toFixed(2)}`,
                fill: "#f8fafc",
                fontSize: 10,
                fontWeight: "bold",
                className: "font-mono bg-slate-900",
              }}
            />

            {/* Position Entry Markers */}
            {positions
              .filter((pos) => pos.status === "open")
              .map((pos) => (
                <ReferenceLine
                  key={pos.id}
                  y={pos.entryPrice}
                  stroke={pos.side === PositionSide.LONG ? "#10b981" : "#f43f5e"}
                  strokeWidth={2}
                  strokeOpacity={0.6}
                  label={{
                    position: "left",
                    value: `${pos.side} @${pos.entryPrice.toFixed(2)}`,
                    fill: pos.side === PositionSide.LONG ? "#10b981" : "#f43f5e",
                    fontSize: 9,
                  }}
                />
              ))}
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default Chart;
