"use client";

import { flatToSharp } from "@/app/lib/chordShapes";
import { useGuitarSettings } from "@/app/lib/guitarSettings";
import ChordFinder from "@/app/components/ChordFinder";
import GuitarToolView from "../GuitarToolView";

export default function ChordFinderTool() {
  const { rootNote, tuning } = useGuitarSettings();

  return (
    <GuitarToolView
      title="Chord Finder"
      tooltip="Click notes on the fretboard and this names every chord they spell. Positions of your Root Note are outlined so you can see where it sits on the neck."
    >
      <ChordFinder rootNote={flatToSharp[rootNote] ?? rootNote} tuning={tuning.notes} />
    </GuitarToolView>
  );
}
