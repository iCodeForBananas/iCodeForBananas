"use client";

import { useMemo } from "react";
import { flatToSharp, sharpNotes, type ChordShape } from "@/app/lib/chordShapes";
import { formatChordLabel } from "@/app/lib/chordVoicings";
import { useGuitarSettings } from "@/app/lib/guitarSettings";
import GuitarToolView from "../GuitarToolView";
import VoicingCard from "../VoicingCard";

// ── Inversions ────────────────────────────────────────────────────────────────

type InvVoicing = "Major" | "Minor";

const INV_TEMPLATES: Record<InvVoicing, { root: ChordShape[]; first: ChordShape[]; second: ChordShape[] }> = {
  Major: {
    root: [
      { frets: [-1, 3, 2, 0, -1, -1], fingers: [0, 3, 2, 0, 0, 0] },
      { frets: [-1, -1, 10, 9, 8, -1], fingers: [0, 0, 3, 2, 1, 0] },
      { frets: [-1, -1, -1, 5, 5, 3], fingers: [0, 0, 0, 2, 3, 1] },
    ],
    first: [
      { frets: [-1, 7, 5, 5, -1, -1], fingers: [0, 3, 1, 2, 0, 0] },
      { frets: [-1, -1, 2, 0, 1, -1], fingers: [0, 0, 3, 0, 1, 0] },
      { frets: [-1, -1, -1, 9, 8, 8], fingers: [0, 0, 0, 3, 1, 2] },
    ],
    second: [
      { frets: [-1, 10, 10, 9, -1, -1], fingers: [0, 2, 3, 1, 0, 0] },
      { frets: [-1, -1, 5, 5, 5, -1], fingers: [0, 0, 1, 1, 1, 0] },
      { frets: [-1, -1, -1, 0, 1, 0], fingers: [0, 0, 0, 0, 1, 0] },
    ],
  },
  Minor: {
    root: [
      { frets: [-1, 3, 1, 0, -1, -1], fingers: [0, 3, 1, 0, 0, 0] },
      { frets: [-1, -1, 10, 8, 8, -1], fingers: [0, 0, 3, 1, 1, 0] },
      { frets: [-1, -1, -1, 5, 4, 3], fingers: [0, 0, 0, 3, 2, 1] },
    ],
    first: [
      { frets: [-1, 6, 5, 5, -1, -1], fingers: [0, 2, 1, 1, 0, 0] },
      { frets: [-1, -1, 1, 0, 1, -1], fingers: [0, 0, 2, 0, 3, 0] },
      { frets: [-1, -1, -1, 8, 8, 8], fingers: [0, 0, 0, 1, 1, 1] },
    ],
    second: [
      { frets: [-1, 10, 10, 8, -1, -1], fingers: [0, 3, 3, 1, 0, 0] },
      { frets: [-1, -1, 5, 5, 4, -1], fingers: [0, 0, 2, 3, 1, 0] },
      { frets: [-1, -1, -1, 12, 13, 11], fingers: [0, 0, 0, 2, 3, 1] },
    ],
  },
};

const STRING_SETS = ["Strings 5-4-3", "Strings 4-3-2", "Strings 3-2-1"];

const semitonesFromC = (note: string) => {
  const canonical = flatToSharp[note] ?? note;
  return (sharpNotes.indexOf(canonical) - sharpNotes.indexOf("C") + 12) % 12;
};

const shiftShape = (shape: ChordShape, n: number): ChordShape => ({
  frets: shape.frets.map((f) => (f === -1 ? -1 : f + n)),
  fingers: [...shape.fingers],
});

const getInversions = (note: string, voicing: InvVoicing) => {
  const shift = semitonesFromC(note);
  const t = INV_TEMPLATES[voicing];
  const map = (arr: ChordShape[]) => arr.map((s, i) => ({ shape: shiftShape(s, shift), strings: STRING_SETS[i] }));
  return { root: map(t.root), first: map(t.first), second: map(t.second) };
};

export default function InversionsTool() {
  const { rootNote: selectedNote, chordType: selectedType, useFlats, tuning } = useGuitarSettings();
  const chordLabel = formatChordLabel(selectedNote, selectedType);

  const invVoicing: InvVoicing | null = selectedType === "Major" ? "Major" : selectedType === "Minor" ? "Minor" : null;
  const inversions = useMemo(
    () => (invVoicing ? getInversions(selectedNote, invVoicing) : null),
    [selectedNote, invVoicing]
  );

  const inversionsContent = inversions ? (
    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line-subtle">
      {[
        {
          key: "root",
          title: "Root Position",
          subtitle: "1 – 3 – 5",
          tooltip: "The chord in its natural order — the root note (the note that names the chord) is the lowest note played",
          items: inversions.root,
        },
        {
          key: "first",
          title: "1st Inversion",
          subtitle: "3 – 5 – 1",
          tooltip: "The 3rd of the chord is now the lowest note — gives the chord a slightly lighter, softer feel",
          items: inversions.first,
        },
        {
          key: "second",
          title: "2nd Inversion",
          subtitle: "5 – 1 – 3",
          tooltip: "The 5th of the chord is the lowest note — creates a more open, floating sound that works great as a passing chord",
          items: inversions.second,
        },
      ].map((inv, idx) => (
        <div key={inv.key} className={`flex flex-col gap-1 pt-6 sm:pt-0${idx === 0 ? "" : " sm:pl-6"}${idx === 2 ? "" : " sm:pr-6"}`}>
          <span className="text-sm font-semibold text-ink-primary" title={inv.tooltip}>
            {inv.title}
          </span>
          <span
            className="text-xs text-ink-muted mb-4"
            title="The scale degrees played from lowest to highest string — 1 is the root, 3 is the third, 5 is the fifth"
          >
            {inv.subtitle}
          </span>
          <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
            {inv.items.map((item, i) => (
              <VoicingCard
                key={i}
                shape={item.shape}
                chordLabel={`${chordLabel} ${inv.title}`}
                sublabel={item.strings}
                useFlats={useFlats}
                tuning={tuning}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-ink-muted">
      Inversion voicings are available for Major and Minor chords. Pick one in Settings to explore.
    </p>
  );

  return (
    <GuitarToolView
      title="Inversions"
      tooltip="The same chord notes rearranged so a different note is on the bottom — inversions give the same chord a subtly different sound and feel. Shown as tight three-note voicings on adjacent string sets."
    >
      {inversionsContent}
    </GuitarToolView>
  );
}
