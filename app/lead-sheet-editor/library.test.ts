import { describe, expect, it } from "vitest";
import { matchesQuery, searchLibrary, sortLibrary } from "./library";

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

describe("sortLibrary", () => {
  const LIBRARY = [
    { id: "b", title: "Banana Bread", updated_at: "2026-01-03T00:00:00Z" },
    { id: "a", title: "Apple Tree", updated_at: "2026-01-01T00:00:00Z" },
    { id: "c", title: "Cider", updated_at: "2026-01-02T00:00:00Z", metadata: { favorite: true } },
  ];

  it("sorts by title, ignoring case", () => {
    const sorted = sortLibrary(
      [{ title: "zebra" }, { title: "Apple" }, { title: "banana" }],
      "alphabetical"
    );
    expect(sorted.map((s) => s.title)).toEqual(["Apple", "banana", "zebra"]);
  });

  it("sorts by most recently updated", () => {
    expect(sortLibrary(LIBRARY, "recent").map((s) => s.id)).toEqual(["c", "b", "a"]);
  });

  it("keeps favorites on top in either order", () => {
    expect(sortLibrary(LIBRARY, "alphabetical").map((s) => s.id)).toEqual(["c", "a", "b"]);
    // "c" is neither the first title nor the newest, and leads both times.
    expect(sortLibrary(LIBRARY, "recent")[0].id).toBe("c");
  });

  it("falls back to the title when two songs share a timestamp", () => {
    const same = [
      { title: "Second", updated_at: "2026-01-01T00:00:00Z" },
      { title: "First", updated_at: "2026-01-01T00:00:00Z" },
    ];
    expect(sortLibrary(same, "recent").map((s) => s.title)).toEqual(["First", "Second"]);
  });

  it("puts a song with no usable timestamp last", () => {
    const ragged = [
      { title: "No date" },
      { title: "Dated", updated_at: "2026-01-01T00:00:00Z" },
      { title: "Nonsense", updated_at: "not a date" },
    ];
    expect(sortLibrary(ragged, "recent")[0].title).toBe("Dated");
  });

  it("sorts a copy rather than the array it was given", () => {
    const original = [{ title: "B" }, { title: "A" }];
    const before = [...original];
    sortLibrary(original, "alphabetical");
    expect(original).toEqual(before);
  });

  it("titles an untitled song so it still sorts", () => {
    const sorted = sortLibrary([{ title: null }, { title: "Anthem" }], "alphabetical");
    expect(sorted.map((s) => s.title)).toEqual(["Anthem", null]);
  });
});
