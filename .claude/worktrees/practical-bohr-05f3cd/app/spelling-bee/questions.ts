// =====================================================================
// Spelling Bee — adaptive progression matrix
// =====================================================================
// Skill scale: continuous 0.0–7.0
//   0.x = Pre-K   1.x = Kindergarten   2.x = 1st   3.x = 2nd
//   4.x = 3rd     5.x = 4th             6.x = 5th
//
// Each Question has a subject, skill, and a precise `level`. The engine
// picks questions near the player's current level and nudges that level
// up on correct answers (small bumps + mastery bonus on streaks) and
// down on wrong answers. Add more questions by appending entries to
// QUESTION_BANK below — no engine changes needed.

export const GRADES = [
  'Pre-K',
  'Kindergarten',
  '1st Grade',
  '2nd Grade',
  '3rd Grade',
  '4th Grade',
  '5th Grade',
] as const;

export const MIN_LEVEL = 0;
export const MAX_LEVEL = 7;
export const INITIAL_LEVEL = 0.4;

// Adaptive deltas — applied per question outcome.
export const FIRST_TRY_BONUS = 0.05;
export const SECOND_TRY_BONUS = 0.025;
export const WRONG_PENALTY = 0.1;
export const MASTERY_STREAK = 3;
export const MASTERY_BONUS = 0.15;

export type QuestionPrompt =
  | { kind: 'letter'; letter: string; case: 'upper' | 'lower' }
  | { kind: 'emoji'; emoji: string; instruction: string }
  | { kind: 'text'; text: string; instruction: string };

export type Question = {
  id: string;
  subject: string; // top-level category: "reading", "spelling", "vocabulary", "grammar", "math", ...
  skill: string;   // sub-skill: "letter-recognition", "syllables", "rhyming", "short-a", ...
  level: number;   // 0.0–7.0
  answer: string;
  decoys: [string, string];
} & QuestionPrompt;

export function gradeIndexFromLevel(level: number): number {
  return Math.max(0, Math.min(GRADES.length - 1, Math.floor(level)));
}

export function gradeNameFromLevel(level: number): string {
  return GRADES[gradeIndexFromLevel(level)];
}

export function gradeProgress(level: number): number {
  return Math.max(0, Math.min(1, level - Math.floor(level)));
}

export function clampLevel(level: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
}

export function pickQuestion(level: number, recentIds: string[], subjects?: string[]): Question {
  const matchesSubject = (q: Question) =>
    !subjects || subjects.length === 0 || subjects.includes(q.subject);

  for (const band of [0.25, 0.5, 1.0, 2.0]) {
    const fresh = QUESTION_BANK.filter(
      q => Math.abs(q.level - level) <= band && !recentIds.includes(q.id) && matchesSubject(q),
    );
    if (fresh.length > 0) return fresh[Math.floor(Math.random() * fresh.length)];
  }
  const subjectPool = QUESTION_BANK.filter(matchesSubject);
  const pool = subjectPool.length > 0 ? subjectPool : QUESTION_BANK;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------------
// Helpers for building questions concisely
// ---------------------------------------------------------------------

const L = (letter: string, casing: 'upper' | 'lower', decoys: [string, string], level: number, skill = 'letter-recognition'): Question => ({
  id: `let-${casing}-${letter}-${skill}`,
  subject: 'reading',
  skill,
  level,
  kind: 'letter',
  letter,
  case: casing,
  answer: letter,
  decoys,
});

const E = (emoji: string, word: string, decoys: [string, string], level: number, instruction = 'What is this?', skill = 'word-image-match', subject = 'spelling'): Question => ({
  id: `emo-${word}-${skill}`,
  subject,
  skill,
  level,
  kind: 'emoji',
  emoji,
  instruction,
  answer: word,
  decoys,
});

const T = (id: string, text: string, instruction: string, answer: string, decoys: [string, string], level: number, skill: string, subject = 'reading'): Question => ({
  id: `txt-${id}`,
  subject,
  skill,
  level,
  kind: 'text',
  text,
  instruction,
  answer,
  decoys,
});

// =====================================================================
// QUESTION BANK
// =====================================================================
export const QUESTION_BANK: Question[] = [
  // ===================================================================
  // Pre-K & K Letter Recognition (levels 0.3–0.9)
  // Syllabus: A–E (Learn letters, Letter identification, Lower/upper match)
  // ===================================================================
  // Uppercase shape recognition
  L('A', 'upper', ['H', 'V'], 0.3),
  L('B', 'upper', ['D', 'P'], 0.3),
  L('C', 'upper', ['G', 'O'], 0.3),
  L('D', 'upper', ['B', 'P'], 0.3),
  L('E', 'upper', ['F', 'B'], 0.35),
  L('F', 'upper', ['E', 'P'], 0.35),
  L('G', 'upper', ['C', 'Q'], 0.35),
  L('H', 'upper', ['N', 'M'], 0.35),
  L('I', 'upper', ['L', 'T'], 0.4),
  L('J', 'upper', ['I', 'L'], 0.4),
  L('K', 'upper', ['R', 'X'], 0.4),
  L('L', 'upper', ['I', 'T'], 0.4),
  L('M', 'upper', ['N', 'W'], 0.45),
  L('N', 'upper', ['M', 'H'], 0.45),
  L('O', 'upper', ['Q', 'C'], 0.45),
  L('P', 'upper', ['F', 'R'], 0.45),
  L('Q', 'upper', ['O', 'G'], 0.5),
  L('R', 'upper', ['P', 'B'], 0.5),
  L('S', 'upper', ['Z', 'C'], 0.5),
  L('T', 'upper', ['I', 'L'], 0.5),
  L('U', 'upper', ['V', 'Y'], 0.55),
  L('V', 'upper', ['U', 'Y'], 0.55),
  L('W', 'upper', ['M', 'V'], 0.55),
  L('X', 'upper', ['K', 'Y'], 0.55),
  L('Y', 'upper', ['V', 'X'], 0.6),
  L('Z', 'upper', ['S', 'N'], 0.6),

  // Lowercase shape recognition
  L('a', 'lower', ['e', 'o'], 0.6),
  L('b', 'lower', ['d', 'p'], 0.65),
  L('c', 'lower', ['e', 'o'], 0.6),
  L('d', 'lower', ['b', 'p'], 0.65),
  L('e', 'lower', ['c', 'a'], 0.6),
  L('f', 'lower', ['t', 'l'], 0.7),
  L('g', 'lower', ['q', 'p'], 0.7),
  L('h', 'lower', ['n', 'k'], 0.7),
  L('i', 'lower', ['j', 'l'], 0.65),
  L('j', 'lower', ['i', 'l'], 0.7),
  L('k', 'lower', ['h', 'l'], 0.7),
  L('l', 'lower', ['i', 't'], 0.7),
  L('m', 'lower', ['n', 'w'], 0.75),
  L('n', 'lower', ['m', 'h'], 0.75),
  L('o', 'lower', ['c', 'a'], 0.65),
  L('p', 'lower', ['q', 'b'], 0.75),
  L('q', 'lower', ['p', 'g'], 0.8),
  L('r', 'lower', ['n', 'h'], 0.75),
  L('s', 'lower', ['z', 'c'], 0.75),
  L('t', 'lower', ['l', 'f'], 0.8),
  L('u', 'lower', ['v', 'n'], 0.8),
  L('v', 'lower', ['u', 'y'], 0.8),
  L('w', 'lower', ['m', 'v'], 0.85),
  L('x', 'lower', ['k', 'y'], 0.85),
  L('y', 'lower', ['v', 'g'], 0.85),
  L('z', 'lower', ['s', 'n'], 0.85),

  // ===================================================================
  // K Week 1: Syllable counting + book parts
  // ===================================================================
  T('syl-cat',      'cat',      'How many syllables?', '1', ['2', '3'], 1.05, 'syllables'),
  T('syl-apple',    'apple',    'How many syllables?', '2', ['1', '3'], 1.05, 'syllables'),
  T('syl-banana',   'banana',   'How many syllables?', '3', ['2', '4'], 1.08, 'syllables'),
  T('syl-elephant', 'elephant', 'How many syllables?', '3', ['2', '4'], 1.10, 'syllables'),
  T('syl-butterfly','butterfly','How many syllables?', '3', ['4', '2'], 1.12, 'syllables'),
  T('syl-dog',      'dog',      'How many syllables?', '1', ['2', '3'], 1.05, 'syllables'),
  T('syl-pizza',    'pizza',    'How many syllables?', '2', ['1', '3'], 1.06, 'syllables'),
  T('syl-dinosaur', 'dinosaur', 'How many syllables?', '3', ['4', '2'], 1.15, 'syllables'),

  T('book-cover',  'Where is the title?',    'Pick the part of a book.', 'cover',     ['spine', 'page'],   1.05, 'book-parts'),
  T('book-author', 'Who wrote it?',          'Pick the part of a book.', 'author',    ['title', 'page'],   1.07, 'book-parts'),
  T('book-illust', 'Who drew the pictures?', 'Pick the part of a book.', 'illustrator',['author','editor'],1.10, 'book-parts'),

  // ===================================================================
  // K Weeks 2–3: Uppercase letter case-matching (review subgroups)
  // (existing uppercase shape questions are reused via the picker.)
  // ===================================================================
  // Frequently-confused uppercase pairs (week 7 review)
  L('B', 'upper', ['D', 'R'], 1.10, 'confused-letters'),
  L('D', 'upper', ['B', 'P'], 1.10, 'confused-letters'),
  L('P', 'upper', ['F', 'R'], 1.12, 'confused-letters'),
  L('M', 'upper', ['W', 'N'], 1.12, 'confused-letters'),
  L('W', 'upper', ['M', 'V'], 1.14, 'confused-letters'),

  // ===================================================================
  // K Week 3: Adjectives — comparing pictures
  // ===================================================================
  T('adj-bigger',  '🐘  vs  🐭', 'Which is bigger?',   'elephant', ['mouse', 'ant'],   1.10, 'adjectives', 'vocabulary'),
  T('adj-smaller', '🐜  vs  🐘', 'Which is smaller?',  'ant',      ['elephant','dog'], 1.10, 'adjectives', 'vocabulary'),
  T('adj-taller',  '🦒  vs  🐢', 'Which is taller?',   'giraffe',  ['turtle','frog'],  1.12, 'adjectives', 'vocabulary'),
  T('adj-faster',  '🐇  vs  🐢', 'Which is faster?',   'rabbit',   ['turtle','snail'], 1.12, 'adjectives', 'vocabulary'),
  T('adj-hot',     '☀️  vs  ❄️', 'Which one is hot?',  'sun',      ['ice','snow'],     1.14, 'adjectives', 'vocabulary'),
  T('adj-cold',    '❄️  vs  ☀️', 'Which one is cold?', 'ice',      ['sun','fire'],     1.14, 'adjectives', 'vocabulary'),

  // Same-ending words (rhyming family) — week 2/3
  T('ending-cat',  'cat', 'Same ending sound?', 'hat', ['dog','sun'], 1.08, 'word-endings'),
  T('ending-dog',  'dog', 'Same ending sound?', 'log', ['cat','sun'], 1.08, 'word-endings'),
  T('ending-pig',  'pig', 'Same ending sound?', 'wig', ['bat','sun'], 1.10, 'word-endings'),
  T('ending-bun',  'bun', 'Same ending sound?', 'sun', ['cat','dog'], 1.10, 'word-endings'),

  // Same words (matching) — week 2
  T('match-the',   'the',   'Pick the matching word.', 'the',   ['he','she'],   1.07, 'word-match'),
  T('match-cat',   'cat',   'Pick the matching word.', 'cat',   ['cot','cab'],  1.05, 'word-match'),
  T('match-jump',  'jump',  'Pick the matching word.', 'jump',  ['bump','jam'], 1.10, 'word-match'),
  T('match-play',  'play',  'Pick the matching word.', 'play',  ['pray','plum'],1.10, 'word-match'),

  // ===================================================================
  // K Week 4–5: Lowercase letter case-matching
  // (existing lowercase shape questions are reused by picker.)
  // Frequently-confused lowercase pairs
  // ===================================================================
  L('b', 'lower', ['d', 'p'], 1.18, 'confused-letters'),
  L('d', 'lower', ['b', 'q'], 1.18, 'confused-letters'),
  L('p', 'lower', ['q', 'b'], 1.20, 'confused-letters'),
  L('q', 'lower', ['p', 'g'], 1.20, 'confused-letters'),
  L('m', 'lower', ['n', 'w'], 1.18, 'confused-letters'),
  L('w', 'lower', ['m', 'v'], 1.20, 'confused-letters'),
  L('n', 'lower', ['m', 'h'], 1.18, 'confused-letters'),

  // Picture rhyming
  T('rhyme-cat',  'cat',  'Which rhymes with this?', 'hat',  ['dog','bee'],  1.13, 'rhyming'),
  T('rhyme-dog',  'dog',  'Which rhymes with this?', 'log',  ['cat','sun'],  1.13, 'rhyming'),
  T('rhyme-bee',  'bee',  'Which rhymes with this?', 'tree', ['fish','dog'], 1.15, 'rhyming'),
  T('rhyme-star', 'star', 'Which rhymes with this?', 'car',  ['moon','tree'],1.16, 'rhyming'),
  T('rhyme-cake', 'cake', 'Which rhymes with this?', 'lake', ['cup','book'], 1.16, 'rhyming'),

  // Reality vs fantasy
  T('real-cat-naps',     'A cat takes a nap.',         'Could really happen?', 'yes', ['no', 'maybe'], 1.18, 'reality-vs-fantasy', 'reading'),
  T('real-dog-drives',   'A dog drives a bus.',        'Could really happen?', 'no',  ['yes','maybe'], 1.18, 'reality-vs-fantasy', 'reading'),
  T('real-fish-swims',   'A fish swims in water.',     'Could really happen?', 'yes', ['no','maybe'],  1.18, 'reality-vs-fantasy', 'reading'),
  T('real-pig-flies',    'A pig flies to the moon.',   'Could really happen?', 'no',  ['yes','maybe'], 1.20, 'reality-vs-fantasy', 'reading'),

  // Sentence spacing
  T('space-iam',    'I am happy.',  'Which is spaced right?', 'I am happy.',  ['Iamhappy.', 'I a m h a p p y.'], 1.20, 'sentence-spacing', 'grammar'),
  T('space-cat',    'The cat naps.','Which is spaced right?', 'The cat naps.',['Thecatnaps.', 'The c a t naps.'],1.20, 'sentence-spacing', 'grammar'),

  // Location words (week 5, 7)
  T('loc-inside',   '🐈 in 📦', 'Where is the cat?',   'inside', ['outside','above'],  1.18, 'location-words', 'vocabulary'),
  T('loc-above',    '🌞 over 🏠', 'Where is the sun?',  'above',  ['below','beside'],  1.20, 'location-words', 'vocabulary'),
  T('loc-below',    '🐠 under 🚤', 'Where is the fish?', 'below',  ['above','next to'], 1.20, 'location-words', 'vocabulary'),
  T('loc-beside',   '🐕 ↔ 🐈', 'Where is the dog?',   'next to',['above','below'],   1.22, 'location-words', 'vocabulary'),

  // ===================================================================
  // K Week 6–9: Letter–sound association, blending, beginning sounds
  // ===================================================================
  T('cs-b', 'buh',  'Which letter says this sound?', 'b', ['d','p'], 1.22, 'consonant-sounds'),
  T('cs-d', 'duh',  'Which letter says this sound?', 'd', ['b','t'], 1.22, 'consonant-sounds'),
  T('cs-j', 'juh',  'Which letter says this sound?', 'j', ['g','y'], 1.24, 'consonant-sounds'),
  T('cs-k', 'kuh',  'Which letter says this sound?', 'k', ['c','q'], 1.24, 'consonant-sounds'),
  T('cs-p', 'puh',  'Which letter says this sound?', 'p', ['b','t'], 1.24, 'consonant-sounds'),
  T('cs-t', 'tuh',  'Which letter says this sound?', 't', ['d','p'], 1.24, 'consonant-sounds'),
  T('cs-v', 'vuh',  'Which letter says this sound?', 'v', ['f','w'], 1.26, 'consonant-sounds'),
  T('cs-z', 'zzz',  'Which letter says this sound?', 'z', ['s','x'], 1.26, 'consonant-sounds'),
  T('cs-f', 'fff',  'Which letter says this sound?', 'f', ['v','s'], 1.28, 'consonant-sounds'),
  T('cs-l', 'lll',  'Which letter says this sound?', 'l', ['r','w'], 1.28, 'consonant-sounds'),
  T('cs-m', 'mmm',  'Which letter says this sound?', 'm', ['n','w'], 1.28, 'consonant-sounds'),
  T('cs-n', 'nnn',  'Which letter says this sound?', 'n', ['m','h'], 1.28, 'consonant-sounds'),
  T('cs-r', 'rrr',  'Which letter says this sound?', 'r', ['l','w'], 1.30, 'consonant-sounds'),
  T('cs-s', 'sss',  'Which letter says this sound?', 's', ['z','c'], 1.30, 'consonant-sounds'),
  T('cs-c', 'kuh',  'Hard "kuh" — which letter?',     'c', ['k','g'], 1.32, 'consonant-sounds'),
  T('cs-g', 'guh',  'Which letter says this sound?', 'g', ['j','q'], 1.32, 'consonant-sounds'),
  T('cs-h', 'huh',  'Which letter says this sound?', 'h', ['n','f'], 1.32, 'consonant-sounds'),
  T('cs-w', 'wuh',  'Which letter says this sound?', 'w', ['v','y'], 1.32, 'consonant-sounds'),

  // Blending — onset + rime
  T('blend-c-at', 'c + at', 'Blend it together.',     'cat', ['cot','cut'], 1.26, 'sound-blending'),
  T('blend-d-og', 'd + og', 'Blend it together.',     'dog', ['dig','dug'], 1.26, 'sound-blending'),
  T('blend-s-un', 's + un', 'Blend it together.',     'sun', ['son','sin'], 1.26, 'sound-blending'),
  T('blend-h-at', 'h + at', 'Blend it together.',     'hat', ['hot','hit'], 1.26, 'sound-blending'),
  T('blend-b-ig', 'b + ig', 'Blend it together.',     'big', ['bag','bug'], 1.28, 'sound-blending'),
  T('blend-cat-syl', 'pic + nic', 'Blend the syllables.', 'picnic', ['picture','panic'], 1.30, 'syllable-blending'),
  T('blend-baby-syl','ba + by',    'Blend the syllables.', 'baby',   ['bay','bobby'],     1.30, 'syllable-blending'),

  // Phoneme segmentation
  T('seg-cat-c',   'cat', 'What is the FIRST sound?', 'c', ['a','t'], 1.28, 'phoneme-segmentation'),
  T('seg-cat-a',   'cat', 'What is the MIDDLE sound?','a', ['c','t'], 1.30, 'phoneme-segmentation'),
  T('seg-cat-t',   'cat', 'What is the LAST sound?',  't', ['c','a'], 1.30, 'phoneme-segmentation'),
  T('seg-dog-d',   'dog', 'What is the FIRST sound?', 'd', ['o','g'], 1.28, 'phoneme-segmentation'),
  T('seg-dog-g',   'dog', 'What is the LAST sound?',  'g', ['d','o'], 1.30, 'phoneme-segmentation'),
  T('seg-sun-s',   'sun', 'What is the FIRST sound?', 's', ['u','n'], 1.28, 'phoneme-segmentation'),
  T('seg-sun-n',   'sun', 'What is the LAST sound?',  'n', ['s','u'], 1.30, 'phoneme-segmentation'),
  T('seg-fish-sh', 'fish','What is the LAST sound?',  'sh', ['f','i'], 1.32, 'phoneme-segmentation'),

  // Categories
  T('cat-fruit',  '🍎 🐶 🚗', 'Which is a fruit?',     'apple', ['dog','car'],   1.20, 'categories', 'vocabulary'),
  T('cat-animal', '🐶 🚗 🍎', 'Which is an animal?',   'dog',   ['car','apple'], 1.20, 'categories', 'vocabulary'),
  T('cat-vehicle','🚗 🍎 🐶', 'Which is a vehicle?',   'car',   ['apple','dog'], 1.22, 'categories', 'vocabulary'),
  T('cat-color',  'red, dog, cat',   'Which is a color?',     'red',   ['dog','cat'],   1.22, 'categories', 'vocabulary'),
  T('cat-shape',  'circle, run, jump','Which is a shape?',    'circle',['run','jump'],  1.24, 'categories', 'vocabulary'),

  // Beginning sounds — week 8
  T('begin-sun', 'sun', 'Same starting sound?', 'soap', ['cat','dog'], 1.32, 'beginning-sounds'),
  T('begin-cat', 'cat', 'Same starting sound?', 'cup',  ['sun','dog'], 1.32, 'beginning-sounds'),
  T('begin-dog', 'dog', 'Same starting sound?', 'duck', ['cat','sun'], 1.32, 'beginning-sounds'),
  T('begin-bee', 'bee', 'Same starting sound?', 'bat',  ['dog','sun'], 1.34, 'beginning-sounds'),

  // Find the word that begins with a sound
  T('start-b', '/b/', 'Which word starts with this sound?', 'bee',  ['cat','dog'], 1.30, 'beginning-sounds'),
  T('start-s', '/s/', 'Which word starts with this sound?', 'sun',  ['hat','dog'], 1.30, 'beginning-sounds'),
  T('start-d', '/d/', 'Which word starts with this sound?', 'dog',  ['cat','bee'], 1.30, 'beginning-sounds'),
  T('start-m', '/m/', 'Which word starts with this sound?', 'moon', ['sun','cat'], 1.32, 'beginning-sounds'),

  // First letter of word — week 9
  T('first-cat', 'cat',  'Which letter does it START with?', 'c', ['a','t'], 1.34, 'first-letter'),
  T('first-dog', 'dog',  'Which letter does it START with?', 'd', ['o','g'], 1.34, 'first-letter'),
  T('first-bee', 'bee',  'Which letter does it START with?', 'b', ['e','y'], 1.34, 'first-letter'),
  T('first-fish','fish', 'Which letter does it START with?', 'f', ['i','h'], 1.36, 'first-letter'),
  T('first-tree','tree', 'Which letter does it START with?', 't', ['r','e'], 1.36, 'first-letter'),

  // Find a word in a sentence — week 8
  T('find-sentence-cat',  'The cat is happy.', 'Find "cat" in the sentence.',     'cat',  ['dog','bird'], 1.32, 'find-word'),
  T('find-sentence-sun',  'The sun is bright.','Find "sun" in the sentence.',     'sun',  ['moon','star'],1.32, 'find-word'),
  T('find-sentence-jump', 'I can jump high.',  'Find "jump" in the sentence.',    'jump', ['skip','run'], 1.34, 'find-word'),

  // Two sight words the same — week 8
  T('sight-same-and', 'and',  'Which is the same word?', 'and', ['ant','add'], 1.30, 'sight-word-match'),
  T('sight-same-the', 'the',  'Which is the same word?', 'the', ['then','they'],1.30, 'sight-word-match'),
  T('sight-same-was', 'was',  'Which is the same word?', 'was', ['saw','ways'], 1.32, 'sight-word-match'),

  // Feelings — week 8
  T('feel-happy', '😀', 'Which feeling matches?', 'happy', ['sad','angry'],   1.30, 'feelings', 'vocabulary'),
  T('feel-sad',   '😢', 'Which feeling matches?', 'sad',   ['happy','angry'], 1.30, 'feelings', 'vocabulary'),
  T('feel-angry', '😡', 'Which feeling matches?', 'angry', ['happy','sad'],   1.32, 'feelings', 'vocabulary'),
  T('feel-tired', '😴', 'Which feeling matches?', 'tired', ['happy','silly'], 1.32, 'feelings', 'vocabulary'),
  T('feel-scared','😨', 'Which feeling matches?', 'scared',['happy','tired'], 1.34, 'feelings', 'vocabulary'),

  // Which one is not like the others — week 9
  T('odd-vehicle', '🍎 🍌 🚗',  'Which one is different?', 'car',    ['apple','banana'], 1.30, 'sorting', 'vocabulary'),
  T('odd-fruit',   '🐶 🐱 🍎',  'Which one is different?', 'apple',  ['dog','cat'],      1.30, 'sorting', 'vocabulary'),
  T('odd-shape',   '🔵 🟢 🐶',  'Which one is different?', 'dog',    ['blue','green'],   1.32, 'sorting', 'vocabulary'),

  // ===================================================================
  // K Weeks 10–13: Sound segmentation, ending sounds, phoneme manipulation
  // ===================================================================
  // Ending sounds
  T('end-cat',  'cat',  'Same ending sound?', 'bat',  ['dog','sun'], 1.36, 'ending-sounds'),
  T('end-pig',  'pig',  'Same ending sound?', 'dog',  ['cat','sun'], 1.36, 'ending-sounds'),
  T('end-fish', 'fish', 'Same ending sound?', 'wish', ['cat','dog'], 1.38, 'ending-sounds'),
  T('end-bun',  'bun',  'Same ending sound?', 'fun',  ['cat','dog'], 1.36, 'ending-sounds'),

  // Last letter of word — week 13
  T('last-cat', 'cat', 'Which letter does it END with?', 't', ['c','a'], 1.40, 'last-letter'),
  T('last-dog', 'dog', 'Which letter does it END with?', 'g', ['d','o'], 1.40, 'last-letter'),
  T('last-sun', 'sun', 'Which letter does it END with?', 'n', ['s','u'], 1.40, 'last-letter'),
  T('last-bee', 'bee', 'Which letter does it END with?', 'e', ['b','y'], 1.42, 'last-letter'),

  // Change the first sound — week 10
  T('change-first-cat-h', 'cat → h__', "Change the FIRST sound to 'h'.", 'hat', ['hit','hot'],   1.42, 'phoneme-manipulation'),
  T('change-first-cat-b', 'cat → b__', "Change the FIRST sound to 'b'.", 'bat', ['bit','bot'],   1.42, 'phoneme-manipulation'),
  T('change-first-dog-l', 'dog → l__', "Change the FIRST sound to 'l'.", 'log', ['leg','lag'],   1.42, 'phoneme-manipulation'),
  T('change-first-sun-r', 'sun → r__', "Change the FIRST sound to 'r'.", 'run', ['ran','rim'],   1.44, 'phoneme-manipulation'),

  // Change the last sound — week 16
  T('change-last-cat-n', 'cat → ca_', "Change the LAST sound to 'n'.", 'can', ['cab','cap'],   1.50, 'phoneme-manipulation'),
  T('change-last-cat-p', 'cat → ca_', "Change the LAST sound to 'p'.", 'cap', ['can','cab'],   1.50, 'phoneme-manipulation'),
  T('change-last-bug-n', 'bug → bu_', "Change the LAST sound to 'n'.", 'bun', ['bus','but'],   1.50, 'phoneme-manipulation'),

  // Change vowel — week 18
  T('change-vow-cat-i', 'cat → c_t', "Change the vowel to 'i'.",       'cit', ['cot','cut'],   1.54, 'phoneme-manipulation'),
  T('change-vow-cat-o', 'cat → c_t', "Change the vowel to 'o'.",       'cot', ['cit','cut'],   1.54, 'phoneme-manipulation'),
  T('change-vow-pig-u', 'pig → p_g', "Change the vowel to 'u'.",       'pug', ['pog','peg'],   1.54, 'phoneme-manipulation'),

  // Predict next — week 10
  T('next-cat-eats',  'After the cat eats, it...',   'What will happen next?', 'sleeps', ['flies','sings'], 1.40, 'predict-next', 'reading'),
  T('next-rain',      'It is raining. So we use a...','What will happen next?', 'umbrella',['hat','book'],  1.42, 'predict-next', 'reading'),
  T('next-baby',      'The baby is hungry. So it...','What will happen next?', 'cries',  ['runs','jumps'], 1.42, 'predict-next', 'reading'),

  // Antonyms — week 11
  T('ant-big',   'big',   'Opposite?',    'small', ['fast','tall'],  1.42, 'antonyms', 'vocabulary'),
  T('ant-hot',   'hot',   'Opposite?',    'cold',  ['warm','cool'],  1.42, 'antonyms', 'vocabulary'),
  T('ant-up',    'up',    'Opposite?',    'down',  ['side','over'],  1.42, 'antonyms', 'vocabulary'),
  T('ant-day',   'day',   'Opposite?',    'night', ['morning','noon'],1.44,'antonyms', 'vocabulary'),
  T('ant-happy', 'happy', 'Opposite?',    'sad',   ['mad','glad'],   1.44, 'antonyms', 'vocabulary'),
  T('ant-fast',  'fast',  'Opposite?',    'slow',  ['quick','swift'],1.46, 'antonyms', 'vocabulary'),

  // Synonyms — week 18
  T('syn-happy', 'happy', 'Means the same?', 'glad',  ['sad','mad'],   1.55, 'synonyms', 'vocabulary'),
  T('syn-big',   'big',   'Means the same?', 'large', ['small','tiny'],1.55, 'synonyms', 'vocabulary'),
  T('syn-fast',  'fast',  'Means the same?', 'quick', ['slow','tired'],1.56, 'synonyms', 'vocabulary'),
  T('syn-small', 'small', 'Means the same?', 'tiny',  ['huge','large'],1.56, 'synonyms', 'vocabulary'),

  // Main idea — week 11
  T('main-bee',  '🐝🌸🍯',     'What is this about?',  'bees',     ['cars','rain'], 1.44, 'main-idea', 'reading'),
  T('main-rain', '☁️🌧️☂️',    'What is this about?',  'rain',     ['snow','sun'],  1.44, 'main-idea', 'reading'),
  T('main-farm', '🐄🐖🐔🌾',  'What is this about?',  'a farm',   ['ocean','city'], 1.46, 'main-idea', 'reading'),

  // Action verb pictures — week 12, 25
  T('verb-jump',  '🤸',  'Which action is this?', 'jumping', ['sleeping','eating'], 1.46, 'action-verbs', 'vocabulary'),
  T('verb-sleep', '😴',  'Which action is this?', 'sleeping',['running','jumping'], 1.46, 'action-verbs', 'vocabulary'),
  T('verb-eat',   '🍴',  'Which action is this?', 'eating',  ['running','sleeping'],1.46, 'action-verbs', 'vocabulary'),
  T('verb-run',   '🏃',  'Which action is this?', 'running', ['sleeping','eating'], 1.46, 'action-verbs', 'vocabulary'),
  T('verb-swim',  '🏊',  'Which action is this?', 'swimming',['running','jumping'], 1.48, 'action-verbs', 'vocabulary'),

  // ===================================================================
  // K Weeks 11–24: Short vowels (a, e, i, o, u)
  // ===================================================================
  // Short a — find / match / complete
  E('🐈', 'cat', ['cot','cut'], 1.40, 'Pick the short-a word.', 'short-a'),
  E('🎩', 'hat', ['hot','hut'], 1.40, 'Pick the short-a word.', 'short-a'),
  E('🦇', 'bat', ['bit','but'], 1.42, 'Pick the short-a word.', 'short-a'),
  E('🐜', 'ant', ['and','int'], 1.42, 'Pick the short-a word.', 'short-a'),
  E('🍳', 'pan', ['pin','pun'], 1.44, 'Pick the short-a word.', 'short-a'),
  T('comp-cat-a', 'c_t', 'Pick the right short vowel.', 'a', ['o','u'], 1.46, 'short-a'),
  T('comp-hat-a', 'h_t', 'Pick the right short vowel.', 'a', ['i','u'], 1.46, 'short-a'),
  T('comp-pan-a', 'p_n', 'Pick the right short vowel.', 'a', ['i','o'], 1.46, 'short-a'),
  T('sent-cat-a', 'The c__ sat on the mat.','Fill in the short-a word.', 'cat', ['cot','cut'], 1.62, 'short-a-sentence'),

  // Short o
  E('🐕', 'dog', ['dig','dug'], 1.48, 'Pick the short-o word.', 'short-o'),
  E('🐸', 'frog',['frig','frug'],1.48, 'Pick the short-o word.', 'short-o'),
  E('🥧', 'pot', ['pat','put'], 1.50, 'Pick the short-o word.', 'short-o'),
  E('🦊', 'fox', ['fix','fax'], 1.50, 'Pick the short-o word.', 'short-o'),
  T('comp-dog-o', 'd_g', 'Pick the right short vowel.', 'o', ['a','u'], 1.50, 'short-o'),
  T('comp-pot-o', 'p_t', 'Pick the right short vowel.', 'o', ['a','i'], 1.50, 'short-o'),
  T('sent-dog-o', 'The d__ ran fast.', 'Fill in the short-o word.', 'dog', ['dig','dug'], 1.62, 'short-o-sentence'),

  // Short i
  E('🐖', 'pig', ['peg','pug'], 1.52, 'Pick the short-i word.', 'short-i'),
  E('🛌', 'bed', ['bid','bad'], 1.54, 'Pick the short-e word.', 'short-e'), // sneak in short-e
  E('🚢', 'ship',['shop','shap'],1.54, 'Pick the short-i word.', 'short-i'),
  E('🐟', 'fish',['fash','fush'],1.54, 'Pick the short-i word.', 'short-i'),
  T('comp-pig-i', 'p_g', 'Pick the right short vowel.', 'i', ['a','o'], 1.56, 'short-i'),
  T('comp-fish-i','f_sh','Pick the right short vowel.', 'i', ['a','u'], 1.56, 'short-i'),
  T('sent-pig-i', 'The p__ rolls in mud.','Fill in the short-i word.', 'pig', ['peg','pug'], 1.64, 'short-i-sentence'),

  // Short u
  E('☀️', 'sun', ['sin','son'], 1.58, 'Pick the short-u word.', 'short-u'),
  E('🐛', 'bug', ['big','bog'], 1.58, 'Pick the short-u word.', 'short-u'),
  E('🥛', 'cup', ['cap','cop'], 1.60, 'Pick the short-u word.', 'short-u'),
  E('🚌', 'bus', ['bas','bos'], 1.60, 'Pick the short-u word.', 'short-u'),
  T('comp-sun-u', 's_n', 'Pick the right short vowel.', 'u', ['a','i'], 1.60, 'short-u'),
  T('comp-bug-u', 'b_g', 'Pick the right short vowel.', 'u', ['a','o'], 1.60, 'short-u'),
  T('sent-sun-u', 'The s__ is hot.', 'Fill in the short-u word.', 'sun', ['sin','son'], 1.66, 'short-u-sentence'),

  // Short e
  E('🥚', 'egg', ['ogg','igg'], 1.62, 'Pick the short-e word.', 'short-e'),
  E('🕸️','web', ['wab','wob'], 1.64, 'Pick the short-e word.', 'short-e'),
  E('🛏️','bed', ['bad','bod'], 1.64, 'Pick the short-e word.', 'short-e'),
  T('comp-bed-e','b_d', 'Pick the right short vowel.', 'e', ['a','o'], 1.64, 'short-e'),
  T('comp-egg-e','_gg', 'Pick the right short vowel.', 'e', ['a','o'], 1.64, 'short-e'),
  T('sent-bed-e','I sleep in my b__.', 'Fill in the short-e word.', 'bed', ['bad','bod'], 1.68, 'short-e-sentence'),

  // Short vowel review
  T('sv-mix-cat', 'c_t (cat)','Which vowel?', 'a', ['e','o'], 1.68, 'short-vowel-review'),
  T('sv-mix-pig', 'p_g (pig)','Which vowel?', 'i', ['e','u'], 1.68, 'short-vowel-review'),
  T('sv-mix-bed', 'b_d (bed)','Which vowel?', 'e', ['i','o'], 1.68, 'short-vowel-review'),
  T('sv-mix-dog', 'd_g (dog)','Which vowel?', 'o', ['a','u'], 1.68, 'short-vowel-review'),
  T('sv-mix-bug', 'b_g (bug)','Which vowel?', 'u', ['e','i'], 1.68, 'short-vowel-review'),

  // Spell short vowel words
  T('spell-cat',  '🐈',  'Spell the word.', 'cat', ['kat','cot'], 1.70, 'spell-short-vowel', 'spelling'),
  T('spell-dog',  '🐕',  'Spell the word.', 'dog', ['dug','dawg'],1.70, 'spell-short-vowel', 'spelling'),
  T('spell-pig',  '🐖',  'Spell the word.', 'pig', ['pag','peeg'],1.70, 'spell-short-vowel', 'spelling'),
  T('spell-sun',  '☀️',  'Spell the word.', 'sun', ['son','sin'], 1.70, 'spell-short-vowel', 'spelling'),
  T('spell-bed',  '🛏️',  'Spell the word.', 'bed', ['bad','bid'], 1.70, 'spell-short-vowel', 'spelling'),

  // ===================================================================
  // K Weeks 13–27: Sight words (sets 1–10)
  // ===================================================================
  T('sw-1-ate',   'ate',   'Find the word "ate".',   'ate',   ['eat','at'],     1.42, 'sight-words-1'),
  T('sw-1-he',    'he',    'Find the word "he".',    'he',    ['the','she'],    1.42, 'sight-words-1'),
  T('sw-1-of',    'of',    'Find the word "of".',    'of',    ['off','for'],    1.42, 'sight-words-1'),
  T('sw-1-that',  'that',  'Find the word "that".',  'that',  ['this','what'],  1.44, 'sight-words-1'),
  T('sw-1-was',   'was',   'Find the word "was".',   'was',   ['saw','way'],    1.44, 'sight-words-1'),

  T('sw-2-are',   'are',   'Find the word "are".',   'are',   ['ear','aye'],    1.46, 'sight-words-2'),
  T('sw-2-green', 'green', 'Find the word "green".', 'green', ['great','grew'], 1.46, 'sight-words-2'),
  T('sw-2-on',    'on',    'Find the word "on".',    'on',    ['no','one'],     1.46, 'sight-words-2'),
  T('sw-2-please','please','Find the word "please".','please',['please.','pleas'],1.48,'sight-words-2'),
  T('sw-2-they',  'they',  'Find the word "they".',  'they',  ['them','that'],  1.48, 'sight-words-2'),

  T('sw-3-be',    'be',    'Find the word "be".',    'be',    ['by','bee'],     1.50, 'sight-words-3'),
  T('sw-3-have',  'have',  'Find the word "have".',  'have',  ['has','had'],    1.50, 'sight-words-3'),
  T('sw-3-or',    'or',    'Find the word "or".',    'or',    ['for','our'],    1.50, 'sight-words-3'),
  T('sw-3-pretty','pretty','Find the word "pretty".','pretty',['party','plenty'],1.52,'sight-words-3'),
  T('sw-3-this',  'this',  'Find the word "this".',  'this',  ['that','these'], 1.52, 'sight-words-3'),

  T('sw-4-all',   'all',   'Find the word "all".',   'all',   ['alt','ill'],    1.58, 'sight-words-4'),
  T('sw-4-but',   'but',   'Find the word "but".',   'but',   ['bit','bat'],    1.58, 'sight-words-4'),
  T('sw-4-ride',  'ride',  'Find the word "ride".',  'ride',  ['rude','red'],   1.58, 'sight-words-4'),
  T('sw-4-saw',   'saw',   'Find the word "saw".',   'saw',   ['was','sow'],    1.60, 'sight-words-4'),
  T('sw-4-what',  'what',  'Find the word "what".',  'what',  ['that','when'],  1.60, 'sight-words-4'),

  T('sw-5-about', 'about', 'Find the word "about".', 'about', ['above','about.'],1.62, 'sight-words-5'),
  T('sw-5-like',  'like',  'Find the word "like".',  'like',  ['lake','lick'],  1.62, 'sight-words-5'),
  T('sw-5-she',   'she',   'Find the word "she".',   'she',   ['he','the'],     1.62, 'sight-words-5'),
  T('sw-5-under', 'under', 'Find the word "under".', 'under', ['under.','over'],1.64, 'sight-words-5'),
  T('sw-5-we',    'we',    'Find the word "we".',    'we',    ['me','be'],      1.62, 'sight-words-5'),

  T('sw-6-black', 'black', 'Find the word "black".', 'black', ['blank','block'],1.66, 'sight-words-6'),
  T('sw-6-into',  'into',  'Find the word "into".',  'into',  ['unto','onto'],  1.66, 'sight-words-6'),
  T('sw-6-made',  'made',  'Find the word "made".',  'made',  ['mad','mode'],   1.66, 'sight-words-6'),
  T('sw-6-ran',   'ran',   'Find the word "ran".',   'ran',   ['run','ron'],    1.66, 'sight-words-6'),
  T('sw-6-white', 'white', 'Find the word "white".', 'white', ['white.','while'],1.68,'sight-words-6'),

  T('sw-7-am',    'am',    'Find the word "am".',    'am',    ['an','at'],      1.72, 'sight-words-7'),
  T('sw-7-did',   'did',   'Find the word "did".',   'did',   ['dad','dim'],    1.72, 'sight-words-7'),
  T('sw-7-get',   'get',   'Find the word "get".',   'get',   ['got','set'],    1.72, 'sight-words-7'),
  T('sw-7-now',   'now',   'Find the word "now".',   'now',   ['won','new'],    1.74, 'sight-words-7'),
  T('sw-7-well',  'well',  'Find the word "well".',  'well',  ['will','wall'],  1.74, 'sight-words-7'),

  T('sw-8-fast',  'fast',  'Find the word "fast".',  'fast',  ['fist','fest'],  1.76, 'sight-words-8'),
  T('sw-8-good',  'good',  'Find the word "good".',  'good',  ['gold','goof'],  1.76, 'sight-words-8'),
  T('sw-8-him',   'him',   'Find the word "him".',   'him',   ['hum','her'],    1.76, 'sight-words-8'),
  T('sw-8-take',  'take',  'Find the word "take".',  'take',  ['tale','tame'],  1.78, 'sight-words-8'),
  T('sw-8-will',  'will',  'Find the word "will".',  'will',  ['well','wall'],  1.78, 'sight-words-8'),

  T('sw-9-came',  'came',  'Find the word "came".',  'came',  ['come','cane'],  1.80, 'sight-words-9'),
  T('sw-9-going', 'going', 'Find the word "going".', 'going', ['gone','goes'],  1.80, 'sight-words-9'),
  T('sw-9-say',   'say',   'Find the word "say".',   'say',   ['saw','sue'],    1.80, 'sight-words-9'),
  T('sw-9-too',   'too',   'Find the word "too".',   'too',   ['to','two'],     1.80, 'sight-words-9'),
  T('sw-9-with',  'with',  'Find the word "with".',  'with',  ['wish','witch'], 1.82, 'sight-words-9'),

  T('sw-10-brown','brown', 'Find the word "brown".', 'brown', ['bowl','blown'], 1.84, 'sight-words-10'),
  T('sw-10-does', 'does',  'Find the word "does".',  'does',  ['done','dose'],  1.84, 'sight-words-10'),
  T('sw-10-eat',  'eat',   'Find the word "eat".',   'eat',   ['ate','eat.'],   1.84, 'sight-words-10'),
  T('sw-10-must', 'must',  'Find the word "must".',  'must',  ['mast','mist'],  1.84, 'sight-words-10'),
  T('sw-10-went', 'went',  'Find the word "went".',  'went',  ['want','when'],  1.86, 'sight-words-10'),

  // Complete sentence with sight word — week 30
  T('sw-comp-the', 'I see __ cat.',  'Pick the right sight word.', 'the',  ['and','it'],   1.92, 'sight-word-sentence'),
  T('sw-comp-and', 'A dog __ a cat.','Pick the right sight word.', 'and',  ['the','it'],   1.92, 'sight-word-sentence'),
  T('sw-comp-can', 'I __ run fast.', 'Pick the right sight word.', 'can',  ['was','and'],  1.94, 'sight-word-sentence'),

  // ===================================================================
  // K Weeks 13–22: Setting / character / point of view
  // ===================================================================
  T('set-bear',  'A bear lives in...',     'Pick the setting.',     'forest', ['ocean','city'],   1.46, 'setting', 'reading'),
  T('set-fish',  'A fish lives in...',     'Pick the setting.',     'ocean',  ['forest','desert'],1.46, 'setting', 'reading'),
  T('set-cow',   'A cow lives on...',      'Pick the setting.',     'farm',   ['ocean','sky'],    1.48, 'setting', 'reading'),
  T('set-camel', 'A camel lives in...',    'Pick the setting.',     'desert', ['ocean','snow'],   1.48, 'setting', 'reading'),

  T('pov-i',     '"I jumped high."',       'Who tells the story?',  'me',    ['someone else','no one'], 1.66, 'point-of-view', 'reading'),
  T('pov-she',   '"She ran away."',        'Who tells the story?',  'someone else',['me','no one'],     1.68, 'point-of-view', 'reading'),

  // ===================================================================
  // K Weeks 25–27: Consonant blends & digraphs
  // ===================================================================
  T('blend-frog',  'frog',  'Which blend does it START with?', 'fr', ['sn','cl'], 1.78, 'initial-blend'),
  T('blend-snail', 'snail', 'Which blend does it START with?', 'sn', ['fr','cl'], 1.78, 'initial-blend'),
  T('blend-clock', 'clock', 'Which blend does it START with?', 'cl', ['sn','tr'], 1.80, 'initial-blend'),
  T('blend-train', 'train', 'Which blend does it START with?', 'tr', ['cl','sn'], 1.80, 'initial-blend'),
  T('blend-brush', 'brush', 'Which blend does it START with?', 'br', ['tr','sn'], 1.80, 'initial-blend'),

  T('blend-end-fast',  'fast',  'Which blend does it END with?',   'st', ['nd','mp'], 1.84, 'final-blend'),
  T('blend-end-jump',  'jump',  'Which blend does it END with?',   'mp', ['st','nd'], 1.84, 'final-blend'),
  T('blend-end-hand',  'hand',  'Which blend does it END with?',   'nd', ['st','mp'], 1.84, 'final-blend'),
  T('blend-end-tent',  'tent',  'Which blend does it END with?',   'nt', ['nd','mp'], 1.86, 'final-blend'),

  T('comp-blend-frog', '__og', 'Pick the right starting blend.', 'fr', ['sn','cl'], 1.82, 'initial-blend'),
  T('comp-blend-snail','__ail','Pick the right starting blend.', 'sn', ['fr','cl'], 1.82, 'initial-blend'),
  T('comp-blend-fast', 'fa__', 'Pick the right ending blend.',  'st', ['mp','nd'], 1.86, 'final-blend'),
  T('comp-blend-jump', 'ju__', 'Pick the right ending blend.',  'mp', ['st','nd'], 1.86, 'final-blend'),

  // Digraphs
  T('dig-sh',  '__ip (ship)','Pick the right digraph.', 'sh', ['ch','th'], 1.88, 'digraphs'),
  T('dig-ch',  '__air (chair)','Pick the right digraph.','ch', ['sh','th'], 1.88, 'digraphs'),
  T('dig-th',  '__ree (three)','Pick the right digraph.','th', ['sh','ch'], 1.90, 'digraphs'),
  T('dig-wh',  '__ale (whale)','Pick the right digraph.','wh', ['sh','th'], 1.90, 'digraphs'),

  // -ss, -ll, -ff, -zz, -ck endings
  T('end-buzz', '🐝',  'Pick the right ending.', 'buzz', ['buz','buzy'],  1.88, 'word-endings'),
  T('end-bell', '🔔',  'Pick the right ending.', 'bell', ['bel','beel'],  1.88, 'word-endings'),
  T('end-duck', '🦆',  'Pick the right ending.', 'duck', ['duk','duke'],  1.88, 'word-endings'),
  T('end-puff', '💨',  'Pick the right ending.', 'puff', ['puf','poff'],  1.90, 'word-endings'),
  T('end-grass','🌱',  'Pick the right ending.', 'grass',['gras','grase'],1.90, 'word-endings'),

  // ===================================================================
  // K Weeks 28–32: Long vowels
  // ===================================================================
  T('long-a-rain', 'long a', 'Find the word with this vowel sound.', 'rain', ['cat','dog'], 1.92, 'long-a'),
  T('long-a-name', 'long a', 'Find the word with this vowel sound.', 'name', ['nap','net'], 1.92, 'long-a'),
  T('long-a-cake', 'long a', 'Find the word with this vowel sound.', 'cake', ['can','cup'], 1.94, 'long-a'),
  T('long-e-tree', 'long e', 'Find the word with this vowel sound.', 'tree', ['ten','top'], 1.96, 'long-e'),
  T('long-e-bee',  'long e', 'Find the word with this vowel sound.', 'bee',  ['bed','bad'], 1.96, 'long-e'),
  T('long-e-eat',  'long e', 'Find the word with this vowel sound.', 'eat',  ['egg','elf'], 1.96, 'long-e'),
  T('long-i-bike', 'long i', 'Find the word with this vowel sound.', 'bike', ['big','bit'], 1.98, 'long-i'),
  T('long-i-kite', 'long i', 'Find the word with this vowel sound.', 'kite', ['kit','kid'], 1.98, 'long-i'),
  T('long-i-time', 'long i', 'Find the word with this vowel sound.', 'time', ['tip','tin'], 1.98, 'long-i'),
  T('long-o-boat', 'long o', 'Find the word with this vowel sound.', 'boat', ['box','bot'], 2.00, 'long-o'),
  T('long-o-go',   'long o', 'Find the word with this vowel sound.', 'go',   ['got','god'], 2.00, 'long-o'),
  T('long-o-rope', 'long o', 'Find the word with this vowel sound.', 'rope', ['rod','rot'], 2.00, 'long-o'),
  T('long-u-cute', 'long u', 'Find the word with this vowel sound.', 'cute', ['cut','cup'], 2.00, 'long-u'),
  T('long-u-mule', 'long u', 'Find the word with this vowel sound.', 'mule', ['mug','mud'], 2.00, 'long-u'),
  T('long-u-moon', 'long u', 'Find the word with this vowel sound.', 'moon', ['mom','mop'], 2.00, 'long-u'),

  T('sort-cat',   'cat',  'Short or long vowel?', 'short', ['long','none'], 1.95, 'short-vs-long'),
  T('sort-cake',  'cake', 'Short or long vowel?', 'long',  ['short','none'],1.95, 'short-vs-long'),
  T('sort-pig',   'pig',  'Short or long vowel?', 'short', ['long','none'], 1.95, 'short-vs-long'),
  T('sort-bike',  'bike', 'Short or long vowel?', 'long',  ['short','none'],1.95, 'short-vs-long'),
  T('sort-bed',   'bed',  'Short or long vowel?', 'short', ['long','none'], 1.95, 'short-vs-long'),
  T('sort-tree',  'tree', 'Short or long vowel?', 'long',  ['short','none'],1.95, 'short-vs-long'),

  // ===================================================================
  // K Grammar: end marks, capitalization, sentences, nouns
  // ===================================================================
  T('end-period',  'I am happy', 'Which end mark?', '.', ['?','!'], 1.50, 'end-marks', 'grammar'),
  T('end-quest',   'Are you ok', 'Which end mark?', '?', ['.','!'], 1.50, 'end-marks', 'grammar'),
  T('end-excl',    'Look out',   'Which end mark?', '!', ['.','?'], 1.50, 'end-marks', 'grammar'),
  T('end-period2', 'The dog ran','Which end mark?', '.', ['?','!'], 1.52, 'end-marks', 'grammar'),

  T('cap-i-1', 'i am happy.', 'Which is right?', 'I am happy.', ['i am Happy.','i Am happy.'], 1.50, 'capitalization', 'grammar'),
  T('cap-i-2', 'can i go.',   'Which is right?', 'Can I go.',   ['can I go.','Can i go.'],     1.52, 'capitalization', 'grammar'),
  T('cap-start','the cat ran.','Which is right?','The cat ran.',['the Cat ran.','the cat Ran.'],1.58,'capitalization','grammar'),

  T('comp-sent-1','the cat',         'Which is a complete sentence?', 'The cat naps.',['the cat','cat naps'],     1.55, 'complete-sentence','grammar'),
  T('comp-sent-2','dog run',         'Which is a complete sentence?', 'The dog runs.',['dog run','runs the dog'], 1.56, 'complete-sentence','grammar'),

  T('telling-1', 'The cat naps.',  'Telling or asking?', 'telling', ['asking','exclaim'], 1.50, 'sentence-types', 'grammar'),
  T('telling-2', 'Is it raining?', 'Telling or asking?', 'asking',  ['telling','exclaim'],1.50, 'sentence-types', 'grammar'),

  T('noun-dog',   'dog',    'Person, animal, place, or thing?', 'animal', ['place','thing'],   1.55, 'noun-types', 'grammar'),
  T('noun-park',  'park',   'Person, animal, place, or thing?', 'place',  ['animal','thing'],  1.55, 'noun-types', 'grammar'),
  T('noun-ball',  'ball',   'Person, animal, place, or thing?', 'thing',  ['animal','place'],  1.55, 'noun-types', 'grammar'),
  T('noun-mom',   'mom',    'Person, animal, place, or thing?', 'person', ['animal','thing'],  1.55, 'noun-types', 'grammar'),

  T('plural-cat', '🐱',    'Singular or plural?', 'cat',  ['cats','cates'], 1.62, 'singular-plural', 'grammar'),
  T('plural-cats','🐱🐱',  'Singular or plural?', 'cats', ['cat','cates'],  1.62, 'singular-plural', 'grammar'),
  T('plural-dog', '🐶',    'Singular or plural?', 'dog',  ['dogs','doges'], 1.62, 'singular-plural', 'grammar'),
  T('plural-dogs','🐶🐶🐶','Singular or plural?', 'dogs', ['dog','doges'],  1.62, 'singular-plural', 'grammar'),

  T('action-find','The dog RUNS fast.',  'Which is the action verb?',     'runs', ['dog','fast'],  1.78, 'find-action-verb', 'grammar'),
  T('action-find-2','Birds FLY high.',   'Which is the action verb?',     'fly',  ['birds','high'],1.78, 'find-action-verb', 'grammar'),
  T('action-find-3','I JUMP up.',        'Which is the action verb?',     'jump', ['I','up'],      1.78, 'find-action-verb', 'grammar'),

  // Multi-meaning words — week 17
  T('mm-bat',  'bat',  'Which picture?',  '🦇',  ['⚾','🐱'], 1.54, 'multi-meaning', 'vocabulary'),
  T('mm-bat2', 'bat',  'Which picture?',  '⚾',  ['🦇','🐱'], 1.54, 'multi-meaning', 'vocabulary'),
  T('mm-star', 'star', 'Which picture?',  '⭐',  ['🌟','🌞'], 1.54, 'multi-meaning', 'vocabulary'),

  // Question words — week 16
  T('qw-who',  'name a person', "Which question word?", 'who',  ['what','where'], 1.50, 'question-words', 'vocabulary'),
  T('qw-where','name a place',  "Which question word?", 'where',['who','what'],   1.50, 'question-words', 'vocabulary'),
  T('qw-when', 'name a time',   "Which question word?", 'when', ['who','where'],  1.52, 'question-words', 'vocabulary'),
  T('qw-why',  'name a reason', "Which question word?", 'why',  ['who','what'],   1.52, 'question-words', 'vocabulary'),

  // Riddles — week 26 ("What am I?")
  T('riddle-bee',   'I have wings and I buzz.',          'What am I?', 'bee',  ['cat','dog'],   1.85, 'riddles', 'vocabulary'),
  T('riddle-fish',  'I swim and have fins.',             'What am I?', 'fish', ['bird','frog'], 1.85, 'riddles', 'vocabulary'),
  T('riddle-sun',   'I shine bright in the sky.',        'What am I?', 'sun',  ['moon','star'], 1.86, 'riddles', 'vocabulary'),
  T('riddle-snake', 'I am long and slither on the ground','What am I?','snake',['fish','frog'], 1.88, 'riddles', 'vocabulary'),

  // Complete the rhyme — week 25
  T('rhyme-fill-1', 'Roses are red, violets are __',  'Finish the rhyme.', 'blue',  ['yellow','green'],1.78, 'complete-rhyme'),
  T('rhyme-fill-2', 'The cat sat on the __',          'Finish the rhyme.', 'mat',   ['dog','rug'],     1.78, 'complete-rhyme'),
  T('rhyme-fill-3', 'Twinkle, twinkle, little __',    'Finish the rhyme.', 'star',  ['sun','moon'],    1.80, 'complete-rhyme'),

  // Unscramble simple sentence — week 30
  T('unscr-1','cat / the / sleeps',  'Unscramble the sentence.', 'The cat sleeps.', ['Cat the sleeps.','Sleeps the cat.'], 1.94, 'unscramble', 'grammar'),
  T('unscr-2','runs / the / dog',    'Unscramble the sentence.', 'The dog runs.',   ['Dog runs the.','Runs the dog.'],     1.94, 'unscramble', 'grammar'),

  // ===================================================================
  // 1st Grade and beyond — existing emoji-word bank (mapped to levels)
  // ===================================================================
  // 4-letter words
  E('🐸', 'frog',   ['flag','drop'],     2.05),
  E('🦁', 'lion',   ['line','loud'],     2.05),
  E('🐻', 'bear',   ['beak','bead'],     2.08),
  E('🐟', 'fish',   ['dish','wish'],     2.08),
  E('🦆', 'duck',   ['dock','deck'],     2.08),
  E('🦀', 'crab',   ['drab','grab'],     2.10),
  E('🦭', 'seal',   ['meal','real'],     2.10),
  E('🌙', 'moon',   ['noon','soon'],     2.12),
  E('⭐', 'star',   ['scar','stir'],     2.12),
  E('📚', 'book',   ['boot','hook'],     2.14),
  E('⚽', 'ball',   ['bell','bull'],     2.14),
  E('🎂', 'cake',   ['rake','lake'],     2.15),
  E('🦴', 'bone',   ['cone','zone'],     2.15),
  E('🪁', 'kite',   ['bite','site'],     2.16),
  E('🌳', 'tree',   ['knee','free'],     2.16),
  E('🥛', 'milk',   ['mill','silk'],     2.18),
  E('🚤', 'boat',   ['coat','goat'],     2.18),
  E('🍃', 'leaf',   ['loaf','leap'],     2.20),
  E('🌧️', 'rain',  ['pain','ruin'],     2.20),

  // 5-letter words (1st-grade)
  E('🐌', 'snail',  ['trail','nail'],    2.30),
  E('🐑', 'sheep',  ['sheet','sleep'],   2.32),
  E('🐭', 'mouse',  ['moose','mouth'],   2.34),
  E('🐍', 'snake',  ['smoke','stake'],   2.36),
  E('🐯', 'tiger',  ['timer','tiles'],   2.38),
  E('🐴', 'horse',  ['house','hose'],    2.40),
  E('✈️', 'plane', ['plant','plain'],   2.42),
  E('🚂', 'train',  ['trail','drain'],   2.42),
  E('🚚', 'truck',  ['trick','track'],   2.44),
  E('🥤', 'drink',  ['drank','drunk'],   2.44),
  E('🖌️', 'brush', ['crush','blush'],   2.46),
  E('🕐', 'clock',  ['block','flock'],   2.46),
  E('🌱', 'plant',  ['plane','paint'],   2.48),
  E('🪨', 'stone',  ['phone','alone'],   2.48),
  E('😊', 'smile',  ['small','slime'],   2.50),
  E('👸', 'queen',  ['quest','green'],   2.50),
  E('🤖', 'robot',  ['roost','robin'],   2.52),
  E('👻', 'ghost',  ['goats','guest'],   2.52),
  E('🍬', 'candy',  ['cards','sandy'],   2.54),
  E('🍕', 'pizza',  ['plaza','pasta'],   2.54),

  // 6-letter words (2nd-grade)
  E('🕷️', 'spider', ['slider','rider'],  3.05),
  E('🐵', 'monkey', ['money','donkey'], 3.08),
  E('🐢', 'turtle', ['tickle','temple'],3.10),
  E('🐰', 'rabbit', ['ribbon','robber'],3.12),
  E('🦜', 'parrot', ['carrot','pirate'],3.14),
  E('🍌', 'banana', ['bandana','banner'],3.16),
  E('🍪', 'cookie', ['coffee','rookie'],3.18),
  E('🚀', 'rocket', ['pocket','locket'],3.20),
  E('🏫', 'school', ['stool','spool'],  3.22),
  E('🌸', 'flower', ['tower','power'],  3.22),
  E('🎸', 'guitar', ['guard','jaguar'], 3.24),
  E('✏️', 'pencil', ['puzzle','pebble'],3.26),
  E('🐲', 'dragon', ['wagon','dream'],  3.28),
  E('🏰', 'castle', ['cattle','candle'],3.30),
  E('🌉', 'bridge', ['fridge','breeze'],3.32),
  E('🍅', 'tomato', ['potato','tornado'],3.34),
  E('🥕', 'carrot', ['parrot','comet'], 3.34),
  E('🧲', 'magnet', ['magic','market'], 3.36),
  E('🧺', 'basket', ['bracket','blanket'],3.38),

  // 7+ letter words (3rd-grade)
  E('👦', 'brother',  ['bother','mother'],     4.05),
  E('🌤️', 'weather', ['feather','leather'],   4.10),
  E('🌅', 'morning',  ['warning','meaning'],   4.12),
  E('👾', 'monster',  ['hamster','rooster'],   4.14),
  E('🌈', 'rainbow',  ['window','raincoat'],   4.18),
  E('🎈', 'balloon',  ['baboon','platoon'],    4.22),
  E('🍿', 'popcorn',  ['pumpkin','unicorn'],   4.24),
  E('🥪', 'sandwich', ['sandbox','sundial'],   4.28),
  E('🐙', 'octopus',  ['opossum','octagon'],   4.30),
  E('🐬', 'dolphin',  ['daffodil','doughnut'], 4.32),
  E('🐧', 'penguin',  ['pigeon','peanut'],     4.34),
  E('🐹', 'hamster',  ['monster','hammer'],    4.36),
  E('🦄', 'unicorn',  ['uniform','popcorn'],   4.38),
  E('🍄', 'mushroom', ['minimum','mystery'],   4.40),
  E('⛄', 'snowman',  ['showman','snowfall'],  4.42),
  E('🛩️', 'airplane',['airport','airbase'],   4.44),
  E('🐘', 'elephant', ['element','elegant'],   4.46),
  E('🎃', 'pumpkin',  ['popcorn','penguin'],   4.48),
  E('🌋', 'volcano',  ['vulture','valley'],    4.50),

  // ===================================================================
  // K GAPS — skills missing or thin in the original bank
  // ===================================================================

  // Put sounds in order → blend into word (Week 12, level ~1.38)
  T('psorder-cat', '/c/ /a/ /t/ → what word?', 'Blend the sounds in order.', 'cat', ['act','tac'], 1.38, 'phoneme-order'),
  T('psorder-dog', '/d/ /o/ /g/ → what word?', 'Blend the sounds in order.', 'dog', ['god','dgo'], 1.38, 'phoneme-order'),
  T('psorder-sun', '/s/ /u/ /n/ → what word?', 'Blend the sounds in order.', 'sun', ['nus','uns'], 1.40, 'phoneme-order'),
  T('psorder-hat', '/h/ /a/ /t/ → what word?', 'Blend the sounds in order.', 'hat', ['tha','aht'], 1.40, 'phoneme-order'),
  T('psorder-pig', '/p/ /i/ /g/ → what word?', 'Blend the sounds in order.', 'pig', ['gip','ipg'], 1.40, 'phoneme-order'),

  // Full phoneme blending /c/ /a/ /t/ = cat (Week 10, level ~1.36)
  T('phblend-bee', '/b/ /e/ /e/ = ?', 'Blend all the sounds.', 'bee', ['tea','be'],  1.36, 'phoneme-blend'),
  T('phblend-bug', '/b/ /u/ /g/ = ?', 'Blend all the sounds.', 'bug', ['mug','bus'], 1.36, 'phoneme-blend'),
  T('phblend-fox', '/f/ /o/ /x/ = ?', 'Blend all the sounds.', 'fox', ['box','mix'], 1.38, 'phoneme-blend'),
  T('phblend-pig', '/p/ /i/ /g/ = ?', 'Blend all the sounds.', 'pig', ['big','pug'], 1.38, 'phoneme-blend'),
  T('phblend-hat', '/h/ /a/ /t/ = ?', 'Blend all the sounds.', 'hat', ['hit','hut'], 1.38, 'phoneme-blend'),

  // Which word has MORE syllables (Week 7, level ~1.22)
  T('syl-more-1', 'cat  vs  pizza',       'Which has MORE syllables?', 'pizza',     ['cat','same'],     1.22, 'syllable-compare'),
  T('syl-more-2', 'dog  vs  elephant',    'Which has MORE syllables?', 'elephant',  ['dog','same'],     1.22, 'syllable-compare'),
  T('syl-more-3', 'sun  vs  butterfly',   'Which has MORE syllables?', 'butterfly', ['sun','same'],     1.24, 'syllable-compare'),
  T('syl-more-4', 'bee  vs  banana',      'Which has MORE syllables?', 'banana',    ['bee','same'],     1.24, 'syllable-compare'),
  T('syl-more-5', 'rain  vs  umbrella',   'Which has MORE syllables?', 'umbrella',  ['rain','same'],    1.26, 'syllable-compare'),

  // -am / -an word families (Week 13, level ~1.42)
  T('fam-an-odd',   'can, pan, dog — which does NOT belong?', 'Find the odd one out.', 'dog', ['can','pan'],  1.42, 'word-families'),
  T('fam-an-rhyme', 'Which rhymes with "pan"?',                'Word family -an.',       'van', ['dog','bee'],  1.42, 'word-families'),
  T('fam-an-ran',   'Which belongs in the -an family?',        'Pick the -an word.',     'ran', ['dog','cat'],  1.42, 'word-families'),
  T('fam-am-odd',   'ham, jam, dog — which does NOT belong?',  'Find the odd one out.',  'dog', ['ham','jam'],  1.44, 'word-families'),
  T('fam-am-rhyme', 'Which rhymes with "ham"?',                'Word family -am.',       'jam', ['bat','bus'],  1.44, 'word-families'),

  // Consonant-blend yes/no (Week 26/29, level ~1.85)
  T('yn-frog',  'Does "frog" start with a consonant blend?',   'Yes or no?', 'yes', ['no','maybe'], 1.85, 'blend-yes-no'),
  T('yn-cat',   'Does "cat" start with a consonant blend?',    'Yes or no?', 'no',  ['yes','maybe'], 1.85, 'blend-yes-no'),
  T('yn-snail', 'Does "snail" start with a consonant blend?',  'Yes or no?', 'yes', ['no','maybe'], 1.86, 'blend-yes-no'),
  T('yn-dog',   'Does "dog" start with a consonant blend?',    'Yes or no?', 'no',  ['yes','maybe'], 1.86, 'blend-yes-no'),
  T('yn-fast-e','Does "fast" END with a consonant blend?',     'Yes or no?', 'yes', ['no','maybe'], 1.88, 'blend-yes-no'),
  T('yn-dog-e', 'Does "dog" END with a consonant blend?',      'Yes or no?', 'no',  ['yes','maybe'], 1.88, 'blend-yes-no'),

  // Same vowel sound (Weeks 28–29, level ~1.88)
  T('samevow-cat', 'Same vowel sound as "cat"?', 'Pick the matching word.', 'hat', ['dog','bee'], 1.88, 'vowel-matching'),
  T('samevow-bee', 'Same vowel sound as "bee"?', 'Pick the matching word.', 'tree',['bat','sun'], 1.90, 'vowel-matching'),
  T('samevow-pig', 'Same vowel sound as "pig"?', 'Pick the matching word.', 'big', ['dog','sun'], 1.90, 'vowel-matching'),
  T('samevow-dog', 'Same vowel sound as "dog"?', 'Pick the matching word.', 'fox', ['cat','bee'], 1.92, 'vowel-matching'),
  T('samevow-sun', 'Same vowel sound as "sun"?', 'Pick the matching word.', 'bug', ['cat','dog'], 1.92, 'vowel-matching'),

  // Sight word spelling (Week 31, level ~1.97)
  T('1sw-spell-the', 'the',  'Spell this sight word.', 'the',  ['teh','het'],  1.97, 'sight-word-spell', 'spelling'),
  T('1sw-spell-was', 'was',  'Spell this sight word.', 'was',  ['saw','waz'],  1.97, 'sight-word-spell', 'spelling'),
  T('1sw-spell-and', 'and',  'Spell this sight word.', 'and',  ['adn','dan'],  1.97, 'sight-word-spell', 'spelling'),
  T('1sw-spell-they','they', 'Spell this sight word.', 'they', ['thay','tey'], 2.00, 'sight-word-spell', 'spelling'),
  T('1sw-spell-she', 'she',  'Spell this sight word.', 'she',  ['hse','seh'],  2.00, 'sight-word-spell', 'spelling'),

  // More short-vowel sentences (2 more per vowel)
  T('sent-hat-a2', 'She has a red h__.', 'Fill in the short-a word.', 'hat', ['hot','hit'], 1.66, 'short-a-sentence'),
  T('sent-cap-a3', 'The b__ is on the hat.', 'Fill in the short-a word.', 'bat', ['bit','but'], 1.66, 'short-a-sentence'),
  T('sent-fox-o2', 'The b__ is big.',  'Fill in the short-o word.', 'box', ['bus','bee'], 1.66, 'short-o-sentence'),
  T('sent-pot-o3', 'She has a p__.',   'Fill in the short-o word.', 'pot', ['pat','pit'], 1.68, 'short-o-sentence'),
  T('sent-pin-i2', 'I will w_n the game.', 'Fill in the short-i word.', 'win', ['wan','won'], 1.68, 'short-i-sentence'),
  T('sent-hit-i3', 'I h_t the ball.', 'Fill in the short-i word.', 'hit', ['hat','hot'],   1.68, 'short-i-sentence'),
  T('sent-rug-u2', 'The r_g is soft.', 'Fill in the short-u word.', 'rug', ['rag','rod'],  1.68, 'short-u-sentence'),
  T('sent-mug-u3', 'I have a m_g.',   'Fill in the short-u word.', 'mug', ['mag','mog'],   1.68, 'short-u-sentence'),
  T('sent-web-e2', 'A sp_der spun a w_b.', 'Fill in the short-e word.', 'web', ['wab','wob'],1.70,'short-e-sentence'),
  T('sent-jet-e3', 'A j_t flew fast.', 'Fill in the short-e word.', 'jet', ['jat','jot'],  1.70, 'short-e-sentence'),

  // More change-last-sound examples (Week 16)
  T('change-last-bag-n', 'bag → ba_', "Change the LAST sound to 'n'.", 'ban', ['bin','ben'], 1.52, 'phoneme-manipulation'),
  T('change-last-pig-n', 'pig → pi_', "Change the LAST sound to 'n'.", 'pin', ['pan','pen'], 1.52, 'phoneme-manipulation'),

  // More change-vowel examples (Week 18)
  T('change-vow-hop-i', 'hop → h_p', "Change the vowel to 'i'.", 'hip', ['hap','hup'], 1.56, 'phoneme-manipulation'),
  T('change-vow-bat-u', 'bat → b_t', "Change the vowel to 'u'.", 'but', ['bit','bot'], 1.56, 'phoneme-manipulation'),

  // ===================================================================
  // 1st GRADE — Weeks 1–16  (levels 2.03–2.50)
  // ===================================================================

  // ABC order (W1, 2.03)
  T('abc-1', 'apple, cat, bee — which comes FIRST?', 'ABC order.', 'apple', ['bee','cat'], 2.03, 'abc-order'),
  T('abc-2', 'dog, bee, cat — which comes FIRST?',   'ABC order.', 'bee',   ['cat','dog'], 2.03, 'abc-order'),
  T('abc-3', 'sun, pig, rain — which comes LAST?',   'ABC order.', 'sun',   ['pig','rain'],2.04, 'abc-order'),
  T('abc-4', 'Which is in the correct ABC order?', 'ABC order.',  'ant, cat, dog', ['cat, ant, dog','dog, ant, cat'], 2.05, 'abc-order'),

  // Does not rhyme (W2, 2.06)
  T('norhyme-1', 'cat, bat, dog — which does NOT rhyme?',  'Find the non-rhyme.', 'dog', ['cat','bat'], 2.06, 'rhyming'),
  T('norhyme-2', 'bee, tree, sun — which does NOT rhyme?', 'Find the non-rhyme.', 'sun', ['bee','tree'], 2.06, 'rhyming'),
  T('norhyme-3', 'cake, rain, cat — which does NOT rhyme?','Find the non-rhyme.', 'cat', ['cake','rain'],2.08, 'rhyming'),
  T('norhyme-4', 'pig, big, dog — which does NOT rhyme?',  'Find the non-rhyme.', 'dog', ['pig','big'],  2.08, 'rhyming'),

  // Sentence types — statements (W2, 2.06)
  T('stmt-1', 'The dog runs.',     'Statement, question, or exclamation?', 'statement',   ['question','exclamation'], 2.06, 'sentence-types', 'grammar'),
  T('stmt-2', 'I like cake.',      'Statement, question, or exclamation?', 'statement',   ['question','command'],     2.06, 'sentence-types', 'grammar'),
  T('stmt-3', 'It is raining.',    'Statement, question, or exclamation?', 'statement',   ['question','exclamation'], 2.07, 'sentence-types', 'grammar'),

  // Questions (W3, 2.09)
  T('ques-1', 'Where is the dog?', 'What type of sentence?', 'question', ['statement','command'],    2.09, 'sentence-types', 'grammar'),
  T('ques-2', 'Is it raining?',    'What type of sentence?', 'question', ['statement','exclamation'],2.09, 'sentence-types', 'grammar'),
  T('ques-3', 'How old are you?',  'What type of sentence?', 'question', ['statement','command'],    2.10, 'sentence-types', 'grammar'),

  // Exclamations (W4, 2.12)
  T('excl-1', 'Wow, that is amazing!', 'What type of sentence?', 'exclamation', ['statement','question'], 2.12, 'sentence-types', 'grammar'),
  T('excl-2', 'I scored a goal!',      'What type of sentence?', 'exclamation', ['statement','question'], 2.13, 'sentence-types', 'grammar'),
  T('excl-3', 'That was so scary!',    'What type of sentence?', 'exclamation', ['statement','command'],  2.13, 'sentence-types', 'grammar'),

  // Commands (W5, 2.16)
  T('cmd-1', 'Please sit down.',  'What type of sentence?', 'command', ['statement','question'],    2.16, 'sentence-types', 'grammar'),
  T('cmd-2', 'Come here now.',    'What type of sentence?', 'command', ['statement','exclamation'], 2.16, 'sentence-types', 'grammar'),
  T('cmd-3', 'Close the door.',   'What type of sentence?', 'command', ['statement','question'],    2.17, 'sentence-types', 'grammar'),

  // End marks (W6, 2.19)
  T('endmk-1', 'My dog is big___',      'Choose the right end mark.', '.',  ['?','!'], 2.19, 'end-marks', 'grammar'),
  T('endmk-2', 'Help, I am stuck___',   'Choose the right end mark.', '!',  ['.','?'], 2.19, 'end-marks', 'grammar'),
  T('endmk-3', 'Is it raining___',      'Choose the right end mark.', '?',  ['.','!'], 2.20, 'end-marks', 'grammar'),
  T('endmk-4', 'Run as fast as you can___', 'Choose the right end mark.', '!', ['.','?'], 2.20, 'end-marks', 'grammar'),

  // Proper vs common nouns (W8–9, 2.25–2.28)
  T('propn-1', 'Fido',   'Common or proper noun?', 'proper', ['common','verb'],      2.25, 'proper-nouns', 'grammar'),
  T('propn-2', 'dog',    'Common or proper noun?', 'common', ['proper','verb'],      2.25, 'proper-nouns', 'grammar'),
  T('propn-3', 'London', 'Common or proper noun?', 'proper', ['common','adjective'], 2.26, 'proper-nouns', 'grammar'),
  T('propn-4', 'city',   'Common or proper noun?', 'common', ['proper','verb'],      2.26, 'proper-nouns', 'grammar'),
  T('propn-5', 'my dog is named rex.', 'Which word needs a capital?', 'Rex', ['dog','my'],    2.28, 'proper-nouns', 'grammar'),
  T('propn-6', 'we saw mary at school.','Which word needs a capital?','Mary',['school','saw'], 2.28, 'proper-nouns', 'grammar'),

  // Regular plurals -s/-es (W10, 2.31)
  T('plur-reg-1', 'dog → ___',  'Add the right ending.', 'dogs',  ['doges','dogges'], 2.31, 'plurals', 'grammar'),
  T('plur-reg-2', 'box → ___',  'Add the right ending.', 'boxes', ['boxs','boxed'],   2.31, 'plurals', 'grammar'),
  T('plur-reg-3', 'bus → ___',  'Add the right ending.', 'buses', ['buss','busd'],    2.32, 'plurals', 'grammar'),
  T('plur-reg-4', 'dish → ___', 'Add the right ending.', 'dishes',['dishs','dish'],  2.32, 'plurals', 'grammar'),
  T('plur-reg-5', 'cat → ___',  'Add the right ending.', 'cats',  ['cates','cats.'],  2.30, 'plurals', 'grammar'),

  // Irregular plurals (W11, 2.34)
  T('irr-plur-1', 'mouse → ___', 'Irregular plural?', 'mice',     ['mouses','mices'],   2.34, 'irregular-plurals', 'grammar'),
  T('irr-plur-2', 'foot → ___',  'Irregular plural?', 'feet',     ['foots','feets'],    2.34, 'irregular-plurals', 'grammar'),
  T('irr-plur-3', 'tooth → ___', 'Irregular plural?', 'teeth',    ['tooths','teeths'],  2.35, 'irregular-plurals', 'grammar'),
  T('irr-plur-4', 'man → ___',   'Irregular plural?', 'men',      ['mans','manes'],     2.35, 'irregular-plurals', 'grammar'),
  T('irr-plur-5', 'child → ___', 'Irregular plural?', 'children', ['childs','childes'], 2.36, 'irregular-plurals', 'grammar'),

  // More point-of-view / narrator (W11, 2.34)
  T('narr-1', '"I went to the park."', 'Who is narrating?', 'the writer',   ['a character','nobody'], 2.34, 'point-of-view', 'reading'),
  T('narr-2', '"She ran away fast."',  'Who is narrating?', 'someone else', ['the writer','nobody'],   2.34, 'point-of-view', 'reading'),
  T('narr-3', '"He hit the ball."',    'Who is narrating?', 'someone else', ['the writer','nobody'],   2.36, 'point-of-view', 'reading'),

  // Possessive nouns (W13, 2.41)
  T('poss-1', "The cat's toy",  'What does this show?', 'the toy belongs to the cat', ['the cat is a toy','two cats'],    2.41, 'possessive-nouns', 'grammar'),
  T('poss-2', "The dog's bone", 'What does this show?', 'the bone belongs to the dog',['the dog and a bone','two dogs'], 2.41, 'possessive-nouns', 'grammar'),
  T('poss-3', "Sam ___ book",   'Fill in the possessive.', "Sam's", ["Sams","Sam s"],                                    2.42, 'possessive-nouns', 'grammar'),
  T('poss-4', "The boy's hat — whose hat?", 'Pick the answer.', 'the boy', ['the hat','all the boys'],                   2.42, 'possessive-nouns', 'grammar'),

  // Personal pronouns (W14–15, 2.44)
  T('pron-1', 'Sara runs fast. ___ is fast.',   'Choose the right pronoun.', 'She',  ['Her','They'], 2.44, 'pronouns', 'grammar'),
  T('pron-2', 'Tom eats lunch. ___ is hungry.', 'Choose the right pronoun.', 'He',   ['His','They'], 2.44, 'pronouns', 'grammar'),
  T('pron-3', 'The kids play. ___ are happy.',  'Choose the right pronoun.', 'They', ['Them','He'],  2.46, 'pronouns', 'grammar'),
  T('pron-4', 'Give books to the kids. Give the books to ___.', 'Choose the right pronoun.', 'them', ['they','their'], 2.46, 'pronouns', 'grammar'),

  // Possessive pronouns (W16–17, 2.50)
  T('posspron-1', '___ dog is cute. (mine)', 'Choose the right pronoun.', 'My',   ['Mine','Me'],  2.50, 'possessive-pronouns', 'grammar'),
  T('posspron-2', 'That toy is ___. (mine)', 'Choose the right pronoun.', 'mine', ['my','me'],    2.50, 'possessive-pronouns', 'grammar'),
  T('posspron-3', '___ cat is gray. (hers)', 'Choose the right pronoun.', 'Her',  ['Hers','She'], 2.52, 'possessive-pronouns', 'grammar'),

  // Silent-e words (W16–17, 2.50)
  E('🎂', 'cake', ['cak','cack'],   2.50, 'Which spells this correctly?', 'silent-e', 'spelling'),
  E('🪁', 'kite', ['kit','kitt'],   2.50, 'Which spells this correctly?', 'silent-e', 'spelling'),
  E('🦴', 'bone', ['bon','bonne'],  2.52, 'Which spells this correctly?', 'silent-e', 'spelling'),
  E('🌹', 'rose', ['ros','rozz'],   2.52, 'Which spells this correctly?', 'silent-e', 'spelling'),
  T('sil-e-1', 'hop → add e → ___', 'Silent e changes the vowel.', 'hope', ['hoop','hoppe'], 2.50, 'silent-e', 'reading'),
  T('sil-e-2', 'pin → add e → ___', 'Silent e changes the vowel.', 'pine', ['peen','pinne'], 2.50, 'silent-e', 'reading'),
  T('sil-e-3', 'cap → add e → ___', 'Silent e changes the vowel.', 'cape', ['capp','cappe'], 2.52, 'silent-e', 'reading'),
  T('sil-e-4', 'Which word has a LONG vowel?', 'Silent e or short?', 'pine', ['pin','tip'], 2.54, 'silent-e', 'reading'),
  T('sil-e-5', 'Which word has a SHORT vowel?', 'Silent e or short?', 'hop',  ['hope','rope'],2.54, 'silent-e', 'reading'),

  // -ng / -nk words (W17, 2.53)
  T('ng-1', 'ri__', 'Add the right ending.', 'ng', ['nk','nd'], 2.53, 'ng-nk', 'reading'),
  T('nk-1', 'ta__', 'Add the right ending.', 'nk', ['ng','nd'], 2.53, 'ng-nk', 'reading'),
  T('ng-2', 'Which word ends with -ng?', 'Pick the right word.', 'sing', ['sink','sand'], 2.54, 'ng-nk', 'reading'),
  T('nk-2', 'Which word ends with -nk?', 'Pick the right word.', 'sink', ['sing','hang'], 2.54, 'ng-nk', 'reading'),
  E('💍', 'ring', ['rink','ding'],  2.53, 'What is this?', 'ng-nk'),
  E('⚓', 'tank', ['rank','tang'],  2.53, 'What is this?', 'ng-nk'),

  // ===================================================================
  // 1st GRADE — Weeks 17–32  (levels 2.53–3.0)
  // ===================================================================

  // Action verbs — identify (W18, 2.56)
  T('av-1', 'The dog RUNS fast.',   'Which is the action verb?', 'runs', ['dog','fast'],  2.56, 'identify-action-verb', 'grammar'),
  T('av-2', 'Birds FLY high.',      'Which is the action verb?', 'fly',  ['birds','high'],2.56, 'identify-action-verb', 'grammar'),
  T('av-3', 'I JUMP up.',           'Which is the action verb?', 'jump', ['I','up'],      2.57, 'identify-action-verb', 'grammar'),
  T('av-4', 'She READS every day.', 'Which is the action verb?', 'reads',['she','every'], 2.57, 'identify-action-verb', 'grammar'),

  // Blend/digraph sort (W19, 2.59)
  T('bdsort-1', 'sh (ship) — blend or digraph?', 'Blend or digraph?', 'digraph', ['blend','vowel'], 2.59, 'blend-digraph-sort', 'reading'),
  T('bdsort-2', 'fr (frog) — blend or digraph?', 'Blend or digraph?', 'blend',   ['digraph','vowel'],2.59, 'blend-digraph-sort', 'reading'),
  T('bdsort-3', 'th (three) — blend or digraph?','Blend or digraph?', 'digraph', ['blend','vowel'], 2.60, 'blend-digraph-sort', 'reading'),
  T('bdsort-4', 'bl (blue) — blend or digraph?', 'Blend or digraph?', 'blend',   ['digraph','vowel'],2.60, 'blend-digraph-sort', 'reading'),

  // Verb tenses — present / past (W19–20, 2.59–2.63)
  T('tense-1', 'The cat sleeps.',  'Present or past?', 'present', ['past','future'], 2.59, 'verb-tense', 'grammar'),
  T('tense-2', 'The dog ran.',     'Present or past?', 'past',    ['present','future'],2.59,'verb-tense','grammar'),
  T('tense-3', 'She plays outside.','Present or past?','present', ['past','future'], 2.60, 'verb-tense', 'grammar'),
  T('tense-4', 'He jumped high.',  'Present or past?', 'past',    ['present','future'],2.60,'verb-tense','grammar'),

  // Vowel teams (W20–21, 28, 2.63–2.88)
  T('vteam-1', 'r_n (rain)', 'Pick the vowel team.', 'ai', ['ei','ou'], 2.63, 'vowel-teams', 'reading'),
  T('vteam-2', 'b_t (boat)', 'Pick the vowel team.', 'oa', ['ai','ee'], 2.63, 'vowel-teams', 'reading'),
  T('vteam-3', 'h_t (heat)', 'Pick the vowel team.', 'ea', ['ee','ai'], 2.65, 'vowel-teams', 'reading'),
  T('vteam-4', 's_n (seen)', 'Pick the vowel team.', 'ee', ['ea','ei'], 2.65, 'vowel-teams', 'reading'),
  T('vteam-5', 'c_n (coin)', 'Pick the vowel team.', 'oi', ['oa','ai'], 2.88, 'vowel-teams', 'reading'),
  T('vteam-6', 'b_l (bowl)', 'Pick the vowel team.', 'ow', ['oa','ou'], 2.88, 'vowel-teams', 'reading'),
  E('🌧️', 'rain',  ['ran','ruin'],   2.63, 'Which is the vowel team word?', 'vowel-teams'),
  E('🚤', 'boat',  ['bat','boot'],   2.63, 'Which is the vowel team word?', 'vowel-teams'),
  E('🍃', 'leaf',  ['left','loaf'],  2.65, 'Which is the vowel team word?', 'vowel-teams'),

  // Short vs long vowel (1st grade level, W22–25, 2.69–2.78)
  T('svlv-1', 'cat or cake — which has a LONG vowel?', 'Short or long?', 'cake', ['cat','neither'], 2.69, 'short-vs-long', 'reading'),
  T('svlv-2', 'pin or pine — which has a LONG vowel?', 'Short or long?', 'pine', ['pin','neither'],  2.69, 'short-vs-long', 'reading'),
  T('svlv-3', 'hop or hope — which has a SHORT vowel?','Short or long?', 'hop',  ['hope','neither'], 2.72, 'short-vs-long', 'reading'),
  T('svlv-4', 'bed or bead — which has a LONG vowel?', 'Short or long?', 'bead', ['bed','neither'],  2.72, 'short-vs-long', 'reading'),
  T('svlv-5', 'bit or bite — which has a SHORT vowel?','Short or long?', 'bit',  ['bite','neither'], 2.74, 'short-vs-long', 'reading'),

  // Past tense formation (W22, 2.69)
  T('past-1', 'walk → past tense?', 'Form the past tense.', 'walked', ['walkd','walkt'],  2.69, 'past-tense', 'grammar'),
  T('past-2', 'jump → past tense?', 'Form the past tense.', 'jumped', ['jumpt','jumpd'],  2.69, 'past-tense', 'grammar'),
  T('past-3', 'play → past tense?', 'Form the past tense.', 'played', ['playd','plaid'],  2.70, 'past-tense', 'grammar'),
  T('past-4', 'help → past tense?', 'Form the past tense.', 'helped', ['helpd','helpt'],  2.70, 'past-tense', 'grammar'),

  // Spell silent-e words (W22, 2.69)
  T('spell-sile-1', '🎂', 'Spell the word.', 'cake', ['cak','caik'],  2.69, 'spell-silent-e', 'spelling'),
  T('spell-sile-2', '🪁', 'Spell the word.', 'kite', ['kit','kight'], 2.69, 'spell-silent-e', 'spelling'),
  T('spell-sile-3', '🦴', 'Spell the word.', 'bone', ['bon','boan'],  2.69, 'spell-silent-e', 'spelling'),

  // Articles a/an (W23–24, 2.72)
  T('art-1', '___ apple',    'Pick a or an.', 'an', ['a','the'],  2.72, 'articles', 'grammar'),
  T('art-2', '___ cat',      'Pick a or an.', 'a',  ['an','the'], 2.72, 'articles', 'grammar'),
  T('art-3', '___ elephant', 'Pick a or an.', 'an', ['a','the'],  2.73, 'articles', 'grammar'),
  T('art-4', '___ house',    'Pick a or an.', 'a',  ['an','the'], 2.73, 'articles', 'grammar'),
  T('art-5', '___ orange',   'Pick a or an.', 'an', ['a','the'],  2.74, 'articles', 'grammar'),
  T('art-6', '___ umbrella', 'Pick a or an.', 'an', ['a','the'],  2.74, 'articles', 'grammar'),

  // Sense words (W25, 2.78)
  T('sense-1', 'The cake tastes ___',        'Pick the sense word.', 'sweet', ['loud','rough'],  2.78, 'sense-words', 'vocabulary'),
  T('sense-2', 'The music sounds ___',       'Pick the sense word.', 'loud',  ['sour','sticky'], 2.78, 'sense-words', 'vocabulary'),
  T('sense-3', "The cat's fur feels ___",    'Pick the sense word.', 'soft',  ['sour','bright'], 2.79, 'sense-words', 'vocabulary'),
  T('sense-4', 'The flower smells ___',      'Pick the sense word.', 'sweet', ['rough','loud'],  2.79, 'sense-words', 'vocabulary'),
  T('sense-5', 'The lemon tastes ___',       'Pick the sense word.', 'sour',  ['soft','loud'],   2.80, 'sense-words', 'vocabulary'),

  // Identify adjectives (W26, 2.81)
  T('adjid-1', 'The big dog ran.',      'Which word is the adjective?', 'big',  ['dog','ran'],   2.81, 'identify-adjectives', 'grammar'),
  T('adjid-2', 'She has a red ball.',   'Which word is the adjective?', 'red',  ['ball','has'],  2.81, 'identify-adjectives', 'grammar'),
  T('adjid-3', 'The soft cat slept.',   'Which word is the adjective?', 'soft', ['cat','slept'], 2.82, 'identify-adjectives', 'grammar'),
  T('adjid-4', 'I drank cold water.',   'Which word is the adjective?', 'cold', ['drank','water'],2.82,'identify-adjectives','grammar'),

  // Related / ordered words (W20–21, 2.63–2.66)
  T('ordw-1', 'hot, warm, cold — order COLDEST first.', 'Pick the right order.', 'cold, warm, hot',     ['hot, warm, cold','warm, cold, hot'],        2.63, 'word-order', 'vocabulary'),
  T('ordw-2', 'tiny, small, huge — order SMALLEST first.','Pick the right order.','tiny, small, huge',   ['huge, small, tiny','small, huge, tiny'],     2.63, 'word-order', 'vocabulary'),
  T('ordw-3', 'whisper, talk, shout — order QUIETEST first.','Pick the right order.','whisper, talk, shout',['shout, talk, whisper','talk, whisper, shout'],2.66,'word-order','vocabulary'),
  T('relw-1', 'Find the word most related to "warm".', 'Pick the best match.', 'hot',    ['cold','wet'],   2.63, 'related-words', 'vocabulary'),
  T('relw-2', 'Find the word most related to "glad".',  'Pick the best match.', 'joyful', ['sad','mad'],   2.65, 'related-words', 'vocabulary'),

  // Prepositions (W27–28, 2.84–2.88)
  T('prep-1', 'The cat is ___ the box.',       'Pick the best preposition.', 'in',     ['and','run'],   2.84, 'prepositions', 'grammar'),
  T('prep-2', 'The bird flew ___ the tree.',   'Pick the best preposition.', 'over',   ['the','happy'], 2.84, 'prepositions', 'grammar'),
  T('prep-3', 'The cat hid ___ the bed.',      'Pick the best preposition.', 'under',  ['above','run'], 2.86, 'prepositions', 'grammar'),
  T('prep-4', 'The dog sat ___ the girl.',     'Pick the best preposition.', 'beside', ['happy','and'], 2.86, 'prepositions', 'grammar'),
  T('prep-5', '___ lunch, I wash my hands.',   'Pick the best preposition.', 'Before', ['After','And'], 2.88, 'prepositions', 'grammar'),

  // Context clues (W28, 2.88)
  T('ctx-1', 'The dog was thirsty. It drank a lot of ___.',    'Context clue.', 'water',    ['cake','books'],  2.88, 'context-clues', 'vocabulary'),
  T('ctx-2', 'She was tired after running. She went to ___.',  'Context clue.', 'bed',      ['school','pool'], 2.88, 'context-clues', 'vocabulary'),
  T('ctx-3', 'It was freezing outside. She put on her ___.',   'Context clue.', 'coat',     ['hat','gloves'],  2.89, 'context-clues', 'vocabulary'),

  // R-controlled vowels (W29, 2.91)
  E('🚗', 'car',  ['core','cur'],  2.91, 'What is this?', 'r-control'),
  E('🐦', 'bird', ['bard','berd'], 2.91, 'What is this?', 'r-control'),
  E('🌽', 'corn', ['carn','cern'], 2.91, 'What is this?', 'r-control'),
  E('⭐', 'star', ['stir','stor'], 2.92, 'What is this?', 'r-control'),
  T('rctrl-1', 'c_r (car)',  'Pick the r-controlled vowel.', 'ar', ['er','ir'], 2.91, 'r-control', 'reading'),
  T('rctrl-2', 'b_d (bird)', 'Pick the r-controlled vowel.', 'ir', ['ar','or'], 2.91, 'r-control', 'reading'),
  T('rctrl-3', 'c_n (corn)', 'Pick the r-controlled vowel.', 'or', ['ar','ur'], 2.92, 'r-control', 'reading'),
  T('rctrl-4', 't_n (turn)', 'Pick the r-controlled vowel.', 'ur', ['er','or'], 2.92, 'r-control', 'reading'),
  T('rctrl-5', 'f_n (fern)', 'Pick the r-controlled vowel.', 'er', ['ar','ir'], 2.91, 'r-control', 'reading'),

  // Conjunctions (W29, 2.91)
  T('conj-1', 'I like cats ___ dogs.',           'Pick the best conjunction.', 'and', ['is','run'],   2.91, 'conjunctions', 'grammar'),
  T('conj-2', 'I want to play ___ I am tired.',  'Pick the best conjunction.', 'but', ['and','the'],  2.91, 'conjunctions', 'grammar'),
  T('conj-3', 'Do you want cake ___ pie?',       'Pick the best conjunction.', 'or',  ['and','but'],  2.92, 'conjunctions', 'grammar'),
  T('conj-4', 'It was cold, ___ I wore a coat.', 'Pick the best conjunction.', 'so',  ['but','or'],   2.92, 'conjunctions', 'grammar'),

  // Diphthongs (W30, 2.94)
  E('🪙', 'coin', ['can','cone'],  2.94, 'Which is the diphthong word?', 'diphthongs'),
  E('🐄', 'cow',  ['caw','coo'],   2.94, 'Which is the diphthong word?', 'diphthongs'),
  T('diph-1', 'c_n (coin)',      'Pick the diphthong.', 'oi', ['oa','ou'], 2.94, 'diphthongs', 'reading'),
  T('diph-2', 'b_y (boy)',       'Pick the diphthong.', 'oy', ['oi','oa'], 2.94, 'diphthongs', 'reading'),
  T('diph-3', 'Which word? /ou/', 'Diphthong sound.',   'out', ['oat','it'], 2.94, 'diphthongs', 'reading'),
  T('diph-4', 'c_l (cowl/owl)',  'Pick the diphthong.', 'ow', ['ou','oi'], 2.95, 'diphthongs', 'reading'),

  // Prefixes / suffixes (W30, 2.94)
  T('pref-1', 'un + happy = ___',  'Add the prefix.',  'unhappy',  ['nonhappy','dishappy'], 2.94, 'prefixes', 'vocabulary'),
  T('pref-2', 're + do = ___',     'Add the prefix.',  'redo',     ['undone','predor'],     2.94, 'prefixes', 'vocabulary'),
  T('pref-3', 'What does "unhappy" mean?', 'Prefix meaning.', 'not happy',  ['very happy','super happy'], 2.95, 'prefixes', 'vocabulary'),
  T('suf-1',  'play + ful = ___',  'Add the suffix.',  'playful',  ['playfully','playling'],2.94, 'suffixes', 'vocabulary'),
  T('suf-2',  'care + less = ___', 'Add the suffix.',  'careless', ['carefully','careness'],2.95, 'suffixes', 'vocabulary'),
  T('suf-3',  'What does "helpful" mean?', 'Suffix meaning.', 'full of help', ['not helpful','help again'], 2.95, 'suffixes', 'vocabulary'),

  // Time-order words (W30, 2.94)
  T('time-1', 'First I woke up. ___, I ate breakfast.', 'Pick the time-order word.', 'Then',    ['But','Before'],   2.94, 'time-order', 'vocabulary'),
  T('time-2', 'Which is a time-order word?',            'Pick the right answer.',    'first',   ['the','cat'],      2.94, 'time-order', 'vocabulary'),
  T('time-3', '___ she walked the dog, she fed it.',    'Pick the time-order word.', 'Before',  ['And','The'],      2.95, 'time-order', 'vocabulary'),
  T('time-4', '___ dinner, we played games.',           'Pick the time-order word.', 'After',   ['During','And'],   2.95, 'time-order', 'vocabulary'),
  T('time-5', 'First I swam. Then I rested. ___, I ate.','Pick the time-order word.','Finally', ['Before','And'],   2.95, 'time-order', 'vocabulary'),

  // Two-syllable words (W31–32, 2.97–3.0)
  T('2syl-1', 'bun + ny = ___',  'Blend the syllables.', 'bunny',  ['bunney','bunni'],  2.97, 'two-syllable', 'reading'),
  T('2syl-2', 'kit + ten = ___', 'Blend the syllables.', 'kitten', ['kittun','kiten'],  2.97, 'two-syllable', 'reading'),
  T('2syl-3', 'pup + py = ___',  'Blend the syllables.', 'puppy',  ['pupey','pupy'],    2.98, 'two-syllable', 'reading'),
  T('2syl-4', 'hap + py = ___',  'Blend the syllables.', 'happy',  ['hapey','hapy'],    2.99, 'two-syllable', 'reading'),
  T('2syl-5', 'pen + ny = ___',  'Blend the syllables.', 'penny',  ['peny','penney'],   2.98, 'two-syllable', 'reading'),
  T('2syl-6', 'Complete: ba___et (basket)', 'Two-syllable word.', 'basket', ['baskit','bascet'], 3.0, 'two-syllable', 'reading'),

  // Contractions (W31, 2.97)
  T('contr-1', 'do not → ___',   'What is the contraction?', "don't",  ["dont","do'nt"],  2.97, 'contractions', 'grammar'),
  T('contr-2', 'I am → ___',     'What is the contraction?', "I'm",    ["Im","I'am"],     2.97, 'contractions', 'grammar'),
  T('contr-3', 'can not → ___',  'What is the contraction?', "can't",  ["cant","can'ot"], 2.97, 'contractions', 'grammar'),
  T('contr-4', 'it is → ___',    'What is the contraction?', "it's",   ["its","it'is"],   2.98, 'contractions', 'grammar'),
  T('contr-5', 'will not → ___', 'What is the contraction?', "won't",  ["wont","will'nt"],2.98, 'contractions', 'grammar'),

  // Capitalize names (W32, 3.0)
  T('capnames-1', 'my dog spot loves to run.',  'Which word needs a capital?', 'Spot', ['run','dog'],    3.0, 'capitalization', 'grammar'),
  T('capnames-2', 'my friend mary is nice.',    'Which word needs a capital?', 'Mary', ['friend','nice'],3.0, 'capitalization', 'grammar'),
  T('capnames-3', 'our cat max is fluffy.',     'Which word needs a capital?', 'Max',  ['cat','fluffy'], 3.0, 'capitalization', 'grammar'),

  // ===================================================================
  // 1st Grade Sight Words — sets 1–7 (levels 2.09–2.86)
  // ===================================================================
  T('g1sw1-again','again','Find the word "again".',  'again', ['about','again.'], 2.09, '1g-sight-words-1', 'reading'),
  T('g1sw1-each', 'each', 'Find the word "each".',   'each',  ['ear','etch'],     2.09, '1g-sight-words-1', 'reading'),
  T('g1sw1-from', 'from', 'Find the word "from".',   'from',  ['form','for'],     2.09, '1g-sight-words-1', 'reading'),
  T('g1sw1-may',  'may',  'Find the word "may".',    'may',   ['day','bay'],      2.09, '1g-sight-words-1', 'reading'),
  T('g1sw1-stop', 'stop', 'Find the word "stop".',   'stop',  ['step','slope'],   2.10, '1g-sight-words-1', 'reading'),
  T('g1sw1-than', 'than', 'Find the word "than".',   'than',  ['then','that'],    2.10, '1g-sight-words-1', 'reading'),
  T('g1sw1-when', 'when', 'Find the word "when".',   'when',  ['then','what'],    2.10, '1g-sight-words-1', 'reading'),

  T('g1sw2-after','after','Find the word "after".',  'after', ['often','alter'],  2.22, '1g-sight-words-2', 'reading'),
  T('g1sw2-best', 'best', 'Find the word "best".',   'best',  ['rest','last'],    2.22, '1g-sight-words-2', 'reading'),
  T('g1sw2-gave', 'gave', 'Find the word "gave".',   'gave',  ['cave','give'],    2.22, '1g-sight-words-2', 'reading'),
  T('g1sw2-has',  'has',  'Find the word "has".',    'has',   ['had','was'],      2.22, '1g-sight-words-2', 'reading'),
  T('g1sw2-once', 'once', 'Find the word "once".',   'once',  ['one','ounce'],    2.24, '1g-sight-words-2', 'reading'),
  T('g1sw2-them', 'them', 'Find the word "them".',   'them',  ['then','that'],    2.24, '1g-sight-words-2', 'reading'),
  T('g1sw2-were', 'were', 'Find the word "were".',   'were',  ['here','where'],   2.24, '1g-sight-words-2', 'reading'),

  T('g1sw3-as',   'as',   'Find the word "as".',     'as',    ['at','if'],        2.41, '1g-sight-words-3', 'reading'),
  T('g1sw3-by',   'by',   'Find the word "by".',     'by',    ['my','buy'],       2.41, '1g-sight-words-3', 'reading'),
  T('g1sw3-four', 'four', 'Find the word "four".',   'four',  ['for','fore'],     2.41, '1g-sight-words-3', 'reading'),
  T('g1sw3-her',  'her',  'Find the word "her".',    'her',   ['here','him'],     2.42, '1g-sight-words-3', 'reading'),
  T('g1sw3-more', 'more', 'Find the word "more".',   'more',  ['mare','wore'],    2.42, '1g-sight-words-3', 'reading'),
  T('g1sw3-some', 'some', 'Find the word "some".',   'some',  ['same','home'],    2.42, '1g-sight-words-3', 'reading'),
  T('g1sw3-think','think','Find the word "think".',  'think', ['thing','thick'],  2.44, '1g-sight-words-3', 'reading'),
  T('g1sw3-way',  'way',  'Find the word "way".',    'way',   ['bay','say'],      2.44, '1g-sight-words-3', 'reading'),

  T('g1sw4-every','every','Find the word "every".',  'every', ['ever','even'],    2.56, '1g-sight-words-4', 'reading'),
  T('g1sw4-could','could','Find the word "could".',  'could', ['cloud','coold'],  2.56, '1g-sight-words-4', 'reading'),
  T('g1sw4-how',  'how',  'Find the word "how".',    'how',   ['who','hoe'],      2.56, '1g-sight-words-4', 'reading'),
  T('g1sw4-over', 'over', 'Find the word "over".',   'over',  ['oven','ever'],    2.57, '1g-sight-words-4', 'reading'),
  T('g1sw4-put',  'put',  'Find the word "put".',    'put',   ['but','puff'],     2.57, '1g-sight-words-4', 'reading'),
  T('g1sw4-there','there','Find the word "there".',  'there', ['three','their'],  2.57, '1g-sight-words-4', 'reading'),
  T('g1sw4-who',  'who',  'Find the word "who".',    'who',   ['how','what'],     2.58, '1g-sight-words-4', 'reading'),

  T('g1sw5-ask',  'ask',  'Find the word "ask".',    'ask',   ['ant','oak'],      2.69, '1g-sight-words-5', 'reading'),
  T('g1sw5-five', 'five', 'Find the word "five".',   'five',  ['hive','fine'],    2.69, '1g-sight-words-5', 'reading'),
  T('g1sw5-just', 'just', 'Find the word "just".',   'just',  ['gust','bust'],    2.69, '1g-sight-words-5', 'reading'),
  T('g1sw5-long', 'long', 'Find the word "long".',   'long',  ['song','logs'],    2.70, '1g-sight-words-5', 'reading'),
  T('g1sw5-read', 'read', 'Find the word "read".',   'read',  ['lead','real'],    2.70, '1g-sight-words-5', 'reading'),
  T('g1sw5-then', 'then', 'Find the word "then".',   'then',  ['when','them'],    2.70, '1g-sight-words-5', 'reading'),
  T('g1sw5-want', 'want', 'Find the word "want".',   'want',  ['went','wand'],    2.71, '1g-sight-words-5', 'reading'),

  T('g1sw6-any',  'any',  'Find the word "any".',    'any',   ['man','ant'],      2.78, '1g-sight-words-6', 'reading'),
  T('g1sw6-give', 'give', 'Find the word "give".',   'give',  ['live','gave'],    2.78, '1g-sight-words-6', 'reading'),
  T('g1sw6-his',  'his',  'Find the word "his".',    'his',   ['hid','this'],     2.78, '1g-sight-words-6', 'reading'),
  T('g1sw6-new',  'new',  'Find the word "new".',    'new',   ['now','few'],      2.79, '1g-sight-words-6', 'reading'),
  T('g1sw6-open', 'open', 'Find the word "open".',   'open',  ['oven','even'],    2.79, '1g-sight-words-6', 'reading'),
  T('g1sw6-sleep','sleep','Find the word "sleep".',  'sleep', ['steep','sheep'],  2.80, '1g-sight-words-6', 'reading'),
  T('g1sw6-wish', 'wish', 'Find the word "wish".',   'wish',  ['fish','wash'],    2.80, '1g-sight-words-6', 'reading'),

  T('g1sw7-also', 'also', 'Find the word "also".',   'also',  ['alto','also.'],   2.84, '1g-sight-words-7', 'reading'),
  T('g1sw7-fly',  'fly',  'Find the word "fly".',    'fly',   ['fry','fly.'],     2.84, '1g-sight-words-7', 'reading'),
  T('g1sw7-know', 'know', 'Find the word "know".',   'know',  ['now','knew'],     2.84, '1g-sight-words-7', 'reading'),
  T('g1sw7-live', 'live', 'Find the word "live".',   'live',  ['like','love'],    2.85, '1g-sight-words-7', 'reading'),
  T('g1sw7-old',  'old',  'Find the word "old".',    'old',   ['bold','told'],    2.85, '1g-sight-words-7', 'reading'),
  T('g1sw7-soon', 'soon', 'Find the word "soon".',   'soon',  ['moon','noon'],    2.85, '1g-sight-words-7', 'reading'),
  T('g1sw7-why',  'why',  'Find the word "why".',    'why',   ['who','how'],      2.86, '1g-sight-words-7', 'reading'),
];

export function answerOf(q: Question): string {
  return q.answer;
}
