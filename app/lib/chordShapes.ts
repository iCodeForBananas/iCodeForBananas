export interface ChordShape {
  frets: number[];
  fingers: number[];
}

export const sharpNotes = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
export const flatNotes = ["A", "Bb", "B", "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab"];
export const chordTypes = ["Major", "Minor", "6", "7", "m7", "Sus2", "Sus4", "Add9", "9", "13", "Maj7", "Maj9", "Maj13"];
export const stringNotes = ["E", "A", "D", "G", "B", "E"];

export const sharpToFlat: Record<string, string> = {
  "A#": "Bb",
  "C#": "Db",
  "D#": "Eb",
  "F#": "Gb",
  "G#": "Ab",
};

export const flatToSharp: Record<string, string> = {
  Bb: "A#",
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
};

export const chordShapes: Record<string, ChordShape[]> = {
  "C Major": [{ frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] }],
  "C Minor": [{ frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1] }],
  "C Maj7": [{ frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] }],
  C7: [{ frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] }],
  Cm7: [{ frets: [-1, 3, 5, 3, 4, 3], fingers: [0, 1, 3, 1, 2, 1] }],
  "C Sus2": [{ frets: [-1, 3, 0, 0, 1, 3], fingers: [0, 2, 0, 0, 1, 3] }],
  "C Sus4": [{ frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1] }],
  "C Add9": [{ frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 3, 2, 0, 4, 0] }],
  "C Maj9": [{ frets: [-1, 3, 2, 4, 3, 0], fingers: [0, 2, 1, 4, 3, 0] }],
  "C Maj13": [{ frets: [-1, 3, 2, 2, 0, 0], fingers: [0, 3, 1, 2, 0, 0] }],
  C6: [{ frets: [-1, 3, 2, 2, 1, 0], fingers: [0, 4, 2, 3, 1, 0] }],
  "D Major": [{ frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] }],
  "D Minor": [{ frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] }],
  "D Maj7": [{ frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] }],
  D7: [{ frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 3, 1, 2] }],
  Dm7: [{ frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] }],
  "D Sus2": [{ frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0] }],
  "D Sus4": [{ frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] }],
  "D Add9": [{ frets: [-1, -1, 4, 2, 3, 0], fingers: [0, 0, 3, 1, 2, 0] }],
  "D Maj9": [{ frets: [-1, 5, 4, 6, 5, 0], fingers: [0, 2, 1, 4, 3, 0] }],
  "D Maj13": [{ frets: [-1, 5, 7, 6, 7, 7], fingers: [0, 1, 3, 2, 4, 4] }],
  D6: [{ frets: [-1, -1, 0, 2, 0, 2], fingers: [0, 0, 0, 1, 0, 2] }],
  "E Major": [{ frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] }],
  "E Minor": [{ frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] }],
  "E Maj7": [{ frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0] }],
  E7: [{ frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] }],
  Em7: [{ frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] }],
  "E Sus2": [{ frets: [0, 2, 4, 4, 0, 0], fingers: [0, 1, 3, 4, 0, 0] }],
  "E Sus4": [{ frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0] }],
  "E Add9": [{ frets: [0, 2, 2, 1, 0, 2], fingers: [0, 2, 3, 1, 0, 4] }],
  "E Maj9": [{ frets: [0, 2, 1, 1, 0, 2], fingers: [0, 3, 1, 2, 0, 4] }],
  "E Maj13": [{ frets: [0, 2, 1, 1, 2, 2], fingers: [0, 2, 1, 1, 3, 3] }],
  E6: [{ frets: [0, 2, 2, 1, 2, 0], fingers: [0, 2, 3, 1, 4, 0] }],
  "F Major": [{ frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1] }],
  "F Minor": [{ frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1] }],
  "F Maj7": [{ frets: [1, 3, 2, 2, 1, 1], fingers: [1, 4, 2, 3, 1, 1] }],
  F7: [{ frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1] }],
  Fm7: [{ frets: [1, 3, 1, 1, 1, 1], fingers: [1, 3, 1, 1, 1, 1] }],
  "F Sus2": [{ frets: [1, 3, 3, 0, 1, 1], fingers: [1, 3, 4, 0, 1, 1] }],
  "F Sus4": [{ frets: [1, 3, 3, 3, 1, 1], fingers: [1, 2, 3, 4, 1, 1] }],
  "F Add9": [{ frets: [1, 0, 3, 0, 1, 1], fingers: [1, 0, 4, 0, 2, 1] }],
  "F Maj9": [{ frets: [1, 0, 2, 0, 1, 0], fingers: [1, 0, 3, 0, 2, 0] }],
  "F Maj13": [{ frets: [1, 3, 2, 2, 3, 3], fingers: [1, 3, 2, 2, 4, 4] }],
  F6: [{ frets: [1, 3, 3, 2, 3, 1], fingers: [1, 3, 3, 2, 4, 1] }],
  "G Major": [{ frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4] }],
  "G Minor": [{ frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1] }],
  "G Maj7": [{ frets: [3, 2, 0, 0, 0, 2], fingers: [3, 1, 0, 0, 0, 2] }],
  G7: [{ frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] }],
  Gm7: [{ frets: [3, 5, 3, 3, 3, 3], fingers: [1, 4, 1, 1, 1, 1] }],
  "G Sus2": [{ frets: [3, 0, 0, 0, 3, 3], fingers: [1, 0, 0, 0, 3, 4] }],
  "G Sus4": [{ frets: [3, 3, 0, 0, 1, 3], fingers: [3, 4, 0, 0, 1, 3] }],
  "G Add9": [{ frets: [3, 0, 0, 2, 0, 3], fingers: [3, 0, 0, 2, 0, 4] }],
  "G Maj9": [{ frets: [3, 0, 0, 2, 0, 2], fingers: [3, 0, 0, 2, 0, 1] }],
  "G Maj13": [{ frets: [3, 2, 2, 2, 3, 2], fingers: [2, 1, 1, 1, 3, 1] }],
  G6: [{ frets: [3, 2, 0, 0, 0, 0], fingers: [2, 1, 0, 0, 0, 0] }],
  "A Major": [{ frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] }],
  "A Minor": [{ frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] }],
  "A Maj7": [{ frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] }],
  A7: [{ frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] }],
  Am7: [{ frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] }],
  "A Sus2": [{ frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0] }],
  "A Sus4": [{ frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 4, 0] }],
  "A Add9": [{ frets: [-1, 0, 2, 4, 2, 0], fingers: [0, 0, 1, 4, 2, 0] }],
  "A Maj9": [{ frets: [-1, 0, 2, 4, 2, 4], fingers: [0, 0, 1, 3, 2, 4] }],
  "A Maj13": [{ frets: [-1, 0, 2, 1, 2, 2], fingers: [0, 0, 3, 1, 4, 4] }],
  A6: [{ frets: [-1, 0, 2, 2, 2, 2], fingers: [0, 0, 1, 1, 1, 1] }],
  "B Major": [{ frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1] }],
  "B Minor": [{ frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1] }],
  "B Maj7": [{ frets: [-1, 2, 4, 3, 4, 2], fingers: [0, 1, 3, 2, 4, 1] }],
  B7: [{ frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] }],
  Bm7: [{ frets: [-1, 2, 4, 2, 3, 2], fingers: [0, 1, 3, 1, 2, 1] }],
  "B Sus2": [{ frets: [-1, 2, 4, 4, 2, 2], fingers: [0, 1, 3, 4, 1, 1] }],
  "B Sus4": [{ frets: [-1, 2, 4, 4, 5, 2], fingers: [0, 1, 2, 3, 4, 1] }],
  "B Add9": [{ frets: [-1, 2, 1, 4, 2, 2], fingers: [0, 2, 1, 4, 3, 3] }],
  "B Maj9": [{ frets: [-1, 2, 1, 3, 2, 2], fingers: [0, 1, 1, 3, 2, 2] }],
  "B Maj13": [{ frets: [-1, 2, 4, 3, 4, 4], fingers: [0, 1, 3, 2, 4, 4] }],
  B6: [{ frets: [-1, 2, 4, 4, 4, 4], fingers: [0, 1, 2, 3, 3, 3] }],
  "Bb Major": [{ frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1] }],
  "Bb Minor": [{ frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1] }],
  "Bb Maj7": [{ frets: [-1, 1, 3, 2, 3, 1], fingers: [0, 1, 3, 2, 4, 1] }],
  Bb7: [{ frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1] }],
  Bbm7: [{ frets: [-1, 1, 3, 1, 2, 1], fingers: [0, 1, 3, 1, 2, 1] }],
  "Bb Sus2": [{ frets: [-1, 1, 3, 3, 1, 1], fingers: [0, 1, 3, 4, 1, 1] }],
  "Bb Sus4": [{ frets: [-1, 1, 3, 3, 4, 1], fingers: [0, 1, 2, 3, 4, 1] }],
  "Bb Add9": [{ frets: [-1, 1, 0, 3, 1, 1], fingers: [0, 1, 0, 4, 2, 1] }],
  "Bb Maj9": [{ frets: [-1, 1, 0, 2, 1, 1], fingers: [0, 1, 0, 3, 2, 2] }],
  "Bb Maj13": [{ frets: [-1, 1, 3, 2, 3, 3], fingers: [0, 1, 3, 2, 4, 4] }],
  Bb6: [{ frets: [-1, 1, 3, 3, 3, 3], fingers: [0, 1, 2, 3, 3, 3] }],
  "Db Major": [{ frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1] }],
  "Db Minor": [{ frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1] }],
  "Db Maj7": [{ frets: [-1, 4, 6, 5, 6, 4], fingers: [0, 1, 3, 2, 4, 1] }],
  Db7: [{ frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1] }],
  Dbm7: [{ frets: [-1, 4, 6, 4, 5, 4], fingers: [0, 1, 3, 1, 2, 1] }],
  "Db Sus2": [{ frets: [-1, 4, 6, 6, 4, 4], fingers: [0, 1, 3, 4, 1, 1] }],
  "Db Sus4": [{ frets: [-1, 4, 6, 6, 7, 4], fingers: [0, 1, 2, 3, 4, 1] }],
  "Db Add9": [{ frets: [-1, 4, 3, 6, 4, 4], fingers: [0, 2, 1, 4, 3, 2] }],
  "Db Maj9": [{ frets: [-1, 4, 3, 5, 4, 4], fingers: [0, 1, 1, 3, 2, 2] }],
  "Db Maj13": [{ frets: [-1, 4, 6, 5, 6, 6], fingers: [0, 1, 3, 2, 4, 4] }],
  Db6: [{ frets: [-1, 4, 6, 6, 6, 6], fingers: [0, 1, 2, 3, 3, 3] }],
  "Eb Major": [{ frets: [-1, -1, 1, 3, 4, 3], fingers: [0, 0, 1, 2, 4, 3] }],
  "Eb Minor": [{ frets: [-1, -1, 1, 3, 4, 2], fingers: [0, 0, 1, 3, 4, 2] }],
  "Eb Maj7": [{ frets: [-1, -1, 1, 3, 3, 3], fingers: [0, 0, 1, 2, 3, 4] }],
  Eb7: [{ frets: [-1, -1, 1, 3, 2, 3], fingers: [0, 0, 1, 3, 2, 4] }],
  Ebm7: [{ frets: [-1, -1, 1, 3, 2, 2], fingers: [0, 0, 1, 4, 2, 3] }],
  "Eb Sus2": [{ frets: [-1, -1, 1, 3, 4, 1], fingers: [0, 0, 1, 3, 4, 1] }],
  "Eb Sus4": [{ frets: [-1, -1, 1, 3, 4, 4], fingers: [0, 0, 1, 2, 3, 4] }],
  "Eb Add9": [{ frets: [-1, -1, 1, 0, 4, 1], fingers: [0, 0, 1, 0, 4, 2] }],
  "Eb Maj9": [{ frets: [-1, 6, 5, 7, 6, 6], fingers: [0, 1, 1, 3, 2, 2] }],
  "Eb Maj13": [{ frets: [-1, 6, 8, 7, 8, 8], fingers: [0, 1, 3, 2, 4, 4] }],
  Eb6: [{ frets: [-1, -1, 1, 3, 1, 3], fingers: [0, 0, 1, 3, 1, 4] }],
  "Gb Major": [{ frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1] }],
  "Gb Minor": [{ frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1] }],
  "Gb Maj7": [{ frets: [2, 4, 3, 3, 2, 2], fingers: [1, 4, 2, 3, 1, 1] }],
  Gb7: [{ frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1] }],
  Gbm7: [{ frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1] }],
  "Gb Sus2": [{ frets: [2, 4, 4, 1, 2, 2], fingers: [1, 3, 4, 0, 1, 1] }],
  "Gb Sus4": [{ frets: [2, 4, 4, 4, 2, 2], fingers: [1, 2, 3, 4, 1, 1] }],
  "Gb Add9": [{ frets: [2, 4, 4, 3, 2, 4], fingers: [1, 3, 3, 2, 1, 4] }],
  "Gb Maj9": [{ frets: [2, 4, 3, 3, 2, 4], fingers: [1, 4, 3, 3, 1, 4] }],
  "Gb Maj13": [{ frets: [2, 4, 3, 3, 4, 4], fingers: [1, 3, 2, 2, 4, 4] }],
  Gb6: [{ frets: [2, 4, 4, 3, 4, 2], fingers: [1, 3, 3, 2, 4, 1] }],
  "Ab Major": [{ frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1] }],
  "Ab Minor": [{ frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1] }],
  "Ab Maj7": [{ frets: [4, 6, 5, 5, 4, 4], fingers: [1, 4, 2, 3, 1, 1] }],
  Ab7: [{ frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1] }],
  Abm7: [{ frets: [4, 6, 4, 4, 4, 4], fingers: [1, 3, 1, 1, 1, 1] }],
  "Ab Sus2": [{ frets: [4, 6, 6, 3, 4, 4], fingers: [1, 3, 4, 0, 1, 1] }],
  "Ab Sus4": [{ frets: [4, 6, 6, 6, 4, 4], fingers: [1, 2, 3, 4, 1, 1] }],
  "Ab Add9": [{ frets: [4, 6, 6, 5, 4, 6], fingers: [1, 3, 3, 2, 1, 4] }],
  "Ab Maj9": [{ frets: [4, 6, 5, 5, 4, 6], fingers: [1, 4, 3, 3, 1, 4] }],
  "Ab Maj13": [{ frets: [4, 6, 5, 5, 6, 6], fingers: [1, 3, 2, 2, 4, 4] }],
  Ab6: [{ frets: [4, 6, 6, 5, 6, 4], fingers: [1, 3, 3, 2, 4, 1] }],
};

// ── CAGED barre templates ─────────────────────────────────────────────────────
// E-shape: root on low E string (6th string). Template anchored at fret 0 = E note.
export const eShapeTemplates: Partial<Record<string, ChordShape>> = {
  Major: { frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  Minor: { frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  "7": { frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  m7: { frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  Maj7: { frets: [0, 2, 1, 1, 0, 0], fingers: [1, 4, 2, 3, 1, 1] },
  Sus2: { frets: [0, 2, 4, 4, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  Sus4: { frets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  Add9: { frets: [0, 2, 2, 1, 0, 2], fingers: [1, 3, 4, 2, 1, 4] },
  "6": { frets: [0, 2, 2, 1, 2, 0], fingers: [1, 3, 4, 2, 4, 1] },
};

// A-shape: root on A string (5th string). Template anchored at fret 0 = A note.
export const aShapeTemplates: Partial<Record<string, ChordShape>> = {
  Major: { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1] },
  Minor: { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
  "7": { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
  m7: { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
  Maj7: { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
  Sus2: { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 1, 1] },
  Sus4: { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1] },
  Add9: { frets: [-1, 0, 2, 4, 2, 0], fingers: [0, 1, 2, 4, 3, 1] },
  "6": { frets: [-1, 0, 2, 2, 2, 2], fingers: [0, 1, 2, 3, 3, 3] },
};

export const normalizeTypeForShape = (type: string) => {
  switch (type) {
    case "maj7":
    case "Maj7":
      return "Maj7";
    default:
      return type;
  }
};

export const buildChordKey = (note: string, type: string) => {
  const normalized = normalizeTypeForShape(type);
  if (normalized === "6" || normalized === "7" || normalized === "m7") {
    return `${note}${normalized}`;
  }
  return `${note} ${normalized}`;
};

export const transposeShape = (shape: ChordShape, semitoneShift: number): ChordShape | null => {
  if (!shape || !Array.isArray(shape.frets)) return null;
  return {
    frets: shape.frets.map((fret) => (fret === -1 ? -1 : fret + semitoneShift)),
    fingers: shape.fingers ? [...shape.fingers] : [],
  };
};

const sharpBaseMap: Record<string, string> = {
  "A#": "A",
  "C#": "C",
  "D#": "D",
  "F#": "F",
  "G#": "G",
};

export const resolveChordShape = (note: string, type: string): ChordShape | null => {
  const tryKey = (n: string, t: string) => chordShapes[buildChordKey(n, t)]?.[0] || null;

  const direct = tryKey(note, type);
  if (direct) return direct;

  const fallbacks: Record<string, string[]> = {
    maj9: ["Add9", "Maj7", "Major"],
    maj13: ["Maj7", "Add9", "Major"],
    9: ["7", "Add9", "Major"],
    13: ["7", "9", "Add9", "Major"],
  };
  const fallbackList = fallbacks[type] || [];

  for (const fb of fallbackList) {
    const found = tryKey(note, fb);
    if (found) return found;
  }

  const enharmonic = flatToSharp[note] || sharpToFlat[note];
  if (enharmonic) {
    const enharmonicExact = tryKey(enharmonic, type);
    if (enharmonicExact) return enharmonicExact;
    for (const fb of fallbackList) {
      const enharmonicFound = tryKey(enharmonic, fb);
      if (enharmonicFound) return enharmonicFound;
    }
  }

  const sharpNote = flatToSharp[note] || note;
  const baseNote = sharpBaseMap[sharpNote];
  if (baseNote) {
    const baseExact = tryKey(baseNote, type);
    if (baseExact) return transposeShape(baseExact, 1);
    for (const fb of fallbackList) {
      const baseFound = tryKey(baseNote, fb);
      if (baseFound) return transposeShape(baseFound, 1);
    }
  }

  return null;
};

/**
 * Return semitones from E (low E string, fret 0) to the given note.
 * E.g. E→0, F→1, G→3, A→5, C→8, etc.
 */
export const semitoneFromE = (note: string): number => {
  const sharpNote = flatToSharp[note] ?? note;
  return (sharpNotes.indexOf(sharpNote) - sharpNotes.indexOf("E") + 12) % 12;
};

/**
 * Return semitones from A (A string, fret 0) to the given note.
 * E.g. A→0, Bb→1, B→2, C→3, etc.
 */
export const semitoneFromA = (note: string): number => {
  const sharpNote = flatToSharp[note] ?? note;
  return (sharpNotes.indexOf(sharpNote) - sharpNotes.indexOf("A") + 12) % 12;
};
