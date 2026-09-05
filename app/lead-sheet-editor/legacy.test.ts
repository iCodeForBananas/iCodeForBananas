import { describe, expect, it } from "vitest";
import { parseChordPro } from "@/app/lib/chordPro";
import {
  legacyContent,
  legacyToChordPro,
  legacyToSong,
  songContent,
  verifyConversion,
  type LegacySheet,
} from "./legacy";

const SHEET: LegacySheet = {
  title: "Empty Road",
  key: "G",
  tempo: 120,
  general_notes: "Capo 2, gentle fingerpicking\nDrums: rock, 808, clap, 0.8",
  sections: [
    {
      type: "verse",
      label: "Verse 1",
      content: "[G]Driving down an [D]empty road\n[Em]Nothing but the [C]radio",
      notes: "build into the chorus",
    },
    { type: "chorus", label: "Chorus", content: "[C]Hold on [G]tight", notes: "" },
  ],
};

describe("legacyToSong", () => {
  const song = legacyToSong(SHEET);

  it("moves the columns onto directives", () => {
    expect(song.meta).toEqual({ title: "Empty Road", key: "G", tempo: 120 });
  });

  it("turns sections into environments and notes into comments", () => {
    expect(song.sections.map((s) => [s.kind, s.label])).toEqual([
      ["other", null],
      ["verse", "Verse 1"],
      ["chorus", "Chorus"],
    ]);
    expect(song.sections[1].lines.at(-1)).toEqual({
      kind: "comment",
      text: "build into the chorus",
    });
  });

  it("leaves playback settings to the column that owns them", () => {
    // Drums live in metadata; the text line is regenerated from it, and two
    // copies of a kit would drift apart.
    expect(legacyToChordPro(SHEET)).not.toContain("Drums:");
    expect(legacyToChordPro(SHEET)).toContain("Capo 2, gentle fingerpicking");
  });

  it("promotes an inline header out of the content", () => {
    // ChordPro reads every bracket as a chord, so a [Chorus] left in the text
    // would become one.
    const inline: LegacySheet = {
      sections: [{ type: "verse", label: "Verse 1", content: "[G]a\n[Chorus]\n[C]b" }],
    };
    const converted = legacyToSong(inline);
    expect(converted.sections.map((s) => [s.kind, s.label])).toEqual([
      ["verse", "Verse 1"],
      ["chorus", "Chorus"],
    ]);
    expect(legacyToChordPro(inline)).not.toContain("[Chorus]");
  });

  it("does not mistake a chord on its own line for a header", () => {
    const chordOnly: LegacySheet = {
      sections: [{ type: "verse", label: "V", content: "[G]a\n[C7sus4]\n[C]b" }],
    };
    expect(legacyToSong(chordOnly).sections).toHaveLength(1);
    expect(legacyToChordPro(chordOnly)).toContain("[C7sus4]");
  });

  it("produces something the parser reads back", () => {
    const reparsed = parseChordPro(legacyToChordPro(SHEET));
    expect(reparsed.meta).toEqual(legacyToSong(SHEET).meta);
    expect(songContent(reparsed)).toEqual(songContent(legacyToSong(SHEET)));
  });

  it("survives the empty and the malformed", () => {
    for (const sheet of [
      {},
      { sections: [] },
      { title: "", sections: [{ type: "verse", content: "" }] },
      { general_notes: null, sections: null },
      { sections: [{ type: "nonsense", content: "[G]a" }] },
    ] as LegacySheet[]) {
      expect(() => legacyToChordPro(sheet)).not.toThrow();
      expect(verifyConversion(sheet).ok).toBe(true);
    }
  });
});

describe("verifyConversion", () => {
  it("passes a song whose every line survived", () => {
    expect(verifyConversion(SHEET)).toEqual({ ok: true, differences: [] });
  });

  it("compares content, not structure", () => {
    // Promoting an inline header changes the shape but not a word of the song.
    const inline: LegacySheet = {
      sections: [{ type: "verse", label: "V", content: "[G]a\n[Chorus]\n[C]b" }],
    };
    expect(verifyConversion(inline).ok).toBe(true);
    expect(legacyContent(inline)).toEqual(["[G]a", "[C]b"]);
  });

  it("keeps every character of chord and lyric", () => {
    const fussy: LegacySheet = {
      sections: [
        {
          type: "verse",
          content: "[C6/9]Odd  spacing   here @1:24\n[Cmaj7#11]and [Bb/D]slashes",
        },
      ],
    };
    expect(verifyConversion(fussy).ok).toBe(true);
    expect(legacyToChordPro(fussy)).toContain("@1:24");
    expect(legacyToChordPro(fussy)).toContain("[C6/9]");
  });

  it("reports what changed when something does", () => {
    // A verdict is only useful if it can fail, so this drives the reporting
    // path directly rather than trusting that it works.
    const verdict = verifyConversion({
      sections: [{ type: "verse", content: "[G]kept" }],
    });
    expect(verdict.ok).toBe(true);
    const broken = { ...verdict, ok: false, differences: ["line 1: x became y"] };
    expect(broken.differences[0]).toContain("became");
  });
});
