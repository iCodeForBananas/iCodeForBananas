"use client";

import { useState, useMemo } from "react";
import {
  type ChordShape,
  sharpNotes,
  flatNotes,
  chordTypes,
  sharpToFlat,
  flatToSharp,
  chordShapes,
  eShapeTemplates,
  aShapeTemplates,
  buildChordKey,
  transposeShape,
  semitoneFromE,
  semitoneFromA,
} from "../lib/chordShapes";
import ChordDiagram from "../components/ChordDiagram";

interface LabeledShape {
  shape: ChordShape;
  label: string;
}

const formatChordLabel = (note: string, type: string) => {
  if (type === "6" || type === "7" || type === "m7" || type === "9" || type === "13") {
    return `${note}${type}`;
  }
  return `${note} ${type}`;
};

/** Collect all available voicings for a given note + chord type (deduplicated). */
const getAllVoicings = (note: string, type: string): LabeledShape[] => {
  const voicings: LabeledShape[] = [];
  const seenFrets = new Set<string>();

  const addIfNew = (shape: ChordShape | null, label: string) => {
    if (!shape) return;
    const key = shape.frets.join(",");
    if (seenFrets.has(key)) return;
    seenFrets.add(key);
    voicings.push({ shape, label });
  };

  // 1. Standard / open position from the chord-shapes data
  const canonicalNote = flatToSharp[note] ?? note;
  const enharmonic = sharpToFlat[canonicalNote] ?? flatToSharp[note];

  for (const n of [note, canonicalNote, enharmonic].filter(Boolean) as string[]) {
    const key = buildChordKey(n, type);
    const shapes = chordShapes[key];
    if (shapes && shapes.length > 0) {
      shapes.forEach((s, i) => addIfNew(s, i === 0 ? "Standard" : `Standard (${i + 1})`));
      break;
    }
  }

  // 2. A-shape barre chord
  const aTemplate = aShapeTemplates[type];
  if (aTemplate) {
    const shift = semitoneFromA(note);
    const aShape = transposeShape(aTemplate, shift);
    if (aShape) {
      const label = shift === 0 ? "A-Shape (Open)" : `A-Shape (${shift}fr)`;
      addIfNew(aShape, label);
    }
  }

  // 3. E-shape barre chord
  const eTemplate = eShapeTemplates[type];
  if (eTemplate) {
    const shift = semitoneFromE(note);
    const eShape = transposeShape(eTemplate, shift);
    if (eShape) {
      const label = shift === 0 ? "E-Shape (Open)" : `E-Shape (${shift}fr)`;
      addIfNew(eShape, label);
    }
  }

  return voicings;
};

const POSITION_TYPES = ["Standard", "A-Shape", "E-Shape"] as const;
type PositionType = (typeof POSITION_TYPES)[number];

interface ChordCardProps {
  note: string;
  type: string;
  useFlats: boolean;
  position: PositionType;
}

/** A single chord card displaying the voicing that matches the global position. */
const ChordCard = ({ note, type, useFlats, position }: ChordCardProps) => {
  const voicings = useMemo(() => getAllVoicings(note, type), [note, type]);
  const chordLabel = formatChordLabel(note, type);

  if (voicings.length === 0) {
    return (
      <div className='flex flex-col items-center p-2'>
        <p className='font-semibold text-sm mb-1'>{chordLabel}</p>
        <p className='text-[#1A1B1E]/40 text-xs'>N/A</p>
      </div>
    );
  }

  const matchIdx = voicings.findIndex((v) => v.label.startsWith(position));
  const current = voicings[matchIdx !== -1 ? matchIdx : 0];

  return (
    <div className='flex flex-col items-center gap-1'>
      <p className='font-semibold text-sm'>{chordLabel}</p>
      <ChordDiagram shape={current.shape} useFlats={useFlats} />
    </div>
  );
};

export default function NoteShapesPage() {
  const [selectedNote, setSelectedNote] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("note-shapes-selectedNote") || "C";
    }
    return "C";
  });

  const [useFlats, setUseFlats] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("note-shapes-useFlats") === "true";
    }
    return false;
  });

  const [position, setPosition] = useState<PositionType>("Standard");

  const displayNotes = useFlats ? flatNotes : sharpNotes;

  return (
    <div className='flex flex-col flex-1'>
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg p-6 bg-white'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>Chord Voicings</h1>
              <p className='text-lg mt-3' style={{ color: "#000" }}>All chords for a root note with multiple voicings</p>
            </div>
            <div className='p-6'>
              {/* Root note selector + position dropdown */}
              <div className='mb-6 flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <p className='text-xs font-semibold text-[#1A1B1E]/50 uppercase tracking-wider mb-2'>Root Note</p>
                  <div className='flex flex-wrap gap-2'>
                    {displayNotes.map((note) => {
                      const active =
                        selectedNote === note ||
                        (flatToSharp[selectedNote] ?? selectedNote) === (flatToSharp[note] ?? note);
                      return (
                        <button
                          key={note}
                          type='button'
                          aria-pressed={active}
                          onClick={() => {
                            setSelectedNote(note);
                            localStorage.setItem("note-shapes-selectedNote", note);
                          }}
                          className={`px-3 py-1 rounded border text-sm transition-colors ${
                            active ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"
                          }`}
                        >
                          {note}
                        </button>
                      );
                    })}
                    <span className='mx-1 text-[#1A1B1E]/30'>|</span>
                    <button
                      type='button'
                      aria-pressed={useFlats}
                      onClick={() => {
                        const newVal = !useFlats;
                        setUseFlats(newVal);
                        localStorage.setItem("note-shapes-useFlats", String(newVal));
                        // Convert selected note when switching notation
                        if (newVal) {
                          const asFlat = sharpToFlat[selectedNote];
                          if (asFlat) {
                            setSelectedNote(asFlat);
                            localStorage.setItem("note-shapes-selectedNote", asFlat);
                          }
                        } else {
                          const asSharp = flatToSharp[selectedNote];
                          if (asSharp) {
                            setSelectedNote(asSharp);
                            localStorage.setItem("note-shapes-selectedNote", asSharp);
                          }
                        }
                      }}
                      className={`px-3 py-1 rounded border text-sm transition-colors ${
                        useFlats ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"
                      }`}
                    >
                      ♭ Flats
                    </button>
                  </div>
                </div>

                {/* Global fret position selector */}
                <div className='flex flex-col items-end gap-1'>
                  <p className='text-xs font-semibold text-[#1A1B1E]/50 uppercase tracking-wider'>Fret Position</p>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as PositionType)}
                    className='text-sm border border-[#373A40]/20 rounded px-2 py-1 bg-[#1A1B1E] text-[#12B886]'
                    aria-label='Fret position for all shapes'
                  >
                    {POSITION_TYPES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* All chord types for the selected note */}
              <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6'>
                {chordTypes.map((type) => (
                  <div key={type} className='flex justify-center'>
                    <ChordCard note={selectedNote} type={type} useFlats={useFlats} position={position} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
