"use client";

import React from "react";
import ChordScaleView from "../components/ChordScaleView";
import BentoPageLayout from "../components/BentoPageLayout";

export default function FretboardPage() {
  return (
    <BentoPageLayout
      title='Note Map'
    >
      <ChordScaleView />
    </BentoPageLayout>
  );
}
