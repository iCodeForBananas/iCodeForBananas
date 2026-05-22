"use client";

import React from "react";
import FretboardQuiz from "../components/FretboardQuiz";
import BentoPageLayout from "../components/BentoPageLayout";

export default function FretboardQuizPage() {
  return (
    <BentoPageLayout
      title='Fretboard Quiz'
    >
      <FretboardQuiz />
    </BentoPageLayout>
  );
}
