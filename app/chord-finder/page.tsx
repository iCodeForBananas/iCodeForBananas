"use client";

import React from "react";
import ChordFinder from "../components/ChordFinder";
import BentoPageLayout from "../components/BentoPageLayout";

export default function ChordFinderPage() {
  return (
    <BentoPageLayout
      title='Chord Finder'
    >
      <ChordFinder />
    </BentoPageLayout>
  );
}
