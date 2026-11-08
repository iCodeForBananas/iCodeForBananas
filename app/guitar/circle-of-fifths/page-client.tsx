"use client";

import { flatToSharp, sharpToFlat } from "@/app/lib/chordShapes";
import { updateGuitarSettings, useGuitarSettings } from "@/app/lib/guitarSettings";
import CircleOfFifths from "@/app/components/CircleOfFifths";
import GuitarToolView from "../GuitarToolView";

export default function CircleOfFifthsTool() {
  const { rootNote, useFlats, tuning } = useGuitarSettings();

  // A key clicked on the wheel comes back spelled however the wheel spells it,
  // so re-spell it the way the settings are showing notes.
  const handleSelect = (note: string) => {
    const asSharp = flatToSharp[note] ?? note;
    updateGuitarSettings({ rootNote: useFlats ? sharpToFlat[asSharp] ?? asSharp : asSharp });
  };

  return (
    <GuitarToolView
      title="Circle of Fifths"
      tooltip="Keys close together on the wheel share the most notes and sound natural played in sequence. Your Root Note is marked wherever it appears, and clicking any key makes it the new root for every tool."
    >
      <div className="mx-auto w-full max-w-[640px]">
        <CircleOfFifths activeNote={rootNote} onSelectNote={handleSelect} tuning={tuning} />
      </div>
    </GuitarToolView>
  );
}
