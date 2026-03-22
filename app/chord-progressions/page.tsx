"use client";

import React from "react";
import ProgressionsView from "../components/ProgressionsView";

export default function ChordProgressionsPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full'>
          <div className='rounded-lg p-6'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold text-[#000000] drop-shadow-lg'>Chord Progressions</h1>
              <p className='text-lg text-[#000000]/70 mt-3'>Browse and practice common chord progressions</p>
            </div>
            <div className='p-6'>
              <ProgressionsView />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
