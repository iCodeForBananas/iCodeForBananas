"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Bug as Bee, ChevronRight } from 'lucide-react';
import confetti from 'canvas-confetti';

interface WordData {
  word: string;
  emoji: string;
  boxes: string[][];
  phonemes: string[];
}

interface GameState {
  currentLevel: number;
  currentWordIndex: number;
  currentBoxIndex: number;
  currentLetterIndex: number;
  wordsCompleted: number;
  isComplete: boolean;
  shrugging: boolean;
  showHeart: boolean;
}

const LEVELS: Record<number, WordData[]> = {
  1: [
    { word: 'cat', emoji: '🐈', boxes: [['c'], ['a'], ['t']], phonemes: ['c', 'a', 't'] },
    { word: 'dog', emoji: '🐕', boxes: [['d'], ['o'], ['g']], phonemes: ['d', 'o', 'g'] },
    { word: 'sun', emoji: '☀️', boxes: [['s'], ['u'], ['n']], phonemes: ['s', 'u', 'n'] },
    { word: 'hat', emoji: '🎩', boxes: [['h'], ['a'], ['t']], phonemes: ['h', 'a', 't'] },
    { word: 'bug', emoji: '🐛', boxes: [['b'], ['u'], ['g']], phonemes: ['b', 'u', 'g'] },
  ],
  2: [
    { word: 'cake', emoji: '🎂', boxes: [['c'], ['a'], ['k'], ['e']], phonemes: ['c', 'a', 'k', 'e'] },
    { word: 'bone', emoji: '🦴', boxes: [['b'], ['o'], ['n'], ['e']], phonemes: ['b', 'o', 'n', 'e'] },
    { word: 'kite', emoji: '🪁', boxes: [['k'], ['i'], ['t'], ['e']], phonemes: ['k', 'i', 't', 'e'] },
    { word: 'frog', emoji: '🐸', boxes: [['f'], ['r'], ['o'], ['g']], phonemes: ['f', 'r', 'o', 'g'] },
    { word: 'tree', emoji: '🌳', boxes: [['t'], ['r'], ['e'], ['e']], phonemes: ['t', 'r', 'e', 'e'] },
  ],
  3: [
    { word: 'stone', emoji: '🪨', boxes: [['s'], ['t'], ['o'], ['n'], ['e']], phonemes: ['s', 't', 'o', 'n', 'e'] },
    { word: 'clock', emoji: '🕐', boxes: [['c'], ['l'], ['o'], ['c'], ['k']], phonemes: ['c', 'l', 'o', 'c', 'k'] },
    { word: 'brush', emoji: '🖌️', boxes: [['b'], ['r'], ['u'], ['s'], ['h']], phonemes: ['b', 'r', 'u', 's', 'h'] },
    { word: 'snail', emoji: '🐌', boxes: [['s'], ['n'], ['a'], ['i'], ['l']], phonemes: ['s', 'n', 'a', 'i', 'l'] },
    { word: 'plant', emoji: '🌱', boxes: [['p'], ['l'], ['a'], ['n'], ['t']], phonemes: ['p', 'l', 'a', 'n', 't'] },
  ],
  4: [
    { word: 'school', emoji: '🏫', boxes: [['s'], ['c'], ['h'], ['o'], ['o'], ['l']], phonemes: ['s', 'c', 'h', 'o', 'o', 'l'] },
    { word: 'friend', emoji: '🤝', boxes: [['f'], ['r'], ['i'], ['e'], ['n'], ['d']], phonemes: ['f', 'r', 'i', 'e', 'n', 'd'] },
    { word: 'rocket', emoji: '🚀', boxes: [['r'], ['o'], ['c'], ['k'], ['e'], ['t']], phonemes: ['r', 'o', 'c', 'k', 'e', 't'] },
    { word: 'spider', emoji: '🕷️', boxes: [['s'], ['p'], ['i'], ['d'], ['e'], ['r']], phonemes: ['s', 'p', 'i', 'd', 'e', 'r'] },
    { word: 'flower', emoji: '🌸', boxes: [['f'], ['l'], ['o'], ['w'], ['e'], ['r']], phonemes: ['f', 'l', 'o', 'w', 'e', 'r'] },
  ],
  5: [
    { word: 'brother', emoji: '👦', boxes: [['b'], ['r'], ['o'], ['t'], ['h'], ['e'], ['r']], phonemes: ['b', 'r', 'o', 't', 'h', 'e', 'r'] },
    { word: 'morning', emoji: '🌅', boxes: [['m'], ['o'], ['r'], ['n'], ['i'], ['n'], ['g']], phonemes: ['m', 'o', 'r', 'n', 'i', 'n', 'g'] },
    { word: 'weather', emoji: '🌤️', boxes: [['w'], ['e'], ['a'], ['t'], ['h'], ['e'], ['r']], phonemes: ['w', 'e', 'a', 't', 'h', 'e', 'r'] },
    { word: 'monster', emoji: '👾', boxes: [['m'], ['o'], ['n'], ['s'], ['t'], ['e'], ['r']], phonemes: ['m', 'o', 'n', 's', 't', 'e', 'r'] },
    { word: 'rainbow', emoji: '🌈', boxes: [['r'], ['a'], ['i'], ['n'], ['b'], ['o'], ['w']], phonemes: ['r', 'a', 'i', 'n', 'b', 'o', 'w'] },
  ],
};

const LEVEL_NAMES = ['Simple Things', 'Nature & Fun', 'Around Us', 'Big World', 'Boss Words'];

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
  currentLevel: 1, currentWordIndex: 0, currentBoxIndex: 0, currentLetterIndex: 0,
  wordsCompleted: 0, isComplete: false, shrugging: false, showHeart: false,
};

export default function SpellingBeePage() {
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [filledBoxes, setFilledBoxes] = useState<string[][]>([]);
  const [letterChoices, setLetterChoices] = useState<string[]>([]);
  const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set());
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const currentWord = LEVELS[state.currentLevel][state.currentWordIndex];

  useEffect(() => {
    if (showLevelUp || state.isComplete) return;
    setFilledBoxes(currentWord.boxes.map(() => []));
    setState(s => ({ ...s, currentBoxIndex: 0, currentLetterIndex: 0, showHeart: false }));
    setUsedIndices(new Set());
    // Include every letter in the word (preserving duplicates) + 3 decoys
    const wordLetters = currentWord.word.split('');
    const uniqueInWord = new Set(wordLetters);
    const decoyPool = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(l => !uniqueInWord.has(l));
    const decoys: string[] = [];
    while (decoys.length < 3 && decoyPool.length > 0) {
      const idx = Math.floor(Math.random() * decoyPool.length);
      decoys.push(decoyPool.splice(idx, 1)[0]);
    }
    setLetterChoices([...wordLetters, ...decoys].sort(() => Math.random() - 0.5));
  }, [state.currentWordIndex, state.currentLevel, showLevelUp, state.isComplete]);

  const handleLetterClick = (letter: string, idx: number) => {
    if (state.isComplete || showLevelUp || wrongIdx !== null) return;
    playSound('click');
    const expected = currentWord.boxes[state.currentBoxIndex][state.currentLetterIndex];
    if (letter === expected) {
      playSound('xp');
      setUsedIndices(prev => new Set(prev).add(idx));
      const newFilled = [...filledBoxes];
      newFilled[state.currentBoxIndex] = [...newFilled[state.currentBoxIndex], letter];
      setFilledBoxes(newFilled);
      const isBoxComplete = state.currentLetterIndex + 1 === currentWord.boxes[state.currentBoxIndex].length;
      if (isBoxComplete) {
        if (state.currentBoxIndex + 1 === currentWord.boxes.length) handleWordCompletion();
        else setState(s => ({ ...s, currentBoxIndex: s.currentBoxIndex + 1, currentLetterIndex: 0 }));
      } else {
        setState(s => ({ ...s, currentLetterIndex: s.currentLetterIndex + 1 }));
      }
    } else {
      playSound('thud');
      setWrongIdx(idx);
      setState(s => ({ ...s, shrugging: true }));
      setTimeout(() => { setWrongIdx(null); setState(s => ({ ...s, shrugging: false })); }, 600);
    }
  };

  const handleWordCompletion = () => {
    playSound('levelup');
    const newCompleted = state.wordsCompleted + 1;
    const isLastWordInLevel = state.currentWordIndex + 1 === 5;
    setTimeout(() => {
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
    }, 1500);
  };

  const advanceLevel = () => {
    setShowLevelUp(false);
    setState(s => ({ ...s, currentLevel: s.currentLevel + 1, currentWordIndex: 0 }));
  };

  if (state.isComplete) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white font-sans">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="bg-slate-800 border-8 border-orange-500 p-12 rounded-3xl shadow-2xl text-center max-w-lg w-full">
          <Trophy className="w-32 h-32 text-orange-400 mx-auto mb-6" />
          <h1 className="text-5xl font-black mb-4 uppercase tracking-widest text-orange-500">Queen Bee!</h1>
          <p className="text-2xl mb-4 font-bold text-slate-300">You spelled all 25 words!</p>
          <p className="text-6xl font-black text-orange-400 mb-8">{state.wordsCompleted}/25</p>
          <button onClick={() => setState(INITIAL_STATE)}
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
          <p className="text-slate-400 mb-8">Words spelled: {state.wordsCompleted}/25</p>
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
        <div className="relative shrink-0">
          <motion.div animate={{ y: state.shrugging ? [0, -20, 0] : [0, -10, 0], x: state.shrugging ? [0, -10, 10, -10, 10, 0] : 0 }}
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
              {state.shrugging && <>
                <div className="absolute top-[18%] left-[18%] w-3 h-0.5 md:w-5 md:h-1 bg-slate-900 rotate-[25deg] rounded-full" />
                <div className="absolute top-[18%] right-[18%] w-3 h-0.5 md:w-5 md:h-1 bg-slate-900 -rotate-[25deg] rounded-full" />
              </>}
              <div className={`absolute bottom-1/4 left-1/2 -translate-x-1/2 w-4 h-2 md:w-8 md:h-4 ${state.shrugging ? 'border-t-2 md:border-t-4 border-b-0' : 'border-b-2 md:border-b-4'} border-slate-900 rounded-full`} />
            </div>
            <div className="absolute -top-4 left-1/3 w-1 h-6 bg-slate-900 -rotate-12"><div className="absolute -top-2 -left-1 w-3 h-3 bg-slate-900 rounded-full" /></div>
            <div className="absolute -top-4 right-1/3 w-1 h-6 bg-slate-900 rotate-12"><div className="absolute -top-2 -left-1 w-3 h-3 bg-slate-900 rounded-full" /></div>
          </motion.div>
        </div>

        {/* Elkonin Boxes */}
        <div className="flex gap-1 md:gap-4 items-end shrink-0">
          {currentWord.boxes.map((box, i) => (
            <div key={i} className="relative flex flex-col items-center">
              <div className={`w-10 h-10 md:w-20 md:h-20 bg-slate-800 border-2 md:border-4 rounded-xl md:rounded-2xl flex items-center justify-center text-xl md:text-4xl font-black uppercase text-slate-100 ${state.currentBoxIndex === i ? 'border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.5)] ring-2 md:ring-4 ring-orange-900' : 'border-slate-600'} transition-all duration-300`}>
                {filledBoxes[i]?.join('')}
              </div>
              <div className={`mt-1 md:mt-3 w-2 h-2 md:w-3 md:h-3 rounded-full ${state.currentBoxIndex === i ? 'bg-orange-500 animate-bounce' : 'bg-slate-700'}`} />
            </div>
          ))}
          <div className="ml-2 md:ml-4 p-3 md:p-5 bg-slate-800 rounded-xl md:rounded-2xl border-2 md:border-4 border-slate-700 flex items-center justify-center">
            <span className="text-4xl md:text-6xl">{currentWord.emoji}</span>
          </div>
        </div>

        {/* Letter Bank */}
        <div className="w-full bg-slate-800 p-2 md:p-6 rounded-2xl md:rounded-3xl border-2 md:border-4 border-slate-700 shadow-xl shrink-0">
          <div className="flex flex-wrap gap-2 md:gap-3 justify-center">
            <AnimatePresence>
            {letterChoices.map((letter, idx) => !usedIndices.has(idx) && (
              <motion.button key={idx} layout
                initial={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                animate={wrongIdx === idx ? { x: [-8, 8, -8, 8, 0], scale: [1, 1.2, 1] } : {}}
                whileHover={wrongIdx === null ? { scale: 1.1, y: -2 } : {}}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleLetterClick(letter, idx)}
                className={`w-12 h-12 md:w-16 md:h-16 font-black text-lg md:text-3xl uppercase rounded-lg md:rounded-xl border-b-2 md:border-b-4 flex items-center justify-center transition-colors ${
                  wrongIdx === idx
                    ? 'bg-red-500 border-red-700 text-white ring-4 ring-red-400/50'
                    : 'bg-slate-700 hover:bg-orange-500 text-slate-100 border-slate-900 hover:border-orange-700'
                }`}>
                {letter}
              </motion.button>
            ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mt-1 md:mt-4 text-slate-400 text-[10px] md:text-sm font-black uppercase tracking-widest text-center shrink-0">
        Buzz the letters to build the word!
      </div>
    </div>
  );
}
