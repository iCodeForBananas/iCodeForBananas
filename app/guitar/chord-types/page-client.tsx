"use client";

import { chordTypes } from "@/app/lib/chordShapes";
import { useGuitarSettings } from "@/app/lib/guitarSettings";
import ChordTypeCard from "@/app/components/ChordTypeCard";
import GuitarToolView from "../GuitarToolView";

export default function ChordTypesTool() {
  const { rootNote, useFlats, tuning } = useGuitarSettings();

  return (
    <GuitarToolView
      title="Chord Types"
      tooltip="Every chord type available for this root note — each card shows a fretboard diagram, and its dropdown lets you switch between Open/Standard, E-Shape Barre, and A-Shape Barre voicings."
    >
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {chordTypes.map((type) => (
          <ChordTypeCard key={type} note={rootNote} type={type} useFlats={useFlats} tuning={tuning} />
        ))}
      </div>
    </GuitarToolView>
  );
}
