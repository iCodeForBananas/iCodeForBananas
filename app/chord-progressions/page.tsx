"use client";

import React from "react";
import ProgressionsView from "../components/ProgressionsView";
import BentoPageLayout from "../components/BentoPageLayout";

export default function ChordProgressionsPage() {
  return (
    <BentoPageLayout
      title='Chord Progressions'
    >
      <ProgressionsView />
    </BentoPageLayout>
  );
}
