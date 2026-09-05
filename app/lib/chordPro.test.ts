import { describe, expect, it } from "vitest";
import { formatChordPro, formatLine, layoutLine, parseChordPro, parseLine } from "./chordPro";

const SONG = `{title: Empty Road}
{artist: Someone}
{key: G}
{capo: 2}
{tempo: 120}
{time: 4/4}

{start_of_verse: Verse 1}
[G]Driving down an [D]empty road
[Em]Nothing but the [C]radio
{end_of_verse}

{start_of_chorus}
{comment: build here}
[C]Hold on [G]tight
{end_of_chorus}`;

describe("parseLine", () => {
  it("splits a line into runs governed by a chord", () => {
    expect(parseLine("[G]Twinkle [D]star")).toEqual([
      { chord: "G", text: "Twinkle " },
      { chord: "D", text: "star" },
    ]);
  });

  it("handles a lyric before the first chord", () => {
    expect(parseLine("Twinkle [D]star")).toEqual([
      { chord: null, text: "Twinkle " },
      { chord: "D", text: "star" },
    ]);
  });

  it("handles a chord with nothing under it", () => {
    expect(parseLine("[G]")).toEqual([{ chord: "G", text: "" }]);
    expect(parseLine("[G][C]done")).toEqual([
      { chord: "G", text: "" },
      { chord: "C", text: "done" },
    ]);
  });

  it("keeps a line with no chords whole", () => {
    expect(parseLine("just words")).toEqual([{ chord: null, text: "just words" }]);
    expect(parseLine("")).toEqual([]);
  });

  it("round-trips", () => {
    for (const line of ["[G]Twinkle [D]star", "no chords", "[Am7/E]", "a [C]b [D]c", ""]) {
      expect(formatLine(parseLine(line))).toBe(line);
    }
  });
});

describe("parseChordPro", () => {
  const song = parseChordPro(SONG);

  it("reads the metadata directives", () => {
    expect(song.meta).toMatchObject({
      title: "Empty Road",
      artist: "Someone",
      key: "G",
      capo: 2,
      tempo: 120,
      time: "4/4",
    });
  });

  it("reads sections as environments", () => {
    expect(song.sections.map((s) => [s.kind, s.label])).toEqual([
      ["verse", "Verse 1"],
      ["chorus", null],
    ]);
  });

  it("keeps comments as their own kind of line", () => {
    expect(song.sections[1].lines[0]).toEqual({ kind: "comment", text: "build here" });
  });

  it("reads a section however its name is punctuated", () => {
    for (const name of ["pre_chorus", "pre-chorus", "prechorus"]) {
      const parsed = parseChordPro(`{start_of_${name}}\n[C]a\n{end_of_${name}}`);
      expect(parsed.sections.map((s) => s.kind)).toEqual(["pre-chorus"]);
    }
  });

  it("accepts ChordPro's own abbreviations", () => {
    const short = parseChordPro("{soc}\n[C]Hold on\n{eoc}");
    expect(short.sections).toHaveLength(1);
    expect(short.sections[0].kind).toBe("chorus");
  });

  it("gives lines outside any environment somewhere to live", () => {
    const loose = parseChordPro("{title: X}\n[G]Just a line");
    expect(loose.sections).toEqual([
      { kind: "other", label: null, lines: [{ kind: "lyric", segments: [{ chord: "G", text: "Just a line" }] }] },
    ]);
  });

  it("carries an unrecognised directive rather than dropping it", () => {
    const odd = parseChordPro("{title: X}\n{x_custom: 3}\n\n{soc}\n{also_odd}\n[C]a\n{eoc}");
    expect(odd.meta.extra).toEqual([{ name: "x_custom", value: "3" }]);
    expect(odd.sections[0].lines[0]).toEqual({ kind: "unknown", raw: "{also_odd}" });
  });

  it("ignores a tempo or capo that is not a number", () => {
    const bad = parseChordPro("{capo: soon}\n{tempo: fast}");
    expect(bad.meta.capo).toBeUndefined();
    expect(bad.meta.tempo).toBeUndefined();
  });

  it("does not keep blank lines that are only spacing", () => {
    const spaced = parseChordPro("{soc}\n[C]a\n\n\n{eoc}");
    expect(spaced.sections[0].lines).toHaveLength(1);
  });

  it("keeps a blank line inside a section, which is a stanza break", () => {
    const stanza = parseChordPro("{sov}\n[C]a\n\n[D]b\n{eov}");
    expect(stanza.sections[0].lines.map((l) => l.kind)).toEqual(["lyric", "blank", "lyric"]);
  });

  it("survives an empty document", () => {
    expect(parseChordPro("")).toEqual({ meta: {}, sections: [] });
  });
});

describe("formatChordPro", () => {
  it("round-trips a whole song unchanged", () => {
    expect(formatChordPro(parseChordPro(SONG))).toBe(SONG);
  });

  it("is idempotent, so opening and saving cannot rewrite a song", () => {
    const once = formatChordPro(parseChordPro(SONG));
    expect(formatChordPro(parseChordPro(once))).toBe(once);
  });

  it("round-trips the shapes that are easy to lose", () => {
    for (const text of [
      "{title: X}",
      "{sov}\n[C]a\n{eov}",
      "{start_of_pre-chorus}\n[C]a\n{end_of_pre-chorus}",
      "{title: X}\n{x_custom: 3}",
      "{soc}\n{comment: quietly}\n[C]a\n{eoc}",
      "[G]No section at all",
      "",
    ]) {
      const once = formatChordPro(parseChordPro(text));
      expect(formatChordPro(parseChordPro(once))).toBe(once);
    }
  });

  it("does not invent an environment around loose lines", () => {
    expect(formatChordPro(parseChordPro("[G]Just a line"))).toBe("[G]Just a line");
  });
});

describe("layoutLine", () => {
  const layout = (line: string) => layoutLine(parseLine(line));

  it("puts each chord over the syllable it belongs to", () => {
    const { chords, lyrics } = layout("[G]Twinkle twinkle [C]little star");
    expect(lyrics).toBe("Twinkle twinkle little star");
    expect(chords).toBe("G               C");
    expect(chords.indexOf("C")).toBe(lyrics.indexOf("little"));
  });

  it("leaves the chord row empty when there are no chords", () => {
    expect(layout("just words")).toEqual({ chords: "", lyrics: "just words" });
  });

  it("handles a lyric that starts before the first chord", () => {
    const { chords, lyrics } = layout("Twinkle [D]star");
    expect(lyrics).toBe("Twinkle star");
    expect(chords.indexOf("D")).toBe(lyrics.indexOf("star"));
  });

  it("pushes the line right when a chord is wider than its lyric", () => {
    // Both rows shift together, so the second chord still sits over its word.
    const { chords, lyrics } = layout("[Cmaj7#11]a [D]b");
    expect(chords.indexOf("D")).toBe(lyrics.indexOf("b"));
    expect(chords).toContain("Cmaj7#11");
  });

  it("keeps a space between chords that would otherwise run together", () => {
    const { chords } = layout("[Cmaj7][D7]");
    expect(chords).toBe("Cmaj7 D7");
  });

  it("aligns every chord in a line with a long tail of lyric", () => {
    const line = "[G]Driving [D]down an [Em]empty [C]road tonight and forever more";
    const { chords, lyrics } = layout(line);
    for (const [chord, word] of [["G", "Driving"], ["D", "down"], ["Em", "empty"], ["C", "road"]]) {
      expect(chords.indexOf(chord)).toBe(lyrics.indexOf(word));
    }
  });
});
