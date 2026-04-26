"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Bug as Bee, ChevronRight } from 'lucide-react';
import confetti from 'canvas-confetti';

interface WordData {
  word: string;
  emoji: string;
  decoys: [string, string];
}

interface GameState {
  currentLevel: number;
  currentWordIndex: number;
  wordsCompleted: number;
  attemptsLeft: number;
  isComplete: boolean;
  shrugging: boolean;
  wrongGuesses: string[];
  revealed: boolean;
  gotItRight: boolean;
}

const LEVELS: Record<number, WordData[]> = {
  1: [
    { word: 'cat', emoji: '🐈', decoys: ['hat', 'bat'] },
    { word: 'dog', emoji: '🐕', decoys: ['fog', 'log'] },
    { word: 'sun', emoji: '☀️', decoys: ['bun', 'run'] },
    { word: 'hat', emoji: '🎩', decoys: ['mat', 'rat'] },
    { word: 'bug', emoji: '🐛', decoys: ['mug', 'rug'] },
  ],
  2: [
    { word: 'cake', emoji: '🎂', decoys: ['rake', 'lake'] },
    { word: 'bone', emoji: '🦴', decoys: ['cone', 'zone'] },
    { word: 'kite', emoji: '🪁', decoys: ['bite', 'site'] },
    { word: 'frog', emoji: '🐸', decoys: ['flag', 'drop'] },
    { word: 'tree', emoji: '🌳', decoys: ['bee', 'knee'] },
  ],
  3: [
    { word: 'stone', emoji: '🪨', decoys: ['phone', 'alone'] },
    { word: 'clock', emoji: '🕐', decoys: ['block', 'flock'] },
    { word: 'brush', emoji: '🖌️', decoys: ['crush', 'flush'] },
    { word: 'snail', emoji: '🐌', decoys: ['trail', 'nail'] },
    { word: 'plant', emoji: '🌱', decoys: ['plane', 'grant'] },
  ],
  4: [
    { word: 'school', emoji: '🏫', decoys: ['stool', 'spool'] },
    { word: 'friend', emoji: '🤝', decoys: ['fright', 'fiend'] },
    { word: 'rocket', emoji: '🚀', decoys: ['pocket', 'locket'] },
    { word: 'spider', emoji: '🕷️', decoys: ['slider', 'rider'] },
    { word: 'flower', emoji: '🌸', decoys: ['tower', 'power'] },
  ],
  5: [
    { word: 'brother', emoji: '👦', decoys: ['bother', 'mother'] },
    { word: 'morning', emoji: '🌅', decoys: ['warning', 'meaning'] },
    { word: 'weather', emoji: '🌤️', decoys: ['feather', 'leather'] },
    { word: 'monster', emoji: '👾', decoys: ['hamster', 'rooster'] },
    { word: 'rainbow', emoji: '🌈', decoys: ['window', 'rainfall'] },
  ],
};

const LEVEL_NAMES = ['Simple Things', 'Nature & Fun', 'Around Us', 'Big World', 'Boss Words'];

function BeeCharacter({ shrugging = false }: { shrugging?: boolean }) {
  return (
    <div className="relative shrink-0">
      <motion.div animate={{ y: shrugging ? [0, -20, 0] : [0, -10, 0], x: shrugging ? [0, -10, 10, -10, 10, 0] : 0 }}
        transition={{ y: { repeat: Infinity, duration: 2, ease: "easeInOut" }, x: { duration: 0.5 } }}
        className="w-20 h-20 md:w-28 md:h-28 relative">
        <motion.div animate={{ rotate: [0, 30, 0] }} transition={{ repeat: Infinity, duration: 0.1 }}
          className="absolute -left-8 top-4 w-16 h-12 bg-white/60 rounded-full border-2 border-sky-200 origin-right" />
        <motion.div animate={{ rotate: [0, -30, 0] }} transition={{ repeat: Infinity, duration: 0.1 }}
          className="absolute -right-8 top-4 w-16 h-12 bg-white/60 rounded-full border-2 border-sky-200 origin-left" />
        <div className="w-full h-full bg-orange-500 rounded-full border-2 md:border-4 border-slate-900 flex flex-col overflow-hidden relative shadow-lg">
          <div className="h-1/4 w-full bg-slate-900/40" /><div className="h-1/4 w-full bg-slate-900/90" />
          <div className="h-1/4 w-full bg-slate-900/40" /><div className="h-1/4 w-full bg-slate-900/90" />
          <div className="absolute top-1/4 left-1/4 w-2 h-2 md:w-4 md:h-4 bg-slate-900 rounded-full"><div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 md:w-1.5 md:h-1.5 bg-white rounded-full" /></div>
          <div className="absolute top-1/4 right-1/4 w-2 h-2 md:w-4 md:h-4 bg-slate-900 rounded-full"><div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 md:w-1.5 md:h-1.5 bg-white rounded-full" /></div>
          {shrugging && <>
            <div className="absolute top-[18%] left-[18%] w-3 h-0.5 md:w-5 md:h-1 bg-slate-900 rotate-[25deg] rounded-full" />
            <div className="absolute top-[18%] right-[18%] w-3 h-0.5 md:w-5 md:h-1 bg-slate-900 -rotate-[25deg] rounded-full" />
          </>}
          <div className={`absolute bottom-1/4 left-1/2 -translate-x-1/2 w-4 h-2 md:w-8 md:h-4 ${shrugging ? 'border-t-2 md:border-t-4 border-b-0' : 'border-b-2 md:border-b-4'} border-slate-900 rounded-full`} />
        </div>
        <div className="absolute -top-4 left-1/3 w-1 h-6 bg-slate-900 -rotate-12"><div className="absolute -top-2 -left-1 w-3 h-3 bg-slate-900 rounded-full" /></div>
        <div className="absolute -top-4 right-1/3 w-1 h-6 bg-slate-900 rotate-12"><div className="absolute -top-2 -left-1 w-3 h-3 bg-slate-900 rounded-full" /></div>
      </motion.div>
    </div>
  );
}

const playSound = (type: 'xp' | 'thud' | 'click' | 'levelup' | 'star') => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  if (type === 'xp') {
    osc.type = 'triangle'; osc.frequency.setValueAtTime(440, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
  } else if (type === 'thud') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(100, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  } else if (type === 'click') {
    osc.type = 'square'; osc.frequency.setValueAtTime(800, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.05, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  } else if (type === 'levelup') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(261.63, ctx.currentTime); osc.frequency.setValueAtTime(329.63, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(392.00, ctx.currentTime + 0.2); osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  } else if (type === 'star') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(1000, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  }
  osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.5);
};

const INITIAL_STATE: GameState = {
  currentLevel: 1, currentWordIndex: 0, wordsCompleted: 0, attemptsLeft: 2,
  isComplete: false, shrugging: false, wrongGuesses: [], revealed: false, gotItRight: false,
};

export default function SpellingBeePage() {
  const [showStart, setShowStart] = useState(true);
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [wordOptions, setWordOptions] = useState<string[]>([]);
  const [showLevelUp, setShowLevelUp] = useState(false);

  const startGame = (level: number) => {
    setState({ ...INITIAL_STATE, currentLevel: level });
    setShowStart(false);
  };
  const currentWord = LEVELS[state.currentLevel][state.currentWordIndex];

  useEffect(() => {
    if (showLevelUp || state.isComplete) return;
    const options = [currentWord.word, ...currentWord.decoys];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    setWordOptions(options);
    setState(s => ({ ...s, attemptsLeft: 2, wrongGuesses: [], revealed: false, gotItRight: false }));
  }, [state.currentWordIndex, state.currentLevel, showLevelUp, state.isComplete]);

  const advanceAfterAnswer = (gotItRight: boolean) => {
    const newCompleted = state.wordsCompleted + (gotItRight ? 1 : 0);
    const isLastWordInLevel = state.currentWordIndex + 1 === 5;
    if (isLastWordInLevel) {
      if (state.currentLevel === 5) {
        setState(s => ({ ...s, wordsCompleted: newCompleted, isComplete: true }));
        confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
      } else {
        setState(s => ({ ...s, wordsCompleted: newCompleted }));
        setShowLevelUp(true);
        confetti({ particleCount: 100, spread: 50, origin: { y: 0.8 } });
      }
    } else {
      setState(s => ({ ...s, wordsCompleted: newCompleted, currentWordIndex: s.currentWordIndex + 1 }));
    }
  };

  const handleWordClick = (chosenWord: string) => {
    if (state.revealed || state.gotItRight) return;
    if (state.wrongGuesses.includes(chosenWord)) return;
    playSound('click');
    if (chosenWord === currentWord.word) {
      playSound('xp');
      setState(s => ({ ...s, gotItRight: true }));
      if (state.currentWordIndex + 1 === 5 || state.currentLevel === 5) playSound('levelup');
      setTimeout(() => advanceAfterAnswer(true), 1400);
    } else {
      playSound('thud');
      const newAttempts = state.attemptsLeft - 1;
      setState(s => ({
        ...s,
        wrongGuesses: [...s.wrongGuesses, chosenWord],
        attemptsLeft: newAttempts,
        shrugging: true,
      }));
      setTimeout(() => setState(s => ({ ...s, shrugging: false })), 600);
      if (newAttempts === 0) {
        setTimeout(() => {
          setState(s => ({ ...s, revealed: true }));
          setTimeout(() => advanceAfterAnswer(false), 1600);
        }, 700);
      }
    }
  };

  const advanceLevel = () => {
    setShowLevelUp(false);
    setState(s => ({ ...s, currentLevel: s.currentLevel + 1, currentWordIndex: 0 }));
  };

  if (showStart) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans">
        <div className="fixed inset-0 pointer-events-none opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#f97316 2px, transparent 2px)', backgroundSize: '40px 40px' }} />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-8 z-10">
          <BeeCharacter />
          <h1 className="text-5xl font-black uppercase tracking-widest text-slate-100">Spelling Bee</h1>
          <p className="text-slate-300 text-lg md:text-xl text-center max-w-md -mt-4">Pick the word that matches the emoji. You get two tries!</p>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => startGame(1)}
            className="bg-orange-500 hover:bg-orange-400 text-white px-16 py-6 rounded-full text-3xl font-black uppercase tracking-wider transition-colors shadow-[0_6px_0_rgb(154,52,18)] active:shadow-none active:translate-y-1">
            Start!
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (state.isComplete) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white font-sans">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="bg-slate-800 border-8 border-orange-500 p-12 rounded-3xl shadow-2xl text-center max-w-lg w-full">
          <Trophy className="w-32 h-32 text-orange-400 mx-auto mb-6" />
          <h1 className="text-5xl font-black mb-4 uppercase tracking-widest text-orange-500">Queen Bee!</h1>
          <p className="text-2xl mb-4 font-bold text-slate-300">You guessed {state.wordsCompleted} of 25 words!</p>
          <p className="text-6xl font-black text-orange-400 mb-8">{state.wordsCompleted}/25</p>
          <button onClick={() => setShowStart(true)}
            className="bg-orange-500 hover:bg-orange-400 text-white px-10 py-5 rounded-full text-2xl font-black uppercase tracking-wider transition-all shadow-[0_6px_0_rgb(154,52,18)] active:shadow-none active:translate-y-1">
            Buzz Again!
          </button>
        </motion.div>
      </div>
    );
  }

  if (showLevelUp) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white font-sans">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="bg-slate-800 border-8 border-orange-500 p-12 rounded-3xl shadow-2xl text-center max-w-lg w-full">
          <div className="text-8xl mb-6">🎉</div>
          <h2 className="text-4xl font-black mb-2 text-orange-500">Level {state.currentLevel} Complete!</h2>
          <p className="text-xl text-slate-300 mb-2">{LEVEL_NAMES[state.currentLevel - 1]}</p>
          <p className="text-slate-400 mb-8">Words guessed: {state.wordsCompleted}/25</p>
          <button onClick={advanceLevel}
            className="bg-orange-500 hover:bg-orange-400 text-white px-10 py-5 rounded-full text-2xl font-black uppercase tracking-wider transition-all shadow-[0_6px_0_rgb(154,52,18)] active:shadow-none active:translate-y-1 flex items-center gap-3 mx-auto">
            Level {state.currentLevel + 1} <ChevronRight className="w-8 h-8" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen h-[100dvh] bg-slate-900 flex flex-col items-center p-2 md:p-8 font-sans overflow-hidden selection:bg-orange-500/30 relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-10 right-10 w-24 h-24 bg-slate-200 rounded-full blur-sm opacity-80 shadow-[0_0_50px_rgba(255,255,255,0.3)]" />
        <div className="absolute top-20 left-[10%] w-2 h-2 bg-yellow-300 rounded-full blur-[2px] shadow-[0_0_10px_rgba(253,224,71,0.8)] animate-pulse" />
        <div className="absolute bottom-40 right-[15%] w-3 h-3 bg-orange-300 rounded-full blur-[2px] shadow-[0_0_15px_rgba(253,186,116,0.8)] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-[5%] w-2 h-2 bg-sky-300 rounded-full blur-[2px] shadow-[0_0_10px_rgba(125,211,252,0.8)] animate-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute top-1/3 right-[25%] w-1.5 h-1.5 bg-white rounded-full blur-[1px] shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#f97316 2px, transparent 2px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Header */}
      <div className="w-full max-w-4xl mb-2 md:mb-6 z-10 shrink-0">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-slate-100 text-lg md:text-2xl font-black uppercase tracking-widest flex items-center gap-2">
            <Bee className="w-6 h-6 md:w-8 md:h-8 text-orange-500" /> Level {state.currentLevel}
            <span className="text-sm md:text-base text-slate-400 font-bold normal-case tracking-normal">— {LEVEL_NAMES[state.currentLevel - 1]}</span>
          </h2>
          <div className="bg-slate-800 px-3 py-0.5 md:px-4 md:py-1 rounded-full border-2 border-slate-700 text-slate-300 text-[10px] md:text-sm font-black uppercase shadow-sm">
            Word {state.currentWordIndex + 1} / 5
          </div>
        </div>
        {/* Progress stars for current level */}
        <div className="flex gap-2 items-center">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-1 h-2 md:h-3 rounded-full overflow-hidden bg-slate-800 border border-slate-700">
              <div className={`h-full rounded-full transition-all duration-500 ${i < state.currentWordIndex ? 'bg-orange-500 w-full' : i === state.currentWordIndex ? 'bg-orange-500/50 w-1/2' : 'w-0'}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center gap-4 md:gap-10 z-10 min-h-0 py-2">
        {/* Bee */}
        <BeeCharacter shrugging={state.shrugging} />

        {/* Emoji card */}
        <div className="flex flex-col items-center gap-2 md:gap-4 shrink-0">
          <p className="text-slate-400 text-xs md:text-sm font-black uppercase tracking-widest">What is this?</p>
          <motion.div
            key={`${state.currentLevel}-${state.currentWordIndex}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="p-6 md:p-10 bg-slate-800 rounded-3xl md:rounded-[2rem] border-4 md:border-8 border-slate-700 shadow-2xl"
          >
            <span className="text-7xl md:text-9xl leading-none block">{currentWord.emoji}</span>
          </motion.div>
          <div className="flex gap-1.5 md:gap-2 items-center mt-1">
            {[0, 1].map(i => (
              <div key={i} className={`w-4 h-4 md:w-5 md:h-5 rounded-full border-2 transition-colors ${
                i < state.attemptsLeft ? 'bg-orange-500 border-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.6)]' : 'bg-slate-700 border-slate-600'
              }`} />
            ))}
            <span className="ml-2 text-slate-400 text-xs md:text-sm font-black uppercase tracking-widest">{state.attemptsLeft} {state.attemptsLeft === 1 ? 'try' : 'tries'}</span>
          </div>
        </div>

        {/* Word choices */}
        <div className="w-full bg-slate-800 p-3 md:p-6 rounded-2xl md:rounded-3xl border-2 md:border-4 border-slate-700 shadow-xl shrink-0">
          <div className="flex flex-wrap gap-3 md:gap-4 justify-center">
            <AnimatePresence mode="popLayout">
            {wordOptions.map((word) => {
              const isWrong = state.wrongGuesses.includes(word);
              const isCorrect = state.gotItRight && word === currentWord.word;
              const isRevealed = state.revealed && word === currentWord.word;
              const disabled = isWrong || state.gotItRight || state.revealed;
              return (
                <motion.button
                  key={`${state.currentLevel}-${state.currentWordIndex}-${word}`}
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
                  onClick={() => handleWordClick(word)}
                  disabled={disabled}
                  className={`px-6 py-4 md:px-10 md:py-6 font-black text-2xl md:text-4xl lowercase rounded-xl md:rounded-2xl border-b-2 md:border-b-4 flex items-center justify-center transition-colors min-w-[7rem] md:min-w-[11rem] ${
                    isCorrect || isRevealed
                      ? 'bg-green-500 border-green-700 text-white ring-4 ring-green-400/50'
                      : isWrong
                      ? 'bg-red-500 border-red-700 text-white line-through'
                      : 'bg-slate-700 hover:bg-orange-500 text-slate-100 border-slate-900 hover:border-orange-700'
                  }`}
                >
                  {word}
                </motion.button>
              );
            })}
            </AnimatePresence>
          </div>
        </div>
      </div>

    </div>
  );
}
