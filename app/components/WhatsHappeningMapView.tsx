"use client";

import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import { WhatsHappeningEvent } from "./WhatsHappeningTypes";

interface Props {
  events: WhatsHappeningEvent[];
}

const SEATTLE_CENTER: [number, number] = [47.6062, -122.3321];

export default function WhatsHappeningMapView({ events }: Props) {
  const [MapComponents, setMapComponents] = useState<{
    MapContainer: typeof import("react-leaflet").MapContainer;
    TileLayer: typeof import("react-leaflet").TileLayer;
    Marker: typeof import("react-leaflet").Marker;
    Popup: typeof import("react-leaflet").Popup;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leaflet: any;
  } | null>(null);

  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet")])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(([rlMod, lMod]: [any, any]) => {
        const L = lMod.default ?? lMod;
        setMapComponents({
          MapContainer: rlMod.MapContainer,
          TileLayer: rlMod.TileLayer,
          Marker: rlMod.Marker,
          Popup: rlMod.Popup,
          leaflet: L,
        });
      })
      .catch((err) => console.error("Failed to load map:", err));
  }, []);

  if (!MapComponents) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-lg" style={{ height: "500px" }}>
        <p className="text-gray-500">Loading map…</p>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup, leaflet: L } = MapComponents;

  return (
    <MapContainer
      center={SEATTLE_CENTER}
      zoom={12}
      style={{ height: "500px", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {events.map((event) => {
        const icon = L.divIcon({
          html: `<div style="width:36px;height:36px;background:white;border:2px solid #e5e7eb;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${event.imageEmoji}</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const firstSentenceMatch = event.description.match(/^[^.!?]+[.!?]/);
        const shortDescription = firstSentenceMatch ? firstSentenceMatch[0] : event.description;
        const priceLabel = event.price ? `$${event.price} cover` : "Free";

        return (
          <Marker key={event.id} position={[event.lat, event.lng]} icon={icon}>
            <Popup>
              <div className="text-sm">
                <p className="font-bold text-gray-900 mb-1">{event.name}</p>
                <p className="text-gray-600 mb-0.5">{event.venue}</p>
                <p className="text-gray-600 mb-0.5">🕐 {event.time}</p>
                <p className="text-gray-600 mb-1">
                  {event.price ? (
                    <span className="text-amber-700 font-semibold">{priceLabel}</span>
                  ) : (
                    <span className="text-green-700 font-semibold">{priceLabel}</span>
                  )}
                </p>
                <p className="text-gray-500 text-xs">{shortDescription}</p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
