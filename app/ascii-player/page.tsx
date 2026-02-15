"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type MovieKey = "rick_roll" | "sw1";

const MOVIES: { key: MovieKey; label: string }[] = [
  { key: "rick_roll", label: "Rick Roll" },
  { key: "sw1", label: "Star Wars IV" },
];

function parseFrames(text: string): string[][] {
  const lines = text.split("\n");
  const frames: string[][] = [];
  let i = 0;
  while (i < lines.length) {
    const frame = lines.slice(i, i + 14);
    if (frame.length === 14) frames.push(frame);
    i += 14;
  }
  return frames;
}

export default function AsciiPlayerPage() {
  const [frames, setFrames] = useState<string[][]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentMovie, setCurrentMovie] = useState<MovieKey>("rick_roll");
  const [loading, setLoading] = useState(true);
  const cache = useRef<Partial<Record<MovieKey, string[][]>>>({});
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const playFrameRef = useRef<(f: string[][], idx: number) => void>(undefined);

  useEffect(() => {
    playFrameRef.current = (f: string[][], idx: number) => {
      if (!f[idx]) {
        // restart
        setCurrentFrame(0);
        playFrameRef.current?.(f, 0);
        return;
      }
      const baseDelay = (1000 / 15) * parseInt(f[idx][0], 10);
      const delay = f === cache.current["rick_roll"] ? baseDelay * 1.2 : baseDelay;
      timeout.current = setTimeout(() => {
        const next = idx + 1;
        setCurrentFrame(next);
        playFrameRef.current?.(f, next);
      }, delay);
    };
  });

  const playFrame = useCallback((f: string[][], idx: number) => {
    playFrameRef.current?.(f, idx);
  }, []);

  const loadMovie = useCallback(
    async (movie: MovieKey) => {
      clearTimeout(timeout.current);
      setLoading(true);

      let parsed = cache.current[movie];
      if (!parsed) {
        const res = await fetch(`/movies/${movie}.txt`);
        parsed = parseFrames(await res.text());
        cache.current[movie] = parsed;
      }

      setFrames(parsed);
      setCurrentFrame(0);
      setCurrentMovie(movie);
      setLoading(false);
      playFrame(parsed, 0);
    },
    [playFrame]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading initial movie on mount
    loadMovie("rick_roll");
    return () => clearTimeout(timeout.current);
  }, [loadMovie]);

  const frameText =
    frames[currentFrame]?.slice(1).join("\n") ?? "";

  return (
    <div className="flex flex-col items-center h-screen bg-[#222] text-white p-4">
      <div className="flex gap-2 mb-4">
        {MOVIES.map((m) => (
          <button
            key={m.key}
            onClick={() => loadMovie(m.key)}
            className={`px-4 py-2 rounded font-mono text-sm transition-colors ${
              currentMovie === m.key
                ? "bg-pink-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center">
        {loading ? (
          <span className="font-mono text-gray-400">Loading...</span>
        ) : (
          <pre className="font-mono text-[31px] leading-tight whitespace-pre max-w-full overflow-hidden md:text-[16px] lg:text-[31px]">
            {frameText}
          </pre>
        )}
      </div>
    </div>
  );
}
