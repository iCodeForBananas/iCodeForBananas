/**
 * The Word Climb reading ladder: everything a child can be shown, easiest first.
 *
 * The single words are the Dolch lists (220 service words by level, plus the 95
 * nouns), which are the established sight-word sequence. The decodable words
 * follow the usual phonics order: CVC, blends and digraphs, silent e and vowel
 * teams, r-controlled and tricky spellings, then multisyllable words.
 *
 * Phrases and sentences are written for this game against a controlled
 * vocabulary. wordClimbContent.test.ts fails if a sentence uses a word that
 * isn't on a card at or before its own level, so a child is never asked to read
 * something the ladder hasn't taught. A word that really has to appear early
 * goes in that level's `extraWords`, where it is visible.
 *
 * To add grades 4-12, append levels to LEVELS. Nothing else changes: grades are
 * derived from the levels, and a card's saved progress is keyed on its text, so
 * existing progress survives levels being added or reordered.
 */

export type CardKind = "word" | "phrase" | "sentence";

export interface Level {
  id: string;
  grade: string;
  title: string;
  kind: CardKind;
  /** Inclusive bounds on words per card, pinned by the content test. */
  minWords: number;
  maxWords: number;
  texts: string[];
  /** Words a phrase or sentence may use beyond what earlier cards taught. */
  extraWords?: string[];
}

export interface Card {
  id: string;
  text: string;
  kind: CardKind;
  levelId: string;
  levelIndex: number;
  words: number;
  syllables: number;
}

// ─── Dolch lists, split so that a level is a sitting's worth of new words ─────

export const DOLCH_PRE_PRIMER = [
  "a", "I", "to", "go", "me", "my", "we", "up", "in", "it", "is", "see", "the", "and", "can", "you", "big", "run", "red", "not",
  "one", "two", "for", "said", "look", "come", "blue", "down", "here", "help", "jump", "make", "play", "find", "away", "three", "where", "funny", "little", "yellow",
];
export const DOLCH_PRIMER = [
  "at", "am", "he", "on", "no", "so", "do", "be", "all", "are", "but", "did", "eat", "get", "ate", "new", "now", "our", "out", "ran", "saw", "say", "she", "too", "was", "yes",
  "came", "good", "have", "into", "like", "must", "soon", "that", "they", "this", "well", "went", "what", "who", "will", "with", "want", "ride", "four", "black", "brown", "white", "there", "under", "please", "pretty",
];
export const DOLCH_FIRST = [
  "an", "as", "by", "of", "ask", "any", "fly", "had", "has", "her", "him", "his", "how", "let", "may", "old", "put", "from", "just", "stop", "take",
  "give", "know", "live", "once", "open", "over", "some", "them", "then", "thank", "think", "walk", "were", "when", "after", "again", "could", "every", "going", "round",
];
export const DOLCH_SECOND = [
  "us", "or", "off", "its", "sit", "use", "buy", "call", "best", "both", "cold", "does", "fast", "five", "gave", "goes", "made", "many", "pull", "read", "tell", "very", "wash",
  "around", "always", "because", "been", "before", "don't", "first", "found", "green", "right", "sing", "sleep", "their", "these", "those", "upon", "which", "why", "wish", "work", "would", "write", "your",
];
export const DOLCH_THIRD = [
  "if", "cut", "far", "got", "hot", "own", "six", "ten", "try", "fall", "full", "done", "draw", "grow", "hold", "hurt", "keep", "kind", "long", "much", "pick",
  "warm", "show", "small", "shall", "start", "light", "laugh", "eight", "drink", "clean", "bring", "about", "better", "carry", "myself", "never", "only", "seven", "today", "together",
];
export const DOLCH_NOUNS = [
  "cat", "dog", "pig", "sun", "man", "men", "bed", "box", "top", "leg", "hand", "egg", "cow", "car", "boy", "toy", "day", "way", "ball", "bell", "fish", "doll", "duck", "hill", "door",
  "home", "house", "tree", "bird", "boat", "cake", "coat", "farm", "rain", "seed", "snow", "song", "ring", "corn", "nest", "milk", "head", "feet", "girl", "game", "name", "back", "wind", "wood", "time", "thing", "bear", "eye", "fire", "shoe", "night",
  "bread", "chair", "floor", "grass", "ground", "horse", "school", "sheep", "stick", "street", "watch",
  "apple", "baby", "birthday", "brother", "chicken", "children", "Christmas", "farmer", "father", "flower", "garden", "goodbye", "kitty", "letter", "money", "morning", "mother", "paper", "party", "picture", "rabbit", "robin", "Santa Claus", "sister", "squirrel", "table", "water", "window",
];

const slice = (list: string[], from: number, to: number) => list.slice(from, to);

// ─── The ladder ───────────────────────────────────────────────────────────────

const K = "Kindergarten";
const G1 = "Grade 1";
const G2 = "Grade 2";
const G3 = "Grade 3";

export const LEVELS: Level[] = [
  // ── Kindergarten ──
  { id: "k-sight-1", grade: K, title: "First sight words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_PRE_PRIMER, 0, 20) },
  { id: "k-sight-2", grade: K, title: "More sight words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_PRE_PRIMER, 20, 40) },
  {
    id: "k-phrases-1", grade: K, title: "Two words together", kind: "phrase", minWords: 2, maxWords: 2,
    texts: [
      "go up", "go down", "see me", "look up", "come here", "my red", "big red", "the blue", "run away", "jump up", "help me", "you can",
      "we go", "I see", "I can", "I jump", "it is", "is it", "in here", "up here", "down here", "not me", "not you", "one big",
      "two blue", "three red", "for me", "for you", "to play", "to go", "to me", "look here", "and you",
    ],
  },
  {
    id: "k-cvc", grade: K, title: "Sound it out", kind: "word", minWords: 1, maxWords: 1,
    texts: ["mat", "sat", "hat", "bat", "pan", "fan", "map", "nap", "cap", "van", "jam", "pen", "net", "wet", "jet", "hen", "pet", "hit", "pin", "dig", "wig", "fit", "lip", "pot", "mop", "dot", "log", "fog", "cub", "bug", "rug", "mud", "hug", "bus", "nut", "cup", "pup", "fun"],
  },
  { id: "k-nouns-1", grade: K, title: "Things around us", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_NOUNS, 0, 25) },
  {
    id: "k-sentences-1", grade: K, title: "Tiny sentences", kind: "sentence", minWords: 3, maxWords: 4,
    texts: [
      "I see you.", "I can run.", "We can go.", "We can play.", "I can help.", "I can jump.", "See the cat.", "See the dog.", "Go to bed.", "Run to me.", "Come and play.", "It is big.",
      "It is red.", "It is funny.", "Is it you?", "Where is it?", "Here it is.", "You can go.", "I see a pig.", "The sun is up.", "My cat is funny.", "The dog can run.", "I see my hat.", "A pig can jump.",
      "The bug is little.", "Look down here.",
    ],
  },
  { id: "k-sight-3", grade: K, title: "Primer words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_PRIMER, 0, 26) },
  { id: "k-sight-4", grade: K, title: "More primer words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_PRIMER, 26, 52) },
  {
    id: "k-phrases-2", grade: K, title: "Little phrases", kind: "phrase", minWords: 2, maxWords: 3,
    texts: [
      "with me", "with you", "he said", "she said", "they ran", "we saw", "so big", "too big", "too funny", "no way", "all day", "good dog", "good boy", "black cat", "brown dog", "white duck", "new toy", "pretty doll", "yes please", "please help",
      "on the bed", "in the box", "at the top", "under the bed", "out to play", "want to go", "like to eat", "like to play", "come with me", "get the ball", "must go now",
    ],
  },
  {
    id: "k-sentences-2", grade: K, title: "Short sentences", kind: "sentence", minWords: 4, maxWords: 5,
    texts: [
      "We like to play.", "I want to go.", "The cat is black.", "The dog is brown.", "She is so pretty.", "We will eat soon.", "Please come and play.", "This is my hand.", "That is my ball.", "I am too little.", "Get on the bed.", "The boy ran away.",
      "Look at the sun.", "Look at that fish!", "Yes, I will help.", "No, it is not.", "Our dog can jump.", "There is the man.", "She can ride with me.", "He ran to the top.", "I like my new toy.", "They are in the box.", "He saw a big pig.", "Did you see the duck?",
      "What is in the box?", "Who is at the door?", "Is he out there?",
    ],
  },

  // ── Grade 1 ──
  { id: "g1-sight-1", grade: G1, title: "First grade sight words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_FIRST, 0, 21) },
  { id: "g1-sight-2", grade: G1, title: "More first grade words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_FIRST, 21, 41) },
  {
    id: "g1-blends", grade: G1, title: "Blends and digraphs", kind: "word", minWords: 1, maxWords: 1,
    texts: ["ship", "shop", "shut", "chin", "chop", "chat", "thin", "bath", "dish", "rich", "lunch", "frog", "flag", "clap", "crab", "drum", "plum", "slip", "snap", "spot", "swim", "trip", "step", "tent", "lamp", "sand", "belt", "gift", "kick", "sock", "lock"],
  },
  { id: "g1-nouns-2", grade: G1, title: "Home and outside", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_NOUNS, 25, 46) },
  { id: "g1-nouns-3", grade: G1, title: "More things to name", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_NOUNS, 46, 67) },
  {
    id: "g1-phrases", grade: G1, title: "Longer phrases", kind: "phrase", minWords: 2, maxWords: 4,
    texts: [
      "thank you", "fly away", "every day", "them all", "over the hill", "from the farm", "by the door", "some of them", "after the rain", "walk to school", "take a bath", "put it on", "open the door", "stop and think",
      "just like her", "let me go", "his old hat", "her new coat", "ask the man", "round and round", "again and again", "could not go", "a song for you", "give it to him", "how old are you", "going to the farm", "when it is time",
    ],
  },
  {
    id: "g1-sentences-1", grade: G1, title: "Reading sentences", kind: "sentence", minWords: 5, maxWords: 6,
    texts: [
      "She put her hat on.", "He has a red ship.", "I know how to swim.", "Give the dog a bath.", "Can you walk to school?", "Thank you for the cake.", "Take the ball to him.", "When will the rain stop?", "How old is that horse?",
      "The frog sat on a log.", "We had fun at the farm.", "Stop and look at the bird.", "The old man had a lamp.", "The snow is on the tree.", "Open the box and look in.", "The girl has a new song.", "Let me help you with that.",
      "Walk over the hill with me.", "The duck can swim and fly.", "His coat is on the chair.", "Some of them are going home.", "Put the plum in the dish.", "A crab is in the sand.",
    ],
  },
  {
    id: "g1-sentences-2", grade: G1, title: "Bigger sentences", kind: "sentence", minWords: 6, maxWords: 8,
    texts: [
      "They were walking down the street.", "We saw a crab in the sand.", "I think it is time to go.", "Some birds can fly over the house.", "She could not open the old door.", "After the rain, we went to play.", "Every day I walk to the farm.", "He had a gift for the girl.",
      "The ship stopped by the sand again.", "Thank you for giving me the flag.", "Her black sheep ran over the grass.", "I know where the little pig lives.", "Look at them jump on the floor.", "May I take a bath after lunch?",
      "Once there was a frog on a log.", "Did you ask him to come and play?", "The big bear is going into the wood.", "We can stop at the shop and eat.", "Then he put the sock on his feet.", "How could the pig get on the bed?",
    ],
  },

  // ── Grade 2 ──
  { id: "g2-sight-1", grade: G2, title: "Second grade sight words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_SECOND, 0, 23) },
  { id: "g2-sight-2", grade: G2, title: "More second grade words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_SECOND, 23, 46) },
  {
    id: "g2-vowels", grade: G2, title: "Silent e and vowel teams", kind: "word", minWords: 1, maxWords: 1,
    texts: ["bike", "kite", "lake", "rope", "bone", "cube", "mule", "tube", "hide", "wave", "same", "tail", "sail", "mail", "stay", "road", "soap", "toad", "bee", "jeep", "leaf", "meat", "team", "moon", "food", "pool", "spoon", "book", "cook", "foot", "owl", "town", "loud", "cloud", "boil", "coin"],
  },
  {
    id: "g2-phrases", grade: G2, title: "Reading in chunks", kind: "phrase", minWords: 3, maxWords: 5,
    texts: [
      "write your name here", "first day of school", "because I said so", "which one is best", "around the green tree", "those five little birds", "always wash your hands", "would you read it", "tell me why you sing", "don't pull the rope",
      "very fast on the road", "goes to work by car", "gave me a new book", "wish upon the moon", "before it gets cold", "upon a big green hill", "many fish in the lake",
    ],
  },
  {
    id: "g2-syllables", grade: G2, title: "Two-beat words", kind: "word", minWords: 1, maxWords: 2,
    texts: [
      ...slice(DOLCH_NOUNS, 67, 95),
      "sunset", "bedtime", "cupcake", "pancake", "snowman", "raincoat", "football", "rainbow", "popcorn", "sailboat", "backpack", "inside", "outside",
    ],
  },
  {
    id: "g2-sentences-1", grade: G2, title: "Second grade sentences", kind: "sentence", minWords: 7, maxWords: 9,
    texts: [
      "It is very cold outside this morning.", "Write your name on the first paper.", "Please wash your hands before you eat lunch.", "My sister found a coin under the table.", "We always sing a song before we sleep.", "Why does the moon come out at night?", "Which book did you read first at school?", "Your mother made a cake for my birthday.",
      "Call me when you get to the lake.", "Both of the boats went around the lake.", "I wish I could ride on a sailboat.", "Her brother goes to work in the town.", "These are the best pancakes I have had.", "Many children walk to school on this road.", "The cook made food for all of us.",
      "The green kite went very fast in the wind.", "Those birds sleep in the tree by my house.", "Don't pull on the tail of that big cow.", "We made a snowman by the big green tree.", "Tell me why you put soap on the dog.", "The owl found food in the woods at night.", "Would you like to read this book with me?",
    ],
  },
  {
    id: "g2-sentences-2", grade: G2, title: "Sentences with long words", kind: "sentence", minWords: 9, maxWords: 11,
    texts: [
      "My father and mother made popcorn for the party.", "The little rabbit found an apple under the window.", "Christmas is the very best day for many children.", "Santa Claus will come down to see the children.", "Would you please write a letter to your sister?", "Mother made a cupcake for every girl and boy.", "Those flowers in the garden are always very pretty.",
      "He gave me five seeds to put in the garden.", "We put on our raincoats because it will rain soon.", "After the football game, we all went out for food.", "Before bedtime, my sister reads a book to the baby.", "The farmer gave the chicken some water in the morning.", "My brother would like a new backpack for his birthday.", "There is a picture of a rainbow on the paper.",
      "Because it was cold, the kitty went inside the house.", "The squirrel ran around the tree and found a seed.", "We said goodbye to the robin when it went away.", "I put my money on the table by the window.",
    ],
  },

  // ── Grade 3 ──
  { id: "g3-sight-1", grade: G3, title: "Third grade sight words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_THIRD, 0, 21) },
  { id: "g3-sight-2", grade: G3, title: "More third grade words", kind: "word", minWords: 1, maxWords: 1, texts: slice(DOLCH_THIRD, 21, 41) },
  {
    id: "g3-spellings", grade: G3, title: "Tricky spellings", kind: "word", minWords: 1, maxWords: 1,
    texts: ["star", "park", "yard", "card", "shirt", "dirt", "fern", "fork", "storm", "turn", "burn", "knee", "knife", "wrist", "thumb", "lamb", "phone", "bridge", "edge", "catch", "match", "might", "high"],
  },
  {
    id: "g3-sentences-1", grade: G3, title: "Third grade sentences", kind: "sentence", minWords: 9, maxWords: 12,
    texts: [
      "I can carry the small box by myself today.", "Never cut the paper with a very big knife.", "Seven children can sit at the long table today.", "Only six of the ten birds will fly away.", "Shall we start the game now or after lunch?", "The seed will grow into a small green tree.",
      "If you keep trying, you will get better at it.", "My sister drinks warm milk before she goes to sleep.", "It was so hot that we got a cold drink.", "The storm started in the morning and did not stop.", "Bring your clean shirt and put it on the table.", "Please turn the light off before you go to bed.", "Keep your feet warm when you walk in the snow.", "The kind man will hold the door for us today.", "A full moon gave us light on our long walk.", "We were done with all of our work by night.",
      "We laughed together when the funny dog jumped over the bed.", "I picked eight green apples and put them in a box.", "How far is the bridge from the school and your house?", "She would like to show you the star in the picture.", "He hurt his thumb when he tried to catch the ball.", "Much of the dirt on my shirt came from the park.",
    ],
  },
  {
    id: "g3-multisyllable", grade: G3, title: "Three-beat words", kind: "word", minWords: 1, maxWords: 1,
    texts: ["butterfly", "wonderful", "remember", "family", "tomorrow", "yesterday", "banana", "elephant", "dinosaur", "important", "library", "adventure", "computer", "umbrella", "hospital", "basketball", "grandmother", "strawberry", "animal", "beautiful"],
  },
  {
    id: "g3-sentences-2", grade: G3, title: "Long sentences", kind: "sentence", minWords: 12, maxWords: 16,
    texts: [
      "The elephant at the park was the first animal that we saw today.", "Together we can clean the house and make it look wonderful for Christmas.",
      "My grandmother has a wonderful garden with flowers and strawberries by the back door.", "Tomorrow my family will go to the library to find a book about dinosaurs.", "Remember to bring your umbrella because a storm may start before we get home.", "On our adventure we walked over a long bridge and found a small boat.", "My brother likes to play basketball after school with the children on our street.", "The computer in the library is only for children who have a library card.", "When I got hurt, my mother went with me to the hospital right away.", "If you are kind to every animal, it may come and sit with you.", "The little squirrel always remembers where it put the seeds under the old tree.",
      "It is important to wash your hands before you eat and after you play outside.", "Today we will draw a picture of a dinosaur and show it to our family.", "Yesterday my sister found a beautiful flower growing by the small bridge in the park.",
      "The butterfly sat on a yellow banana for a long time before it went away.", "My family had a wonderful time at the party, and we did not want to go.",
    ],
  },
];

// ─── Measuring difficulty ─────────────────────────────────────────────────────

/** The words of a card, lowercased with punctuation removed. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z' ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Words the vowel-group rules below get wrong. */
const SYLLABLE_EXCEPTIONS: Record<string, number> = {
  every: 2,
  going: 2,
  homework: 2,
  notebook: 2,
  "don't": 1,
  fire: 1,
};

/**
 * Estimated syllables in one word. It orders cards easiest-first and labels them
 * for the grown-up, so an occasional miss on an unusual word is harmless.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return 0;
  if (w in SYLLABLE_EXCEPTIONS) return SYLLABLE_EXCEPTIONS[w];

  let stem = w.replace(/'s$/, "");
  if (/[^aeiouy]ed$/.test(stem) && !/[td]ed$/.test(stem)) stem = stem.slice(0, -2);
  else if (/[^aeiouy]es$/.test(stem) && !/(s|x|z|ch|sh)es$/.test(stem)) stem = stem.slice(0, -2) + "e";
  if (/[^aeiouy]e$/.test(stem) && !/[^aeiouy]le$/.test(stem)) stem = stem.slice(0, -1);
  stem = stem.replace(/qu/g, "q");

  return Math.max(1, stem.match(/[aeiouy]+/g)?.length ?? 0);
}

export function countTextSyllables(text: string): number {
  return tokenize(text).reduce((sum, word) => sum + countSyllables(word), 0);
}

// ─── Cards, built from the levels ─────────────────────────────────────────────

/** Keyed on the text and not the level, so moving a card keeps its progress. */
export function cardId(kind: CardKind, text: string): string {
  return `${kind}:${tokenize(text).join("-")}`;
}

/** One level's cards, shortest and fewest-syllable first. */
function buildLevelCards(level: Level, levelIndex: number): Card[] {
  return level.texts
    .map((text) => ({
      id: cardId(level.kind, text),
      text,
      kind: level.kind,
      levelId: level.id,
      levelIndex,
      words: tokenize(text).length,
      syllables: countTextSyllables(text),
    }))
    .sort((a, b) => a.words - b.words || a.syllables - b.syllables || a.text.length - b.text.length);
}

export const CARDS: Card[] = LEVELS.flatMap(buildLevelCards);

export const CARD_BY_ID: ReadonlyMap<string, Card> = new Map(CARDS.map((card) => [card.id, card]));

/** Grades in the order the ladder reaches them. */
export const GRADES: string[] = [...new Set(LEVELS.map((level) => level.grade))];
