"use client";

import { useState } from "react";
import { WhatsHappeningEvent } from "./WhatsHappeningTypes";

interface Props {
  events: WhatsHappeningEvent[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
}

function PriceBadge({ price }: { price: number | null }) {
  if (!price) {
    return (
      <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">Free</span>
    );
  }
  return (
    <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">${price} cover</span>
  );
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{category}</span>
  );
}

export default function WhatsHappeningListView({ events, selectedEventId, onSelectEvent }: Props) {
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const handleCardClick = (id: string) => {
    onSelectEvent(id);
    setMobileDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setMobileDetailOpen(false);
  };

  return (
    <div className="flex h-full min-h-0 relative">
      {/* Left panel — scrollable list */}
      <div className="w-full md:w-2/5 flex-shrink-0 overflow-y-auto border-r border-gray-200 flex flex-col gap-2 p-3">
        {events.map((event) => {
          const isSelected = event.id === selectedEventId;
          return (
            <button
              key={event.id}
              onClick={() => handleCardClick(event.id)}
              className={`w-full text-left rounded-lg border shadow-sm p-3 transition-all hover:shadow-md focus:outline-none ${
                isSelected
                  ? "border border-gray-200 border-l-4 border-l-pink-400 bg-pink-50"
                  : "border border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-pink-100 to-orange-100 flex items-center justify-center text-xl">
                  {event.imageEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{event.name}</p>
                  <p className="text-sm text-gray-500 truncate">{event.venue}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      🕐 {event.time}
                    </span>
                    <PriceBadge price={event.price} />
                    <CategoryPill category={event.category} />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Right panel — detail (desktop) */}
      <div className="hidden md:flex flex-1 overflow-y-auto p-6 flex-col">
        {selectedEvent ? (
          <DetailPanel event={selectedEvent} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-center">
            <div>
              <p className="text-4xl mb-3">📋</p>
              <p className="text-lg font-medium">Click an event to see details</p>
              <p className="text-sm mt-1">Select any event from the list on the left</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile detail overlay */}
      {mobileDetailOpen && selectedEvent && (
        <div className="md:hidden fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="p-4">
            <button
              onClick={handleCloseDetail}
              className="mb-4 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to list
            </button>
            <DetailPanel event={selectedEvent} />
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ event }: { event: WhatsHappeningEvent }) {
  const directionsUrl = `https://maps.google.com/?q=${encodeURIComponent(event.address)}`;
  return (
    <div className="max-w-lg">
      <div className="text-6xl mb-4">{event.imageEmoji}</div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{event.name}</h2>
      <div className="flex items-center gap-2 mb-4">
        <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{event.category}</span>
      </div>
      <div className="space-y-2 mb-4 text-sm text-gray-700">
        <p className="flex items-center gap-2">
          <span className="text-base">📍</span>
          <span>
            <span className="font-medium">{event.venue}</span> — {event.address}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <span className="text-base">🕐</span>
          <span>{event.time}</span>
        </p>
        <p className="flex items-center gap-2">
          <span className="text-base">💰</span>
          <span className="font-medium">
            {event.price ? `$${event.price} cover` : "Free admission"}
          </span>
        </p>
      </div>
      <p className="text-gray-700 leading-relaxed mb-6">{event.description}</p>
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-pink-100 to-orange-100 hover:from-pink-200 hover:to-orange-200 text-gray-900 font-semibold rounded-lg border border-pink-200 transition-colors"
      >
        🗺️ Directions
      </a>
    </div>
  );
}
