"use client";

import { useState } from "react";
import {
  type ChordShape,
  sharpNotes,
  flatNotes,
  chordTypes,
  resolveChordShape,
} from "../lib/chordShapes";
import ChordDiagram from "../components/ChordDiagram";

const formatChordLabel = (note: string, type: string) => {
  if (type === "6" || type === "7" || type === "m7" || type === "9" || type === "13") {
    return `${note}${type}`;
  }
  return `${note} ${type}`;
};

export default function ChordShapesPage() {
  const [selectedType, setSelectedType] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chord-diagrams-selectedType") || "Major";
    }
    return "Major";
  });

  const [useFlats, setUseFlats] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chord-diagrams-useFlats") === "true";
    }
    return false;
  });

  const displayNotes = useFlats ? flatNotes : sharpNotes;

  return (
    <div className='flex flex-col flex-1'>
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg p-6 bg-white'>
            <div className='text-center mb-10'>
              <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>Chord Diagrams</h1>
              <p className='text-lg mt-3' style={{ color: "#000" }}>Fingering diagrams for every chord type across all 12 keys</p>
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
                          localStorage.setItem("chord-diagrams-selectedType", type);
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
                      localStorage.setItem("chord-diagrams-useFlats", String(!useFlats));
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
                        <ChordDiagram label={chordName} shape={shape} useFlats={useFlats} />
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
