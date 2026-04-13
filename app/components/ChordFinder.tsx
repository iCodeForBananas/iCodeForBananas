"use client";

import React, { useState, useMemo } from "react";
import "./fretboard.css";
import { allNotes, getNoteAt, generateChordsAndScales, defaultTuning } from "../lib/music";

interface ChordMatch {
  name: string;
  notes: string[];
  matchType: "exact" | "subset" | "superset";
  /** Number of chord notes not present in the selection (0 = exact) */
  missingCount: number;
  /** Number of selected notes not in the chord (0 = exact or subset) */
  extraCount: number;
}

function identifyChords(selectedNotes: string[]): ChordMatch[] {
  const { chords } = generateChordsAndScales();
  const selectedSet = new Set(selectedNotes.map((n) => n.toUpperCase()));

  if (selectedSet.size === 0) return [];

  const results: ChordMatch[] = [];

  for (const [name, notes] of Object.entries(chords)) {
    const chordSet = new Set(notes.map((n) => n.toUpperCase()));

    const intersection = [...selectedSet].filter((n) => chordSet.has(n));
    const missingCount = chordSet.size - intersection.length; // in chord but not selected
    const extraCount = selectedSet.size - intersection.length; // selected but not in chord

    // Only include if at least all selected notes are in the chord (selectedSet ⊆ chordSet)
    // OR chord is contained in selection
    if (extraCount === 0) {
      // All selected notes are in this chord
      const matchType = missingCount === 0 ? "exact" : "subset";
      results.push({ name, notes, matchType, missingCount, extraCount });
    } else if (missingCount === 0 && extraCount > 0) {
      // Chord is fully contained in selection (user has extra notes)
      results.push({ name, notes, matchType: "superset", missingCount, extraCount });
    }
  }

  // Sort: exact first, then by missing notes, then by extra, then alphabetically
  results.sort((a, b) => {
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    if (a.extraCount !== b.extraCount) return a.extraCount - b.extraCount;
    return a.name.localeCompare(b.name);
  });

  return results;
}

export default function ChordFinder() {
  const tuning = defaultTuning;
  const totalFrets = 12;

  // Set of "stringIndex-fret" keys that are currently selected
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());

  // When non-null, the fretboard previews all positions for this chord
  const [pinnedChord, setPinnedChord] = useState<ChordMatch | null>(null);

  const handleNoteClick = (stringIndex: number, fret: number) => {
    const key = `${stringIndex}-${fret}`;
    setSelectedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleClear = () => {
    setSelectedPositions(new Set());
    setPinnedChord(null);
  };

  const handleChordPin = (m: ChordMatch) => {
    setPinnedChord((prev) => (prev?.name === m.name ? null : m));
  };

  // Derive unique pitch-class notes from selected positions
  const selectedNotes = useMemo(() => {
    const noteSet = new Set<string>();
    for (const pos of selectedPositions) {
      const [si, fret] = pos.split("-").map(Number);
      const note = getNoteAt(tuning[si], fret).toUpperCase();
      noteSet.add(note);
    }
    return [...noteSet].sort((a, b) => allNotes.indexOf(a) - allNotes.indexOf(b));
  }, [selectedPositions, tuning]);

  const chordMatches = useMemo(() => identifyChords(selectedNotes), [selectedNotes]);

  const exactMatches = chordMatches.filter((m) => m.matchType === "exact");
  const partialMatches = chordMatches.filter((m) => m.matchType !== "exact").slice(0, 20);

  // Notes to highlight when a chord is pinned
  const pinnedNoteSet = useMemo(() => new Set((pinnedChord?.notes ?? []).map((n) => n.toUpperCase())), [pinnedChord]);

  const matchTypeLabel = (m: ChordMatch) => {
    if (m.matchType === "exact") return "Exact";
    if (m.matchType === "subset") return `Missing ${m.missingCount}`;
    return `+${m.extraCount} extra`;
  };

  const matchTypeBadgeClass = (m: ChordMatch) => {
    if (m.matchType === "exact") return "bg-green-900/30 text-green-400 border border-green-700";
    if (m.matchType === "subset") return "bg-orange-900/30 text-orange-400 border border-orange-700";
    return "bg-[#1A1B1E]/30 text-[#facc15] border border-[#facc15]/30";
  };

  return (
    <div className='space-y-6'>
      {/* Pinned chord banner */}
      {pinnedChord && (
        <div className='flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-[#4C6EF5]/10 to-[#4C6EF5]/10 border border-[#373A40]/30 shadow-sm'>
          <div>
            <span className='text-xs font-semibold text-[#F8F9FA] uppercase tracking-wider'>Previewing</span>
            <div className='flex items-baseline gap-2 mt-0.5'>
              <span className='text-lg font-bold text-[#1A1B1E]'>{pinnedChord.name}</span>
              <span className='text-sm text-gray-500'>{pinnedChord.notes.join(" – ")}</span>
            </div>
          </div>
          <button
            onClick={() => setPinnedChord(null)}
            className='text-xs px-3 py-1.5 rounded-full border border-[#373A40]/50 text-[#F8F9FA] hover:bg-[#facc15] transition-colors font-medium'
          >
            Back to selection
          </button>
        </div>
      )}

      {/* Clear button + selected note pills */}
      <div className='flex flex-wrap items-center gap-3'>
        <button
          onClick={handleClear}
          disabled={selectedPositions.size === 0}
          className='px-4 py-2 bg-gradient-to-r from-[#4C6EF5] to-[#4C6EF5] text-white rounded-md hover:from-[#3b5de7] hover:to-[#3b5de7] transition-all shadow-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed'
        >
          Clear
        </button>
        {selectedNotes.length === 0 ? (
          <span className='text-[#1A1B1E]/50 text-sm italic'>No notes selected yet</span>
        ) : (
          <div className='flex flex-wrap gap-2'>
            {selectedNotes.map((note) => (
              <span
                key={note}
                className='px-3 py-1 rounded-full text-sm font-semibold bg-gradient-to-r from-[#4C6EF5] to-[#4C6EF5] text-white shadow-sm'
              >
                {note}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Fretboard */}
      <div className='fretboard-wrapper overflow-auto'>
        {/* Fret numbers */}
        <div className='flex mb-1'>
          {[...Array(totalFrets + 1).keys()].map((fret) => (
            <div key={fret} className='fret-number text-center flex-1 text-xs text-[#909296]'>
              {fret}
            </div>
          ))}
        </div>

        {/* Fret grid */}
        <div className='fretboard flex' style={{ minWidth: 800 }}>
          {[...Array(totalFrets + 1).keys()].map((fret) => (
            <div key={fret} className='fret flex flex-col flex-1 gap-1'>
              {tuning
                .slice()
                .reverse()
                .map((baseNote, reversedIndex) => {
                  const stringIndex = tuning.length - 1 - reversedIndex;
                  const note = getNoteAt(baseNote, fret).toUpperCase();
                  const posKey = `${stringIndex}-${fret}`;
                  const isSelected = selectedPositions.has(posKey);
                  const isPinnedNote = pinnedChord ? pinnedNoteSet.has(note) : false;
                  const isHighlighted = pinnedChord ? isPinnedNote : isSelected;

                  return (
                    <div
                      key={reversedIndex}
                      onClick={() => (pinnedChord ? undefined : handleNoteClick(stringIndex, fret))}
                      className={`note transition-colors select-none ${fret === 0 ? "open" : ""} ${
                        isHighlighted ? "highlight" : pinnedChord ? "opacity-40" : "cursor-pointer hover:bg-[#facc15]"
                      }`}
                      title={`${note} — string ${stringIndex + 1}, fret ${fret}`}
                    >
                      {note}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {/* Chord Results */}
      <div className='space-y-4'>
        {selectedNotes.length === 0 && (
          <div className='rounded-xl border border-dashed border-[#373A40]/30 p-8 text-center text-[#1A1B1E]/50'>
            Select notes on the fretboard above to identify chords
          </div>
        )}

        {selectedNotes.length > 0 && exactMatches.length === 0 && partialMatches.length === 0 && (
          <div className='rounded-xl border border-dashed border-orange-300 p-6 text-center text-orange-500'>
            No matching chords found — try selecting different notes
          </div>
        )}

        {exactMatches.length > 0 && (
          <div>
            <h3 className='text-sm font-semibold text-[#909296] uppercase tracking-wider mb-3'>Exact Matches</h3>
            <div className='flex flex-wrap gap-3'>
              {exactMatches.map((m) => (
                <button
                  key={m.name}
                  onClick={() => handleChordPin(m)}
                  className={`flex flex-col gap-1 px-4 py-3 rounded-xl border shadow-sm min-w-[120px] text-left transition-all ${
                    pinnedChord?.name === m.name
                      ? "border-[#373A40] bg-[#facc15]/10 ring-2 ring-[#facc15]"
                      : "border-yellow-200 bg-yellow-50 hover:border-[#373A40]/50 hover:bg-[#facc15]/10"
                  }`}
                >
                  <span className='font-bold text-[#1A1B1E] text-lg leading-tight'>{m.name}</span>
                  <span className='text-xs text-gray-500'>{m.notes.join(" – ")}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${matchTypeBadgeClass(m)}`}>
                    {matchTypeLabel(m)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {partialMatches.length > 0 && (
          <div>
            <h3 className='text-sm font-semibold text-[#909296] uppercase tracking-wider mb-3'>Possible Chords</h3>
            <div className='flex flex-wrap gap-3'>
              {partialMatches.map((m) => (
                <button
                  key={m.name}
                  onClick={() => handleChordPin(m)}
                  className={`flex flex-col gap-1 px-4 py-3 rounded-xl border shadow-sm min-w-[120px] text-left transition-all ${
                    pinnedChord?.name === m.name
                      ? "border-[#373A40] bg-[#facc15]/10 ring-2 ring-[#facc15]"
                      : "border-[#373A40]/20 bg-[#1A1B1E]/10 hover:border-[#facc15]/50 hover:bg-[#facc15]/10"
                  }`}
                >
                  <span className='font-semibold text-[#1A1B1E] leading-tight'>{m.name}</span>
                  <span className='text-xs text-gray-500'>{m.notes.join(" – ")}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${matchTypeBadgeClass(m)}`}>
                    {matchTypeLabel(m)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
