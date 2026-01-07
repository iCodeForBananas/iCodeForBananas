"use client";

import React from 'react';
import './fretboard.css';
import { getNoteAt } from '../lib/music';

interface FretboardProps {
  tuning: string[];
  totalFrets: number;
  chordName?: string;
  chordNotes?: string[];
  scaleNotes?: string[];
  title?: string;
}

export default function Fretboard({ tuning, totalFrets, chordNotes, scaleNotes = [], title }: FretboardProps) {
  const normalizedChordNotes = (chordNotes || []).map((n) => n.toUpperCase());
  const normalizedScaleNotes = (scaleNotes || []).map((n) => n.toUpperCase());

  return (
    <div className="mb-4">
      {title ? (
        <div className="flex items-baseline justify-between mb-2">
          <h6 className="mb-0 text-lg font-semibold">{title}</h6>
        </div>
      ) : null}
      <div className="fretboard-wrapper overflow-auto">
        <div className="flex mb-1">
          {[...Array(totalFrets + 1).keys()].map((fret) => (
            <div key={fret} className="fret-number text-center flex-1 text-xs text-gray-600">
              {fret}
            </div>
          ))}
        </div>
        <div className="fretboard flex" style={{ minWidth: 800 }}>
          {[...Array(totalFrets + 1).keys()].map((fret) => (
            <div key={fret} className="fret flex flex-col flex-1 gap-1">
              {tuning
                .slice()
                .reverse()
                .map((baseNote, string) => {
                  const note = getNoteAt(baseNote, fret).toUpperCase();
                  const isScaleNote = normalizedScaleNotes.includes(note);
                  const isChordNote = normalizedChordNotes.includes(note);
                  const classList = ['note', fret === 0 && 'open', isScaleNote && 'scale', isChordNote && 'highlight']
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <div key={string} className={classList}>
                      {note}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
