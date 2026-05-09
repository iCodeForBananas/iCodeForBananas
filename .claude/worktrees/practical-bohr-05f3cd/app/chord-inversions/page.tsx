"use client";

import { useState, useMemo } from "react";
import {
  type ChordShape,
  sharpNotes,
  flatNotes,
  sharpToFlat,
  flatToSharp,
  chordShapes,
  buildChordKey,
  eShapeTemplates,
  aShapeTemplates,
  transposeShape,
  semitoneFromE,
  semitoneFromA,
} from "../lib/chordShapes";
import ChordDiagram from "../components/ChordDiagram";

const VOICINGS = ["Major", "Minor"] as const;
type Voicing = (typeof VOICINGS)[number];

interface InversionShape {
  shape: ChordShape;
  label: string;
}

// All templates anchored at C. Shift by semitonesFromC for other notes.
// String sets: A-D-G (strings 5-4-3), D-G-B (strings 4-3-2), G-B-E (strings 3-2-1)

const TEMPLATES: Record<Voicing, { root: ChordShape[]; first: ChordShape[]; second: ChordShape[] }> = {
  Major: {
    root: [
      { frets: [-1, 3, 2, 0, -1, -1], fingers: [0, 3, 2, 0, 0, 0] },   // A-D-G
      { frets: [-1, -1, 10, 9, 8, -1], fingers: [0, 0, 3, 2, 1, 0] },   // D-G-B
      { frets: [-1, -1, -1, 5, 5, 3], fingers: [0, 0, 0, 2, 3, 1] },    // G-B-E
    ],
    first: [
      { frets: [-1, 7, 5, 5, -1, -1], fingers: [0, 3, 1, 2, 0, 0] },   // A-D-G
      { frets: [-1, -1, 2, 0, 1, -1], fingers: [0, 0, 3, 0, 1, 0] },    // D-G-B
      { frets: [-1, -1, -1, 9, 8, 8], fingers: [0, 0, 0, 3, 1, 2] },    // G-B-E
    ],
    second: [
      { frets: [-1, 10, 10, 9, -1, -1], fingers: [0, 2, 3, 1, 0, 0] },  // A-D-G
      { frets: [-1, -1, 5, 5, 5, -1], fingers: [0, 0, 1, 1, 1, 0] },    // D-G-B
      { frets: [-1, -1, -1, 0, 1, 0], fingers: [0, 0, 0, 0, 1, 0] },    // G-B-E
    ],
  },
  Minor: {
    root: [
      { frets: [-1, 3, 1, 0, -1, -1], fingers: [0, 3, 1, 0, 0, 0] },   // A-D-G
      { frets: [-1, -1, 10, 8, 8, -1], fingers: [0, 0, 3, 1, 1, 0] },   // D-G-B
      { frets: [-1, -1, -1, 5, 4, 3], fingers: [0, 0, 0, 3, 2, 1] },    // G-B-E
    ],
    first: [
      { frets: [-1, 6, 5, 5, -1, -1], fingers: [0, 2, 1, 1, 0, 0] },   // A-D-G
      { frets: [-1, -1, 1, 0, 1, -1], fingers: [0, 0, 2, 0, 3, 0] },    // D-G-B
      { frets: [-1, -1, -1, 8, 8, 8], fingers: [0, 0, 0, 1, 1, 1] },    // G-B-E
    ],
    second: [
      { frets: [-1, 10, 10, 8, -1, -1], fingers: [0, 3, 3, 1, 0, 0] },  // A-D-G
      { frets: [-1, -1, 5, 5, 4, -1], fingers: [0, 0, 2, 3, 1, 0] },    // D-G-B
      { frets: [-1, -1, -1, 12, 13, 11], fingers: [0, 0, 0, 2, 3, 1] }, // G-B-E
    ],
  },
};

const STRING_SET_LABELS = ["Strings 5-4-3", "Strings 4-3-2", "Strings 3-2-1"];

const semitonesFromC = (note: string): number => {
  const canonical = flatToSharp[note] ?? note;
  return (sharpNotes.indexOf(canonical) - sharpNotes.indexOf("C") + 12) % 12;
};

const transposeInversion = (shape: ChordShape, semitones: number): ChordShape => ({
  frets: shape.frets.map((f) => (f === -1 ? -1 : f + semitones)),
  fingers: [...shape.fingers],
});

const getRootPositions = (note: string, voicing: Voicing): InversionShape[] => {
  const shapes: InversionShape[] = [];
  const seen = new Set<string>();

  // Full chord from library
  const canonical = flatToSharp[note] ?? note;
  const enharmonic = sharpToFlat[canonical] ?? flatToSharp[note];
  for (const n of [note, canonical, enharmonic].filter(Boolean) as string[]) {
    const key = buildChordKey(n, voicing);
    const s = chordShapes[key];
    if (s?.[0]) { const k = s[0].frets.join(","); if (!seen.has(k)) { seen.add(k); shapes.push({ shape: s[0], label: "Open/Standard" }); } break; }
  }
  // E-shape barre
  const eT = eShapeTemplates[voicing];
  if (eT) { const s = transposeShape(eT, semitoneFromE(note)); if (s) { const k = s.frets.join(","); if (!seen.has(k)) { seen.add(k); shapes.push({ shape: s, label: "E-Shape Barre" }); } } }
  // A-shape barre
  const aT = aShapeTemplates[voicing];
  if (aT) { const s = transposeShape(aT, semitoneFromA(note)); if (s) { const k = s.frets.join(","); if (!seen.has(k)) { seen.add(k); shapes.push({ shape: s, label: "A-Shape Barre" }); } } }
  // Triad root positions
  const shift = semitonesFromC(note);
  TEMPLATES[voicing].root.forEach((t, i) => {
    const s = transposeInversion(t, shift);
    const k = s.frets.join(",");
    if (!seen.has(k)) { seen.add(k); shapes.push({ shape: s, label: STRING_SET_LABELS[i] }); }
  });
  return shapes;
};

const getInversions = (note: string, voicing: Voicing, inv: "first" | "second"): InversionShape[] => {
  const shift = semitonesFromC(note);
  return TEMPLATES[voicing][inv].map((t, i) => ({
    shape: transposeInversion(t, shift),
    label: STRING_SET_LABELS[i],
  }));
};

export default function ChordInversionsPage() {
  const [selectedNote, setSelectedNote] = useState("C");
  const [useFlats, setUseFlats] = useState(false);
  const [voicing, setVoicing] = useState<Voicing>("Major");

  const displayNotes = useFlats ? flatNotes : sharpNotes;
  const chordName = `${selectedNote} ${voicing}`;

  const roots = useMemo(() => getRootPositions(selectedNote, voicing), [selectedNote, voicing]);
  const firsts = useMemo(() => getInversions(selectedNote, voicing, "first"), [selectedNote, voicing]);
  const seconds = useMemo(() => getInversions(selectedNote, voicing, "second"), [selectedNote, voicing]);

  const Section = ({ title, subtitle, items }: { title: string; subtitle: string; items: InversionShape[] }) => (
    <div className="mb-10">
      <h3 className="text-xl font-bold mb-1" style={{ color: "#000" }}>{title}</h3>
      <p className="text-sm text-[#1A1B1E]/50 mb-4">{subtitle}</p>
      <div className="flex flex-wrap gap-6">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <ChordDiagram shape={item.shape} label={item.label} useFlats={useFlats} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col flex-1">
      <main className="px-4 py-6 flex-1 metronome-static">
        <div className="w-full lg:max-w-5xl lg:mx-auto">
          <div className="rounded-lg p-6 bg-white">
            <div className="text-center mb-10">
              <h1 className="text-5xl font-bold drop-shadow-lg" style={{ color: "#000" }}>Chord Inversions</h1>
              <p className="text-lg mt-3" style={{ color: "#000" }}>All voicings for root position, 1st &amp; 2nd inversions</p>
            </div>
            <div className="p-6">
              <div className="mb-8 flex flex-wrap items-start gap-6">
                <div>
                  <p className="text-xs font-semibold text-[#1A1B1E]/50 uppercase tracking-wider mb-2">Root Note</p>
                  <div className="flex flex-wrap gap-2">
                    {displayNotes.map((note) => {
                      const active = selectedNote === note || (flatToSharp[selectedNote] ?? selectedNote) === (flatToSharp[note] ?? note);
                      return (
                        <button key={note} onClick={() => setSelectedNote(note)}
                          className={`px-3 py-1 rounded border text-sm transition-colors ${active ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"}`}>
                          {note}
                        </button>
                      );
                    })}
                    <span className="mx-1 text-[#1A1B1E]/30">|</span>
                    <button onClick={() => {
                      const newVal = !useFlats;
                      setUseFlats(newVal);
                      if (newVal) { const f = sharpToFlat[selectedNote]; if (f) setSelectedNote(f); }
                      else { const s = flatToSharp[selectedNote]; if (s) setSelectedNote(s); }
                    }} className={`px-3 py-1 rounded border text-sm transition-colors ${useFlats ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"}`}>
                      ♭ Flats
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#1A1B1E]/50 uppercase tracking-wider mb-2">Voicing</p>
                  <div className="flex gap-2">
                    {VOICINGS.map((v) => (
                      <button key={v} onClick={() => setVoicing(v)}
                        className={`px-4 py-1 rounded border text-sm transition-colors ${voicing === v ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold mb-6" style={{ color: "#000" }}>{chordName}</h2>

              <Section title="Root Position" subtitle="1 – 3 – 5 (root note in the bass)" items={roots} />
              <Section title="1st Inversion" subtitle="3 – 5 – 1 (3rd in the bass)" items={firsts} />
              <Section title="2nd Inversion" subtitle="5 – 1 – 3 (5th in the bass)" items={seconds} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
