"use client";

import { useState } from "react";

const allNotes = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
const chordTypes = ["Major", "Minor", "7", "m7", "Sus4", "Add9", "9", "13", "Maj7", "Maj9", "Maj13"];

interface ChordShape {
  frets: number[];
  fingers: number[];
}

const chordShapes: Record<string, ChordShape[]> = {
  "C Major": [{ frets: [0, 1, 0, 2, 3, 0], fingers: [0, 1, 0, 2, 3, 0] }],
  "C Minor": [{ frets: [0, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1] }],
  "C Maj7": [{ frets: [0, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] }],
  C7: [{ frets: [0, 1, 3, 2, 3, 1], fingers: [0, 1, 3, 2, 4, 1] }],
  Cm7: [{ frets: [0, 1, 3, 1, 2, 1], fingers: [0, 1, 3, 1, 2, 1] }],
  "C Sus4": [{ frets: [0, 1, 1, 3, 4, 1], fingers: [0, 1, 1, 3, 4, 1] }],
  "C Add9": [{ frets: [0, 3, 2, 0, 3, 0], fingers: [0, 3, 2, 0, 4, 0] }],
  "C Maj9": [{ frets: [0, 3, 2, 0, 3, 0], fingers: [0, 3, 2, 0, 4, 0] }],
  "C Maj13": [{ frets: [0, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] }],
  "D Major": [{ frets: [0, 0, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] }],
  "D Minor": [{ frets: [0, 0, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] }],
  "D Maj7": [{ frets: [0, 0, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] }],
  D7: [{ frets: [0, 0, 0, 2, 1, 2], fingers: [0, 0, 0, 3, 1, 2] }],
  Dm7: [{ frets: [0, 0, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] }],
  "D Sus4": [{ frets: [0, 0, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] }],
  "D Add9": [{ frets: [0, 0, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0] }],
  "D Maj9": [{ frets: [0, 0, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0] }],
  "D Maj13": [{ frets: [0, 0, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] }],
  "E Major": [{ frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] }],
  "E Minor": [{ frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] }],
  "E Maj7": [{ frets: [0, 2, 1, 1, 0, 0], fingers: [0, 2, 1, 1, 0, 0] }],
  E7: [{ frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] }],
  Em7: [{ frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] }],
  "E Sus4": [{ frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0] }],
  "E Add9": [{ frets: [0, 2, 2, 1, 0, 2], fingers: [0, 2, 3, 1, 0, 4] }],
  "E Maj9": [{ frets: [0, 2, 2, 1, 0, 2], fingers: [0, 2, 3, 1, 0, 4] }],
  "E Maj13": [{ frets: [0, 2, 1, 1, 0, 0], fingers: [0, 2, 1, 1, 0, 0] }],
  "F Major": [{ frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1] }],
  "F Minor": [{ frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1] }],
  "F Maj7": [{ frets: [1, 3, 2, 2, 1, 1], fingers: [1, 4, 2, 3, 1, 1] }],
  F7: [{ frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1] }],
  Fm7: [{ frets: [1, 3, 1, 1, 1, 1], fingers: [1, 3, 1, 1, 1, 1] }],
  "F Sus4": [{ frets: [1, 3, 3, 3, 1, 1], fingers: [1, 2, 3, 4, 1, 1] }],
  "F Add9": [{ frets: [1, 3, 3, 0, 1, 1], fingers: [1, 3, 4, 0, 1, 1] }],
  "F Maj9": [{ frets: [1, 3, 3, 0, 1, 1], fingers: [1, 3, 4, 0, 1, 1] }],
  "F Maj13": [{ frets: [1, 3, 2, 2, 1, 1], fingers: [1, 4, 2, 3, 1, 1] }],
  "G Major": [{ frets: [3, 2, 0, 0, 3, 3], fingers: [3, 1, 0, 0, 4, 4] }],
  "G Minor": [{ frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1] }],
  "G Maj7": [{ frets: [3, 2, 0, 0, 0, 2], fingers: [3, 1, 0, 0, 0, 2] }],
  G7: [{ frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] }],
  Gm7: [{ frets: [3, 5, 3, 3, 3, 3], fingers: [1, 4, 1, 1, 1, 1] }],
  "G Sus4": [{ frets: [3, 3, 0, 0, 1, 3], fingers: [3, 4, 0, 0, 1, 3] }],
  "G Add9": [{ frets: [3, 0, 0, 2, 0, 3], fingers: [3, 0, 0, 2, 0, 4] }],
  "G Maj9": [{ frets: [3, 0, 0, 2, 0, 3], fingers: [3, 0, 0, 2, 0, 4] }],
  "G Maj13": [{ frets: [3, 2, 0, 0, 0, 2], fingers: [3, 1, 0, 0, 0, 2] }],
  "A Major": [{ frets: [0, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] }],
  "A Minor": [{ frets: [0, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] }],
  "A Maj7": [{ frets: [0, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] }],
  A7: [{ frets: [0, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] }],
  Am7: [{ frets: [0, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] }],
  "A Sus4": [{ frets: [0, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 4, 0] }],
  "A Add9": [{ frets: [0, 0, 2, 4, 2, 0], fingers: [0, 0, 1, 4, 2, 0] }],
  "A Maj9": [{ frets: [0, 0, 2, 4, 2, 0], fingers: [0, 0, 1, 4, 2, 0] }],
  "A Maj13": [{ frets: [0, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] }],
  "B Major": [{ frets: [2, 2, 4, 4, 4, 2], fingers: [1, 1, 2, 3, 4, 1] }],
  "B Minor": [{ frets: [2, 2, 4, 4, 3, 2], fingers: [1, 1, 3, 4, 2, 1] }],
  "B Maj7": [{ frets: [2, 2, 4, 3, 4, 2], fingers: [1, 1, 3, 2, 4, 1] }],
  B7: [{ frets: [2, 2, 1, 2, 0, 2], fingers: [2, 3, 1, 4, 0, 2] }],
  Bm7: [{ frets: [2, 2, 4, 2, 3, 2], fingers: [1, 1, 3, 1, 2, 1] }],
  "B Sus4": [{ frets: [2, 2, 4, 4, 5, 2], fingers: [1, 1, 2, 3, 4, 1] }],
  "B Add9": [{ frets: [2, 2, 4, 4, 2, 2], fingers: [1, 1, 3, 4, 1, 1] }],
  "B Maj9": [{ frets: [2, 2, 4, 4, 2, 2], fingers: [1, 1, 3, 4, 1, 1] }],
  "B Maj13": [{ frets: [2, 2, 4, 3, 4, 2], fingers: [1, 1, 3, 2, 4, 1] }],
};

const sharpBaseMap: Record<string, string> = {
  "A#": "A",
  "C#": "C",
  "D#": "D",
  "F#": "F",
  "G#": "G",
};

const normalizeTypeForShape = (type: string) => {
  switch (type) {
    case "maj7":
    case "Maj7":
      return "Maj7";
    default:
      return type;
  }
};

const buildChordKey = (note: string, type: string) => {
  const normalized = normalizeTypeForShape(type);
  if (normalized === "7" || normalized === "m7") {
    return `${note}${normalized}`;
  }
  return `${note} ${normalized}`;
};

const formatChordLabel = (note: string, type: string) => {
  if (type === "7" || type === "m7" || type === "9" || type === "13") {
    return `${note}${type}`;
  }
  return `${note} ${type}`;
};

const transposeShape = (shape: ChordShape, semitoneShift: number): ChordShape | null => {
  if (!shape || !Array.isArray(shape.frets)) return null;
  return {
    frets: shape.frets.map((fret) => (fret === -1 ? -1 : fret + semitoneShift)),
    fingers: shape.fingers ? [...shape.fingers] : [],
  };
};

const resolveChordShape = (note: string, type: string): ChordShape | null => {
  const tryKey = (n: string, t: string) => chordShapes[buildChordKey(n, t)]?.[0] || null;

  const direct = tryKey(note, type);
  if (direct) return direct;

  const fallbacks: Record<string, string[]> = {
    maj9: ["Add9", "Maj7", "Major"],
    maj13: ["Maj7", "Add9", "Major"],
    9: ["7", "Add9", "Major"],
    13: ["7", "9", "Add9", "Major"],
  };
  const fallbackList = fallbacks[type] || [];

  for (const fb of fallbackList) {
    const found = tryKey(note, fb);
    if (found) return found;
  }

  const baseNote = sharpBaseMap[note];
  if (baseNote) {
    const baseExact = tryKey(baseNote, type);
    if (baseExact) return transposeShape(baseExact, 1);
    for (const fb of fallbackList) {
      const baseFound = tryKey(baseNote, fb);
      if (baseFound) return transposeShape(baseFound, 1);
    }
  }

  return null;
};

interface ChordDiagramProps {
  chord: string;
  shape: ChordShape;
}

const ChordDiagram = ({ chord, shape }: ChordDiagramProps) => {
  const stringNotes = ["E", "A", "D", "G", "B", "E"];
  const allNotes = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];

  const getNoteAtFret = (openNote: string, fret: number) => {
    const noteIndex = allNotes.indexOf(openNote);
    return allNotes[(noteIndex + fret) % 12];
  };

  return (
    <div className='chord-diagram mb-4 flex flex-col items-center'>
      <h6 className='text-center mb-2 font-semibold'>{chord}</h6>
      <div className='relative' style={{ width: "120px", height: "140px" }}>
        <div className='flex justify-between mb-1 text-xs'>
          {stringNotes.map((string, i) => (
            <span key={i} className='w-4 text-center'>
              {string}
            </span>
          ))}
        </div>

        {[0, 1, 2, 3, 4, 5].map((stringIndex) => (
          <div
            key={stringIndex}
            className='absolute bg-gray-400'
            style={{
              left: `${stringIndex * 20 + 8}px`,
              top: "20px",
              width: "1px",
              height: "100px",
              zIndex: 1,
            }}
          />
        ))}

        {[0, 1, 2, 3, 4].map((fret) => (
          <div
            key={fret}
            className={`absolute ${fret === 0 ? "bg-gray-800" : "bg-gray-600"}`}
            style={{
              left: "0px",
              top: `${20 + fret * 20}px`,
              width: "100%",
              height: "2px",
              zIndex: 1,
            }}
          />
        ))}

        {shape.frets.map((fretNum, stringIndex) => {
          if (fretNum === -1) return null;

          const note = getNoteAtFret(stringNotes[stringIndex], fretNum);

          if (fretNum === 0) {
            return (
              <div
                key={stringIndex}
                className='absolute border-2 border-blue-500 rounded-full bg-white flex items-center justify-center text-xs font-bold'
                style={{
                  left: `${stringIndex * 20 + 1}px`,
                  top: "5px",
                  width: "14px",
                  height: "14px",
                  zIndex: 2,
                }}
              >
                {note}
              </div>
            );
          } else if (fretNum > 0) {
            return (
              <div
                key={stringIndex}
                className='absolute bg-blue-500 rounded-full text-white flex items-center justify-center text-xs font-bold'
                style={{
                  left: `${stringIndex * 20 + 1}px`,
                  top: `${10 + fretNum * 20}px`,
                  width: "14px",
                  height: "14px",
                  zIndex: 2,
                }}
              >
                {note}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};

export default function ChordShapesPage() {
  const [selectedType, setSelectedType] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chord-shapes-selectedType") || "Major";
    }
    return "Major";
  });

  return (
    <div className='flex flex-col flex-1'>
      <Navigation />
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg border border-border bg-white p-8 shadow-sm'>
            <div className='mb-8'>
              <div className='flex flex-wrap gap-2 justify-center'>
                {chordTypes.map((type) => {
                  const active = selectedType === type;
                  return (
                    <button
                      key={type}
                      type='button'
                      aria-pressed={active}
                      onClick={() => {
                        setSelectedType(type);
                        localStorage.setItem("chord-shapes-selectedType", type);
                      }}
                      className={`px-3 py-1 rounded border text-sm transition-colors ${
                        active ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'>
              {allNotes.map((note) => {
                const chordName = formatChordLabel(note, selectedType);
                const shape = resolveChordShape(note, selectedType);

                return (
                  <div key={note} className='flex justify-center'>
                    {shape ? (
                      <ChordDiagram chord={chordName} shape={shape} />
                    ) : (
                      <div className='text-center'>
                        <h6 className='font-semibold'>{chordName}</h6>
                        <p className='text-gray-500 text-sm'>Shape not available</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import Navigation from "../components/Navigation";
