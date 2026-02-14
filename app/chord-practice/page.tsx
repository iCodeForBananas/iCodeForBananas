"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PinnedChordProgression from "../components/PinnedChordProgression";
import { allNotes } from "../lib/music";

// Circle of fifths order
const circleOfFifths = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F"];

// ── Chord shape data & diagram ──────────────────────────────────────────────

const sharpNotes = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
const stringTuning = ["E", "A", "D", "G", "B", "E"];

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
  "C Sus4": [{ frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1] }],
  "C Add9": [{ frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 3, 2, 0, 4, 0] }],
  "D Major": [{ frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] }],
  "D Minor": [{ frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] }],
  "D Maj7": [{ frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] }],
  D7: [{ frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 3, 1, 2] }],
  Dm7: [{ frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] }],
  "D Sus4": [{ frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] }],
  "D Add9": [{ frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0] }],
  "E Major": [{ frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] }],
  "E Minor": [{ frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] }],
  "E Maj7": [{ frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0] }],
  E7: [{ frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] }],
  Em7: [{ frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] }],
  "E Sus4": [{ frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0] }],
  "E Add9": [{ frets: [0, 2, 2, 1, 0, 2], fingers: [0, 2, 3, 1, 0, 4] }],
  "F Major": [{ frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1] }],
  "F Minor": [{ frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1] }],
  "F Maj7": [{ frets: [1, 3, 2, 2, 1, 1], fingers: [1, 4, 2, 3, 1, 1] }],
  F7: [{ frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1] }],
  Fm7: [{ frets: [1, 3, 1, 1, 1, 1], fingers: [1, 3, 1, 1, 1, 1] }],
  "F Sus4": [{ frets: [1, 3, 3, 3, 1, 1], fingers: [1, 2, 3, 4, 1, 1] }],
  "F Add9": [{ frets: [1, 3, 3, 0, 1, 1], fingers: [1, 3, 4, 0, 1, 1] }],
  "G Major": [{ frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4] }],
  "G Minor": [{ frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1] }],
  "G Maj7": [{ frets: [3, 2, 0, 0, 0, 2], fingers: [3, 1, 0, 0, 0, 2] }],
  G7: [{ frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] }],
  Gm7: [{ frets: [3, 5, 3, 3, 3, 3], fingers: [1, 4, 1, 1, 1, 1] }],
  "G Sus4": [{ frets: [3, 3, 0, 0, 1, 3], fingers: [3, 4, 0, 0, 1, 3] }],
  "G Add9": [{ frets: [3, 0, 0, 2, 0, 3], fingers: [3, 0, 0, 2, 0, 4] }],
  "A Major": [{ frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] }],
  "A Minor": [{ frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] }],
  "A Maj7": [{ frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] }],
  A7: [{ frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] }],
  Am7: [{ frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] }],
  "A Sus4": [{ frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 4, 0] }],
  "A Add9": [{ frets: [-1, 0, 2, 4, 2, 0], fingers: [0, 0, 1, 4, 2, 0] }],
  "B Major": [{ frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1] }],
  "B Minor": [{ frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1] }],
  "B Maj7": [{ frets: [-1, 2, 4, 3, 4, 2], fingers: [0, 1, 3, 2, 4, 1] }],
  B7: [{ frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] }],
  Bm7: [{ frets: [-1, 2, 4, 2, 3, 2], fingers: [0, 1, 3, 1, 2, 1] }],
  "B Sus4": [{ frets: [-1, 2, 4, 4, 5, 2], fingers: [0, 1, 2, 3, 4, 1] }],
  "B Add9": [{ frets: [-1, 2, 4, 4, 2, 2], fingers: [0, 1, 3, 4, 1, 1] }],
  "Bb Major": [{ frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1] }],
  "Bb Minor": [{ frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1] }],
  "Bb Maj7": [{ frets: [-1, 1, 3, 2, 3, 1], fingers: [0, 1, 3, 2, 4, 1] }],
  Bb7: [{ frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1] }],
  Bbm7: [{ frets: [-1, 1, 3, 1, 2, 1], fingers: [0, 1, 3, 1, 2, 1] }],
  "Bb Sus4": [{ frets: [-1, 1, 3, 3, 4, 1], fingers: [0, 1, 2, 3, 4, 1] }],
  "Bb Add9": [{ frets: [-1, 1, 0, 3, 1, 1], fingers: [0, 1, 0, 4, 2, 1] }],
  "Db Major": [{ frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1] }],
  "Db Minor": [{ frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1] }],
  "Db Maj7": [{ frets: [-1, 4, 6, 5, 6, 4], fingers: [0, 1, 3, 2, 4, 1] }],
  Db7: [{ frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1] }],
  Dbm7: [{ frets: [-1, 4, 6, 4, 5, 4], fingers: [0, 1, 3, 1, 2, 1] }],
  "Db Sus4": [{ frets: [-1, 4, 6, 6, 7, 4], fingers: [0, 1, 2, 3, 4, 1] }],
  "Db Add9": [{ frets: [-1, 4, 3, 6, 4, 4], fingers: [0, 2, 1, 4, 3, 2] }],
  "Eb Major": [{ frets: [-1, -1, 1, 3, 4, 3], fingers: [0, 0, 1, 2, 4, 3] }],
  "Eb Minor": [{ frets: [-1, -1, 1, 3, 4, 2], fingers: [0, 0, 1, 3, 4, 2] }],
  "Eb Maj7": [{ frets: [-1, -1, 1, 3, 3, 3], fingers: [0, 0, 1, 2, 3, 4] }],
  Eb7: [{ frets: [-1, -1, 1, 3, 2, 3], fingers: [0, 0, 1, 3, 2, 4] }],
  Ebm7: [{ frets: [-1, -1, 1, 3, 2, 2], fingers: [0, 0, 1, 4, 2, 3] }],
  "Eb Sus4": [{ frets: [-1, -1, 1, 3, 4, 4], fingers: [0, 0, 1, 2, 3, 4] }],
  "Eb Add9": [{ frets: [-1, -1, 1, 3, 4, 1], fingers: [0, 0, 1, 2, 3, 1] }],
  "Gb Major": [{ frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1] }],
  "Gb Minor": [{ frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1] }],
  "Gb Maj7": [{ frets: [2, 4, 3, 3, 2, 2], fingers: [1, 4, 2, 3, 1, 1] }],
  Gb7: [{ frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1] }],
  Gbm7: [{ frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1] }],
  "Gb Sus4": [{ frets: [2, 4, 4, 4, 2, 2], fingers: [1, 2, 3, 4, 1, 1] }],
  "Gb Add9": [{ frets: [2, 4, 4, 1, 2, 2], fingers: [1, 3, 4, 0, 1, 1] }],
  "Ab Major": [{ frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1] }],
  "Ab Minor": [{ frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1] }],
  "Ab Maj7": [{ frets: [4, 6, 5, 5, 4, 4], fingers: [1, 4, 2, 3, 1, 1] }],
  Ab7: [{ frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1] }],
  Abm7: [{ frets: [4, 6, 4, 4, 4, 4], fingers: [1, 3, 1, 1, 1, 1] }],
  "Ab Sus4": [{ frets: [4, 6, 6, 6, 4, 4], fingers: [1, 2, 3, 4, 1, 1] }],
  "Ab Add9": [{ frets: [4, 6, 6, 3, 4, 4], fingers: [1, 3, 4, 0, 1, 1] }],
};

const sharpToFlat: Record<string, string> = { "A#": "Bb", "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab" };
const flatToSharp: Record<string, string> = { Bb: "A#", Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#" };
const sharpBaseMap: Record<string, string> = { "A#": "A", "C#": "C", "D#": "D", "F#": "F", "G#": "G" };

// Map chord-practice suffix → chord-shapes lookup key
function mapSuffixToShapeType(suffix: string): string {
  switch (suffix) {
    case "Major": return "Major";
    case "Minor": return "Minor";
    case "maj7": return "Maj7";
    case "m7": return "m7";
    case "7": return "7";
    case "sus2": return "Sus4"; // fallback
    case "sus4": return "Sus4";
    case "dim": return "Minor"; // fallback
    case "aug": return "Major"; // fallback
    case "m7b5": return "m7"; // fallback
    case "maj9": return "Add9"; // fallback
    case "9": return "7"; // fallback
    case "m9": return "m7"; // fallback
    case "dim7": return "m7"; // fallback
    case "13": return "7"; // fallback
    case "maj13": return "Maj7"; // fallback
    case "m11": return "m7"; // fallback
    case "7#9": return "7"; // fallback
    case "7b9": return "7"; // fallback
    default: return "Major";
  }
}

function buildShapeKey(note: string, type: string): string {
  if (type === "7" || type === "m7") return `${note}${type}`;
  return `${note} ${type}`;
}

function transposeShape(shape: ChordShape, semitones: number): ChordShape {
  return {
    frets: shape.frets.map((f) => (f === -1 ? -1 : f + semitones)),
    fingers: [...shape.fingers],
  };
}

function resolveChordShapeForPractice(root: string, suffix: string): ChordShape | null {
  const shapeType = mapSuffixToShapeType(suffix);
  const tryKey = (n: string, t: string) => chordShapes[buildShapeKey(n, t)]?.[0] || null;

  // Direct lookup
  const direct = tryKey(root, shapeType);
  if (direct) return direct;

  // Try enharmonic
  const enharmonic = flatToSharp[root] || sharpToFlat[root];
  if (enharmonic) {
    const found = tryKey(enharmonic, shapeType);
    if (found) return found;
  }

  // Try transposing from natural note below
  const sharpNote = flatToSharp[root] || root;
  const baseNote = sharpBaseMap[sharpNote];
  if (baseNote) {
    const found = tryKey(baseNote, shapeType);
    if (found) return transposeShape(found, 1);
  }

  // Fallback: try Major/Minor
  for (const fb of ["Major", "Minor"]) {
    const found = tryKey(root, fb);
    if (found) return found;
    if (enharmonic) {
      const efound = tryKey(enharmonic, fb);
      if (efound) return efound;
    }
  }

  return null;
}

function getNoteAtFret(openNote: string, fret: number): string {
  const idx = sharpNotes.indexOf(openNote);
  return sharpNotes[(idx + fret) % 12];
}

function ChordDiagram({ shape, label }: { shape: ChordShape; label: string }) {
  const stringSpacing = 22;
  const fretSpacing = 24;
  const displayFrets = 5;
  const dotSize = 18;
  const diagramWidth = stringSpacing * 5 + 20;
  const diagramHeight = fretSpacing * displayFrets + 40;

  const playedFrets = shape.frets.filter((f) => f > 0);
  const minFret = playedFrets.length > 0 ? Math.min(...playedFrets) : 1;
  const maxFret = playedFrets.length > 0 ? Math.max(...playedFrets) : 1;
  const startFret = minFret > 2 || maxFret > 5 ? minFret : 1;

  return (
    <div className='flex flex-col items-center'>
      <h6 className='text-center mb-1 font-semibold text-sm text-[var(--foreground)]'>{label}</h6>
      <div className='relative' style={{ width: `${diagramWidth}px`, height: `${diagramHeight}px` }}>
        {/* Muted / open indicators */}
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

        {startFret > 1 && (
          <span
            className='absolute text-xs font-medium text-gray-500'
            style={{ left: `${diagramWidth + 2}px`, top: "24px" }}
          >
            {startFret}fr
          </span>
        )}

        {/* Strings */}
        {[0, 1, 2, 3, 4, 5].map((si) => (
          <div
            key={si}
            className='absolute bg-gray-400'
            style={{
              left: `${si * stringSpacing + 10}px`,
              top: "20px",
              width: "1px",
              height: `${fretSpacing * displayFrets}px`,
              zIndex: 1,
            }}
          />
        ))}

        {/* Frets */}
        {Array.from({ length: displayFrets + 1 }, (_, i) => i).map((f) => (
          <div
            key={f}
            className={`absolute ${f === 0 && startFret <= 1 ? "bg-gray-800" : "bg-gray-400"}`}
            style={{
              left: "6px",
              top: `${20 + f * fretSpacing}px`,
              width: `${stringSpacing * 5 + 8}px`,
              height: f === 0 && startFret <= 1 ? "3px" : "1px",
              zIndex: 1,
            }}
          />
        ))}

        {/* Finger dots with note names */}
        {shape.frets.map((fretNum, si) => {
          if (fretNum === -1) return null;
          const note = getNoteAtFret(stringTuning[si], fretNum);

          if (fretNum === 0) {
            return (
              <div
                key={si}
                className='absolute rounded-full border-2 border-pink-500 bg-white flex items-center justify-center font-bold'
                style={{
                  left: `${si * stringSpacing + 10 - dotSize / 2}px`,
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
          }

          const displayPos = fretNum - startFret;
          return (
            <div
              key={si}
              className='absolute bg-pink-500 rounded-full text-white flex items-center justify-center font-bold'
              style={{
                left: `${si * stringSpacing + 10 - dotSize / 2}px`,
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
        })}
      </div>
    </div>
  );
}

// ── End chord shape data & diagram ──────────────────────────────────────────

// Major scale intervals (semitones from root)
const majorScaleIntervals = [0, 2, 4, 5, 7, 9, 11];

// Difficulty tiers with chord types available at each level
const difficultyTiers = [
  {
    level: 1,
    label: "Beginner",
    description: "Major & Minor Triads",
    types: [
      { suffix: "Major", quality: "major", intervals: [0, 4, 7] },
      { suffix: "Minor", quality: "minor", intervals: [0, 3, 7] },
    ],
  },
  {
    level: 2,
    label: "Elementary",
    description: "Adding Sus & Power Chords",
    types: [
      { suffix: "Major", quality: "major", intervals: [0, 4, 7] },
      { suffix: "Minor", quality: "minor", intervals: [0, 3, 7] },
      { suffix: "sus2", quality: "sus", intervals: [0, 2, 7] },
      { suffix: "sus4", quality: "sus", intervals: [0, 5, 7] },
    ],
  },
  {
    level: 3,
    label: "Intermediate",
    description: "Introducing 7th Chords",
    types: [
      { suffix: "Major", quality: "major", intervals: [0, 4, 7] },
      { suffix: "Minor", quality: "minor", intervals: [0, 3, 7] },
      { suffix: "maj7", quality: "major", intervals: [0, 4, 7, 11] },
      { suffix: "m7", quality: "minor", intervals: [0, 3, 7, 10] },
      { suffix: "7", quality: "dominant", intervals: [0, 4, 7, 10] },
    ],
  },
  {
    level: 4,
    label: "Advanced",
    description: "Diminished & Augmented",
    types: [
      { suffix: "maj7", quality: "major", intervals: [0, 4, 7, 11] },
      { suffix: "m7", quality: "minor", intervals: [0, 3, 7, 10] },
      { suffix: "7", quality: "dominant", intervals: [0, 4, 7, 10] },
      { suffix: "dim", quality: "diminished", intervals: [0, 3, 6] },
      { suffix: "aug", quality: "augmented", intervals: [0, 4, 8] },
      { suffix: "m7b5", quality: "diminished", intervals: [0, 3, 6, 10] },
    ],
  },
  {
    level: 5,
    label: "Expert",
    description: "Extended Chords (9ths)",
    types: [
      { suffix: "maj7", quality: "major", intervals: [0, 4, 7, 11] },
      { suffix: "m7", quality: "minor", intervals: [0, 3, 7, 10] },
      { suffix: "7", quality: "dominant", intervals: [0, 4, 7, 10] },
      { suffix: "maj9", quality: "major", intervals: [0, 4, 7, 11, 14] },
      { suffix: "9", quality: "dominant", intervals: [0, 4, 7, 10, 14] },
      { suffix: "m9", quality: "minor", intervals: [0, 3, 7, 10, 14] },
      { suffix: "dim7", quality: "diminished", intervals: [0, 3, 6, 9] },
    ],
  },
  {
    level: 6,
    label: "Master",
    description: "13ths & Complex Voicings",
    types: [
      { suffix: "maj7", quality: "major", intervals: [0, 4, 7, 11] },
      { suffix: "m7", quality: "minor", intervals: [0, 3, 7, 10] },
      { suffix: "7", quality: "dominant", intervals: [0, 4, 7, 10] },
      { suffix: "maj9", quality: "major", intervals: [0, 4, 7, 11, 14] },
      { suffix: "9", quality: "dominant", intervals: [0, 4, 7, 10, 14] },
      { suffix: "13", quality: "dominant", intervals: [0, 4, 7, 10, 14, 21] },
      { suffix: "maj13", quality: "major", intervals: [0, 4, 7, 11, 14, 21] },
      { suffix: "m11", quality: "minor", intervals: [0, 3, 7, 10, 14, 17] },
      { suffix: "7#9", quality: "dominant", intervals: [0, 4, 7, 10, 15] },
      { suffix: "7b9", quality: "dominant", intervals: [0, 4, 7, 10, 13] },
    ],
  },
];

// Get diatonic chords for a key (scale degrees in the circle of fifths context)
function getDiatonicRoots(keyRoot: string): string[] {
  const rootIdx = allNotes.indexOf(keyRoot);
  if (rootIdx < 0) return [keyRoot];
  return majorScaleIntervals.map((interval) => allNotes[(rootIdx + interval) % 12]);
}

// Get neighboring keys in the circle of fifths
function getRelatedKeys(currentKey: string, range: number): string[] {
  const idx = circleOfFifths.indexOf(currentKey);
  if (idx < 0) return [currentKey];
  const keys: string[] = [];
  for (let i = -range; i <= range; i++) {
    keys.push(circleOfFifths[((idx + i) % 12 + 12) % 12]);
  }
  return keys;
}

// Format chord name for display
function formatChordName(root: string, suffix: string): string {
  if (suffix === "Major") return root;
  if (suffix === "Minor") return `${root}m`;
  return `${root}${suffix}`;
}

// Get the notes in a chord
function getChordNotes(root: string, intervals: number[]): string[] {
  const rootIdx = allNotes.indexOf(root);
  if (rootIdx < 0) return [];
  return intervals.map((i) => allNotes[(rootIdx + i) % 12]);
}

interface ChordInfo {
  root: string;
  suffix: string;
  displayName: string;
  notes: string[];
  key: string;
}

const CHORDS_PER_LEVEL_UP = 8;
const TIMER_DURATION = 10;
const BASE_MODULATE_CHANCE = 0.15;
const MODULATE_CHANCE_PER_LEVEL = 0.05;
const MAX_MODULATE_CHANCE = 0.4;
const BASE_KEY_RANGE = 1;
const MAX_KEY_RANGE = 3;

export default function ChordPracticePage() {
  const [currentChord, setCurrentChord] = useState<ChordInfo | null>(null);
  const [currentKey, setCurrentKey] = useState("G");
  const [difficulty, setDifficulty] = useState(1);
  const [chordsPlayed, setChordsPlayed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [isPlaying, setIsPlaying] = useState(false);
  const [history, setHistory] = useState<ChordInfo[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousChordsRef = useRef<string[]>([]);

  const tier = difficultyTiers[Math.min(difficulty - 1, difficultyTiers.length - 1)];

  // Generate next chord following circle of fifths random walk
  const generateNextChord = useCallback(() => {
    const currentDifficulty = Math.min(difficulty, difficultyTiers.length);
    const currentTier = difficultyTiers[currentDifficulty - 1];

    // Random walk: sometimes modulate to a neighboring key
    let nextKey = currentKey;
    const modulateChance = Math.min(BASE_MODULATE_CHANCE + (currentDifficulty - 1) * MODULATE_CHANCE_PER_LEVEL, MAX_MODULATE_CHANCE);
    if (Math.random() < modulateChance) {
      const range = Math.min(BASE_KEY_RANGE + Math.floor((currentDifficulty - 1) / 2), MAX_KEY_RANGE);
      const relatedKeys = getRelatedKeys(currentKey, range);
      nextKey = relatedKeys[Math.floor(Math.random() * relatedKeys.length)];
    }

    // Get diatonic roots for the current key
    const diatonicRoots = getDiatonicRoots(nextKey);

    // Pick a random root from the diatonic scale, avoiding immediate repetition
    let root: string;
    let attempts = 0;
    do {
      root = diatonicRoots[Math.floor(Math.random() * diatonicRoots.length)];
      attempts++;
    } while (
      previousChordsRef.current.length > 0 &&
      previousChordsRef.current[previousChordsRef.current.length - 1] === root &&
      attempts < 10
    );

    // Pick a random chord type from the current tier
    const chordType = currentTier.types[Math.floor(Math.random() * currentTier.types.length)];

    const displayName = formatChordName(root, chordType.suffix);

    // Avoid repeating the exact same chord
    if (
      previousChordsRef.current.length >= 2 &&
      previousChordsRef.current[previousChordsRef.current.length - 1] === displayName
    ) {
      // Try once more with a different type
      const altType = currentTier.types[Math.floor(Math.random() * currentTier.types.length)];
      const altName = formatChordName(root, altType.suffix);
      const chord: ChordInfo = {
        root,
        suffix: altType.suffix,
        displayName: altName,
        notes: getChordNotes(root, altType.intervals),
        key: nextKey,
      };
      previousChordsRef.current.push(altName);
      if (previousChordsRef.current.length > 5) previousChordsRef.current.shift();
      setCurrentKey(nextKey);
      return chord;
    }

    const chord: ChordInfo = {
      root,
      suffix: chordType.suffix,
      displayName,
      notes: getChordNotes(root, chordType.intervals),
      key: nextKey,
    };

    previousChordsRef.current.push(displayName);
    if (previousChordsRef.current.length > 5) previousChordsRef.current.shift();
    setCurrentKey(nextKey);
    return chord;
  }, [currentKey, difficulty]);

  // Advance to next chord
  const nextChord = useCallback(() => {
    const chord = generateNextChord();
    setCurrentChord(chord);
    setHistory((prev) => [...prev.slice(-19), chord]);
    setTimeLeft(TIMER_DURATION);

    const newCount = chordsPlayed + 1;
    setChordsPlayed(newCount);

    // Level up every CHORDS_PER_LEVEL_UP chords
    if (newCount > 0 && newCount % CHORDS_PER_LEVEL_UP === 0 && difficulty < difficultyTiers.length) {
      setDifficulty((d) => Math.min(d + 1, difficultyTiers.length));
    }
  }, [generateNextChord, chordsPlayed, difficulty]);

  // Timer countdown - advance chord inline when reaching 0
  useEffect(() => {
    if (!isPlaying) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Schedule chord advance outside of setState
          queueMicrotask(() => nextChord());
          return TIMER_DURATION;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, nextChord]);

  const startGame = () => {
    setIsPlaying(true);
    setChordsPlayed(0);
    setDifficulty(1);
    setHistory([]);
    setCurrentKey("G");
    previousChordsRef.current = [];
    const chord = generateNextChord();
    setCurrentChord(chord);
    setHistory([chord]);
    setTimeLeft(TIMER_DURATION);
  };

  const stopGame = () => {
    setIsPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const skipChord = () => {
    if (isPlaying) {
      nextChord();
    }
  };

  // Progress percentage for the timer ring
  const timerProgress = (timeLeft / TIMER_DURATION) * 100;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (timerProgress / 100) * circumference;

  // Progress to next level
  const chordsInCurrentLevel = chordsPlayed % CHORDS_PER_LEVEL_UP;
  const levelProgress = (chordsInCurrentLevel / CHORDS_PER_LEVEL_UP) * 100;

  return (
    <div className='flex flex-col flex-1'>
      <PinnedChordProgression />
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-4xl lg:mx-auto rounded-lg border border-border bg-white p-4 shadow-sm'>
          {/* Header */}
          <div className='text-center mb-8'>
            <h1 className='text-4xl font-bold text-[var(--foreground)] mb-2'>Chord Practice</h1>
            <p className='text-lg text-[var(--foreground)]/70'>
              Progressive chord training following the Circle of Fifths
            </p>
          </div>

          {/* Game status bar */}
          <div className='flex flex-wrap items-center justify-center gap-4 mb-8'>
            <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-center'>
              <div className='text-xs text-[var(--foreground)]/60 uppercase tracking-wider'>Level</div>
              <div className='text-lg font-bold text-[var(--accent)]'>{tier.level}</div>
              <div className='text-xs text-[var(--foreground)]/60'>{tier.label}</div>
            </div>
            <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-center'>
              <div className='text-xs text-[var(--foreground)]/60 uppercase tracking-wider'>Key</div>
              <div className='text-lg font-bold text-[var(--foreground)]'>{currentKey}</div>
            </div>
            <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-center'>
              <div className='text-xs text-[var(--foreground)]/60 uppercase tracking-wider'>Chords</div>
              <div className='text-lg font-bold text-[var(--foreground)]'>{chordsPlayed}</div>
            </div>
            <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-center min-w-[140px]'>
              <div className='text-xs text-[var(--foreground)]/60 uppercase tracking-wider'>Focus</div>
              <div className='text-sm font-medium text-[var(--foreground)]'>{tier.description}</div>
            </div>
          </div>

          {/* Level progress bar */}
          {isPlaying && difficulty < difficultyTiers.length && (
            <div className='mb-6 max-w-md mx-auto'>
              <div className='flex justify-between text-xs text-[var(--foreground)]/60 mb-1'>
                <span>Level {tier.level} → {tier.level + 1}</span>
                <span>{CHORDS_PER_LEVEL_UP - chordsInCurrentLevel} chords to next level</span>
              </div>
              <div className='h-2 bg-[var(--card-border)] rounded-full overflow-hidden'>
                <div
                  className='h-full bg-gradient-to-r from-pink-500 to-orange-500 rounded-full transition-all duration-500'
                  style={{ width: `${levelProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Main chord display */}
          <div className='flex flex-col items-center mb-8'>
            {!isPlaying ? (
              <div className='text-center'>
                <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-12 mb-6 max-w-md mx-auto'>
                  <p className='text-[var(--foreground)]/70 mb-4 text-lg'>
                    Practice chords that progressively get harder. Starting in the key of G,
                    the game walks through the Circle of Fifths introducing new chord types as you advance.
                  </p>
                  <ul className='text-left text-sm text-[var(--foreground)]/60 space-y-1 mb-6'>
                    <li>• 10 seconds per chord</li>
                    <li>• Starts with simple triads</li>
                    <li>• Levels up every {CHORDS_PER_LEVEL_UP} chords</li>
                    <li>• Follows the Circle of Fifths</li>
                    <li>• Introduces 7ths, 9ths, 13ths & more</li>
                  </ul>
                  <button
                    onClick={startGame}
                    className='px-8 py-3 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl font-bold text-lg hover:from-pink-600 hover:to-orange-600 transition-all shadow-lg'
                  >
                    Start Practice
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Timer ring + chord name */}
                <div className='relative flex items-center justify-center mb-6'>
                  <svg className='w-40 h-40 -rotate-90' viewBox='0 0 120 120'>
                    <circle
                      cx='60'
                      cy='60'
                      r='54'
                      fill='none'
                      stroke='var(--card-border)'
                      strokeWidth='6'
                    />
                    <circle
                      cx='60'
                      cy='60'
                      r='54'
                      fill='none'
                      stroke='url(#timerGradient)'
                      strokeWidth='6'
                      strokeLinecap='round'
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      className='transition-all duration-1000 ease-linear'
                    />
                    <defs>
                      <linearGradient id='timerGradient' x1='0%' y1='0%' x2='100%' y2='0%'>
                        <stop offset='0%' stopColor='#ec4899' />
                        <stop offset='100%' stopColor='#f97316' />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className='absolute inset-0 flex flex-col items-center justify-center'>
                    <span className='text-3xl font-bold text-[var(--foreground)]'>{timeLeft}s</span>
                  </div>
                </div>

                {/* Chord display card */}
                {currentChord && (
                  <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-8 text-center min-w-[280px] shadow-lg'>
                    <div className='text-6xl font-bold text-[var(--foreground)] mb-3'>
                      {currentChord.displayName}
                    </div>
                    <div className='text-sm text-[var(--foreground)]/60 mb-4'>
                      Key of {currentChord.key}
                    </div>
                    <div className='flex flex-wrap justify-center gap-2 mb-4'>
                      {currentChord.notes.map((note, i) => (
                        <span
                          key={i}
                          className='px-3 py-1 bg-gradient-to-r from-pink-500/20 to-orange-500/20 border border-pink-500/30 rounded-full text-sm font-medium text-[var(--foreground)]'
                        >
                          {note}
                        </span>
                      ))}
                    </div>
                    {(() => {
                      const shape = resolveChordShapeForPractice(currentChord.root, currentChord.suffix);
                      if (!shape) return null;
                      return (
                        <div className='flex justify-center mt-2'>
                          <ChordDiagram shape={shape} label='Shape' />
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Controls */}
                <div className='flex gap-4 mt-6'>
                  <button
                    onClick={skipChord}
                    className='px-6 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] rounded-xl font-medium hover:bg-[var(--card-border)] transition-all'
                  >
                    Skip →
                  </button>
                  <button
                    onClick={stopGame}
                    className='px-6 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl font-medium hover:bg-red-500/30 transition-all'
                  >
                    Stop
                  </button>
                </div>
              </>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className='mt-8'>
              <h2 className='text-lg font-semibold text-[var(--foreground)] mb-3 text-center'>
                Recent Chords
              </h2>
              <div className='flex flex-wrap justify-center gap-2'>
                {history.slice().reverse().map((chord, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full text-sm font-medium border ${
                      i === 0
                        ? "bg-gradient-to-r from-pink-500/30 to-orange-500/30 border-pink-500/40 text-[var(--foreground)]"
                        : "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--foreground)]/60"
                    }`}
                  >
                    {chord.displayName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Difficulty reference */}
          <div className='mt-12'>
            <h2 className='text-lg font-semibold text-[var(--foreground)] mb-4 text-center'>
              Difficulty Levels
            </h2>
            <div className='grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto'>
              {difficultyTiers.map((t) => (
                <div
                  key={t.level}
                  className={`p-3 rounded-xl border text-center text-sm ${
                    t.level === difficulty
                      ? "bg-gradient-to-r from-pink-500/20 to-orange-500/20 border-pink-500/40"
                      : t.level < difficulty
                        ? "bg-[var(--card-bg)] border-green-500/30"
                        : "bg-[var(--card-bg)] border-[var(--card-border)] opacity-60"
                  }`}
                >
                  <div className='font-bold text-[var(--foreground)]'>
                    {t.level}. {t.label}
                  </div>
                  <div className='text-xs text-[var(--foreground)]/60'>{t.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
