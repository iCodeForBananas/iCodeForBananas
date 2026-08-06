import { sharpNotes, sharpToFlat, flatToSharp } from "./chordShapes";

// ── Roman numeral parsing ───────────────────────────────────────────────────
//
// Roman numerals are self-describing: uppercase = major, lowercase = minor,
// a trailing ° = diminished, and a leading b/# flats or sharps the degree.
// This holds for both major- and minor-key progressions (e.g. "i" in a minor
// key and "I" in a major key both resolve the same way), so a single parser
// covers every progression in the curated list below.

export type ChordQuality = "Major" | "Minor" | "Diminished";

export interface ProgressionChord {
  roman: string;
  degree: number; // semitones above the tonic
  quality: ChordQuality;
}

export interface ProgressionDef {
  name: string;
  pattern: string;
  description: string;
}

export interface ProgressionGroup {
  label: string;
  items: ProgressionDef[];
}

const ROMAN_BASE_DEGREE: Record<string, number> = {
  I: 0,
  II: 2,
  III: 4,
  IV: 5,
  V: 7,
  VI: 9,
  VII: 11,
};

const parseRomanToken = (raw: string): ProgressionChord => {
  const roman = raw.trim();
  let t = roman;

  let accidental = 0;
  if (t.startsWith("b")) {
    accidental = -1;
    t = t.slice(1);
  } else if (t.startsWith("#")) {
    accidental = 1;
    t = t.slice(1);
  }

  const diminished = t.endsWith("°");
  if (diminished) t = t.slice(0, -1);

  const isMajorCase = t === t.toUpperCase();
  const base = ROMAN_BASE_DEGREE[t.toUpperCase()] ?? 0;
  const degree = ((base + accidental) % 12 + 12) % 12;
  const quality: ChordQuality = diminished ? "Diminished" : isMajorCase ? "Major" : "Minor";

  return { roman, degree, quality };
};

export const parseRomanPattern = (pattern: string): ProgressionChord[] =>
  pattern.split(/[–-]/).map(parseRomanToken);

export const noteAtDegree = (rootNote: string, degree: number, useFlats: boolean): string => {
  const canonical = flatToSharp[rootNote] ?? rootNote;
  const idx = (sharpNotes.indexOf(canonical) + degree + 12) % 12;
  const sharpName = sharpNotes[idx];
  return useFlats ? sharpToFlat[sharpName] ?? sharpName : sharpName;
};

// ── Curated progressions ────────────────────────────────────────────────────

export const PROGRESSION_GROUPS: ProgressionGroup[] = [
  {
    label: "Hopeful / Uplifting",
    items: [
      { name: "The Anthem", pattern: "I–V–vi–IV", description: "The most-used pop progression ever. Bright, resolved, universally singable." },
      { name: "The Campfire", pattern: "I–IV–V–I", description: "Root of blues, rock, and country. Feels like coming home." },
      { name: "The Staircase", pattern: "I–ii–IV–V", description: "Gentle climb, folk and singer-songwriter staple." },
      { name: "The Canon", pattern: "I–V–vi–iii–IV–I–IV–V", description: "Pachelbel's DNA. Timeless forward motion." },
      { name: "Sunday Morning", pattern: "I–iii–IV–V", description: "Warm and slightly wistful. Classic pop/rock verse feel." },
      { name: "The Lift", pattern: "IV–I–V–vi", description: "Starts on the IV for an immediate uplifted feeling." },
    ],
  },
  {
    label: "Nostalgic / Bittersweet",
    items: [
      { name: "Doo-Wop", pattern: "I–vi–IV–V", description: "1950s staple. Sweet, innocent, yearning." },
      { name: "The Turnaround", pattern: "I–vi–ii–V", description: "Jazz-inflected nostalgia. Smooth resolution." },
      { name: "The Oldies Loop", pattern: "I–VI–IV–V", description: "Slightly brighter variation of doo-wop." },
      { name: "Bittersweet", pattern: "vi–IV–I–V", description: "Minor-start variation on the pop loop. Emotional without being dark." },
      { name: "The Verse", pattern: "I–IV–I–V", description: "Simple, reliable, folk and early rock." },
    ],
  },
  {
    label: "Tense / Dramatic",
    items: [
      { name: "The Descent", pattern: "I–bVII–bVI–V", description: "Descending bassline, cinematic tension. Think classic rock anthems." },
      { name: "Andalusian Cadence", pattern: "i–VII–VI–V", description: "Flamenco-rooted, exotic, urgent." },
      { name: "The Build", pattern: "i–VI–III–VII", description: "Dark epic feel. Trailer music DNA." },
      { name: "Minor Anthem", pattern: "i–VI–VII–i", description: "Circular dark energy. Minor rock and pop." },
      { name: "The Spy", pattern: "i–ii°–V–i", description: "Tense jazz minor. Suspenseful." },
      { name: "Hitchcock", pattern: "I–bII–I", description: "One-step chromatic jolt. Unsettling." },
    ],
  },
  {
    label: "Melancholy / Sad",
    items: [
      { name: "The Heartbreak", pattern: "vi–IV–I–V", description: "Same as Bittersweet but played slower — the slower feel brings more sadness." },
      { name: "Minor Waltz", pattern: "i–iv–v–i", description: "Pure natural minor. Aching and bare." },
      { name: "The Lament", pattern: "i–VII–VI–VII", description: "Circular mourning. Celtic and classical folk." },
      { name: "Minor Canon", pattern: "i–v–VI–III–VII–i", description: "Minor version of canon. Deeply melancholic." },
      { name: "The Rain", pattern: "i–iv–i–v", description: "Stripped-down minor. Sparse, lonely." },
    ],
  },
  {
    label: "Groovy / Funky",
    items: [
      { name: "The Funk Loop", pattern: "I–IV–bVII–IV", description: "Modal rock/funk swagger. One-chord-vamp energy." },
      { name: "Blues Shuffle", pattern: "I–I–I–I–IV–IV–I–I–V–IV–I–V", description: "12-bar blues. The foundation of groove." },
      { name: "Soul Changes", pattern: "I–IV–vi–V", description: "Soul and R&B flavored. Smooth with a lift." },
      { name: "The Groove", pattern: "ii–V–I", description: "Jazz resolution. Forward-pushing, sophisticated." },
    ],
  },
  {
    label: "Epic / Cinematic",
    items: [
      { name: "The Hero", pattern: "I–V–VI–III–IV", description: "Sweeping, triumphant. Film score energy." },
      { name: "The Journey", pattern: "I–bVII–IV–I", description: "Rock modal. Open, wandering, vast." },
      { name: "Dorian", pattern: "i–II–i–II", description: "Modal Dorian. Ancient-sounding, medieval epic." },
      { name: "The March", pattern: "I–IV–I–V–I", description: "Simple and majestic. Stately and powerful." },
    ],
  },
  {
    label: "Jazz / Sophisticated",
    items: [
      { name: "ii–V–I Major", pattern: "ii–V–I", description: "The bread and butter of jazz. Tension and release." },
      { name: "ii–V–i Minor", pattern: "ii°–V–i", description: "Minor jazz cadence. Dark sophistication." },
      { name: "Jazz Turnaround", pattern: "I–VI–ii–V", description: "Standard jazz loop. Elegant motion." },
      { name: "Rhythm Changes", pattern: "I–VI–ii–V–I–IV–#iv°–I", description: "Gershwin-derived. Upbeat jazz." },
      { name: "The Cycle", pattern: "IV–VII–III–VI–II–V–I", description: "Circle of fifths sequence. Maximum resolution." },
    ],
  },
  {
    label: "Experimental / Unexpected",
    items: [
      { name: "The Surprise", pattern: "I–bIII–IV–I", description: "Major with a flat-three punch. Rock and soul hybrid." },
      { name: "Lydian Float", pattern: "I–II–I–II", description: "Lydian raised-4th feel. Dreamy and floating." },
      { name: "The Pivot", pattern: "I–IV–bVII–bVI", description: "Unexpected flat-six landing. Cinematic twist." },
      { name: "Modal Mix", pattern: "I–bVI–bVII–I", description: "Borrowed chords from parallel minor. Rock grandeur." },
      { name: "The Drop", pattern: "I–I–IV–iv", description: "Major to minor IV. Emotional gut punch mid-progression." },
    ],
  },
];
