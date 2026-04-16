"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Volume2,
  Settings,
  Home,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Star,
} from "lucide-react";

interface Question {
  id: string;
  type: "verbal" | "quantitative" | "spatial";
  level: number;
  prompt: string;
  options: string[];
  correctAnswer: string;
  visualData?: any;
}

interface UserHistory {
  date: string;
  level: number;
  score: number;
  timePerQuestion: number[];
}

interface UserState {
  currentLevel: number;
  totalScore: number;
  history: UserHistory[];
}

type GameState = "home" | "playing" | "level_complete" | "game_complete" | "parent_dashboard";

const LEVELS = [
  { id: 1, title: "Level 1: Recall", description: "Identity & Matching", dok: 1 },
  { id: 2, title: "Level 2: Skill", description: "Patterns & Sequences", dok: 2 },
  { id: 3, title: "Level 3: Strategic", description: "Classification & Analogies", dok: 3 },
  { id: 4, title: "Level 4: Analysis", description: "2x2 Matrix Reasoning", dok: 4 },
  { id: 5, title: "Level 5: Synthesis", description: "Mental Rotation & Start-Unknown Math", dok: 5 },
];

const playSound = (type: "ding" | "bonk" | "success") => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (type === "success") {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.connect(g); g.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.1);
      g.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.1 + 0.4);
      osc.start(audioCtx.currentTime + i * 0.1);
      osc.stop(audioCtx.currentTime + i * 0.1 + 0.4);
    });
    return;
  }
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.connect(g); g.connect(audioCtx.destination);
  if (type === "ding") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1);
    g.gain.setValueAtTime(0.3, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.5);
  } else {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.1);
    g.gain.setValueAtTime(0.3, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.3);
  }
};

const QUESTION_POOL: Record<number, Omit<Question, "id" | "level">[]> = {
  1: [
    { type: "spatial", prompt: "Which shape is exactly the same as the one in the box?", options: ["🔴", "🟦", "🟡", "🔺"], correctAnswer: "🔴", visualData: { target: "🔴" } },
    { type: "spatial", prompt: "Find the matching shape!", options: ["⭐", "🌙", "☀️", "☁️"], correctAnswer: "⭐", visualData: { target: "⭐" } },
    { type: "spatial", prompt: "Which one looks like this?", options: ["🍎", "🍌", "🍇", "🍊"], correctAnswer: "🍎", visualData: { target: "🍎" } },
    { type: "spatial", prompt: "Match the animal!", options: ["🐶", "🐱", "🐭", "🐹"], correctAnswer: "🐶", visualData: { target: "🐶" } },
    { type: "spatial", prompt: "Which one is the same?", options: ["🚗", "🚕", "🚙", "🚌"], correctAnswer: "🚗", visualData: { target: "🚗" } },
    { type: "spatial", prompt: "Find the twin!", options: ["🍦", "🍩", "🍪", "🍰"], correctAnswer: "🍦", visualData: { target: "🍦" } },
    { type: "quantitative", prompt: "How many apples are here? 🍎🍎🍎", options: ["2", "3", "4", "5"], correctAnswer: "3" },
    { type: "quantitative", prompt: "Count the stars: ⭐⭐", options: ["1", "2", "3", "4"], correctAnswer: "2" },
    { type: "quantitative", prompt: "How many fingers? 🖐️", options: ["3", "4", "5", "6"], correctAnswer: "5" },
    { type: "quantitative", prompt: "Count the balloons: 🎈🎈🎈🎈", options: ["3", "4", "5", "6"], correctAnswer: "4" },
    { type: "quantitative", prompt: "How many ducks? 🦆🦆🦆🦆🦆", options: ["4", "5", "6", "7"], correctAnswer: "5" },
    { type: "quantitative", prompt: "Count the bees: 🐝🐝", options: ["1", "2", "3", "4"], correctAnswer: "2" },
    { type: "verbal", prompt: 'Which word is the same as: "CAT"?', options: ["DOG", "BAT", "CAT", "RAT"], correctAnswer: "CAT" },
    { type: "verbal", prompt: 'Find the word: "SUN"', options: ["RUN", "SUN", "FUN", "GUN"], correctAnswer: "SUN" },
    { type: "verbal", prompt: 'Which one says: "RED"?', options: ["BLUE", "RED", "GREEN", "PINK"], correctAnswer: "RED" },
    { type: "verbal", prompt: 'Match the word: "BALL"', options: ["FALL", "CALL", "BALL", "TALL"], correctAnswer: "BALL" },
    { type: "verbal", prompt: 'Find the word: "FISH"', options: ["DISH", "WISH", "FISH", "BASH"], correctAnswer: "FISH" },
    { type: "verbal", prompt: 'Which one says: "BLUE"?', options: ["BLUE", "BLUR", "BULL", "BELL"], correctAnswer: "BLUE" },
    { type: "spatial", prompt: "Which flower matches?", options: ["🌻", "🌹", "🌷", "🌺"], correctAnswer: "🌻", visualData: { target: "🌻" } },
    { type: "spatial", prompt: "Find the same bug!", options: ["🐛", "🦋", "🐞", "🐜"], correctAnswer: "🐛", visualData: { target: "🐛" } },
    { type: "quantitative", prompt: "Count the hearts: ❤️❤️❤️❤️❤️❤️", options: ["4", "5", "6", "7"], correctAnswer: "6" },
    { type: "quantitative", prompt: "How many trees? 🌲🌲🌲", options: ["2", "3", "4", "5"], correctAnswer: "3" },
    { type: "verbal", prompt: 'Match the word: "TREE"', options: ["FREE", "TREE", "THREE", "TRAY"], correctAnswer: "TREE" },
    { type: "spatial", prompt: "Which one matches?", options: ["🎸", "🥁", "🎺", "🎹"], correctAnswer: "🎸", visualData: { target: "🎸" } },
    { type: "spatial", prompt: "Find the same one!", options: ["🦁", "🐯", "🐻", "🐼"], correctAnswer: "🦁", visualData: { target: "🦁" } },
    { type: "quantitative", prompt: "How many moons? 🌙🌙🌙🌙", options: ["2", "3", "4", "5"], correctAnswer: "4" },
    { type: "quantitative", prompt: "Count the fish: 🐟🐟🐟🐟🐟🐟🐟", options: ["5", "6", "7", "8"], correctAnswer: "7" },
    { type: "verbal", prompt: 'Which one says: "STAR"?', options: ["STAR", "STIR", "SCAR", "STAY"], correctAnswer: "STAR" },
  ],
  2: [
    { type: "spatial", prompt: "What comes next in the pattern? 🔴 🟦 🔴 🟦 ...", options: ["🔴", "🟦", "🟡", "🔺"], correctAnswer: "🔴" },
    { type: "spatial", prompt: "Complete the pattern: 🔺 🟡 🔺 🟡 ...", options: ["🔺", "🟡", "🟦", "🔴"], correctAnswer: "🔺" },
    { type: "spatial", prompt: "What is missing? 🍎 🍌 🍎 ... 🍎 🍌", options: ["🍎", "🍌", "🍇", "🍊"], correctAnswer: "🍌" },
    { type: "spatial", prompt: "Pattern: ⭐ 🌙 ⭐ 🌙 ...", options: ["⭐", "🌙", "☀️", "☁️"], correctAnswer: "⭐" },
    { type: "spatial", prompt: "Next in line: 🚗 🚌 🚗 🚌 ...", options: ["🚗", "🚌", "🚕", "🚙"], correctAnswer: "🚗" },
    { type: "spatial", prompt: "Complete it: 🍦 🍩 🍦 🍩 ...", options: ["🍦", "🍩", "🍪", "🍰"], correctAnswer: "🍦" },
    { type: "quantitative", prompt: "What number comes next? 2, 4, 6, ...", options: ["7", "8", "9", "10"], correctAnswer: "8" },
    { type: "quantitative", prompt: "Count by fives: 5, 10, 15, ...", options: ["16", "20", "25", "30"], correctAnswer: "20" },
    { type: "quantitative", prompt: "What is next? 10, 9, 8, ...", options: ["5", "6", "7", "8"], correctAnswer: "7" },
    { type: "quantitative", prompt: "Sequence: 1, 3, 5, ...", options: ["6", "7", "8", "9"], correctAnswer: "7" },
    { type: "quantitative", prompt: "Next number: 10, 20, 30, ...", options: ["35", "40", "45", "50"], correctAnswer: "40" },
    { type: "quantitative", prompt: "Count down: 5, 4, 3, ...", options: ["0", "1", "2", "3"], correctAnswer: "2" },
    { type: "verbal", prompt: "Which word is the odd one out?", options: ["Apple", "Banana", "Carrot", "Orange"], correctAnswer: "Carrot" },
    { type: "verbal", prompt: "Which one does not belong?", options: ["Dog", "Cat", "Bird", "Car"], correctAnswer: "Car" },
    { type: "verbal", prompt: "Find the different word:", options: ["Happy", "Sad", "Angry", "Blue"], correctAnswer: "Blue" },
    { type: "verbal", prompt: "Which is not a color?", options: ["Red", "Green", "Yellow", "Square"], correctAnswer: "Square" },
    { type: "verbal", prompt: "Odd one out:", options: ["Milk", "Juice", "Water", "Bread"], correctAnswer: "Bread" },
    { type: "verbal", prompt: "Which is different?", options: ["Circle", "Square", "Triangle", "Yellow"], correctAnswer: "Yellow" },
    { type: "spatial", prompt: "What comes next? 🐶 🐱 🐶 🐱 ...", options: ["🐶", "🐱", "🐭", "🐹"], correctAnswer: "🐶" },
    { type: "spatial", prompt: "Continue: 🌻 🌹 🌻 🌹 ...", options: ["🌻", "🌹", "🌷", "🌺"], correctAnswer: "🌻" },
    { type: "quantitative", prompt: "What comes next? 3, 6, 9, ...", options: ["10", "11", "12", "13"], correctAnswer: "12" },
    { type: "quantitative", prompt: "Count by twos: 2, 4, 6, 8, ...", options: ["9", "10", "11", "12"], correctAnswer: "10" },
    { type: "verbal", prompt: "Which does not belong?", options: ["Shirt", "Pants", "Hat", "Pizza"], correctAnswer: "Pizza" },
    { type: "spatial", prompt: "What comes next? 🎈 🎁 🎈 🎁 ...", options: ["🎈", "🎁", "🎉", "🎊"], correctAnswer: "🎈" },
    { type: "spatial", prompt: "Continue: 🐸 🐛 🐸 🐛 ...", options: ["🐸", "🐛", "🐝", "🦋"], correctAnswer: "🐸" },
    { type: "quantitative", prompt: "What comes next? 1, 2, 3, 4, ...", options: ["4", "5", "6", "7"], correctAnswer: "5" },
    { type: "quantitative", prompt: "Count backwards: 20, 18, 16, ...", options: ["12", "13", "14", "15"], correctAnswer: "14" },
    { type: "verbal", prompt: "Which one is not a fruit?", options: ["Grape", "Lemon", "Potato", "Peach"], correctAnswer: "Potato" },
  ],
  3: [
    { type: "spatial", prompt: "Bird is to Nest as Bee is to ...", options: ["Hive", "Tree", "Flower", "Honey"], correctAnswer: "Hive" },
    { type: "spatial", prompt: "Fish is to Water as Bird is to ...", options: ["Sky", "Ground", "Tree", "Nest"], correctAnswer: "Sky" },
    { type: "spatial", prompt: "Hand is to Glove as Foot is to ...", options: ["Sock", "Hat", "Shirt", "Pants"], correctAnswer: "Sock" },
    { type: "spatial", prompt: "Sun is to Day as Moon is to ...", options: ["Night", "Star", "Cloud", "Rain"], correctAnswer: "Night" },
    { type: "spatial", prompt: "Car is to Road as Boat is to ...", options: ["Water", "Sky", "Track", "Field"], correctAnswer: "Water" },
    { type: "spatial", prompt: "Book is to Read as Bed is to ...", options: ["Sleep", "Eat", "Run", "Jump"], correctAnswer: "Sleep" },
    { type: "quantitative", prompt: "If 5 + ? = 8, what is ?", options: ["2", "3", "4", "5"], correctAnswer: "3" },
    { type: "quantitative", prompt: "If 10 - ? = 6, what is ?", options: ["2", "3", "4", "5"], correctAnswer: "4" },
    { type: "quantitative", prompt: "Double 4 is ...", options: ["6", "7", "8", "9"], correctAnswer: "8" },
    { type: "quantitative", prompt: "If 2 + ? = 10, what is ?", options: ["6", "7", "8", "9"], correctAnswer: "8" },
    { type: "quantitative", prompt: "Triple 2 is ...", options: ["4", "5", "6", "7"], correctAnswer: "6" },
    { type: "quantitative", prompt: "If 7 - ? = 2, what is ?", options: ["3", "4", "5", "6"], correctAnswer: "5" },
    { type: "verbal", prompt: 'Which group does "Lion" belong to?', options: ["Pets", "Wild Animals", "Birds", "Fish"], correctAnswer: "Wild Animals" },
    { type: "verbal", prompt: 'Which group does "Rose" belong to?', options: ["Trees", "Flowers", "Vegetables", "Fruits"], correctAnswer: "Flowers" },
    { type: "verbal", prompt: 'A "Hammer" is a type of ...', options: ["Food", "Tool", "Toy", "Animal"], correctAnswer: "Tool" },
    { type: "verbal", prompt: 'A "Piano" is a ...', options: ["Sport", "Instrument", "Vehicle", "Fruit"], correctAnswer: "Instrument" },
    { type: "verbal", prompt: 'Which group does "Broccoli" belong to?', options: ["Fruits", "Vegetables", "Meats", "Sweets"], correctAnswer: "Vegetables" },
    { type: "verbal", prompt: "A dolphin lives in the ocean. It is a type of ...", options: ["Bird", "Fish", "Mammal", "Insect"], correctAnswer: "Mammal" },
    { type: "spatial", prompt: "Pen is to Write as Scissors is to ...", options: ["Cut", "Draw", "Glue", "Tape"], correctAnswer: "Cut" },
    { type: "spatial", prompt: "Eye is to See as Ear is to ...", options: ["Hear", "Smell", "Taste", "Touch"], correctAnswer: "Hear" },
    { type: "quantitative", prompt: "If 3 + ? = 9, what is ?", options: ["4", "5", "6", "7"], correctAnswer: "6" },
    { type: "quantitative", prompt: "If 12 - ? = 7, what is ?", options: ["3", "4", "5", "6"], correctAnswer: "5" },
    { type: "verbal", prompt: 'Which group does "Eagle" belong to?', options: ["Fish", "Birds", "Reptiles", "Mammals"], correctAnswer: "Birds" },
    { type: "spatial", prompt: "Pillow is to Bed as Tire is to ...", options: ["Car", "Bike", "Road", "Shoe"], correctAnswer: "Car" },
    { type: "spatial", prompt: "Kitten is to Cat as Puppy is to ...", options: ["Dog", "Fox", "Wolf", "Bear"], correctAnswer: "Dog" },
    { type: "quantitative", prompt: "If 8 + ? = 14, what is ?", options: ["4", "5", "6", "7"], correctAnswer: "6" },
    { type: "quantitative", prompt: "If 15 - ? = 9, what is ?", options: ["4", "5", "6", "7"], correctAnswer: "6" },
    { type: "verbal", prompt: "A guitar makes music. It is a type of ...", options: ["Toy", "Instrument", "Tool", "Furniture"], correctAnswer: "Instrument" },
  ],
  4: [
    { type: "spatial", prompt: "Look at the 2x2 grid. Which shape completes the pattern?", options: ["🔺", "🟦", "🟡", "🔴"], correctAnswer: "🔺", visualData: { matrix: [["🔴", "🔴"], ["🔺", "?"]] } },
    { type: "spatial", prompt: "Complete the matrix logic:", options: ["🟦", "🔴", "🟡", "🔺"], correctAnswer: "🟦", visualData: { matrix: [["🔺", "🟦"], ["🔺", "?"]] } },
    { type: "spatial", prompt: "What fits in the empty box?", options: ["🟡", "🔴", "🟦", "🔺"], correctAnswer: "🟡", visualData: { matrix: [["🔴", "🟡"], ["🔴", "?"]] } },
    { type: "spatial", prompt: "Find the missing piece:", options: ["🍎", "🍌", "🍇", "🍊"], correctAnswer: "🍎", visualData: { matrix: [["🍎", "🍌"], ["?", "🍌"]] } },
    { type: "spatial", prompt: "Solve the puzzle:", options: ["⭐", "🌙", "☀️", "☁️"], correctAnswer: "🌙", visualData: { matrix: [["☀️", "☀️"], ["🌙", "?"]] } },
    { type: "spatial", prompt: "Matrix Challenge:", options: ["🚗", "🚕", "🚙", "🚌"], correctAnswer: "🚙", visualData: { matrix: [["🚗", "🚙"], ["🚗", "?"]] } },
    { type: "spatial", prompt: "Fill the gap:", options: ["🍦", "🍩", "🍪", "🍰"], correctAnswer: "🍩", visualData: { matrix: [["🍦", "🍦"], ["🍩", "?"]] } },
    { type: "spatial", prompt: "Logic Grid:", options: ["🐶", "🐱", "🐭", "🐹"], correctAnswer: "🐱", visualData: { matrix: [["🐶", "🐱"], ["🐶", "?"]] } },
    { type: "spatial", prompt: "Complete the set:", options: ["⚽", "🏀", "🏈", "🎾"], correctAnswer: "🏀", visualData: { matrix: [["⚽", "🏀"], ["⚽", "?"]] } },
    { type: "spatial", prompt: "Matrix Fun:", options: ["🎈", "🎆", "🎇", "🧨"], correctAnswer: "🎆", visualData: { matrix: [["🎈", "🎆"], ["🎈", "?"]] } },
    { type: "spatial", prompt: "What goes here?", options: ["🌻", "🌹", "🌷", "🌺"], correctAnswer: "🌹", visualData: { matrix: [["🌻", "🌹"], ["🌻", "?"]] } },
    { type: "spatial", prompt: "Finish the grid:", options: ["🍕", "🍔", "🌮", "🍟"], correctAnswer: "🍔", visualData: { matrix: [["🍕", "🍔"], ["🍕", "?"]] } },
    { type: "spatial", prompt: "Pattern grid:", options: ["🐸", "🐢", "🐍", "🦎"], correctAnswer: "🐢", visualData: { matrix: [["🐸", "🐸"], ["🐢", "?"]] } },
    { type: "spatial", prompt: "Which completes it?", options: ["🎵", "🎶", "🎸", "🥁"], correctAnswer: "🎶", visualData: { matrix: [["🎵", "🎶"], ["🎵", "?"]] } },
    { type: "spatial", prompt: "Grid logic:", options: ["🌈", "⛅", "🌧️", "❄️"], correctAnswer: "⛅", visualData: { matrix: [["🌈", "⛅"], ["🌈", "?"]] } },
    { type: "spatial", prompt: "What belongs here?", options: ["🍕", "🍔", "🌮", "🍟"], correctAnswer: "🌮", visualData: { matrix: [["🍕", "🌮"], ["🍕", "?"]] } },
    { type: "spatial", prompt: "Solve the grid:", options: ["🦊", "🐺", "🐻", "🐰"], correctAnswer: "🐺", visualData: { matrix: [["🦊", "🐺"], ["🦊", "?"]] } },
    { type: "spatial", prompt: "Complete the puzzle:", options: ["✏️", "📏", "📎", "✂️"], correctAnswer: "📏", visualData: { matrix: [["✏️", "📏"], ["✏️", "?"]] } },
    { type: "spatial", prompt: "Find the match:", options: ["🧢", "👟", "🧤", "🧣"], correctAnswer: "👟", visualData: { matrix: [["🧢", "👟"], ["🧢", "?"]] } },
    { type: "spatial", prompt: "Emoji logic:", options: ["🍓", "🫐", "🍋", "🍑"], correctAnswer: "🫐", visualData: { matrix: [["🍓", "🫐"], ["🍓", "?"]] } },
  ],
  5: [
    { type: "spatial", prompt: "If I rotate this shape, which one could it be?", options: ["L", "⅃", "7", "Γ"], correctAnswer: "⅃", visualData: { rotation: "L" } },
    { type: "spatial", prompt: "Mental rotation: Which is the same?", options: ["T", "⟂", "⊢", "⊣"], correctAnswer: "⟂", visualData: { rotation: "T" } },
    { type: "spatial", prompt: "Find the rotated version:", options: ["F", "Ⅎ", "⊲", "⊳"], correctAnswer: "Ⅎ", visualData: { rotation: "F" } },
    { type: "spatial", prompt: "Rotate the shape:", options: ["V", "Λ", ">", "<"], correctAnswer: "Λ", visualData: { rotation: "V" } },
    { type: "spatial", prompt: "Which one is rotated?", options: ["N", "Z", "S", "M"], correctAnswer: "Z", visualData: { rotation: "N" } },
    { type: "spatial", prompt: "Mental Flip:", options: ["E", "Ǝ", "M", "W"], correctAnswer: "Ǝ", visualData: { rotation: "E" } },
    { type: "quantitative", prompt: "If ? + 7 = 15, what is ?", options: ["6", "7", "8", "9"], correctAnswer: "8" },
    { type: "quantitative", prompt: "If ? - 5 = 10, what is ?", options: ["12", "13", "14", "15"], correctAnswer: "15" },
    { type: "quantitative", prompt: "Half of 20 is ...", options: ["5", "10", "15", "20"], correctAnswer: "10" },
    { type: "quantitative", prompt: "If ? + 10 = 25, what is ?", options: ["10", "15", "20", "25"], correctAnswer: "15" },
    { type: "quantitative", prompt: "If ? - 8 = 2, what is ?", options: ["6", "8", "10", "12"], correctAnswer: "10" },
    { type: "quantitative", prompt: "Double of 15 is ...", options: ["20", "25", "30", "35"], correctAnswer: "30" },
    { type: "spatial", prompt: "Which is the flipped version?", options: ["P", "q", "d", "b"], correctAnswer: "q", visualData: { rotation: "P" } },
    { type: "spatial", prompt: "Rotate this letter:", options: ["R", "Я", "K", "X"], correctAnswer: "Я", visualData: { rotation: "R" } },
    { type: "quantitative", prompt: "If ? × 2 = 12, what is ?", options: ["4", "5", "6", "7"], correctAnswer: "6" },
    { type: "quantitative", prompt: "If ? + 9 = 20, what is ?", options: ["9", "10", "11", "12"], correctAnswer: "11" },
    { type: "quantitative", prompt: "Half of 16 is ...", options: ["6", "7", "8", "9"], correctAnswer: "8" },
    { type: "spatial", prompt: "Which is the mirror image?", options: ["W", "M", "E", "S"], correctAnswer: "M", visualData: { rotation: "W" } },
    { type: "spatial", prompt: "Flip this letter:", options: ["d", "b", "p", "q"], correctAnswer: "b", visualData: { rotation: "d" } },
    { type: "quantitative", prompt: "If ? × 3 = 18, what is ?", options: ["4", "5", "6", "7"], correctAnswer: "6" },
    { type: "quantitative", prompt: "If ? + 13 = 20, what is ?", options: ["5", "6", "7", "8"], correctAnswer: "7" },
    { type: "quantitative", prompt: "A quarter of 20 is ...", options: ["4", "5", "6", "10"], correctAnswer: "5" },
  ],
};

const generateQuestions = (level: number): Question[] => {
  const pool = QUESTION_POOL[level] || QUESTION_POOL[1];
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 5).map((q, i) => ({
    ...q, id: `q-${level}-${i}-${Math.random().toString(36).substr(2, 9)}`, level,
  }));
};

const ParentDashboard = ({ history, onClose }: { history: UserHistory[]; onClose: () => void }) => (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="bg-bb-surface rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-bb-card shadow-2xl">
      <div className="p-6 border-b border-bb-card flex justify-between items-center bg-bb-card/50">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-bb-text"><Settings className="w-6 h-6" /> Parent Dashboard</h2>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-bb-muted"><XCircle className="w-8 h-8" /></button>
      </div>
      <div className="p-6 overflow-y-auto flex-1">
        <h3 className="text-lg font-semibold mb-4 text-bb-text">Performance Metrics</h3>
        <table className="w-full text-left border-collapse">
          <thead><tr className="bg-bb-card/30">
            <th className="p-3 border border-bb-card text-bb-muted">Date</th>
            <th className="p-3 border border-bb-card text-bb-muted">Level</th>
            <th className="p-3 border border-bb-card text-bb-muted">Score</th>
            <th className="p-3 border border-bb-card text-bb-muted">Avg Time (s)</th>
          </tr></thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-bb-muted italic">No history recorded yet.</td></tr>
            ) : history.map((s, i) => (
              <tr key={i} className="hover:bg-white/5">
                <td className="p-3 border border-bb-card text-sm text-bb-text">{s.date}</td>
                <td className="p-3 border border-bb-card font-medium text-bb-text">{s.level}</td>
                <td className="p-3 border border-bb-card text-green-400 font-bold">{s.score}/5</td>
                <td className="p-3 border border-bb-card text-bb-text">{(s.timePerQuestion.reduce((a, b) => a + b, 0) / s.timePerQuestion.length).toFixed(1)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-8 p-4 bg-bb-card rounded-xl border border-bb-accent/20">
          <h4 className="font-bold mb-2 text-bb-accent">Developmental Insights</h4>
          <p className="text-sm text-bb-muted leading-relaxed">Your child is showing consistent progress in <strong>Spatial Reasoning</strong>. Focusing on Level 4 Matrix reasoning will help develop their analytical thinking skills.</p>
        </div>
      </div>
    </motion.div>
  </div>
);

export default function BrainyBloomPage() {
  const [userState, setUserState] = useState<UserState>({ currentLevel: 1, totalScore: 0, history: [] });
  const [gameState, setGameState] = useState<GameState>("home");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [sessionScore, setSessionScore] = useState(0);
  const [sessionTimes, setSessionTimes] = useState<number[]>([]);
  const [startTime, setStartTime] = useState(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const resetAndGoHome = () => {
    setUserState({ currentLevel: 1, totalScore: 0, history: [] });
    setFeedback(null); setSelectedOption(null); setGameState("home");
  };

  const startLevel = (level: number) => {
    setCurrentLevel(level); setQuestions(generateQuestions(level));
    setCurrentQuestionIdx(0); setSessionScore(0); setSessionTimes([]);
    setFeedback(null); setSelectedOption(null); setGameState("playing"); setStartTime(Date.now());
  };

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.pitch = 1.2;
    window.speechSynthesis.speak(u);
  };

  const completeLevel = () => {
    const newHistory: UserHistory = {
      date: new Date().toLocaleString(), level: currentLevel,
      score: sessionScore + 1, timePerQuestion: sessionTimes,
    };
    setUserState((prev) => ({
      ...prev,
      currentLevel: Math.max(prev.currentLevel, currentLevel + 1),
      totalScore: prev.totalScore + sessionScore + 1,
      history: [newHistory, ...prev.history].slice(0, 50),
    }));
    setGameState("level_complete"); playSound("success");
  };

  const handleOptionClick = (option: string) => {
    if (feedback) return;
    setSelectedOption(option);
    const correct = option === questions[currentQuestionIdx].correctAnswer;
    if (correct) {
      setFeedback("correct"); playSound("ding");
      setSessionScore((p) => p + 1);
      setSessionTimes((p) => [...p, (Date.now() - startTime) / 1000]);
      setTimeout(() => {
        if (currentQuestionIdx < questions.length - 1) {
          setCurrentQuestionIdx((p) => p + 1);
          setSelectedOption(null); setFeedback(null); setStartTime(Date.now());
        } else { completeLevel(); }
      }, 1500);
    } else {
      setFeedback("incorrect"); playSound("bonk");
      setTimeout(() => { setFeedback(null); setSelectedOption(null); }, 1000);
    }
  };

  const handleLongPressStart = () => { longPressTimer.current = setTimeout(() => setGameState("parent_dashboard"), 3000); };
  const handleLongPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

  const q = questions[currentQuestionIdx];

  return (
    <div className="min-h-screen font-sans">
      <AnimatePresence mode="wait">
        {gameState === "home" && (
          <motion.div key="home" exit={{ opacity: 0 }}>
            <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-bb-bg">
              <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center mb-12">
                <div className="bg-bb-surface p-8 rounded-full shadow-2xl inline-block mb-8 animate-wiggle border border-bb-card">
                  <span className="text-9xl">🌸</span>
                </div>
                <h1 className="text-7xl font-black text-bb-text tracking-tight mb-6">Brainy Bloom</h1>
                <p className="text-2xl text-bb-muted max-w-md mx-auto mb-12">Ready to grow your brain?</p>
              </motion.div>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => startLevel(1)}
                className="group relative w-full max-w-md py-12 bg-bb-accent text-bb-bg font-black text-5xl rounded-[3rem] shadow-[0_0_50px_rgba(187,134,252,0.3)] hover:shadow-[0_0_70px_rgba(187,134,252,0.5)] transition-all flex flex-col items-center gap-4">
                <span className="flex items-center gap-4">START <ChevronRight className="w-16 h-16" /></span>
                <span className="text-xl opacity-60 font-bold uppercase tracking-widest">{LEVELS[0]?.title}</span>
              </motion.button>
              <div onMouseDown={handleLongPressStart} onMouseUp={handleLongPressEnd} onTouchStart={handleLongPressStart} onTouchEnd={handleLongPressEnd}
                className="fixed bottom-8 right-8 p-4 bg-bb-surface/50 rounded-full cursor-help border border-bb-card">
                <Settings className="w-6 h-6 text-bb-muted" />
              </div>
            </div>
          </motion.div>
        )}

        {gameState === "playing" && q && (
          <motion.div key="playing" exit={{ opacity: 0 }}>
            <div className="min-h-screen flex flex-col bg-bb-bg">
              <div className="p-6 flex justify-between items-center bg-bb-surface border-b-4 border-bb-card">
                <div className="flex items-center gap-4">
                  <button onClick={resetAndGoHome} className="p-4 bg-bb-card rounded-2xl shadow-md text-bb-text border border-white/5"><Home className="w-8 h-8" /></button>
                  <div className="text-bb-accent font-bold text-lg">Level {currentLevel}/5 <span className="text-bb-muted font-normal text-sm">— {LEVELS[currentLevel - 1]?.description}</span></div>
                </div>
                <div className="flex-1 px-8">
                  <div className="h-4 bg-bb-card rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${((currentQuestionIdx + 1) / questions.length) * 100}%` }} className="h-full bg-bb-accent shadow-[0_0_10px_rgba(187,134,252,0.5)]" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {[...Array(5)].map((_, i) => (
                    <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: i < sessionScore ? 1 : 0.8 }}>
                      <Star className={`w-10 h-10 ${i < sessionScore ? "text-yellow-400 fill-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" : "text-bb-card"}`} />
                    </motion.div>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <motion.div key={q.id} initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-full max-w-3xl text-center">
                  <div className="mb-8 flex flex-col items-center">
                    <button onClick={() => speak(q.prompt)} className="mb-6 p-6 bg-bb-surface rounded-full shadow-2xl hover:scale-105 transition-transform border border-bb-card">
                      <Volume2 className="w-12 h-12 text-bb-accent" />
                    </button>
                    <h2 className="text-4xl font-bold text-bb-text leading-tight">{q.prompt}</h2>
                  </div>
                  {q.visualData && (
                    <div className="mb-12 p-12 bg-bb-surface rounded-3xl border-4 border-dashed border-bb-card inline-block min-w-[300px]">
                      {q.visualData.target && <span className="text-9xl">{q.visualData.target}</span>}
                      {q.visualData.matrix && (
                        <div className="grid grid-cols-2 gap-8">
                          {q.visualData.matrix.flat().map((cell: string, j: number) => (
                            <div key={j} className="w-24 h-24 bg-bb-card rounded-2xl flex items-center justify-center text-5xl shadow-inner border border-white/5">{cell}</div>
                          ))}
                        </div>
                      )}
                      {q.visualData.rotation && (
                        <div className="flex gap-12 items-center">
                          <span className="text-8xl">{q.visualData.rotation}</span>
                          <span className="text-4xl text-bb-muted">➜</span>
                          <span className="text-8xl opacity-20">?</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-6">
                    {q.options.map((option, idx) => (
                      <button key={idx} onClick={() => handleOptionClick(option)}
                        className={`h-32 text-4xl font-bold rounded-3xl transition-all shadow-xl border-2 ${
                          selectedOption === option
                            ? feedback === "correct" ? "bg-green-500 border-green-400 text-white scale-105" : "bg-red-500 border-red-400 text-white animate-wiggle"
                            : "bg-bb-surface hover:bg-bb-card border-bb-card text-bb-text active:border-bb-accent"
                        }`}>{option}</button>
                    ))}
                  </div>
                </motion.div>
              </div>
              <AnimatePresence>
                {feedback && (
                  <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                    className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
                    <div className={`p-12 rounded-full shadow-2xl ${feedback === "correct" ? "bg-green-500" : "bg-red-500"}`}>
                      {feedback === "correct" ? <CheckCircle2 className="w-32 h-32 text-white" /> : <XCircle className="w-32 h-32 text-white" />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {gameState === "level_complete" && (
          <motion.div key="complete" exit={{ opacity: 0 }}>
            <div className="min-h-screen flex flex-col items-center justify-center bg-bb-bg p-8">
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-bb-surface p-12 rounded-[3rem] shadow-2xl text-center max-w-lg w-full border border-bb-card">
                <div className="text-8xl mb-6">🎉</div>
                <h2 className="text-5xl font-black mb-4 text-bb-text">Amazing Job!</h2>
                <p className="text-xl text-bb-muted mb-8">You finished Level {currentLevel} of 5!</p>
                <div className="flex justify-center gap-3 mb-8">
                  {LEVELS.map((l) => (
                    <div key={l.id} className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                      l.id < currentLevel ? "bg-green-500 border-green-400 text-white"
                        : l.id === currentLevel ? "bg-bb-accent border-bb-accent text-bb-bg"
                        : "bg-bb-card border-bb-card text-bb-muted"
                    }`}>{l.id}</div>
                  ))}
                </div>
                <div className="bg-bb-card p-6 rounded-3xl mb-8 border border-bb-accent/10">
                  <div className="text-sm font-bold uppercase tracking-widest text-bb-muted mb-2">Level Score</div>
                  <div className="text-6xl font-black text-bb-text">{sessionScore}/5</div>
                </div>
                {currentLevel < 5 ? (
                  <button onClick={() => startLevel(currentLevel + 1)}
                    className="w-full py-6 bg-bb-accent text-bb-bg font-bold text-2xl rounded-3xl shadow-lg flex items-center justify-center gap-3 hover:scale-105 transition-transform">
                    Level {currentLevel + 1} <ChevronRight className="w-8 h-8" />
                  </button>
                ) : (
                  <button onClick={() => { playSound("success"); setGameState("game_complete"); }}
                    className="w-full py-6 bg-bb-accent text-bb-bg font-bold text-2xl rounded-3xl shadow-lg flex items-center justify-center gap-3 hover:scale-105 transition-transform">
                    See Results <ChevronRight className="w-8 h-8" />
                  </button>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}

        {gameState === "game_complete" && (
          <motion.div key="game_complete" exit={{ opacity: 0 }}>
            <div className="min-h-screen flex flex-col items-center justify-center bg-bb-bg p-8">
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-bb-surface p-12 rounded-[3rem] shadow-2xl text-center max-w-lg w-full border border-bb-card">
                <div className="text-8xl mb-6">🏆</div>
                <h2 className="text-5xl font-black mb-4 text-bb-text">All Done!</h2>
                <p className="text-xl text-bb-muted mb-8">You completed all 5 levels!</p>
                <div className="bg-bb-card p-6 rounded-3xl mb-8 border border-bb-accent/10">
                  <div className="text-sm font-bold uppercase tracking-widest text-bb-muted mb-2">Total Score</div>
                  <div className="text-6xl font-black text-bb-text">{userState.totalScore}/25</div>
                </div>
                <button onClick={resetAndGoHome}
                  className="w-full py-6 bg-bb-accent text-bb-bg font-bold text-2xl rounded-3xl shadow-lg flex items-center justify-center gap-3 hover:scale-105 transition-transform">
                  <Home className="w-8 h-8" /> Play Again
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {gameState === "parent_dashboard" && <ParentDashboard history={userState.history} onClose={() => setGameState("home")} />}
    </div>
  );
}
