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
  DEFAULT_SUB_BASS_SETTINGS,
  TONES,
  formatSubBassSettings,
  normalizeSubBassSettings,
  parseSubBassSettingsLine,
} from "./SubBass";
import {
  DEFAULT_KIT,
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

describe("bass voices", () => {
  it("offers the 808 alongside the three that came before it", () => {
    expect(TONES).toEqual(["sub", "round", "punch", "808"]);
  });

  it("round-trips the 808 through the song text", () => {
    const settings = { ...DEFAULT_SUB_BASS_SETTINGS, tone: "808" as const, notes: "C G A F" };
    const parsed = parseSubBassSettingsLine(formatSubBassSettings(settings));
    expect(parsed!.tone).toBe("808");
    expect(parsed!.notes).toBe("C G A F");
  });

  it("keeps the voice a song already had", () => {
    expect(normalizeSubBassSettings({ tone: "punch" }).tone).toBe("punch");
    expect(normalizeSubBassSettings({ tone: "808" }).tone).toBe("808");
    expect(normalizeSubBassSettings({ tone: "nope" }).tone).toBe(DEFAULT_SUB_BASS_SETTINGS.tone);
  });
});

describe("kit presets", () => {
  it("every preset names a pattern, an accent and levels that exist", () => {
    expect(kitPresetProblems()).toEqual([]);
  });

  it("applying one sets the whole kit and keeps the song's own bass notes", () => {
    const start: KitSettings = {
      ...DEFAULT_KIT,
      bass: { ...DEFAULT_KIT.bass, notes: "C G Am F" },
    };
    const trap = presetByName("Trap 808")!;
    const kit = applyPreset(trap, start);

    expect(kit.preset).toBe("Trap 808");
    expect(kit.drums.pattern).toBe(trap.pattern);
    expect(kit.drums.kick).toBe("808");
    expect(kit.bass.tone).toBe("808");
    expect(kit.layers).toEqual(trap.layers);
    // The walk is the song's, not the preset's.
    expect(kit.bass.notes).toBe("C G Am F");
  });

  it("drops an edited beat when a preset is applied, so the name and the sound agree", () => {
    const edited: KitSettings = {
      ...DEFAULT_KIT,
      drums: { ...DEFAULT_KIT.drums, steps: WRITTEN },
    };
    expect(applyPreset(presetByName("Disco")!, edited).drums.steps).toBeNull();
  });

  it("knows when a kit still matches the preset it names", () => {
    const kit = applyPreset(presetByName("Boom Bap")!, DEFAULT_KIT);
    expect(matchesPreset(kit)).toBe(true);

    const nudged = { ...kit, drums: { ...kit.drums, volume: 0.42 } };
    expect(matchesPreset(nudged)).toBe(false);

    const restepped = { ...kit, drums: { ...kit.drums, steps: WRITTEN } };
    expect(matchesPreset(restepped)).toBe(false);

    const relayered = { ...kit, layers: [...kit.layers, "strings" as const] };
    expect(matchesPreset(relayered)).toBe(false);
  });
});

describe("kit storage", () => {
  it("round-trips through the metadata keys the song already used", () => {
    const kit = applyPreset(presetByName("Neo Soul")!, DEFAULT_KIT);
    const restored = kitFromMetadata(kitToMetadata(kit));
    expect(restored).toEqual(kit);
  });

  it("opens a sheet that predates the kit with its old sound and nothing playing", () => {
    const kit = kitFromMetadata({
      drums: { pattern: "Disco Floor", kick: "808", snare: "brush", volume: 0.6 },
      subBass: { notes: "E D C B", tone: "round", octave: 2 },
    });
    expect(kit.preset).toBeNull();
    expect(kit.layers).toEqual([]);
    expect(kit.drums.pattern).toBe("Disco Floor");
    expect(kit.drums.kick).toBe("808");
    expect(kit.bass.notes).toBe("E D C B");
    expect(kitIsSilent(kit)).toBe(true);
  });

  it("keeps the layer order the app renders in, whatever order they were stored", () => {
    const kit = kitFromMetadata({ kit: { layers: ["strings", "drum", "nonsense", "sub"] } });
    expect(kit.layers).toEqual(["drum", "sub", "strings"]);
  });

  it("adds and removes one layer without disturbing the others", () => {
    let kit: KitSettings = { ...DEFAULT_KIT, layers: ["drum", "sub"] };
    kit = toggleLayer(kit, "strings");
    expect(kit.layers).toEqual(["drum", "sub", "strings"]);
    kit = toggleLayer(kit, "sub");
    expect(kit.layers).toEqual(["drum", "strings"]);
  });
});
