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

// In a minor key, a bare III / VI / VII means the natural-minor degree — the
// flat third, sixth and seventh. In a major key the same numerals mean chords
// built on the major scale (the VI of I–VI–ii–V is A in C, not Ab). A numeral
// on its own can't say which, so the tonic decides: a lowercase i anywhere in
// the pattern means we are reading it in minor.
const MINOR_KEY_DEGREE: Record<string, number> = { III: 3, VI: 8, VII: 10 };

const parseRomanToken = (raw: string, minorKey: boolean): ProgressionChord => {
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
  const upper = t.toUpperCase();
  // An explicit accidental is already saying exactly which degree it wants, so
  // the minor reading only applies to the bare numeral.
  const base =
    minorKey && isMajorCase && accidental === 0 && upper in MINOR_KEY_DEGREE
      ? MINOR_KEY_DEGREE[upper]
      : ROMAN_BASE_DEGREE[upper] ?? 0;
  const degree = ((base + accidental) % 12 + 12) % 12;
  const quality: ChordQuality = diminished ? "Diminished" : isMajorCase ? "Major" : "Minor";

  return { roman, degree, quality };
};

/** A lowercase i tonic is what marks a pattern as minor-key. */
const isMinorKeyPattern = (tokens: string[]): boolean =>
  tokens.some((t) => t.trim().replace(/°$/, "") === "i");

export const parseRomanPattern = (pattern: string): ProgressionChord[] => {
  const tokens = pattern.split(/[–-]/);
  const minorKey = isMinorKeyPattern(tokens);
  return tokens.map((t) => parseRomanToken(t, minorKey));
};

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
  {
    label: "Dreamy / Atmospheric",
    items: [
      { name: "The Daydream", pattern: "I–iii–vi–IV", description: "The iii softens the step out of the tonic, so it floats where I–V–vi–IV lands." },
      { name: "Slow Drift", pattern: "I–iii–IV–iii", description: "Rocks between two neighbours. Almost no harmonic motion, which is the whole effect." },
      { name: "Cloudbank", pattern: "vi–iii–IV–I", description: "Opens unresolved and only sinks into the tonic at the last moment." },
      { name: "Weightless", pattern: "I–II–vi–IV", description: "The major II is borrowed from Lydian — raises the 4th and takes the floor out." },
      { name: "Half-Light", pattern: "I–iii–bVII–IV", description: "Major third-degree against a flat-seven. Warm and slightly out of focus." },
      { name: "The Long Exhale", pattern: "I–V–vi–iii–IV–I–ii–V", description: "Canon motion rerouted through ii, so it lands softer than Pachelbel does." },
    ],
  },
  {
    label: "Aching / Longing",
    items: [
      { name: "Unsent Letter", pattern: "I–iii–vi–iv", description: "Ends on the borrowed minor iv — the didn't-say-it chord." },
      { name: "The Ache", pattern: "vi–IV–I–iii", description: "The pop loop with the V withheld, so it never gets its resolution." },
      { name: "Still Here", pattern: "vi–V–IV–V", description: "Falls, then pulls back up short. Circular and unfinished." },
      { name: "Something Left", pattern: "I–iii–IV–iv–I", description: "The IV turns minor underneath a melody note that doesn't move." },
      { name: "Held Breath", pattern: "IV–iii–ii–I", description: "Stepwise descent onto the tonic. Resigned rather than triumphant." },
      { name: "The Long Way Home", pattern: "I–V–vi–iii–IV–iv–I–V", description: "Canon opening that darkens at the iv before it resolves. Eight bars to say one thing." },
    ],
  },
  {
    label: "Sultry / Late Night",
    items: [
      { name: "After Hours", pattern: "i–iv–VII–III", description: "Minor with a major III release. Smoky and in no hurry." },
      { name: "Velvet", pattern: "ii–V–iii–vi", description: "Two cadences chained so the loop never actually reaches I." },
      { name: "Smoke", pattern: "i–VI–ii°–V", description: "The diminished ii pulling into V is the noir sound." },
      { name: "Slow Burn", pattern: "i–iv–VI–V", description: "Builds pressure onto the V and just sits there." },
      { name: "Neon", pattern: "vi–ii–V–I", description: "Jazz turnaround entered from the relative minor. Lands late." },
    ],
  },
  {
    label: "Driving / Danceable",
    items: [
      { name: "Night Drive", pattern: "i–VII–III–VI", description: "Continuous descent with no resolution. Built to repeat." },
      { name: "The Chase", pattern: "i–iv–VII–VI", description: "Every chord falls. Relentless under a steady kick." },
      { name: "Hands Up", pattern: "IV–V–iii–vi", description: "Starts mid-lift on the IV and lands on the relative minor." },
      { name: "Bassline", pattern: "i–v–iv–VII", description: "All minor until the VII cracks it open." },
      { name: "The Runner", pattern: "I–V–IV–V", description: "Never settles on the IV — keeps handing back to the V." },
    ],
  },
  {
    label: "Warm / Homely",
    items: [
      { name: "Porch Light", pattern: "I–IV–vi–iii", description: "Familiar folk opening that drifts to the minor side and stays there." },
      { name: "Old Friend", pattern: "I–iii–ii–V", description: "Stepwise walk down through the middle degrees." },
      { name: "Kitchen Table", pattern: "I–V–IV–vi", description: "The three chords everyone knows, with the relative minor as the way out." },
      { name: "Sunday Drive", pattern: "I–IV–ii–V–I–IV–V–I", description: "Eight bars of plain diatonic motion. Nothing surprising, which is the point." },
    ],
  },
  {
    label: "Unsettled / Restless",
    items: [
      { name: "Second Thoughts", pattern: "i–III–VII–iv", description: "Major III against a minor iv — can't decide which mode it lives in." },
      { name: "Pacing", pattern: "i–VI–iv–v", description: "The minor v instead of V removes the resolution entirely." },
      { name: "Loose Thread", pattern: "I–bIII–bVII–IV", description: "Three borrowed chords in a row. Familiar shape, wrong colours." },
      { name: "Can't Sit Still", pattern: "vi–III–IV–I", description: "The major III is the jolt; everything after it is recovery." },
    ],
  },
];
