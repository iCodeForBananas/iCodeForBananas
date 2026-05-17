// Decode Dash — phonics decoding word bank
// Level scale: 1.x = Kindergarten, 2.x = 1st Grade, 3.x = 2nd Grade, 4.x = 3rd Grade

export type TileType =
  | "consonant"
  | "vowel"
  | "blend"
  | "digraph"
  | "vowel-team"
  | "silent-e"
  | "r-vowel"
  | "suffix";

export type Tile = {
  text: string;
  type: TileType;
  isSilent?: boolean;
};

export type QuestionKind = "blend" | "complete" | "heart";

export type WordEntry = {
  id: string;
  word: string;
  tiles: Tile[];
  level: number;
  kind: QuestionKind;
  ruleLabel?: string;
  rule?: string;
  // blend/heart: the full word; complete: the missing pattern (e.g. "ai")
  answer: string;
  decoys: [string, string];
  // tile index after which to show a syllable-break dot (level 4)
  syllableSplit?: number;
};

// ── Tile constructors ────────────────────────────────────────────────────────
const c  = (t: string): Tile => ({ text: t, type: "consonant" });
const v  = (t: string): Tile => ({ text: t, type: "vowel" });
const bl = (t: string): Tile => ({ text: t, type: "blend" });
const dg = (t: string): Tile => ({ text: t, type: "digraph" });
const vt = (t: string): Tile => ({ text: t, type: "vowel-team" });
const se = (t: string): Tile => ({ text: t, type: "silent-e", isSilent: true });
const rv = (t: string): Tile => ({ text: t, type: "r-vowel" });

// ── Phoneme speech hints (for TTS) ──────────────────────────────────────────
export const PHONEME_SPEECH: Record<string, string> = {
  a: "aah", e: "eh", i: "ih", o: "awh", u: "uh",
  ai: "ay", ee: "ee", oa: "oh", ea: "ee", oo: "oo",
  ar: "ar", or: "or", er: "er", ir: "er", ur: "er",
  sh: "sh", ch: "ch", th: "th", wh: "wh",
  st: "st", cl: "cl", tr: "tr", bl: "bl", gr: "gr",
  fl: "fl", sl: "sl", dr: "dr", sn: "sn", sp: "sp",
  cr: "cr", fr: "fr", br: "br",
};

// ── Tile color classes ───────────────────────────────────────────────────────
export const TILE_BG: Record<TileType, string> = {
  consonant:    "bg-sky-600 border-sky-800 text-white",
  vowel:        "bg-amber-500 border-amber-700 text-white",
  blend:        "bg-violet-600 border-violet-800 text-white",
  digraph:      "bg-emerald-600 border-emerald-800 text-white",
  "vowel-team": "bg-rose-500 border-rose-700 text-white",
  "silent-e":   "bg-slate-600 border-slate-700 text-slate-300",
  "r-vowel":    "bg-teal-600 border-teal-800 text-white",
  suffix:       "bg-indigo-500 border-indigo-700 text-white",
};

export const TILE_LABELS: Record<TileType, string> = {
  consonant:    "C",
  vowel:        "V",
  blend:        "blend",
  digraph:      "digraph",
  "vowel-team": "team",
  "silent-e":   "silent",
  "r-vowel":    "r+vowel",
  suffix:       "ending",
};

// ── Progression constants ────────────────────────────────────────────────────
export const GRADES = ["Kindergarten", "1st Grade", "2nd Grade", "3rd Grade"] as const;
export type GradeName = (typeof GRADES)[number];

export const MIN_LEVEL    = 1.0;
export const MAX_LEVEL    = 5.0;
export const INITIAL_LEVEL = 1.2;

export const FIRST_TRY_BONUS = 0.06;
export const SECOND_TRY_BONUS = 0.03;
export const WRONG_PENALTY   = 0.12;
export const MASTERY_STREAK  = 3;
export const MASTERY_BONUS   = 0.15;

export function gradeIndexFromLevel(level: number): number {
  return Math.max(0, Math.min(GRADES.length - 1, Math.floor(level) - 1));
}
export function gradeNameFromLevel(level: number): GradeName {
  return GRADES[gradeIndexFromLevel(level)];
}
export function gradeProgress(level: number): number {
  return Math.max(0, Math.min(1, level - Math.floor(level)));
}
export function clampLevel(level: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
}

// ── Word bank ────────────────────────────────────────────────────────────────
export const WORD_BANK: WordEntry[] = [
  // ────────────────────────────────────────────────────────────────────────
  // LEVEL 1 — Kindergarten: 2–3 letter CVC, short vowels, m/a/t/s/i/b/n/o/g/d
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "k-at", word: "at", tiles: [v("a"), c("t")], level: 1.1, kind: "blend",
    ruleLabel: "Short A", rule: 'The letter A says "aah" — like the beginning of "apple"!',
    answer: "at", decoys: ["it", "on"],
  },
  {
    id: "k-it", word: "it", tiles: [v("i"), c("t")], level: 1.1, kind: "blend",
    ruleLabel: "Short I", rule: 'The letter I says "ih" — like the beginning of "itch"!',
    answer: "it", decoys: ["at", "on"],
  },
  {
    id: "k-on", word: "on", tiles: [v("o"), c("n")], level: 1.1, kind: "blend",
    ruleLabel: "Short O", rule: 'The letter O says "awh" — like the beginning of "octopus"!',
    answer: "on", decoys: ["an", "in"],
  },
  {
    id: "k-mat", word: "mat", tiles: [c("m"), v("a"), c("t")], level: 1.2, kind: "blend",
    ruleLabel: "Short A", rule: 'The letter A says "aah" — like the beginning of "apple"!',
    answer: "mat", decoys: ["mit", "mot"],
  },
  {
    id: "k-sat", word: "sat", tiles: [c("s"), v("a"), c("t")], level: 1.3, kind: "blend",
    ruleLabel: "Short A", rule: 'The letter A says "aah" — like the beginning of "apple"!',
    answer: "sat", decoys: ["sit", "set"],
  },
  {
    id: "k-sit", word: "sit", tiles: [c("s"), v("i"), c("t")], level: 1.3, kind: "blend",
    ruleLabel: "Short I", rule: 'The letter I says "ih" — like the beginning of "itch"!',
    answer: "sit", decoys: ["sat", "set"],
  },
  {
    id: "k-bit", word: "bit", tiles: [c("b"), v("i"), c("t")], level: 1.3, kind: "blend",
    ruleLabel: "Short I", rule: 'The letter I says "ih" — like the beginning of "itch"!',
    answer: "bit", decoys: ["bat", "bot"],
  },
  {
    id: "k-nod", word: "nod", tiles: [c("n"), v("o"), c("d")], level: 1.4, kind: "blend",
    ruleLabel: "Short O", rule: 'The letter O says "awh" — like the beginning of "octopus"!',
    answer: "nod", decoys: ["nab", "nit"],
  },
  {
    id: "k-got", word: "got", tiles: [c("g"), v("o"), c("t")], level: 1.4, kind: "blend",
    ruleLabel: "Short O", rule: 'The letter O says "awh" — like the beginning of "octopus"!',
    answer: "got", decoys: ["git", "gat"],
  },
  {
    id: "k-big", word: "big", tiles: [c("b"), v("i"), c("g")], level: 1.4, kind: "blend",
    ruleLabel: "Short I", rule: 'The letter I says "ih" — like the beginning of "itch"!',
    answer: "big", decoys: ["bag", "bog"],
  },
  {
    id: "k-dig", word: "dig", tiles: [c("d"), v("i"), c("g")], level: 1.5, kind: "blend",
    ruleLabel: "Short I", rule: 'The letter I says "ih" — like the beginning of "itch"!',
    answer: "dig", decoys: ["dab", "dog"],
  },
  {
    id: "k-man", word: "man", tiles: [c("m"), v("a"), c("n")], level: 1.5, kind: "blend",
    ruleLabel: "Short A", rule: 'The letter A says "aah" — like the beginning of "apple"!',
    answer: "man", decoys: ["men", "mon"],
  },
  {
    id: "k-mop", word: "mop", tiles: [c("m"), v("o"), c("p")], level: 1.5, kind: "blend",
    ruleLabel: "Short O", rule: 'The letter O says "awh" — like the beginning of "octopus"!',
    answer: "mop", decoys: ["map", "tip"],
  },
  {
    id: "k-tin", word: "tin", tiles: [c("t"), v("i"), c("n")], level: 1.6, kind: "blend",
    ruleLabel: "Short I", rule: 'The letter I says "ih" — like the beginning of "itch"!',
    answer: "tin", decoys: ["tan", "ton"],
  },
  {
    id: "k-top", word: "top", tiles: [c("t"), v("o"), c("p")], level: 1.6, kind: "blend",
    ruleLabel: "Short O", rule: 'The letter O says "awh" — like the beginning of "octopus"!',
    answer: "top", decoys: ["tap", "tip"],
  },
  {
    id: "k-bag", word: "bag", tiles: [c("b"), v("a"), c("g")], level: 1.6, kind: "blend",
    ruleLabel: "Short A", rule: 'The letter A says "aah" — like the beginning of "apple"!',
    answer: "bag", decoys: ["big", "bug"],
  },
  {
    id: "k-sob", word: "sob", tiles: [c("s"), v("o"), c("b")], level: 1.7, kind: "blend",
    ruleLabel: "Short O", rule: 'The letter O says "awh" — like the beginning of "octopus"!',
    answer: "sob", decoys: ["sab", "sub"],
  },
  {
    id: "k-dip", word: "dip", tiles: [c("d"), v("i"), c("p")], level: 1.7, kind: "blend",
    ruleLabel: "Short I", rule: 'The letter I says "ih" — like the beginning of "itch"!',
    answer: "dip", decoys: ["dam", "dog"],
  },
  {
    id: "k-sam", word: "Sam", tiles: [c("S"), v("a"), c("m")], level: 1.2, kind: "blend",
    ruleLabel: "Short A", rule: 'The letter A says "aah" — like the beginning of "apple"!',
    answer: "Sam", decoys: ["Sim", "Som"],
  },
  {
    id: "k-bob", word: "Bob", tiles: [c("B"), v("o"), c("b")], level: 1.4, kind: "blend",
    ruleLabel: "Short O", rule: 'The letter O says "awh" — like the beginning of "octopus"!',
    answer: "Bob", decoys: ["Bib", "Bab"],
  },
  // K heart words
  {
    id: "k-hw-a", word: "a", tiles: [v("a")], level: 1.3, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "a", decoys: ["i", "o"],
  },
  {
    id: "k-hw-the", word: "the", tiles: [c("t"), c("h"), v("e")], level: 1.5, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "the", decoys: ["she", "tee"],
  },

  // ────────────────────────────────────────────────────────────────────────
  // LEVEL 2 — 1st Grade: full CVC + consonant blends
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "g1-step", word: "step", tiles: [bl("st"), v("e"), c("p")], level: 2.1, kind: "blend",
    ruleLabel: "Blend ST", rule: "A blend is two consonants side by side — you still hear both sounds! ST = S + T.",
    answer: "step", decoys: ["stop", "skip"],
  },
  {
    id: "g1-clam", word: "clam", tiles: [bl("cl"), v("a"), c("m")], level: 2.2, kind: "blend",
    ruleLabel: "Blend CL", rule: "A blend is two consonants side by side — you still hear both sounds! CL = C + L.",
    answer: "clam", decoys: ["clap", "cram"],
  },
  {
    id: "g1-trip", word: "trip", tiles: [bl("tr"), v("i"), c("p")], level: 2.2, kind: "blend",
    ruleLabel: "Blend TR", rule: "A blend is two consonants side by side — you still hear both sounds! TR = T + R.",
    answer: "trip", decoys: ["trap", "drip"],
  },
  {
    id: "g1-flag", word: "flag", tiles: [bl("fl"), v("a"), c("g")], level: 2.3, kind: "blend",
    ruleLabel: "Blend FL", rule: "A blend is two consonants side by side — you still hear both sounds! FL = F + L.",
    answer: "flag", decoys: ["flat", "slug"],
  },
  {
    id: "g1-grin", word: "grin", tiles: [bl("gr"), v("i"), c("n")], level: 2.3, kind: "blend",
    ruleLabel: "Blend GR", rule: "A blend is two consonants side by side — you still hear both sounds! GR = G + R.",
    answer: "grin", decoys: ["grip", "trim"],
  },
  {
    id: "g1-stop", word: "stop", tiles: [bl("st"), v("o"), c("p")], level: 2.3, kind: "blend",
    ruleLabel: "Blend ST", rule: "A blend is two consonants side by side — you still hear both sounds! ST = S + T.",
    answer: "stop", decoys: ["step", "slot"],
  },
  {
    id: "g1-slid", word: "slid", tiles: [bl("sl"), v("i"), c("d")], level: 2.4, kind: "blend",
    ruleLabel: "Blend SL", rule: "A blend is two consonants side by side — you still hear both sounds! SL = S + L.",
    answer: "slid", decoys: ["slim", "sled"],
  },
  {
    id: "g1-drip", word: "drip", tiles: [bl("dr"), v("i"), c("p")], level: 2.4, kind: "blend",
    ruleLabel: "Blend DR", rule: "A blend is two consonants side by side — you still hear both sounds! DR = D + R.",
    answer: "drip", decoys: ["trip", "drop"],
  },
  {
    id: "g1-flat", word: "flat", tiles: [bl("fl"), v("a"), c("t")], level: 2.4, kind: "blend",
    ruleLabel: "Blend FL", rule: "A blend is two consonants side by side — you still hear both sounds! FL = F + L.",
    answer: "flat", decoys: ["flag", "slat"],
  },
  {
    id: "g1-snap", word: "snap", tiles: [bl("sn"), v("a"), c("p")], level: 2.5, kind: "blend",
    ruleLabel: "Blend SN", rule: "A blend is two consonants side by side — you still hear both sounds! SN = S + N.",
    answer: "snap", decoys: ["clap", "snag"],
  },
  {
    id: "g1-spin", word: "spin", tiles: [bl("sp"), v("i"), c("n")], level: 2.5, kind: "blend",
    ruleLabel: "Blend SP", rule: "A blend is two consonants side by side — you still hear both sounds! SP = S + P.",
    answer: "spin", decoys: ["spit", "slim"],
  },
  {
    id: "g1-crab", word: "crab", tiles: [bl("cr"), v("a"), c("b")], level: 2.5, kind: "blend",
    ruleLabel: "Blend CR", rule: "A blend is two consonants side by side — you still hear both sounds! CR = C + R.",
    answer: "crab", decoys: ["cram", "grab"],
  },
  {
    id: "g1-frog", word: "frog", tiles: [bl("fr"), v("o"), c("g")], level: 2.6, kind: "blend",
    ruleLabel: "Blend FR", rule: "A blend is two consonants side by side — you still hear both sounds! FR = F + R.",
    answer: "frog", decoys: ["from", "drop"],
  },
  {
    id: "g1-slug", word: "slug", tiles: [bl("sl"), v("u"), c("g")], level: 2.6, kind: "blend",
    ruleLabel: "Blend SL", rule: "A blend is two consonants side by side — you still hear both sounds! SL = S + L.",
    answer: "slug", decoys: ["slop", "drug"],
  },
  {
    id: "g1-brim", word: "brim", tiles: [bl("br"), v("i"), c("m")], level: 2.7, kind: "blend",
    ruleLabel: "Blend BR", rule: "A blend is two consonants side by side — you still hear both sounds! BR = B + R.",
    answer: "brim", decoys: ["trim", "grim"],
  },
  {
    id: "g1-blend", word: "blend", tiles: [bl("bl"), v("e"), c("n"), c("d")], level: 2.8, kind: "blend",
    ruleLabel: "Blend BL", rule: "A blend is two consonants side by side — you still hear both sounds! BL = B + L.",
    answer: "blend", decoys: ["blind", "blond"],
  },
  // 1st grade heart words
  {
    id: "g1-hw-said", word: "said", tiles: [c("s"), v("a"), v("i"), c("d")], level: 2.2, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "said", decoys: ["sand", "sled"],
  },
  {
    id: "g1-hw-was", word: "was", tiles: [c("w"), v("a"), c("s")], level: 2.3, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "was", decoys: ["has", "mad"],
  },
  {
    id: "g1-hw-they", word: "they", tiles: [c("t"), c("h"), v("e"), c("y")], level: 2.4, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "they", decoys: ["then", "when"],
  },
  {
    id: "g1-hw-have", word: "have", tiles: [c("h"), v("a"), c("v"), v("e")], level: 2.5, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "have", decoys: ["gave", "cave"],
  },

  // ────────────────────────────────────────────────────────────────────────
  // LEVEL 3 — 2nd Grade: digraphs, magic-E, vowel teams
  // ────────────────────────────────────────────────────────────────────────
  // Digraphs
  {
    id: "g2-ship", word: "ship", tiles: [dg("sh"), v("i"), c("p")], level: 3.1, kind: "blend",
    ruleLabel: "Digraph SH", rule: "A digraph is two letters that make ONE sound. SH says \"shhh\" — not S and H separately!",
    answer: "ship", decoys: ["chip", "whip"],
  },
  {
    id: "g2-chip", word: "chip", tiles: [dg("ch"), v("i"), c("p")], level: 3.2, kind: "blend",
    ruleLabel: "Digraph CH", rule: "A digraph is two letters that make ONE sound. CH says \"ch\" — like a train starting up!",
    answer: "chip", decoys: ["ship", "clip"],
  },
  {
    id: "g2-that", word: "that", tiles: [dg("th"), v("a"), c("t")], level: 3.2, kind: "blend",
    ruleLabel: "Digraph TH", rule: "A digraph is two letters that make ONE sound. TH says \"th\" — put your tongue between your teeth!",
    answer: "that", decoys: ["chat", "flat"],
  },
  {
    id: "g2-when", word: "when", tiles: [dg("wh"), v("e"), c("n")], level: 3.3, kind: "blend",
    ruleLabel: "Digraph WH", rule: "A digraph is two letters that make ONE sound. WH says \"wh\" — like blowing out a candle!",
    answer: "when", decoys: ["then", "shin"],
  },
  {
    id: "g2-shed", word: "shed", tiles: [dg("sh"), v("e"), c("d")], level: 3.3, kind: "blend",
    ruleLabel: "Digraph SH", rule: "A digraph is two letters that make ONE sound. SH says \"shhh\" — not S and H separately!",
    answer: "shed", decoys: ["sled", "chef"],
  },
  {
    id: "g2-chop", word: "chop", tiles: [dg("ch"), v("o"), c("p")], level: 3.4, kind: "blend",
    ruleLabel: "Digraph CH", rule: "A digraph is two letters that make ONE sound. CH says \"ch\" — like a train starting up!",
    answer: "chop", decoys: ["shop", "crop"],
  },
  {
    id: "g2-thin", word: "thin", tiles: [dg("th"), v("i"), c("n")], level: 3.4, kind: "blend",
    ruleLabel: "Digraph TH", rule: "A digraph is two letters that make ONE sound. TH says \"th\" — put your tongue between your teeth!",
    answer: "thin", decoys: ["shin", "chin"],
  },
  // Magic E (silent-e)
  {
    id: "g2-cake", word: "cake", tiles: [c("c"), v("a"), c("k"), se("e")], level: 3.3, kind: "blend",
    ruleLabel: "Magic E", rule: "The silent E at the end makes the vowel say its name! C-A-K-e = CAKE, the A says its name: \"ay\".",
    answer: "cake", decoys: ["coke", "kick"],
  },
  {
    id: "g2-bike", word: "bike", tiles: [c("b"), v("i"), c("k"), se("e")], level: 3.4, kind: "blend",
    ruleLabel: "Magic E", rule: "The silent E at the end makes the vowel say its name! B-I-K-e = BIKE, the I says its name: \"eye\".",
    answer: "bike", decoys: ["bake", "like"],
  },
  {
    id: "g2-home", word: "home", tiles: [c("h"), v("o"), c("m"), se("e")], level: 3.5, kind: "blend",
    ruleLabel: "Magic E", rule: "The silent E at the end makes the vowel say its name! H-O-M-e = HOME, the O says its name: \"oh\".",
    answer: "home", decoys: ["hope", "some"],
  },
  {
    id: "g2-tune", word: "tune", tiles: [c("t"), v("u"), c("n"), se("e")], level: 3.6, kind: "blend",
    ruleLabel: "Magic E", rule: "The silent E at the end makes the vowel say its name! T-U-N-e = TUNE, the U says its name: \"you\".",
    answer: "tune", decoys: ["tone", "dune"],
  },
  {
    id: "g2-lake", word: "lake", tiles: [c("l"), v("a"), c("k"), se("e")], level: 3.4, kind: "blend",
    ruleLabel: "Magic E", rule: "The silent E at the end makes the vowel say its name! L-A-K-e = LAKE, the A says its name: \"ay\".",
    answer: "lake", decoys: ["like", "lack"],
  },
  {
    id: "g2-pine", word: "pine", tiles: [c("p"), v("i"), c("n"), se("e")], level: 3.5, kind: "blend",
    ruleLabel: "Magic E", rule: "The silent E at the end makes the vowel say its name! P-I-N-e = PINE, the I says its name: \"eye\".",
    answer: "pine", decoys: ["pane", "mine"],
  },
  // complete: magic-E
  {
    id: "g2-comp-cake", word: "cake", tiles: [c("c"), v("a"), c("k"), se("e")], level: 3.4, kind: "complete",
    ruleLabel: "Magic E", rule: "Add a silent E to the end — it makes the vowel say its name!",
    answer: "e", decoys: ["s", "r"],
  },
  {
    id: "g2-comp-pine", word: "pine", tiles: [c("p"), v("i"), c("n"), se("e")], level: 3.5, kind: "complete",
    ruleLabel: "Magic E", rule: "Add a silent E to the end — it makes the vowel say its name!",
    answer: "e", decoys: ["d", "r"],
  },
  // Vowel teams
  {
    id: "g2-rain", word: "rain", tiles: [c("r"), vt("ai"), c("n")], level: 3.5, kind: "blend",
    ruleLabel: "Vowel Team AI", rule: "When two vowels go walking, the first one does the talking! AI says \"ay\" — like in \"rain\".",
    answer: "rain", decoys: ["ruin", "ran"],
  },
  {
    id: "g2-seed", word: "seed", tiles: [c("s"), vt("ee"), c("d")], level: 3.5, kind: "blend",
    ruleLabel: "Vowel Team EE", rule: "EE together say the long E sound — \"eee\" — like in \"seed\"!",
    answer: "seed", decoys: ["said", "sled"],
  },
  {
    id: "g2-coat", word: "coat", tiles: [c("c"), vt("oa"), c("t")], level: 3.6, kind: "blend",
    ruleLabel: "Vowel Team OA", rule: "OA together say the long O sound — \"oh\" — like in \"coat\"!",
    answer: "coat", decoys: ["cot", "cute"],
  },
  {
    id: "g2-team", word: "team", tiles: [c("t"), vt("ea"), c("m")], level: 3.6, kind: "blend",
    ruleLabel: "Vowel Team EA", rule: "EA together often say the long E sound — \"ee\" — like in \"team\"!",
    answer: "team", decoys: ["tame", "trim"],
  },
  {
    id: "g2-sail", word: "sail", tiles: [c("s"), vt("ai"), c("l")], level: 3.7, kind: "blend",
    ruleLabel: "Vowel Team AI", rule: "When two vowels go walking, the first one does the talking! AI says \"ay\" — like in \"sail\".",
    answer: "sail", decoys: ["soil", "sell"],
  },
  {
    id: "g2-feet", word: "feet", tiles: [c("f"), vt("ee"), c("t")], level: 3.7, kind: "blend",
    ruleLabel: "Vowel Team EE", rule: "EE together say the long E sound — \"eee\" — like in \"feet\"!",
    answer: "feet", decoys: ["felt", "flat"],
  },
  {
    id: "g2-dream", word: "dream", tiles: [bl("dr"), vt("ea"), c("m")], level: 3.8, kind: "blend",
    ruleLabel: "Blend + Vowel Team", rule: "DR blend + EA vowel team — two patterns in one word!",
    answer: "dream", decoys: ["cream", "dread"],
  },
  // complete: vowel teams
  {
    id: "g2-comp-rain", word: "rain", tiles: [c("r"), vt("ai"), c("n")], level: 3.6, kind: "complete",
    ruleLabel: "Vowel Team AI", rule: "AI goes in the middle of a word to make the long A sound!",
    answer: "ai", decoys: ["ay", "ae"],
  },
  {
    id: "g2-comp-coat", word: "coat", tiles: [c("c"), vt("oa"), c("t")], level: 3.7, kind: "complete",
    ruleLabel: "Vowel Team OA", rule: "OA goes in the middle of a word to make the long O sound!",
    answer: "oa", decoys: ["oe", "oo"],
  },
  // 2nd grade heart words
  {
    id: "g2-hw-could", word: "could", tiles: [c("c"), v("o"), v("u"), c("l"), c("d")], level: 3.3, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "could", decoys: ["would", "cold"],
  },
  {
    id: "g2-hw-would", word: "would", tiles: [c("w"), v("o"), v("u"), c("l"), c("d")], level: 3.4, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "would", decoys: ["could", "bold"],
  },
  {
    id: "g2-hw-should", word: "should", tiles: [dg("sh"), v("o"), v("u"), c("l"), c("d")], level: 3.5, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "should", decoys: ["could", "shout"],
  },
  {
    id: "g2-hw-because", word: "because", tiles: [c("b"), v("e"), c("c"), v("a"), v("u"), c("s"), v("e")], level: 3.6, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "because", decoys: ["became", "before"],
  },

  // ────────────────────────────────────────────────────────────────────────
  // LEVEL 4 — 3rd Grade: r-controlled vowels + multi-syllable
  // ────────────────────────────────────────────────────────────────────────
  // R-controlled
  {
    id: "g3-farm", word: "farm", tiles: [c("f"), rv("ar"), c("m")], level: 4.1, kind: "blend",
    ruleLabel: "R-Controlled AR", rule: "When a vowel is followed by R, the R changes the vowel's sound! AR says \"ar\" — like in \"farm\".",
    answer: "farm", decoys: ["firm", "form"],
  },
  {
    id: "g3-horn", word: "horn", tiles: [c("h"), rv("or"), c("n")], level: 4.2, kind: "blend",
    ruleLabel: "R-Controlled OR", rule: "When a vowel is followed by R, the R changes the vowel's sound! OR says \"or\" — like in \"horn\".",
    answer: "horn", decoys: ["burn", "barn"],
  },
  {
    id: "g3-fern", word: "fern", tiles: [c("f"), rv("er"), c("n")], level: 4.2, kind: "blend",
    ruleLabel: "R-Controlled ER", rule: "ER, IR, and UR all make the same sound — \"er\" like in \"fern\"!",
    answer: "fern", decoys: ["farm", "torn"],
  },
  {
    id: "g3-bird", word: "bird", tiles: [c("b"), rv("ir"), c("d")], level: 4.3, kind: "blend",
    ruleLabel: "R-Controlled IR", rule: "ER, IR, and UR all make the same sound — \"er\" like in \"bird\"!",
    answer: "bird", decoys: ["bard", "herd"],
  },
  {
    id: "g3-burn", word: "burn", tiles: [c("b"), rv("ur"), c("n")], level: 4.3, kind: "blend",
    ruleLabel: "R-Controlled UR", rule: "ER, IR, and UR all make the same sound — \"er\" like in \"burn\"!",
    answer: "burn", decoys: ["born", "barn"],
  },
  {
    id: "g3-star", word: "star", tiles: [bl("st"), rv("ar")], level: 4.4, kind: "blend",
    ruleLabel: "Blend + R-Controlled", rule: "ST blend + AR r-controlled vowel — two patterns in one word!",
    answer: "star", decoys: ["stir", "scar"],
  },
  {
    id: "g3-corn", word: "corn", tiles: [c("c"), rv("or"), c("n")], level: 4.4, kind: "blend",
    ruleLabel: "R-Controlled OR", rule: "When a vowel is followed by R, the R changes the vowel's sound! OR says \"or\" — like in \"corn\".",
    answer: "corn", decoys: ["curl", "cart"],
  },
  // complete: r-controlled
  {
    id: "g3-comp-farm", word: "farm", tiles: [c("f"), rv("ar"), c("m")], level: 4.3, kind: "complete",
    ruleLabel: "R-Controlled AR", rule: "AR goes in the middle to make the \"ar\" sound — like in \"farm\"!",
    answer: "ar", decoys: ["or", "er"],
  },
  {
    id: "g3-comp-horn", word: "horn", tiles: [c("h"), rv("or"), c("n")], level: 4.4, kind: "complete",
    ruleLabel: "R-Controlled OR", rule: "OR goes in the middle to make the \"or\" sound — like in \"horn\"!",
    answer: "or", decoys: ["ar", "ur"],
  },
  // Multi-syllable
  {
    id: "g3-farmer", word: "farmer", tiles: [c("f"), rv("ar"), c("m"), rv("er")], level: 4.4, kind: "blend",
    ruleLabel: "Two Syllables: far•mer", rule: "This word has TWO syllables! Sound out each part: \"far\" + \"mer\" = farmer.",
    answer: "farmer", decoys: ["corner", "summer"], syllableSplit: 2,
  },
  {
    id: "g3-corner", word: "corner", tiles: [c("c"), rv("or"), c("n"), rv("er")], level: 4.5, kind: "blend",
    ruleLabel: "Two Syllables: cor•ner", rule: "This word has TWO syllables! Sound out each part: \"cor\" + \"ner\" = corner.",
    answer: "corner", decoys: ["farmer", "harbor"], syllableSplit: 2,
  },
  {
    id: "g3-purple", word: "purple", tiles: [c("p"), rv("ur"), c("p"), c("l"), v("e")], level: 4.5, kind: "blend",
    ruleLabel: "Two Syllables: pur•ple", rule: "This word has TWO syllables! Sound out each part: \"pur\" + \"ple\" = purple.",
    answer: "purple", decoys: ["marble", "circle"], syllableSplit: 2,
  },
  {
    id: "g3-garden", word: "garden", tiles: [c("g"), rv("ar"), c("d"), v("e"), c("n")], level: 4.6, kind: "blend",
    ruleLabel: "Two Syllables: gar•den", rule: "This word has TWO syllables! Sound out each part: \"gar\" + \"den\" = garden.",
    answer: "garden", decoys: ["pardon", "warden"], syllableSplit: 2,
  },
  {
    id: "g3-sister", word: "sister", tiles: [c("s"), v("i"), c("s"), c("t"), rv("er")], level: 4.6, kind: "blend",
    ruleLabel: "Two Syllables: sis•ter", rule: "This word has TWO syllables! Sound out each part: \"sis\" + \"ter\" = sister.",
    answer: "sister", decoys: ["mister", "winter"], syllableSplit: 3,
  },
  {
    id: "g3-market", word: "market", tiles: [c("m"), rv("ar"), c("k"), v("e"), c("t")], level: 4.7, kind: "blend",
    ruleLabel: "Two Syllables: mar•ket", rule: "This word has TWO syllables! Sound out each part: \"mar\" + \"ket\" = market.",
    answer: "market", decoys: ["rocket", "basket"], syllableSplit: 2,
  },
  {
    id: "g3-sunset", word: "sunset", tiles: [c("s"), v("u"), c("n"), c("s"), v("e"), c("t")], level: 4.7, kind: "blend",
    ruleLabel: "Two Syllables: sun•set", rule: "This word has TWO syllables! Sound out each part: \"sun\" + \"set\" = sunset.",
    answer: "sunset", decoys: ["sunlit", "onset"], syllableSplit: 3,
  },
  {
    id: "g3-perfect", word: "perfect", tiles: [c("p"), rv("er"), c("f"), v("e"), c("c"), c("t")], level: 4.8, kind: "blend",
    ruleLabel: "Two Syllables: per•fect", rule: "This word has TWO syllables! Sound out each part: \"per\" + \"fect\" = perfect.",
    answer: "perfect", decoys: ["protect", "parrot"], syllableSplit: 2,
  },
  {
    id: "g3-harvest", word: "harvest", tiles: [c("h"), rv("ar"), c("v"), v("e"), bl("st")], level: 4.8, kind: "blend",
    ruleLabel: "Two Syllables: har•vest", rule: "This word has TWO syllables! Sound out each part: \"har\" + \"vest\" = harvest.",
    answer: "harvest", decoys: ["hardest", "largest"], syllableSplit: 2,
  },
  // 3rd grade heart words
  {
    id: "g3-hw-through", word: "through", tiles: [dg("th"), c("r"), vt("ough")], level: 4.2, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "through", decoys: ["though", "throw"],
  },
  {
    id: "g3-hw-though", word: "though", tiles: [dg("th"), vt("ough")], level: 4.3, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "though", decoys: ["through", "thought"],
  },
  {
    id: "g3-hw-enough", word: "enough", tiles: [v("e"), c("n"), vt("ough")], level: 4.5, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "enough", decoys: ["though", "rough"],
  },
  {
    id: "g3-hw-answer", word: "answer", tiles: [v("a"), c("n"), dg("sw"), v("e"), c("r")], level: 4.6, kind: "heart",
    ruleLabel: "Heart Word", rule: "Heart words are special — we memorize them, not sound them out! ❤️",
    answer: "answer", decoys: ["winter", "corner"],
  },
];

// ── Question picker ──────────────────────────────────────────────────────────
export function pickWord(level: number, recentIds: string[]): WordEntry {
  for (const band of [0.25, 0.5, 1.0, 2.0]) {
    const fresh = WORD_BANK.filter(
      (w) => Math.abs(w.level - level) <= band && !recentIds.includes(w.id),
    );
    if (fresh.length > 0) return fresh[Math.floor(Math.random() * fresh.length)];
  }
  return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
}
