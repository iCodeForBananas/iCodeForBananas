'use client';

import { useState } from 'react';
import { WhatsHappeningEvent } from './WhatsHappeningTypes';
import WhatsHappeningListView from './WhatsHappeningListView';
import WhatsHappeningMapView from './WhatsHappeningMapView';

type ViewMode = 'list' | 'map';

export default function WhatsHappeningClient({ events }: { events: WhatsHappeningEvent[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const today = new Intl.DateTimeFormat('en-CA').format(new Date()); // YYYY-MM-DD in local time
  const todayEvents = events.filter((e) => e.date?.startsWith(today) || e.date?.slice(0, 10) === today);

  return (
    <div className="flex flex-col h-full bg-black text-yellow-400">
      <div className="px-6 pt-6 pb-4 border-b-2 border-yellow-400">
        <h1 className="text-2xl font-black uppercase tracking-widest text-yellow-400">What&apos;s Happening Today?</h1>
        <div className="flex gap-1 mt-4 bg-yellow-400/10 border border-yellow-400/30 p-1 rounded-none w-fit">
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-1.5 text-sm font-bold uppercase tracking-widest transition-colors ${viewMode === 'list' ? 'bg-yellow-400 text-black' : 'text-yellow-400 hover:bg-yellow-400/20'}`}
          >
            📋 List
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`px-4 py-1.5 text-sm font-bold uppercase tracking-widest transition-colors ${viewMode === 'map' ? 'bg-yellow-400 text-black' : 'text-yellow-400 hover:bg-yellow-400/20'}`}
          >
            🗺️ Map
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'list' ? (
          <WhatsHappeningListView
            events={todayEvents}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
          />
        ) : (
          <div style={{ height: 'calc(100vh - 130px)' }}>
            <WhatsHappeningMapView events={todayEvents} />
          </div>
        )}
      </div>
    </div>
  );
}
