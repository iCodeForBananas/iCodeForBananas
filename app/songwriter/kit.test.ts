import { describe, expect, it } from "vitest";
import {
  CUSTOM_PATTERN,
  DEFAULT_DRUM_SETTINGS,
  DRUM_PATTERNS,
  GRID_LANES,
  STEPS_PER_BAR,
  effectiveGrid,
  emptyGrid,
  formatDrumSettings,
  gridFromPattern,
  gridsEqual,
  normalizeDrumSettings,
  parseDrumSettingsLine,
  type DrumSettings,
} from "./DrumMachine";
import {
  DEFAULT_DRONE_SETTINGS,
  SONG_KEY,
  droneKeyLabel,
  normalizeDroneSettings,
  resolveDroneKey,
} from "./Drone";
import {
  DEFAULT_KIT,
  KIT_LAYERS,
  KIT_PRESETS,
  applyPreset,
  kitFromMetadata,
  kitIsSilent,
  kitPresetProblems,
  kitToMetadata,
  matchesPreset,
  presetByName,
  toggleLayer,
  type KitSettings,
} from "./kit";

/** A beat nobody would arrive at by picking a library pattern. */
const WRITTEN = (() => {
  const grid = emptyGrid();
  grid.kick = [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,1,0,0];
  grid.snare = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1];
  grid.hihat = [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,0];
  grid.clap = [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
  return grid;
})();

describe("drum grid", () => {
  it("plays the library pattern when nothing has been edited", () => {
    const settings: DrumSettings = { ...DEFAULT_DRUM_SETTINGS, pattern: "Boom Bap" };
    const played = effectiveGrid(settings);
    const library = DRUM_PATTERNS.find((p) => p.name === "Boom Bap")!;
    expect(played.kick).toEqual(library.kick);
    expect(played.snare).toEqual(library.snare);
    expect(played.hihat).toEqual(library.hihat);
  });

  it("puts a library pattern's claps on beats 2 and 4, where the layer always had them", () => {
    const clap = gridFromPattern("Folk Stomp").clap;
    expect(clap.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([4, 12]);
  });

  it("plays the edited steps over the pattern they came from", () => {
    const settings: DrumSettings = { ...DEFAULT_DRUM_SETTINGS, pattern: "Boom Bap", steps: WRITTEN };
    expect(gridsEqual(effectiveGrid(settings), WRITTEN)).toBe(true);
  });

  it("round-trips a written beat through the song text", () => {
    const settings: DrumSettings = {
      ...DEFAULT_DRUM_SETTINGS,
      pattern: CUSTOM_PATTERN,
      steps: WRITTEN,
      kick: "808",
      snare: "brush",
      volume: 0.65,
    };
    const parsed = parseDrumSettingsLine(formatDrumSettings(settings));
    expect(parsed).not.toBeNull();
    expect(parsed!.pattern).toBe(CUSTOM_PATTERN);
    expect(parsed!.kick).toBe("808");
    expect(parsed!.snare).toBe("brush");
    expect(parsed!.volume).toBeCloseTo(0.65, 2);
    expect(gridsEqual(parsed!.steps!, WRITTEN)).toBe(true);
  });

  it("leaves a picked pattern's steps out of the text, so revising the library still reaches it", () => {
    const line = formatDrumSettings({ ...DEFAULT_DRUM_SETTINGS, pattern: "Boom Bap" });
    expect(line).not.toMatch(/[ksh]=/);
    expect(parseDrumSettingsLine(line)!.steps).toBeNull();
  });

  it("reads a song written before the grid existed", () => {
    const before = { pattern: "Boom Bap", kick: "808", snare: "brush", shimmer: "Air Sparkle", volume: 0.5 };
    const settings = normalizeDrumSettings(before);
    expect(settings.steps).toBeNull();
    expect(settings.pattern).toBe("Boom Bap");
    expect(gridsEqual(effectiveGrid(settings), gridFromPattern("Boom Bap"))).toBe(true);
  });

  it("keeps a stored grid to sixteen 0/1 steps a lane, whatever was stored", () => {
    const settings = normalizeDrumSettings({
      pattern: "Boom Bap",
      steps: { kick: [1, "yes", 0, null, 3], snare: "nonsense", hihat: new Array(40).fill(1) },
    });
    expect(settings.steps).not.toBeNull();
    for (const lane of GRID_LANES) {
      expect(settings.steps![lane]).toHaveLength(STEPS_PER_BAR);
      expect(settings.steps![lane].every((v) => v === 0 || v === 1)).toBe(true);
    }
    expect(settings.steps!.kick.slice(0, 5)).toEqual([1, 1, 0, 0, 1]);
    expect(settings.steps!.hihat.every((v) => v === 1)).toBe(true);
  });
});

describe("kit presets", () => {
  it("every preset names a pattern, an accent and levels that exist", () => {
    expect(kitPresetProblems()).toEqual([]);
  });

  it("applying one sets the whole kit", () => {
    const trap = presetByName("Trap 808")!;
    const kit = applyPreset(trap);

    expect(kit.preset).toBe("Trap 808");
    expect(kit.drums.pattern).toBe(trap.pattern);
    expect(kit.drums.kick).toBe("808");
    expect(kit.drums.shimmer).toBe(trap.shimmer);
    expect(kit.drums.volume).toBe(trap.drumVolume);
    expect(kit.layers).toEqual(trap.layers);
  });

  it("only ever switches on layers the kit still has", () => {
    for (const preset of KIT_PRESETS) {
      for (const layer of preset.layers) expect(KIT_LAYERS).toContain(layer);
    }
  });

  it("drops an edited beat when a preset is applied, so the name and the sound agree", () => {
    expect(applyPreset(presetByName("Disco")!).drums.steps).toBeNull();
  });

  it("knows when a kit still matches the preset it names", () => {
    const kit = applyPreset(presetByName("Boom Bap")!);
    expect(matchesPreset(kit)).toBe(true);

    const nudged = { ...kit, drums: { ...kit.drums, volume: 0.42 } };
    expect(matchesPreset(nudged)).toBe(false);

    const restepped = { ...kit, drums: { ...kit.drums, steps: WRITTEN } };
    expect(matchesPreset(restepped)).toBe(false);

    const relayered: KitSettings = { ...kit, layers: [...kit.layers, "shimmer"] };
    expect(matchesPreset(relayered)).toBe(false);
  });
});

describe("the drone", () => {
  it("reads nothing at all as the default", () => {
    expect(normalizeDroneSettings(undefined)).toEqual(DEFAULT_DRONE_SETTINGS);
    expect(normalizeDroneSettings("lush")).toEqual(DEFAULT_DRONE_SETTINGS);
  });

  it("falls back to the song's key rather than holding one nobody picked", () => {
    expect(normalizeDroneSettings({ key: "H#" }).key).toBe(SONG_KEY);
    expect(normalizeDroneSettings({ key: "Bbm" }).key).toBe("Bbm");
  });

  it("clamps a level and rejects a style it does not have", () => {
    expect(normalizeDroneSettings({ volume: 4 }).volume).toBe(1);
    expect(normalizeDroneSettings({ volume: -1 }).volume).toBe(0);
    expect(normalizeDroneSettings({ style: "trombone" }).style).toBe(DEFAULT_DRONE_SETTINGS.style);
  });

  it("follows the song's key, and its transposition with it", () => {
    const settings = { ...DEFAULT_DRONE_SETTINGS, key: SONG_KEY };
    expect(droneKeyLabel(resolveDroneKey(settings, "D"))).toBe("D");
    expect(droneKeyLabel(resolveDroneKey(settings, "D", 2))).toBe("E");
    expect(droneKeyLabel(resolveDroneKey(settings, "Bm", -1))).toBe("Bbm");
    // Past the top of the octave and back round, rather than off the end.
    expect(droneKeyLabel(resolveDroneKey(settings, "B", 1))).toBe("C");
  });

  it("holds a picked key exactly as picked, whatever the song does", () => {
    const settings = { ...DEFAULT_DRONE_SETTINGS, key: "F#m" };
    expect(droneKeyLabel(resolveDroneKey(settings, "C"))).toBe("F#m");
    expect(droneKeyLabel(resolveDroneKey(settings, "C", 5))).toBe("F#m");
  });

  it("drones on G for a song that never said what key it is in", () => {
    expect(droneKeyLabel(resolveDroneKey(DEFAULT_DRONE_SETTINGS, null))).toBe("G");
    expect(droneKeyLabel(resolveDroneKey(DEFAULT_DRONE_SETTINGS, "not a key"))).toBe("G");
  });

  it("keeps the key across a preset, and takes the preset's voice", () => {
    const before = { ...DEFAULT_KIT, drone: { key: "Eb", style: "organ" as const, volume: 0.1 } };
    const preset = presetByName("Quiet Storm")!;
    const after = applyPreset(preset, before);
    expect(after.drone.key).toBe("Eb");
    expect(after.drone.style).toBe(preset.droneStyle);
    expect(after.drone.volume).toBe(preset.droneVolume);
  });

  it("notices a changed drone voice, but never a changed key", () => {
    const preset = presetByName("Campfire")!;
    const kit = applyPreset(preset);
    expect(matchesPreset(kit)).toBe(true);
    expect(matchesPreset({ ...kit, drone: { ...kit.drone, key: "Am" } })).toBe(true);
    expect(matchesPreset({ ...kit, drone: { ...kit.drone, style: "bright" } })).toBe(false);
    expect(matchesPreset({ ...kit, drone: { ...kit.drone, volume: 0.01 } })).toBe(false);
  });
});

describe("kit storage", () => {
  it("round-trips through the metadata keys the song already used", () => {
    const kit = applyPreset(presetByName("Neo Soul")!);
    const restored = kitFromMetadata(kitToMetadata(kit));
    expect(restored).toEqual(kit);
  });

  it("opens a sheet that predates the kit with its old sound and nothing playing", () => {
    const kit = kitFromMetadata({
      drums: { pattern: "Disco Floor", kick: "808", snare: "brush", volume: 0.6 },
    });
    expect(kit.preset).toBeNull();
    expect(kit.layers).toEqual([]);
    expect(kit.drums.pattern).toBe("Disco Floor");
    expect(kit.drums.kick).toBe("808");
    expect(kitIsSilent(kit)).toBe(true);
  });

  it("takes the drone from the pad a sheet may still be carrying", () => {
    const stored = {
      drums: { pattern: "Boom Bap" },
      subBass: { notes: "E D C B", tone: "round", octave: 2 },
      strings: { mode: "drone", style: "lush", volume: 0.4 },
      kit: { layers: ["drum", "sub", "strings"] },
    };
    const kit = kitFromMetadata(stored);
    expect(kit.layers).toEqual(["drum"]);
    // The pad's style and level meant the same thing the drone's do.
    expect(kit.drone.style).toBe("lush");
    expect(kit.drone.volume).toBe(0.4);
    // `mode` named an arpeggio the drone does not play, so it does not survive.
    expect(kit.drone).not.toHaveProperty("mode");
    // Writing it back names only the keys the kit owns, so the row keeps the
    // sub bass it had rather than having it cleared out from under it.
    expect(Object.keys(kitToMetadata(kit)).sort()).toEqual(["drone", "drums", "kit"]);
  });

  it("prefers a stored drone over the pad it may have come from", () => {
    const kit = kitFromMetadata({
      drone: { key: "Am", style: "organ", volume: 0.2 },
      strings: { mode: "drone", style: "lush", volume: 0.4 },
    });
    expect(kit.drone).toEqual({ key: "Am", style: "organ", volume: 0.2 });
  });

  it("keeps the layer order the app renders in, whatever order they were stored", () => {
    const kit = kitFromMetadata({ kit: { layers: ["shimmer", "drum", "nonsense"] } });
    expect(kit.layers).toEqual(["drum", "shimmer"]);
  });

  it("adds and removes one layer without disturbing the others", () => {
    let kit: KitSettings = { ...DEFAULT_KIT, layers: ["drum", "shimmer"] };
    kit = toggleLayer(kit, "claps");
    expect(kit.layers).toEqual(["drum", "claps", "shimmer"]);
    kit = toggleLayer(kit, "shimmer");
    expect(kit.layers).toEqual(["drum", "claps"]);
  });
});
