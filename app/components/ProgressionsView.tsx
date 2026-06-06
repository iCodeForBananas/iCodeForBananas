"use client";

import React, { useMemo, useState } from "react";
import { useTheme } from "../lib/ThemeContext";
import Fretboard from "./Fretboard";
import {
  allNotes,
  defaultTuning,
  totalFrets,
  generateChordsAndScales,
  progressionPresets,
  buildProgressionChords,
  chordVoicings,
} from "../lib/music";

interface TuningControlProps {
  tuning: string[];
  setTuning: (tuning: string[]) => void;
  theme: string;
}

function TuningControl({ tuning, setTuning, theme }: TuningControlProps) {
  const updateTuning = (index: number, value: string) => {
    const newTuning = [...tuning];
    newTuning[index] = value;
    setTuning(newTuning);
    localStorage.setItem("guitar-tuning", JSON.stringify(newTuning));
  };
  const resetTuning = () => {
    setTuning([...defaultTuning]);
    localStorage.setItem("guitar-tuning", JSON.stringify([...defaultTuning]));
  };
  return (
    <div>
      <h5 className='text-lg font-semibold mb-3'>Tuning</h5>
      <div className='flex flex-col gap-2 mb-3'>
        {tuning.map((note, i) => (
          <select
            id={`tun-${i}`}
            key={i}
            className='border rounded px-3 py-1 text-sm'
            value={note}
            onChange={(e) => updateTuning(i, e.target.value)}
          >
            {allNotes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        ))}
      </div>
      <button
        className='px-4 py-2 rounded border border-[#373A40] text-[#1A1B1E] hover:bg-[#1A1B1E] hover:text-[#FFD700]'
        onClick={resetTuning}
      >
        Reset Tuning
      </button>
    </div>
  );
}

interface ChordEntry {
  name: string;
  fret: number;
}

export default function ProgressionsView() {
  const { theme, mounted } = useTheme();
  const { chords } = useMemo(() => generateChordsAndScales(), []);

  const [tuning, setTuning] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("guitar-tuning");
      return saved ? JSON.parse(saved) : [...defaultTuning];
    }
    return [...defaultTuning];
  });
  const [progressionKey, setProgressionKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("guitar-progressionKey") || "C";
    }
    return "C";
  });
  const [formulaIndex, setFormulaIndex] = useState(() => {
    if (typeof window !== "undefined") {
      const idx = parseInt(localStorage.getItem("guitar-formulaIndex") || "0", 10);
      return idx >= 0 && idx < progressionPresets.length ? idx : 0;
    }
    return 0;
  });
  const [voicing, setVoicing] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("guitar-voicing") || "triad";
    }
    return "triad";
  });
  const [chordProgression, setChordProgression] = useState<ChordEntry[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("guitar-chordProgression");
      return saved
        ? JSON.parse(saved)
        : [
            { name: "", fret: 0 },
            { name: "", fret: 0 },
            { name: "", fret: 0 },
            { name: "", fret: 0 },
          ];
    }
    return [
      { name: "", fret: 0 },
      { name: "", fret: 0 },
      { name: "", fret: 0 },
      { name: "", fret: 0 },
    ];
  });

  const sortedNotes = useMemo(() => [...allNotes].sort((a, b) => b.length - a.length), []);

  const chordTypes = useMemo(
    () =>
      Object.keys(chords)
        .filter((n) => n.startsWith("C") && !n.startsWith("C#"))
        .map((n) => ({ suffix: n.slice(1), label: n.slice(1).trim() })),
    [chords]
  );

  const getRootNote = (chordName: string) =>
    sortedNotes.find((n) => chordName.startsWith(n)) ?? "C";

  const getChordSuffix = (chordName: string) => {
    if (!chordName) return " Major";
    const root = sortedNotes.find((n) => chordName.startsWith(n)) ?? "";
    return chordName.slice(root.length);
  };

  const updateChordInProgression = (index: number, field: string, value: string) => {
    const updated = [...chordProgression];
    updated[index] = { ...updated[index], [field]: field === "fret" ? parseInt(value, 10) || 0 : value };
    setChordProgression(updated);
    localStorage.setItem("guitar-chordProgression", JSON.stringify(updated));
  };

  const generateProgression = () => {
    const preset = progressionPresets[formulaIndex];
    const names = buildProgressionChords(progressionKey, preset, voicing);
    const progression = names.map((name) => ({ name, fret: 0 }));
    setChordProgression(progression);
    localStorage.setItem("guitar-chordProgression", JSON.stringify(progression));
  };

  const resetAll = () => {
    setTuning([...defaultTuning]);
    localStorage.setItem("guitar-tuning", JSON.stringify([...defaultTuning]));
    setProgressionKey("C");
    localStorage.setItem("guitar-progressionKey", "C");
    setFormulaIndex(0);
    localStorage.setItem("guitar-formulaIndex", "0");
    setVoicing("triad");
    localStorage.setItem("guitar-voicing", "triad");
    const defaultProgression = [
      { name: "", fret: 0 },
      { name: "", fret: 0 },
      { name: "", fret: 0 },
      { name: "", fret: 0 },
    ];
    setChordProgression(defaultProgression);
    localStorage.setItem("guitar-chordProgression", JSON.stringify(defaultProgression));
  };

  if (!mounted) return <div className='p-4'>Loading...</div>;

  return (
    <div className='p-4'>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6'>
        <TuningControl tuning={tuning} setTuning={setTuning} theme={theme} />
        <div className='lg:col-span-2'>
          <h5 className='text-lg font-semibold mb-3'>Chord Progression</h5>
          <select
            className='w-full border rounded px-3 py-2 mb-3'
            value={progressionKey}
            onChange={(e) => {
              setProgressionKey(e.target.value);
              localStorage.setItem("guitar-progressionKey", e.target.value);
            }}
          >
            {allNotes.map((note) => (
              <option key={note} value={note}>{`Key of ${note}`}</option>
            ))}
          </select>
          <select
            className='w-full border rounded px-3 py-2 mb-3'
            value={formulaIndex}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              setFormulaIndex(value);
              localStorage.setItem("guitar-formulaIndex", value.toString());
            }}
          >
            {progressionPresets.map((formula, idx) => (
              <option key={idx} value={idx}>
                {formula.label}
              </option>
            ))}
          </select>
          <select
            className='w-full border rounded px-3 py-2 mb-3'
            value={voicing}
            onChange={(e) => {
              setVoicing(e.target.value);
              localStorage.setItem("guitar-voicing", e.target.value);
            }}
          >
            {chordVoicings.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
          {chordProgression.map((entry, index) => {
            const rootNote = entry.name ? getRootNote(entry.name) : "C";
            const suffix = entry.name ? getChordSuffix(entry.name) : " Major";
            return (
              <div key={index} className='flex items-center mb-2 gap-2'>
                <span className='text-sm opacity-60 w-16 shrink-0'>Chord {index + 1}</span>
                <select
                  className='border rounded px-2 py-1 text-sm w-20 shrink-0'
                  value={rootNote}
                  onChange={(e) => {
                    const newName = e.target.value + suffix;
                    updateChordInProgression(index, "name", chords[newName] !== undefined ? newName : "");
                  }}
                >
                  {allNotes.map((note) => (
                    <option key={note} value={note}>{note}</option>
                  ))}
                </select>
                <select
                  className='flex-1 border rounded px-2 py-1 text-sm'
                  value={suffix}
                  onChange={(e) => {
                    const newName = rootNote + e.target.value;
                    updateChordInProgression(index, "name", chords[newName] !== undefined ? newName : "");
                  }}
                >
                  {chordTypes.map(({ suffix: s, label }) => (
                    <option key={s} value={s}>{label}</option>
                  ))}
                </select>
                {entry.name && (
                  <button
                    className='opacity-40 hover:opacity-100 text-lg leading-none px-1'
                    onClick={() => updateChordInProgression(index, "name", "")}
                    title='Clear chord'
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          <div className='mt-3'>
            <button
              className='bg-[#1A1B1E] text-[#FFD700] px-4 py-2 rounded text-sm mr-2 hover:bg-[#1A1B1E]/80'
              onClick={generateProgression}
            >
              Generate Random Progression
            </button>
            <button
              className='bg-[#FFD700] text-[#000000] px-4 py-2 rounded text-sm mr-2 hover:bg-[#e6c200]'
              onClick={() => {
                const progressionData = {
                  chords: chordProgression.map((e) => e.name).filter(Boolean),
                  key: progressionKey,
                  formula: progressionPresets[formulaIndex].label,
                };
                localStorage.setItem("guitar-pinnedProgression", JSON.stringify(progressionData));
              }}
            >
              Pin Progression
            </button>
            <button
              className='px-4 py-2 rounded text-sm border border-red-600 text-red-600 hover:bg-red-600 hover:text-white'
              onClick={resetAll}
              title='Reset all selections to default values'
            >
              Reset All
            </button>
          </div>
        </div>
      </div>

      <div className='mt-6'>
        <h5 className='text-lg font-semibold mb-3'>Progression Boards</h5>
        {chordProgression.map((entry, i) => {
          const chordName = entry.name;
          const chordNotes = chordName && chords[chordName] ? chords[chordName] : [];
          return (
            <div key={`${entry.name}-${i}`} className='mb-4'>
              <Fretboard
                tuning={tuning}
                totalFrets={totalFrets}
                chordName={chordName}
                chordNotes={chordNotes}
                title={`Chord ${i + 1}: ${chordName || "(unset)"}`}
              />
              <div className='text-sm opacity-80'>
                {chordName ? <span>{`Notes: ${chordNotes.join(", ")}`}</span> : <span>Notes: –</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
