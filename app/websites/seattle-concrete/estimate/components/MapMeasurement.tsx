"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { Ruler, Trash2, Map as MapIcon } from "lucide-react";

interface MapMeasurementProps {
  onAreaChange: (area: number) => void;
  onScreenshot: (dataUrl: string) => void;
  initialArea?: number;
}

const DrawingManager = ({ onAreaChange }: { onAreaChange: (area: number) => void }) => {
  const map = useMap();
  const drawingLib = useMapsLibrary("drawing");
  const geometryLib = useMapsLibrary("geometry");
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null);
  const [polygon, setPolygon] = useState<google.maps.Polygon | null>(null);

  useEffect(() => {
    if (!drawingLib || !map) return;

    const dm = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.POLYGON,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [google.maps.drawing.OverlayType.POLYGON],
      },
      polygonOptions: {
        fillColor: "#F27D26",
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: "#F27D26",
        clickable: true,
        editable: true,
        zIndex: 1,
      },
    });

    dm.setMap(map);
    setDrawingManager(dm);

    const listener = google.maps.event.addListener(dm, "overlaycomplete", (event: { type: string; overlay: google.maps.Polygon }) => {
      if (event.type === google.maps.drawing.OverlayType.POLYGON) {
        const newPolygon = event.overlay;
        if (polygon) polygon.setMap(null);
        setPolygon(newPolygon);
        dm.setDrawingMode(null);

        const calculateArea = () => {
          if (geometryLib) {
            const area = geometryLib.spherical.computeArea(newPolygon.getPath());
            onAreaChange(Math.round(area * 10.7639));
          }
        };

        calculateArea();
        google.maps.event.addListener(newPolygon.getPath(), "set_at", calculateArea);
        google.maps.event.addListener(newPolygon.getPath(), "insert_at", calculateArea);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
      dm.setMap(null);
    };
  }, [drawingLib, map, geometryLib, onAreaChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearPolygon = () => {
    if (polygon) {
      polygon.setMap(null);
      setPolygon(null);
      onAreaChange(0);
      if (drawingManager) {
        drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      }
    }
  };

  return (
    <div className="absolute top-4 right-4 z-10">
      <button
        onClick={clearPolygon}
        className="p-3 bg-white text-brand-primary rounded-lg shadow-lg hover:bg-brand-bg transition-colors flex items-center gap-2 font-medium text-xs"
      >
        <Trash2 size={16} />
        Clear Measurement
      </button>
    </div>
  );
};

export const MapMeasurement: React.FC<MapMeasurementProps> = ({
  onAreaChange,
  onScreenshot,
  initialArea,
}) => {
  const [apiKey, setApiKey] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("GOOGLE_MAPS_API_KEY") || "" : "",
  );
  const [showKeyInput, setShowKeyInput] = useState(!apiKey);
  const [mapTypeId, setMapTypeId] = useState<"satellite" | "roadmap">("satellite");

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("GOOGLE_MAPS_API_KEY", apiKey);
    setShowKeyInput(false);
    window.location.reload();
  };

  if (showKeyInput) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-white rounded-2xl shadow-2xl border border-brand-primary/10 flex flex-col items-center justify-center p-8 text-center">
        <MapIcon size={48} className="text-brand-accent mb-4" />
        <h3 className="text-lg font-bold mb-2 text-brand-primary">Google Maps API Key Required</h3>
        <p className="text-sm text-brand-primary/60 mb-6 max-w-md">
          To use the satellite measurement tool, enter a Google Maps API Key with the Maps
          JavaScript API enabled.
        </p>
        <form onSubmit={handleSaveKey} className="w-full max-w-sm">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API Key"
            className="ppp-input-field mb-4"
            required
          />
          <button type="submit" className="ppp-btn-primary w-full">
            Initialize Map
          </button>
        </form>
        <a
          href="https://developers.google.com/maps/documentation/javascript/get-api-key"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-accent hover:underline mt-4"
        >
          How to get an API Key →
        </a>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-brand-bg rounded-2xl shadow-2xl border border-brand-primary/10">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        {(["satellite", "roadmap"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setMapTypeId(type)}
            className={`px-3 py-1.5 rounded-lg shadow-lg text-xs font-bold transition-all capitalize ${
              mapTypeId === type
                ? "bg-brand-primary text-white"
                : "bg-white text-brand-primary hover:bg-brand-bg"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={{ lat: 47.2529, lng: -122.4443 }}
          defaultZoom={12}
          mapTypeId={mapTypeId}
          tilt={0}
          heading={0}
          gestureHandling="greedy"
          disableDefaultUI={true}
          className="w-full h-full"
        >
          <DrawingManager onAreaChange={onAreaChange} />
        </Map>
      </APIProvider>

      <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-lg border border-brand-primary/10 shadow-lg">
        <div className="flex items-center gap-2 text-brand-primary">
          <Ruler size={16} className="text-brand-accent" />
          <span className="text-[10px] uppercase tracking-widest font-bold">Measured Area</span>
        </div>
        <div className="text-2xl font-mono font-bold mt-1 text-brand-primary">
          {initialArea?.toLocaleString() || 0}{" "}
          <span className="text-sm font-normal text-brand-primary/40">SQ FT</span>
        </div>
      </div>
    </div>
  );
};
