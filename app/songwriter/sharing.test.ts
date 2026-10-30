import { describe, expect, it } from "vitest";
import { attribution, forkRow, isForkable, isShared, type ForkSource } from "./sharing";

const SOURCE: ForkSource = {
  id: "abc",
  title: "Empty Road",
  artist: "The Wanderers",
  key: "G",
  tempo: 120,
  capo: 2,
  chordpro: "{title: Empty Road}\n\n[G]a",
  metadata: { favorite: true },
  visibility: "public",
  author_name: "Jamie",
};

describe("visibility", () => {
  it("separates being reachable from being offered up", () => {
    expect(isShared("private")).toBe(false);
    expect(isShared("unlisted")).toBe(true);
    expect(isShared("public")).toBe(true);
    // An unlisted song is shared with whoever has the link, which is not the
    // same as inviting the world to copy it.
    expect(isForkable("unlisted")).toBe(false);
    expect(isForkable("public")).toBe(true);
  });
});

describe("forkRow", () => {
  const fork = forkRow(SOURCE, "me");

  it("copies the song itself", () => {
    expect(fork).toMatchObject({
      title: "Empty Road",
      artist: "The Wanderers",
      key: "G",
      tempo: 120,
      capo: 2,
      chordpro: SOURCE.chordpro,
      metadata: { favorite: true },
    });
  });

  it("belongs to whoever made the copy", () => {
    expect(fork.user_id).toBe("me");
  });

  it("starts private however the original was shared", () => {
    // Inheriting "public" would republish someone else's song under a new name
    // without anyone having chosen to.
    expect(fork.visibility).toBe("private");
  });

  it("records where it came from", () => {
    expect(fork.forked_from_id).toBe("abc");
    expect(fork.forked_from_title).toBe("Empty Road");
    expect(fork.forked_from_author).toBe("Jamie");
  });

  it("does not reach back into the original", () => {
    const before = JSON.parse(JSON.stringify(SOURCE));
    forkRow(SOURCE, "someone-else");
    expect(SOURCE).toEqual(before);
  });

  it("credits the version it was taken from, not the root of the chain", () => {
    // A fork of a fork points at what was actually copied, so the chain stays
    // walkable instead of collapsing into one claimed origin.
    const second = forkRow({ ...fork, id: "def", author_name: "Sam" } as ForkSource, "third");
    expect(second.forked_from_id).toBe("def");
    expect(second.forked_from_author).toBe("Sam");
  });

  it("copes with a source that is missing nearly everything", () => {
    const bare = forkRow({ id: "x" }, "me");
    expect(bare.title).toBe("Untitled");
    expect(bare.forked_from_author).toBeNull();
    expect(bare.sections).toEqual([]);
  });
});

describe("attribution", () => {
  it("says nothing about a song that is nobody else's", () => {
    expect(attribution({})).toBeNull();
    expect(attribution({ forked_from_id: null })).toBeNull();
  });

  it("credits the title and the author", () => {
    expect(attribution(forkRow(SOURCE, "me"))).toBe('Based on "Empty Road" by Jamie');
  });

  it("still credits when only part is known", () => {
    expect(attribution({ forked_from_id: "a", forked_from_title: "X" })).toBe('Based on "X"');
    expect(attribution({ forked_from_id: "a", forked_from_author: "Sam" })).toBe("Based on a song by Sam");
    expect(attribution({ forked_from_id: "a" })).toBe("Based on someone else's song");
  });
});
