"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ACCENT,
  accentByName,
  accentNameFrom,
  isAccentName,
  playAccentStep,
} from "./accents";

// ── Patterns ────────────────────────────────────────────────────────────────
// 16 steps of 16th notes. 1 = hit, 0 = rest.

interface Pattern {
  name: string;
  kick: number[];
  snare: number[];
  hihat: number[];
}

export const DRUM_PATTERNS: Pattern[] = [
  // ── Core indie / folk ──────────────────────────────────────────────────────
  {
    name: "Folk Stomp",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Indie Kick",
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Half-time",
    kick:  [1,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  },
  {
    name: "Stomp & Brush",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0],
    snare: [0,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Shuffle",
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,1,0,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1],
    hihat: [1,0,1,0, 0,1,0,0, 1,0,1,0, 0,1,0,0],
  },
  // ── Grooves ───────────────────────────────────────────────────────────────
  {
    name: "4 on the Floor",
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1],
  },
  {
    name: "Swing Beat",
    // Kick 1+3, snare 2+4, hi-hat on swung 8ths (triplet feel: beat + skip + late)
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1],
  },
  {
    name: "Sexy Beat",
    // Kick 1 + 3 with a pickup on the "and" of 4 that leans into the next bar,
    // snare 2 + 4, straight 8th hats for the sultry R&B push-and-pull.
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Boom-Chick",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,1,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  // ── More roots & folk ─────────────────────────────────────────────────────
  //
  // Acoustic indie folk, in the same vein as Folk Stomp and Indie Kick: stomps
  // and claps, brush snare, and a couple of 6/8 and 3/4 feels that use 12 of
  // the 16 steps the way Waltz Feel does.
  {
    name: "Barn Stomp",
    // Folk Stomp with the second stomp answered on the "and" of 3 and a snare
    // pickup on the "a" of 4 — the same beat, but leaning forward.
    kick:  [1,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Campfire Clap",
    // Everyone joins in on 2 and 4. No hats, stomp pushing off the "and" of 2,
    // and the clap doubling on the "a" of 4 to hand the bar back.
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Big Chorus",
    // The last-chorus lift: kick on all four, snare on the backbeat and its
    // "and", hats stuttering into the bar line.
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,1,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
  },
  {
    name: "Banjo Roll",
    // Rolling 16th hats under a kick that keeps moving — drive for a picked
    // banjo or a strummed 8th-note guitar part.
    kick:  [1,0,1,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
  },
  {
    name: "Train Beat",
    // Country/bluegrass chug: brush snare running 8ths and 16ths the whole bar
    // with the kick only marking 1 and 3. Set the snare to Brush for this one.
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,1,0, 1,1,1,1, 0,0,1,0, 1,1,1,1],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Brush Shuffle",
    // Triplet lean: hats on the beat and the "a", snare answering just ahead of
    // each backbeat. The porch version of Shuffle.
    kick:  [1,0,0,0, 0,0,0,1, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,1, 1,0,0,0, 0,0,0,1, 1,0,0,1],
    hihat: [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1],
  },
  {
    name: "Floor Tom",
    // No hats, no backbeat until 3 — the big open tom pulse a song builds on
    // before the kit comes in.
    kick:  [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Porch Sway",
    // 6/8 across 12 of the 16 steps: kick on 1 and the last eighth so the bar
    // rocks back, snare on the 6/8 backbeat.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 0,0,0,0],
  },
  {
    name: "Sea Shanty",
    // 6/8 stomp with no hats at all — two stomps and two claps a bar, the beat
    // a room full of people can keep without being taught it.
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,1,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Mountain Waltz",
    // 3/4 over 12 steps like Waltz Feel, but oom-pah-pah: kick on 1 and 3,
    // snare on 2, hats swung so the turn of the bar lilts.
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [1,0,0,1, 1,0,0,1, 1,0,0,1, 0,0,0,0],
  },
  {
    name: "Reggae One Drop",
    kick:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Bossa Nova",
    kick:  [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
    snare: [0,0,1,0, 0,1,0,0, 0,0,1,0, 0,1,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Slow Groove",
    kick:  [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],
    hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  },
  {
    name: "March",
    kick:  [1,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    snare: [0,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Waltz Feel",
    // 3 beats mapped to 12 of 16 steps (last 4 silent, loop still 16)
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,1,0,0, 0,0,0,0],
    hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 0,0,0,0],
  },
  // ── Sparse / simple ───────────────────────────────────────────────────────
  {
    name: "Kick Only",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "1 & 4",
    // Kick on beat 1, snare on beats 2, 3, 4
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Pulse",
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  // ── Dance floor ───────────────────────────────────────────────────────────
  {
    name: "Disco Floor",
    // Four on the floor with driving 16th hats instead of offbeat 8ths —
    // busier and more forward than the plain "4 on the Floor" above.
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
  },
  {
    name: "Two-Step",
    // UK garage skip: kick pulled off the downbeat, snare with a 16th push on
    // the "a" of 2, offbeat hats closing with a stutter into the next bar.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0],
    hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1],
  },
  {
    name: "Stomp Clap",
    // Arena chant: stomp, stomp, clap, rest. No hats — the space is the hook.
    kick:  [1,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  // ── Hip-hop, funk & R&B ───────────────────────────────────────────────────
  {
    name: "Boom Bap",
    // Kick on 1 with the classic "and of 2" / "and of 3" answer, hard backbeat.
    kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Funk Break",
    // Breakbeat syncopation — kick on the "a" of 1, snare answering off the
    // grid, hats stuttering into 2 and 4.
    kick:  [1,0,0,1, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,1,0],
    hihat: [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,1],
  },
  {
    name: "Second Line",
    // New Orleans street beat: the shuffle-adjacent parade groove that funk
    // grew out of. Kick and snare trade syncopations all bar.
    kick:  [1,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 0,0,1,0, 0,0,1,1, 0,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  // ── Latin & global ────────────────────────────────────────────────────────
  {
    name: "Tresillo Pop",
    // The 3+3+2 kick that runs under a huge slice of modern pop.
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Dembow",
    // Reggaeton's engine: kick on 1 and 3, snare on the "a"/"and" pairs that
    // give it the boom-ch-boom-chick lurch.
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,1, 0,0,1,0, 0,0,0,1, 0,0,1,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Afrobeats",
    // Kick pushing off the "and" of 2 and into the bar line, clap landing late
    // on 4, shaker-style 16th fills between.
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0],
    hihat: [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0],
  },
  {
    name: "Samba Step",
    // Surdo on the "a" of each half bar, tamborim-style snare cutting across
    // it, constant 16ths underneath.
    kick:  [1,0,0,1, 0,0,0,0, 1,0,0,1, 0,0,0,0],
    snare: [0,0,1,0, 0,0,1,0, 0,0,0,1, 0,0,1,0],
    hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
  },
  // ── Airy & emotional ──────────────────────────────────────────────────────
  {
    name: "Heartbeat",
    // Lub-dub twice a bar, nothing else. Pairs with the dance grooves as the
    // drop-out section.
    kick:  [1,0,1,0, 0,0,0,0, 1,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Floating",
    // One kick a bar, hats breathing on the quarter and the "and" of 2 — open
    // enough to leave the melody all the room.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
  },
  {
    name: "Rainfall",
    // Scattered offbeat 16ths over a kick that lands late — unsettled, no
    // backbeat to lock onto.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,1,0, 0,1,0,0, 0,0,1,0, 0,1,0,1],
  },
  {
    name: "6/8 Ballad",
    // Two dotted-quarter pulses across 12 of the 16 steps, like Waltz Feel —
    // the slow-dance feel.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 0,0,0,0],
  },
  // ── Slow & sultry ─────────────────────────────────────────────────────────
  //
  // Slow-dance R&B for an acoustic track: brush snare and folk kick, mostly in
  // the 65–95 bpm range where a half-time backbeat still moves.
  {
    name: "Neo Soul",
    // Half-time — one backbeat on 3, so the bar breathes twice as slow as the
    // hats. Kick answers itself on the "a" of 1 and the "and" of 3.
    kick:  [1,0,0,1, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0],
  },
  {
    name: "Slow Jam",
    // 90s quiet-storm backbeat: kick on 1 and the "and" of 2 and 3, with a
    // 16th pickup on the "a" of 4 that pulls the bar over.
    kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,1],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,1,1,0],
  },
  {
    name: "Quiet Storm",
    // The sparest of the set. Kick on 1 and the "and" of 3, snare on 3 alone,
    // hats only on the quarters with a whisper on the "a" before 3 and 1.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,1],
  },
  {
    name: "Body Roll",
    // Tresillo kick (1, "and" of 2, 4) under a straight backbeat, offbeat hats
    // on the "and" of every beat — the one that gets hips going at a crawl.
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,1],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0],
    hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
  },
  {
    name: "Silk Shuffle",
    // Swung 16ths: hats on the beat and the "a", so every pair leans late.
    // Kick lands on the "a" of 2 and the "and" of 3 and 4.
    kick:  [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,1,1],
  },
  {
    name: "Steppers",
    // Grown-folks two-step: four on the floor slowed way down, snare answering
    // on the "and" of 3 as well as the backbeats. Danceable without rushing.
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,1],
    snare: [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0],
    hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,1,1,0],
  },
  {
    name: "Slow Wine",
    // Dancehall grind at half speed — kick on 1 and 3 with an "a" of 3 double,
    // snare hitting the syncopations, hats staying off the downbeat.
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0],
    snare: [0,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,1,0],
    hihat: [0,0,1,0, 1,0,1,0, 0,0,1,0, 1,0,1,0],
  },
  {
    name: "Velvet Rope",
    // Snaps and space: backbeat on 2 and 4, syncopated kick, no hats at all.
    // Turn the claps layer on and this is the whole groove.
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Late Night",
    // Drunk-feel lean: the snare sits on the "e" of 2 and 4 instead of the
    // beat, so the backbeat drags behind the hats all bar.
    kick:  [1,0,0,1, 0,0,0,0, 0,1,0,0, 0,0,1,0],
    snare: [0,0,0,0, 0,1,0,0, 0,0,0,0, 0,1,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,1, 1,0,1,0],
  },
  {
    name: "Last Dance",
    // Half-time close: one kick, one backbeat on 3, and a 16th snare and hat
    // flourish across beat 4 to turn the bar over.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,1],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,1,1,1],
  },
];

// ── Dropdown grouping ────────────────────────────────────────────────────────
//
// Presentation only — the scheduler still works off DRUM_PATTERNS order, and a
// pattern missing from every group still shows up under "More", so adding one
// can never make it vanish from the picker.

const PATTERN_GROUP_NAMES: { label: string; names: string[] }[] = [
  { label: "Backbeat & rock",     names: ["Half-time", "Slow Groove", "March", "Stomp Clap"] },
  { label: "Roots & folk",        names: [
    "Folk Stomp", "Indie Kick", "Barn Stomp", "Campfire Clap", "Big Chorus", "Banjo Roll",
    "Train Beat", "Brush Shuffle", "Stomp & Brush", "Boom-Chick", "Floor Tom",
    "Porch Sway", "Sea Shanty", "Mountain Waltz",
  ] },
  { label: "Dance floor",         names: ["4 on the Floor", "Disco Floor", "Two-Step"] },
  { label: "Hip-hop, funk & R&B", names: ["Sexy Beat", "Boom Bap", "Funk Break", "Second Line"] },
  { label: "Slow & sultry",       names: ["Neo Soul", "Slow Jam", "Quiet Storm", "Body Roll", "Silk Shuffle", "Steppers", "Slow Wine", "Velvet Rope", "Late Night", "Last Dance"] },
  { label: "Latin & global",      names: ["Tresillo Pop", "Dembow", "Afrobeats", "Samba Step", "Bossa Nova", "Reggae One Drop"] },
  { label: "Jazz & swing",        names: ["Shuffle", "Swing Beat"] },
  { label: "Airy & emotional",    names: ["Heartbeat", "Floating", "Rainfall", "6/8 Ballad", "Waltz Feel"] },
  { label: "Sparse",              names: ["Kick Only", "1 & 4", "Pulse"] },
];

export const PATTERN_GROUPS: { label: string; items: { name: string; index: number }[] }[] = (() => {
  const indexOf = new Map(DRUM_PATTERNS.map((p, i) => [p.name, i]));
  const grouped = PATTERN_GROUP_NAMES.map(({ label, names }) => ({
    label,
    items: names
      .filter((name) => indexOf.has(name))
      .map((name) => ({ name, index: indexOf.get(name)! })),
  })).filter((g) => g.items.length > 0);

  const placed = new Set(grouped.flatMap((g) => g.items.map((i) => i.name)));
  const rest = DRUM_PATTERNS.map((p, i) => ({ name: p.name, index: i })).filter((p) => !placed.has(p.name));
  return rest.length ? [...grouped, { label: "More", items: rest }] : grouped;
})();

// ── The grid ─────────────────────────────────────────────────────────────────
//
// A pattern from the library is stored as its name. A pattern somebody edited
// is stored as its steps, because there is no name to look it up by — that is
// the whole difference between picking a beat and writing one.

export const STEPS_PER_BAR = 16;

/** The four lanes a beat is written on, in the order they stack on screen. */
export const GRID_LANES = ["kick", "snare", "hihat", "clap"] as const;
export type GridLane = (typeof GRID_LANES)[number];

export type DrumGrid = Record<GridLane, number[]>;

/** The name a pattern takes once it has been edited away from the library. */
export const CUSTOM_PATTERN = "Custom";

export function emptyGrid(): DrumGrid {
  return {
    kick:  Array(STEPS_PER_BAR).fill(0),
    snare: Array(STEPS_PER_BAR).fill(0),
    hihat: Array(STEPS_PER_BAR).fill(0),
    clap:  Array(STEPS_PER_BAR).fill(0),
  };
}

/** Sixteen 0/1s, however short, long or nonsensical the input was. */
function normalizeLane(raw: unknown): number[] {
  const lane = Array(STEPS_PER_BAR).fill(0);
  if (!Array.isArray(raw)) return lane;
  for (let i = 0; i < STEPS_PER_BAR; i++) lane[i] = raw[i] ? 1 : 0;
  return lane;
}

export function normalizeGrid(raw: unknown): DrumGrid | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const grid = emptyGrid();
  let any = false;
  for (const lane of GRID_LANES) {
    if (r[lane] !== undefined) any = true;
    grid[lane] = normalizeLane(r[lane]);
  }
  return any ? grid : null;
}

/**
 * A library pattern as an editable grid. The clap lane starts on beats 2 and 4,
 * which is where the claps layer has always put them, so opening a pattern in
 * the editor shows what it already sounds like rather than an empty lane.
 */
export function gridFromPattern(name: string): DrumGrid {
  const pat = DRUM_PATTERNS[patternIndex(name)];
  const clap = Array(STEPS_PER_BAR).fill(0);
  clap[4] = 1;
  clap[12] = 1;
  return {
    kick:  [...pat.kick],
    snare: [...pat.snare],
    hihat: [...pat.hihat],
    clap,
  };
}

export function gridsEqual(a: DrumGrid, b: DrumGrid): boolean {
  return GRID_LANES.every((lane) => a[lane].every((v, i) => v === b[lane][i]));
}

/** The steps actually played: what was edited, or the pattern that was picked. */
export function effectiveGrid(s: DrumSettings): DrumGrid {
  return s.steps ?? gridFromPattern(s.pattern);
}

// ── Settings ─────────────────────────────────────────────────────────────────

export type KickStyle  = "folk" | "808";
export type SnareStyle = "regular" | "brush";

/** What the drum machine remembers per song — stored on the sheet's metadata. */
export interface DrumSettings {
  /** Pattern name rather than index, so reordering DRUM_PATTERNS can't reassign it. */
  pattern: string;
  /**
   * The edited steps, or null to play the named pattern as the library has it.
   *
   * Both are kept: `pattern` stays the name the edit started from, so the
   * designer can say what was changed and offer to put it back, and a song
   * saved before the grid existed simply has null here and sounds the same.
   */
  steps: DrumGrid | null;
  kick: KickStyle;
  snare: SnareStyle;
  /** Which accent part the Shimmer layer plays; see ACCENT_VARIATIONS. */
  shimmer: string;
  volume: number;
}

export const DEFAULT_DRUM_SETTINGS: DrumSettings = {
  pattern: DRUM_PATTERNS[0].name,
  steps: null,
  kick: "folk",
  snare: "regular",
  shimmer: DEFAULT_ACCENT,
  volume: 0.8,
};

/** Coerce whatever came back from the database into usable settings. */
export function normalizeDrumSettings(raw: unknown): DrumSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_DRUM_SETTINGS;
  const r = raw as Record<string, unknown>;
  const known = DRUM_PATTERNS.some((p) => p.name === r.pattern);
  const volume = typeof r.volume === "number" && isFinite(r.volume) ? r.volume : DEFAULT_DRUM_SETTINGS.volume;
  return {
    pattern: known ? (r.pattern as string) : DEFAULT_DRUM_SETTINGS.pattern,
    steps:   normalizeGrid(r.steps),
    kick:    r.kick === "808" ? "808" : "folk",
    snare:   r.snare === "brush" ? "brush" : "regular",
    shimmer: isAccentName(r.shimmer) ? r.shimmer : DEFAULT_DRUM_SETTINGS.shimmer,
    volume:  Math.min(1, Math.max(0, volume)),
  };
}

/** Index of a pattern by name; falls back to the first pattern. */
export function patternIndex(name: string): number {
  const i = DRUM_PATTERNS.findIndex((p) => p.name === name);
  return i === -1 ? 0 : i;
}

export function isDefaultDrumSettings(s: DrumSettings): boolean {
  return (
    s.pattern === DEFAULT_DRUM_SETTINGS.pattern &&
    s.steps === null &&
    s.kick === DEFAULT_DRUM_SETTINGS.kick &&
    s.snare === DEFAULT_DRUM_SETTINGS.snare &&
    s.shimmer === DEFAULT_DRUM_SETTINGS.shimmer &&
    s.volume === DEFAULT_DRUM_SETTINGS.volume
  );
}

// ── Text form ────────────────────────────────────────────────────────────────
//
// The settings also live in the song text as a preamble line, alongside Key and
// Tempo, so they can be read and edited by hand:
//
//   Drums: Stomp & Brush, folk kick, brush snare, Tambourine, 80%
//
// No pattern or accent name contains a comma, so comma-separated fields parse
// cleanly.

const DRUMS_LINE_RE = /\bDrums:\s*([^\n|]*)/i;

/**
 * One lane as sixteen characters — `x` for a hit, `-` for a rest, written as
 * `k=x---x---x---x---`. Four of those are the whole beat, and they stay
 * readable and editable in the song text, which a JSON array would not be.
 */
const LANE_KEYS: Record<GridLane, string> = { kick: "k", snare: "s", hihat: "h", clap: "c" };

function encodeLane(lane: number[]): string {
  return lane.map((v) => (v ? "x" : "-")).join("");
}

function decodeLane(text: string): number[] {
  const lane = Array(STEPS_PER_BAR).fill(0);
  for (let i = 0; i < Math.min(STEPS_PER_BAR, text.length); i++) {
    lane[i] = text[i] === "x" || text[i] === "X" || text[i] === "1" ? 1 : 0;
  }
  return lane;
}

const LANE_FIELD_RE = /^([kshc])\s*=\s*([-x1 0]{1,16})$/i;

/** The `Drums: …` line as written into the song text. */
export function formatDrumSettings(s: DrumSettings): string {
  const parts = [s.pattern, `${s.kick} kick`, `${s.snare} snare`];
  // Only worth naming when it isn't the shimmer the layer has always played.
  if (s.shimmer !== DEFAULT_DRUM_SETTINGS.shimmer) parts.push(s.shimmer);
  parts.push(`${Math.round(s.volume * 100)}%`);
  // An edited beat writes its steps out; a library pattern is fully described
  // by its name, and spelling its steps out would just be noise that goes stale
  // the moment the library pattern is revised.
  if (s.steps) {
    for (const lane of GRID_LANES) parts.push(`${LANE_KEYS[lane]}=${encodeLane(s.steps[lane])}`);
  }
  return `Drums: ${parts.join(", ")}`;
}

/**
 * Reads a `Drums: …` line, in whatever order the fields were typed. Returns
 * null when the line isn't there at all — which is different from a line that's
 * present but garbled, where the defaults stand in for the unreadable parts.
 */
export function parseDrumSettingsLine(line: string): DrumSettings | null {
  const m = line.match(DRUMS_LINE_RE);
  if (!m) return null;

  const fields = m[1].split(",").map((f) => f.trim()).filter(Boolean);
  const settings = { ...DEFAULT_DRUM_SETTINGS };

  for (const field of fields) {
    const lower = field.toLowerCase();
    const pattern = DRUM_PATTERNS.find((p) => p.name.toLowerCase() === lower);
    const accent = accentNameFrom(field);
    const lane = field.match(LANE_FIELD_RE);
    if (lane) {
      // A lane field means the beat was written rather than picked, so the
      // grid is built up field by field from whichever lanes are present.
      const key = lane[1].toLowerCase();
      const laneName = GRID_LANES.find((n) => LANE_KEYS[n] === key)!;
      settings.steps = { ...(settings.steps ?? emptyGrid()), [laneName]: decodeLane(lane[2].replace(/\s/g, "")) };
    } else if (lower === CUSTOM_PATTERN.toLowerCase()) {
      settings.pattern = CUSTOM_PATTERN;
    } else if (pattern) {
      settings.pattern = pattern.name;
    } else if (accent) {
      settings.shimmer = accent;
    } else if (/\bfolk\b/.test(lower) && /kick/.test(lower)) {
      settings.kick = "folk";
    } else if (/\b808\b/.test(lower)) {
      settings.kick = "808";
    } else if (/\bbrush(ed)?\b/.test(lower)) {
      settings.snare = "brush";
    } else if (/\b(regular|snare)\b/.test(lower)) {
      settings.snare = "regular";
    } else {
      const pct = lower.match(/^(\d{1,3})\s*%$/);
      if (pct) settings.volume = Math.min(1, Math.max(0, parseInt(pct[1], 10) / 100));
    }
  }

  return settings;
}

/** Strips the `Drums: …` line's text so it never shows up as a performance note. */
export function stripDrumSettings(line: string): string {
  return line.replace(DRUMS_LINE_RE, "").trim();
}

export function hasDrumSettingsLine(line: string): boolean {
  return DRUMS_LINE_RE.test(line);
}

// ── Synthesis ────────────────────────────────────────────────────────────────

/** Roland TR-808 kick for pop/indie: punchy sine with fast pitch drop, ~650ms decay */
function playKick808(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = "sine";

  // Fast pitch sweep — gives the Roland "thump" punch character
  // 100 Hz -> 55 Hz in 30ms (the attack punch), then settles at 30 Hz
  osc.frequency.setValueAtTime(100, when);
  osc.frequency.exponentialRampToValueAtTime(55, when + 0.03);
  osc.frequency.exponentialRampToValueAtTime(30, when + 0.35);

  // Instant attack, ~650ms decay — pop kick, not a sustained bass note
  g.gain.setValueAtTime(1.0, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.65);

  // Light waveshaper for body warmth without harshness
  const ws = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = Math.tanh(2 * x) / Math.tanh(2);
  }
  ws.curve = curve;
  ws.oversample = "2x";

  osc.connect(g);
  g.connect(ws);
  ws.connect(dst);
  osc.start(when);
  osc.stop(when + 0.7);
}

function playKick(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  // Warm sine body with pitch drop — indie folk thump
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, when);
  osc.frequency.exponentialRampToValueAtTime(42, when + 0.075);
  g.gain.setValueAtTime(0.9, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.45);
  osc.connect(g);
  g.connect(dst);
  osc.start(when);
  osc.stop(when + 0.46);

  // Short noise transient click for attack definition
  const len = Math.ceil(ctx.sampleRate * 0.015);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * ((len - i) / len) ** 2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.45, when);
  src.connect(cg);
  cg.connect(dst);
  src.start(when);
}

function playSnare(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  // Bandpass noise for brush/snare body
  const len = Math.ceil(ctx.sampleRate * 0.22);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.55, when);
  ng.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
  noiseSrc.connect(bp);
  bp.connect(ng);
  ng.connect(dst);
  noiseSrc.start(when);
  noiseSrc.stop(when + 0.22);

  // Tone body for snare crack
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.frequency.setValueAtTime(200, when);
  osc.frequency.exponentialRampToValueAtTime(70, when + 0.06);
  og.gain.setValueAtTime(0.28, when);
  og.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
  osc.connect(og);
  og.connect(dst);
  osc.start(when);
  osc.stop(when + 0.09);
}

/**
 * Pink noise — 1/f rolloff via Paul Kellet's economy filter. Flat white noise
 * reads as hiss or, gated hard enough, as a snap; brushed nylon on a coated
 * head has most of its energy low and a gentle slope above it.
 *
 * One buffer per context, since a sweep needs far more noise than a single
 * stroke consumes and regenerating it per hit is wasted work.
 */
const pinkNoiseByContext = new WeakMap<BaseAudioContext, AudioBuffer>();

function pinkNoise(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

function getPinkNoise(ctx: BaseAudioContext): AudioBuffer {
  let buf = pinkNoiseByContext.get(ctx);
  if (!buf) {
    buf = pinkNoise(ctx);
    pinkNoiseByContext.set(ctx, buf);
  }
  return buf;
}

/**
 * Brushed snare — a sweep across the head, not a stroke onto it.
 *
 * The character is entirely in the envelope: any fast attack, however quiet,
 * reads as a slap or a snap. So there is no transient here at all. The gain
 * swells in over 60ms and the band sweeps upward across the stroke, which is
 * the brush travelling over the coating.
 */
const BRUSH_ATTACK = 0.06;
const BRUSH_DECAY  = 0.44;

function playSnareBrush(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  const buf = getPinkNoise(ctx);

  // Brushes speak before the beat: start the swell early so its peak lands on
  // the beat instead of dragging 60ms behind it. Clamped in case we're
  // scheduling something already due.
  const start = Math.max(ctx.currentTime, when - BRUSH_ATTACK);
  const peak  = start + BRUSH_ATTACK;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Below this is drum body rather than brush, and it muddies the sweep.
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1100;

  // Wide and shallow — a resonant peak whistles instead of whispering.
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.5;
  bp.frequency.setValueAtTime(2000, start);
  bp.frequency.linearRampToValueAtTime(4300, peak + 0.22);

  // Shaves the top fizz that would otherwise read as tape hiss.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7500;

  // Pink noise carries far less energy than white, and the three filters take
  // more still, so this sits well above 1 to land at a peak just under the old
  // brush — quieter than a stick, but present.
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(1.1, peak);
  g.gain.exponentialRampToValueAtTime(0.001, peak + BRUSH_DECAY);

  src.connect(hp);
  hp.connect(bp);
  bp.connect(lp);
  lp.connect(g);
  g.connect(dst);
  // A random window keeps consecutive strokes from sounding stamped out of the
  // same sample. The buffer is long enough that a stroke never runs off the end.
  src.start(start, Math.random() * (buf.duration - 1));
  src.stop(peak + BRUSH_DECAY + 0.05);

  // A whisper of head resonance so the sweep sits on a drum rather than in
  // open air. Same soft envelope — an instant attack here is what snapped.
  const body = ctx.createBufferSource();
  body.buffer = buf;

  const bodyBp = ctx.createBiquadFilter();
  bodyBp.type = "bandpass";
  bodyBp.frequency.value = 420;
  bodyBp.Q.value = 0.9;

  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0, start);
  bg.gain.linearRampToValueAtTime(0.17, peak);
  bg.gain.exponentialRampToValueAtTime(0.001, peak + 0.2);

  body.connect(bodyBp);
  bodyBp.connect(bg);
  bg.connect(dst);
  body.start(start, Math.random() * (buf.duration - 1));
  body.stop(peak + 0.25);
}

function playHihat(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  const len = Math.ceil(ctx.sampleRate * 0.07);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 8000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  src.connect(hp);
  hp.connect(g);
  g.connect(dst);
  src.start(when);
  src.stop(when + 0.07);
}

/** Hand clap — 3 layered noise bursts 9ms apart, bandpassed around 2400 Hz */
function playClap(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  for (let i = 0; i < 3; i++) {
    const t = when + i * 0.009;
    const len = Math.ceil(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let j = 0; j < len; j++) d[j] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.48 - i * 0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.055 - i * 0.006);
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.07);
  }
}

// ── WAV export ────────────────────────────────────────────────────────────────

/** Encode an AudioBuffer as a 16-bit PCM WAV Blob. */
function encodeWav(buffer: AudioBuffer): Blob {
  const numCh  = buffer.numberOfChannels;
  const sr     = buffer.sampleRate;
  const len    = buffer.length;
  const bitsPS = 16;
  const bytesPS = bitsPS / 8;
  const dataLen = len * numCh * bytesPS;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);

  const str = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  str(0,  "RIFF");
  view.setUint32(4,  36 + dataLen, true);
  str(8,  "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);          // subchunk1 size
  view.setUint16(20, 1,  true);          // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * bytesPS, true);
  view.setUint16(32, numCh * bytesPS, true);
  view.setUint16(34, bitsPS, true);
  str(36, "data");
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Render the current drum settings to a WAV Blob using OfflineAudioContext. */
export async function renderDrumToWav(
  bpm: number,
  grid: DrumGrid,
  kickStyle: KickStyle,
  snareStyle: SnareStyle,
  clapsEnabled: boolean,
  shimmerEnabled: boolean,
  shimmerVariation: string,
  volume: number,
  durationSec: number,
): Promise<Blob> {
  const SR = 44100;
  const totalFrames = Math.ceil(SR * durationSec);
  const ctx = new OfflineAudioContext(2, totalFrames, SR);

  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  const stepDur = 15 / bpm; // seconds per 16th note
  const accent = accentByName(shimmerVariation);
  let when = 0;
  let step = 0;

  while (when < durationSec) {
    if (grid.kick[step]) {
      if (kickStyle === "808") playKick808(ctx, master, when);
      else playKick(ctx, master, when);
    }
    if (grid.snare[step]) {
      if (snareStyle === "brush") playSnareBrush(ctx, master, when);
      else playSnare(ctx, master, when);
    }
    if (grid.hihat[step]) playHihat(ctx, master, when);
    if (clapsEnabled && grid.clap[step]) playClap(ctx, master, when);
    if (shimmerEnabled) playAccentStep(ctx, master, when, accent, step, stepDur);

    when += stepDur;
    step = (step + 1) % 16;
  }

  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

// ── Scheduler hook ────────────────────────────────────────────────────────────

const LOOKAHEAD = 0.12;  // seconds ahead to schedule
const TICK_MS   = 22;    // scheduler polling interval

/**
 * `drumsEnabled` is what the kit itself does while the loop runs: turn it off
 * and the claps or the shimmer can carry a section on their own, which is how
 * the arranger plays a claps-only chorus.
 */
export function useDrumScheduler(
  bpm: number,
  grid: DrumGrid,
  running: boolean,
  volume: number,
  kickStyle: KickStyle,
  snareStyle: SnareStyle,
  clapsEnabled: boolean,
  shimmerEnabled: boolean,
  drumsEnabled = true,
  /** Which accent part the shimmer layer plays; see ACCENT_VARIATIONS. */
  shimmerVariation: string = DEFAULT_ACCENT,
): number {
  const ctxRef            = useRef<AudioContext | null>(null);
  const masterRef         = useRef<GainNode | null>(null);
  const nextTimeRef       = useRef(0);
  const stepRef           = useRef(0);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const gridRef           = useRef(grid);
  const bpmRef            = useRef(bpm);
  const volumeRef         = useRef(volume);
  const kickStyleRef      = useRef(kickStyle);
  const snareStyleRef     = useRef(snareStyle);
  const clapsEnabledRef   = useRef(clapsEnabled);
  const shimmerEnabledRef = useRef(shimmerEnabled);
  const drumsEnabledRef   = useRef(drumsEnabled);
  const accentRef         = useRef(accentByName(shimmerVariation));
  const [activeStep, setActiveStep] = useState(-1);

  // Keep refs in sync so the scheduler loop picks up changes without restart
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { kickStyleRef.current = kickStyle; }, [kickStyle]);
  useEffect(() => { snareStyleRef.current = snareStyle; }, [snareStyle]);
  useEffect(() => { clapsEnabledRef.current = clapsEnabled; }, [clapsEnabled]);
  useEffect(() => { shimmerEnabledRef.current = shimmerEnabled; }, [shimmerEnabled]);
  useEffect(() => { drumsEnabledRef.current = drumsEnabled; }, [drumsEnabled]);
  useEffect(() => { accentRef.current = accentByName(shimmerVariation); }, [shimmerVariation]);
  useEffect(() => {
    volumeRef.current = volume;
    if (masterRef.current) masterRef.current.gain.value = volume;
  }, [volume]);

  useEffect(() => {
    if (!running) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      stepRef.current = 0;
      setActiveStep(-1);
      return;
    }

    // Create AudioContext lazily on first play
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      masterRef.current = ctxRef.current.createGain();
      masterRef.current.gain.value = volumeRef.current;
      masterRef.current.connect(ctxRef.current.destination);
    } else if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }

    const ctx = ctxRef.current;
    const dst = masterRef.current!;

    // Start slightly in the future so first note isn't clipped
    nextTimeRef.current = ctx.currentTime + 0.05;
    stepRef.current = 0;

    const tick = () => {
      const stepDur = 15 / bpmRef.current; // 60 / (bpm * 4) seconds per 16th note
      const grid    = gridRef.current;

      while (nextTimeRef.current < ctx.currentTime + LOOKAHEAD) {
        const step = stepRef.current;
        const when = nextTimeRef.current;

        if (drumsEnabledRef.current) {
          if (grid.kick[step]) {
            if (kickStyleRef.current === "808") playKick808(ctx, dst, when);
            else playKick(ctx, dst, when);
          }
          if (grid.snare[step]) {
            if (snareStyleRef.current === "brush") playSnareBrush(ctx, dst, when);
            else playSnare(ctx, dst, when);
          }
          if (grid.hihat[step]) playHihat(ctx, dst, when);
        }
        // Claps follow their own lane. A library pattern's lane is beats 2 and
        // 4, which is where this layer has always put them.
        if (clapsEnabledRef.current && grid.clap[step]) playClap(ctx, dst, when);
        // Shimmer plays whatever accent part the song picked, on that part's
        // own rhythm — a tambourine on the backbeat isn't a shaker turned down.
        if (shimmerEnabledRef.current) {
          playAccentStep(ctx, dst, when, accentRef.current, step, stepDur);
        }

        // Update visual indicator at the right moment
        const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
        setTimeout(() => setActiveStep(step), delayMs);

        stepRef.current = (step + 1) % 16;
        nextTimeRef.current += stepDur;
      }
    };

    tick();
    timerRef.current = setInterval(tick, TICK_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running]);

  // Clean up AudioContext on component unmount
  useEffect(() => {
    return () => {
      ctxRef.current?.close();
    };
  }, []);

  return activeStep;
}
