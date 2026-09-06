"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { effectiveGrid, useDrumScheduler } from "./DrumMachine";
import { useStringArpeggio, useStringPads } from "./StringPads";
import { useSubBassWalk, walkFromSettings } from "./SubBass";
import type { Chord } from "./progression";
import type { KitSettings } from "./kit";

/**
 * Every layer of the kit, playing, in one component that draws nothing.
 *
 * The schedulers used to live inside the sidebar controls, which meant the
 * sound existed only while its control was on screen. That was survivable when
 * each control was a permanent row in the sidebar and fatal the moment the
 * controls moved into a modal: closing the designer would have unmounted the
 * scheduler and stopped the music. So the audio moved up here, to something the
 * page owns and the designer only talks to.
 *
 * Mount it once, high enough that nothing routine unmounts it, and drive it
 * with the kit. It renders null.
 */
export function KitPlayer({
  kit,
  layers,
  bpm,
  beatsPerBar,
  progression,
  songKey,
  transposeSteps,
  drumVolume,
}: {
  kit: KitSettings;
  /**
   * What is sounding right now, which is not the same thing as what the kit
   * has switched on: during timed playback the song's own cues drive this, and
   * `kit.layers` is only the default they start from. Anything not in here is
   * silent whatever the kit says.
   */
  layers: ReadonlySet<string>;
  bpm: number;
  beatsPerBar: number;
  /** The song's own chords, a bar apiece. Empty when the sheet spells none. */
  progression: Chord[];
  songKey: string | null | undefined;
  transposeSteps: number;
  /**
   * Stands in for the kit's own drum level while a cue is fading the kit in or
   * out. Null the rest of the time, which is most of it.
   */
  drumVolume?: number | null;
}) {
  const drums = layers.has("drum");
  const claps = layers.has("claps");
  const shimmer = layers.has("shimmer");
  const bass = layers.has("sub");
  // A [drone] cue is the same pad held off the key rather than walking the
  // chords, so it drives the pad here too — one pad, two ways of steering it.
  const pad = layers.has("strings");
  const drone = layers.has("drone");

  const grid = useMemo(() => effectiveGrid(kit.drums), [kit.drums]);

  // Claps and percussion are layers of their own: either one runs the drum
  // scheduler even with the kit muted, which is what lets a claps-only chorus
  // work.
  const step = useDrumScheduler(
    bpm,
    grid,
    drums || claps || shimmer,
    drumVolume ?? kit.drums.volume,
    kit.drums.kick,
    kit.drums.snare,
    claps,
    shimmer,
    drums,
    kit.drums.shimmer,
  );

  const walk = useMemo(() => walkFromSettings(kit.bass, transposeSteps), [kit.bass, transposeSteps]);
  const bassStep = useSubBassWalk(walk, bpm, beatsPerBar, bass, kit.bass);

  // A song with no chords written in it has nothing to arpeggiate, so it holds
  // the key instead. Both hooks are always called; only one of them ever runs.
  const arpeggiating = pad && kit.pad.mode === "arpeggio" && progression.length > 0;
  const chord = useStringArpeggio(progression, bpm, beatsPerBar, arpeggiating, kit.pad);
  const droneSettings = useMemo(() => ({ ...kit.pad, mode: "drone" as const }), [kit.pad]);
  useStringPads(songKey, drone || (pad && !arpeggiating), droneSettings);

  // Publish where the loop is, for the designer's playhead. Going through a
  // store rather than a prop keeps the sixteen updates a bar off the page that
  // is rendering the whole song.
  useEffect(() => publishPlayhead({ step, bassStep, chord }), [step, bassStep, chord]);
  useEffect(() => () => publishPlayhead(SILENT), []);

  return null;
}

// ── Playhead ──────────────────────────────────────────────────────────────────

export interface KitPlayhead {
  /** Sixteenth note the drum loop is on, or -1 while silent. */
  step: number;
  /** Index into the bass walk, or -1. */
  bassStep: number;
  /** Index into the progression the pad is on, or -1. */
  chord: number;
}

const SILENT: KitPlayhead = { step: -1, bassStep: -1, chord: -1 };

let playhead: KitPlayhead = SILENT;
const listeners = new Set<() => void>();

function publishPlayhead(next: KitPlayhead) {
  if (next.step === playhead.step && next.bassStep === playhead.bassStep && next.chord === playhead.chord) {
    return;
  }
  playhead = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Where the kit is right now, for anything that wants to draw a playhead.
 *
 * Only the component that calls this re-renders on a step, which is the point:
 * the designer's grid lights up sixteen times a bar and the page underneath it
 * does not. The server snapshot is silence, since there is no audio there.
 */
export function useKitPlayhead(): KitPlayhead {
  return useSyncExternalStore(
    subscribe,
    () => playhead,
    () => SILENT,
  );
}
