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
      <span className="bg-yellow-400/20 text-yellow-400 border border-yellow-400/40 text-xs font-bold px-2 py-0.5">Free</span>
    );
  }
  return (
    <span className="bg-black text-yellow-400 border border-yellow-400/40 text-xs font-bold px-2 py-0.5">${price} cover</span>
  );
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 text-xs px-2 py-0.5">{category}</span>
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
      <div className="w-full md:w-2/5 flex-shrink-0 overflow-y-auto border-r-2 border-yellow-400/30 flex flex-col gap-2 p-3 bg-black">
        {events.map((event) => {
          const isSelected = event.id === selectedEventId;
          return (
            <button
              key={event.id}
              onClick={() => handleCardClick(event.id)}
              className={`w-full text-left border p-3 transition-all focus:outline-none ${
                isSelected
                  ? "border-yellow-400 bg-yellow-400/10 border-l-4"
                  : "border-yellow-400/20 bg-black hover:bg-yellow-400/5 hover:border-yellow-400/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-yellow-400 flex items-center justify-center text-xl">
                  {event.imageEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-yellow-400 truncate uppercase tracking-wide text-sm">{event.name}</p>
                  <p className="text-xs text-yellow-600 truncate">{event.venue}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-xs text-yellow-600 flex items-center gap-1">
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
      <div className="hidden md:flex flex-1 overflow-y-auto p-6 flex-col bg-black">
        {selectedEvent ? (
          <DetailPanel event={selectedEvent} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-yellow-600 text-center">
            <div>
              <p className="text-4xl mb-3">🍌</p>
              <p className="text-lg font-black uppercase tracking-widest text-yellow-400">Pick an event</p>
              <p className="text-sm mt-1">Select any event from the list on the left</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile detail overlay */}
      {mobileDetailOpen && selectedEvent && (
        <div className="md:hidden fixed inset-0 z-50 bg-black overflow-y-auto">
          <div className="p-4">
            <button
              onClick={handleCloseDetail}
              className="mb-4 flex items-center gap-2 text-sm text-yellow-400 font-bold uppercase tracking-widest hover:text-white"
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
      <h2 className="text-2xl font-black uppercase tracking-widest text-yellow-400 mb-2">{event.name}</h2>
      <div className="flex items-center gap-2 mb-4">
        <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 text-xs font-bold px-2 py-0.5 uppercase tracking-widest">{event.category}</span>
      </div>
      <div className="space-y-2 mb-4 text-sm text-yellow-600">
        <p className="flex items-center gap-2">
          <span className="text-base">📍</span>
          <span><span className="font-bold text-yellow-400">{event.venue}</span> — {event.address}</span>
        </p>
        <p className="flex items-center gap-2">
          <span className="text-base">🕐</span>
          <span>{event.time}</span>
        </p>
        <p className="flex items-center gap-2">
          <span className="text-base">💰</span>
          <span className="font-bold text-yellow-400">
            {event.price ? `$${event.price} cover` : "Free admission"}
          </span>
        </p>
      </div>
      <p className="text-yellow-600 leading-relaxed mb-6">{event.description}</p>
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-400 text-black font-black uppercase tracking-widest border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all text-sm"
      >
        🗺️ Directions
      </a>
    </div>
  );
}
