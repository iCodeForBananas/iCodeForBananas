import Link from "next/link";

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
    slug: "spd-crime-density",
    title: "SPD Crime Density",
    category: "Geospatial Data Viz",
    description:
      "Leaflet heat-map rendering 10,000+ SPD incident records with density clustering and neighborhood drill-down.",
    stack: ["Leaflet", "leaflet.heat", "React-Leaflet", "CSV Pipeline"],
    metric: "10k+ data points",
    size: "medium",
  },
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
  {
    slug: "trading-chart",
    title: "Momentum Chart",
    category: "Live Market Analysis",
    description:
      "Candlestick chart with RSI, MACD, Bollinger Bands, and volume overlays. Multi-symbol switching with Yahoo Finance live data.",
    stack: ["Recharts", "Yahoo Finance 2", "Next.js", "TypeScript"],
    metric: "Sub-second data refresh",
    size: "medium",
  },
  // Small
  {
    slug: "fretboard",
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
    slug: "chord-shapes",
    title: "Chord Shapes",
    category: "Music Theory",
    description: "CAGED system chord voicing library rendered as interactive fretboard diagrams.",
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
    slug: "songwriter",
    title: "Songwriter",
    category: "Creative Tools",
    description: "Lyric and chord sheet editor with key transposition, capo calculator, and printable layout.",
    stack: ["React", "Music Theory"],
    metric: "Auto-transpose",
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
    slug: "ascii-player",
    title: "ASCII Player",
    category: "Labs",
    description: "Frame-by-frame video-to-ASCII renderer streaming encoded frames at adjustable playback speed.",
    stack: ["React", "Canvas API", "Node.js"],
    metric: "Real-time render",
    size: "small",
  },
];

const AI_STEPS = [
  {
    number: "01",
    title: "Identify the Problem",
    body: "Real products start with real conversations. I dig into what's actually blocking someone before writing a line of code — because building the right thing matters more than building fast.",
  },
  {
    number: "02",
    title: "Design the Solution",
    body: "I map the full solution — data model, user flow, edge cases — then bring concurrent AI sessions in to scaffold every layer at once. Clear thinking up front makes the build phase effortless.",
  },
  {
    number: "03",
    title: "Test It Honestly",
    body: "Coverage is written alongside the feature, not after. I test the happy path and the edges, so what ships is solid and what breaks is caught before anyone else sees it.",
  },
  {
    number: "04",
    title: "Deploy with Intention",
    body: "Every release goes out with error boundaries, rollback paths, and observability already in place. The goal isn't just to ship — it's to ship something that keeps working.",
  },
  {
    number: "05",
    title: "Repeat and Build Momentum",
    body: "Each completed cycle makes the next one faster. Patterns compound, confidence grows, and the product improves in ways that only come from sustained, deliberate iteration.",
  },
];

const KANBAN = {
  now: [
    { title: "Bento Dashboard", note: "Portfolio landing page redesign — the meta-module." },
    { title: "Gemini Songwriter", note: "Real chord-progression suggestions via Gemini Flash 2.0." },
  ],
  next: [
    { title: "Portfolio Optimizer", note: "Multi-asset Sharpe-ratio maximizer with frontier plotting." },
    { title: "WebSocket Market Feed", note: "Replace polling with persistent WS stream for live ticks." },
    { title: "AI Practice Coach", note: "Adaptive guitar practice schedule driven by logged performance data." },
  ],
  later: [
    { title: "P2P Jam Session", note: "WebRTC-based real-time collaborative chord editor." },
    { title: "AI Workout Planner", note: "GPT-generated progressive-overload programs from user history." },
    { title: "Options Flow Screener", note: "Unusual options activity scanner with heatmap visualization." },
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
  const flagships = MODULES.filter((m) => m.size === "flagship");
  const rest = MODULES.filter((m) => m.size !== "flagship");

  return (
    <main className='flex w-full flex-col' style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className='relative flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 min-h-screen px-6 lg:px-16 py-24 overflow-hidden'>
        {/* Ambient glow */}
        <div
          className='pointer-events-none absolute inset-0'
          style={{
            background:
              "radial-gradient(ellipse 90% 60% at 50% 0%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 70%)",
          }}
        />

        {/* Left: copy */}
        <div className='relative z-10 flex-1 max-w-xl flex flex-col gap-7'>
          <div
            className='flex items-center gap-2 text-xs px-4 py-1.5 rounded-full border w-fit font-mono'
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
              color: "var(--text-secondary)",
            }}
          >
            <span
              className='inline-block w-1.5 h-1.5 rounded-full animate-pulse'
              style={{ background: "var(--accent)" }}
            />
            Full-Stack · AI-Native · Seattle
          </div>

          <h1 className='text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight'>
            Full Stack Developer:
            <br />
            <GradientText>Engineering an Evolving</GradientText>
            <br />
            Product Ecosystem.
          </h1>

          <p className='text-base md:text-lg text-[var(--text-secondary)] leading-relaxed max-w-lg'>
            From concept to <strong className='text-[var(--text-primary)]'>production module.</strong> Leveraging
            AI-assisted workflows to build, stress-test, and merge modular full-stack applications into a single living
            hub.
          </p>

          {/* Stats row */}
          <div className='flex flex-wrap gap-4'>
            {[
              { value: `${MODULES.length}`, label: "Live Modules" },
              { value: "Next.js 16", label: "Core Framework" },
              { value: "Gemini AI", label: "AI Engine" },
            ].map(({ value, label }) => (
              <div key={label} className='flex flex-col'>
                <span className='text-2xl font-bold' style={{ color: "var(--accent)" }}>
                  {value}
                </span>
                <span className='text-xs text-[var(--text-secondary)]'>{label}</span>
              </div>
            ))}
          </div>

          <div className='flex flex-wrap gap-3 mt-1'>
            <a
              href='#product-lab'
              className='px-7 py-3 rounded-full text-white font-semibold text-sm transition-opacity hover:opacity-85'
              style={{ background: "var(--seam-gradient)" }}
            >
              Explore the Lab
            </a>

          </div>
        </div>

        {/* Right: system pulse diagram */}
        <div className='relative z-10 flex-1 max-w-sm w-full hidden md:block'>
          <SystemPulse />
          <p className='text-center text-[10px] font-mono text-[var(--text-secondary)] mt-3 tracking-widest uppercase opacity-60'>
            Build · Stress-Test · Merge
          </p>
        </div>

        {/* Scroll cue */}
        <div className='absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30'>
          <span className='text-[10px] tracking-widest uppercase text-[var(--text-secondary)]'>Scroll</span>
          <div className='w-px h-7 rounded-full' style={{ background: "var(--seam-gradient-vert)" }} />
        </div>
      </section>

      {/* ── HOW I WORK ────────────────────────────────────────── */}
      <section id='how-i-build' className='px-6 lg:px-16 py-24 md:py-32' style={{ background: "var(--bg-secondary)" }}>
        <div className='max-w-5xl mx-auto'>
          <SectionLabel>How I Work</SectionLabel>
          <h2 className='text-4xl md:text-5xl font-bold leading-tight mb-4'>
            A cycle that <GradientText>builds momentum.</GradientText>
          </h2>
          <p className='text-[var(--text-secondary)] text-base md:text-lg max-w-2xl mb-14 leading-relaxed'>
            Every great product is the result of the same loop, run well and run repeatedly. AI lets me
            run that loop faster than ever — without skipping the steps that make the outcome worth having.
          </p>

          <div className='flex flex-col gap-4'>
            {AI_STEPS.map(({ number, title, body }) => (
              <div
                key={number}
                className='flex items-start gap-6 p-6 rounded-2xl border'
                style={{
                  background: "var(--bg-primary)",
                  borderColor: "var(--border-color)",
                }}
              >
                <span
                  className='shrink-0 text-2xl font-bold tabular-nums leading-none mt-0.5 w-8'
                  style={{ color: "color-mix(in oklab, var(--accent) 40%, var(--border-color))" }}
                >
                  {number}
                </span>
                <div className='flex flex-col gap-1 flex-1'>
                  <h3 className='font-bold text-[var(--text-primary)]'>{title}</h3>
                  <p className='text-sm text-[var(--text-secondary)] leading-relaxed'>{body}</p>
                </div>
              </div>
            ))}
          </div>


        </div>
      </section>

      {/* ── PRODUCT LAB BENTO GRID ────────────────────────────── */}
      <section id='product-lab' className='px-6 lg:px-16 py-24 md:py-32'>
        <div className='max-w-6xl mx-auto'>
          <SectionLabel>Product Lab</SectionLabel>
          <h2 className='text-4xl md:text-5xl font-bold leading-tight mb-3'>
            The <GradientText>Ecosystem Dashboard.</GradientText>
          </h2>
          <p className='text-[var(--text-secondary)] text-base md:text-lg max-w-2xl mb-10 leading-relaxed'>
            Every module is a standalone application merged into this hub. Hover a card to inspect the live specs. Click
            to launch.
          </p>

          {/* Flagship row */}
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-4'>
            {flagships.map((m) => (
              <BentoCard key={m.slug} mod={m} />
            ))}
          </div>

          {/* Rest (medium + small) */}
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {rest.map((m) => (
              <BentoCard key={m.slug} mod={m} />
            ))}
          </div>
        </div>
      </section>

      {/* ── BEHIND THE CURTAIN ────────────────────────────────── */}
      <section className='px-6 lg:px-16 py-24 md:py-32' style={{ background: "var(--bg-secondary)" }}>
        <div className='max-w-5xl mx-auto'>
          <SectionLabel>Behind the Curtain</SectionLabel>
          <h2 className='text-4xl md:text-5xl font-bold leading-tight mb-4'>
            Every module has a <GradientText>story.</GradientText>
          </h2>
          <p className='text-[var(--text-secondary)] text-base md:text-lg max-w-2xl mb-12 leading-relaxed'>
            Each case study follows the same four-act structure: the problem that made it worth building, the
            AI-assisted architecture that made it feasible, the integration challenge that made it real, and the live
            result.
          </p>

          <div className='grid md:grid-cols-2 gap-6'>
            {flagships.map((mod) => (
              <div
                key={mod.slug}
                className='p-6 rounded-2xl border flex flex-col gap-4'
                style={{
                  background: "var(--bg-primary)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div>
                  <span className='text-[10px] font-bold uppercase tracking-widest' style={{ color: "var(--accent)" }}>
                    {mod.category}
                  </span>
                  <h3 className='text-lg font-bold text-[var(--text-primary)] mt-0.5'>{mod.title}</h3>
                </div>

                <div className='grid grid-cols-2 gap-3'>
                  {[
                    { label: "Business Problem", body: `Why ${mod.title} needed to exist in the ecosystem.` },
                    { label: "AI-Assisted Arch", body: "How AI shaped the data model and component boundaries." },
                    {
                      label: "The Merge Challenge",
                      body: "Integrating without breaking shared state, routes, or styles.",
                    },
                    { label: "Live Demo", body: "Production-grade and accessible right now in this hub." },
                  ].map(({ label, body }) => (
                    <div
                      key={label}
                      className='p-3 rounded-xl border'
                      style={{
                        background: "var(--bg-secondary)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      <p
                        className='text-[10px] font-bold uppercase tracking-wider mb-1'
                        style={{ color: "var(--accent)" }}
                      >
                        {label}
                      </p>
                      <p className='text-xs text-[var(--text-secondary)] leading-relaxed'>{body}</p>
                    </div>
                  ))}
                </div>

                <Link
                  href={`/${mod.slug}`}
                  className='mt-auto text-xs font-semibold px-4 py-2 rounded-full border w-fit transition-colors hover:bg-[var(--bg-secondary)]'
                  style={{ color: "var(--accent)", borderColor: "color-mix(in oklab, var(--accent) 35%, transparent)" }}
                >
                  Launch {mod.title} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FUTURE MERGES KANBAN ──────────────────────────────── */}
      <section className='px-6 lg:px-16 py-24 md:py-32'>
        <div className='max-w-5xl mx-auto'>
          <SectionLabel>Future Merges</SectionLabel>
          <h2 className='text-4xl md:text-5xl font-bold leading-tight mb-4'>
            The Roadmap is <GradientText>always live.</GradientText>
          </h2>
          <p className='text-[var(--text-secondary)] text-base md:text-lg max-w-2xl mb-12 leading-relaxed'>
            This ecosystem never reaches v1.0 — it just merges newer, better modules. Here is what is in the pipeline
            right now.
          </p>

          <div className='grid md:grid-cols-3 gap-6'>
            {(
              [
                { key: "now", label: "NOW", color: "#22c55e", items: KANBAN.now },
                { key: "next", label: "NEXT", color: "var(--accent)", items: KANBAN.next },
                { key: "later", label: "LATER", color: "#94a3b8", items: KANBAN.later },
              ] as const
            ).map(({ key, label, color, items }) => (
              <div key={key} className='flex flex-col gap-3'>
                <div className='flex items-center gap-2 mb-1'>
                  <span className='w-2 h-2 rounded-full shrink-0' style={{ background: color }} />
                  <span className='text-xs font-bold uppercase tracking-widest' style={{ color }}>
                    {label}
                  </span>
                </div>
                <div
                  className='flex flex-col gap-3 p-4 rounded-2xl border min-h-[180px]'
                  style={{
                    background: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  {items.map((item) => (
                    <KanbanCard key={item.title} {...item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer
        className='px-6 py-10 text-center text-xs text-[var(--text-secondary)] border-t'
        style={{ borderColor: "var(--border-color)" }}
      >
        <p>
          Built with velocity in Seattle · <span style={{ color: "var(--accent)" }}>iCodeForBananas</span> · Next.js ·
          React · TypeScript · Gemini AI · Always evolving.
        </p>
      </footer>
    </main>
  );
}
