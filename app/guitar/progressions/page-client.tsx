"use client";

import { useMemo, useState } from "react";
import { Select } from "@radix-ui/themes";
import {
  PROGRESSION_GROUPS,
  noteAtDegree,
  parseRomanPattern,
  type ChordQuality,
} from "@/app/lib/chordProgressions";
import { formatChordLabel, getNeckVoicings, type NeckVoicing } from "@/app/lib/chordVoicings";
import { useGuitarSettings } from "@/app/lib/guitarSettings";
import type { GuitarTuning } from "@/app/lib/tunings";
import { Bento } from "@/app/components/ui/bento";
import ChordDiagram from "@/app/components/ChordDiagram";
import GuitarToolView from "../GuitarToolView";

/** Highest fret the Around-fret dropdown will aim a progression at. */
const MAX_TARGET_FRET = 12;

// `null` anchors the progression at each chord's lowest-sounding voicing, which
// is the open shape wherever one exists.
const POSITION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Open / lowest position" },
  ...Array.from({ length: MAX_TARGET_FRET }, (_, i) => ({
    value: i + 1,
    label: `Around fret ${i + 1}`,
  })),
];

/**
 * The rung this chord is played on. With no fret asked for that is the bottom of
 * the ladder; with one, it is whichever rung puts the hand nearest that fret.
 */
const anchorIndex = (voicings: NeckVoicing[], targetFret: number | null): number => {
  if (targetFret === null || voicings.length === 0) return 0;
  let best = 0;
  for (let i = 1; i < voicings.length; i++) {
    if (
      Math.abs(voicings[i].startFret - targetFret) <
      Math.abs(voicings[best].startFret - targetFret)
    ) {
      best = i;
    }
  }
  return best;
};

function ProgressionChordCard({
  roman,
  note,
  quality,
  voicings,
  index,
  pinnedId,
  useFlats,
  tuning,
  onPick,
}: {
  roman: string;
  note: string;
  quality: ChordQuality;
  /** This chord's rungs, lowest-sounding first. */
  voicings: NeckVoicing[];
  /** Which rung the fret anchor landed this chord on. */
  index: number;
  /** Set when this one chord was picked by hand, overriding the fret anchor. */
  pinnedId?: string;
  useFlats: boolean;
  tuning: GuitarTuning;
  onPick: (voicingId: string) => void;
}) {
  const pinnedIndex = pinnedId ? voicings.findIndex((v) => v.id === pinnedId) : -1;
  const selectedIndex = pinnedIndex >= 0 ? pinnedIndex : index;
  const selected = voicings[selectedIndex];
  const shape = selected?.shape ?? null;
  const label = formatChordLabel(note, quality);

  return (
    <Bento className="flex flex-col items-center gap-2">
      <span
        className="text-xs font-semibold tracking-wider text-ink-muted"
        title="Scale degree of this chord within the key — case shows major/minor (e.g. vi vs VI), ° shows diminished"
      >
        {roman}
      </span>
      {shape ? (
        <ChordDiagram shape={shape} label={label} useFlats={useFlats} tuning={tuning} />
      ) : (
        <div className="flex flex-col items-center gap-1 py-4">
          <span className="text-sm font-semibold text-ink-primary">{label}</span>
          <p className="text-xs text-ink-muted">No voicing available.</p>
        </div>
      )}
      {voicings.length > 0 && (
        <Select.Root size="1" value={selected?.id} onValueChange={onPick}>
          <Select.Trigger
            aria-label="Voicing"
            title="Pin this one chord to a shape, wherever the rest of the progression sits"
            className="w-full max-w-[150px]"
          />
          <Select.Content position="popper">
            {voicings.map((v) => (
              <Select.Item key={v.id} value={v.id}>
                {v.label}
                {v.position ? ` (${v.position})` : ""}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      )}
    </Bento>
  );
}

export default function ProgressionsTool() {
  const { rootNote: selectedNote, useFlats, tuning } = useGuitarSettings();

  const [selectedProgressionName, setSelectedProgressionName] = useState(PROGRESSION_GROUPS[0].items[0].name);
  // Per-chord voicing picks, scoped to the progression they were made on so
  // switching progressions starts fresh without a reset effect.
  const [progressionVoicings, setProgressionVoicings] = useState<{
    progression: string;
    byIndex: Record<number, string>;
  }>({ progression: selectedProgressionName, byIndex: {} });
  // Where the progression sits on the neck: every chord takes the voicing that
  // puts the hand nearest this fret.
  const [progressionFret, setProgressionFret] = useState<number | null>(null);

  const selectedProgressionDef = useMemo(
    () =>
      PROGRESSION_GROUPS.flatMap((g) => g.items).find((p) => p.name === selectedProgressionName) ??
      PROGRESSION_GROUPS[0].items[0],
    [selectedProgressionName]
  );

  const progressionChords = useMemo(
    () =>
      parseRomanPattern(selectedProgressionDef.pattern).map((c) => ({
        ...c,
        note: noteAtDegree(selectedNote, c.degree, useFlats),
      })),
    [selectedProgressionDef, selectedNote, useFlats]
  );

  // Each chord's rungs up the neck, lowest-sounding first.
  const progressionVoicingSets = useMemo(
    () => progressionChords.map((c) => getNeckVoicings(c.note, c.quality, tuning)),
    [progressionChords, tuning]
  );

  // Which rung of each chord the chosen fret lands on.
  const selectedIndices = useMemo(
    () => progressionVoicingSets.map((v) => anchorIndex(v, progressionFret)),
    [progressionVoicingSets, progressionFret]
  );

  // Pinned chords survive a key change, but not a switch to another progression.
  const pinnedVoicings =
    progressionVoicings.progression === selectedProgressionName ? progressionVoicings.byIndex : {};

  const handleProgressionVoicingChange = (index: number, voicingId: string) => {
    setProgressionVoicings((prev) => ({
      progression: selectedProgressionName,
      byIndex:
        prev.progression === selectedProgressionName
          ? { ...prev.byIndex, [index]: voicingId }
          : { [index]: voicingId },
    }));
  };

  // Moving the progression is a statement about all of it, so it releases the
  // chords that were pinned by hand rather than leaving some behind.
  const anchorProgression = (fret: number | null) => {
    setProgressionFret(fret);
    setProgressionVoicings({ progression: selectedProgressionName, byIndex: {} });
  };

  // Sidebar rather than a dropdown: the whole point is scanning the feelings
  // and clicking through them quickly, which a closed <select> can't do.
  const progressionContent = (
    <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
      <div
        className="flex max-h-64 min-h-0 shrink-0 flex-col overflow-y-auto rounded-lg border border-line-subtle md:max-h-none md:w-72"
        role="listbox"
        aria-label="Chord progressions by feeling"
      >
        {PROGRESSION_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="sticky top-0 z-10 border-b border-line-subtle bg-surface-sunken px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {group.label}
            </p>
            {group.items.map((p) => {
              const active = p.name === selectedProgressionName;
              return (
                <button
                  key={p.name}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedProgressionName(p.name)}
                  title={p.description}
                  className={`flex w-full items-start gap-2 border-l-2 px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-primary-solid bg-primary-solid/20"
                      : "border-transparent hover:bg-surface-overlay"
                  }`}
                >
                  {/* Chords first, name second: the pattern is what the list is
                      scanned for, so it gets the fixed column and the left
                      edge. Long ones wrap inside it rather than truncating —
                      half a progression is worse than a taller row. */}
                  <span className="w-24 shrink-0 pt-px font-mono text-[11px] leading-snug text-ink-muted">
                    {p.pattern}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-primary">{p.name}</span>
                    {/* Short-form songwriting themes this progression suits —
                        craft judgment, not research; see THEME_TAGS. Only the
                        "Most Popular" shortlist carries these. */}
                    {p.themes && p.themes.length > 0 && (
                      <span className="block text-[10px] leading-snug text-ink-muted">
                        {p.themes.join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:overflow-y-auto">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-ink-primary">{selectedProgressionDef.name}</p>
            <p className="text-sm text-ink-muted">{selectedProgressionDef.description}</p>
            {/* Genre + song examples — only the "Most Popular" shortlist
                carries these; see the sourcing note above PROGRESSION_GROUPS. */}
            {selectedProgressionDef.genre && (
              <p className="text-xs text-ink-muted">
                {selectedProgressionDef.genre}
                {selectedProgressionDef.songs && selectedProgressionDef.songs.length > 0 && (
                  <> — {selectedProgressionDef.songs.map((s) => `"${s}"`).join(", ")}</>
                )}
              </p>
            )}
            <p
              className="text-xs font-mono text-ink-muted"
              title="The Roman numeral pattern — each numeral represents a scale degree relative to the selected root note"
            >
              {selectedProgressionDef.pattern}
            </p>
          </div>

          {/* Place the whole progression on the neck */}
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="progression-fret-position"
                className="text-xs font-semibold uppercase tracking-wider text-ink-muted"
                title="Anchor the progression at a spot on the fretboard — every chord takes the voicing that puts your hand nearest that fret"
              >
                Fretboard Position
              </label>
              {/* Radix Select can't use "" as a value, so "open position" is "open". */}
              <Select.Root
                size="3"
                value={progressionFret === null ? "open" : String(progressionFret)}
                onValueChange={(v) => anchorProgression(v === "open" ? null : Number(v))}
              >
                <Select.Trigger
                  id="progression-fret-position"
                  title="Anchor the progression at a spot on the fretboard"
                  className="w-full min-w-[200px]"
                />
                <Select.Content position="popper">
                  {POSITION_OPTIONS.map((option) => (
                    <Select.Item key={option.label} value={option.value === null ? "open" : String(option.value)}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>

            <p className="max-w-[240px] text-xs text-ink-muted">
              {progressionFret === null
                ? "The lowest way to play it — open chords wherever they exist."
                : `Every chord in the shape that sits closest to fret ${progressionFret}.`}
            </p>
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {progressionChords.map((c, i) => (
            <ProgressionChordCard
              key={i}
              roman={c.roman}
              note={c.note}
              quality={c.quality}
              voicings={progressionVoicingSets[i] ?? []}
              index={selectedIndices[i] ?? 0}
              pinnedId={pinnedVoicings[i]}
              useFlats={useFlats}
              tuning={tuning}
              onPick={(voicingId) => handleProgressionVoicingChange(i, voicingId)}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <GuitarToolView
      title="Chord Progressions"
      tooltip="Progressions grouped by the feeling they create — the chords render in your key, the Roman numeral pattern stays fixed while the chords follow your root note. Fretboard Position puts the whole progression near a fret of your choosing, and each card's dropdown pins one chord to a shape of your own."
    >
      {/* A fixed height so the list and the chords scroll side by side. */}
      <div className="md:h-[calc(100dvh-9rem)]">{progressionContent}</div>
    </GuitarToolView>
  );
}
