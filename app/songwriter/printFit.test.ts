import { describe, expect, it } from "vitest";
import { choosePrintLayout, PRINT_FALLBACK, type PrintLayout } from "./printFit";

// A fake song whose height is `lines` rows, halved by two columns and scaled by size.
const song = (lines: number) => (l: PrintLayout) => (lines * 20 * (l.scale / 100)) / l.columns;

describe("choosePrintLayout", () => {
  it("keeps a short song in one column at full size", () => {
    expect(choosePrintLayout(song(30), 900)).toEqual({ columns: 1, scale: 100 });
  });

  it("tries one column a little smaller before splitting", () => {
    expect(choosePrintLayout(song(48), 900)).toEqual({ columns: 1, scale: 90 });
  });

  it("goes to two columns, a little smaller, when one doesn't fit", () => {
    expect(choosePrintLayout(song(60), 900)).toEqual({ columns: 2, scale: 90 });
  });

  it("shrinks the text before giving up on one page", () => {
    expect(choosePrintLayout(song(110), 900)).toEqual({ columns: 2, scale: 80 });
  });

  it("falls back to one column over several pages for a very long song", () => {
    expect(choosePrintLayout(song(200), 900)).toEqual(PRINT_FALLBACK);
  });
});
