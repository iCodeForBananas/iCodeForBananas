"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Ear, Heart, Trophy, Volume2, CheckCircle2, ChevronRight, Bug as Bee, Droplets } from 'lucide-react';
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
  mastery: Record<string, number>;
  inventory: string[];
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
    { word: 'they', boxes: [['t'], ['h'], ['e'], ['y']], phonemes: ['t', 'h', 'e', 'y'], heart: [2, 3] },
  ],
};

const ITEMS = [
  'Honey Drop', 'Pollen Puff', 'Nectar Jar', 'Wax Block',
  'Royal Jelly', 'Sunflower', 'Daisy', 'Lavender',
  'Honeycomb', 'Bee Bread', 'Propolis', 'Queen Jelly',
  'Clover', 'Tulip', 'Rose', 'Lily'
];

const ITEM_COLORS: Record<string, string> = {
  'Honey Drop': 'bg-orange-400', 'Pollen Puff': 'bg-yellow-200', 'Nectar Jar': 'bg-sky-400', 'Wax Block': 'bg-amber-600',
  'Royal Jelly': 'bg-pink-400', 'Sunflower': 'bg-yellow-500', 'Daisy': 'bg-white', 'Lavender': 'bg-purple-400',
  'Honeycomb': 'bg-orange-500', 'Bee Bread': 'bg-yellow-600', 'Propolis': 'bg-amber-800', 'Queen Jelly': 'bg-pink-600',
  'Clover': 'bg-emerald-400', 'Tulip': 'bg-red-400', 'Rose': 'bg-rose-600', 'Lily': 'bg-slate-100',
};

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
  mastery: {}, inventory: [], isComplete: false, shrugging: false, showHeart: false,
};

export default function SpellingBeePage() {
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [filledBoxes, setFilledBoxes] = useState<string[][]>([]);
  const currentLevelWords = LEVELS[state.currentLevel];
  const currentWord = currentLevelWords[state.currentWordIndex];

  useEffect(() => {
    setFilledBoxes(currentWord.boxes.map(() => []));
    setState(s => ({ ...s, currentBoxIndex: 0, currentLetterIndex: 0, showHeart: false }));
    speak(currentWord.word);
  }, [state.currentWordIndex, state.currentLevel]);

  const handleLetterClick = (letter: string) => {
    if (state.isComplete) return;
    playSound('click');
    const expectedLetter = currentWord.boxes[state.currentBoxIndex][state.currentLetterIndex];
    if (letter === expectedLetter) {
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
    const word = currentWord.word;
    const newMastery = { ...state.mastery, [word]: (state.mastery[word] || 0) + 1 };
    playSound('levelup');
    if (currentWord.word === 'they') setState(s => ({ ...s, showHeart: true }));
    setTimeout(() => {
      const isMastered = newMastery[word] === 3;
      const newInventory = [...state.inventory];
      if (isMastered && !newInventory.includes(word)) { newInventory.push(word); playSound('star'); }
      const isLevelComplete = currentLevelWords.every(w => newMastery[w.word] >= 3);
      if (isLevelComplete) {
        if (state.currentLevel === 5) {
          setState(s => ({ ...s, mastery: newMastery, inventory: newInventory, isComplete: true }));
          confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
        } else {
          setState(s => ({ ...s, mastery: newMastery, inventory: newInventory, currentLevel: s.currentLevel + 1, currentWordIndex: 0 }));
          speak(`Level ${state.currentLevel + 1}! Great job!`);
          confetti({ particleCount: 100, spread: 50, origin: { y: 0.8 } });
        }
      } else {
        const nextIndex = (state.currentWordIndex + 1) % currentLevelWords.length;
        setState(s => ({ ...s, mastery: newMastery, inventory: newInventory, currentWordIndex: nextIndex }));
      }
    }, 2000);
  };

  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');

  if (state.isComplete) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white font-sans">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="bg-slate-800 border-8 border-orange-500 p-12 rounded-3xl shadow-2xl text-center max-w-2xl w-full text-slate-100">
          <Trophy className="w-32 h-32 text-orange-400 mx-auto mb-6" />
          <h1 className="text-5xl font-black mb-4 uppercase tracking-widest text-orange-500">Queen Bee!</h1>
          <p className="text-2xl mb-8 font-bold text-slate-300">You are a Master Spelling Bee!</p>
          <div className="grid grid-cols-5 md:grid-cols-8 gap-3 mb-12">
            {state.inventory.map((word, i) => (
              <div key={word} className="flex flex-col items-center">
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full ${ITEM_COLORS[ITEMS[i]]} border-4 border-slate-700 flex items-center justify-center shadow-lg`}>
                  <div className="w-6 h-6 md:w-8 md:h-8 bg-white/40 rounded-full" />
                </div>
                <span className="text-[8px] md:text-[10px] mt-2 uppercase font-black text-slate-400">{word}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setState(INITIAL_STATE)}
            className="bg-orange-500 hover:bg-orange-400 text-white px-10 py-5 rounded-full text-2xl font-black uppercase tracking-wider transition-all shadow-[0_6px_0_rgb(154,52,18)] active:shadow-none active:translate-y-1">
            Buzz Again!
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

      <div className="w-full max-w-4xl mb-2 md:mb-8 z-10 shrink-0">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-slate-100 text-lg md:text-2xl font-black uppercase tracking-widest flex items-center gap-2">
            <Bee className="w-6 h-6 md:w-8 md:h-8 text-orange-500" /> Level {state.currentLevel}
          </h2>
          <div className="bg-slate-800 px-3 py-0.5 md:px-4 md:py-1 rounded-full border-2 border-slate-700 text-slate-300 text-[10px] md:text-sm font-black uppercase shadow-sm">
            Mastered: {state.inventory.length} / 26
          </div>
        </div>
        <div className="grid grid-cols-8 md:grid-cols-13 gap-1 bg-slate-800 p-1.5 md:p-2 border-2 md:border-4 border-slate-700 rounded-xl md:rounded-2xl shadow-lg">
          {Array.from({ length: 26 }).map((_, i) => {
            const word = state.inventory[i];
            const itemName = ITEMS[i];
            return (
              <div key={i} className="aspect-square bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-center relative group overflow-hidden">
                {word ? (
                  <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }}
                    className={`w-full h-full ${ITEM_COLORS[itemName]} flex items-center justify-center relative`}>
                    <div className="absolute inset-0 bg-white/10" />
                    <div className="w-1/2 h-1/2 bg-white/20 rounded-full blur-md" />
                  </motion.div>
                ) : (
                  <Droplets className="w-1/2 h-1/2 text-slate-700 opacity-50" />
                )}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-100 text-slate-900 text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20 font-bold">
                  {word ? itemName : 'Empty Jar'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center gap-4 md:gap-12 z-10 min-h-0 py-2">
        <div className="relative shrink-0">
          <motion.div animate={{ y: state.shrugging ? [0, -20, 0] : [0, -10, 0], x: state.shrugging ? [0, -10, 10, -10, 10, 0] : 0 }}
            transition={{ y: { repeat: Infinity, duration: 2, ease: "easeInOut" }, x: { duration: 0.5 } }}
            className="w-20 h-20 md:w-32 md:h-32 relative">
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

        <div className="flex gap-1 md:gap-4 items-end shrink-0">
          {currentWord.boxes.map((box, i) => (
            <div key={i} className="relative flex flex-col items-center">
              <AnimatePresence>
                {state.showHeart && currentWord.heart?.includes(i) && (
                  <motion.div initial={{ scale: 0, y: 0 }} animate={{ scale: 1, y: -40 }} exit={{ scale: 0 }} className="absolute top-0">
                    <Heart className="w-6 h-6 md:w-10 md:h-10 text-pink-500 fill-pink-500 drop-shadow-lg" />
                  </motion.div>
                )}
              </AnimatePresence>
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

        <div className="flex gap-2 md:gap-3 items-center bg-slate-800/80 px-4 py-1.5 md:px-6 md:py-3 rounded-full border-2 border-slate-700 shrink-0">
          {Array.from({ length: 3 }).map((_, i) => {
            const isFilled = i < (state.mastery[currentWord.word] || 0);
            return (
              <motion.div key={i} animate={isFilled ? { scale: [1, 1.4, 1], rotate: [0, 10, -10, 0] } : {}}
                className={`w-5 h-5 md:w-8 md:h-8 rounded-full border flex items-center justify-center transition-colors ${isFilled ? 'bg-orange-500 border-orange-700 shadow-sm' : 'bg-slate-900 border-slate-600'}`}>
                {isFilled && <span className="text-white text-[10px] md:text-lg font-black">★</span>}
              </motion.div>
            );
          })}
          <span className="text-slate-300 text-[10px] md:text-xs font-black uppercase ml-1 md:ml-2 tracking-widest">Mastery</span>
        </div>

        <div className="w-full bg-slate-800 p-2 md:p-6 rounded-2xl md:rounded-3xl border-2 md:border-4 border-slate-700 shadow-xl shrink-0">
          <div className="grid grid-cols-7 gap-1 md:gap-2 justify-items-center">
            {alphabet.map((letter) => (
              <motion.button key={letter} whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.9 }} onClick={() => handleLetterClick(letter)}
                className="w-full aspect-square max-w-[3rem] max-h-[3rem] md:max-w-[4rem] md:max-h-[4rem] bg-slate-700 hover:bg-orange-500 text-slate-100 font-black text-sm md:text-2xl uppercase rounded-lg md:rounded-xl border-b-2 md:border-b-4 border-slate-900 hover:border-orange-700 flex items-center justify-center transition-all">
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
