"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "../lib/ThemeContext";

interface PinnedProgression {
  chords: string[];
  key: string;
  formula: string;
}

export default function Navigation() {
  const { mounted } = useTheme();
  const pathname = usePathname();
  const [pinnedProgression, setPinnedProgression] = useState<PinnedProgression | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("guitar-pinnedProgression");
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleStorageChange = () => {
        const s = localStorage.getItem("guitar-pinnedProgression");
        setPinnedProgression(s ? JSON.parse(s) : null);
      };

      window.addEventListener("storage", handleStorageChange);
      const interval = setInterval(handleStorageChange, 1000);

      return () => {
        window.removeEventListener("storage", handleStorageChange);
        clearInterval(interval);
      };
    }
  }, []);

  if (!mounted) {
    return (
      <nav className='relative z-20 bg-gradient-to-r from-pink-50 to-orange-50 border-b border-pink-200 text-gray-900 px-4 py-3 transition-colors'>
        <div className='w-full lg:max-w-5xl lg:mx-auto flex items-center justify-center'>
          <div className='flex flex-wrap items-center justify-center gap-3 sm:gap-4 lg:gap-6 text-sm sm:text-base'>
            <span className='text-gray-700'>Fretboard</span>
            <span className='text-gray-700'>Progressions</span>
            <span className='text-gray-700'>By Shape</span>
            <span className='text-gray-700'>Silent Metronome</span>
            <span className='text-gray-700'>Settings</span>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <>
      <nav className='relative z-20 bg-gradient-to-r from-pink-50 to-orange-50 border-b border-pink-200 text-gray-900 px-4 py-3 transition-colors'>
        <div className='w-full lg:max-w-5xl lg:mx-auto flex items-center justify-center'>
          <div className='flex flex-wrap items-center justify-center gap-3 sm:gap-4 lg:gap-6 text-sm sm:text-base'>
            <Link
              href='/fretboard'
              className={`${
                pathname === "/fretboard" ? "text-pink-600 font-semibold" : "text-gray-700 hover:text-gray-900"
              }`}
            >
              Fretboard
            </Link>
            <Link
              href='/chord-progressions'
              className={`${
                pathname === "/chord-progressions" ? "text-pink-600 font-semibold" : "text-gray-700 hover:text-gray-900"
              }`}
            >
              Progressions
            </Link>
            <Link
              href='/chord-shapes'
              className={`${
                pathname === "/chord-shapes" ? "text-pink-600 font-semibold" : "text-gray-700 hover:text-gray-900"
              }`}
            >
              By Shape
            </Link>
            <Link
              href='/silent-metronome'
              className={`${
                pathname === "/silent-metronome" ? "text-pink-600 font-semibold" : "text-gray-700 hover:text-gray-900"
              }`}
            >
              Silent Metronome
            </Link>
            <Link
              href='/settings'
              className={`${
                pathname === "/settings" ? "text-pink-600 font-semibold" : "text-gray-700 hover:text-gray-900"
              }`}
            >
              Settings
            </Link>
          </div>
        </div>
      </nav>

      {pinnedProgression && pinnedProgression.chords && pinnedProgression.chords.length > 0 && (
        <div className='bg-accent/10 border-b border-accent/30 px-4 py-2 text-center text-sm'>
          <span className='font-medium'>Pinned Progression:</span> {pinnedProgression.chords.join(" → ")} in{" "}
          {pinnedProgression.key} ({pinnedProgression.formula})
        </div>
      )}
    </>
  );
}
