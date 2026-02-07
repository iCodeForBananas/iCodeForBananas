"use client";

import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import Navigation from "../components/Navigation";

const SEATTLE_CENTER: [number, number] = [47.6062, -122.3321];
const DEFAULT_ZOOM = 12;

export default function SPDCrimeDensityPage() {
  const [MapComponents, setMapComponents] = useState<{
    MapContainer: typeof import("react-leaflet").MapContainer;
    TileLayer: typeof import("react-leaflet").TileLayer;
  } | null>(null);

  useEffect(() => {
    import("react-leaflet").then((mod) => {
      setMapComponents({
        MapContainer: mod.MapContainer,
        TileLayer: mod.TileLayer,
      });
    });
  }, []);

  return (
    <div className='flex flex-col h-screen overflow-hidden'>
      <Navigation />
      <main className='flex-1 overflow-hidden'>
        {MapComponents ? (
          <MapComponents.MapContainer
            center={SEATTLE_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: "100%", width: "100%" }}
          >
            <MapComponents.TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              maxZoom={19}
            />
          </MapComponents.MapContainer>
        ) : (
          <div
            style={{ height: "100%", width: "100%" }}
            className='flex items-center justify-center bg-gray-50'
          >
            <p className='text-gray-500'>Loading map...</p>
          </div>
        )}
      </main>
    </div>
  );
}
