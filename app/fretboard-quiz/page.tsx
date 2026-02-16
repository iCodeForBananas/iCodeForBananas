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
          <div className='rounded-lg p-6'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold text-white drop-shadow-lg'>Fretboard Quiz</h1>
              <p className='text-lg text-white/80 mt-3'>Test your knowledge of scales on the guitar fretboard</p>
            </div>
            <div className='rounded-lg shadow-md p-6 bg-white'>
              <FretboardQuiz />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
