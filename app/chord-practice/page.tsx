"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Navigation from "../components/Navigation";
import { allNotes } from "../lib/music";

// Circle of fifths order
const circleOfFifths = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F"];

// Major scale intervals (semitones from root)
const majorScaleIntervals = [0, 2, 4, 5, 7, 9, 11];

// Difficulty tiers with chord types available at each level
const difficultyTiers = [
  {
    level: 1,
    label: "Beginner",
    description: "Major & Minor Triads",
    types: [
      { suffix: "Major", quality: "major", intervals: [0, 4, 7] },
      { suffix: "Minor", quality: "minor", intervals: [0, 3, 7] },
    ],
  },
  {
    level: 2,
    label: "Elementary",
    description: "Adding Sus & Power Chords",
    types: [
      { suffix: "Major", quality: "major", intervals: [0, 4, 7] },
      { suffix: "Minor", quality: "minor", intervals: [0, 3, 7] },
      { suffix: "sus2", quality: "sus", intervals: [0, 2, 7] },
      { suffix: "sus4", quality: "sus", intervals: [0, 5, 7] },
    ],
  },
  {
    level: 3,
    label: "Intermediate",
    description: "Introducing 7th Chords",
    types: [
      { suffix: "Major", quality: "major", intervals: [0, 4, 7] },
      { suffix: "Minor", quality: "minor", intervals: [0, 3, 7] },
      { suffix: "maj7", quality: "major", intervals: [0, 4, 7, 11] },
      { suffix: "m7", quality: "minor", intervals: [0, 3, 7, 10] },
      { suffix: "7", quality: "dominant", intervals: [0, 4, 7, 10] },
    ],
  },
  {
    level: 4,
    label: "Advanced",
    description: "Diminished & Augmented",
    types: [
      { suffix: "maj7", quality: "major", intervals: [0, 4, 7, 11] },
      { suffix: "m7", quality: "minor", intervals: [0, 3, 7, 10] },
      { suffix: "7", quality: "dominant", intervals: [0, 4, 7, 10] },
      { suffix: "dim", quality: "diminished", intervals: [0, 3, 6] },
      { suffix: "aug", quality: "augmented", intervals: [0, 4, 8] },
      { suffix: "m7b5", quality: "diminished", intervals: [0, 3, 6, 10] },
    ],
  },
  {
    level: 5,
    label: "Expert",
    description: "Extended Chords (9ths)",
    types: [
      { suffix: "maj7", quality: "major", intervals: [0, 4, 7, 11] },
      { suffix: "m7", quality: "minor", intervals: [0, 3, 7, 10] },
      { suffix: "7", quality: "dominant", intervals: [0, 4, 7, 10] },
      { suffix: "maj9", quality: "major", intervals: [0, 4, 7, 11, 14] },
      { suffix: "9", quality: "dominant", intervals: [0, 4, 7, 10, 14] },
      { suffix: "m9", quality: "minor", intervals: [0, 3, 7, 10, 14] },
      { suffix: "dim7", quality: "diminished", intervals: [0, 3, 6, 9] },
    ],
  },
  {
    level: 6,
    label: "Master",
    description: "13ths & Complex Voicings",
    types: [
      { suffix: "maj7", quality: "major", intervals: [0, 4, 7, 11] },
      { suffix: "m7", quality: "minor", intervals: [0, 3, 7, 10] },
      { suffix: "7", quality: "dominant", intervals: [0, 4, 7, 10] },
      { suffix: "maj9", quality: "major", intervals: [0, 4, 7, 11, 14] },
      { suffix: "9", quality: "dominant", intervals: [0, 4, 7, 10, 14] },
      { suffix: "13", quality: "dominant", intervals: [0, 4, 7, 10, 14, 21] },
      { suffix: "maj13", quality: "major", intervals: [0, 4, 7, 11, 14, 21] },
      { suffix: "m11", quality: "minor", intervals: [0, 3, 7, 10, 14, 17] },
      { suffix: "7#9", quality: "dominant", intervals: [0, 4, 7, 10, 15] },
      { suffix: "7b9", quality: "dominant", intervals: [0, 4, 7, 10, 13] },
    ],
  },
];

// Get diatonic chords for a key (scale degrees in the circle of fifths context)
function getDiatonicRoots(keyRoot: string): string[] {
  const rootIdx = allNotes.indexOf(keyRoot);
  if (rootIdx < 0) return [keyRoot];
  return majorScaleIntervals.map((interval) => allNotes[(rootIdx + interval) % 12]);
}

// Get neighboring keys in the circle of fifths
function getRelatedKeys(currentKey: string, range: number): string[] {
  const idx = circleOfFifths.indexOf(currentKey);
  if (idx < 0) return [currentKey];
  const keys: string[] = [];
  for (let i = -range; i <= range; i++) {
    keys.push(circleOfFifths[((idx + i) % 12 + 12) % 12]);
  }
  return keys;
}

// Format chord name for display
function formatChordName(root: string, suffix: string): string {
  if (suffix === "Major") return root;
  if (suffix === "Minor") return `${root}m`;
  return `${root}${suffix}`;
}

// Get the notes in a chord
function getChordNotes(root: string, intervals: number[]): string[] {
  const rootIdx = allNotes.indexOf(root);
  if (rootIdx < 0) return [];
  return intervals.map((i) => allNotes[(rootIdx + i) % 12]);
}

interface ChordInfo {
  root: string;
  suffix: string;
  displayName: string;
  notes: string[];
  key: string;
}

const CHORDS_PER_LEVEL_UP = 8;
const TIMER_DURATION = 10;
const BASE_MODULATE_CHANCE = 0.15;
const MODULATE_CHANCE_PER_LEVEL = 0.05;
const MAX_MODULATE_CHANCE = 0.4;
const BASE_KEY_RANGE = 1;
const MAX_KEY_RANGE = 3;

export default function ChordPracticePage() {
  const [currentChord, setCurrentChord] = useState<ChordInfo | null>(null);
  const [currentKey, setCurrentKey] = useState("G");
  const [difficulty, setDifficulty] = useState(1);
  const [chordsPlayed, setChordsPlayed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [isPlaying, setIsPlaying] = useState(false);
  const [history, setHistory] = useState<ChordInfo[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousChordsRef = useRef<string[]>([]);

  const tier = difficultyTiers[Math.min(difficulty - 1, difficultyTiers.length - 1)];

  // Generate next chord following circle of fifths random walk
  const generateNextChord = useCallback(() => {
    const currentDifficulty = Math.min(difficulty, difficultyTiers.length);
    const currentTier = difficultyTiers[currentDifficulty - 1];

    // Random walk: sometimes modulate to a neighboring key
    let nextKey = currentKey;
    const modulateChance = Math.min(BASE_MODULATE_CHANCE + (currentDifficulty - 1) * MODULATE_CHANCE_PER_LEVEL, MAX_MODULATE_CHANCE);
    if (Math.random() < modulateChance) {
      const range = Math.min(BASE_KEY_RANGE + Math.floor((currentDifficulty - 1) / 2), MAX_KEY_RANGE);
      const relatedKeys = getRelatedKeys(currentKey, range);
      nextKey = relatedKeys[Math.floor(Math.random() * relatedKeys.length)];
    }

    // Get diatonic roots for the current key
    const diatonicRoots = getDiatonicRoots(nextKey);

    // Pick a random root from the diatonic scale, avoiding immediate repetition
    let root: string;
    let attempts = 0;
    do {
      root = diatonicRoots[Math.floor(Math.random() * diatonicRoots.length)];
      attempts++;
    } while (
      previousChordsRef.current.length > 0 &&
      previousChordsRef.current[previousChordsRef.current.length - 1] === root &&
      attempts < 10
    );

    // Pick a random chord type from the current tier
    const chordType = currentTier.types[Math.floor(Math.random() * currentTier.types.length)];

    const displayName = formatChordName(root, chordType.suffix);

    // Avoid repeating the exact same chord
    if (
      previousChordsRef.current.length >= 2 &&
      previousChordsRef.current[previousChordsRef.current.length - 1] === displayName
    ) {
      // Try once more with a different type
      const altType = currentTier.types[Math.floor(Math.random() * currentTier.types.length)];
      const altName = formatChordName(root, altType.suffix);
      const chord: ChordInfo = {
        root,
        suffix: altType.suffix,
        displayName: altName,
        notes: getChordNotes(root, altType.intervals),
        key: nextKey,
      };
      previousChordsRef.current.push(altName);
      if (previousChordsRef.current.length > 5) previousChordsRef.current.shift();
      setCurrentKey(nextKey);
      return chord;
    }

    const chord: ChordInfo = {
      root,
      suffix: chordType.suffix,
      displayName,
      notes: getChordNotes(root, chordType.intervals),
      key: nextKey,
    };

    previousChordsRef.current.push(displayName);
    if (previousChordsRef.current.length > 5) previousChordsRef.current.shift();
    setCurrentKey(nextKey);
    return chord;
  }, [currentKey, difficulty]);

  // Advance to next chord
  const nextChord = useCallback(() => {
    const chord = generateNextChord();
    setCurrentChord(chord);
    setHistory((prev) => [...prev.slice(-19), chord]);
    setTimeLeft(TIMER_DURATION);

    const newCount = chordsPlayed + 1;
    setChordsPlayed(newCount);

    // Level up every CHORDS_PER_LEVEL_UP chords
    if (newCount > 0 && newCount % CHORDS_PER_LEVEL_UP === 0 && difficulty < difficultyTiers.length) {
      setDifficulty((d) => Math.min(d + 1, difficultyTiers.length));
    }
  }, [generateNextChord, chordsPlayed, difficulty]);

  // Timer countdown - advance chord inline when reaching 0
  useEffect(() => {
    if (!isPlaying) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Schedule chord advance outside of setState
          queueMicrotask(() => nextChord());
          return TIMER_DURATION;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, nextChord]);

  const startGame = () => {
    setIsPlaying(true);
    setChordsPlayed(0);
    setDifficulty(1);
    setHistory([]);
    setCurrentKey("G");
    previousChordsRef.current = [];
    const chord = generateNextChord();
    setCurrentChord(chord);
    setHistory([chord]);
    setTimeLeft(TIMER_DURATION);
  };

  const stopGame = () => {
    setIsPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const skipChord = () => {
    if (isPlaying) {
      nextChord();
    }
  };

  // Progress percentage for the timer ring
  const timerProgress = (timeLeft / TIMER_DURATION) * 100;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (timerProgress / 100) * circumference;

  // Progress to next level
  const chordsInCurrentLevel = chordsPlayed % CHORDS_PER_LEVEL_UP;
  const levelProgress = (chordsInCurrentLevel / CHORDS_PER_LEVEL_UP) * 100;

  return (
    <div className='flex flex-col flex-1'>
      <Navigation />
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-4xl lg:mx-auto rounded-lg border border-border bg-white p-4 shadow-sm'>
          {/* Header */}
          <div className='text-center mb-8'>
            <h1 className='text-4xl font-bold text-[var(--foreground)] mb-2'>Chord Practice</h1>
            <p className='text-lg text-[var(--foreground)]/70'>
              Progressive chord training following the Circle of Fifths
            </p>
          </div>

          {/* Game status bar */}
          <div className='flex flex-wrap items-center justify-center gap-4 mb-8'>
            <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-center'>
              <div className='text-xs text-[var(--foreground)]/60 uppercase tracking-wider'>Level</div>
              <div className='text-lg font-bold text-[var(--accent)]'>{tier.level}</div>
              <div className='text-xs text-[var(--foreground)]/60'>{tier.label}</div>
            </div>
            <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-center'>
              <div className='text-xs text-[var(--foreground)]/60 uppercase tracking-wider'>Key</div>
              <div className='text-lg font-bold text-[var(--foreground)]'>{currentKey}</div>
            </div>
            <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-center'>
              <div className='text-xs text-[var(--foreground)]/60 uppercase tracking-wider'>Chords</div>
              <div className='text-lg font-bold text-[var(--foreground)]'>{chordsPlayed}</div>
            </div>
            <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-center min-w-[140px]'>
              <div className='text-xs text-[var(--foreground)]/60 uppercase tracking-wider'>Focus</div>
              <div className='text-sm font-medium text-[var(--foreground)]'>{tier.description}</div>
            </div>
          </div>

          {/* Level progress bar */}
          {isPlaying && difficulty < difficultyTiers.length && (
            <div className='mb-6 max-w-md mx-auto'>
              <div className='flex justify-between text-xs text-[var(--foreground)]/60 mb-1'>
                <span>Level {tier.level} → {tier.level + 1}</span>
                <span>{CHORDS_PER_LEVEL_UP - chordsInCurrentLevel} chords to next level</span>
              </div>
              <div className='h-2 bg-[var(--card-border)] rounded-full overflow-hidden'>
                <div
                  className='h-full bg-gradient-to-r from-pink-500 to-orange-500 rounded-full transition-all duration-500'
                  style={{ width: `${levelProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Main chord display */}
          <div className='flex flex-col items-center mb-8'>
            {!isPlaying ? (
              <div className='text-center'>
                <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-12 mb-6 max-w-md mx-auto'>
                  <p className='text-[var(--foreground)]/70 mb-4 text-lg'>
                    Practice chords that progressively get harder. Starting in the key of G,
                    the game walks through the Circle of Fifths introducing new chord types as you advance.
                  </p>
                  <ul className='text-left text-sm text-[var(--foreground)]/60 space-y-1 mb-6'>
                    <li>• 10 seconds per chord</li>
                    <li>• Starts with simple triads</li>
                    <li>• Levels up every {CHORDS_PER_LEVEL_UP} chords</li>
                    <li>• Follows the Circle of Fifths</li>
                    <li>• Introduces 7ths, 9ths, 13ths & more</li>
                  </ul>
                  <button
                    onClick={startGame}
                    className='px-8 py-3 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl font-bold text-lg hover:from-pink-600 hover:to-orange-600 transition-all shadow-lg'
                  >
                    Start Practice
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Timer ring + chord name */}
                <div className='relative flex items-center justify-center mb-6'>
                  <svg className='w-40 h-40 -rotate-90' viewBox='0 0 120 120'>
                    <circle
                      cx='60'
                      cy='60'
                      r='54'
                      fill='none'
                      stroke='var(--card-border)'
                      strokeWidth='6'
                    />
                    <circle
                      cx='60'
                      cy='60'
                      r='54'
                      fill='none'
                      stroke='url(#timerGradient)'
                      strokeWidth='6'
                      strokeLinecap='round'
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      className='transition-all duration-1000 ease-linear'
                    />
                    <defs>
                      <linearGradient id='timerGradient' x1='0%' y1='0%' x2='100%' y2='0%'>
                        <stop offset='0%' stopColor='#ec4899' />
                        <stop offset='100%' stopColor='#f97316' />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className='absolute inset-0 flex flex-col items-center justify-center'>
                    <span className='text-3xl font-bold text-[var(--foreground)]'>{timeLeft}s</span>
                  </div>
                </div>

                {/* Chord display card */}
                {currentChord && (
                  <div className='bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-8 text-center min-w-[280px] shadow-lg'>
                    <div className='text-6xl font-bold text-[var(--foreground)] mb-3'>
                      {currentChord.displayName}
                    </div>
                    <div className='text-sm text-[var(--foreground)]/60 mb-4'>
                      Key of {currentChord.key}
                    </div>
                    <div className='flex flex-wrap justify-center gap-2'>
                      {currentChord.notes.map((note, i) => (
                        <span
                          key={i}
                          className='px-3 py-1 bg-gradient-to-r from-pink-500/20 to-orange-500/20 border border-pink-500/30 rounded-full text-sm font-medium text-[var(--foreground)]'
                        >
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Controls */}
                <div className='flex gap-4 mt-6'>
                  <button
                    onClick={skipChord}
                    className='px-6 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] rounded-xl font-medium hover:bg-[var(--card-border)] transition-all'
                  >
                    Skip →
                  </button>
                  <button
                    onClick={stopGame}
                    className='px-6 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl font-medium hover:bg-red-500/30 transition-all'
                  >
                    Stop
                  </button>
                </div>
              </>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className='mt-8'>
              <h2 className='text-lg font-semibold text-[var(--foreground)] mb-3 text-center'>
                Recent Chords
              </h2>
              <div className='flex flex-wrap justify-center gap-2'>
                {history.slice().reverse().map((chord, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full text-sm font-medium border ${
                      i === 0
                        ? "bg-gradient-to-r from-pink-500/30 to-orange-500/30 border-pink-500/40 text-[var(--foreground)]"
                        : "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--foreground)]/60"
                    }`}
                  >
                    {chord.displayName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Difficulty reference */}
          <div className='mt-12'>
            <h2 className='text-lg font-semibold text-[var(--foreground)] mb-4 text-center'>
              Difficulty Levels
            </h2>
            <div className='grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto'>
              {difficultyTiers.map((t) => (
                <div
                  key={t.level}
                  className={`p-3 rounded-xl border text-center text-sm ${
                    t.level === difficulty
                      ? "bg-gradient-to-r from-pink-500/20 to-orange-500/20 border-pink-500/40"
                      : t.level < difficulty
                        ? "bg-[var(--card-bg)] border-green-500/30"
                        : "bg-[var(--card-bg)] border-[var(--card-border)] opacity-60"
                  }`}
                >
                  <div className='font-bold text-[var(--foreground)]'>
                    {t.level}. {t.label}
                  </div>
                  <div className='text-xs text-[var(--foreground)]/60'>{t.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
