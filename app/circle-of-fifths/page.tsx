"use client";

import CircleOfFifths from "../components/CircleOfFifths";

export default function CircleOfFifthsPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='pr-4 py-4 flex-1 '>
        <div className='rounded-lg p-6 bg-white'>
          <div className='text-center mb-10'>
            <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>
              Circle of Fifths
            </h1>
            <p className='text-lg mt-3' style={{ color: "#000" }}>
              Click or hover over any key to see its first position guitar chord shape.
            </p>
          </div>
          <div className=''>
            <CircleOfFifths />
          </div>
        </div>
      </main>
    </div>
  );
}
