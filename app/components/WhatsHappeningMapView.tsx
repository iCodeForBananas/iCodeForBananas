"use client";

import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import { WhatsHappeningEvent } from "./WhatsHappeningTypes";
import { EVENT_SOURCES } from "@/app/lib/eventSources";

const SOURCE_COORDS = Object.fromEntries(
  EVENT_SOURCES.filter((s) => s.lat != null).map((s) => [s.label, { lat: s.lat!, lng: s.lng! }])
);

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
      <div className="flex items-center justify-center bg-black border-2 border-yellow-400/30 h-full w-full">
        <p className="text-yellow-400 font-bold uppercase tracking-widest">🍌 Loading map…</p>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup, leaflet: L } = MapComponents;

  return (
    <MapContainer
      center={SEATTLE_CENTER}
      zoom={12}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {events.filter((e) => SOURCE_COORDS[e.source ?? ""] != null).map((event) => {
        const coords = SOURCE_COORDS[event.source ?? ""];
        const icon = L.divIcon({
          html: `<div style="width:36px;height:36px;background:#facc15;border:2px solid black;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:4px 4px 0px rgba(0,0,0,1);">📍</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const firstSentenceMatch = event.description?.match(/^[^.!?]+[.!?]/);
        const shortDescription = firstSentenceMatch ? firstSentenceMatch[0] : (event.description ?? "");

        return (
          <Marker key={event.id} position={[coords.lat, coords.lng]} icon={icon}>
            <Popup>
              <div className="text-sm" style={{ background: '#000', color: '#facc15', border: '2px solid #facc15', padding: '8px', minWidth: '160px' }}>
                <p style={{ fontWeight: 900, color: '#facc15', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{event.name}</p>
                <p style={{ color: '#ca8a04', marginBottom: '2px' }}>{event.venue}</p>
                <p style={{ color: '#ca8a04', marginBottom: '2px' }}>🕐 {event.time}</p>
                <p style={{ color: '#facc15', fontWeight: 700, marginBottom: '4px' }}>
                  {event.price ? `$${event.price} cover` : 'Free'}
                </p>
                <p style={{ color: '#854d0e', fontSize: '11px' }}>{shortDescription}</p>
                {event.eventUrl && (
                  <a href={event.eventUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#facc15', fontSize: '11px', display: 'block', marginTop: '4px' }}>View event →</a>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
