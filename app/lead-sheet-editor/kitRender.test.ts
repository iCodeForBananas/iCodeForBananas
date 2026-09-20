import { describe, expect, it } from "vitest";
import { DEFAULT_KIT, applyPreset, presetByName, type KitSettings } from "./kit";
import { KIT_RENDER_SECONDS, kitRenderTail, kitWavFileName } from "./kitRender";

const kitWith = (over: Partial<KitSettings>): KitSettings => ({ ...DEFAULT_KIT, ...over });

/** One bar of sixteenths, which is how long the longest percussion part runs. */
const bar = (bpm: number) => (16 * 15) / bpm;

describe("how long the render runs past the loop", () => {
  it("leaves nothing hanging when nothing is switched on", () => {
    expect(kitRenderTail(DEFAULT_KIT, 120)).toBe(0);
  });

  it("leaves room for a hit that lands on the last step", () => {
    expect(kitRenderTail(kitWith({ layers: ["drum"] }), 120)).toBeGreaterThan(0.7);
  });

  it("counts a layer that sounds on its own, with the kit switched off", () => {
    expect(kitRenderTail(kitWith({ layers: ["shimmer"] }), 120)).toBeGreaterThan(0);
    expect(kitRenderTail(kitWith({ layers: ["claps"] }), 120)).toBeGreaterThan(0);
  });

  it("holds the door open for a percussion part that runs the whole bar", () => {
    // The riser sweeps a bar, so at a slow tempo the ring-out is the bar.
    const kit = kitWith({ layers: ["shimmer"] });
    expect(kitRenderTail(kit, 60)).toBeCloseTo(bar(60), 5);
    // Quick enough, and a bar is shorter than the kit's own decay.
    expect(kitRenderTail(kit, 200)).toBeGreaterThan(bar(200));
  });

  it("waits for whichever layer takes longest to let go", () => {
    const slow = kitWith({
      layers: ["drum", "drone"],
      drone: { ...DEFAULT_KIT.drone, style: "ethereal" },
    });
    const quick = kitWith({
      layers: ["drum", "drone"],
      drone: { ...DEFAULT_KIT.drone, style: "organ" },
    });
    // The organ stops the instant it is asked, so the drums are what decides.
    expect(kitRenderTail(slow, 200)).toBeGreaterThan(kitRenderTail(quick, 200));
    expect(kitRenderTail(quick, 200)).toBe(kitRenderTail(kitWith({ layers: ["drum"] }), 200));
  });

  it("stays a tail rather than becoming another chorus", () => {
    for (const style of ["warm", "bright", "ethereal", "lush", "organ"] as const) {
      const kit = kitWith({ layers: ["drum", "drone"], drone: { ...DEFAULT_KIT.drone, style } });
      expect(kitRenderTail(kit, 120)).toBeLessThan(KIT_RENDER_SECONDS / 10);
    }
  });
});

describe("what the download is called", () => {
  const trap = applyPreset(presetByName("Trap 808")!);

  it("names the song, the kit and the tempo", () => {
    expect(kitWavFileName("Wildfire", trap, 140)).toBe("Wildfire - Trap 808 140bpm.wav");
  });

  it("drops what a filename cannot carry", () => {
    expect(kitWavFileName("Who?! / Me:  Again", trap, 90)).toBe(
      "Who Me Again - Trap 808 90bpm.wav",
    );
  });

  it("still names something when the song has no title", () => {
    expect(kitWavFileName(null, trap, 140)).toBe("Trap 808 140bpm.wav");
    expect(kitWavFileName("   ", trap, 140)).toBe("Trap 808 140bpm.wav");
  });

  it("files an edited preset under the preset", () => {
    const edited: KitSettings = { ...trap, drums: { ...trap.drums, kick: "folk" } };
    expect(kitWavFileName("Wildfire", edited, 140)).toBe("Wildfire - Trap 808 140bpm.wav");
  });

  it("calls a kit with no preset behind it a kit", () => {
    expect(kitWavFileName("Wildfire", kitWith({ layers: ["drum"] }), 118)).toBe(
      "Wildfire - Kit 118bpm.wav",
    );
  });

  it("writes a whole number of bpm, whatever it was given", () => {
    expect(kitWavFileName(null, trap, 119.6)).toBe("Trap 808 120bpm.wav");
  });
});
