"use client";

import { flatToSharp } from "@/app/lib/chordShapes";
import { useGuitarSettings } from "@/app/lib/guitarSettings";
import ScaleTool from "@/app/components/ScaleTool";
import GuitarToolView from "../GuitarToolView";

export default function ScaleToolView() {
  const { rootNote, tuning } = useGuitarSettings();

  return (
    <GuitarToolView
      title="Scale Tool"
      tooltip="Every note of a scale laid out across all six strings and every fret. Pick a CAGED shape to narrow it to one position. The scale is built on the Root Note in Settings."
    >
      <ScaleTool rootKey={flatToSharp[rootNote] ?? rootNote} tuning={tuning.notes} />
    </GuitarToolView>
  );
}
