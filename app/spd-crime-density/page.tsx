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
    <div className='flex flex-col flex-1'>
      <Navigation />
      <main className='px-4 py-6 flex-1'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
            <h1 className='text-2xl font-bold mb-4'>SPD Crime Density</h1>
            {MapComponents ? (
              <MapComponents.MapContainer
                center={SEATTLE_CENTER}
                zoom={DEFAULT_ZOOM}
                style={{ height: "600px", width: "100%" }}
                className='rounded-lg border border-gray-200'
              >
                <MapComponents.TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                  maxZoom={19}
                />
              </MapComponents.MapContainer>
            ) : (
              <div
                style={{ height: "600px", width: "100%" }}
                className='rounded-lg border border-gray-200 flex items-center justify-center bg-gray-50'
              >
                <p className='text-gray-500'>Loading map...</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
