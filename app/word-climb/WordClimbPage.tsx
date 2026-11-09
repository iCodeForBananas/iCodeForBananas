"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { BookOpen, ChevronRight, Sparkles, Undo2, UserPlus } from "lucide-react";
import confetti from "canvas-confetti";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { ToggleButton } from "@/app/components/ui/toggle-button";
import { CARD_BY_ID, GRADES, LEVELS, type Card } from "../lib/wordClimbContent";
import {
  type CardState,
  type CardStates,
  type Grade,
  type QueueItem,
  NEW_CARD_STATE,
  advanceQueue,
  applyGrade,
  buildBatch,
  dueCards,
  levelProgress,
  localDay,
  mergeStates,
  newCards,
  parseCardState,
  previewInterval,
  unlockedLevelCount,
} from "../lib/wordClimbSchedule";

// The ladder lives in app/lib/wordClimbContent.ts and the SM-2 scheduler in
// app/lib/wordClimbSchedule.ts. This file owns the screen and saving.

const ROSTER_KEY = "word-climb-children";
const CURRENT_CHILD_KEY = "word-climb-current-child";
const cardsKey = (player: string) => `word-climb-cards:${player}`;
const DEFAULT_ROSTER = ["Cai"];
const PLAYER_PATTERN = /^[a-z][a-z0-9 '-]{0,39}$/;

/** How long a grade has to be held. A stray tap from a small hand never gets there. */
const HOLD_MS = 500;
/** Grades are ignored briefly after a new card, so one press can't land on two. */
const ARM_MS = 400;

const playerKey = (name: string) => name.trim().toLowerCase();

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows and full storage still get the server copy.
  }
}

function readLocalCards(player: string): CardStates {
  const raw = readJson(cardsKey(player));
  if (!raw || typeof raw !== "object") return {};
  const cards: CardStates = {};
  for (const [id, value] of Object.entries(raw)) {
    const state = parseCardState(value);
    if (state) cards[id] = state;
  }
  return cards;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function formatInterval(days: number) {
  if (days <= 1) return "tomorrow";
  if (days < 60) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

/** The biggest type that still fits the card on a phone. */
function cardTextClass(text: string) {
  if (text.length <= 6) return "text-8xl md:text-9xl";
  if (text.length <= 11) return "text-5xl sm:text-6xl md:text-8xl";
  if (text.length <= 24) return "text-5xl md:text-7xl";
  if (text.length <= 48) return "text-4xl md:text-6xl";
  return "text-3xl md:text-5xl";
}

const GRADE_TILES: { grade: Grade; label: string; hint: string; fill: string }[] = [
  { grade: "again", label: "Again", hint: "Needed help", fill: "bg-danger" },
  { grade: "hard", label: "Hard", hint: "Slow, but got it", fill: "bg-track-6" },
  { grade: "good", label: "Good", hint: "No help needed", fill: "bg-success" },
  { grade: "easy", label: "Easy", hint: "Read it right away", fill: "bg-accent-solid" },
];

// ─── Hold-to-grade tile ───────────────────────────────────────────────────────

function HoldTile({
  tile,
  index,
  detail,
  armed,
  onCommit,
}: {
  tile: (typeof GRADE_TILES)[number];
  index: number;
  detail: string;
  armed: boolean;
  onCommit: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const hotkey = String(index + 1);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  }, []);

  const start = () => {
    if (!armed || timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onCommit();
    }, HOLD_MS);
  };

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // Number keys are held too, so a child mashing a laptop keyboard can't grade.
  // No dependency array: `start` closes over `armed` and `onCommit`.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== hotkey || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      start();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === hotkey) stop();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  const isActivationKey = (key: string) => key === "Enter" || key === " ";

  return (
    <button
      type='button'
      aria-label={`${tile.label}: ${tile.hint}. Next ${detail}. Press and hold to choose.`}
      aria-keyshortcuts={hotkey}
      onPointerDown={(e) => {
        if (e.button === 0) start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onBlur={stop}
      onKeyDown={(e) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        stop();
      }}
      onClick={(e) => {
        // detail 0 is a click with no pointer: a screen reader's activation.
        if (e.detail === 0 && armed) onCommit();
      }}
      style={{ WebkitTouchCallout: "none" }}
      className={`relative overflow-hidden rounded-lg min-h-20 px-3 py-2 text-ink-on-primary select-none touch-none transition-[filter] duration-120 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 ${tile.fill}`}
    >
      <span
        aria-hidden='true'
        className='absolute inset-0 origin-left bg-ink-on-primary/30'
        style={{
          transform: `scaleX(${holding ? 1 : 0})`,
          transition: holding ? `transform ${HOLD_MS}ms linear` : "none",
        }}
      />
      <span aria-hidden='true' className='absolute top-1 left-2 text-12'>
        {hotkey}
      </span>
      <span className='relative flex flex-col items-center leading-tight'>
        <span className='text-20 font-semibold'>{tile.label}</span>
        <span className='text-13'>{tile.hint}</span>
        <span className='text-12'>{detail}</span>
      </span>
    </button>
  );
}

// ─── Grown-up grading strip ───────────────────────────────────────────────────

function GradePanel({
  card,
  isRepeat,
  state,
  today,
  onGrade,
}: {
  card: Card;
  isRepeat: boolean;
  state: CardState | undefined;
  today: string;
  onGrade: (grade: Grade) => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), ARM_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const detailFor = (grade: Grade) => {
    if (isRepeat) return grade === "good" || grade === "easy" ? "done for today" : "one more try";
    return formatInterval(previewInterval(state ?? NEW_CARD_STATE, grade, today));
  };

  const status = isRepeat ? "Repeat" : state?.reviews ? "Review" : "New";

  return (
    <div className='w-full shrink-0 bg-surface-raised border border-line-subtle rounded-lg p-3'>
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3 text-13 text-ink-muted'>
        <span className='font-semibold'>Grown-up: press and hold one</span>
        <span>
          {status} · {plural(card.words, "word")} · {plural(card.syllables, "syllable")}
        </span>
      </div>
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        {GRADE_TILES.map((tile, index) => (
          <HoldTile
            key={tile.grade}
            tile={tile}
            index={index}
            detail={detailFor(tile.grade)}
            armed={armed}
            onCommit={() => onGrade(tile.grade)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Screen = "start" | "playing" | "done";

interface SessionStats {
  graded: number;
  withoutHelp: number;
}

interface HistoryEntry {
  cardId: string;
  before: CardState | undefined;
  changedSchedule: boolean;
  queue: QueueItem[];
  stats: SessionStats;
}

const NO_STATS: SessionStats = { graded: 0, withoutHelp: 0 };

export default function WordClimbPage() {
  const [roster, setRoster] = useState<string[]>(DEFAULT_ROSTER);
  const [child, setChild] = useState<string | null>(null);
  const [states, setStates] = useState<CardStates>({});
  const [loaded, setLoaded] = useState(false);
  const [synced, setSynced] = useState(true);
  const [today, setToday] = useState("");
  const [screen, setScreen] = useState<Screen>("start");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<SessionStats>(NO_STATS);
  const [unlockedTitle, setUnlockedTitle] = useState<string | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState("");

  const statesRef = useRef<CardStates>({});
  const activePlayer = useRef("");
  const dirty = useRef(new Set<string>());
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  // localStorage isn't available during server rendering, so read it on mount.
  useEffect(() => {
    const savedRoster = readJson(ROSTER_KEY);
    const names =
      Array.isArray(savedRoster) && savedRoster.length && savedRoster.every((n) => typeof n === "string")
        ? (savedRoster as string[])
        : DEFAULT_ROSTER;
    const current = readJson(CURRENT_CHILD_KEY);
    setRoster(names);
    setChild(typeof current === "string" && names.includes(current) ? current : names[0]);
  }, []);

  /** Uploads every unsaved card. Chained so that an older write can't land last. */
  const flush = useCallback((player: string) => {
    saveChain.current = saveChain.current.then(async () => {
      if (activePlayer.current !== player) return;
      const ids = [...dirty.current];
      if (!ids.length) return;
      const cards = Object.fromEntries(ids.map((id) => [id, statesRef.current[id]]));
      try {
        const res = await fetch("/api/word-climb/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player_name: player, cards }),
        });
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        for (const id of ids) {
          if (statesRef.current[id] === cards[id]) dirty.current.delete(id);
        }
        setSynced(true);
      } catch (e) {
        // The device copy is safe, and the next load uploads whatever is newer.
        console.error("Failed to save reading progress", e);
        setSynced(false);
      }
    });
  }, []);

  // Load the chosen child: this device's copy merged with the server's.
  useEffect(() => {
    if (!child) return;
    let cancelled = false;
    const player = playerKey(child);

    (async () => {
      const local = readLocalCards(player);
      let merged = local;
      let localNewer: string[] = [];
      let reachedServer = false;
      try {
        const res = await fetch(`/api/word-climb/progress?player=${encodeURIComponent(player)}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? `Load failed: ${res.status}`);
        ({ merged, localNewer } = mergeStates(local, json.cards as CardStates));
        reachedServer = true;
      } catch (e) {
        console.error("Failed to load reading progress", e);
      }
      if (cancelled) return;

      activePlayer.current = player;
      statesRef.current = merged;
      dirty.current = new Set(localNewer);
      writeJson(cardsKey(player), merged);
      setStates(merged);
      setToday(localDay(new Date()));
      setSynced(reachedServer);
      setLoaded(true);
      if (reachedServer && localNewer.length) flush(player);
    })();

    return () => {
      cancelled = true;
    };
  }, [child, flush]);

  const commitCard = (cardId: string, state: CardState): CardStates => {
    const next = { ...statesRef.current, [cardId]: state };
    statesRef.current = next;
    setStates(next);
    const player = activePlayer.current;
    writeJson(cardsKey(player), next);
    dirty.current.add(cardId);
    flush(player);
    return next;
  };

  const startBatch = (keepStats: boolean) => {
    const day = localDay(new Date());
    const batch = buildBatch(statesRef.current, day);
    setToday(day);
    setQueue(batch);
    setHistory([]);
    if (!keepStats) setStats(NO_STATS);
    setStep((s) => s + 1);
    setScreen(batch.length ? "playing" : "done");
  };

  const handleGrade = (grade: Grade) => {
    const item = queue[0];
    if (!item) return;
    const before = statesRef.current[item.cardId];
    setHistory((h) => [...h, { cardId: item.cardId, before, changedSchedule: !item.redrill, queue, stats }]);

    if (!item.redrill) {
      const unlockedBefore = unlockedLevelCount(statesRef.current);
      const next = commitCard(item.cardId, applyGrade(before ?? NEW_CARD_STATE, grade, today, Date.now()));
      const unlockedAfter = unlockedLevelCount(next);
      if (unlockedAfter > unlockedBefore) {
        setUnlockedTitle(LEVELS[unlockedAfter - 1].title);
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });
        window.setTimeout(() => setUnlockedTitle(null), 3000);
      }
      setStats((s) => ({
        graded: s.graded + 1,
        withoutHelp: s.withoutHelp + (grade === "good" || grade === "easy" ? 1 : 0),
      }));
    }

    const nextQueue = advanceQueue(queue, grade);
    setQueue(nextQueue);
    setStep((s) => s + 1);
    if (!nextQueue.length) setScreen("done");
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    if (last.changedSchedule) commitCard(last.cardId, { ...(last.before ?? NEW_CARD_STATE), updatedAt: Date.now() });
    setHistory(history.slice(0, -1));
    setQueue(last.queue);
    setStats(last.stats);
    setStep((s) => s + 1);
    setScreen("playing");
  };

  const chooseChild = (name: string) => {
    if (name === child) return;
    setLoaded(false);
    setChild(name);
    writeJson(CURRENT_CHILD_KEY, name);
  };

  const addChild = (e: FormEvent) => {
    e.preventDefault();
    const name = newChildName.trim();
    if (!PLAYER_PATTERN.test(playerKey(name))) return;
    const existing = roster.find((n) => playerKey(n) === playerKey(name));
    if (!existing) {
      const nextRoster = [...roster, name];
      setRoster(nextRoster);
      writeJson(ROSTER_KEY, nextRoster);
    }
    setNewChildName("");
    setAddingChild(false);
    chooseChild(existing ?? name);
  };

  const unlocked = unlockedLevelCount(states);
  const topLevel = LEVELS[unlocked - 1];
  const gradeIndex = GRADES.indexOf(topLevel.grade);
  const dueCount = today ? dueCards(states, today).length : 0;
  const newCount = newCards(states).length;
  const hasMore = today ? buildBatch(states, today).length > 0 : false;
  const gate = levelProgress(states, unlocked - 1);
  const remainingToUnlock = Math.max(0, gate.needed - gate.secure);
  const nextLevel = LEVELS[unlocked];

  const current = screen === "playing" ? queue[0] : undefined;
  const currentCard = current ? CARD_BY_ID.get(current.cardId) : undefined;

  return (
    <MotionConfig reducedMotion='user'>
      <div className='h-[100dvh] bg-surface-base text-ink-primary flex flex-col overflow-hidden relative'>
        <header className='w-full shrink-0 pl-14 pr-4 pt-3 pb-2 flex items-center justify-between gap-3'>
          <div className='flex items-center gap-3 min-w-0'>
            <BookOpen className='w-6 h-6 text-primary-text shrink-0' />
            <div className='min-w-0'>
              <h1 className='text-20 font-semibold truncate'>Word Climb</h1>
              {screen !== "start" && (
                <p className='text-13 text-ink-muted truncate'>
                  {child} · {topLevel.grade} · {topLevel.title}
                </p>
              )}
            </div>
          </div>
          {screen === "playing" && (
            <div className='flex items-center gap-2 shrink-0'>
              <Button size='md' variant='ghost' disabled={!history.length} onClick={undo}>
                <Undo2 className='w-4 h-4' /> Undo
              </Button>
              <Button size='md' variant='secondary' onClick={() => setScreen("done")}>
                Finish
              </Button>
            </div>
          )}
        </header>

        <div className='w-full shrink-0 px-4 flex gap-2' aria-label={`${topLevel.grade} of ${GRADES.length} grades`}>
          {GRADES.map((grade, i) => (
            <div key={grade} className='flex-1'>
              <div
                className={`h-2 rounded-full border ${
                  i <= gradeIndex ? "bg-primary-solid border-primary-solid" : "bg-surface-raised border-line-subtle"
                }`}
              />
              <div className={`text-12 text-center mt-1 ${i === gradeIndex ? "text-ink-primary font-semibold" : "text-ink-muted"}`}>
                {grade === "Kindergarten" ? "K" : grade}
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence>
          {unlockedTitle && (
            <motion.div
              role='status'
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className='fixed top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-primary-solid text-ink-on-primary text-16 font-semibold flex items-center gap-2 shadow-overlay whitespace-nowrap'
            >
              <Sparkles className='w-4 h-4' /> New level: {unlockedTitle}
            </motion.div>
          )}
        </AnimatePresence>

        {/* min-h-0! because globals.css gives every <main> an unlayered min-height: 100vh. */}
        <main className='flex-1 min-h-0! w-full max-w-5xl mx-auto px-4 pt-3 pb-4 flex flex-col gap-3'>
          {screen === "start" && (
            <div className='flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center gap-6'>
              <div>
                <h2 className='text-48 font-semibold text-primary-text'>Who&apos;s reading?</h2>
                <p className='text-17 text-ink-muted mt-2 max-w-md'>
                  A grown-up sits alongside. Read the card together, then grade how it went.
                </p>
              </div>
              <div className='flex flex-wrap justify-center gap-2'>
                {roster.map((name) => (
                  <ToggleButton key={name} size='xl' pressed={name === child} onClick={() => chooseChild(name)}>
                    {name}
                  </ToggleButton>
                ))}
                {!addingChild && (
                  <Button size='xl' variant='ghost' onClick={() => setAddingChild(true)}>
                    <UserPlus className='w-5 h-5' /> Add a child
                  </Button>
                )}
              </div>
              {addingChild && (
                <form onSubmit={addChild} className='flex items-center gap-2'>
                  <Input
                    size='3'
                    autoFocus
                    aria-label="Child's name"
                    placeholder="Child's name"
                    maxLength={40}
                    value={newChildName}
                    onChange={(e) => setNewChildName(e.target.value)}
                  />
                  <Button type='submit' size='lg' variant='primary' disabled={!PLAYER_PATTERN.test(playerKey(newChildName))}>
                    Add
                  </Button>
                  <Button type='button' size='lg' variant='ghost' onClick={() => setAddingChild(false)}>
                    Cancel
                  </Button>
                </form>
              )}
              <div className='text-16 text-ink-muted min-h-12'>
                {loaded && (
                  <>
                    <p>
                      {topLevel.grade} · {topLevel.title}
                    </p>
                    <p>
                      {plural(dueCount, "review")} due · {newCount} new ready
                    </p>
                  </>
                )}
              </div>
              <Button size='xl' variant='primary' disabled={!loaded} onClick={() => startBatch(false)}>
                {loaded && !hasMore ? "See today's progress" : "Start reading"} <ChevronRight className='w-5 h-5' />
              </Button>
              {loaded && !synced && <SyncNotice />}
            </div>
          )}

          {screen === "playing" && currentCard && (
            <>
              <div className='flex-1 min-h-0 bg-surface-raised border border-line-subtle rounded-lg p-6 flex items-center justify-center overflow-hidden'>
                <motion.p
                  key={step}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  lang='en'
                  className={`font-semibold text-center text-ink-primary leading-snug text-balance max-w-full break-words ${cardTextClass(currentCard.text)}`}
                >
                  {currentCard.text}
                </motion.p>
              </div>
              <GradePanel
                key={step}
                card={currentCard}
                isRepeat={!!current?.redrill}
                state={states[currentCard.id]}
                today={today}
                onGrade={handleGrade}
              />
              <div className='flex justify-between text-13 text-ink-muted shrink-0'>
                <span>{queue.length} left in this round</span>
                {!synced && <span>Saved on this device only</span>}
              </div>
            </>
          )}

          {screen === "done" && (
            <div className='flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center gap-6'>
              <div>
                <h2 className='text-48 font-semibold text-primary-text'>Nice reading, {child}!</h2>
                <p className='text-20 text-ink-muted mt-2'>
                  {stats.withoutHelp} of {plural(stats.graded, "card")} read without help
                </p>
              </div>
              {!hasMore && (
                <p className='text-17 text-ink-muted max-w-lg'>
                  {nextLevel && remainingToUnlock > 0
                    ? `All done for today. ${plural(remainingToUnlock, "more card")} read without help on a later day will open "${nextLevel.title}".`
                    : "All done for today. Come back tomorrow for the next reviews."}
                </p>
              )}
              <div className='flex flex-wrap justify-center gap-3'>
                {hasMore && (
                  <Button size='xl' variant='primary' onClick={() => startBatch(true)}>
                    Keep going <ChevronRight className='w-5 h-5' />
                  </Button>
                )}
                {history.length > 0 && (
                  <Button size='xl' variant='ghost' onClick={undo}>
                    <Undo2 className='w-5 h-5' /> Undo last grade
                  </Button>
                )}
                <Button size='xl' variant='secondary' onClick={() => setScreen("start")}>
                  Back to start
                </Button>
              </div>
              {!synced && <SyncNotice />}
            </div>
          )}
        </main>
      </div>
    </MotionConfig>
  );
}

function SyncNotice() {
  return (
    <p className='text-13 text-ink-muted max-w-md'>
      Couldn&apos;t reach the server, so progress is saved on this device for now. It will upload the next time this opens with a
      connection.
    </p>
  );
}
