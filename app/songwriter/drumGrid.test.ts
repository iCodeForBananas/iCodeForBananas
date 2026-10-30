import { describe, expect, it } from "vitest";
import {
  CELL_HIT,
  CELL_OFF,
  CELL_SOFT,
  DEFAULT_DRUM_SETTINGS,
  GRID_LANES,
  emptyGrid,
  formatDrumSettings,
  laneLevel,
  normalizeDrumSettings,
  parseDrumSettingsLine,
} from "./DrumMachine";

describe("drum grid", () => {
  it("reads a song saved before the new tracks as silent in them", () => {
    const old = normalizeDrumSettings({ pattern: DEFAULT_DRUM_SETTINGS.pattern, steps: { kick: [1, 0, 0, 0] } });
    expect(old.steps?.ohat.every((v) => v === CELL_OFF)).toBe(true);
    expect(old.steps?.kick[0]).toBe(CELL_HIT);
  });

  it("keeps soft hits as soft and treats anything else truthy as a hit", () => {
    const lane = [CELL_SOFT, 1, true, 0, "x"] as unknown as number[];
    const s = normalizeDrumSettings({ steps: { ...emptyGrid(), rim: lane } });
    expect(s.steps?.rim.slice(0, 5)).toEqual([CELL_SOFT, CELL_HIT, CELL_HIT, CELL_OFF, CELL_HIT]);
  });

  it("writes and reads every track, soft hits included, through the Drums line", () => {
    const grid = emptyGrid();
    grid.kick[0] = CELL_HIT;
    grid.ohat[2] = CELL_SOFT;
    grid.shaker[15] = CELL_HIT;
    grid.tom[4] = CELL_SOFT;
    const settings = { ...DEFAULT_DRUM_SETTINGS, steps: grid };
    const back = parseDrumSettingsLine(formatDrumSettings(settings));
    expect(back?.steps).toEqual(grid);
  });

  it("defaults swing to zero and every track to full level", () => {
    const s = normalizeDrumSettings(undefined);
    expect(s.swing).toBe(0);
    expect(GRID_LANES.every((lane) => laneLevel(s, lane) === 1)).toBe(true);
  });

  it("clamps swing and levels into range", () => {
    const s = normalizeDrumSettings({ swing: 5, levels: { kick: -1, snare: 0.5 } });
    expect(s.swing).toBeLessThanOrEqual(0.667);
    expect(laneLevel(s, "kick")).toBe(0);
    expect(laneLevel(s, "snare")).toBe(0.5);
  });
});
