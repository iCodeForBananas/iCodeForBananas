'use client';

import { useState } from 'react';
import { WhatsHappeningEvent } from './WhatsHappeningTypes';
import { EVENT_SOURCES } from '@/app/lib/eventSources';

const SOURCE_COORDS = Object.fromEntries(
  EVENT_SOURCES.filter((s) => s.lat != null).map((s) => [s.label, { lat: s.lat!, lng: s.lng! }]),
);

interface Props {
  events: WhatsHappeningEvent[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
}

function PriceBadge({ price }: { price: number | null }) {
  if (!price) return null;
  return (
    <span className="bg-black text-yellow-400 border border-yellow-400/40 text-xs font-bold px-2 py-0.5">
      ${price} cover
    </span>
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
                  ? 'border-yellow-400 bg-yellow-400/10 border-l-4'
                  : 'border-yellow-400/20 bg-black hover:bg-yellow-400/5 hover:border-yellow-400/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-yellow-400 truncate uppercase tracking-wide text-sm">{event.name}</p>
                  <p className="text-xs text-yellow-600 truncate">{event.venue}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {event.date && (
                      <span className="text-xs text-yellow-600">
                        📅 {new Date(event.date.length === 10 ? event.date + 'T00:00:00' : event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {event.time && (
                      <span className="text-xs text-yellow-600 flex items-center gap-1">🕐 {event.time}</span>
                    )}
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
  const coords = event.source ? SOURCE_COORDS[event.source] : null;
  const directionsUrl = coords
    ? `https://maps.google.com/?q=${coords.lat},${coords.lng}`
    : `https://maps.google.com/?q=${encodeURIComponent(event.address ?? '')}`;
  return (
    <div className="max-w-lg">
      <h2 className="text-2xl font-black uppercase tracking-widest text-yellow-400 mb-2">{event.name}</h2>
      <div className="flex items-center gap-2 mb-4">
        <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 text-xs font-bold px-2 py-0.5 uppercase tracking-widest">
          {event.category}
        </span>
      </div>
      <div className="space-y-2 mb-4 text-sm text-yellow-600">
        <p className="flex items-center gap-2">
          <span className="text-base">📍</span>
          <span>
            <span className="font-bold text-yellow-400">{event.venue}</span>
          </span>
        </p>
        <p className="flex items-center gap-2">
          <span className="text-base">🕐</span>
          <span>
            {event.date
              ? (() => {
                  const hasTime = event.date.includes('T') || event.time != null;
                  const datePart = new Date(
                    event.date.length === 10 ? event.date + 'T00:00:00' : event.date,
                  ).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
                  const timePart =
                    hasTime && event.date.includes('T')
                      ? new Date(event.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                      : event.time;
                  return timePart ? `${datePart} · ${timePart}` : datePart;
                })()
              : (event.time ?? '')}
          </span>
        </p>
        {event.price != null && (
          <p className="flex items-center gap-2">
            <span className="text-base">💰</span>
            <span className="font-bold text-yellow-400">${event.price} cover</span>
          </p>
        )}
      </div>
      <p className="text-yellow-600 leading-relaxed mb-6">{event.description}</p>
      <div className="flex gap-3 flex-wrap">
        {event.eventUrl && (
          <a
            href={event.eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-400 text-black font-black uppercase tracking-widest border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all text-sm"
          >
            🎟️ Event Page
          </a>
        )}
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-400 text-black font-black uppercase tracking-widest border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all text-sm"
        >
          🗺️ Directions
        </a>
      </div>
    </div>
  );
}
