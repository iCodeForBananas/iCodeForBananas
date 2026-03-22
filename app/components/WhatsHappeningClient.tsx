'use client';

import { useState } from 'react';
import { WhatsHappeningEvent } from './WhatsHappeningTypes';
import WhatsHappeningListView from './WhatsHappeningListView';
import WhatsHappeningMapView from './WhatsHappeningMapView';

type ViewMode = 'list' | 'map';

export default function WhatsHappeningClient({ events }: { events: WhatsHappeningEvent[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const today = new Intl.DateTimeFormat('en-CA').format(new Date());
  const todayEvents = events.filter((e) => e.date?.startsWith(today) || e.date?.slice(0, 10) === today);

  return (
    <div className="flex flex-col h-full" style={{ background: '#1A1B1E', color: '#F8F9FA' }}>
      <div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid #373A40' }}>
        <h1 className="text-2xl font-black uppercase tracking-widest" style={{ color: '#F8F9FA' }}>What&apos;s Happening Today?</h1>
        <div className="flex gap-1 mt-4 p-1 w-fit" style={{ background: 'rgba(18,184,134,0.1)', border: '1px solid #373A40' }}>
          <button
            onClick={() => setViewMode('list')}
            className="px-4 py-1.5 text-sm font-bold uppercase tracking-widest transition-colors"
            style={viewMode === 'list' ? { background: '#12B886', color: '#1A1B1E' } : { color: '#F8F9FA' }}
          >
            📋 List
          </button>
          <button
            onClick={() => setViewMode('map')}
            className="px-4 py-1.5 text-sm font-bold uppercase tracking-widest transition-colors"
            style={viewMode === 'map' ? { background: '#12B886', color: '#1A1B1E' } : { color: '#F8F9FA' }}
          >
            🗺️ Map
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'list' ? (
          <WhatsHappeningListView events={todayEvents} selectedEventId={selectedEventId} onSelectEvent={setSelectedEventId} />
        ) : (
          <div style={{ height: 'calc(100vh - 130px)' }}>
            <WhatsHappeningMapView events={todayEvents} />
          </div>
        )}
      </div>
    </div>
  );
}
