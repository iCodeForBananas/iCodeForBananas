"use client";

import CircleOfFifths from "../components/CircleOfFifths";

export default function CircleOfFifthsPage() {
  return (
    <div className='container mx-auto p-8'>
      <h1 className='text-4xl font-bold mb-6'>Circle of Fifths</h1>
      <p className='text-lg mb-8'>Hover over any note to see its first position guitar chord shape.</p>
      <CircleOfFifths />
    </div>
  );
}
