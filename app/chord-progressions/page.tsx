"use client";

import React from "react";
import ProgressionsView from "../components/ProgressionsView";
import PinnedChordProgression from "../components/PinnedChordProgression";

export default function ChordProgressionsPage() {
  return (
    <div className='flex flex-col flex-1'>
      <PinnedChordProgression />
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full'>
          <div className='rounded-lg p-6'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold text-white drop-shadow-lg'>Chord Progressions</h1>
              <p className='text-lg text-white/80 mt-3'>Browse and practice common chord progressions</p>
            </div>
            <div className='rounded-lg shadow-md p-6 bg-white text-gray-900'>
              <ProgressionsView />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
