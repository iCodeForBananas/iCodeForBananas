"use client";

import { useState, useEffect } from "react";

interface PinnedProgression {
  chords: string[];
  key: string;
  formula: string;
}

export default function PinnedChordProgression() {
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
