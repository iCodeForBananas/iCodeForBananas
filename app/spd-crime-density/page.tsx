"use client";

import { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";

const SEATTLE_CENTER: [number, number] = [47.6062, -122.3321];
const DEFAULT_ZOOM = 11;

interface CrimePoint {
  lat: number;
  lng: number;
  year: number;
}

interface CrimeData {
  points: CrimePoint[];
  minYear: number;
  maxYear: number;
}

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

  // Load react-leaflet, leaflet, and crime data on mount
  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet"), fetch("/api/spd-crime-data").then((res) => res.json())])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(([rlMod, lMod, data]: [any, any, CrimeData]) => {
        leafletRef.current = lMod.default ?? lMod;
        setMapComponents({
          MapContainer: rlMod.MapContainer,
          TileLayer: rlMod.TileLayer,
        });
        setCrimeData(data);
        setPercent(50);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load:", err);
        setLoading(false);
      });
  }, []);

  // Update dot markers whenever percent, crimeData, or map change
  useEffect(() => {
    const leaflet = leafletRef.current;
    if (!map || !crimeData || !leaflet) return;

    // Remove existing dots layer
    if (dotsLayerRef.current) {
      map.removeLayer(dotsLayerRef.current);
      dotsLayerRef.current = null;
    }

    // Take the most recent N% of records (already sorted most recent first)
    const count = Math.ceil((percent / 100) * crimeData.points.length);
    const filtered = crimeData.points.slice(0, count);

    if (filtered.length === 0) return;

    const markers = filtered.map((p) =>
      leaflet.circleMarker([p.lat, p.lng], {
        radius: 2,
        color: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 0.6,
        weight: 1,
        opacity: 0.8,
      }),
    );

    const group = leaflet.layerGroup(markers);
    group.addTo(map);
    dotsLayerRef.current = group;
  }, [crimeData, percent, map]);

  const totalCount = crimeData ? crimeData.points.length : 0;
  const shownCount = crimeData ? Math.ceil((percent / 100) * totalCount) : 0;

  return (
    <div className='flex flex-col h-full overflow-hidden'>
      {/* Year range slider controls */}
      {crimeData && (
        <div className='bg-gray-900 border-b border-gray-700 px-4 py-3'>
          <div className='flex items-center gap-6 flex-wrap'>
            <div className='flex items-center gap-3'>
              <label className='text-sm font-medium text-gray-300 whitespace-nowrap'>Most recent:</label>
              <input
                type='range'
                min={1}
                max={100}
                value={percent}
                onChange={(e) => setPercent(parseInt(e.target.value))}
                className='w-56 accent-blue-500'
              />
              <span className='text-sm font-mono text-white w-10'>{percent}%</span>
            </div>
            <span className='text-sm text-gray-400'>
              Showing <span className='text-white font-semibold'>{shownCount.toLocaleString()}</span> of{" "}
              {totalCount.toLocaleString()} incidents
            </span>
          </div>
        </div>
      )}

      <main className='flex-1 min-h-0 overflow-hidden'>
        {MapComponents && !loading ? (
          <MapComponents.MapContainer
            center={SEATTLE_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: "100%", width: "100%" }}
            ref={(mapInstance) => {
              if (mapInstance) {
                setMap(mapInstance);
              }
            }}
          >
            <MapComponents.TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              maxZoom={19}
            />
          </MapComponents.MapContainer>
        ) : (
          <div style={{ height: "100%", width: "100%" }} className='flex items-center justify-center bg-gray-900'>
            <p className='text-gray-400'>Loading map & crime data...</p>
          </div>
        )}
      </main>
    </div>
  );
}
