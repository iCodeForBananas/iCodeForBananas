export const allNotes = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
export const defaultTuning = ["E", "A", "D", "G", "B", "E"];
export const totalFrets = 12;

export const generateChordsAndScales = () => {
  const chords: Record<string, string[]> = {};
  const scales: Record<string, string[]> = {};
  allNotes.forEach((root, i) => {
    chords[`${root} Major`] = [root, allNotes[(i + 4) % 12], allNotes[(i + 7) % 12]];
    chords[`${root} Minor`] = [root, allNotes[(i + 3) % 12], allNotes[(i + 7) % 12]];
    chords[`${root}7`] = [root, allNotes[(i + 4) % 12], allNotes[(i + 7) % 12], allNotes[(i + 10) % 12]];
    chords[`${root} maj7`] = [root, allNotes[(i + 4) % 12], allNotes[(i + 7) % 12], allNotes[(i + 11) % 12]];
    chords[`${root}m7`] = [root, allNotes[(i + 3) % 12], allNotes[(i + 7) % 12], allNotes[(i + 10) % 12]];
    chords[`${root}9`] = [
      root,
      allNotes[(i + 4) % 12],
      allNotes[(i + 7) % 12],
      allNotes[(i + 10) % 12],
      allNotes[(i + 2) % 12],
    ];
    chords[`${root}13`] = [
      root,
      allNotes[(i + 4) % 12],
      allNotes[(i + 7) % 12],
      allNotes[(i + 10) % 12],
      allNotes[(i + 2) % 12],
      allNotes[(i + 9) % 12],
    ];
    chords[`${root} maj9`] = [
      root,
      allNotes[(i + 4) % 12],
      allNotes[(i + 7) % 12],
      allNotes[(i + 11) % 12],
      allNotes[(i + 2) % 12],
    ];
    chords[`${root} maj13`] = [
      root,
      allNotes[(i + 4) % 12],
      allNotes[(i + 7) % 12],
      allNotes[(i + 11) % 12],
      allNotes[(i + 2) % 12],
      allNotes[(i + 9) % 12],
    ];
    chords[`${root}m9`] = [
      root,
      allNotes[(i + 3) % 12],
      allNotes[(i + 7) % 12],
      allNotes[(i + 10) % 12],
      allNotes[(i + 2) % 12],
    ];
    chords[`${root} dim`] = [root, allNotes[(i + 3) % 12], allNotes[(i + 6) % 12]];
    chords[`${root} aug`] = [root, allNotes[(i + 4) % 12], allNotes[(i + 8) % 12]];
    chords[`${root} sus2`] = [root, allNotes[(i + 2) % 12], allNotes[(i + 7) % 12]];
    chords[`${root} sus4`] = [root, allNotes[(i + 5) % 12], allNotes[(i + 7) % 12]];
    chords[`${root}m7b5`] = [root, allNotes[(i + 3) % 12], allNotes[(i + 6) % 12], allNotes[(i + 10) % 12]];
    chords[`${root} add9`] = [root, allNotes[(i + 4) % 12], allNotes[(i + 7) % 12], allNotes[(i + 2) % 12]];

    // Common scales
    const map = (arr: number[]) => arr.map((x) => allNotes[(i + x) % 12]);
    scales[`${root} Major`] = map([0, 2, 4, 5, 7, 9, 11]);
    scales[`${root} Minor`] = map([0, 2, 3, 5, 7, 8, 10]);
    scales[`${root} Pentatonic Major`] = map([0, 2, 4, 7, 9]);
    scales[`${root} Pentatonic Minor`] = map([0, 3, 5, 7, 10]);
    scales[`${root} Phrygian`] = map([0, 1, 3, 5, 7, 8, 10]);
    scales[`${root} Phrygian Dominant`] = map([0, 1, 4, 5, 7, 8, 10]);
    scales[`${root} Blues`] = map([0, 3, 5, 6, 7, 10]);
    scales[`${root} Harmonic Minor`] = map([0, 2, 3, 5, 7, 8, 11]);
    scales[`${root} Melodic Minor`] = map([0, 2, 3, 5, 7, 9, 11]);
  });
  return { chords, scales };
};

export const getNoteAt = (base: string, fret: number) => {
  const i = allNotes.indexOf(base);
  if (i < 0) return "";
  return allNotes[(i + fret) % 12];
};

interface ProgressionDegree {
  degree: number;
  quality: string;
}

interface ProgressionPreset {
  label: string;
  pattern?: number[];
  degrees?: ProgressionDegree[];
  isMinor: boolean;
}

// Available chord voicings for progression generation
export const chordVoicings = [
  { value: "triad", label: "Triads (Major/Minor)" },
  { value: "7", label: "Dominant 7th" },
  { value: "maj7", label: "Major 7th" },
  { value: "m7", label: "Minor 7th" },
  { value: "9", label: "Dominant 9th" },
  { value: "maj9", label: "Major 9th" },
  { value: "m9", label: "Minor 9th" },
  { value: "13", label: "Dominant 13th" },
  { value: "maj13", label: "Major 13th" },
  { value: "sus2", label: "Suspended 2nd" },
  { value: "sus4", label: "Suspended 4th" },
  { value: "dim", label: "Diminished" },
  { value: "aug", label: "Augmented" },
  { value: "add9", label: "Add 9" },
  { value: "m7b5", label: "Minor 7th ♭5 (Half-Dim)" },
];

// Expanded, shared chord progression presets
export const progressionPresets: ProgressionPreset[] = [
  { label: "Folk: I – V – vi – IV", pattern: [0, 7, 9, 5], isMinor: false },
  { label: "Pop: vi – IV – I – V", pattern: [9, 5, 0, 7], isMinor: false },
  { label: "Sad Pop: I – vi – iii – IV", pattern: [0, 9, 4, 5], isMinor: false },
  { label: "Indie: I – iii – vi – V", pattern: [0, 4, 9, 7], isMinor: false },
  { label: "Classic Rock: I – IV – V – IV", pattern: [0, 5, 7, 5], isMinor: false },
  { label: "Blues: I – IV – I – V", pattern: [0, 5, 0, 7], isMinor: false },
  { label: "Cinematic Minor: i – VI – III – VII", pattern: [0, 8, 3, 10], isMinor: true },
  { label: "Spanish Minor: i – VII – VI – V", pattern: [0, 10, 8, 7], isMinor: true },
  { label: "Dramatic Minor: i – v – VI – III", pattern: [0, 7, 8, 3], isMinor: true },
  { label: "Jazz: ii – V – I – vi", pattern: [2, 7, 0, 9], isMinor: false },
  // Degree-based with explicit qualities
  {
    label: "Major Jazz Flow: Imaj7 – VI7 – II7 – V7",
    degrees: [
      { degree: 1, quality: "maj7" },
      { degree: 6, quality: "7" },
      { degree: 2, quality: "7" },
      { degree: 5, quality: "7" },
    ],
    isMinor: false,
  },
  {
    label: "Pop-Jazz Blend: Imaj7 – IVmaj7 – II7 – V7",
    degrees: [
      { degree: 1, quality: "maj7" },
      { degree: 4, quality: "maj7" },
      { degree: 2, quality: "7" },
      { degree: 5, quality: "7" },
    ],
    isMinor: false,
  },
];

// Build a list of chord names for a key + preset + optional voicing
export function buildProgressionChords(keyRoot: string, preset: ProgressionPreset, voicing: string = "triad"): string[] {
  const rootIndex = allNotes.indexOf(keyRoot);
  if (rootIndex < 0) return [];

  // Degree-based (explicit quality) — voicing override does not apply
  if (Array.isArray(preset.degrees)) {
    const majorDegrees = [0, 2, 4, 5, 7, 9, 11]; // I, II, III, IV, V, VI, VII
    return preset.degrees.map(({ degree, quality }) => {
      const degIdx = (((degree - 1) % 7) + 7) % 7;
      const semitoneOffset = majorDegrees[degIdx];
      const noteIndex = (rootIndex + semitoneOffset) % 12;
      const noteName = allNotes[noteIndex];
      switch (quality) {
        case "maj7":
          return `${noteName} maj7`;
        case "maj9":
          return `${noteName} maj9`;
        case "maj13":
          return `${noteName} maj13`;
        case "9":
          return `${noteName}9`;
        case "13":
          return `${noteName}13`;
        case "7":
          return `${noteName}7`;
        case "m7":
          return `${noteName}m7`;
        default:
          return `${noteName} Major`;
      }
    });
  }

  // Pattern-based (heuristic quality) with voicing override
  const isMinor = !!preset.isMinor;
  return preset.pattern!.map((semitoneOffset) => {
    const noteIndex = (rootIndex + semitoneOffset) % 12;
    const noteName = allNotes[noteIndex];

    // When a specific voicing is selected (not triad), apply it to all chords
    if (voicing !== "triad") {
      // Voicings that use a space separator
      const spacedVoicings = ["maj7", "maj9", "maj13", "dim", "aug", "sus2", "sus4", "add9"];
      if (spacedVoicings.includes(voicing)) {
        return `${noteName} ${voicing}`;
      }
      // Voicings that attach directly to the note name
      return `${noteName}${voicing}`;
    }

    // Default triad behavior
    let chordQuality;
    if (isMinor) {
      if (semitoneOffset === 0) chordQuality = "Minor";
      else if (semitoneOffset === 3) chordQuality = "Major";
      else if (semitoneOffset === 5) chordQuality = "Minor";
      else if (semitoneOffset === 7) chordQuality = "Major";
      else if (semitoneOffset === 8) chordQuality = "Major";
      else if (semitoneOffset === 10) chordQuality = "Major";
      else chordQuality = "Major";
    } else {
      const scaleDegree = semitoneOffset % 12;
      chordQuality = [0, 5, 7].includes(scaleDegree) ? "Major" : "Minor";
    }
    return `${noteName} ${chordQuality}`;
  });
}
