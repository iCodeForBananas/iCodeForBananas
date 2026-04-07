'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface LogEntry {
  id: string;
  exercise: string;
  date: string;
  weight?: number;
}

const COMPOUND: { name: string; type: 'weighted' | 'bodyweight' }[] = [
  { name: 'Bench Press', type: 'weighted' },
  { name: 'Squat', type: 'weighted' },
  { name: 'Deadlift', type: 'weighted' },
  { name: 'Overhead Press', type: 'weighted' },
  { name: 'Barbell Row', type: 'weighted' },
  { name: 'Pull-ups', type: 'bodyweight' },
  { name: 'Dips', type: 'bodyweight' },
  { name: 'Chin-ups', type: 'bodyweight' },
  { name: 'Bicep Curls', type: 'weighted' },
  { name: 'Bent Over Rows', type: 'weighted' },
];

const DB_NAME = 'workout-tracker-v2';
const STORE = 'logs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('exercise', 'exercise');
        s.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGetAll(): Promise<LogEntry[]> {
  return openDB().then(db => new Promise((res, rej) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function dbPut(item: LogEntry): Promise<void> {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

function dbDelete(id: string): Promise<void> {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

const today = () => new Date().toISOString().slice(0, 10);

const COLORS = ['#facc15', '#f97316', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function WorkoutTrackerPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [date, setDate] = useState(today);
  const [selected, setSelected] = useState(COMPOUND[0].name);
  const [weight, setWeight] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const reload = useCallback(async () => setLogs(await dbGetAll()), []);
  useEffect(() => { reload(); }, [reload]);

  const selectedType = COMPOUND.find(c => c.name === selected)?.type ?? 'weighted';

  const submit = async () => {
    await dbPut({ id: crypto.randomUUID(), exercise: selected, date, weight: selectedType === 'weighted' ? (+weight || 0) : undefined });
    setWeight('');
    setPage(0);
    reload();
  };

  const remove = async (id: string) => { await dbDelete(id); setPage(p => Math.max(0, p)); reload(); };

  // chart data: for each weighted exercise that has logs, build date→weight series
  const weightedWithLogs = useMemo(() => {
    return COMPOUND.filter(c => c.type === 'weighted').filter(c =>
      logs.some(l => l.exercise === c.name && l.weight && l.weight > 0)
    );
  }, [logs]);

  const chartData = useMemo(() => {
    const dates = [...new Set(logs.filter(l => l.weight && l.weight > 0).map(l => l.date))].sort();
    return dates.map(d => {
      const row: Record<string, string | number> = { date: d };
      for (const ex of weightedWithLogs) {
        const entry = logs.find(l => l.exercise === ex.name && l.date === d && l.weight && l.weight > 0);
        if (entry) row[ex.name] = entry.weight!;
      }
      return row;
    });
  }, [logs, weightedWithLogs]);

  return (
    <div className="flex flex-col flex-1">
      <main className="px-4 py-6 flex-1 metronome-static">
        <div className="w-full lg:max-w-5xl lg:mx-auto">
          <div className="rounded-lg p-6 bg-white">
            <div className="text-center mb-10">
              <h1 className="text-5xl font-bold drop-shadow-lg" style={{ color: "#000" }}>🏋️ 5×5 Tracker</h1>
              <p className="text-lg mt-3" style={{ color: "#000" }}>All exercises are 5 sets × 5 reps</p>
            </div>

            {/* Log form */}
            <div className="flex flex-wrap gap-2 items-end mb-8 max-w-3xl mx-auto">
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="border border-[#373A40]/30 rounded px-3 py-2 text-sm bg-white" />
              <select value={selected} onChange={e => setSelected(e.target.value)}
                className="border border-[#373A40]/30 rounded px-3 py-2 text-sm flex-1 min-w-[160px]">
                {COMPOUND.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              {selectedType === 'weighted' && (
                <input type="number" min={0} step={5} value={weight} placeholder="lbs"
                  onChange={e => setWeight(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  className="w-24 border border-[#373A40]/30 rounded px-3 py-2 text-sm" />
              )}
              <button onClick={submit}
                className="rounded bg-black px-5 py-2 text-sm font-medium text-[#facc15] hover:bg-black/80">
                Submit
              </button>
            </div>

            {/* Weight progress chart */}
            {weightedWithLogs.length > 0 && chartData.length > 0 && (
              <div className="border-t border-[#373A40]/10 pt-6 mb-8">
                <h2 className="font-semibold text-lg mb-4">Weight Progress</h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" fontSize={11} tickFormatter={d => {
                        const dt = new Date(d + 'T12:00:00');
                        return `${dt.getMonth() + 1}/${dt.getDate()}`;
                      }} />
                      <YAxis fontSize={11} unit=" lbs" />
                      <Tooltip labelFormatter={d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} />
                      {weightedWithLogs.map((ex, i) => (
                        <Line key={ex.name} type="monotone" dataKey={ex.name} stroke={COLORS[i % COLORS.length]}
                          strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* All entries */}
            {logs.length > 0 && (() => {
              const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date) || a.exercise.localeCompare(b.exercise));
              const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
              const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
              return (
              <div className="border-t border-[#373A40]/10 pt-6">
                <h2 className="font-semibold text-lg mb-3">All Entries <span className="text-sm font-normal text-[#000]/40">({sorted.length})</span></h2>
                <div className="space-y-1">
                  {paged.map(l => (
                    <div key={l.id} className="flex items-center justify-between py-2 border-b border-[#373A40]/10 last:border-0">
                      <div className="text-sm">
                        <span className="text-[#000]/50 mr-2">{new Date(l.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        <span className="font-medium">{l.exercise}</span>
                        {l.weight != null && l.weight > 0 && <span className="text-[#000]/50 ml-1">@ {l.weight} lbs</span>}
                      </div>
                      <button onClick={() => remove(l.id)} className="text-[#373A40]/30 hover:text-red-500 text-lg px-1" aria-label="Delete">×</button>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                      className="text-sm px-3 py-1 rounded border border-[#373A40]/20 disabled:opacity-30">← Prev</button>
                    <span className="text-sm text-[#000]/50">{page + 1} / {totalPages}</span>
                    <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                      className="text-sm px-3 py-1 rounded border border-[#373A40]/20 disabled:opacity-30">Next →</button>
                  </div>
                )}
              </div>
              );
            })()}

          </div>
        </div>
      </main>
    </div>
  );
}
