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

  function playFrame(f: string[][], idx: number) {
    if (!f[idx]) {
      // restart
      setCurrentFrame(0);
      playFrame(f, 0);
      return;
    }
    const baseDelay = (1000 / 15) * parseInt(f[idx][0], 10);
    const delay = f === cache.current["rick_roll"] ? baseDelay * 1.2 : baseDelay;
    timeout.current = setTimeout(() => {
      const next = idx + 1;
      setCurrentFrame(next);
      playFrame(f, next);
    }, delay);
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playFrame is a stable recursive function using only refs and setState
    []
  );

  useEffect(() => {
    loadMovie("rick_roll");
    return () => clearTimeout(timeout.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only on mount
  }, []);

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
                ? "bg-[#0d9e73] text-white"
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
