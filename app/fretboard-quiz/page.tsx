"use client";

import React from "react";
import FretboardQuiz from "../components/FretboardQuiz";

export default function FretboardQuizPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='pr-4 py-4 flex-1 '>
          <div className='rounded-lg p-6 bg-white'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>
                Fretboard Quiz
              </h1>
              <p className='text-lg mt-3' style={{ color: "#000" }}>
                Test your knowledge of scales on the guitar fretboard
              </p>
            </div>
            <div className='p-6'>
              <FretboardQuiz />
            </div>
          </div>
      </main>
    </div>
  );
}
