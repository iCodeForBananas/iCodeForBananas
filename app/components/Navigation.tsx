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
      <nav className='relative z-20 bg-background border-b border-border text-foreground px-4 py-3 transition-colors'>
        <div className='w-full lg:max-w-5xl lg:mx-auto flex items-center justify-center'>
          <div className='flex flex-wrap items-center justify-center gap-3 sm:gap-4 lg:gap-6 text-sm sm:text-base'>
            <span className='text-foreground/80'>Fretboard</span>
            <span className='text-foreground/80'>Progressions</span>
            <span className='text-foreground/80'>By Shape</span>
            <span className='text-foreground/80'>Silent Metronome</span>
            <span className='text-foreground/80'>Settings</span>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <>
      <nav className='relative z-20 bg-background border-b border-border text-foreground px-4 py-3 transition-colors'>
        <div className='w-full lg:max-w-5xl lg:mx-auto flex items-center justify-center'>
          <div className='flex flex-wrap items-center justify-center gap-3 sm:gap-4 lg:gap-6 text-sm sm:text-base'>
            <Link
              href='/fretboard'
              className={`${
                pathname === "/fretboard" ? "text-accent font-semibold" : "text-foreground/80 hover:text-foreground"
              }`}
            >
              Fretboard
            </Link>
            <Link
              href='/chord-progressions'
              className={`${
                pathname === "/chord-progressions"
                  ? "text-accent font-semibold"
                  : "text-foreground/80 hover:text-foreground"
              }`}
            >
              Progressions
            </Link>
            <Link
              href='/chord-shapes'
              className={`${
                pathname === "/chord-shapes" ? "text-accent font-semibold" : "text-foreground/80 hover:text-foreground"
              }`}
            >
              By Shape
            </Link>
            <Link
              href='/silent-metronome'
              className={`${
                pathname === "/silent-metronome"
                  ? "text-accent font-semibold"
                  : "text-foreground/80 hover:text-foreground"
              }`}
            >
              Silent Metronome
            </Link>
            <Link
              href='/settings'
              className={`${
                pathname === "/settings" ? "text-accent font-semibold" : "text-foreground/80 hover:text-foreground"
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
