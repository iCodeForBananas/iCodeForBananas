"use client";

import React from "react";
import ProgressionsView from "../components/ProgressionsView";
import PinnedChordProgression from "../components/PinnedChordProgression";

export default function ChordProgressionsPage() {
  return (
    <div className='flex flex-col flex-1'>
      <PinnedChordProgression />
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
            <ProgressionsView />
          </div>
        </div>
      </main>
    </div>
  );
}
