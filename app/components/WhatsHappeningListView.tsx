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
    <span style={{ background: '#1A1B1E', color: '#12B886', border: '1px solid #373A40' }} className="text-xs font-bold px-2 py-0.5">
      ${price} cover
    </span>
  );
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span style={{ background: 'rgba(18,184,134,0.1)', color: '#12B886', border: '1px solid rgba(18,184,134,0.2)' }} className="text-xs px-2 py-0.5">{category}</span>
  );
}

export default function WhatsHappeningListView({ events, selectedEventId, onSelectEvent }: Props) {
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const handleCardClick = (id: string) => {
    onSelectEvent(id);
    setMobileDetailOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 relative">
      <div className="w-full md:w-2/5 flex-shrink-0 overflow-y-auto flex flex-col gap-2 p-3" style={{ background: '#1A1B1E', borderRight: '1px solid #373A40' }}>
        {events.map((event) => {
          const isSelected = event.id === selectedEventId;
          return (
            <button
              key={event.id}
              onClick={() => handleCardClick(event.id)}
              className="w-full text-left p-3 transition-all focus:outline-none"
              style={{
                background: isSelected ? 'rgba(18,184,134,0.1)' : '#25262B',
                border: isSelected ? '1px solid #12B886' : '1px solid #373A40',
                borderLeftWidth: isSelected ? '4px' : '1px',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate uppercase tracking-wide text-sm" style={{ color: '#F8F9FA' }}>{event.name}</p>
                  <p className="text-xs truncate" style={{ color: '#909296' }}>{event.venue}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {event.date && (
                      <span className="text-xs" style={{ color: '#909296' }}>
                        📅 {new Date(event.date.length === 10 ? event.date + 'T00:00:00' : event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {event.time && <span className="text-xs flex items-center gap-1" style={{ color: '#909296' }}>🕐 {event.time}</span>}
                    <PriceBadge price={event.price} />
                    <CategoryPill category={event.category} />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="hidden md:flex flex-1 overflow-y-auto p-6 flex-col" style={{ background: '#1A1B1E' }}>
        {selectedEvent ? (
          <DetailPanel event={selectedEvent} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-center" style={{ color: '#909296' }}>
            <div>
              <p className="text-4xl mb-3">🍌</p>
              <p className="text-lg font-black uppercase tracking-widest" style={{ color: '#F8F9FA' }}>Pick an event</p>
              <p className="text-sm mt-1">Select any event from the list on the left</p>
            </div>
          </div>
        )}
      </div>

      {mobileDetailOpen && selectedEvent && (
        <div className="md:hidden fixed inset-0 z-50 overflow-y-auto" style={{ background: '#1A1B1E' }}>
          <div className="p-4">
            <button onClick={() => setMobileDetailOpen(false)} className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest" style={{ color: '#12B886' }}>
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
      <h2 className="text-2xl font-black uppercase tracking-widest mb-2" style={{ color: '#F8F9FA' }}>{event.name}</h2>
      <div className="flex items-center gap-2 mb-4">
        <span style={{ background: 'rgba(18,184,134,0.1)', color: '#12B886', border: '1px solid rgba(18,184,134,0.3)' }} className="text-xs font-bold px-2 py-0.5 uppercase tracking-widest">{event.category}</span>
      </div>
      <div className="space-y-2 mb-4 text-sm" style={{ color: '#909296' }}>
        <p className="flex items-center gap-2"><span className="text-base">📍</span><span className="font-bold" style={{ color: '#F8F9FA' }}>{event.venue}</span></p>
        <p className="flex items-center gap-2">
          <span className="text-base">🕐</span>
          <span>
            {event.date
              ? (() => {
                  const hasTime = event.date.includes('T') || event.time != null;
                  const datePart = new Date(event.date.length === 10 ? event.date + 'T00:00:00' : event.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
                  const timePart = hasTime && event.date.includes('T') ? new Date(event.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : event.time;
                  return timePart ? `${datePart} · ${timePart}` : datePart;
                })()
              : (event.time ?? '')}
          </span>
        </p>
        {event.price != null && (
          <p className="flex items-center gap-2"><span className="text-base">💰</span><span className="font-bold" style={{ color: '#12B886' }}>${event.price} cover</span></p>
        )}
      </div>
      <p className="leading-relaxed mb-6" style={{ color: '#909296' }}>{event.description}</p>
      <div className="flex gap-3 flex-wrap">
        {event.eventUrl && (
          <a href={event.eventUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 font-bold uppercase tracking-widest text-sm transition-all"
            style={{ background: '#4C6EF5', color: '#F8F9FA', border: '1px solid #4C6EF5' }}>
            🎟️ Event Page
          </a>
        )}
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 font-bold uppercase tracking-widest text-sm transition-all"
          style={{ background: 'transparent', color: '#F8F9FA', border: '1px solid #373A40' }}>
          🗺️ Directions
        </a>
      </div>
    </div>
  );
}
