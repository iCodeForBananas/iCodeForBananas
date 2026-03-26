"use client";

import React, { useState, useMemo } from "react";
import "./fretboard.css";
import { allNotes, getNoteAt, generateChordsAndScales, defaultTuning } from "../lib/music";

// Scale types available
const scaleTypes = [
  "Major",
  "Minor",
  "Pentatonic Major",
  "Pentatonic Minor",
  "Blues",
  "Phrygian",
  "Phrygian Dominant",
  "Harmonic Minor",
  "Melodic Minor",
];

export default function FretboardQuiz() {
  const [selectedKey, setSelectedKey] = useState("G");
  const [selectedScaleType, setSelectedScaleType] = useState("Major");
  const [guessedNotes, setGuessedNotes] = useState<Set<string>>(new Set());
  const [incorrectGuesses, setIncorrectGuesses] = useState<Set<string>>(new Set());
  const [incorrectCount, setIncorrectCount] = useState(0);

  const tuning = defaultTuning;
  const totalFrets = 12;

  // Get all scales
  const { scales } = useMemo(() => generateChordsAndScales(), []);

  // Get the current scale notes
  const scaleKey = `${selectedKey} ${selectedScaleType}`;
  const scaleNotes = useMemo(() => {
    return (scales[scaleKey] || []).map((n) => n.toUpperCase());
  }, [scales, scaleKey]);

  // Build a map of all fretboard positions that are in the scale
  const scalePositions = useMemo(() => {
    const positions = new Set<string>();
    for (let fret = 0; fret <= totalFrets; fret++) {
      tuning.forEach((baseNote, stringIndex) => {
        const note = getNoteAt(baseNote, fret).toUpperCase();
        if (scaleNotes.includes(note)) {
          positions.add(`${stringIndex}-${fret}`);
        }
      });
    }
    return positions;
  }, [scaleNotes, tuning, totalFrets]);

  const totalNotesToFind = scalePositions.size;
  const foundCount = guessedNotes.size;
  const isComplete = foundCount === totalNotesToFind;
  const totalAttempts = foundCount + incorrectCount;
  const scorePercent = totalAttempts > 0 ? Math.round((foundCount / totalAttempts) * 100) : 0;

  const handleNoteClick = (stringIndex: number, fret: number) => {
    const positionKey = `${stringIndex}-${fret}`;

    // Skip if already guessed correctly
    if (guessedNotes.has(positionKey)) return;

    const note = getNoteAt(tuning[stringIndex], fret).toUpperCase();
    const isInScale = scaleNotes.includes(note);

    if (isInScale) {
      // Correct guess - mark only this specific position as found
      const newGuessed = new Set(guessedNotes);
      newGuessed.add(positionKey);
      setGuessedNotes(newGuessed);
    } else {
      // Incorrect guess
      setIncorrectCount((prev) => prev + 1);
      const newIncorrect = new Set(incorrectGuesses);
      newIncorrect.add(positionKey);
      setIncorrectGuesses(newIncorrect);
      // Clear visual feedback after a short delay
      setTimeout(() => {
        setIncorrectGuesses((prev) => {
          const updated = new Set(prev);
          updated.delete(positionKey);
          return updated;
        });
      }, 500);
    }
  };

  const handleRestart = () => {
    setGuessedNotes(new Set());
    setIncorrectGuesses(new Set());
    setIncorrectCount(0);
  };

  const handleKeyChange = (newKey: string) => {
    setSelectedKey(newKey);
    setGuessedNotes(new Set());
    setIncorrectGuesses(new Set());
    setIncorrectCount(0);
  };

  const handleScaleTypeChange = (newType: string) => {
    setSelectedScaleType(newType);
    setGuessedNotes(new Set());
    setIncorrectGuesses(new Set());
    setIncorrectCount(0);
  };

  return (
    <div className='space-y-6'>
      {/* Controls */}
      <div className='flex flex-wrap items-center gap-4'>
        <div className='flex items-center gap-2'>
          <label htmlFor='key-select' className='font-medium'>
            Key:
          </label>
          <select
            id='key-select'
            value={selectedKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            className='px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-white'
          >
            {allNotes.map((note) => (
              <option key={note} value={note}>
                {note}
              </option>
            ))}
          </select>
        </div>

        <div className='flex items-center gap-2'>
          <label htmlFor='scale-select' className='font-medium'>
            Scale:
          </label>
          <select
            id='scale-select'
            value={selectedScaleType}
            onChange={(e) => handleScaleTypeChange(e.target.value)}
            className='px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-white'
          >
            {scaleTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleRestart}
          className='px-4 py-2 bg-[#4C6EF5] text-white rounded-md hover:bg-[#3b5de7] transition-all shadow-sm font-medium'
        >
          Restart
        </button>
      </div>

      {/* Progress */}
      <div className='flex items-center gap-4'>
        <div className='text-lg font-medium'>
          Progress: <span>{foundCount}</span> / {totalNotesToFind} notes
        </div>
        {totalAttempts > 0 && (
          <div className='text-lg font-medium'>
            Score: <span>{scorePercent}%</span>
          </div>
        )}
        {isComplete && (
          <div className='px-4 py-2 bg-green-100 text-green-700 rounded-md font-medium animate-pulse'>
            🎉 You found all the notes! Score: {scorePercent}%
          </div>
        )}
      </div>

      {/* Scale info */}
      <div className='text-sm text-muted'>
        Find all the <span className='font-semibold text-foreground'>{selectedKey} {selectedScaleType}</span> notes on the fretboard!
        Click on any fret position to guess if that note is in the scale.
      </div>

      {/* Fretboard */}
      <div className='fretboard-wrapper overflow-auto'>
        <div className='flex mb-1'>
          {[...Array(totalFrets + 1).keys()].map((fret) => (
            <div key={fret} className='fret-number text-center flex-1 text-xs text-muted'>
              {fret}
            </div>
          ))}
        </div>
        <div className='fretboard flex' style={{ minWidth: 800 }}>
          {[...Array(totalFrets + 1).keys()].map((fret) => (
            <div key={fret} className='fret flex flex-col flex-1 gap-1'>
              {tuning
                .slice()
                .reverse()
                .map((baseNote, reversedIndex) => {
                  const stringIndex = tuning.length - 1 - reversedIndex;
                  const note = getNoteAt(baseNote, fret).toUpperCase();
                  const positionKey = `${stringIndex}-${fret}`;
                  const isGuessed = guessedNotes.has(positionKey);
                  const isIncorrect = incorrectGuesses.has(positionKey);

                  let bgClass = "";
                  if (isGuessed) {
                    bgClass = "bg-green-300 !text-black";
                  } else if (isIncorrect) {
                    bgClass = "bg-red-300 !text-black";
                  }

                  return (
                    <div
                      key={reversedIndex}
                      onClick={() => handleNoteClick(stringIndex, fret)}
                      className={`note cursor-pointer hover:bg-[#12B886] transition-colors ${
                        fret === 0 ? "open" : ""
                      } ${bgClass}`}
                      style={{ userSelect: "none" }}
                    >
                      {isGuessed ? note : "?"}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className='flex flex-wrap gap-4 text-sm text-muted'>
        <div className='flex items-center gap-2'>
          <div className='w-4 h-4 bg-green-300 rounded'></div>
          <span>Correct (in scale)</span>
        </div>
        <div className='flex items-center gap-2'>
          <div className='w-4 h-4 bg-red-300 rounded'></div>
          <span>Incorrect (not in scale)</span>
        </div>
        <div className='flex items-center gap-2'>
          <div className='w-4 h-4 bg-gray-200 rounded border border-gray-300'></div>
          <span>Not guessed yet</span>
        </div>
      </div>
    </div>
  );
}
