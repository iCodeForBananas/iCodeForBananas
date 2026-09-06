"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { effectiveGrid, useDrumScheduler } from "./DrumMachine";
import type { KitSettings } from "./kit";

/**
 * Every layer of the kit, playing, in one component that draws nothing.
 *
 * The scheduler used to live inside the sidebar control, which meant the sound
 * existed only while that control was on screen. That was survivable when it
 * was a permanent row in the sidebar and fatal the moment the controls moved
 * into a modal: closing the designer would have unmounted the scheduler and
 * stopped the music. So the audio moved up here, to something the page owns and
 * the designer only talks to.
 *
 * Mount it once, high enough that nothing routine unmounts it, and drive it
 * with the kit. It renders null.
 */
export function KitPlayer({
  kit,
  layers,
  bpm,
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
  /**
   * Stands in for the kit's own level while a cue is fading the kit in or out.
   * Null the rest of the time, which is most of it.
   */
  drumVolume?: number | null;
}) {
  const drums = layers.has("drum");
  const claps = layers.has("claps");
  const shimmer = layers.has("shimmer");

  const grid = useMemo(() => effectiveGrid(kit.drums), [kit.drums]);

  // Claps and percussion are layers of their own: either one runs the
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

  // Publish where the loop is, for the designer's playhead. Going through a
  // store rather than a prop keeps the sixteen updates a bar off the page that
  // is rendering the whole song.
  useEffect(() => publishStep(step), [step]);
  useEffect(() => () => publishStep(-1), []);

  return null;
}

// ── Playhead ──────────────────────────────────────────────────────────────────

let playhead = -1;
const listeners = new Set<() => void>();

function publishStep(next: number) {
  if (next === playhead) return;
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
 * The sixteenth note the kit is on, or -1 while silent.
 *
 * Only the component that calls this re-renders on a step, which is the point:
 * the designer's grid lights up sixteen times a bar and the page underneath it
 * does not. The server snapshot is silence, since there is no audio there.
 */
export function useKitStep(): number {
  return useSyncExternalStore(
    subscribe,
    () => playhead,
    () => -1,
  );
}
