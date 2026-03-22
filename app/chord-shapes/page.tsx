"use client";

import { useState } from "react";
import {
  type ChordShape,
  sharpNotes,
  flatNotes,
  chordTypes,
  stringNotes,
  resolveChordShape,
} from "../lib/chordShapes";

const formatChordLabel = (note: string, type: string) => {
  if (type === "6" || type === "7" || type === "m7" || type === "9" || type === "13") {
    return `${note}${type}`;
  }
  return `${note} ${type}`;
};

interface ChordDiagramProps {
  chord: string;
  shape: ChordShape;
  useFlats: boolean;
}

const ChordDiagram = ({ chord, shape, useFlats }: ChordDiagramProps) => {
  const noteNames = useFlats ? flatNotes : sharpNotes;

  const getNoteAtFret = (openNote: string, fret: number) => {
    const noteIndex = sharpNotes.indexOf(openNote);
    return noteNames[(noteIndex + fret) % 12];
  };

  const minFret = Math.min(...shape.frets.filter((f) => f > 0));
  const maxFret = Math.max(...shape.frets.filter((f) => f > 0));
  const startFret = minFret > 2 || maxFret > 5 ? minFret : 1;
  const displayFrets = 5;

  const stringSpacing = 22;
  const fretSpacing = 24;
  const diagramWidth = stringSpacing * 5 + 20;
  const diagramHeight = fretSpacing * displayFrets + 40;

  return (
    <div className='chord-diagram flex flex-col items-center'>
      <h6 className='text-center mb-1 font-semibold text-sm'>{chord}</h6>
      <div className='relative' style={{ width: `${diagramWidth}px`, height: `${diagramHeight}px` }}>
        {/* Muted / Open string indicators */}
        <div className='flex' style={{ paddingLeft: "10px", marginBottom: "2px" }}>
          {shape.frets.map((fret, i) => (
            <span
              key={i}
              className='text-center text-xs font-medium'
              style={{ width: `${stringSpacing}px`, color: fret === -1 ? "#000000" : "transparent" }}
            >
              {fret === -1 ? "✕" : ""}
            </span>
          ))}
        </div>

        {/* Starting fret indicator */}
        {startFret > 1 && (
          <span
            className='absolute text-xs font-medium text-[#1A1B1E]/50'
            style={{ left: `${diagramWidth + 2}px`, top: "24px" }}
          >
            {startFret}fr
          </span>
        )}

        {/* Strings (vertical lines) */}
        {[0, 1, 2, 3, 4, 5].map((stringIndex) => (
          <div
            key={stringIndex}
            className='absolute bg-[#1A1B1E]/40'
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
            className={`absolute ${fret === 0 && startFret <= 1 ? "bg-[#1A1B1E]" : "bg-[#1A1B1E]/40"}`}
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
                className='absolute rounded-full border-2 border-[#12B886] bg-[#1A1B1E] flex items-center justify-center font-bold'
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
                className='absolute bg-[#12B886] rounded-full text-[#1A1B1E] flex items-center justify-center font-bold'
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

export default function ChordShapesPage() {
  const [selectedType, setSelectedType] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chord-shapes-selectedType") || "Major";
    }
    return "Major";
  });

  const [useFlats, setUseFlats] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chord-shapes-useFlats") === "true";
    }
    return false;
  });

  const displayNotes = useFlats ? flatNotes : sharpNotes;

  return (
    <div className='flex flex-col flex-1'>
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg p-6'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold text-[#000000] drop-shadow-lg'>Chord Shapes</h1>
              <p className='text-lg text-[#000000]/70 mt-3'>Browse chord diagrams for every key</p>
            </div>
            <div className='p-6'>
              <div className='mb-6'>
                <div className='flex flex-wrap gap-2 justify-center items-center'>
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
                  <span className='mx-1 text-[#1A1B1E]/30'>|</span>
                  <button
                    type='button'
                    aria-pressed={useFlats}
                    onClick={() => {
                      setUseFlats(!useFlats);
                      localStorage.setItem("chord-shapes-useFlats", String(!useFlats));
                    }}
                    className={`px-3 py-1 rounded border text-sm transition-colors ${
                      useFlats ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"
                    }`}
                  >
                    ♭ Flats
                  </button>
                </div>
              </div>

              <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'>
                {displayNotes.map((note) => {
                  const chordName = formatChordLabel(note, selectedType);
                  const shape = resolveChordShape(note, selectedType);

                  return (
                    <div key={note} className='flex justify-center'>
                      {shape ? (
                        <ChordDiagram chord={chordName} shape={shape} useFlats={useFlats} />
                      ) : (
                        <div className='text-center'>
                          <h6 className='font-semibold text-sm'>{chordName}</h6>
                           <p className='text-[#1A1B1E]/50 text-xs'>Shape not available</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
