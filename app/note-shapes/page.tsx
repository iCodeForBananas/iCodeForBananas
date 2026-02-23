"use client";

import { useState } from "react";
import PinnedChordProgression from "../components/PinnedChordProgression";
import {
  type ChordShape,
  sharpNotes,
  flatNotes,
  chordTypes,
  stringNotes,
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

/** Collect all available voicings for a given note + chord type. */
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
      const fret = shift;
      const label = fret === 0 ? "A-Shape (Open)" : `A-Shape (${fret}fr)`;
      addIfNew(aShape, label);
    }
  }

  // 3. E-shape barre chord
  const eTemplate = eShapeTemplates[type];
  if (eTemplate) {
    const shift = semitoneFromE(note);
    const eShape = transposeShape(eTemplate, shift);
    if (eShape) {
      const fret = shift;
      const label = fret === 0 ? "E-Shape (Open)" : `E-Shape (${fret}fr)`;
      addIfNew(eShape, label);
    }
  }

  return voicings;
};

interface ChordDiagramProps {
  chord: string;
  label: string;
  shape: ChordShape;
  useFlats: boolean;
}

const ChordDiagram = ({ chord, label, shape, useFlats }: ChordDiagramProps) => {
  const noteNames = useFlats ? flatNotes : sharpNotes;

  const getNoteAtFret = (openNote: string, fret: number) => {
    const noteIndex = sharpNotes.indexOf(openNote);
    return noteNames[(noteIndex + fret) % 12];
  };

  const playedFrets = shape.frets.filter((f) => f > 0);
  const minFret = playedFrets.length > 0 ? Math.min(...playedFrets) : 1;
  const maxFret = playedFrets.length > 0 ? Math.max(...playedFrets) : 1;
  const startFret = minFret > 2 || maxFret > 5 ? minFret : 1;
  const displayFrets = 5;

  const stringSpacing = 22;
  const fretSpacing = 24;
  const diagramWidth = stringSpacing * 5 + 20;
  const diagramHeight = fretSpacing * displayFrets + 40;

  return (
    <div className='chord-diagram flex flex-col items-center'>
      <h6 className='text-center mb-0.5 font-semibold text-sm'>{chord}</h6>
      <p className='text-center text-xs text-gray-500 mb-1'>{label}</p>
      <div className='relative' style={{ width: `${diagramWidth}px`, height: `${diagramHeight}px` }}>
        {/* Muted / Open string indicators */}
        <div className='flex' style={{ paddingLeft: "10px", marginBottom: "2px" }}>
          {shape.frets.map((fret, i) => (
            <span
              key={i}
              className='text-center text-xs font-medium'
              style={{ width: `${stringSpacing}px`, color: fret === -1 ? "#9ca3af" : "transparent" }}
            >
              {fret === -1 ? "✕" : ""}
            </span>
          ))}
        </div>

        {/* Starting fret indicator */}
        {startFret > 1 && (
          <span
            className='absolute text-xs font-medium text-gray-500'
            style={{ left: `${diagramWidth + 2}px`, top: "24px" }}
          >
            {startFret}fr
          </span>
        )}

        {/* Strings (vertical lines) */}
        {[0, 1, 2, 3, 4, 5].map((stringIndex) => (
          <div
            key={stringIndex}
            className='absolute bg-gray-400'
            style={{
              left: `${stringIndex * stringSpacing + 10}px`,
              top: "20px",
              width: "1px",
              height: `${fretSpacing * displayFrets}px`,
              zIndex: 1,
            }}
          />
        ))}

        {/* Frets (horizontal lines) */}
        {Array.from({ length: displayFrets + 1 }, (_, i) => i).map((fret) => (
          <div
            key={fret}
            className={`absolute ${fret === 0 && startFret <= 1 ? "bg-gray-800" : "bg-gray-400"}`}
            style={{
              left: "6px",
              top: `${20 + fret * fretSpacing}px`,
              width: `${stringSpacing * 5 + 8}px`,
              height: fret === 0 && startFret <= 1 ? "3px" : "1px",
              zIndex: 1,
            }}
          />
        ))}

        {/* Finger dots */}
        {shape.frets.map((fretNum, stringIndex) => {
          if (fretNum === -1) return null;

          const note = getNoteAtFret(stringNotes[stringIndex], fretNum);
          const dotSize = 18;

          if (fretNum === 0) {
            return (
              <div
                key={stringIndex}
                className='absolute rounded-full border-2 border-blue-500 bg-white flex items-center justify-center font-bold'
                style={{
                  left: `${stringIndex * stringSpacing + 10 - dotSize / 2}px`,
                  top: `${20 - dotSize - 2}px`,
                  width: `${dotSize}px`,
                  height: `${dotSize}px`,
                  fontSize: "9px",
                  zIndex: 2,
                }}
              >
                {note}
              </div>
            );
          } else if (fretNum > 0) {
            const displayPos = fretNum - startFret;
            return (
              <div
                key={stringIndex}
                className='absolute bg-blue-500 rounded-full text-white flex items-center justify-center font-bold'
                style={{
                  left: `${stringIndex * stringSpacing + 10 - dotSize / 2}px`,
                  top: `${20 + displayPos * fretSpacing + fretSpacing / 2 - dotSize / 2}px`,
                  width: `${dotSize}px`,
                  height: `${dotSize}px`,
                  fontSize: "9px",
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

export default function NoteShapesPage() {
  const [selectedNote, setSelectedNote] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("note-shapes-selectedNote") || "C";
    }
    return "C";
  });

  const [selectedType, setSelectedType] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("note-shapes-selectedType") || "Major";
    }
    return "Major";
  });

  const [useFlats, setUseFlats] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("note-shapes-useFlats") === "true";
    }
    return false;
  });

  const displayNotes = useFlats ? flatNotes : sharpNotes;
  const chordLabel = formatChordLabel(selectedNote, selectedType);
  const voicings = getAllVoicings(selectedNote, selectedType);

  return (
    <div className='flex flex-col flex-1'>
      <PinnedChordProgression />
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg p-6'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold text-white drop-shadow-lg'>Note Shapes</h1>
              <p className='text-lg text-white/80 mt-3'>All voicings for a single chord</p>
            </div>
            <div className='rounded-lg shadow-md p-6 bg-white'>
              {/* Controls */}
              <div className='mb-6 space-y-4'>
                {/* Note selector */}
                <div>
                  <p className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2'>Root Note</p>
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
                    <span className='mx-1 text-gray-300'>|</span>
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

                {/* Chord type selector */}
                <div>
                  <p className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2'>Chord Type</p>
                  <div className='flex flex-wrap gap-2'>
                    {chordTypes.map((type) => {
                      const active = selectedType === type;
                      return (
                        <button
                          key={type}
                          type='button'
                          aria-pressed={active}
                          onClick={() => {
                            setSelectedType(type);
                            localStorage.setItem("note-shapes-selectedType", type);
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
              </div>

              {/* Voicings grid */}
              {voicings.length > 0 ? (
                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 mt-4'>
                  {voicings.map(({ shape, label }, idx) => (
                    <div key={idx} className='flex justify-center'>
                      <ChordDiagram chord={chordLabel} label={label} shape={shape} useFlats={useFlats} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className='text-center text-gray-500 mt-8'>No voicings found for {chordLabel}.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
