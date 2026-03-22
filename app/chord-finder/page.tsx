"use client";

import React from "react";
import ChordFinder from "../components/ChordFinder";

export default function ChordFinderPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg p-6'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold text-[#000000] drop-shadow-lg'>Chord Finder</h1>
              <p className='text-lg text-[#000000]/70 mt-3'>
                Click notes on the fretboard and discover what chord you&apos;re playing
              </p>
            </div>
            <div className='p-6'>
              <ChordFinder />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
