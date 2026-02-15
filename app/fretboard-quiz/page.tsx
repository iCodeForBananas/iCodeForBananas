"use client";

import React from "react";
import FretboardQuiz from "../components/FretboardQuiz";
import PinnedChordProgression from "../components/PinnedChordProgression";

export default function FretboardQuizPage() {
  return (
    <div className='flex flex-col flex-1'>
      <PinnedChordProgression />
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
            <h1 className='text-2xl font-bold mb-4 text-gray-800'>Fretboard Quiz</h1>
            <p className='text-gray-600 mb-6'>
              Test your knowledge of scales on the guitar fretboard! Select a key and scale type,
              then click on fret positions to find all the notes in that scale.
            </p>
            <FretboardQuiz />
          </div>
        </div>
      </main>
    </div>
  );
}
