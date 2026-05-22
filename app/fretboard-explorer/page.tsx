"use client";

import React from "react";
import ChordScaleView from "../components/ChordScaleView";
import BentoPageLayout from "../components/BentoPageLayout";

export default function FretboardPage() {
  return (
    <BentoPageLayout
      title='Fretboard Explorer'
      category='Music Theory'
      description='Explore chords and scales on the guitar fretboard'
    >
      <ChordScaleView />
    </BentoPageLayout>
  );
}
