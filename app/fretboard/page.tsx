"use client";

import React from "react";
import ChordScaleView from "../components/ChordScaleView";

export default function FretboardPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg p-6 bg-white'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>Fretboard</h1>
              <p className='text-lg mt-3' style={{ color: "#000" }}>Explore chords and scales on the guitar fretboard</p>
            </div>
            <div className='p-6'>
              <ChordScaleView />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
