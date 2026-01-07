"use client";

import { useState, useEffect, useRef } from "react";
import Navigation from "../components/Navigation";

export default function SilentMetronome() {
  const [chords, setChords] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const savedProgression = localStorage.getItem("guitar-pinnedProgression");
      if (savedProgression) {
        try {
          const progression = JSON.parse(savedProgression);
          return progression.chords || [];
        } catch (e) {
          console.error("Error parsing chord progression:", e);
        }
      }
    }
    return [];
  });
  const [{ index: activeIndex, beat }, setMetronomeState] = useState({ index: 0, beat: 0 });
  const [bpm, setBpm] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("silent-metronome-bpm");
      const parsed = saved ? parseInt(saved, 10) : NaN;
      if (!Number.isNaN(parsed)) return parsed;
    }
    return 80;
  });
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Persist BPM so it survives refresh
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("silent-metronome-bpm", String(bpm));
    }
  }, [bpm]);

  // Set mounted flag after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Timer: keep hooks order stable; gate by mounted
  useEffect(() => {
    if (!mounted || chords.length === 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const interval = 60000 / bpm; // quarter-note interval

    // Clear any existing timer to avoid double intervals (e.g., StrictMode)
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      setMetronomeState((prev) => {
        if (chords.length === 0) return prev;

        const didCompleteMeasure = prev.beat >= 3;
        const nextBeat = didCompleteMeasure ? 0 : prev.beat + 1;
        const nextIndex = didCompleteMeasure ? (prev.index + 1) % chords.length : prev.index;

        return { index: nextIndex, beat: nextBeat };
      });
    }, interval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [mounted, bpm, chords.length]);

  if (!mounted) {
    return (
      <div className='flex flex-col flex-1'>
        <Navigation />
        <main className='relative min-h-screen px-4 py-6 metronome-static flex-1'>
          <div className='relative w-full lg:max-w-5xl lg:mx-auto'>
            <div className='p-4 text-foreground'>Loading...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className='flex flex-col flex-1'>
      <Navigation />
      <main className='relative min-h-screen px-4 py-6 metronome-static flex-1'>
        <div className='relative w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg border border-border p-8 shadow-sm bg-white'>
            <div className='mb-8'>
              <label className='block text-sm font-medium text-gray-700 mb-2'>BPM: {bpm}</label>
              <input
                type='range'
                min='40'
                max='200'
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value))}
                className='w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer'
              />
              <div className='flex justify-between text-xs text-gray-500 mt-1'>
                <span>40</span>
                <span>200</span>
              </div>
              <div className='mt-3 text-sm text-gray-700'>Count: {beat + 1} / 4</div>
            </div>

            {chords.length > 0 ? (
              <div className='flex justify-center items-center space-x-8'>
                {chords.map((chord, index) => (
                  <div
                    key={index}
                    className={`p-6 rounded-lg border-2 transition-all duration-200 ${
                      index === activeIndex ? "border-blue-500 scale-110" : "border-gray-300"
                    }`}
                  >
                    <div className='text-2xl font-bold text-center'>{chord}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-center opacity-80'>
                No chord progression found. Please set and pin a progression from the Progressions page first.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
