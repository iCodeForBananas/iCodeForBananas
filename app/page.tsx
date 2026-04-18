"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Banana } from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────

type ModuleSize = "flagship" | "medium" | "small";

interface Module {
  slug: string;
  title: string;
  category: string;
  description: string;
  stack: string[];
  metric: string;
  size: ModuleSize;
}

const MODULES: Module[] = [
  // Flagships
  {
    slug: "harmonic-flow",
    title: "Harmonic Flow",
    category: "Music AI Suite",
    description:
      "Real-time chord-to-scale resolver with interactive fretboard overlay. Maps harmonic relationships across all keys and modes simultaneously.",
    stack: ["React 19", "Web Audio API", "Recharts", "Music Theory Engine"],
    metric: "850+ scale/mode combos",
    size: "flagship",
  },
  {
    slug: "algo-backtest",
    title: "Algo Backtest",
    category: "Quantitative Trading Engine",
    description:
      "Multi-strategy backtesting engine with equity curve visualization, drawdown analysis, and real-time Yahoo Finance ingestion across 7 timeframes.",
    stack: ["Next.js API Routes", "Yahoo Finance 2", "Recharts", "TypeScript"],
    metric: "7 timeframes · 15+ symbols",
    size: "flagship",
  },
  {
    slug: "cloud-architect",
    title: "Cloud Architect",
    category: "AI-Powered Infrastructure Simulator",
    description:
      "Drag-and-drop cloud topology builder with a live traffic simulator and Gemini AI cost optimizer that analyzes architecture in real time.",
    stack: ["Gemini AI", "Custom Traffic Sim", "React Canvas", "TypeScript"],
    metric: "AI cost analysis on demand",
    size: "flagship",
  },
  // Medium
  {
    slug: "chord-progressions",
    title: "Chord Progressions",
    category: "Music Theory Generator",
    description:
      "Context-aware chord progression engine with Roman-numeral analysis, export to Nashville notation, and pinned progression history.",
    stack: ["React", "Music Theory", "Recharts"],
    metric: "All 12 keys · 7 modes",
    size: "medium",
  },
  // Small
  {
    slug: "fretboard-explorer",
    title: "Fretboard Explorer",
    category: "Practice",
    description:
      "Interactive 6-string fretboard with note highlighting by scale, chord, or interval across all positions.",
    stack: ["React", "SVG", "Music Theory"],
    metric: "All positions",
    size: "small",
  },
  {
    slug: "fretboard-quiz",
    title: "Fretboard Quiz",
    category: "Practice",
    description: "Timed note-identification quiz with accuracy tracking and adaptive difficulty.",
    stack: ["React", "SVG"],
    metric: "Adaptive difficulty",
    size: "small",
  },
  {
    slug: "circle-of-fifths",
    title: "Circle of Fifths",
    category: "Music Theory",
    description: "Animated interactive circle with key signature highlights, relative major/minor, and mode overlays.",
    stack: ["React", "SVG Animation", "CSS"],
    metric: "12 keys · relative modes",
    size: "small",
  },
  {
    slug: "chord-diagrams",
    title: "Chord Diagrams",
    category: "Music Theory",
    description: "Guitar chord fingering diagrams for every chord type across all 12 keys.",
    stack: ["React", "SVG"],
    metric: "CAGED system",
    size: "small",
  },
  {
    slug: "chord-finder",
    title: "Chord Finder",
    category: "Music Theory",
    description:
      "Click any notes on the interactive fretboard and instantly identify the chord you're playing — exact matches, partial voicings, and extended chord names.",
    stack: ["React", "Music Theory Engine"],
    metric: "Real-time chord ID",
    size: "small",
  },
  {
    slug: "chord-practice",
    title: "Chord Practice",
    category: "Practice",
    description: "Randomized chord-change trainer with BPM control and streak counter.",
    stack: ["React", "Web Audio API"],
    metric: "BPM-synced prompts",
    size: "small",
  },
  {
    slug: "fire-estimator",
    title: "FIRE Estimator",
    category: "Personal Finance",
    description:
      "Compound-interest FIRE calculator with multiple withdrawal-rate scenarios and Monte Carlo projection.",
    stack: ["React", "Recharts", "Financial Math"],
    metric: "Monte Carlo sim",
    size: "small",
  },
  {
    slug: "workout-tracker",
    title: "Workout Tracker",
    category: "Health",
    description: "Progressive-overload logging with volume trends and a personal-record dashboard.",
    stack: ["React", "Recharts", "localStorage"],
    metric: "PR tracking",
    size: "small",
  },
  {
    slug: "silent-metronome",
    title: "Silent Metronome",
    category: "Practice",
    description: "Haptic/visual metronome designed for silent practice sessions with subdivisions and accent patterns.",
    stack: ["React", "Web Audio API", "CSS Animation"],
    metric: "20–400 BPM",
    size: "small",
  },
  {
    slug: "aws-quiz",
    title: "AWS CCP Quiz",
    category: "Certification Prep",
    description:
      "Full-length AWS Cloud Practitioner exam simulator with Exam Mode (90 min, 65 questions) and Practice Mode with instant feedback and domain-based scoring.",
    stack: ["React", "TypeScript", "Static Question Bank"],
    metric: "65 questions · 4 domains",
    size: "small",
  },
  {
    slug: "wordsmith",
    title: "Wordsmith",
    category: "AI Writing Tools",
    description:
      "AI-powered note editor with tone rewriting, version history, template library, and context-aware Gemini assistant.",
    stack: ["Gemini AI", "React", "TypeScript", "localStorage"],
    metric: "Multi-tone · version history",
    size: "small",
  },
];

const AI_STEPS = [
  {
    number: "01",
    title: "Peel Back the Problem",
    body: "Great apps start with real conversations. I dig into what's actually blocking someone before writing a line of code — because building the right thing matters more than building fast.",
  },
  {
    number: "02",
    title: "Bunch Up a Blueprint",
    body: "I map the full solution — data model, user flow, edge cases — then bring concurrent AI sessions in to scaffold every layer at once. Clear thinking up front makes the build phase a-peel-ingly smooth.",
  },
  {
    number: "03",
    title: "Go Bananas on Testing",
    body: "Coverage is written alongside the feature, not after. I test the happy path and the slippery edges, so what ships is solid and what breaks is caught before anyone slips on it.",
  },
  {
    number: "04",
    title: "Ship It — No Monkey Business",
    body: "Every release goes out with error boundaries, rollback paths, and observability already in place. The goal isn't just to ship — it's to ship something that keeps working.",
  },
  {
    number: "05",
    title: "Rinse, Repeat, Go Ape",
    body: "Each completed cycle makes the next one faster. Patterns compound, confidence grows, and the product ripens in ways that only come from sustained, deliberate iteration.",
  },
];

const KANBAN = {
  now: [
    { title: "Bento Dashboard", note: "Portfolio landing page redesign — the meta-peel." },
  ],
  next: [
    {
      title: "Portfolio Optimizer",
      note: "Multi-asset Sharpe-ratio maximizer — squeezing every drop out of the bunch.",
    },
    {
      title: "WebSocket Market Feed",
      note: "Replace polling with a persistent WS stream. No more waiting for the fruit to ripen.",
    },
  ],
  later: [
    {
      title: "P2P Jam Session",
      note: "WebRTC-based real-time collaborative chord editor. Monkeys jamming across the jungle.",
    },
    { title: "AI Workout Planner", note: "GPT-generated progressive-overload programs. Get swole, go ape." },
    {
      title: "Options Flow Screener",
      note: "Unusual options activity scanner. Follow the smart money — or the smart monkeys.",
    },
  ],
};

// ─── SystemPulse SVG ──────────────────────────────────────────

const NODES = [
  { cx: 80, cy: 70, label: "Music AI", delay: "0s" },
  { cx: 320, cy: 70, label: "Trading", delay: "0.6s" },
  { cx: 370, cy: 170, label: "Data Viz", delay: "1.2s" },
  { cx: 290, cy: 260, label: "Finance", delay: "1.8s" },
  { cx: 110, cy: 260, label: "Labs", delay: "2.4s" },
  { cx: 30, cy: 170, label: "Practice", delay: "3.0s" },
];

const SystemPulse = () => (
  <div className='animate-float-up w-full max-w-[420px] mx-auto pointer-events-none select-none'>
    <svg viewBox='0 0 400 330' fill='none' xmlns='http://www.w3.org/2000/svg' className='w-full h-auto'>
      {/* Connection lines */}
      {NODES.map((n, i) => (
        <line
          key={i}
          x1={200}
          y1={165}
          x2={n.cx}
          y2={n.cy}
          stroke='url(#lineGrad)'
          strokeWidth='1.5'
          strokeDasharray='6 4'
          className='animate-flow-dash'
          style={{ animationDelay: n.delay, animationDuration: "3.2s" }}
        />
      ))}

      {/* Central hub pulse ring */}
      <circle cx={200} cy={165} r={34} fill='none' stroke='var(--accent)' strokeWidth='1' opacity='0.25' />
      <circle
        cx={200}
        cy={165}
        r={28}
        fill='color-mix(in oklab, var(--accent) 14%, transparent)'
        className='animate-hub-breathe'
      />
      <circle cx={200} cy={165} r={18} fill='color-mix(in oklab, var(--accent) 30%, transparent)' />
      <text
        x={200}
        y={161}
        textAnchor='middle'
        fontSize='7'
        fill='var(--accent)'
        fontWeight='700'
        fontFamily='monospace'
      >
        CORE
      </text>
      <text x={200} y={172} textAnchor='middle' fontSize='6' fill='var(--text-secondary)' fontFamily='monospace'>
        HUB
      </text>

      {/* Satellite nodes */}
      {NODES.map((n, i) => (
        <g key={i} className='animate-node-blink' style={{ animationDelay: n.delay }}>
          <circle
            cx={n.cx}
            cy={n.cy}
            r={22}
            fill='color-mix(in oklab, var(--accent) 8%, transparent)'
            stroke='var(--accent)'
            strokeWidth='1'
            opacity='0.6'
          />
          <circle cx={n.cx} cy={n.cy} r={4} fill='var(--accent)' opacity='0.9' />
          <text
            x={n.cx}
            y={n.cy + 33}
            textAnchor='middle'
            fontSize='8'
            fill='var(--text-secondary)'
            fontFamily='monospace'
          >
            {n.label}
          </text>
        </g>
      ))}

      {/* Grid lines (decorative) */}
      {[60, 120, 180, 240, 300].map((x) => (
        <line key={x} x1={x} y1={0} x2={x} y2={330} stroke='var(--border-color)' strokeWidth='0.5' opacity='0.5' />
      ))}
      {[55, 110, 165, 220, 275].map((y) => (
        <line key={y} x1={0} y1={y} x2={400} y2={y} stroke='var(--border-color)' strokeWidth='0.5' opacity='0.5' />
      ))}

      <defs>
        <linearGradient id='lineGrad' x1='0%' y1='0%' x2='100%' y2='0%'>
          <stop offset='0%' stopColor='var(--accent)' stopOpacity='0.6' />
          <stop offset='100%' stopColor='#ff9900' stopOpacity='0.6' />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

// ─── BentoCard ────────────────────────────────────────────────

const BentoCard = ({ mod }: { mod: Module }) => {
  const isFlagship = mod.size === "flagship";
  const isMedium = mod.size === "medium";

  const colSpan = isFlagship ? "col-span-2 row-span-2" : isMedium ? "col-span-2 md:col-span-2" : "col-span-1";

  return (
    <Link
      href={`/${mod.slug}`}
      className={`group relative rounded-2xl border overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${colSpan}`}
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
        minHeight: isFlagship ? "280px" : isMedium ? "140px" : "128px",
        boxShadow: "0 2px 12px color-mix(in oklab, var(--accent) 5%, transparent)",
      }}
    >
      {/* Hover gradient overlay */}
      <div
        className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none'
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 70%)",
        }}
      />

      {/* Base content */}
      <div className='relative z-10 p-5 flex flex-col gap-2 h-full'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <span className='text-[10px] font-bold uppercase tracking-widest' style={{ color: "var(--accent)" }}>
              {mod.category}
            </span>
            <h3
              className={`font-bold text-[var(--text-primary)] leading-tight ${isFlagship ? "text-xl mt-0.5" : "text-base mt-0.5"}`}
            >
              {mod.title}
            </h3>
          </div>
          <span
            className='shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium'
            style={{
              color: "var(--accent)",
              borderColor: "color-mix(in oklab, var(--accent) 30%, transparent)",
              background: "color-mix(in oklab, var(--accent) 8%, transparent)",
            }}
          >
            {mod.size === "flagship" ? "Flagship" : mod.size === "medium" ? "Core" : "Module"}
          </span>
        </div>

        <p
          className={`text-[var(--text-secondary)] leading-relaxed mt-1 ${
            isFlagship ? "text-sm" : isMedium ? "text-xs" : "text-[11px]"
          }`}
        >
          {mod.description}
        </p>

        <div className='mt-auto pt-3 flex flex-col gap-2'>
          {/* Metric bar */}
          <div
            className='text-[10px] font-mono px-2.5 py-1 rounded w-fit'
            style={{
              background: "color-mix(in oklab, var(--accent) 8%, transparent)",
              color: "var(--accent)",
            }}
          >
            ⬡ {mod.metric}
          </div>

          {/* Stack pills — visible on flagship/medium, revealed on hover for small */}
          <div
            className={`flex flex-wrap gap-1.5 ${mod.size === "small" ? "opacity-0 group-hover:opacity-100 transition-opacity" : ""}`}
          >
            {mod.stack.map((t) => (
              <span
                key={t}
                className='text-[9px] px-2 py-0.5 rounded-full border font-medium'
                style={{
                  color: "var(--text-secondary)",
                  borderColor: "var(--border-color)",
                  background: "var(--bg-primary)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* "Open →" arrow on hover */}
        <div
          className='absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold'
          style={{ color: "var(--accent)" }}
        >
          Open →
        </div>
      </div>
    </Link>
  );
};

// ─── SectionLabel ─────────────────────────────────────────────

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span
    className='inline-block text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4'
    style={{
      background: "color-mix(in oklab, var(--accent) 12%, transparent)",
      color: "var(--accent)",
      border: "1px solid color-mix(in oklab, var(--accent) 30%, transparent)",
    }}
  >
    {children}
  </span>
);

const GradientText = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      background: "var(--seam-gradient)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
    }}
  >
    {children}
  </span>
);

// ─── KanbanCard ───────────────────────────────────────────────

const KanbanCard = ({ title, note }: { title: string; note: string }) => (
  <div
    className='p-4 rounded-xl border flex flex-col gap-1.5'
    style={{
      background: "var(--bg-primary)",
      borderColor: "var(--border-color)",
    }}
  >
    <span className='text-sm font-semibold text-[var(--text-primary)]'>{title}</span>
    <span className='text-xs text-[var(--text-secondary)] leading-relaxed'>{note}</span>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────

export default function Home() {
  return (
    <main
      className='flex w-full flex-col h-full overflow-hidden'
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* ── MARQUEE ───────────────────────────────────────────── */}
      <div className='bg-black text-yellow-400 py-2 overflow-hidden whitespace-nowrap border-b-2 border-black'>
        <motion.div
          animate={{ x: [0, -1000] }}
          transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
          className='inline-block text-sm font-bold tracking-widest uppercase'
        >
          WILL CODE FOR BANANAS • POTASSIUM DRIVEN DEVELOPMENT • NO MONKEY BUSINESS • 100% ORGANIC CODE • PEELING BACK
          THE LAYERS OF WEB DEV • WILL CODE FOR BANANAS • POTASSIUM DRIVEN DEVELOPMENT • NO MONKEY BUSINESS • 100%
          ORGANIC CODE • PEELING BACK THE LAYERS OF WEB DEV •{" "}
        </motion.div>
      </div>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className='bg-yellow-400 text-black relative flex flex-col items-center justify-center flex-1 px-6 overflow-hidden'>
        <div className='flex flex-col items-center text-center gap-16'>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className='text-7xl md:text-8xl font-black leading-none tracking-tighter uppercase mb-8 whitespace-nowrap'>
              I Code For
              <br />
              <span className='text-white drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]'>Bananas</span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className='relative flex justify-center'
          >
            <div className='relative z-10'>
              <motion.div
                animate={{ y: [0, -20, 0], rotate: [-5, 5, -5] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              >
                <Banana className='w-64 h-64 md:w-96 md:h-96 text-black fill-yellow-300 drop-shadow-[10px_10px_0px_rgba(0,0,0,1)]' />
              </motion.div>

              {/* Floating Tech Tags */}
              {(
                [
                  {
                    label: "Harmonic Flow",
                    href: "/harmonic-flow",
                    pos: "absolute -top-4 -right-4",
                    anim: { y: [0, 15, 0] },
                    dur: 3,
                    delay: 0.5,
                  },
                  {
                    label: "Algo Backtest",
                    href: "/algo-backtest",
                    pos: "absolute bottom-10 -left-10",
                    anim: { y: [0, -15, 0] },
                    dur: 3.5,
                    delay: 1,
                  },
                  {
                    label: "Cloud Architect",
                    href: "/cloud-architect",
                    pos: "absolute top-1/2 -right-16",
                    anim: { x: [0, 10, 0] },
                    dur: 4,
                    delay: 0.2,
                  },
                  {
                    label: "Chord Finder",
                    href: "/chord-finder",
                    pos: "absolute -bottom-4 right-10",
                    anim: { y: [0, -10, 0], x: [0, 5, 0] },
                    dur: 4.5,
                    delay: 0.8,
                  },
                  {
                    label: "FIRE Estimator",
                    href: "/fire-estimator",
                    pos: "absolute -top-12 left-1/2 -translate-x-1/2",
                    anim: { scale: [1, 1.05, 1] },
                    dur: 3.8,
                    delay: 1.2,
                  },
                  {
                    label: "Fretboard Quiz",
                    href: "/fretboard-quiz",
                    pos: "absolute bottom-1/2 -left-20",
                    anim: { x: [0, -10, 0] },
                    dur: 4.2,
                    delay: 0.4,
                  },
                  {
                    label: "Workout Tracker",
                    href: "/workout-tracker",
                    pos: "absolute top-0 -left-8",
                    anim: { y: [0, 8, 0] },
                    dur: 3.2,
                    delay: 1.5,
                  },
                  {
                    label: "Silent Metronome",
                    href: "/silent-metronome",
                    pos: "absolute -bottom-12 left-1/4",
                    anim: { x: [0, 8, 0] },
                    dur: 3.6,
                    delay: 0.7,
                  },
                  {
                    label: "Circle of Fifths",
                    href: "/circle-of-fifths",
                    pos: "absolute top-1/3 -right-24",
                    anim: { y: [0, -12, 0] },
                    dur: 4.8,
                    delay: 1.8,
                  },
                ] as const
              ).map(({ label, href, pos, anim, dur, delay }) => (
                <motion.div
                  key={label}
                  animate={anim as unknown as Record<string, number[]>}
                  transition={{ repeat: Infinity, duration: dur, delay }}
                  className={`${pos} z-20`}
                >
                  <Link
                    href={href}
                    className='block bg-white border-2 border-black p-3 font-bold text-sm shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:bg-yellow-400 transition-colors'
                  >
                    {label}
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] aspect-square border-2 border-black/20 rounded-full -z-0' />
            <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] aspect-square border-2 border-black/10 rounded-full -z-0' />
          </motion.div>
        </div>
      </section>
    </main>
  );
}
