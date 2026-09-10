"use client";

import { useMemo, useState } from "react";
import { type LabeledShape, getVoicings, CHORD_TYPE_TOOLTIPS, formatChordLabel } from "../lib/chordVoicings";
import ChordDiagram from "./ChordDiagram";

const VOICING_OPTION_ORDER = ["Open / Standard", "E-Shape Barre", "A-Shape Barre"];

/**
 * One chord type (Major, m7, Sus2, ...) for one root: its diagram, plus a
 * dropdown to swap between the open shape and the E-/A-shape barre options.
 * Shared between chord-explorer's Chord Types panel and progression-builder's
 * per-chord columns, so a voicing added to one shows up the same way in both.
 */
export default function ChordTypeCard({
  note,
  type,
  useFlats,
}: {
  note: string;
  type: string;
  useFlats: boolean;
}) {
  const [voicingIndex, setVoicingIndex] = useState(0);

  const options = useMemo(() => {
    const all = getVoicings(note, type);
    return VOICING_OPTION_ORDER.map((label) => all.find((v) => v.label === label)).filter(
      (v): v is LabeledShape => Boolean(v)
    );
  }, [note, type]);

  const clampedIndex = Math.min(voicingIndex, Math.max(0, options.length - 1));
  const selected = options[clampedIndex];
  const chordLabel = formatChordLabel(note, type);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-line-subtle bg-surface-raised p-4 shadow-sm">
      <span
        className="text-xs font-semibold uppercase tracking-wider text-ink-muted"
        title={CHORD_TYPE_TOOLTIPS[type] ?? type}
      >
        {type}
      </span>
      {selected ? (
        <ChordDiagram shape={selected.shape} label={chordLabel} useFlats={useFlats} />
      ) : (
        <p className="text-xs text-ink-muted">No voicing available.</p>
      )}
      {options.length > 0 && (
        <select
          value={clampedIndex}
          onChange={(e) => setVoicingIndex(Number(e.target.value))}
          title="Swap the voicing or chord shape used for this chord"
          className="w-full max-w-[150px] rounded-lg border border-line-subtle bg-transparent px-2 py-1.5 text-xs"
        >
          {options.map((v, i) => (
            <option key={i} value={i}>
              {v.label}
              {v.position ? ` (${v.position})` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
