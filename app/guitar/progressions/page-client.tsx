"use client";

import { useMemo, useState } from "react";
import { Select } from "@radix-ui/themes";
import {
  PROGRESSION_GROUPS,
  filterGroupsByKeyMode,
  keyModeForChordType,
  noteAtDegree,
  progressionChordType,
  parseRomanPattern,
} from "@/app/lib/chordProgressions";
import { formatChordLabel, getNeckVoicings, type NeckVoicing } from "@/app/lib/chordVoicings";
import { MAX_POSITION, updateGuitarSettings, useGuitarSettings } from "@/app/lib/guitarSettings";
import type { GuitarTuning } from "@/app/lib/tunings";
import { Bento } from "@/app/components/ui/bento";
import ChordDiagram from "@/app/components/ChordDiagram";
import GuitarToolView from "../GuitarToolView";
import { ordinal } from "../GuitarSettingsPanel";

// `null` anchors the progression at each chord's lowest-sounding voicing, which
// is the open shape wherever one exists.
const POSITION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Open position" },
  ...Array.from({ length: MAX_POSITION }, (_, i) => ({
    value: i + 1,
    label: `${ordinal(i + 1)} position (fret ${i + 1})`,
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
  type,
  voicings,
  index,
  pinnedId,
  useFlats,
  tuning,
  onPick,
}: {
  roman: string;
  note: string;
  /** The chord type shown: the Chord Type setting, fitted to this chord's major or minor third. */
  type: string;
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
  const label = formatChordLabel(note, type);

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
  const {
    rootNote: selectedNote,
    chordType,
    useFlats,
    tuning,
    // Where the progression sits on the neck, from the shared settings: every
    // chord takes the voicing that puts the hand nearest this fret.
    position: progressionFret,
  } = useGuitarSettings();

  // A minor chord type means a minor key: only progressions whose tonic is a
  // minor i, so picking A + Minor lists A minor progressions and nothing else.
  const keyMode = keyModeForChordType(chordType);
  const groups = useMemo(() => filterGroupsByKeyMode(PROGRESSION_GROUPS, keyMode), [keyMode]);

  const [chosenProgressionName, setSelectedProgressionName] = useState(PROGRESSION_GROUPS[0].items[0].name);
  // Per-chord voicing picks, scoped to the progression and position they were
  // made on, so changing either starts fresh without a reset effect.
  const [progressionVoicings, setProgressionVoicings] = useState<{
    progression: string;
    position: number | null;
    byIndex: Record<number, string>;
  }>({ progression: chosenProgressionName, position: progressionFret, byIndex: {} });

  // Switching key mode can hide the chosen progression; fall back to the first
  // one that fits rather than showing a progression in the wrong mode.
  const selectedProgressionDef = useMemo(
    () => groups.flatMap((g) => g.items).find((p) => p.name === chosenProgressionName) ?? groups[0].items[0],
    [groups, chosenProgressionName]
  );
  const selectedProgressionName = selectedProgressionDef.name;

  const progressionChords = useMemo(
    () =>
      parseRomanPattern(selectedProgressionDef.pattern).map((c) => ({
        ...c,
        note: noteAtDegree(selectedNote, c.degree, useFlats),
        // Maj7 in the settings makes every chord a 7th chord: Maj7 on the
        // major ones, m7 on the minor ones, so the progression keeps its key.
        type: progressionChordType(c.quality, chordType),
      })),
    [selectedProgressionDef, selectedNote, useFlats, chordType]
  );

  // Each chord's rungs up the neck, lowest-sounding first.
  const progressionVoicingSets = useMemo(
    () => progressionChords.map((c) => getNeckVoicings(c.note, c.type, tuning)),
    [progressionChords, tuning]
  );

  // Which rung of each chord the chosen fret lands on.
  const selectedIndices = useMemo(
    () => progressionVoicingSets.map((v) => anchorIndex(v, progressionFret)),
    [progressionVoicingSets, progressionFret]
  );

  // Pinned chords survive a key change, but not a switch to another
  // progression or a new position: moving the progression is a statement about
  // all of it, so it releases the chords that were pinned by hand.
  const pinsApply =
    progressionVoicings.progression === selectedProgressionName && progressionVoicings.position === progressionFret;
  const pinnedVoicings = pinsApply ? progressionVoicings.byIndex : {};

  const handleProgressionVoicingChange = (index: number, voicingId: string) => {
    setProgressionVoicings({
      progression: selectedProgressionName,
      position: progressionFret,
      byIndex: { ...pinnedVoicings, [index]: voicingId },
    });
  };

  const anchorProgression = (fret: number | null) => updateGuitarSettings({ position: fret });

  // Sidebar rather than a dropdown: the whole point is scanning the feelings
  // and clicking through them quickly, which a closed <select> can't do.
  const progressionContent = (
    <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
      <div
        className="flex max-h-64 min-h-0 shrink-0 flex-col overflow-y-auto rounded-lg border border-line-subtle md:max-h-none md:w-72"
        role="listbox"
        aria-label="Chord progressions by genre and feeling"
      >
        <p className="border-b border-line-subtle px-3 py-2 text-xs text-ink-muted">
          {keyMode === "minor" ? "Minor" : "Major"}-key progressions in{" "}
          <span className="font-semibold text-ink-primary">
            {selectedNote} {keyMode}
          </span>
          . Change Chord Type in settings to switch.
        </p>
        {groups.map((group) => (
          <div key={group.label}>
            <p className="sticky top-0 z-10 border-b border-line-subtle bg-surface-sunken px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
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
                Position
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
                : `Every chord in the shape closest to ${ordinal(progressionFret)} position (fret ${progressionFret}).`}
            </p>
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {progressionChords.map((c, i) => (
            <ProgressionChordCard
              key={i}
              roman={c.roman}
              note={c.note}
              type={c.type}
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
      tooltip="Progressions grouped by genre and by feeling, in your key. A minor Chord Type shows minor-key progressions and a major one shows major-key progressions. Position (also in settings) puts every chord in the shape closest to that fret, and each card's dropdown pins one chord to a shape of your own."
    >
      {/* A fixed height so the list and the chords scroll side by side. */}
      <div className="md:h-[calc(100dvh-9rem)]">{progressionContent}</div>
    </GuitarToolView>
  );
}
