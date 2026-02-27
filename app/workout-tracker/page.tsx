'use client';

import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Workout {
  id: string;
  name: string;
  sets: number;
  reps: number;
  completed: boolean;
  completedAt?: string;
}

const STORAGE_KEY = 'workout-tracker-data';

const defaultWorkouts: Workout[] = [
  { id: '1', name: 'Push-ups', sets: 3, reps: 15, completed: false },
  { id: '2', name: 'Squats', sets: 4, reps: 12, completed: false },
  { id: '3', name: 'Pull-ups', sets: 3, reps: 8, completed: false },
  { id: '4', name: 'Lunges', sets: 3, reps: 10, completed: false },
  { id: '5', name: 'Plank', sets: 3, reps: 1, completed: false },
];

function load(): Workout[] {
  if (typeof window === 'undefined') return defaultWorkouts;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : defaultWorkouts;
}

function save(w: Workout[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
}

export default function WorkoutTrackerPage() {
  const [workouts, setWorkouts] = useState<Workout[]>(defaultWorkouts);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', sets: 3, reps: 10 });

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading saved state from localStorage on mount
  useEffect(() => { setWorkouts(load()); }, []);

  const persist = useCallback((next: Workout[]) => { setWorkouts(next); save(next); }, []);

  const toggle = (id: string) => {
    const next = workouts.map(w =>
      w.id === id ? { ...w, completed: !w.completed, completedAt: !w.completed ? new Date().toISOString() : undefined } : w
    );
    persist(next);
  };

  const addWorkout = () => {
    if (!form.name.trim()) return;
    persist([{ id: crypto.randomUUID(), ...form, completed: false }, ...workouts]);
    setForm({ name: '', sets: 3, reps: 10 });
    setShowForm(false);
  };

  const saveEdit = (id: string) => {
    persist(workouts.map(w => w.id === id ? { ...w, ...form } : w));
    setEditingId(null);
  };

  const restart = () => persist(workouts.map(w => ({ ...w, completed: false, completedAt: undefined })));

  // progress chart data (last 14 days)
  const progressData = (() => {
    const counts: Record<string, number> = {};
    workouts.filter(w => w.completedAt).forEach(w => {
      const d = w.completedAt!.slice(0, 10);
      counts[d] = (counts[d] || 0) + 1;
    });
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, count: counts[key] || 0 });
    }
    // cumulative
    let cum = 0;
    return days.map(d => ({ ...d, count: (cum += d.count) }));
  })();

  // day-of-week chart data
  const dayData = (() => {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const counts = Array(7).fill(0);
    workouts.filter(w => w.completedAt).forEach(w => { counts[new Date(w.completedAt!).getDay()]++; });
    return names.map((day, i) => ({ day: day.slice(0, 3), count: counts[i] }));
  })();

  const active = workouts.filter(w => !w.completed);
  const completed = workouts.filter(w => w.completed);
  const allDone = workouts.length > 0 && active.length === 0;

  return (
    <main className="px-4 py-6 flex-1 metronome-static">
      <div className="w-full lg:max-w-2xl lg:mx-auto">
        <div className="rounded-lg p-6">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-bold text-white drop-shadow-lg">Workout Tracker</h1>
            <p className="text-lg text-white/80 mt-3">Plan your workouts and track your progress</p>
          </div>

        <div className="rounded-lg shadow-md p-6 bg-white">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">My Workouts</h2>
            <button onClick={() => { setShowForm(!showForm); setForm({ name: '', sets: 3, reps: 10 }); }}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              {showForm ? 'Cancel' : 'Add Workout'}
            </button>
          </div>

          {/* Add form */}
          {showForm && (
            <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
              <h3 className="text-lg font-medium mb-4 text-gray-900">Add New Workout</h3>
              <input type="text" placeholder="e.g., Push-ups" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="mb-3 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-yellow-400">Sets</label>
                  <input type="number" min={1} value={form.sets}
                    onChange={e => setForm({ ...form, sets: +e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-yellow-400">Reps</label>
                  <input type="number" min={1} value={form.reps}
                    onChange={e => setForm({ ...form, reps: +e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={addWorkout}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Add Workout
                </button>
              </div>
            </div>
          )}

          {/* All done banner */}
          {allDone && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 font-medium">All workouts completed! 🎉</p>
                <p className="text-xs text-green-600 mt-1">Ready to start a new cycle?</p>
              </div>
              <button onClick={restart}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                Restart
              </button>
            </div>
          )}

          {/* Workout lists */}
          {active.length > 0 && (
            <div>
              <h3 className="font-medium text-lg mb-3 text-gray-900">Active Workouts</h3>
              {active.map(w => (
                <WorkoutRow key={w.id} workout={w} onToggle={toggle} editingId={editingId}
                  onEdit={(id) => { setEditingId(id); setForm({ name: w.name, sets: w.sets, reps: w.reps }); }}
                  form={form} setForm={setForm} onSave={saveEdit} onCancel={() => setEditingId(null)} />
              ))}
            </div>
          )}

          {completed.length > 0 && (
            <div className="mt-8">
              <h3 className="font-medium text-lg mb-3 text-yellow-600">Completed Workouts</h3>
              {completed.map(w => (
                <WorkoutRow key={w.id} workout={w} onToggle={toggle} editingId={editingId}
                  onEdit={(id) => { setEditingId(id); setForm({ name: w.name, sets: w.sets, reps: w.reps }); }}
                  form={form} setForm={setForm} onSave={saveEdit} onCancel={() => setEditingId(null)} />
              ))}
            </div>
          )}

          {workouts.length === 0 && (
            <p className="text-center text-gray-500 py-4">No workouts yet. Add one to get started!</p>
          )}

          {/* Progress Chart */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Your Progress</h2>
            <div className="bg-white p-4 rounded-lg shadow-sm border h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f680" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-gray-500 mt-2 text-center">Cumulative completed workouts over the last 14 days</p>
          </div>

          {/* Day of Week Chart */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Workout Distribution</h2>
            <div className="bg-white p-4 rounded-lg shadow-sm border h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" fontSize={12} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-gray-500 mt-2 text-center">Which days you work out most frequently</p>
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}

function WorkoutRow({ workout: w, onToggle, editingId, onEdit, form, setForm, onSave, onCancel }: {
  workout: Workout; onToggle: (id: string) => void; editingId: string | null;
  onEdit: (id: string) => void; form: { name: string; sets: number; reps: number };
  setForm: (f: { name: string; sets: number; reps: number }) => void;
  onSave: (id: string) => void; onCancel: () => void;
}) {
  if (editingId === w.id) {
    return (
      <div className="bg-white border rounded-lg p-4 mb-4 shadow-sm space-y-3">
        <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-yellow-400">Sets</label>
            <input type="number" min={1} value={form.sets} onChange={e => setForm({ ...form, sets: +e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-400">Reps</label>
            <input type="number" min={1} value={form.reps} onChange={e => setForm({ ...form, reps: +e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
          </div>
        </div>
        <div className="flex justify-end space-x-2">
          <button onClick={onCancel} className="rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-yellow-400 hover:bg-gray-300">Cancel</button>
          <button onClick={() => onSave(w.id)} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4 mb-4 shadow-sm flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <input type="checkbox" checked={w.completed} onChange={() => onToggle(w.id)}
          className="h-5 w-5 rounded border-gray-300 text-blue-600" />
        <div className={w.completed ? 'line-through text-gray-400' : ''}>
          <h3 className="text-lg font-medium text-gray-900">{w.name}</h3>
          <p className="text-sm text-yellow-600">{w.sets} sets × {w.reps} reps</p>
        </div>
      </div>
      <button onClick={() => onEdit(w.id)}
        className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-yellow-400 hover:bg-gray-200">Edit</button>
    </div>
  );
}
