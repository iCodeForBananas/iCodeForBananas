"use client";

import { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

const SEATTLE_CENTER: [number, number] = [47.6062, -122.3321];
const DEFAULT_ZOOM = 11;

interface CrimePoint {
  lat: number;
  lng: number;
  year: number;
  ts: number;
}

interface StatEntry {
  name: string;
  count: number;
}

interface HourEntry {
  hour: number;
  label: string;
  count: number;
}

interface DowEntry {
  day: string;
  count: number;
}

interface YearEntry {
  year: number;
  count: number;
}

interface CrimeStats {
  total: number;
  byCategory: StatEntry[];
  bySubCategory: StatEntry[];
  byNIBRS: StatEntry[];
  byNeighborhood: StatEntry[];
  byPrecinct: StatEntry[];
  byYear: YearEntry[];
  byHour: HourEntry[];
  byDayOfWeek: DowEntry[];
}

interface CrimeData {
  points: CrimePoint[];
  minYear: number;
  maxYear: number;
  stats: CrimeStats;
}

// ─── Color palettes ──────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  "PROPERTY CRIME": "#3b82f6",
  "Other": "#f59e0b",
  "VIOLENT CRIME": "#ef4444",
  "Not a Crime": "#6b7280",
};
const BAR_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#f97316", "#84cc16",
  "#e879f9", "#fb7185",
];
const PIE_COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#6b7280", "#10b981"];
const DOW_COLORS = ["#f59e0b", "#3b82f6", "#3b82f6", "#3b82f6", "#3b82f6", "#ef4444", "#ef4444"];

// ─── Tooltip styling ─────────────────────────────────────────────────────────
const darkTooltip = {
  contentStyle: { background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" },
  itemStyle: { color: "#94a3b8" },
  labelStyle: { color: "#f1f5f9", fontWeight: 600 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatter: (v: any) => (typeof v === "number" ? v.toLocaleString() : v),
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 flex flex-col gap-1 min-w-[160px]">
      <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold text-white">{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-gray-100 mb-3 flex items-center gap-2">
      <span className="w-1 h-5 bg-blue-500 rounded-full inline-block" />
      {children}
    </h2>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SPDCrimeDensityPage() {
  const [MapComponents, setMapComponents] = useState<{
    MapContainer: typeof import("react-leaflet").MapContainer;
    TileLayer: typeof import("react-leaflet").TileLayer;
  } | null>(null);

  const [crimeData, setCrimeData] = useState<CrimeData | null>(null);
  const [percent, setPercent] = useState<number>(50);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [map, setMap] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dotsLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);

  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet"), fetch("/api/spd-crime-data").then((r) => r.json())])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(([rlMod, lMod, data]: [any, any, CrimeData]) => {
        leafletRef.current = lMod.default ?? lMod;
        setMapComponents({ MapContainer: rlMod.MapContainer, TileLayer: rlMod.TileLayer });
        setCrimeData(data);
        setLoading(false);
      })
      .catch((err) => { console.error("Failed to load:", err); setLoading(false); });
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    if (!map || !crimeData || !leaflet) return;
    if (dotsLayerRef.current) { map.removeLayer(dotsLayerRef.current); dotsLayerRef.current = null; }

    const count = Math.ceil((percent / 100) * crimeData.points.length);
    const filtered = crimeData.points.slice(0, count);
    if (filtered.length === 0) return;

    const markers = filtered.map((p) =>
      leaflet.circleMarker([p.lat, p.lng], {
        radius: 2, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.6, weight: 1, opacity: 0.8,
      })
    );
    const group = leaflet.layerGroup(markers);
    group.addTo(map);
    dotsLayerRef.current = group;
  }, [crimeData, percent, map]);

  const stats = crimeData?.stats;
  const totalCount = crimeData?.points.length ?? 0;
  const shownCount = Math.ceil((percent / 100) * totalCount);

  // Derived stats for cards
  const topCrimeType = stats?.byNIBRS[0];
  const topNeighborhood = stats?.byNeighborhood[0];
  const topHour = stats
    ? stats.byHour.reduce((a, b) => (b.count > a.count ? b : a), stats.byHour[0])
    : null;
  const topDay = stats
    ? stats.byDayOfWeek.reduce((a, b) => (b.count > a.count ? b : a), stats.byDayOfWeek[0])
    : null;
  const propertyCrimePct = stats
    ? Math.round(((stats.byCategory.find((c) => c.name === "PROPERTY CRIME")?.count ?? 0) / stats.total) * 100)
    : 0;

  // Show only meaningful years (2024+) for year chart
  const recentYears = stats?.byYear.filter((y) => y.year >= 2024) ?? [];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <p className="text-gray-400 text-lg animate-pulse">Loading Seattle crime data...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-950 text-gray-100 min-h-full overflow-y-auto">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-5">
        <h1 className="text-2xl font-bold text-white">Seattle Crime Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">
          SPD incident data · {stats?.total.toLocaleString() ?? "—"} records ·{" "}
          Most recent through 2026
        </p>
      </div>

      <div className="px-6 py-6 space-y-8 max-w-[1600px] mx-auto">
        {/* ── Stat cards ──────────────────────────────────────────── */}
        {stats && (
          <div className="flex flex-wrap gap-4">
            <StatCard
              label="Total Incidents"
              value={stats.total.toLocaleString()}
              sub="in dataset"
            />
            <StatCard
              label="Property Crime"
              value={`${propertyCrimePct}%`}
              sub="of all incidents"
            />
            <StatCard
              label="Top Crime Type"
              value={topCrimeType?.count.toLocaleString() ?? "—"}
              sub={topCrimeType?.name ?? ""}
            />
            <StatCard
              label="Hottest Neighborhood"
              value={topNeighborhood?.count.toLocaleString() ?? "—"}
              sub={topNeighborhood?.name ?? ""}
            />
            <StatCard
              label="Peak Hour"
              value={topHour?.label ?? "—"}
              sub={`${topHour?.count.toLocaleString()} incidents`}
            />
            <StatCard
              label="Busiest Day"
              value={topDay?.day ?? "—"}
              sub={`${topDay?.count.toLocaleString()} incidents`}
            />
          </div>
        )}

        {/* ── Map ─────────────────────────────────────────────────── */}
        <div>
          <SectionTitle>Incident Map</SectionTitle>
          <div className="relative rounded-xl overflow-hidden border border-gray-800" style={{ height: 440 }}>
            {/* Map controls overlay */}
            <div className="absolute z-[1000] m-3 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-4">
              <label className="text-xs text-gray-300 whitespace-nowrap">Most recent:</label>
              <input
                type="range" min={1} max={100} value={percent}
                onChange={(e) => setPercent(parseInt(e.target.value))}
                className="w-44 accent-blue-500"
              />
              <span className="text-xs font-mono text-white w-8">{percent}%</span>
              <span className="text-xs text-gray-400">
                <span className="text-white font-semibold">{shownCount.toLocaleString()}</span> / {totalCount.toLocaleString()}
              </span>
            </div>
            {MapComponents ? (
              <MapComponents.MapContainer
                center={SEATTLE_CENTER}
                zoom={DEFAULT_ZOOM}
                style={{ height: "100%", width: "100%" }}
                ref={(inst) => { if (inst) setMap(inst); }}
              >
                <MapComponents.TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
              </MapComponents.MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center bg-gray-900">
                <p className="text-gray-500">Loading map…</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 1: Category pie + Top crime types bar ──────────── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category breakdown */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <SectionTitle>Crime Category Breakdown</SectionTitle>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={stats.byCategory}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    label={({ name, percent: p }) => `${name} ${((p ?? 0) * 100).toFixed(1)}%`}
                    labelLine={false}
                  >
                    {stats.byCategory.map((entry, i) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...darkTooltip} />
                  <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Top NIBRS crime types */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <SectionTitle>Top 10 Crime Types (NIBRS)</SectionTitle>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.byNIBRS} layout="vertical" margin={{ left: 180 }}>
                  <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <YAxis
                    type="category" dataKey="name" width={175}
                    tick={{ fill: "#d1d5db", fontSize: 11 }}
                    tickFormatter={(v: string) => v.length > 26 ? v.slice(0, 26) + "…" : v}
                  />
                  <Tooltip {...darkTooltip} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stats.byNIBRS.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Row 2: Top neighborhoods + Precincts ──────────────── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 15 neighborhoods */}
            <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
              <SectionTitle>Top 15 Neighborhoods by Incident Count</SectionTitle>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={stats.byNeighborhood} layout="vertical" margin={{ left: 195 }}>
                  <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <YAxis
                    type="category" dataKey="name" width={190}
                    tick={{ fill: "#d1d5db", fontSize: 11 }}
                    tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 28) + "…" : v}
                  />
                  <Tooltip {...darkTooltip} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stats.byNeighborhood.map((_, i) => <Cell key={i} fill={`hsl(${220 - i * 8}, 70%, ${60 - i * 1.5}%)`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Incidents by precinct */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <SectionTitle>Incidents by Precinct</SectionTitle>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={stats.byPrecinct} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <YAxis
                    type="category" dataKey="name" width={75}
                    tick={{ fill: "#d1d5db", fontSize: 12 }}
                  />
                  <Tooltip {...darkTooltip} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stats.byPrecinct.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Row 3: Hour of day + Day of week ──────────────────── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Crimes by hour */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <SectionTitle>Incidents by Hour of Day</SectionTitle>
              <p className="text-xs text-gray-500 mb-3">
                Peak around <span className="text-white font-semibold">{stats.byHour.reduce((a, b) => b.count > a.count ? b : a, stats.byHour[0]).label}</span> — 
                late-night crimes spike between midnight–2 AM
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={stats.byHour} margin={{ left: -20 }}>
                  <defs>
                    <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} interval={3} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <Tooltip {...darkTooltip} />
                  <Area
                    type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2}
                    fill="url(#hourGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Crimes by day of week */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <SectionTitle>Incidents by Day of Week</SectionTitle>
              <p className="text-xs text-gray-500 mb-3">
                <span className="text-white font-semibold">Fri–Sat</span> see the highest volume;
                weekends drive up crime rates
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stats.byDayOfWeek} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="day" tick={{ fill: "#d1d5db", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <Tooltip {...darkTooltip} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stats.byDayOfWeek.map((_, i) => <Cell key={i} fill={DOW_COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Row 4: Offense sub-categories + Year trend ─────────── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sub-category breakdown */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <SectionTitle>Offense Sub-Category Breakdown</SectionTitle>
              <p className="text-xs text-gray-500 mb-3">
                <span className="text-white font-semibold">Larceny-Theft</span> dominates at{" "}
                {Math.round(((stats.bySubCategory[0]?.count ?? 0) / stats.total) * 100)}% of all incidents
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.bySubCategory.slice(0, 10)} layout="vertical" margin={{ left: 265 }}>
                  <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <YAxis
                    type="category" dataKey="name" width={260}
                    tick={{ fill: "#d1d5db", fontSize: 10 }}
                    tickFormatter={(v: string) => v.length > 38 ? v.slice(0, 38) + "…" : v}
                  />
                  <Tooltip {...darkTooltip} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stats.bySubCategory.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Year trend */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <SectionTitle>Crime Trend by Year (2024–2026)</SectionTitle>
              <p className="text-xs text-gray-500 mb-3">
                Dataset spans primarily 2025–2026 patrol data.
                2026 figures are partial-year through Feb 2026.
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={recentYears} margin={{ left: -20 }}>
                  <defs>
                    <linearGradient id="yearGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="year" tick={{ fill: "#d1d5db", fontSize: 13 }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <Tooltip {...darkTooltip} />
                  <Line
                    type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={3}
                    dot={{ fill: "#8b5cf6", r: 5 }} activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Key Insights ─────────────────────────────────────────── */}
        {stats && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <SectionTitle>Key Insights</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-gray-300">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-blue-400 font-semibold mb-1">🔎 Property Crime Dominates</div>
                <p>{propertyCrimePct}% of all incidents are property crimes. Theft from motor vehicles alone accounts for ~20% of all crime.</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-yellow-400 font-semibold mb-1">📍 Capitol Hill Hotspot</div>
                <p>Capitol Hill and Queen Anne are the top two neighborhoods by incident count, together representing over 15% of all reported crimes.</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-purple-400 font-semibold mb-1">🌙 Late-Night Spike</div>
                <p>Incidents spike sharply at 1 AM with {stats.byHour[1]?.count.toLocaleString()} reports — the highest single hour — likely reflecting delayed reporting and nightlife activity.</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-red-400 font-semibold mb-1">📅 Weekend Effect</div>
                <p>Fridays ({stats.byDayOfWeek.find(d => d.day === "Fri")?.count.toLocaleString()}) and Saturdays ({stats.byDayOfWeek.find(d => d.day === "Sat")?.count.toLocaleString()}) consistently record the highest incident counts each week.</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-green-400 font-semibold mb-1">🏙️ North Precinct Leads</div>
                <p>North Precinct has the most incidents ({stats.byPrecinct.find(p => p.name === "North")?.count.toLocaleString() ?? "—"}), followed by West. Together they account for over 60% of all records.</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-pink-400 font-semibold mb-1">🚗 Vehicle Targets</div>
                <p>Combining Theft From Motor Vehicle, Motor Vehicle Theft, and Parts/Accessories theft = over 5,700 vehicle-related incidents (28%+ of all crimes).</p>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-600 pb-4">
          Data sourced from Seattle Police Department public records. Incidents with redacted or invalid coordinates (~15%) are excluded from the map but included in all charts.
        </p>
      </div>
    </div>
  );
}

