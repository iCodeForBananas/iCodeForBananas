"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Ear, Heart, Trophy, Bug as Bee, ChevronRight, Star } from 'lucide-react';
import confetti from 'canvas-confetti';

interface WordData {
  word: string;
  boxes: string[][];
  phonemes: string[];
  heart?: number[];
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
    { word: 'at', boxes: [['a'], ['t']], phonemes: ['a', 't'] },
    { word: 'up', boxes: [['u'], ['p']], phonemes: ['u', 'p'] },
    { word: 'cat', boxes: [['c'], ['a'], ['t']], phonemes: ['c', 'a', 't'] },
    { word: 'dog', boxes: [['d'], ['o'], ['g']], phonemes: ['d', 'o', 'g'] },
    { word: 'sun', boxes: [['s'], ['u'], ['n']], phonemes: ['s', 'u', 'n'] },
  ],
  2: [
    { word: 'same', boxes: [['s'], ['a'], ['m'], ['e']], phonemes: ['s', 'a', 'm', 'e'] },
    { word: 'make', boxes: [['m'], ['a'], ['k'], ['e']], phonemes: ['m', 'a', 'k', 'e'] },
    { word: 'hide', boxes: [['h'], ['i'], ['d'], ['e']], phonemes: ['h', 'i', 'd', 'e'] },
    { word: 'line', boxes: [['l'], ['i'], ['n'], ['e']], phonemes: ['l', 'i', 'n', 'e'] },
    { word: 'frog', boxes: [['f'], ['r'], ['o'], ['g']], phonemes: ['f', 'r', 'o', 'g'] },
  ],
  3: [
    { word: 'green', boxes: [['g'], ['r'], ['e'], ['e'], ['n']], phonemes: ['g', 'r', 'e', 'e', 'n'] },
    { word: 'stone', boxes: [['s'], ['t'], ['o'], ['n'], ['e']], phonemes: ['s', 't', 'o', 'n', 'e'] },
    { word: 'seed', boxes: [['s'], ['e'], ['e'], ['d']], phonemes: ['s', 'e', 'e', 'd'] },
    { word: 'clock', boxes: [['c'], ['l'], ['o'], ['c'], ['k']], phonemes: ['c', 'l', 'o', 'c', 'k'] },
    { word: 'brush', boxes: [['b'], ['r'], ['u'], ['s'], ['h']], phonemes: ['b', 'r', 'u', 's', 'h'] },
  ],
  4: [
    { word: 'bright', boxes: [['b'], ['r'], ['i'], ['g'], ['h'], ['t']], phonemes: ['b', 'r', 'i', 'g', 'h', 't'] },
    { word: 'school', boxes: [['s'], ['c'], ['h'], ['o'], ['o'], ['l']], phonemes: ['s', 'c', 'h', 'o', 'o', 'l'] },
    { word: 'friend', boxes: [['f'], ['r'], ['i'], ['e'], ['n'], ['d']], phonemes: ['f', 'r', 'i', 'e', 'n', 'd'] },
    { word: 'please', boxes: [['p'], ['l'], ['e'], ['a'], ['s'], ['e']], phonemes: ['p', 'l', 'e', 'a', 's', 'e'] },
    { word: 'around', boxes: [['a'], ['r'], ['o'], ['u'], ['n'], ['d']], phonemes: ['a', 'r', 'o', 'u', 'n', 'd'] },
  ],
  5: [
    { word: 'brother', boxes: [['b'], ['r'], ['o'], ['t'], ['h'], ['e'], ['r']], phonemes: ['b', 'r', 'o', 't', 'h', 'e', 'r'] },
    { word: 'morning', boxes: [['m'], ['o'], ['r'], ['n'], ['i'], ['n'], ['g']], phonemes: ['m', 'o', 'r', 'n', 'i', 'n', 'g'] },
    { word: 'weather', boxes: [['w'], ['e'], ['a'], ['t'], ['h'], ['e'], ['r']], phonemes: ['w', 'e', 'a', 't', 'h', 'e', 'r'] },
    { word: 'thought', boxes: [['t'], ['h'], ['o'], ['u'], ['g'], ['h'], ['t']], phonemes: ['t', 'h', 'o', 'u', 'g', 'h', 't'] },
    { word: 'because', boxes: [['b'], ['e'], ['c'], ['a'], ['u'], ['s'], ['e']], phonemes: ['b', 'e', 'c', 'a', 'u', 's', 'e'] },
  ],
};

const LEVEL_NAMES = ['Tiny Words', 'Magic E', 'Blends', 'Big Words', 'Boss Words'];

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

const speak = (text: string, rate = 0.8) => {
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate; u.pitch = 1.2;
  window.speechSynthesis.speak(u);
};

const INITIAL_STATE: GameState = {
  currentLevel: 1, currentWordIndex: 0, currentBoxIndex: 0, currentLetterIndex: 0,
  wordsCompleted: 0, isComplete: false, shrugging: false, showHeart: false,
};

export default function SpellingBeePage() {
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [filledBoxes, setFilledBoxes] = useState<string[][]>([]);
  const [letterChoices, setLetterChoices] = useState<string[]>([]);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const currentWord = LEVELS[state.currentLevel][state.currentWordIndex];

  useEffect(() => {
    if (showLevelUp || state.isComplete) return;
    setFilledBoxes(currentWord.boxes.map(() => []));
    setState(s => ({ ...s, currentBoxIndex: 0, currentLetterIndex: 0, showHeart: false }));
    const wordLetters = [...new Set(currentWord.word.split(''))];
    const allLetters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const decoyPool = allLetters.filter(l => !wordLetters.includes(l));
    const decoys: string[] = [];
    while (decoys.length < 3 && decoyPool.length > 0) {
      const idx = Math.floor(Math.random() * decoyPool.length);
      decoys.push(decoyPool.splice(idx, 1)[0]);
    }
    setLetterChoices([...wordLetters, ...decoys].sort(() => Math.random() - 0.5));
    speak(currentWord.word);
  }, [state.currentWordIndex, state.currentLevel, showLevelUp, state.isComplete]);

  const handleLetterClick = (letter: string) => {
    if (state.isComplete || showLevelUp) return;
    playSound('click');
    const expected = currentWord.boxes[state.currentBoxIndex][state.currentLetterIndex];
    if (letter === expected) {
      playSound('xp');
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
      setState(s => ({ ...s, shrugging: true }));
      speak(currentWord.phonemes[state.currentBoxIndex]);
      setTimeout(() => setState(s => ({ ...s, shrugging: false })), 500);
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
              <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-4 h-2 md:w-8 md:h-4 border-b-2 md:border-b-4 border-slate-900 rounded-full" />
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
          <button onClick={() => { playSound('click'); speak(currentWord.word); }}
            className="ml-2 md:ml-4 p-3 md:p-5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl md:rounded-2xl shadow-[0_2px_0_rgb(154,52,18)] md:shadow-[0_4px_0_rgb(154,52,18)] transition-all active:shadow-none active:translate-y-1"
            title="Listen to word">
            <Ear className="w-5 h-5 md:w-8 md:h-8" />
          </button>
        </div>

        {/* Letter Bank */}
        <div className="w-full bg-slate-800 p-2 md:p-6 rounded-2xl md:rounded-3xl border-2 md:border-4 border-slate-700 shadow-xl shrink-0">
          <div className="flex flex-wrap gap-2 md:gap-3 justify-center">
            {letterChoices.map((letter) => (
              <motion.button key={letter} whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.9 }} onClick={() => handleLetterClick(letter)}
                className="w-12 h-12 md:w-16 md:h-16 bg-slate-700 hover:bg-orange-500 text-slate-100 font-black text-lg md:text-3xl uppercase rounded-lg md:rounded-xl border-b-2 md:border-b-4 border-slate-900 hover:border-orange-700 flex items-center justify-center transition-all">
                {letter}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-1 md:mt-4 text-slate-400 text-[10px] md:text-sm font-black uppercase tracking-widest text-center shrink-0">
        Buzz the letters to build the word!
      </div>
    </div>
  );
}
