"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import confetti from "canvas-confetti";
import {
  WordEntry, Tile, TILE_BG, PHONEME_SPEECH, WORD_BANK, pickWord,
} from "./words";

// ── Audio ─────────────────────────────────────────────────────────────────────

const CONSONANT_PHONEMES: Record<string, string> = {
  b: "buh.", c: "kuh.", d: "duh.", f: "fuh.", g: "guh.", h: "huh.",
  j: "juh.", k: "kuh.", l: "luh.", m: "muh.", n: "nuh.", p: "puh.",
  r: "rrr.", s: "sss.", t: "tuh.", v: "vuh.", w: "wuh.",
  x: "ks.",  y: "yuh.", z: "zzz.",
};

function getTileSound(tile: Tile): string {
  const k = tile.text.toLowerCase();
  return PHONEME_SPEECH[k] ?? CONSONANT_PHONEMES[k] ?? tile.text;
}

function speakPhoneme(tile: Tile) {
  if (tile.isSilent || typeof window === "undefined") return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(getTileSound(tile));
  u.lang = "en-US";
  u.rate = 0.6;
  u.pitch = 1.2;
  window.speechSynthesis.speak(u);
}

function speakWord(word: string, rate = 0.65) {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.rate = rate;
  window.speechSynthesis.speak(u);
}

function playError() {
  if (typeof window === "undefined") return;
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(280, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(130, ctx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* noop */ }
}

// ── Emoji map ─────────────────────────────────────────────────────────────────

const WORD_EMOJI: Record<string, string> = {
  at: "👆", it: "✨", on: "🔛", mat: "🛏️", sat: "🪑", sit: "🪑",
  bit: "🦷", nod: "👍", got: "🎁", big: "🐘", him: "👦", dig: "⛏️",
  bat: "🦇", cat: "🐱", hat: "🎩", rat: "🐀", map: "🗺️", cap: "🧢",
  bag: "👜", pan: "🍳", van: "🚐", can: "🥫", fan: "🌬️",
  pin: "📌", lip: "👄", dip: "🫙", tip: "👆", pop: "🍿",
  hop: "🐸", mop: "🧹", top: "🌀", dot: "⚫",
  dog: "🐶", run: "🏃", sun: "☀️", fun: "🎉", cup: "☕", bug: "🐛",
  mud: "🪣", net: "🕸️", red: "🔴", bed: "🛏️", leg: "🦵", pet: "🐾",
  flag: "🚩", clap: "👏", step: "👣", frog: "🐸", trap: "🪤",
  plan: "📋", grip: "✊", drip: "💧", slug: "🐌", snap: "📸",
  spin: "🌀", flat: "🏔️", flip: "🤸", flap: "🐦", sled: "🛷",
  crab: "🦀", drum: "🥁", crop: "🌾",
  ship: "🚢", chip: "🍟", thin: "📏", fish: "🐟", dish: "🍽️",
  wish: "⭐", shop: "🛍️", chop: "🪓", shed: "🏚️", whip: "🪢",
  cake: "🎂", make: "🔨", lake: "🌊", wake: "⏰", bike: "🚲",
  like: "❤️", time: "⏰", bone: "🦴", home: "🏠", note: "📝",
  rope: "🪢", cube: "📦",
  rain: "🌧️", tail: "🐈", sail: "⛵", mail: "📬", feet: "👣",
  tree: "🌳", seed: "🌱", boat: "⛵", coat: "🧥", road: "🛣️",
  toad: "🐸", leaf: "🍃", bean: "🫘",
  star: "⭐", farm: "🌾", corn: "🌽", bird: "🐦", girl: "👧",
};

// ── Data layer ────────────────────────────────────────────────────────────────

type PhonemeRecord = { text: string; type: string; latencyMs: number };
type WordRecord = {
  wordId: string; word: string; timestamp: number;
  challenge: string; mistakes: number; totalMs: number; phonemes: PhonemeRecord[];
};

function saveToHistory(r: WordRecord) {
  if (typeof window === "undefined") return;
  try {
    const prev: WordRecord[] = JSON.parse(localStorage.getItem("baw_history") ?? "[]");
    prev.push(r);
    localStorage.setItem("baw_history", JSON.stringify(prev.slice(-200)));
  } catch { /* noop */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Decompose a word string into basic phoneme tiles (fallback for decoy words not in WORD_BANK)
function wordToBasicTiles(word: string): Tile[] {
  const result: Tile[] = [];
  let i = 0;
  while (i < word.length) {
    const pair = word.slice(i, i + 2).toLowerCase();
    if (["sh", "ch", "th", "wh", "ph", "ck"].includes(pair)) {
      result.push({ text: pair, type: "digraph" });
      i += 2;
    } else {
      const c = word[i].toLowerCase();
      result.push({ text: c, type: "aeiou".includes(c) ? "vowel" : "consonant" });
      i++;
    }
  }
  return result;
}

function getTilesForWord(wordText: string): Tile[] {
  const entry = WORD_BANK.find((w) => w.word === wordText);
  return entry
    ? entry.tiles.filter((t) => !t.isSilent)
    : wordToBasicTiles(wordText);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function starsFor(mistakes: number) {
  return mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const START_LEVEL   = 1.5;
const MAX_LEVEL     = 2.9;
const REVIEW_EVERY  = 5;
const BLEND_STEP_MS = 560;
const DECOY_CHANCE  = 0.40;  // 40% of build rounds after word 3 add a decoy tile
const MATCH_EVERY   = 3;     // every Nth word (after warmup) is a minimal-pairs match

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase          = "start" | "challenge" | "blend" | "meaning";
type ChallengeKind  = "build" | "match";
type TaggedTile     = Tile & { origIdx: number };  // origIdx === -1 → decoy
type MatchOption    = { word: string; tiles: Tile[] };

// ── Component ─────────────────────────────────────────────────────────────────

export default function BuildAWord() {
  const [phase,         setPhase]         = useState<Phase>("start");
  const [word,          setWord]          = useState<WordEntry | null>(null);
  const [challengeKind, setChallengeKind] = useState<ChallengeKind>("build");

  // Build-challenge state
  const [shuffled,  setShuffled]  = useState<TaggedTile[]>([]);
  const [built,     setBuilt]     = useState(0);
  const [wrongId,   setWrongId]   = useState<number | null>(null);
  const [hasDecoy,  setHasDecoy]  = useState(false);

  // Match-challenge state
  const [matchOptions, setMatchOptions] = useState<MatchOption[]>([]);
  const [wrongMatch,   setWrongMatch]   = useState<string | null>(null);

  // Shared
  const [blendStep, setBlendStep] = useState(0);
  const [mistakes,  setMistakes]  = useState(0);

  const [recentIds,        setRecentIds]        = useState<string[]>([]);
  const [level,            setLevel]            = useState(START_LEVEL);
  const [totalStars,       setTotalStars]       = useState(0);
  const [wordWall,         setWordWall]         = useState<{ word: string; stars: number }[]>([]);
  const [completedEntries, setCompletedEntries] = useState<WordEntry[]>([]);
  const [newWordsCount,    setNewWordsCount]    = useState(0);
  const [isReview,         setIsReview]         = useState(false);
  const [reviewResult,     setReviewResult]     = useState<{
    elapsedMs: number; prevBestMs: number | null;
  } | null>(null);
  const [reviewElapsed, setReviewElapsed] = useState(0);

  const presentedAtRef  = useRef(0);
  const tapTimesRef     = useRef<number[]>([]);
  const firstDecodeMs   = useRef<Record<string, number>>({});
  const reviewStartRef  = useRef(0);
  const reviewBestRef   = useRef<number | null>(null);
  const reviewTimerRef  = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const wrongTimerRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrongMatchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const tiles = useMemo(
    () => (word ? word.tiles.filter((t) => !t.isSilent) : []),
    [word],
  );

  // ── Load word ────────────────────────────────────────────────────────────────

  const loadWord = useCallback((entry: WordEntry, count: number, review = false) => {
    // Decide challenge kind: warmup words + reviews + heart words → always "build"
    // Every MATCH_EVERY-th word after warmup → "match" (only if we have an emoji for it)
    const hasEmoji = entry.word in WORD_EMOJI;
    const wantMatch =
      !review &&
      count >= 3 &&
      entry.kind !== "heart" &&
      hasEmoji &&
      (count - 3) % MATCH_EVERY === MATCH_EVERY - 1;

    const kind: ChallengeKind = wantMatch ? "match" : "build";
    setChallengeKind(kind);
    setWord(entry);
    setBuilt(0);
    setBlendStep(0);
    setMistakes(0);
    setWrongId(null);
    setWrongMatch(null);
    setIsReview(review);
    setReviewElapsed(0);
    setReviewResult(null);
    tapTimesRef.current = [];
    presentedAtRef.current = Date.now();

    if (kind === "match") {
      // Minimal pairs: correct answer + up to 2 decoy words, presented as tile rows
      const opts: MatchOption[] = [
        { word: entry.word, tiles: entry.tiles.filter((t) => !t.isSilent) },
        ...entry.decoys.map((d) => ({ word: d, tiles: getTilesForWord(d) })),
      ];
      setMatchOptions(shuffle(opts));
      setShuffled([]);
      setHasDecoy(false);
    } else {
      // Build: scrambled phoneme tiles, optionally + 1 decoy
      const tagged: TaggedTile[] = entry.tiles
        .filter((t) => !t.isSilent)
        .map((t, i) => ({ ...t, origIdx: i }));

      let addedDecoy = false;
      if (!review && count >= 3 && Math.random() < DECOY_CHANCE) {
        const wordChars = new Set(entry.tiles.map((t) => t.text.toLowerCase()));
        const pool = ["b","c","d","f","g","h","j","k","m","n","p","r","s","t","v","w","z"]
          .filter((l) => !wordChars.has(l));
        if (pool.length > 0) {
          const dl = pool[Math.floor(Math.random() * pool.length)];
          tagged.push({ text: dl, type: "consonant", origIdx: -1 });
          addedDecoy = true;
        }
      }
      setShuffled(shuffle(tagged));
      setHasDecoy(addedDecoy);
      setMatchOptions([]);
    }

    setPhase("challenge");
  }, []);

  const handleStart = () => loadWord(pickWord(START_LEVEL, []), 0);

  // ── Review stopwatch ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === "challenge" && isReview) {
      reviewStartRef.current = Date.now();
      reviewTimerRef.current = setInterval(
        () => setReviewElapsed(Date.now() - reviewStartRef.current),
        100,
      );
    }
    return () => clearInterval(reviewTimerRef.current);
  }, [phase, isReview]);

  // ── Wrong-tile shake auto-clear ────────────────────────────────────────────

  useEffect(() => {
    if (wrongId === null) return;
    clearTimeout(wrongTimerRef.current);
    wrongTimerRef.current = setTimeout(() => setWrongId(null), 500);
    return () => clearTimeout(wrongTimerRef.current);
  }, [wrongId]);

  // ── Build: tap handler ────────────────────────────────────────────────────────
  // origIdx === -1 → decoy; origIdx !== built → wrong order; origIdx === built → correct

  const handleBuildTap = useCallback(
    (origIdx: number) => {
      if (phase !== "challenge" || challengeKind !== "build") return;
      if (origIdx === -1) {
        // Decoy tapped — wrong!
        playError();
        setWrongId(-1);
        setMistakes((m) => m + 1);
      } else if (origIdx === built) {
        // Correct sound in correct order
        tapTimesRef.current.push(Date.now());
        speakPhoneme(tiles[origIdx]);
        const next = built + 1;
        setBuilt(next);
        if (next === tiles.length) {
          clearInterval(reviewTimerRef.current);
          setTimeout(() => { setBlendStep(0); setPhase("blend"); }, 350);
        }
      } else {
        // Right tile, wrong position
        playError();
        setWrongId(origIdx);
        setMistakes((m) => m + 1);
      }
    },
    [phase, challengeKind, built, tiles],
  );

  // ── Match: tap handler ─────────────────────────────────────────────────────

  const handleMatchTap = useCallback(
    (chosen: string) => {
      if (phase !== "challenge" || challengeKind !== "match" || !word) return;
      if (chosen === word.word) {
        // Correct! Pre-fill built so slots are all filled during blend
        const nonSilentCount = word.tiles.filter((t) => !t.isSilent).length;
        setBuilt(nonSilentCount);
        tapTimesRef.current.push(Date.now());
        speakWord(word.word, 0.75);
        setTimeout(() => { setBlendStep(0); setPhase("blend"); }, 420);
      } else {
        playError();
        setWrongMatch(chosen);
        setMistakes((m) => m + 1);
        clearTimeout(wrongMatchTimer.current);
        wrongMatchTimer.current = setTimeout(() => setWrongMatch(null), 550);
      }
    },
    [phase, challengeKind, word],
  );

  // ── Blend sweep ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "blend" || !word) return;
    if (blendStep < tiles.length) {
      speakPhoneme(tiles[blendStep]);
      const id = setTimeout(() => setBlendStep((s) => s + 1), BLEND_STEP_MS);
      return () => clearTimeout(id);
    }
    speakWord(word.word);
    const id = setTimeout(() => {
      const now     = Date.now();
      const totalMs = (tapTimesRef.current.at(-1) ?? now) - presentedAtRef.current;
      const phonemes: PhonemeRecord[] = tiles.map((t, i) => ({
        text: t.text, type: t.type,
        latencyMs:
          (tapTimesRef.current[i] ?? now) -
          (i === 0 ? presentedAtRef.current : (tapTimesRef.current[i - 1] ?? presentedAtRef.current)),
      }));
      saveToHistory({
        wordId: word.id, word: word.word, timestamp: now,
        challenge: challengeKind, mistakes, totalMs, phonemes,
      });

      const earned = starsFor(mistakes);
      if (isReview) {
        const elapsed = now - reviewStartRef.current;
        setReviewResult({ elapsedMs: elapsed, prevBestMs: reviewBestRef.current });
        if (!reviewBestRef.current || elapsed < reviewBestRef.current) {
          reviewBestRef.current = elapsed;
          firstDecodeMs.current[word.id] = elapsed;
        }
        if (earned === 3) confetti({ particleCount: 60, spread: 55, origin: { y: 0.55 } });
      } else {
        if (earned === 3) confetti({ particleCount: 110, spread: 70, origin: { y: 0.55 } });
        else              confetti({ particleCount: 45,  spread: 50, origin: { y: 0.60 } });
        setTotalStars((s) => s + earned);
        if (!firstDecodeMs.current[word.id]) firstDecodeMs.current[word.id] = totalMs;
        setWordWall((w) => {
          const without = w.filter((x) => x.word !== word.word);
          return [{ word: word.word, stars: earned }, ...without].slice(0, 20);
        });
        setCompletedEntries((e) => e.find((x) => x.id === word.id) ? e : [...e, word]);
        setNewWordsCount((n) => n + 1);
      }
      setPhase("meaning");
    }, 900);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, blendStep, tiles.length, word?.id, challengeKind, isReview, mistakes]);

  // ── Next word / fluency review ────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    const triggerReview =
      !isReview && newWordsCount > 0 &&
      newWordsCount % REVIEW_EVERY === 0 &&
      completedEntries.length > 0;

    if (triggerReview) {
      const pick = completedEntries[Math.floor(Math.random() * completedEntries.length)];
      reviewBestRef.current = firstDecodeMs.current[pick.id] ?? null;
      loadWord(pick, newWordsCount, true);
    } else {
      const newLevel  = Math.min(MAX_LEVEL, level + 0.08);
      const newRecent = [...recentIds, word!.id].slice(-12);
      setLevel(newLevel);
      setRecentIds(newRecent);
      loadWord(pickWord(newLevel, newRecent), newWordsCount);
    }
  }, [isReview, newWordsCount, completedEntries, level, recentIds, word, loadWord]);

  // ── Start screen ─────────────────────────────────────────────────────────────

  if (phase === "start") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 to-indigo-500 flex flex-col items-center justify-center p-8">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-sm w-full"
        >
          <div className="text-8xl mb-4">🐝</div>
          <h1 className="text-5xl font-black text-white drop-shadow-lg mb-3">
            Build-A-Word
          </h1>
          <p className="text-xl text-sky-100 font-semibold mb-10 leading-snug">
            Tap the sounds in the right order<br />to build the word!
          </p>
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={handleStart}
            className="w-full bg-yellow-400 text-yellow-900 font-black text-3xl py-5 rounded-3xl shadow-2xl"
          >
            Let&apos;s Play! 🎉
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (!word) return null;

  const emoji        = WORD_EMOJI[word.word] ?? null;
  const earned       = starsFor(mistakes);
  const nextIsReview =
    !isReview && newWordsCount > 0 &&
    newWordsCount % REVIEW_EVERY === 0 &&
    completedEntries.length > 0;

  // ── Game screen ───────────────────────────────────────────────────────────────

  return (
    <LayoutGroup>
      <div className="min-h-screen bg-gradient-to-b from-sky-300 to-indigo-500 flex flex-col items-center p-4 gap-4 pb-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between w-full max-w-md pt-2">
          <div className="bg-white/30 rounded-2xl px-4 py-2">
            <span className="text-white font-black text-xl">⭐ {totalStars}</span>
          </div>
          <span className="text-white font-black text-lg">
            {isReview ? "⚡ Speed Check!" : "Build-A-Word"}
          </span>
          {isReview && phase === "challenge" ? (
            <div className="bg-white/30 rounded-2xl px-4 py-2">
              <span className="text-white font-mono font-bold text-lg">
                {(reviewElapsed / 1000).toFixed(1)}s
              </span>
            </div>
          ) : (
            <div className="w-24" />
          )}
        </div>

        {/* ── Word wall ── */}
        {wordWall.length > 0 && (
          <div className="w-full max-w-md overflow-x-auto">
            <div className="flex gap-1.5 flex-nowrap pb-1">
              {wordWall.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => speakWord(entry.word, 0.7)}
                  className="flex-shrink-0 bg-white/30 active:bg-white/50 text-white font-bold text-sm px-3 py-1.5 rounded-full whitespace-nowrap"
                >
                  {entry.word} {"⭐".repeat(entry.stars)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md gap-6">

          {/* ══════════════════════════════════════════════════════════
              BUILD CHALLENGE — scrambled tiles, tap in order
              Optional decoy tile that must be avoided
          ══════════════════════════════════════════════════════════ */}

          <AnimatePresence mode="wait">
            {phase === "challenge" && challengeKind === "build" && (
              <motion.div
                key="build"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-6 w-full"
              >
                {/* Target word card */}
                <div className="bg-white rounded-3xl shadow-2xl w-full px-6 py-4 text-center">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                    {hasDecoy
                      ? "One sound doesn't belong — skip it!"
                      : "Tap the sounds in order →"}
                  </p>
                  <p className="text-6xl font-black text-indigo-700 tracking-wide">
                    {word.word}
                  </p>
                  <button
                    onClick={() => speakWord(word.word)}
                    className="mt-2 bg-indigo-100 active:bg-indigo-200 text-indigo-600 font-bold text-sm px-5 py-1.5 rounded-full"
                  >
                    🔊 Hear it
                  </button>
                </div>

                {/* Build slots */}
                <div className="flex gap-3 justify-center flex-wrap">
                  {tiles.map((tile, i) => {
                    const placed = i < built;
                    return (
                      <div
                        key={i}
                        className="w-[80px] h-[80px] relative flex items-center justify-center"
                      >
                        {!placed && (
                          <div className="absolute inset-0 rounded-2xl border-4 border-dashed border-white/50 bg-white/10" />
                        )}
                        <AnimatePresence>
                          {placed && (
                            <motion.div
                              key="placed"
                              initial={{ scale: 0.4, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 18 } }}
                              className={`absolute inset-0 rounded-2xl flex items-center justify-center text-2xl font-black border-4 shadow-md ${TILE_BG[tile.type]}`}
                            >
                              {tile.text}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>

                {/* Scrambled tile bank */}
                <div className="w-full">
                  <p className="text-white/80 font-bold text-sm text-center mb-3 uppercase tracking-wide">
                    {hasDecoy ? "⚠️ One of these doesn't belong!" : "Which sound comes next?"}
                  </p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <AnimatePresence mode="popLayout">
                      {shuffled.map((tile) => {
                        const placed  = tile.origIdx !== -1 && tile.origIdx < built;
                        const isWrong = tile.origIdx === wrongId;
                        if (placed) return null;
                        return (
                          <motion.button
                            key={`${tile.origIdx}-${tile.text}`}
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={
                              isWrong
                                ? {
                                    x: [-10, 10, -8, 8, -5, 5, 0],
                                    scale: 1, opacity: 1,
                                    transition: { duration: 0.4, ease: "easeOut" },
                                  }
                                : { x: 0, scale: 1, opacity: 1 }
                            }
                            exit={{ scale: 0.3, opacity: 0, transition: { duration: 0.18 } }}
                            whileTap={{ scale: 0.86 }}
                            onClick={() => handleBuildTap(tile.origIdx)}
                            className={[
                              "w-[80px] h-[80px] rounded-2xl text-2xl font-black border-4 select-none shadow-lg cursor-pointer",
                              isWrong
                                ? "bg-red-500 border-red-700 text-white ring-4 ring-red-300/70"
                                : TILE_BG[tile.type],
                            ].join(" ")}
                          >
                            {tile.text}
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════
                MATCH CHALLENGE — picture shown, tap the matching word
                Options displayed as phoneme tile rows (minimal pairs)
            ══════════════════════════════════════════════════════════ */}

            {phase === "challenge" && challengeKind === "match" && (
              <motion.div
                key="match"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5 w-full"
              >
                {/* Picture clue */}
                <div className="bg-white rounded-3xl shadow-2xl w-full px-6 py-5 text-center">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                    Tap the word that matches the picture
                  </p>
                  <div className="text-[80px] leading-none">{emoji}</div>
                </div>

                {/* Minimal pair options — each shown as a row of phoneme tiles */}
                <div className="flex flex-col gap-3 w-full">
                  {matchOptions.map((opt) => {
                    const isWrong = wrongMatch === opt.word;
                    return (
                      <motion.button
                        key={opt.word}
                        animate={
                          isWrong
                            ? {
                                x: [-10, 10, -7, 7, -4, 4, 0],
                                transition: { duration: 0.4, ease: "easeOut" },
                              }
                            : { x: 0 }
                        }
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleMatchTap(opt.word)}
                        className={[
                          "w-full bg-white rounded-2xl shadow-lg px-4 py-3",
                          "flex items-center gap-4 text-left",
                          isWrong ? "ring-4 ring-red-400" : "",
                        ].join(" ")}
                      >
                        {/* Word text */}
                        <span className="text-3xl font-black text-indigo-700 min-w-[70px]">
                          {opt.word}
                        </span>
                        {/* Phoneme tile row — the actual decoding display */}
                        <div className="flex gap-1.5 flex-wrap">
                          {opt.tiles.map((tile, i) => (
                            <div
                              key={i}
                              className={`w-10 h-10 rounded-lg text-sm font-black flex items-center justify-center border-2 ${TILE_BG[tile.type]}`}
                            >
                              {tile.text}
                            </div>
                          ))}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════
                BLEND — sweep animation across the placed tiles
            ══════════════════════════════════════════════════════════ */}

            {phase === "blend" && (
              <motion.div
                key="blend"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-6 w-full"
              >
                <p className="text-white font-black text-xl text-center">Blend it! →</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  {tiles.map((tile, i) => {
                    const lit  = i === blendStep;
                    const past = i < blendStep;
                    return (
                      <motion.div
                        key={i}
                        animate={{ scale: lit ? 1.2 : 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 18 }}
                        className={[
                          "w-[80px] h-[80px] rounded-2xl flex items-center justify-center text-2xl font-black border-4",
                          TILE_BG[tile.type],
                          lit  ? "ring-4 ring-white shadow-2xl" : "",
                          past ? "shadow-md" : "opacity-60",
                        ].join(" ")}
                      >
                        {tile.text}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ══════════════════════════════════════════════════════════
              MEANING — emoji + word + stars + next button
          ══════════════════════════════════════════════════════════ */}

          <AnimatePresence>
            {phase === "meaning" && (
              <motion.div
                key="meaning"
                initial={{ scale: 0.75, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 250, damping: 16 }}
                className="flex flex-col items-center gap-4 w-full"
              >
                {emoji && (
                  <motion.div
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 240 }}
                    className="text-[96px] leading-none"
                  >
                    {emoji}
                  </motion.div>
                )}

                <p className="text-5xl font-black text-white drop-shadow">{word.word}</p>

                {/* Star rating */}
                {!isReview && (
                  <div className="flex gap-2">
                    {[1, 2, 3].map((n) => (
                      <motion.span
                        key={n}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: earned >= n ? 1 : 0.2 }}
                        transition={{ delay: n * 0.12, type: "spring", stiffness: 300 }}
                        className="text-4xl"
                      >
                        ⭐
                      </motion.span>
                    ))}
                  </div>
                )}

                {/* Review time */}
                {isReview && reviewResult && (
                  <div className="bg-white/30 rounded-2xl px-5 py-3 text-center">
                    <p className="text-white font-black text-2xl">
                      {(reviewResult.elapsedMs / 1000).toFixed(1)}s
                    </p>
                    {reviewResult.prevBestMs && (
                      <p className="text-white/75 text-sm font-bold mt-0.5">
                        {reviewResult.elapsedMs < reviewResult.prevBestMs
                          ? "🏆 Personal best!"
                          : `Best: ${(reviewResult.prevBestMs / 1000).toFixed(1)}s`}
                      </p>
                    )}
                  </div>
                )}

                <motion.button
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: emoji ? 0.55 : 0.3 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={handleNext}
                  className="w-full bg-yellow-400 text-yellow-900 font-black text-2xl py-5 rounded-3xl shadow-2xl"
                >
                  {nextIsReview ? "⚡ Speed Check! →" : "Next Word! →"}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </LayoutGroup>
  );
}
