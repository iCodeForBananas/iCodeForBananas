"use client";

import CircleOfFifths from "../components/CircleOfFifths";

export default function CircleOfFifthsPage() {
  return (
    <main className='px-4 py-6 flex-1 metronome-static'>
      <div className='w-full lg:max-w-5xl lg:mx-auto'>
        <div className='rounded-lg p-6'>
          <div className='text-center mb-10'>
            <h1 className='text-5xl font-bold text-[#facc15] drop-shadow-lg'>Circle of Fifths</h1>
            <p className='text-lg text-[#facc15]/80 mt-3'>
              Click or hover over any key to see its first position guitar chord shape.
            </p>
          </div>
          <div className='rounded-lg p-6'>
            <CircleOfFifths />
          </div>
        </div>
      </div>
    </main>
  );
}
