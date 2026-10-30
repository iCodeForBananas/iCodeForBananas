/**
 * The kit as a file.
 *
 * Everything the song plays under itself, rendered offline and handed over as a
 * WAV: a minute of the beat to load into something else, or to practise over
 * with the browser shut.
 *
 * It is a render of the kit, not a recording of the page. The same voices at the
 * same levels are written onto an OfflineAudioContext, so the file is what the
 * designer's play button gives you and it arrives faster than real time.
 * Nothing about the song's own structure is in here — no cues, no sections, no
 * transitions — because a bed is a loop, and the arranger is what turns a loop
 * into an arrangement.
 */
import { drumTail, encodeWav, scheduleDrums } from "./DrumMachine";
import { droneRelease, resolveDroneKey, scheduleDrone } from "./Drone";
import { hasLayer, type KitSettings } from "./kit";

/** How much of the kit one download hands over. */
export const KIT_RENDER_SECONDS = 60;

/** CD rate. High enough that the hats aren't the giveaway, cheap enough to render. */
const SAMPLE_RATE = 44100;

const CHANNELS = 2;

/**
 * How much of the beat goes into one pass.
 *
 * A hit leaves its nodes behind in the graph: an 808 kick is four nodes that go
 * on being mixed for every quantum after the one they stopped sounding in, so a
 * graph holding a minute of hits spends most of the render adding up silence and
 * the cost climbs with the square of the length. A minute in one pass takes
 * minutes; a minute in short passes takes seconds, because no graph ever holds
 * more than a pass worth of hits.
 *
 * Short, but not shorter than the ring-out it has to carry: a pass renders its
 * own length plus a tail and keeps only its own length, so passes below that are
 * mostly tail and the work goes back up. At the tempos anyone plays at this is
 * a second or two.
 *
 * Each pass also hands the thread back, which is the difference between a
 * moment's wait and a locked-up tab.
 */
const passSeconds = (tail: number): number => Math.max(1, tail);

/**
 * A little air before each pass, because the brush snare speaks before its beat
 * — it swells in over the 60ms leading up to the step it lands on. Without the
 * room to start early it would be clamped to the top of the pass and land late.
 */
const PASS_LEAD_IN = 0.15;

// ── Length ────────────────────────────────────────────────────────────────────

/**
 * How long the file runs past the end of the loop.
 *
 * The loop stops at the sixty-second mark and the file does not: an 808 landing
 * on the last step takes most of a second to fall away and an ethereal drone two
 * and a half to let go, and cutting the file there would put a click where the
 * tail should be. Only switched-on layers count, so a stomp-and-clap kit gets a
 * short tail rather than the longest one any kit could need.
 */
export function kitRenderTail(kit: KitSettings, bpm: number): number {
  const percussive = hasLayer(kit, "drum") || hasLayer(kit, "claps") || hasLayer(kit, "shimmer");
  return Math.max(
    percussive ? drumTail(bpm) : 0,
    hasLayer(kit, "drone") ? droneRelease(kit.drone.style) : 0,
  );
}

// ── Naming ────────────────────────────────────────────────────────────────────

/** What a filename can't carry, dropped; what it can, squeezed to single spaces. */
function filenameSafe(text: string): string {
  return text.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * What the download is called: the song, the kit and the tempo.
 *
 * The tempo is in the name because the file has no other way of saying it, and a
 * bed at the wrong tempo is useless — anything this lands in will want to be
 * told. An edited preset keeps the preset's name; "Trap 808, edited" is a thing
 * to read on screen, not a thing to file under.
 */
export function kitWavFileName(
  songTitle: string | null | undefined,
  kit: KitSettings,
  bpm: number,
): string {
  const parts = [filenameSafe(songTitle ?? ""), filenameSafe(kit.preset ?? "") || "Kit"];
  return `${parts.filter(Boolean).join(" - ")} ${Math.round(bpm)}bpm.wav`;
}

// ── Render ────────────────────────────────────────────────────────────────────

export interface KitRenderOptions {
  kit: KitSettings;
  bpm: number;
  /** The song's key and transposition, for a drone that follows them. */
  songKey?: string | null;
  transpose?: number;
  /** Seconds of loop; the file runs `kitRenderTail` longer than this. */
  seconds?: number;
}

/** One pass's worth of audio, added into the mix at the point it belongs. */
function mixInto(mix: Float32Array[], pass: AudioBuffer, atFrame: number): void {
  for (let ch = 0; ch < mix.length; ch++) {
    const from = pass.getChannelData(Math.min(ch, pass.numberOfChannels - 1));
    const to = mix[ch];
    // A pass can begin before the file does, and the last one runs off the end
    // of it; both overhangs are simply not written.
    const first = Math.max(0, -atFrame);
    const until = Math.min(from.length, to.length - atFrame);
    for (let i = first; i < until; i++) to[atFrame + i] += from[i];
  }
}

/**
 * The drums, claps and percussion, a few seconds of beat at a time.
 *
 * Every hit is rendered exactly once and added in wherever it falls, tail
 * included — so a kick that rings across the end of one pass rings into the
 * next, and the seams aren't audible because there are none. What comes back is
 * the mix a single pass would have produced, in a fraction of the time.
 */
async function mixDrums(
  mix: Float32Array[],
  kit: KitSettings,
  bpm: number,
  seconds: number,
  tail: number,
): Promise<void> {
  const layers = {
    drums: hasLayer(kit, "drum"),
    claps: hasLayer(kit, "claps"),
    shimmer: hasLayer(kit, "shimmer"),
  };
  if (!layers.drums && !layers.claps && !layers.shimmer) return;

  const pass = passSeconds(tail);
  const passFrames = Math.ceil((PASS_LEAD_IN + pass + tail) * SAMPLE_RATE);

  for (let from = 0; from < seconds; from += pass) {
    const origin = from - PASS_LEAD_IN;
    const ctx = new OfflineAudioContext(CHANNELS, passFrames, SAMPLE_RATE);
    const bus = ctx.createGain();
    bus.gain.value = kit.drums.volume;
    bus.connect(ctx.destination);
    scheduleDrums(ctx, bus, kit.drums, layers, bpm, {
      origin,
      from,
      to: Math.min(from + pass, seconds),
    });
    mixInto(mix, await ctx.startRendering(), Math.round(origin * SAMPLE_RATE));
  }
}

/**
 * The drone, in one pass.
 *
 * It holds one chord for the whole minute on a graph that never grows, so there
 * is nothing to gain by cutting it up — and everything to lose, since its
 * oscillators would have to pick up mid-cycle at every seam.
 */
async function mixDrone(
  mix: Float32Array[],
  kit: KitSettings,
  songKey: string | null | undefined,
  transpose: number,
  seconds: number,
  tail: number,
): Promise<void> {
  if (!hasLayer(kit, "drone")) return;
  const ctx = new OfflineAudioContext(
    CHANNELS,
    Math.ceil((seconds + tail) * SAMPLE_RATE),
    SAMPLE_RATE,
  );
  scheduleDrone(
    ctx,
    ctx.destination,
    resolveDroneKey(kit.drone, songKey, transpose),
    kit.drone.style,
    kit.drone.volume,
    0,
    seconds,
  );
  mixInto(mix, await ctx.startRendering(), 0);
}

/**
 * What the file is allowed to peak at.
 *
 * A loud preset asks for more than full scale on the beats where everything
 * lands at once. Live that is the output's problem and you hear whatever it
 * does; in a file it would be squared-off tops, permanently. So a mix that went
 * over comes down by however much it went over: nothing at all on most kits, a
 * couple of decibels on a loud preset, more on a full kit with the drone sitting
 * under it. Never up, though — a render is meant to sound like what was playing,
 * not like a master of it.
 */
const CEILING = 0.99;

function trimToCeiling(mix: Float32Array[]): void {
  let peak = 0;
  for (const channel of mix) {
    for (let i = 0; i < channel.length; i++) {
      const level = Math.abs(channel[i]);
      if (level > peak) peak = level;
    }
  }
  if (peak <= CEILING) return;

  const trim = CEILING / peak;
  for (const channel of mix) {
    for (let i = 0; i < channel.length; i++) channel[i] *= trim;
  }
}

/**
 * The kit, rendered to a WAV.
 *
 * Layer for layer this is the live player's graph: the percussive layers share
 * the kit's bus at the kit's level, the drone goes straight out at its own, and
 * a layer that is switched off is never built. A silent kit renders silence,
 * which is why nothing offers this until something is switched on.
 */
export async function renderKitToWav({
  kit,
  bpm,
  songKey,
  transpose = 0,
  seconds = KIT_RENDER_SECONDS,
}: KitRenderOptions): Promise<Blob> {
  const tail = kitRenderTail(kit, bpm);
  const frames = Math.ceil((seconds + tail) * SAMPLE_RATE);
  const mix = Array.from({ length: CHANNELS }, () => new Float32Array(frames));

  await mixDrums(mix, kit, bpm, seconds, tail);
  await mixDrone(mix, kit, songKey, transpose, seconds, tail);
  trimToCeiling(mix);

  return encodeWav(mix, SAMPLE_RATE);
}
