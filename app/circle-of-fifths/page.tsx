"use client";

import CircleOfFifths from "../components/CircleOfFifths";

export default function CircleOfFifthsPage() {
  return (
    <main className='metronome-static min-h-screen px-4 py-12'>
      <div className='max-w-5xl mx-auto'>
        <div className='text-center mb-10'>
          <h1 className='text-5xl font-bold text-white drop-shadow-lg'>Circle of Fifths</h1>
          <p className='text-lg text-white/80 mt-3'>
            Click or hover over any key to see its first position guitar chord shape.
          </p>
        </div>
        <CircleOfFifths />
      </div>
    </main>
  );
}
