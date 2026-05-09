"use client";

import React, { useMemo, useState } from "react";
import { useTheme } from "../lib/ThemeContext";
import Fretboard from "./Fretboard";
import { allNotes, defaultTuning, totalFrets, generateChordsAndScales } from "../lib/music";

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
        className='px-4 py-2 rounded border border-[#373A40] text-[#1A1B1E] hover:bg-[#1A1B1E] hover:text-[#12B886]'
        onClick={resetTuning}
      >
        Reset Tuning
      </button>
    </div>
  );
}

export default function ChordScaleView() {
  const { theme, mounted } = useTheme();
  const { chords, scales } = useMemo(() => generateChordsAndScales(), []);

  const [tuning, setTuning] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("guitar-tuning");
      return saved ? JSON.parse(saved) : [...defaultTuning];
    }
    return [...defaultTuning];
  });
  const [chord, setChord] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("guitar-chord") || "";
    }
    return "";
  });
  const [scale, setScale] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("guitar-scale") || "";
    }
    return "";
  });

  const chordOptions = useMemo(
    () =>
      Object.entries(chords).map(([name, notes]) => (
        <option key={name} value={name}>{`${name} [${notes.join(", ")}]`}</option>
      )),
    [chords]
  );
  const scaleOptions = useMemo(
    () =>
      Object.entries(scales).map(([name, notes]) => (
        <option key={name} value={name}>{`${name} [${notes.join(", ")}]`}</option>
      )),
    [scales]
  );

  if (!mounted) return <div className='p-4'>Loading...</div>;

  return (
    <div className='p-4'>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6'>
        <TuningControl tuning={tuning} setTuning={setTuning} theme={theme} />
        <div className='lg:col-span-2'>
          <h5 className='text-lg font-semibold mb-3'>Chords & Scales</h5>
          <select
            className='w-full border rounded px-3 py-2 mb-3'
            value={chord}
            onChange={(e) => {
              setChord(e.target.value);
              localStorage.setItem("guitar-chord", e.target.value);
            }}
          >
            <option value=''>-- Select Chord --</option>
            {chordOptions}
          </select>
          <select
            className='w-full border rounded px-3 py-2 mb-3'
            value={scale}
            onChange={(e) => {
              setScale(e.target.value);
              localStorage.setItem("guitar-scale", e.target.value);
            }}
          >
            <option value=''>-- Select Scale --</option>
            {scaleOptions}
          </select>
        </div>
      </div>

      <Fretboard
        tuning={tuning}
        totalFrets={totalFrets}
        chordName={chord}
        chordNotes={chord ? chords[chord] : []}
        scaleNotes={scale ? scales[scale] : []}
        title={chord || "(choose a chord)"}
      />
    </div>
  );
}
