"use client";

import React from "react";
import ChordFinder from "../components/ChordFinder";

export default function ChordFinderPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='pr-4 py-4 flex-1 '>
          <div className='rounded-lg p-6 bg-white'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>
                Chord Finder
              </h1>
              <p className='text-lg mt-3' style={{ color: "#000" }}>
                Click notes on the fretboard and discover what chord you&apos;re playing
              </p>
            </div>
            <div className='p-6'>
              <ChordFinder />
            </div>
          </div>
      </main>
    </div>
  );
}
