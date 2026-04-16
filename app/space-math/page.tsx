'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Star, Trophy, ChevronRight, HelpCircle, Sparkles } from 'lucide-react';

type ProblemType = 'addition' | 'subtraction' | 'place-value';

interface Problem {
  id: string;
  type: ProblemType;
  question: string;
  answer: number;
  options: number[];
  visualHint: { left: number; right: number; operator: '+' | '-' | 'tens-ones' };
  signature: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_LEVELS: { id: Difficulty; label: string; description: string; color: string }[] = [
  { id: 'easy', label: 'Cadet', description: 'Numbers up to 10', color: 'bg-emerald-500' },
  { id: 'medium', label: 'Pilot', description: 'Numbers up to 30', color: 'bg-blue-500' },
  { id: 'hard', label: 'Commander', description: 'Numbers up to 50+', color: 'bg-rose-500' },
];

const MASTERY_THRESHOLD = 5;
const STAGES = [
  { id: 1, label: 'Moon Base', type: 'addition', min: 1, max: 5, icon: '🌙' },
  { id: 2, label: 'Star Station', type: 'subtraction', min: 1, max: 5, icon: '⭐' },
  { id: 3, label: 'Mars Outpost', type: 'addition', min: 6, max: 10, icon: '🔴' },
  { id: 4, label: 'Jupiter Ring', type: 'subtraction', min: 6, max: 10, icon: '🪐' },
  { id: 5, label: 'Deep Space', type: 'mixed', min: 11, max: 20, icon: '🌌' },
];
const COLORS_HEX: Record<Difficulty, string> = { easy: '#10B981', medium: '#3B82F6', hard: '#F43F5E' };

const generateProblem = (stageIndex: number, difficulty: Difficulty, recentSignatures: string[] = []): Problem => {
  const stage = STAGES[stageIndex];
  let { min, max } = stage;
  if (difficulty === 'medium') { max = Math.floor(max * 1.8); min = Math.max(min, 2); }
  else if (difficulty === 'hard') { max = Math.floor(max * 3); min = Math.max(min, 5); }

  let problem: Problem | null = null;
  let attempts = 0;
  let signature = '';

  while (!problem || (recentSignatures.includes(signature) && attempts < 100)) {
    attempts++;
    let type: ProblemType;
    if (stage.type === 'mixed') {
      const types: ProblemType[] = ['addition', 'subtraction', 'place-value'];
      type = types[Math.floor(Math.random() * types.length)];
    } else { type = stage.type as ProblemType; }

    let left = 0, right = 0, answer = 0, question = '', operator: '+' | '-' | 'tens-ones' = '+';

    if (type === 'addition') {
      left = Math.floor(Math.random() * (max - min + 1)) + min;
      right = Math.floor(Math.random() * (max - min + 1)) + 1;
      answer = left + right; question = `${left} + ${right} = ?`; operator = '+';
      signature = `+:${Math.min(left, right)},${Math.max(left, right)}`;
    } else if (type === 'subtraction') {
      answer = Math.floor(Math.random() * (max - min + 1)) + min;
      right = Math.floor(Math.random() * (max - min + 1)) + 1;
      left = answer + right; question = `${left} - ${right} = ?`; operator = '-';
      signature = `-:${left},${right}`;
    } else {
      const tens = Math.floor(Math.random() * (max >= 10 ? 2 : 1));
      const ones = Math.floor(Math.random() * 10);
      answer = tens * 10 + ones; question = `${tens} tens and ${ones} ones is?`;
      left = tens; right = ones; operator = 'tens-ones';
      signature = `tens-ones:${left},${right}`;
    }

    const options = new Set<number>([answer]);
    while (options.size < 4) {
      const offset = Math.floor(Math.random() * 5) + 1;
      options.add(Math.random() > 0.5 ? answer + offset : Math.max(0, answer - offset));
    }
    problem = { id: Math.random().toString(36).substr(2, 9), type, question, answer, options: Array.from(options).sort((a, b) => a - b), visualHint: { left, right, operator }, signature };
  }

  if (recentSignatures.length > 0 && signature === recentSignatures[recentSignatures.length - 1]) {
    let { left, right, operator } = problem.visualHint;
    if (operator === '+') { left++; problem.answer = left + right; problem.question = `${left} + ${right} = ?`; problem.signature = `+:${Math.min(left, right)},${Math.max(left, right)}`; }
    else if (operator === '-') { left++; problem.answer = left - right; problem.question = `${left} - ${right} = ?`; problem.signature = `-:${left},${right}`; }
    else { left = left === 1 ? 0 : 1; problem.answer = left * 10 + right; problem.question = `${left} tens and ${right} ones is?`; problem.signature = `tens-ones:${left},${right}`; }
    const opts = new Set<number>([problem.answer]);
    while (opts.size < 4) { const o = Math.floor(Math.random() * 5) + 1; opts.add(Math.random() > 0.5 ? problem.answer + o : Math.max(0, problem.answer - o)); }
    problem.options = Array.from(opts).sort((a, b) => a - b);
    problem.visualHint.left = left;
  }
  return problem;
};

const VisualScaffolding = ({ hint }: { hint: Problem['visualHint'] }) => {
  if (hint.operator === 'tens-ones') {
    return (
      <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
        <div className="flex gap-3">
          {Array.from({ length: hint.left }).map((_, i) => (
            <div key={`tens-${i}`} className="flex flex-col gap-0.5">
              <span className="text-[8px] text-blue-300 text-center">Ten</span>
              <div className="grid grid-cols-1 gap-0.5 bg-blue-500/30 p-0.5 rounded border border-blue-400">
                {Array.from({ length: 10 }).map((_, j) => (<div key={j} className="w-2.5 h-2.5 bg-blue-400 rounded-sm" />))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-0.5 max-w-[80px] items-center">
            {Array.from({ length: hint.right }).map((_, i) => (<div key={`ones-${i}`} className="w-2.5 h-2.5 bg-emerald-400 rounded-sm" />))}
          </div>
        </div>
        <p className="text-[10px] text-blue-200">Count the blocks! Blue stacks are 10, green blocks are 1.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <div className="flex flex-wrap gap-1 max-w-[100px] justify-center">
          {Array.from({ length: hint.left }).map((_, i) => (<div key={`l-${i}`} className="w-3 h-3 bg-orange-400 rounded-full shadow-lg shadow-orange-500/20" />))}
        </div>
        <span className="text-xl font-bold text-white">{hint.operator === '+' ? '+' : '-'}</span>
        <div className="flex flex-wrap gap-1 max-w-[100px] justify-center">
          {Array.from({ length: hint.right }).map((_, i) => (<div key={`r-${i}`} className="w-3 h-3 bg-purple-400 rounded-full shadow-lg shadow-purple-500/20" />))}
        </div>
      </div>
      <p className="text-[10px] text-blue-200">{hint.operator === '+' ? "Count all the dots together!" : "Start with the first group and take away the second group!"}</p>
    </div>
  );
};

const playSound = (type: 'correct' | 'incorrect' | 'badge') => {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); const now = ctx.currentTime;
    if (type === 'correct') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.1); osc.frequency.setValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.2, now + 0.05); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'incorrect') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.2, now + 0.05); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
    } else {
      osc.type = 'square'; osc.frequency.setValueAtTime(392, now); osc.frequency.setValueAtTime(523.25, now + 0.15); osc.frequency.setValueAtTime(659.25, now + 0.3); osc.frequency.setValueAtTime(783.99, now + 0.45);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.1, now + 0.05); gain.gain.setValueAtTime(0.1, now + 0.45); gain.gain.exponentialRampToValueAtTime(0.01, now + 1);
      osc.start(now); osc.stop(now + 1);
    }
  } catch (e) { console.error("Audio playback failed", e); }
};

const StarBank = ({ score, onClear }: { score: number; onClear: () => void }) => (
  <div className="w-full bg-slate-900/80 border-b border-white/10 p-3 flex items-start sm:items-center gap-4 z-50 relative min-h-[60px]">
    <button onClick={onClear} className="text-[10px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-400/20 uppercase bg-rose-400/10 px-2 py-1 rounded transition-colors shrink-0">Clear</button>
    <div className="flex flex-wrap gap-1.5 flex-1 content-start">
      <AnimatePresence>
        {Array.from({ length: Math.floor(score / 10) }).map((_, i) => (
          <motion.div key={i} initial={{ scale: 0, rotate: -180, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="w-5 h-5">
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.8)]" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  </div>
);

const MasteryPath = ({ currentStage, completedStages, masteryCount, isWrong, difficulty }: { currentStage: number; completedStages: number[]; masteryCount: number; isWrong: boolean; difficulty: Difficulty }) => {
  const colorHex = COLORS_HEX[difficulty];
  const level = DIFFICULTY_LEVELS.find(d => d.id === difficulty);
  return (
    <div className="w-full max-w-xl flex justify-between items-center px-4 py-6 bg-slate-900/40 rounded-3xl border border-white/5 mb-4 relative">
      <div className="absolute left-10 right-10 h-1 bg-slate-800 top-1/2 -translate-y-1/2 z-0" />
      {STAGES.map((stage, idx) => {
        const isCurrent = idx === currentStage;
        const isCompleted = completedStages.includes(idx);
        const progress = isCurrent ? (masteryCount / MASTERY_THRESHOLD) * 100 : isCompleted ? 100 : 0;
        return (
          <div key={stage.id} className="relative z-10 flex flex-col items-center gap-2">
            <motion.div animate={isCurrent && isWrong ? { x: [-5, 5, -5, 5, 0] } : {}} transition={{ duration: 0.4 }}
              className={`relative w-12 h-12 rounded-full flex items-center justify-center text-xl border-2 transition-all ${isCompleted ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : isCurrent ? `${level?.color || 'bg-blue-600'} border-white shadow-[0_0_15px_rgba(255,255,255,0.2)]` : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
              {isCompleted ? <Trophy className="w-6 h-6 text-white" /> : stage.icon}
              {isCurrent && (
                <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 w-[56px] h-[56px] pointer-events-none" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="26" fill="transparent" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                  <motion.circle cx="28" cy="28" r="26" fill="transparent" stroke={colorHex} strokeWidth="4" strokeDasharray="163.36" initial={{ strokeDashoffset: 163.36 }} animate={{ strokeDashoffset: 163.36 - (163.36 * progress) / 100 }} transition={{ type: 'spring', stiffness: 50 }} />
                </svg>
              )}
            </motion.div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isCurrent ? 'text-blue-400' : 'text-slate-500'}`}>{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default function SpaceMathPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [stageIndex, setStageIndex] = useState(0);
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  const [masteryCount, setMasteryCount] = useState(0);
  const [recentSignatures, setRecentSignatures] = useState<string[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [score, setScore] = useState(0);
  const [badges, setBadges] = useState<string[]>([]);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'level-up' | 'finale'>('start');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('space-math-save');
      if (saved) { const d = JSON.parse(saved); setScore(d.score || 0); setBadges(d.badges || []); setStageIndex(d.stageIndex || 0); setCompletedStages(d.completedStages || []); if (d.difficulty) setDifficulty(d.difficulty); }
    } catch {}
  }, []);

  useEffect(() => { localStorage.setItem('space-math-save', JSON.stringify({ score, badges, stageIndex, completedStages, difficulty })); }, [score, badges, stageIndex, completedStages, difficulty]);

  useEffect(() => {
    if (gameState === 'playing' && !problem) {
      const p = generateProblem(stageIndex, difficulty, recentSignatures);
      setProblem(p); setRecentSignatures(prev => [...prev.slice(-9), p.signature]);
    }
  }, [gameState, problem, stageIndex, difficulty, recentSignatures]);

  const handleAnswer = (answer: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(answer);
    const correct = answer === problem?.answer;
    setIsCorrect(correct);
    if (correct) { playSound('correct'); setScore(s => s + 10); setMasteryCount(c => c + 1); setShowHint(false); }
    else { playSound('incorrect'); setShowHint(true); }
  };

  const nextProblem = () => {
    if (masteryCount >= MASTERY_THRESHOLD) {
      playSound('badge');
      const nextIdx = stageIndex + 1;
      setCompletedStages(prev => Array.from(new Set([...prev, stageIndex])));
      if (nextIdx < STAGES.length) { setStageIndex(nextIdx); setGameState('level-up'); setBadges(b => [...b, STAGES[stageIndex].label + ' Badge']); }
      else { setGameState('finale'); setBadges(b => [...b, 'Galactic Master']); }
      setMasteryCount(0); setRecentSignatures([]);
    } else {
      const p = generateProblem(stageIndex, difficulty, recentSignatures);
      setProblem(p); setRecentSignatures(prev => [...prev.slice(-9), p.signature]);
    }
    setSelectedAnswer(null); setIsCorrect(null); setShowHint(false);
  };

  const startLevel = () => {
    setGameState('playing'); setRecentSignatures([]);
    const p = generateProblem(stageIndex, difficulty, []);
    setProblem(p); setRecentSignatures([p.signature]);
  };

  const resetGame = () => {
    localStorage.setItem('space-math-save', JSON.stringify({ score, badges, stageIndex: 0, completedStages: [] }));
    setStageIndex(0); setCompletedStages([]); setMasteryCount(0); setGameState('start');
  };

  const clearStars = () => {
    setScore(0); setBadges([]);
    localStorage.setItem('space-math-save', JSON.stringify({ score: 0, badges: [], stageIndex, completedStages }));
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-blue-500/30 relative flex flex-col overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="absolute bg-white rounded-full animate-pulse" style={{ width: Math.random() * 3 + 'px', height: Math.random() * 3 + 'px', top: Math.random() * 100 + '%', left: Math.random() * 100 + '%', opacity: Math.random() * 0.7 + 0.3, animationDelay: Math.random() * 5 + 's' }} />
        ))}
      </div>
      <StarBank score={score} onClear={clearStars} />
      <main className="relative z-10 w-full max-w-2xl mx-auto px-6 py-4 flex flex-col items-center flex-1 justify-center">
        <div className="w-full flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20"><Rocket className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Space Math</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-blue-400 uppercase tracking-widest font-bold">Mission: {STAGES[stageIndex].label}</p>
                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase text-white ${DIFFICULTY_LEVELS.find(d => d.id === difficulty)?.color}`}>{DIFFICULTY_LEVELS.find(d => d.id === difficulty)?.label}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap max-w-[120px] justify-end">
            <AnimatePresence>
              {badges.map((b, i) => (
                <motion.div key={i} title={b} initial={{ scale: 0, rotate: -180, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-indigo-600/20">
                  <Trophy className="w-4 h-4 text-white" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {gameState === 'start' && (
            <motion.div key="start" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="flex-1 flex flex-col items-center justify-center text-center gap-8">
              <div className="relative">
                <motion.div animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}>
                  <Rocket className="w-32 h-32 text-blue-500 drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]" />
                </motion.div>
                <motion.div className="absolute -bottom-4 -right-4" animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                  <Sparkles className="w-12 h-12 text-yellow-400" />
                </motion.div>
              </div>
              <div>
                <h2 className="text-4xl font-black mb-4 bg-gradient-to-b from-white to-blue-300 bg-clip-text text-transparent">Ready for Launch?</h2>
                <p className="text-blue-200 text-lg max-w-sm">Choose your rank and help the rocket reach new planets!</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-md">
                {DIFFICULTY_LEVELS.map((level) => (
                  <button key={level.id} onClick={() => setDifficulty(level.id)}
                    className={`p-4 rounded-2xl border-2 transition-all text-left flex flex-col gap-1 ${difficulty === level.id ? `${level.color} border-white shadow-[0_0_15px_rgba(255,255,255,0.3)] scale-105` : 'bg-slate-900/60 border-white/10 hover:border-white/30'}`}>
                    <span className="text-sm font-black uppercase tracking-wider">{level.label}</span>
                    <span className="text-[10px] opacity-80 leading-tight">{level.description}</span>
                  </button>
                ))}
              </div>
              <button onClick={startLevel} className="group relative px-12 py-6 bg-blue-600 rounded-3xl text-2xl font-bold shadow-[0_10px_0_rgb(37,99,235)] active:shadow-none active:translate-y-[10px] transition-all hover:bg-blue-500">
                <span className="flex items-center gap-3">START MISSION <ChevronRight className="w-8 h-8" /></span>
              </button>
            </motion.div>
          )}

          {gameState === 'playing' && problem && (
            <motion.div key="playing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full flex-1 flex flex-col items-center gap-4">
              <MasteryPath currentStage={stageIndex} completedStages={completedStages} masteryCount={masteryCount} isWrong={isCorrect === false} difficulty={difficulty} />
              <div className="w-full bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[40px] p-4 sm:p-6 shadow-2xl relative overflow-hidden flex flex-col">
                <div className="text-center mb-2 sm:mb-4">
                  <h2 className="text-3xl sm:text-4xl font-black mb-1 tracking-tight">{problem.question}</h2>
                  <p className="text-blue-400 font-bold uppercase tracking-widest text-[10px]">Solve to Continue</p>
                </div>
                <AnimatePresence>
                  {showHint && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-2 sm:mb-4 overflow-hidden">
                      <VisualScaffolding hint={problem.visualHint} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 flex-1">
                  {problem.options.map((opt) => (
                    <button key={opt} disabled={selectedAnswer !== null} onClick={() => handleAnswer(opt)}
                      className={`py-2 sm:py-4 rounded-3xl text-2xl sm:text-3xl font-black transition-all border-b-[6px] sm:border-b-8 ${selectedAnswer === opt ? (isCorrect ? 'bg-emerald-500 border-emerald-700 text-white' : 'bg-rose-500 border-rose-700 text-white') : 'bg-slate-800 border-slate-950 hover:bg-slate-700 text-white active:border-b-0 active:translate-y-[6px] sm:active:translate-y-[8px]'} ${selectedAnswer !== null && opt === problem.answer && !isCorrect ? 'bg-emerald-500/50 border-emerald-700/50' : ''}`}>
                      {opt}
                    </button>
                  ))}
                </div>
                <AnimatePresence>
                  {selectedAnswer !== null && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-2 sm:mt-4 flex flex-col items-center gap-2 sm:gap-3">
                      <div className={`flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold ${isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isCorrect ? <><Sparkles className="w-5 h-5 sm:w-6 sm:h-6" /> GREAT JOB! <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" /></> : <><HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" /> TRY AGAIN! <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" /></>}
                      </div>
                      <button onClick={nextProblem} className="w-full py-2 sm:py-3 bg-white text-slate-900 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2 hover:bg-blue-50 shadow-lg">
                        {isCorrect ? 'NEXT PROBLEM' : 'I UNDERSTAND'} <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {gameState === 'level-up' && (
            <motion.div key="level-up" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }} className="flex-1 flex flex-col items-center justify-center text-center gap-8">
              <div className="relative">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
                <Trophy className="w-32 h-32 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]" />
              </div>
              <div>
                <h2 className="text-5xl font-black mb-4">LEVEL UP!</h2>
                <p className="text-2xl text-blue-200">You&apos;ve reached the <span className="text-white font-bold">{STAGES[stageIndex].label}</span>!</p>
              </div>
              <button onClick={startLevel} className="px-12 py-6 bg-emerald-600 rounded-3xl text-2xl font-bold shadow-[0_10px_0_rgb(5,150,105)] active:shadow-none active:translate-y-[10px] transition-all hover:bg-emerald-500">CONTINUE MISSION</button>
            </motion.div>
          )}

          {gameState === 'finale' && (
            <motion.div key="finale" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center gap-8">
              <div className="relative">
                <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                  <Trophy className="w-48 h-48 text-yellow-400 drop-shadow-[0_0_40px_rgba(250,204,21,0.6)]" />
                </motion.div>
                {Array.from({ length: 20 }).map((_, i) => (
                  <motion.div key={i} className="absolute top-1/2 left-1/2 w-2 h-2 bg-yellow-400 rounded-full" initial={{ x: 0, y: 0 }} animate={{ x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400, opacity: 0, scale: 0 }} transition={{ duration: 2, repeat: Infinity, delay: Math.random() * 2 }} />
                ))}
              </div>
              <div>
                <h2 className="text-6xl font-black mb-4 bg-gradient-to-r from-yellow-400 via-white to-yellow-400 bg-clip-text text-transparent animate-pulse">MISSION COMPLETE!</h2>
                <p className="text-3xl text-blue-200">You are a <span className="text-white font-bold">Math Master</span>!</p>
                <p className="text-xl text-blue-400 mt-2">You finished today&apos;s mission!</p>
              </div>
              <button onClick={resetGame} className="px-8 py-4 bg-slate-800 rounded-2xl text-xl font-bold border border-white/10 hover:bg-slate-700 transition-colors">PLAY AGAIN</button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}
