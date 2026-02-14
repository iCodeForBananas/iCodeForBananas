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

export default function PinnedChordProgression() {
  const { mounted } = useTheme();
  const pathname = usePathname();
  const [pinnedProgression, setPinnedProgression] = useState<PinnedProgression | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleStorageChange = () => {
        const s = localStorage.getItem("guitar-pinnedProgression");
        setPinnedProgression(s ? JSON.parse(s) : null);
      };

      handleStorageChange();

      window.addEventListener("storage", handleStorageChange);
      const interval = setInterval(handleStorageChange, 1000);

      return () => {
        window.removeEventListener("storage", handleStorageChange);
        clearInterval(interval);
      };
    }
  }, []);

  return (
    <>
      {pinnedProgression && pinnedProgression.chords && pinnedProgression.chords.length > 0 && (
        <div className='bg-accent/10 border-b border-accent/30 px-4 pt-5 pb-2 text-center text-sm'>
          <span className='font-medium'>Pinned Progression:</span> {pinnedProgression.chords.join(" → ")} in{" "}
          {pinnedProgression.key} ({pinnedProgression.formula})
        </div>
      )}
    </>
  );
}
