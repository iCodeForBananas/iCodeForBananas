"use client";

import React, { useState, useMemo } from "react";
import "./fretboard.css";
import { Button } from "@/app/components/ui/button";
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

/**
 * `rootNote` is the page's Root Note. The finder still works bottom-up — you
 * pick notes and it names them — so the root only marks where it sits on the
 * neck rather than choosing anything for you.
 */
export default function ChordFinder({ rootNote }: { rootNote?: string } = {}) {
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

  const rootUpper = rootNote ? rootNote.toUpperCase() : null;

  const matchTypeBadgeClass = (m: ChordMatch) => {
    if (m.matchType === "exact") return "border border-success/40 bg-success/10 text-success";
    if (m.matchType === "subset") return "border border-line-subtle bg-surface-sunken text-ink-muted";
    return "border border-primary-solid/30 bg-primary-solid/10 text-primary-text";
  };

  return (
    <div className='space-y-6'>
      {/* Pinned chord banner */}
      {pinnedChord && (
        <div className='flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-line-subtle bg-surface-raised shadow-raised'>
          <div>
            <span className='text-10 font-semibold text-ink-muted uppercase tracking-wider'>Previewing</span>
            <div className='flex items-baseline gap-2 mt-0.5'>
              <span className='text-20 font-semibold text-ink-primary'>{pinnedChord.name}</span>
              <span className='text-13 text-ink-muted'>{pinnedChord.notes.join(" – ")}</span>
            </div>
          </div>
          <Button variant='ghost' size='sm' onClick={() => setPinnedChord(null)} className='rounded-full'>
            Back to selection
          </Button>
        </div>
      )}

      {/* Clear button + selected note pills */}
      <div className='flex flex-wrap items-center gap-3'>
        <Button variant='primary' size='lg' onClick={handleClear} disabled={selectedPositions.size === 0}>
          Clear
        </Button>
        {selectedNotes.length === 0 ? (
          <span className='text-13 italic text-ink-muted'>No notes selected yet</span>
        ) : (
          <div className='flex flex-wrap gap-2'>
            {selectedNotes.map((note) => (
              <span
                key={note}
                className='rounded-full bg-primary-solid px-3 py-1 text-13 font-medium text-ink-on-primary'
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
            <div key={fret} className='fret-number text-center flex-1 text-10 text-ink-muted'>
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
                  const isRoot = rootUpper !== null && note === rootUpper;

                  return (
                    <div
                      key={reversedIndex}
                      onClick={() => (pinnedChord ? undefined : handleNoteClick(stringIndex, fret))}
                      className={`note transition-colors select-none ${fret === 0 ? "open" : ""} ${
                        isHighlighted
                          ? "highlight"
                          : pinnedChord
                            ? "opacity-40"
                            : "cursor-pointer hover:bg-primary-solid hover:text-ink-on-primary"
                      }`}
                      // The root gets a ring rather than a fill: it is already
                      // one of the highlighted notes, and a second fill colour
                      // would say it is a different kind of note instead of the
                      // same note with a name.
                      style={isRoot ? { boxShadow: "inset 0 0 0 2px var(--ds-color-primary-text)" } : undefined}
                      title={
                        isRoot
                          ? `${note} — string ${stringIndex + 1}, fret ${fret} (your root note)`
                          : `${note} — string ${stringIndex + 1}, fret ${fret}`
                      }
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
          <div className='rounded-xl border border-dashed border-line-subtle p-8 text-center text-ink-muted'>
            Select notes on the fretboard above to identify chords
          </div>
        )}

        {selectedNotes.length > 0 && exactMatches.length === 0 && partialMatches.length === 0 && (
          <div className='rounded-xl border border-dashed border-line-strong p-6 text-center text-ink-muted'>
            No matching chords found — try selecting different notes
          </div>
        )}

        {exactMatches.length > 0 && (
          <div>
            <h3 className='mb-3 text-12 font-semibold uppercase tracking-wider text-ink-muted'>Exact Matches</h3>
            <div className='flex flex-wrap gap-3'>
              {exactMatches.map((m) => (
                <button
                  key={m.name}
                  onClick={() => handleChordPin(m)}
                  className={`flex min-w-[120px] flex-col gap-1 rounded-xl border px-4 py-3 text-left shadow-raised transition-colors duration-120 ease-ui ${
                    pinnedChord?.name === m.name
                      ? "border-primary-solid bg-primary-solid/10"
                      : "border-line-subtle bg-surface-raised hover:border-line-strong hover:bg-surface-overlay"
                  }`}
                >
                  <span className='text-20 font-semibold text-ink-primary'>{m.name}</span>
                  <span className='text-10 text-ink-muted'>{m.notes.join(" – ")}</span>
                  <span className={`w-fit rounded-full px-2 py-0.5 text-10 font-medium ${matchTypeBadgeClass(m)}`}>
                    {matchTypeLabel(m)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {partialMatches.length > 0 && (
          <div>
            <h3 className='mb-3 text-12 font-semibold uppercase tracking-wider text-ink-muted'>Possible Chords</h3>
            <div className='flex flex-wrap gap-3'>
              {partialMatches.map((m) => (
                <button
                  key={m.name}
                  onClick={() => handleChordPin(m)}
                  className={`flex min-w-[120px] flex-col gap-1 rounded-xl border px-4 py-3 text-left shadow-raised transition-colors duration-120 ease-ui ${
                    pinnedChord?.name === m.name
                      ? "border-primary-solid bg-primary-solid/10"
                      : "border-line-subtle bg-surface-raised hover:border-line-strong hover:bg-surface-overlay"
                  }`}
                >
                  <span className='text-15 font-medium text-ink-primary'>{m.name}</span>
                  <span className='text-10 text-ink-muted'>{m.notes.join(" – ")}</span>
                  <span className={`w-fit rounded-full px-2 py-0.5 text-10 font-medium ${matchTypeBadgeClass(m)}`}>
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
