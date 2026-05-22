"use client";

import React from "react";
import ChordFinder from "../components/ChordFinder";
import BentoPageLayout from "../components/BentoPageLayout";

export default function ChordFinderPage() {
  return (
    <BentoPageLayout
      title='Chord Finder'
      category='Music Theory'
      description='Click notes on the fretboard and discover what chord you&apos;re playing'
    >
      <ChordFinder />
    </BentoPageLayout>
  );
}
