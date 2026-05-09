"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Crown, Bug as Bee, Sparkles, ChevronUp, ChevronDown, GraduationCap } from "lucide-react";
import confetti from "canvas-confetti";
import {
  Question,
  GRADES,
  INITIAL_LEVEL,
  MAX_LEVEL,
  FIRST_TRY_BONUS,
  SECOND_TRY_BONUS,
  WRONG_PENALTY,
  MASTERY_STREAK,
  MASTERY_BONUS,
  pickQuestion,
  gradeNameFromLevel,
  gradeIndexFromLevel,
  gradeProgress,
  clampLevel,
  answerOf,
} from "./questions";

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface Progress {
  level: number;
  totalCorrect: number;
  totalAnswered: number;
  highestLevel: number;
  reachedGraduation: boolean;
}

interface Transient {
  attemptsLeft: number;
  shrugging: boolean;
  wrongGuesses: string[];
  revealed: boolean;
  gotItRight: boolean;
  streak: number;
}

const STORAGE_KEY = "spelling-bee-progress";
const RECENT_MEMORY = 8;

const INITIAL_PROGRESS: Progress = {
  level: INITIAL_LEVEL,
  totalCorrect: 0,
  totalAnswered: 0,
  highestLevel: INITIAL_LEVEL,
  reachedGraduation: false,
};

const INITIAL_TRANSIENT: Transient = {
  attemptsLeft: 2,
  shrugging: false,
  wrongGuesses: [],
  revealed: false,
  gotItRight: false,
  streak: 0,
};

function loadProgress(): Progress {
  if (typeof window === "undefined") return INITIAL_PROGRESS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      level: clampLevel(parsed.level ?? INITIAL_LEVEL),
      totalCorrect: parsed.totalCorrect ?? 0,
      totalAnswered: parsed.totalAnswered ?? 0,
      highestLevel: clampLevel(parsed.highestLevel ?? INITIAL_LEVEL),
      reachedGraduation: parsed.reachedGraduation ?? false,
    };
  } catch {
    return INITIAL_PROGRESS;
  }
}

function saveProgress(p: Progress) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

function BeeCharacter({ shrugging = false }: { shrugging?: boolean }) {
  return (
    <div className='relative shrink-0'>
      <motion.div
        animate={{ y: shrugging ? [0, -20, 0] : [0, -10, 0], x: shrugging ? [0, -10, 10, -10, 10, 0] : 0 }}
        transition={{ y: { repeat: Infinity, duration: 2, ease: "easeInOut" }, x: { duration: 0.5 } }}
        className='w-20 h-20 md:w-28 md:h-28 relative'
      >
        <motion.div
          animate={{ rotate: [0, 30, 0] }}
          transition={{ repeat: Infinity, duration: 0.1 }}
          className='absolute -left-8 top-4 w-16 h-12 bg-white/60 rounded-full border-2 border-sky-200 origin-right'
        />
        <motion.div
          animate={{ rotate: [0, -30, 0] }}
          transition={{ repeat: Infinity, duration: 0.1 }}
          className='absolute -right-8 top-4 w-16 h-12 bg-white/60 rounded-full border-2 border-sky-200 origin-left'
        />
        <div className='w-full h-full bg-orange-500 rounded-full border-2 md:border-4 border-slate-900 flex flex-col overflow-hidden relative shadow-lg'>
          <div className='h-1/4 w-full bg-slate-900/40' />
          <div className='h-1/4 w-full bg-slate-900/90' />
          <div className='h-1/4 w-full bg-slate-900/40' />
          <div className='h-1/4 w-full bg-slate-900/90' />
          <div className='absolute top-1/4 left-1/4 w-2 h-2 md:w-4 md:h-4 bg-slate-900 rounded-full'>
            <div className='absolute top-0.5 left-0.5 w-0.5 h-0.5 md:w-1.5 md:h-1.5 bg-white rounded-full' />
          </div>
          <div className='absolute top-1/4 right-1/4 w-2 h-2 md:w-4 md:h-4 bg-slate-900 rounded-full'>
            <div className='absolute top-0.5 left-0.5 w-0.5 h-0.5 md:w-1.5 md:h-1.5 bg-white rounded-full' />
          </div>
          {shrugging && (
            <>
              <div className='absolute top-[18%] left-[18%] w-3 h-0.5 md:w-5 md:h-1 bg-slate-900 rotate-[25deg] rounded-full' />
              <div className='absolute top-[18%] right-[18%] w-3 h-0.5 md:w-5 md:h-1 bg-slate-900 -rotate-[25deg] rounded-full' />
            </>
          )}
          <div
            className={`absolute bottom-1/4 left-1/2 -translate-x-1/2 w-4 h-2 md:w-8 md:h-4 ${shrugging ? "border-t-2 md:border-t-4 border-b-0" : "border-b-2 md:border-b-4"} border-slate-900 rounded-full`}
          />
        </div>
        <div className='absolute -top-4 left-1/3 w-1 h-6 bg-slate-900 -rotate-12'>
          <div className='absolute -top-2 -left-1 w-3 h-3 bg-slate-900 rounded-full' />
        </div>
        <div className='absolute -top-4 right-1/3 w-1 h-6 bg-slate-900 rotate-12'>
          <div className='absolute -top-2 -left-1 w-3 h-3 bg-slate-900 rounded-full' />
        </div>
      </motion.div>
    </div>
  );
}

const playSound = (type: "xp" | "thud" | "click" | "levelup" | "star") => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  if (type === "xp") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
  } else if (type === "thud") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  } else if (type === "click") {
    osc.type = "square";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  } else if (type === "levelup") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(261.63, ctx.currentTime);
    osc.frequency.setValueAtTime(329.63, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(392.0, ctx.currentTime + 0.2);
    osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  } else if (type === "star") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(1000, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
};

export default function SpellingBeePage() {
  const [showStart, setShowStart] = useState(true);
  const [progress, setProgress] = useState<Progress>(INITIAL_PROGRESS);
  const [transient, setTransient] = useState<Transient>(INITIAL_TRANSIENT);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [showGraduation, setShowGraduation] = useState(false);
  const [toast, setToast] = useState<{ kind: "gradeUp" | "gradeDown" | "mastery"; text: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load saved progress on mount (window not available during SSR).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(loadProgress());
    setHydrated(true);
  }, []);

  // Persist progress whenever it changes
  useEffect(() => {
    if (!hydrated) return;
    saveProgress(progress);
  }, [progress, hydrated]);

  const pickAndSet = (level: number, recent: string[]) => {
    const next = pickQuestion(level, recent);
    const opts = shuffleInPlace([next.answer, ...next.decoys]);
    setCurrentQuestion(next);
    setOptions(opts);
    setTransient((t) => ({ ...t, attemptsLeft: 2, wrongGuesses: [], revealed: false, gotItRight: false }));
  };

  const startGame = () => {
    setTransient(INITIAL_TRANSIENT);
    setRecentIds([]);
    setShowGraduation(false);
    setToast(null);
    setShowStart(false);
    pickAndSet(progress.level, []);
  };

  const resetProgress = () => {
    const fresh = { ...INITIAL_PROGRESS };
    setProgress(fresh);
    saveProgress(fresh);
    setRecentIds([]);
    setShowGraduation(false);
    setToast(null);
    pickAndSet(fresh.level, []);
  };

  const finishQuestion = (outcome: "first-try" | "second-try" | "failed") => {
    if (!currentQuestion) return;

    let delta = 0;
    let newStreak = transient.streak;
    let masteryHit = false;

    if (outcome === "first-try") {
      delta = FIRST_TRY_BONUS;
      newStreak += 1;
      if (newStreak >= MASTERY_STREAK) {
        delta += MASTERY_BONUS;
        masteryHit = true;
        newStreak = 0;
      }
    } else if (outcome === "second-try") {
      delta = SECOND_TRY_BONUS;
      newStreak = 0;
    } else {
      delta = -WRONG_PENALTY;
      newStreak = 0;
    }

    const oldLevel = progress.level;
    const newLevel = clampLevel(oldLevel + delta);
    const oldGrade = gradeIndexFromLevel(oldLevel);
    const newGrade = gradeIndexFromLevel(newLevel);
    const correctIncrement = outcome === "failed" ? 0 : 1;
    const newHighest = Math.max(progress.highestLevel, newLevel);
    const reachedGraduation = !progress.reachedGraduation && newLevel >= MAX_LEVEL - 0.001;

    setProgress((p) => ({
      ...p,
      level: newLevel,
      totalCorrect: p.totalCorrect + correctIncrement,
      totalAnswered: p.totalAnswered + 1,
      highestLevel: newHighest,
      reachedGraduation: p.reachedGraduation || reachedGraduation,
    }));
    setTransient((t) => ({ ...t, streak: newStreak }));

    const newRecent = [currentQuestion.id, ...recentIds].slice(0, RECENT_MEMORY);
    setRecentIds(newRecent);

    // Celebrations / toasts
    if (reachedGraduation) {
      playSound("levelup");
      setShowGraduation(true);
      confetti({ particleCount: 250, spread: 100, origin: { y: 0.6 } });
      return;
    }
    if (newGrade > oldGrade) {
      playSound("levelup");
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      setToast({ kind: "gradeUp", text: `Welcome to ${GRADES[newGrade]}!` });
      setTimeout(() => setToast(null), 2200);
    } else if (newGrade < oldGrade) {
      setToast({ kind: "gradeDown", text: `Sliding back to ${GRADES[newGrade]}` });
      setTimeout(() => setToast(null), 2000);
    } else if (masteryHit) {
      playSound("star");
      confetti({ particleCount: 40, spread: 40, origin: { y: 0.7 } });
      setToast({ kind: "mastery", text: `Mastery! +${MASTERY_BONUS.toFixed(2)}` });
      setTimeout(() => setToast(null), 1600);
    }

    pickAndSet(newLevel, newRecent);
  };

  const handleAnswerClick = (chosen: string) => {
    if (!currentQuestion) return;
    if (transient.revealed || transient.gotItRight) return;
    if (transient.wrongGuesses.includes(chosen)) return;
    playSound("click");

    if (chosen === answerOf(currentQuestion)) {
      playSound("xp");
      const firstTry = transient.wrongGuesses.length === 0;
      setTransient((t) => ({ ...t, gotItRight: true }));
      setTimeout(() => finishQuestion(firstTry ? "first-try" : "second-try"), 1300);
    } else {
      playSound("thud");
      const newAttempts = transient.attemptsLeft - 1;
      setTransient((t) => ({
        ...t,
        wrongGuesses: [...t.wrongGuesses, chosen],
        attemptsLeft: newAttempts,
        shrugging: true,
      }));
      setTimeout(() => setTransient((t) => ({ ...t, shrugging: false })), 600);
      if (newAttempts === 0) {
        setTimeout(() => {
          setTransient((t) => ({ ...t, revealed: true }));
          setTimeout(() => finishQuestion("failed"), 1500);
        }, 700);
      }
    }
  };

  const dismissGraduation = () => {
    setShowGraduation(false);
    pickAndSet(progress.level, recentIds);
  };

  // ==================== Start screen ====================
  if (showStart) {
    const grade = gradeNameFromLevel(progress.level);
    const hasProgress = progress.totalAnswered > 0;
    return (
      <div className='min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans'>
        <div
          className='fixed inset-0 pointer-events-none opacity-[0.05]'
          style={{ backgroundImage: "radial-gradient(#f97316 2px, transparent 2px)", backgroundSize: "40px 40px" }}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className='flex flex-col items-center gap-6 z-10 max-w-xl'
        >
          <BeeCharacter />
          <h1 className='text-5xl font-black uppercase tracking-widest text-slate-100'>Spelling Bee</h1>
          {hasProgress && (
            <div className='bg-slate-800 border-2 border-orange-500 rounded-2xl px-6 py-4 text-center'>
              <div className='text-orange-400 text-xs font-black uppercase tracking-widest mb-1'>Saved Progress</div>
              <div className='text-slate-100 text-2xl font-black'>{grade}</div>
              <div className='text-slate-400 text-sm mt-1'>
                Level {progress.level.toFixed(2)} · {progress.totalCorrect}/{progress.totalAnswered} answered
              </div>
            </div>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startGame}
            className='bg-orange-500 hover:bg-orange-400 text-white px-16 py-6 rounded-full text-3xl font-black uppercase tracking-wider transition-colors shadow-[0_6px_0_rgb(154,52,18)] active:shadow-none active:translate-y-1'
          >
            {hasProgress ? "Continue" : "Start!"}
          </motion.button>
          {hasProgress && (
            <button
              onClick={resetProgress}
              className='text-slate-500 text-sm font-bold uppercase tracking-widest hover:text-orange-400 transition-colors'
            >
              Reset progress
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const correctAnswer = answerOf(currentQuestion);
  const accuracy = progress.totalAnswered > 0 ? Math.round((progress.totalCorrect / progress.totalAnswered) * 100) : 0;
  const grade = gradeNameFromLevel(progress.level);
  const gradeIdx = gradeIndexFromLevel(progress.level);
  const gradeProg = gradeProgress(progress.level);

  const promptHeader =
    currentQuestion.kind === "emoji"
      ? currentQuestion.instruction
      : currentQuestion.kind === "letter"
        ? `This is the ${currentQuestion.case === "upper" ? "uppercase" : "lowercase"} ${currentQuestion.letter}.`
        : currentQuestion.instruction;

  const promptCta = currentQuestion.kind === "letter" ? `Find the ${currentQuestion.letter}` : null;

  return (
    <div className='h-screen h-[100dvh] bg-slate-900 flex flex-col items-center p-2 md:p-8 font-sans overflow-hidden selection:bg-orange-500/30 relative'>
      <div className='fixed inset-0 pointer-events-none'>
        <div className='absolute top-10 right-10 w-24 h-24 bg-slate-200 rounded-full blur-sm opacity-80 shadow-[0_0_50px_rgba(255,255,255,0.3)]' />
        <div className='absolute top-20 left-[10%] w-2 h-2 bg-yellow-300 rounded-full blur-[2px] shadow-[0_0_10px_rgba(253,224,71,0.8)] animate-pulse' />
        <div
          className='absolute bottom-40 right-[15%] w-3 h-3 bg-orange-300 rounded-full blur-[2px] shadow-[0_0_15px_rgba(253,186,116,0.8)] animate-pulse'
          style={{ animationDelay: "1s" }}
        />
        <div
          className='absolute top-1/2 left-[5%] w-2 h-2 bg-sky-300 rounded-full blur-[2px] shadow-[0_0_10px_rgba(125,211,252,0.8)] animate-pulse'
          style={{ animationDelay: "0.5s" }}
        />
        <div
          className='absolute top-1/3 right-[25%] w-1.5 h-1.5 bg-white rounded-full blur-[1px] shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse'
          style={{ animationDelay: "1.5s" }}
        />
        <div
          className='absolute inset-0 opacity-[0.05]'
          style={{ backgroundImage: "radial-gradient(#f97316 2px, transparent 2px)", backgroundSize: "40px 40px" }}
        />
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-40 px-5 py-3 rounded-full font-black uppercase tracking-wider text-sm md:text-base flex items-center gap-2 shadow-2xl border-2 ${
              toast.kind === "gradeUp"
                ? "bg-emerald-500 border-emerald-300 text-white"
                : toast.kind === "mastery"
                  ? "bg-yellow-400 border-yellow-200 text-slate-900"
                  : "bg-slate-700 border-slate-500 text-slate-100"
            }`}
          >
            {toast.kind === "gradeUp" && <ChevronUp className='w-5 h-5' />}
            {toast.kind === "gradeDown" && <ChevronDown className='w-5 h-5' />}
            {toast.kind === "mastery" && <Sparkles className='w-5 h-5' />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className='w-full max-w-4xl mb-2 md:mb-6 z-10 shrink-0'>
        <div className='flex justify-between items-center mb-2 gap-2'>
          <h2 className='text-slate-100 text-base md:text-2xl font-black uppercase tracking-widest flex items-center gap-2 min-w-0'>
            <Bee className='w-6 h-6 md:w-8 md:h-8 text-orange-500 shrink-0' />
            <span className='truncate'>{grade}</span>
            <span className='hidden md:inline text-base text-slate-400 font-bold normal-case tracking-normal'>
              · {currentQuestion.subject} / {currentQuestion.skill}
            </span>
          </h2>
          <div className='bg-slate-800 px-3 py-0.5 md:px-4 md:py-1 rounded-full border-2 border-slate-700 text-slate-300 text-[10px] md:text-sm font-black uppercase shadow-sm shrink-0'>
            Lvl {progress.level.toFixed(2)} · {progress.totalCorrect}/{progress.totalAnswered}
            {progress.totalAnswered > 0 && ` · ${accuracy}%`}
          </div>
        </div>
        {/* Grade pips: Pre-K → 5th */}
        <div className='flex gap-1 md:gap-1.5 items-center'>
          {GRADES.map((_g, i) => {
            const isPast = i < gradeIdx;
            const isCurrent = i === gradeIdx;
            return (
              <div
                key={i}
                className={`flex-1 h-2 md:h-3 rounded-full overflow-hidden border ${isPast ? "bg-orange-500 border-orange-300" : "bg-slate-800 border-slate-700"}`}
              >
                {isCurrent && (
                  <div
                    className='h-full bg-orange-500 transition-all duration-500'
                    style={{ width: `${gradeProg * 100}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {/* Mastery streak indicator */}
        {transient.streak > 0 && (
          <div className='mt-1 flex items-center gap-1.5'>
            {Array.from({ length: MASTERY_STREAK }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${i < transient.streak ? "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" : "bg-slate-700"}`}
              />
            ))}
            <span className='text-[10px] md:text-xs text-slate-500 font-black uppercase tracking-widest ml-1'>
              streak
            </span>
          </div>
        )}
      </div>

      <div className='flex-1 w-full max-w-4xl flex flex-col items-center justify-center gap-3 md:gap-8 z-10 min-h-0 py-2'>
        <BeeCharacter shrugging={transient.shrugging} />

        {/* Prompt card */}
        <div className='flex flex-col items-center gap-2 md:gap-3 shrink-0 px-4'>
          <p className='text-slate-400 text-xs md:text-sm font-black uppercase tracking-widest text-center'>
            {promptHeader}
          </p>
          <motion.div
            key={`${currentQuestion.id}-${progress.totalAnswered}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className='px-6 py-5 md:px-10 md:py-8 bg-slate-800 rounded-3xl md:rounded-[2rem] border-4 md:border-8 border-slate-700 shadow-2xl min-w-[8rem] md:min-w-[12rem] text-center'
          >
            {currentQuestion.kind === "emoji" && (
              <span className='text-5xl md:text-8xl leading-tight block'>{currentQuestion.emoji}</span>
            )}
            {currentQuestion.kind === "letter" && (
              <span className='text-7xl md:text-9xl leading-none block font-black text-orange-400 font-serif'>
                {currentQuestion.letter}
              </span>
            )}
            {currentQuestion.kind === "text" && (
              <span className='text-2xl md:text-4xl leading-snug block text-slate-100 font-black'>
                {currentQuestion.text}
              </span>
            )}
          </motion.div>
          {promptCta && (
            <p className='text-slate-300 text-sm md:text-base font-black uppercase tracking-widest text-center'>
              {promptCta}
            </p>
          )}
          <div className='flex gap-1.5 md:gap-2 items-center mt-1'>
            {[0, 1].map((i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 md:w-5 md:h-5 rounded-full border-2 transition-colors ${
                  i < transient.attemptsLeft
                    ? "bg-orange-500 border-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.6)]"
                    : "bg-slate-700 border-slate-600"
                }`}
              />
            ))}
            <span className='ml-2 text-slate-400 text-[10px] md:text-sm font-black uppercase tracking-widest'>
              {transient.attemptsLeft} {transient.attemptsLeft === 1 ? "try" : "tries"}
            </span>
          </div>
        </div>

        {/* Answer choices */}
        <div className='w-full bg-slate-800 p-3 md:p-6 rounded-2xl md:rounded-3xl border-2 md:border-4 border-slate-700 shadow-xl shrink-0'>
          <div className='flex flex-wrap gap-2 md:gap-4 justify-center'>
            <AnimatePresence mode='popLayout'>
              {options.map((opt) => {
                const isWrong = transient.wrongGuesses.includes(opt);
                const isCorrect = transient.gotItRight && opt === correctAnswer;
                const isRevealed = transient.revealed && opt === correctAnswer;
                const disabled = isWrong || transient.gotItRight || transient.revealed;
                const isLetter = currentQuestion.kind === "letter";
                return (
                  <motion.button
                    key={`${currentQuestion.id}-${progress.totalAnswered}-${opt}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={
                      isWrong
                        ? { opacity: 0.6, y: 0, x: [-8, 8, -8, 8, 0] }
                        : isCorrect || isRevealed
                          ? { opacity: 1, y: 0, scale: [1, 1.15, 1] }
                          : { opacity: 1, y: 0 }
                    }
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={!disabled ? { scale: 1.05, y: -3 } : {}}
                    whileTap={!disabled ? { scale: 0.95 } : {}}
                    onClick={() => handleAnswerClick(opt)}
                    disabled={disabled}
                    className={`px-4 py-3 md:px-8 md:py-5 font-black rounded-xl md:rounded-2xl border-b-2 md:border-b-4 flex items-center justify-center transition-colors ${
                      isLetter
                        ? "text-3xl md:text-5xl font-serif min-w-[4rem] md:min-w-[6rem]"
                        : "text-lg md:text-2xl min-w-[5rem] md:min-w-[8rem]"
                    } ${
                      isCorrect || isRevealed
                        ? "bg-green-500 border-green-700 text-white ring-4 ring-green-400/50"
                        : isWrong
                          ? "bg-red-500 border-red-700 text-white line-through"
                          : "bg-slate-700 hover:bg-orange-500 text-slate-100 border-slate-900 hover:border-orange-700"
                    }`}
                  >
                    {opt}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Graduation overlay */}
      <AnimatePresence>
        {showGraduation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-6 z-50'
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className='bg-slate-800 border-8 border-orange-500 p-10 md:p-12 rounded-3xl shadow-2xl text-center max-w-lg w-full'
            >
              <GraduationCap className='w-28 h-28 md:w-32 md:h-32 text-orange-400 mx-auto mb-4' />
              <h1 className='text-4xl md:text-5xl font-black mb-3 uppercase tracking-widest text-orange-500'>
                Graduated!
              </h1>
              <p className='text-lg md:text-xl mb-6 font-bold text-slate-300'>
                You climbed all the way through 5th grade!
              </p>
              <div className='flex justify-center gap-6 mb-8 text-slate-200'>
                <div>
                  <div className='text-3xl md:text-4xl font-black text-orange-400'>{progress.totalCorrect}</div>
                  <div className='text-xs md:text-sm uppercase tracking-widest text-slate-400'>Correct</div>
                </div>
                <div>
                  <div className='text-3xl md:text-4xl font-black text-orange-400'>{accuracy}%</div>
                  <div className='text-xs md:text-sm uppercase tracking-widest text-slate-400'>Accuracy</div>
                </div>
              </div>
              <button
                onClick={dismissGraduation}
                className='bg-orange-500 hover:bg-orange-400 text-white px-10 py-4 rounded-full text-xl md:text-2xl font-black uppercase tracking-wider transition-all shadow-[0_6px_0_rgb(154,52,18)] active:shadow-none active:translate-y-1 inline-flex items-center gap-2 mx-auto'
              >
                <Crown className='w-6 h-6' /> Keep Buzzing!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
