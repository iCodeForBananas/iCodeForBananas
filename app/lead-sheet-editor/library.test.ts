import { describe, expect, it } from "vitest";
import { hasOverrides, matchesQuery, searchLibrary, setlistTempo, setlistView } from "./library";

const SONGS = [
  { id: "1", title: "Empty Road", artist: "The Wanderers", key: "G" },
  { id: "2", title: "Help", artist: "The Beatles", key: "A" },
  { id: "3", title: "Twinkle Twinkle", artist: null, key: "C" },
];

describe("searchLibrary", () => {
  it("finds by title and by artist", () => {
    expect(searchLibrary(SONGS, "road").map((s) => s.id)).toEqual(["1"]);
    expect(searchLibrary(SONGS, "beatles").map((s) => s.id)).toEqual(["2"]);
  });

  it("does not care about order or case", () => {
    expect(searchLibrary(SONGS, "road empty").map((s) => s.id)).toEqual(["1"]);
    expect(searchLibrary(SONGS, "BEATLES help").map((s) => s.id)).toEqual(["2"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchLibrary(SONGS, "")).toHaveLength(3);
    expect(searchLibrary(SONGS, "   ")).toHaveLength(3);
  });

  it("copes with a song that has no artist", () => {
    expect(matchesQuery(SONGS[2], "twinkle")).toBe(true);
    expect(matchesQuery(SONGS[2], "beatles")).toBe(false);
  });

  it("does not match across the gap between title and artist", () => {
    // "Road The" would otherwise match by running the two fields together.
    expect(searchLibrary(SONGS, "roadthe")).toEqual([]);
  });
});

describe("setlistView", () => {
  it("is nothing at all when the set asks for nothing", () => {
    expect(setlistView(null)).toEqual({ transpose: 0, capo: 0 });
    expect(setlistView({})).toEqual({ transpose: 0, capo: 0 });
    expect(hasOverrides({})).toBe(false);
  });

  it("carries the set's own key and capo", () => {
    expect(setlistView({ transpose_override: -2, capo_override: 3 })).toEqual({
      transpose: -2,
      capo: 3,
    });
    expect(hasOverrides({ transpose_override: -2 })).toBe(true);
  });

  it("prefers the set's tempo but falls back to the song's", () => {
    expect(setlistTempo({ tempo_override: 90 }, 120)).toBe(90);
    expect(setlistTempo({}, 120)).toBe(120);
    expect(setlistTempo(null, null)).toBeNull();
  });

  it("is a reading, so it cannot reach the song", () => {
    // The only thing an override produces is a View. There is no path from
    // here to the stored song, which is the point.
    const entry = { transpose_override: 5, capo_override: 2 };
    const before = { ...entry };
    setlistView(entry);
    setlistTempo(entry, 100);
    expect(entry).toEqual(before);
  });
});
