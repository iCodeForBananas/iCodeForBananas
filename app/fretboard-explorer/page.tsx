"use client";

import React from "react";
import ChordScaleView from "../components/ChordScaleView";

export default function FretboardPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='pr-4 py-4 flex-1 '>
          <div className='rounded-lg p-6 bg-white'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>
                Fretboard Explorer
              </h1>
              <p className='text-lg mt-3' style={{ color: "#000" }}>
                Explore chords and scales on the guitar fretboard
              </p>
            </div>
            <div className='p-6'>
              <ChordScaleView />
            </div>
          </div>
      </main>
    </div>
  );
}
