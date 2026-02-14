"use client";

import { useState } from "react";
import PinnedChordProgression from "../components/PinnedChordProgression";

const sharpNotes = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
const flatNotes = ["A", "Bb", "B", "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab"];
const chordTypes = ["Major", "Minor", "7", "m7", "Sus2", "Sus4", "Add9", "9", "13", "Maj7", "Maj9", "Maj13"];
const stringNotes = ["E", "A", "D", "G", "B", "E"];

interface ChordShape {
  frets: number[];
  fingers: number[];
}

const chordShapes: Record<string, ChordShape[]> = {
  "C Major": [{ frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] }],
  "C Minor": [{ frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1] }],
  "C Maj7": [{ frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] }],
  C7: [{ frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] }],
  Cm7: [{ frets: [-1, 3, 5, 3, 4, 3], fingers: [0, 1, 3, 1, 2, 1] }],
  "C Sus2": [{ frets: [-1, 3, 0, 0, 1, 3], fingers: [0, 2, 0, 0, 1, 3] }],
  "C Sus4": [{ frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1] }],
  "C Add9": [{ frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 3, 2, 0, 4, 0] }],
  "C Maj9": [{ frets: [-1, 3, 2, 4, 3, 0], fingers: [0, 2, 1, 4, 3, 0] }],
  "C Maj13": [{ frets: [-1, 3, 2, 2, 0, 0], fingers: [0, 3, 1, 2, 0, 0] }],
  "D Major": [{ frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] }],
  "D Minor": [{ frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] }],
  "D Maj7": [{ frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] }],
  D7: [{ frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 3, 1, 2] }],
  Dm7: [{ frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] }],
  "D Sus2": [{ frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0] }],
  "D Sus4": [{ frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] }],
  "D Add9": [{ frets: [-1, -1, 4, 2, 3, 0], fingers: [0, 0, 3, 1, 2, 0] }],
  "D Maj9": [{ frets: [-1, 5, 4, 6, 5, 0], fingers: [0, 2, 1, 4, 3, 0] }],
  "D Maj13": [{ frets: [-1, 5, 7, 6, 7, 7], fingers: [0, 1, 3, 2, 4, 4] }],
  "E Major": [{ frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] }],
  "E Minor": [{ frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] }],
  "E Maj7": [{ frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0] }],
  E7: [{ frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] }],
  Em7: [{ frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] }],
  "E Sus2": [{ frets: [0, 2, 4, 4, 0, 0], fingers: [0, 1, 3, 4, 0, 0] }],
  "E Sus4": [{ frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0] }],
  "E Add9": [{ frets: [0, 2, 2, 1, 0, 2], fingers: [0, 2, 3, 1, 0, 4] }],
  "E Maj9": [{ frets: [0, 2, 1, 1, 0, 2], fingers: [0, 3, 1, 2, 0, 4] }],
  "E Maj13": [{ frets: [0, 2, 1, 1, 2, 2], fingers: [0, 2, 1, 1, 3, 3] }],
  "F Major": [{ frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1] }],
  "F Minor": [{ frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1] }],
  "F Maj7": [{ frets: [1, 3, 2, 2, 1, 1], fingers: [1, 4, 2, 3, 1, 1] }],
  F7: [{ frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1] }],
  Fm7: [{ frets: [1, 3, 1, 1, 1, 1], fingers: [1, 3, 1, 1, 1, 1] }],
  "F Sus2": [{ frets: [1, 3, 3, 0, 1, 1], fingers: [1, 3, 4, 0, 1, 1] }],
  "F Sus4": [{ frets: [1, 3, 3, 3, 1, 1], fingers: [1, 2, 3, 4, 1, 1] }],
  "F Add9": [{ frets: [1, 0, 3, 0, 1, 1], fingers: [1, 0, 4, 0, 2, 1] }],
  "F Maj9": [{ frets: [1, 0, 2, 0, 1, 0], fingers: [1, 0, 3, 0, 2, 0] }],
  "F Maj13": [{ frets: [1, 3, 2, 2, 3, 3], fingers: [1, 3, 2, 2, 4, 4] }],
  "G Major": [{ frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4] }],
  "G Minor": [{ frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1] }],
  "G Maj7": [{ frets: [3, 2, 0, 0, 0, 2], fingers: [3, 1, 0, 0, 0, 2] }],
  G7: [{ frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] }],
  Gm7: [{ frets: [3, 5, 3, 3, 3, 3], fingers: [1, 4, 1, 1, 1, 1] }],
  "G Sus2": [{ frets: [3, 0, 0, 0, 3, 3], fingers: [1, 0, 0, 0, 3, 4] }],
  "G Sus4": [{ frets: [3, 3, 0, 0, 1, 3], fingers: [3, 4, 0, 0, 1, 3] }],
  "G Add9": [{ frets: [3, 0, 0, 2, 0, 3], fingers: [3, 0, 0, 2, 0, 4] }],
  "G Maj9": [{ frets: [3, 0, 0, 2, 0, 2], fingers: [3, 0, 0, 2, 0, 1] }],
  "G Maj13": [{ frets: [3, 2, 2, 2, 3, 2], fingers: [2, 1, 1, 1, 3, 1] }],
  "A Major": [{ frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] }],
  "A Minor": [{ frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] }],
  "A Maj7": [{ frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] }],
  A7: [{ frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] }],
  Am7: [{ frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] }],
  "A Sus2": [{ frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0] }],
  "A Sus4": [{ frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 4, 0] }],
  "A Add9": [{ frets: [-1, 0, 2, 4, 2, 0], fingers: [0, 0, 1, 4, 2, 0] }],
  "A Maj9": [{ frets: [-1, 0, 2, 4, 2, 4], fingers: [0, 0, 1, 3, 2, 4] }],
  "A Maj13": [{ frets: [-1, 0, 2, 1, 2, 2], fingers: [0, 0, 3, 1, 4, 4] }],
  "B Major": [{ frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1] }],
  "B Minor": [{ frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1] }],
  "B Maj7": [{ frets: [-1, 2, 4, 3, 4, 2], fingers: [0, 1, 3, 2, 4, 1] }],
  B7: [{ frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] }],
  Bm7: [{ frets: [-1, 2, 4, 2, 3, 2], fingers: [0, 1, 3, 1, 2, 1] }],
  "B Sus2": [{ frets: [-1, 2, 4, 4, 2, 2], fingers: [0, 1, 3, 4, 1, 1] }],
  "B Sus4": [{ frets: [-1, 2, 4, 4, 5, 2], fingers: [0, 1, 2, 3, 4, 1] }],
  "B Add9": [{ frets: [-1, 2, 1, 4, 2, 2], fingers: [0, 2, 1, 4, 3, 3] }],
  "B Maj9": [{ frets: [-1, 2, 1, 3, 2, 2], fingers: [0, 1, 1, 3, 2, 2] }],
  "B Maj13": [{ frets: [-1, 2, 4, 3, 4, 4], fingers: [0, 1, 3, 2, 4, 4] }],
  "Bb Major": [{ frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1] }],
  "Bb Minor": [{ frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1] }],
  "Bb Maj7": [{ frets: [-1, 1, 3, 2, 3, 1], fingers: [0, 1, 3, 2, 4, 1] }],
  Bb7: [{ frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1] }],
  Bbm7: [{ frets: [-1, 1, 3, 1, 2, 1], fingers: [0, 1, 3, 1, 2, 1] }],
  "Bb Sus2": [{ frets: [-1, 1, 3, 3, 1, 1], fingers: [0, 1, 3, 4, 1, 1] }],
  "Bb Sus4": [{ frets: [-1, 1, 3, 3, 4, 1], fingers: [0, 1, 2, 3, 4, 1] }],
  "Bb Add9": [{ frets: [-1, 1, 0, 3, 1, 1], fingers: [0, 1, 0, 4, 2, 1] }],
  "Bb Maj9": [{ frets: [-1, 1, 0, 2, 1, 1], fingers: [0, 1, 0, 3, 2, 2] }],
  "Bb Maj13": [{ frets: [-1, 1, 3, 2, 3, 3], fingers: [0, 1, 3, 2, 4, 4] }],
  "Db Major": [{ frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1] }],
  "Db Minor": [{ frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1] }],
  "Db Maj7": [{ frets: [-1, 4, 6, 5, 6, 4], fingers: [0, 1, 3, 2, 4, 1] }],
  Db7: [{ frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1] }],
  Dbm7: [{ frets: [-1, 4, 6, 4, 5, 4], fingers: [0, 1, 3, 1, 2, 1] }],
  "Db Sus2": [{ frets: [-1, 4, 6, 6, 4, 4], fingers: [0, 1, 3, 4, 1, 1] }],
  "Db Sus4": [{ frets: [-1, 4, 6, 6, 7, 4], fingers: [0, 1, 2, 3, 4, 1] }],
  "Db Add9": [{ frets: [-1, 4, 3, 6, 4, 4], fingers: [0, 2, 1, 4, 3, 2] }],
  "Db Maj9": [{ frets: [-1, 4, 3, 5, 4, 4], fingers: [0, 1, 1, 3, 2, 2] }],
  "Db Maj13": [{ frets: [-1, 4, 6, 5, 6, 6], fingers: [0, 1, 3, 2, 4, 4] }],
  "Eb Major": [{ frets: [-1, -1, 1, 3, 4, 3], fingers: [0, 0, 1, 2, 4, 3] }],
  "Eb Minor": [{ frets: [-1, -1, 1, 3, 4, 2], fingers: [0, 0, 1, 3, 4, 2] }],
  "Eb Maj7": [{ frets: [-1, -1, 1, 3, 3, 3], fingers: [0, 0, 1, 2, 3, 4] }],
  Eb7: [{ frets: [-1, -1, 1, 3, 2, 3], fingers: [0, 0, 1, 3, 2, 4] }],
  Ebm7: [{ frets: [-1, -1, 1, 3, 2, 2], fingers: [0, 0, 1, 4, 2, 3] }],
  "Eb Sus2": [{ frets: [-1, -1, 1, 3, 4, 1], fingers: [0, 0, 1, 3, 4, 1] }],
  "Eb Sus4": [{ frets: [-1, -1, 1, 3, 4, 4], fingers: [0, 0, 1, 2, 3, 4] }],
  "Eb Add9": [{ frets: [-1, -1, 1, 0, 4, 1], fingers: [0, 0, 1, 0, 4, 2] }],
  "Eb Maj9": [{ frets: [-1, 6, 5, 7, 6, 6], fingers: [0, 1, 1, 3, 2, 2] }],
  "Eb Maj13": [{ frets: [-1, 6, 8, 7, 8, 8], fingers: [0, 1, 3, 2, 4, 4] }],
  "Gb Major": [{ frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1] }],
  "Gb Minor": [{ frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1] }],
  "Gb Maj7": [{ frets: [2, 4, 3, 3, 2, 2], fingers: [1, 4, 2, 3, 1, 1] }],
  Gb7: [{ frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1] }],
  Gbm7: [{ frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1] }],
  "Gb Sus2": [{ frets: [2, 4, 4, 1, 2, 2], fingers: [1, 3, 4, 0, 1, 1] }],
  "Gb Sus4": [{ frets: [2, 4, 4, 4, 2, 2], fingers: [1, 2, 3, 4, 1, 1] }],
  "Gb Add9": [{ frets: [2, 4, 4, 3, 2, 4], fingers: [1, 3, 3, 2, 1, 4] }],
  "Gb Maj9": [{ frets: [2, 4, 3, 3, 2, 4], fingers: [1, 4, 3, 3, 1, 4] }],
  "Gb Maj13": [{ frets: [2, 4, 3, 3, 4, 4], fingers: [1, 3, 2, 2, 4, 4] }],
  "Ab Major": [{ frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1] }],
  "Ab Minor": [{ frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1] }],
  "Ab Maj7": [{ frets: [4, 6, 5, 5, 4, 4], fingers: [1, 4, 2, 3, 1, 1] }],
  Ab7: [{ frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1] }],
  Abm7: [{ frets: [4, 6, 4, 4, 4, 4], fingers: [1, 3, 1, 1, 1, 1] }],
  "Ab Sus2": [{ frets: [4, 6, 6, 3, 4, 4], fingers: [1, 3, 4, 0, 1, 1] }],
  "Ab Sus4": [{ frets: [4, 6, 6, 6, 4, 4], fingers: [1, 2, 3, 4, 1, 1] }],
  "Ab Add9": [{ frets: [4, 6, 6, 5, 4, 6], fingers: [1, 3, 3, 2, 1, 4] }],
  "Ab Maj9": [{ frets: [4, 6, 5, 5, 4, 6], fingers: [1, 4, 3, 3, 1, 4] }],
  "Ab Maj13": [{ frets: [4, 6, 5, 5, 6, 6], fingers: [1, 3, 2, 2, 4, 4] }],
};

const sharpToFlat: Record<string, string> = {
  "A#": "Bb",
  "C#": "Db",
  "D#": "Eb",
  "F#": "Gb",
  "G#": "Ab",
};

const flatToSharp: Record<string, string> = {
  Bb: "A#",
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
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

const sharpBaseMap: Record<string, string> = {
  "A#": "A",
  "C#": "C",
  "D#": "D",
  "F#": "F",
  "G#": "G",
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

  // Try enharmonic equivalent (sharp ↔ flat)
  const enharmonic = flatToSharp[note] || sharpToFlat[note];
  if (enharmonic) {
    const enharmonicExact = tryKey(enharmonic, type);
    if (enharmonicExact) return enharmonicExact;
    for (const fb of fallbackList) {
      const enharmonicFound = tryKey(enharmonic, fb);
      if (enharmonicFound) return enharmonicFound;
    }
  }

  // Try transposing from the natural note below
  const sharpNote = flatToSharp[note] || note;
  const baseNote = sharpBaseMap[sharpNote];
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
      <PinnedChordProgression />
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-5xl lg:mx-auto'>
          <div className='rounded-lg border border-border bg-white p-8 shadow-sm'>
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
                <span className='mx-1 text-gray-300'>|</span>
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
                        <p className='text-gray-500 text-xs'>Shape not available</p>
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
