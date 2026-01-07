"use client";

import React, { useMemo, useState, useEffect } from "react";

// Common-practice next-steps by FUNCTION, not pitch.
const NEXT: Record<string, string[]> = {
  I: ["ii", "iii", "IV", "V", "vi", "vii°", "I"],
  ii: ["V", "vii°", "ii"],
  iii: ["vi", "IV", "iii"],
  IV: ["ii", "V", "IV"],
  V: ["I", "vi", "V"],
  vi: ["ii", "IV", "vi"],
  "vii°": ["I", "vii°"],
};

// 12 keys in circle-of-fifths order
const KEYS = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F"];

// Build diatonic chords for a major key
function keyChords(tonic: string): Record<string, string> {
  const scale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const idx = (n: number) => (n + scale.indexOf(tonic)) % 12;
  const note = (n: number) => scale[idx(n)];
  return {
    I: note(0),
    ii: note(2) + "m",
    iii: note(4) + "m",
    IV: note(5),
    V: note(7),
    vi: note(9) + "m",
    "vii°": (() => {
      const m = note(11);
      // simple spelling for readability
      return (m === "B" ? "B" : m) + (m === "E" ? "#" : "") + "°";
    })(),
  };
}

interface ProgressionNavigatorProps {
  startKey?: string;
  bpm?: number;
}

interface ProgressionStep {
  f: string;
  label: string;
}

export default function ProgressionNavigator({ startKey = "G", bpm = 80 }: ProgressionNavigatorProps) {
  const [key, setKey] = useState(startKey);
  const chords = useMemo(() => keyChords(key), [key]);

  const [currentF, setCurrentF] = useState("I");
  const [prog, setProg] = useState<ProgressionStep[]>([{ f: "I", label: chords["I"] }]);

  // Update labels if key changes
  useEffect(() => {
    setProg((p) => p.map((step) => ({ ...step, label: chords[step.f] })));
  }, [chords]);

  // Visual metronome to step through progression
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const ms = Math.round(60000 / bpm);
    const t = setInterval(() => setBeat((b) => b + 1), ms);
    return () => clearInterval(t);
  }, [playing, bpm]);
  useEffect(() => {
    if (!playing || prog.length === 0) return;
    const idx = beat % prog.length;
    setCurrentF(prog[idx].f);
  }, [beat, playing, prog]);

  const nextFs = NEXT[currentF] || [];

  const addStep = (f: string) => {
    setCurrentF(f);
    setProg((p) => [...p, { f, label: chords[f] }]);
  };

  const reset = () => {
    setCurrentF("I");
    setProg([{ f: "I", label: chords["I"] }]);
    setBeat(0);
    setPlaying(false);
  };

  return (
    <div className='bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm text-gray-900 dark:text-gray-100 p-6 rounded-[20px] shadow-lg max-w-4xl'>
      <div className='flex flex-wrap gap-3 items-center mb-4'>
        <label className='font-medium'>Key:</label>
        <select
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            reset();
          }}
          className='bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
        >
          {KEYS.map((k) => (
            <option key={k} value={k}>
              {k} major
            </option>
          ))}
        </select>
        <button
          onClick={() => setPlaying((p) => !p)}
          className='bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors font-medium'
        >
          {playing ? "Stop" : "Play"}
        </button>
        <span className='text-sm font-medium'>{bpm} BPM</span>
      </div>

      {/* Chord grid */}
      <div className='grid grid-cols-4 md:grid-cols-7 gap-2 mb-4'>
        {["I", "ii", "iii", "IV", "V", "vi", "vii°"].map((f) => {
          const label = chords[f];
          const isCurrent = f === currentF;
          const isNext = nextFs.includes(f);
          const isMinor = f === "ii" || f === "iii" || f === "vi";

          let bgColor = "bg-gray-700 hover:bg-gray-600";
          if (isCurrent) bgColor = "bg-red-500 hover:bg-red-600";
          else if (isNext) bgColor = "bg-amber-500 hover:bg-amber-600";
          else if (isMinor) bgColor = "bg-cyan-600 hover:bg-cyan-700";

          return (
            <button
              key={f}
              onClick={() => addStep(f)}
              className={`${bgColor} p-3 rounded-xl transition-colors font-bold text-white shadow-md`}
            >
              <div className='text-xs opacity-80'>{f}</div>
              <div className='text-lg'>{label}</div>
            </button>
          );
        })}
      </div>

      {/* Next-step hints */}
      <div className='mb-4 text-sm text-gray-700 dark:text-gray-300'>
        Next from <span className='font-bold'>{currentF}</span>: {nextFs.join(" → ")}
      </div>

      {/* Progression timeline */}
      <div className='bg-gray-100 dark:bg-gray-800 p-4 rounded-xl flex gap-2 flex-wrap items-center'>
        {prog.map((s, i) => {
          const active = playing ? i === beat % prog.length : i === prog.length - 1;
          return (
            <div
              key={i}
              className={`px-3 py-2 rounded-lg font-bold transition-colors ${
                active ? "bg-yellow-300 text-gray-900" : "bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              }`}
            >
              {s.label}
            </div>
          );
        })}
        <button
          onClick={reset}
          className='ml-auto bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition-colors text-sm font-medium'
        >
          Reset
        </button>
        <button
          onClick={() => setProg((p) => p.slice(0, -1))}
          disabled={prog.length <= 1}
          className='bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
        >
          Undo
        </button>
      </div>

      {/* Tip */}
      <div className='mt-4 text-xs text-gray-600 dark:text-gray-400'>
        Click chords to build a path. Only valid next steps are highlighted. Use this as a live follow-along map while
        you play.
      </div>
    </div>
  );
}
