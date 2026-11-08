"use client";

import { useMemo, useSyncExternalStore } from "react";
import { TextField } from "@radix-ui/themes";
import { Button } from "@/app/components/ui/button";
import { parseChordName } from "@/app/lib/chordShapes";
import { formatChordLabel } from "@/app/lib/chordVoicings";
import { useGuitarSettings } from "@/app/lib/guitarSettings";
import {
  TRIAD_INVERSIONS,
  TRIAD_STRING_SETS,
  degreeFormula,
  triadSpecFor,
  triadVoicings,
  type TriadVoicing,
} from "@/app/lib/triads";
import type { GuitarTuning } from "@/app/lib/tunings";
import GuitarToolView from "../GuitarToolView";
import VoicingCard from "../VoicingCard";

const TRIAD_PROGRESSION_KEY = "chord-explorer-triad-progression";

// The typed progression outlives this component, so it lives outside it, in the
// smallest external store React can subscribe to.
//
// Reading localStorage during a render would have the server send an empty field
// and the client draw a full one — React hydrates against markup that no longer
// matches, and the Clear button appears out of nowhere. Reading it in an effect
// instead means setting state as soon as the component mounts, which is the
// cascading render `react-hooks/set-state-in-effect` exists to stop. A store
// with a server snapshot is the thing that is actually being described: a value
// from outside React that the server cannot see.
//
// Memory is the source of truth and localStorage only mirrors it, so a browser
// with storage blocked still gets a working field for the visit.
function storedText(key: string) {
  let value: string | null = null;
  const listeners = new Set<() => void>();

  return {
    snapshot(): string {
      if (value === null) {
        try {
          value = window.localStorage.getItem(key) ?? "";
        } catch {
          value = "";
        }
      }
      return value;
    },
    /** What the server renders, and what the client hydrates against. */
    serverSnapshot: () => "",
    subscribe(onChange: () => void): () => void {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    write(next: string): void {
      value = next;
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage blocked — the value still works for this visit.
      }
      for (const listener of listeners) listener();
    },
  };
}

const progressionStore = storedText(TRIAD_PROGRESSION_KEY);

/** How many chords one progression may draw before it stops being a progression. */
const MAX_PROGRESSION_CHORDS = 12;

/**
 * A typed progression as chords. Separated by spaces, commas, dashes or pipes,
 * so "G C D", "G, C, D", "G - C - D" and "G | C | D" all read the same — people
 * write changes all four ways.
 *
 * A token that is not a chord comes back with `parsed: null` rather than being
 * dropped, so the panel can name what it could not read. That matters while
 * someone is still typing: "Gm" passes through "G" and "Gm" is fine, but a typo
 * that silently vanishes looks like the tool is broken.
 */
function parseProgression(text: string): { token: string; parsed: { note: string; type: string } | null }[] {
  return text
    .split(/[\s,|]+|\s-\s/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, MAX_PROGRESSION_CHORDS)
    .map((token) => ({ token, parsed: parseChordName(token) }));
}

/**
 * One chord's triads: the three string sets side by side, every shape on each.
 *
 * Its own component because a progression draws this once per chord, and a row
 * that drifted from the others would make two chords look different when the
 * only thing differing is the chord.
 */
function TriadStringSets({
  shapes,
  intervals,
  chordLabel,
  useFlats,
  tuning,
}: {
  shapes: TriadVoicing[];
  intervals: readonly number[];
  chordLabel: string;
  useFlats: boolean;
  tuning: GuitarTuning;
}) {
  return (
    <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-y-0 divide-y sm:divide-y-0 sm:divide-x divide-line-subtle">
      {TRIAD_STRING_SETS.map((set, idx) => {
        const onSet = shapes
          .filter((v) => v.stringSet === set.key)
          .sort((a, b) => a.startFret - b.startFret);
        return (
          <div
            key={set.key}
            className={`flex flex-col gap-1 pt-6 sm:pt-0${idx === 0 ? "" : " sm:pl-6"}${idx === TRIAD_STRING_SETS.length - 1 ? "" : " sm:pr-6"}`}
          >
            <span
              className="text-sm font-semibold text-ink-primary"
              title={`Three-note shapes played on ${set.label.replace("Strings ", "strings ")} — string 6 is the thickest, string 1 the thinnest`}
            >
              {set.label}
            </span>
            <span
              className="text-xs text-ink-muted mb-4"
              title="How many shapes there are on this string set — one for each inversion"
            >
              {onSet.length} shape{onSet.length === 1 ? "" : "s"}
            </span>
            <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
              {onSet.map((v) => {
                const inv = TRIAD_INVERSIONS.find((i) => i.key === v.inversion)!;
                return (
                  <div key={v.id} className="flex flex-col items-center gap-1">
                    <VoicingCard
                      shape={v.shape}
                      chordLabel={chordLabel}
                      sublabel={inv.label}
                      useFlats={useFlats}
                      tuning={tuning}
                    />
                    <span
                      className="text-xs text-ink-muted text-center tabular-nums"
                      title={`${
                        v.startFret === 0
                          ? "Played at the open position, near the headstock"
                          : `Start your fretting hand around fret ${v.startFret}`
                      } — then the notes of the chord in the order this shape stacks them, lowest string first`}
                    >
                      {v.startFret === 0 ? "Open" : `${v.startFret}fr`} · {degreeFormula(intervals, v.inversion)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TriadsTool() {
  const { rootNote: selectedNote, chordType: selectedType, useFlats, tuning } = useGuitarSettings();

  // ── Triads ──────────────────────────────────────────────────────────────────
  //
  // Type a progression and the panel gives you a row per chord, in the order you
  // wrote them, so a whole change is on screen at once instead of one chord at a
  // time. Leave it empty and it falls back to the chord picked in Settings.
  const progressionText = useSyncExternalStore(
    progressionStore.subscribe,
    progressionStore.snapshot,
    progressionStore.serverSnapshot
  );
  const updateProgression = progressionStore.write;

  /**
   * The progression as chords to draw. Tokens that are not chords are kept so
   * the panel can say which ones it could not read, rather than dropping them
   * and leaving someone to wonder where their chord went.
   */
  const typedChords = useMemo(() => parseProgression(progressionText), [progressionText]);
  const unreadable = typedChords.filter((c) => c.parsed === null).map((c) => c.token);

  // Every chord type on this page is either a triad or a triad with more piled
  // on top, so a row always has something to show — for a Maj9 it is the major
  // triad underneath it, which is the part worth moving around the neck.
  const triadRows = useMemo(() => {
    const sources = typedChords.some((c) => c.parsed)
      ? typedChords.flatMap((c) => (c.parsed ? [{ token: c.token, ...c.parsed }] : []))
      : [{ token: "", note: selectedNote, type: selectedType as string }];

    return sources.flatMap(({ token, note, type }) => {
      const spec = triadSpecFor(type);
      if (!spec) return [];
      return [{
        key: `${token}-${note}-${type}`,
        note,
        type,
        spec,
        shapes: triadVoicings(note, spec.intervals, tuning),
        triadLabel: formatChordLabel(note, spec.quality),
        sourceLabel: formatChordLabel(note, type),
      }];
    });
  }, [typedChords, selectedNote, selectedType, tuning]);

  // Grouped by string set rather than by inversion: the exercise is to stay on
  // three strings and walk the shapes up the neck, so the column you are working
  // in is the thing to hold still. A progression stacks one of those rows per
  // chord, in the order written, so the whole change reads top to bottom.
  const triadsContent = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <span
            className="text-xs font-semibold uppercase tracking-wider text-ink-muted shrink-0"
            title="Type the chords you want to play and every one of them gets its own row of triad shapes"
          >
            Progression
          </span>
          <TextField.Root
            value={progressionText}
            onChange={(e) => updateProgression(e.target.value)}
            placeholder="G C D — leave empty for the chord in Settings"
            spellCheck={false}
            aria-label="Chord progression for triad shapes"
            title="Chords separated by spaces, commas, dashes or pipes — G C D, G, C, D and G | C | D all work. Names like Am, F#m7, Csus4 and Bb are understood."
            className="w-full sm:max-w-sm"
          />
          {progressionText.trim() !== "" && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => updateProgression("")}
              title="Clear the progression and go back to the chord picked in Settings"
              className="shrink-0 self-start sm:self-center"
            >
              Clear
            </Button>
          )}
        </label>

        {unreadable.length > 0 && (
          <p className="text-xs text-primary-text">
            Not a chord I know: {unreadable.map((t) => `"${t}"`).join(", ")}. Try names like G, Am,
            F#m7, Csus4 or Bb.
          </p>
        )}

        <p className="text-sm text-ink-muted">
          {triadRows.length > 1 ? (
            <>
              A row of shapes for each chord, in the order you wrote them:{" "}
              <span className="font-semibold text-ink-primary">
                {triadRows.map((r) => r.triadLabel).join(" → ")}
              </span>
              .
            </>
          ) : triadRows.length === 1 ? (
            triadRows[0].spec.exact ? (
              <>
                Every way to play{" "}
                <span className="font-semibold text-ink-primary">{triadRows[0].triadLabel}</span> as
                three notes on three adjacent strings.
              </>
            ) : (
              <>
                The <span className="font-semibold text-ink-primary">{triadRows[0].triadLabel}</span>{" "}
                triad inside{" "}
                <span className="font-semibold text-ink-primary">{triadRows[0].sourceLabel}</span> — the
                three notes at its core, without the extensions stacked on top.
              </>
            )
          ) : (
            <>Type a chord above to see its triad shapes.</>
          )}{" "}
          <span
            className="text-ink-muted"
            title="A pitch repeats every twelve frets, so these are all the shapes there are — past fret 12 the same ones come round again an octave higher"
          >
            These are all of them; above fret 12 they repeat an octave up.
          </span>
        </p>
      </div>

      {triadRows.map((row, idx) => (
        <div
          key={`${row.key}-${idx}`}
          className={idx === 0 ? undefined : "border-t border-line-subtle pt-4"}
        >
          {/* A row only needs naming when there is more than one to tell apart. */}
          {triadRows.length > 1 && (
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-base font-bold text-ink-primary">{row.triadLabel}</span>
              {!row.spec.exact && (
                <span
                  className="text-xs text-ink-muted"
                  title="The extensions are not in these shapes — this is the triad they are built on"
                >
                  the triad inside {row.sourceLabel}
                </span>
              )}
            </div>
          )}
          <TriadStringSets
            shapes={row.shapes}
            intervals={row.spec.intervals}
            chordLabel={row.triadLabel}
            useFlats={useFlats}
            tuning={tuning}
          />
        </div>
      ))}
    </div>
  );

  return (
    <GuitarToolView
      title="Triad Shapes"
      tooltip="Every way to play this chord as just three notes on three adjacent strings — each inversion, on each string set, at the place on the neck where it sits. For a 7th or extended chord you get the triad at its core."
    >
      {triadsContent}
    </GuitarToolView>
  );
}
