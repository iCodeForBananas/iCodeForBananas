"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Undo2 } from "lucide-react";
import confetti from "canvas-confetti";
import { Button } from "@/app/components/ui/button";
import { CARD_BY_ID } from "../lib/wordClimbContent";
import {
  type CardState,
  type CardStates,
  type Grade,
  type QueueItem,
  NEW_CARD_STATE,
  ROUND_SIZE,
  advanceQueue,
  applyGrade,
  buildRound,
  localDay,
  parseCardState,
  topUpQueue,
  unlockedLevelCount,
} from "../lib/wordClimbSchedule";

// The ladder lives in app/lib/wordClimbContent.ts and the SM-2 scheduler in
// app/lib/wordClimbSchedule.ts. This file owns the screen and saving.

const PLAYER = "cai";
const PROGRESS_URL = "/api/word-climb/progress";

const GRADE_TILES: { grade: Grade; label: string; fill: string }[] = [
  { grade: "again", label: "Again", fill: "bg-danger" },
  { grade: "hard", label: "Hard", fill: "bg-track-6" },
  { grade: "good", label: "Good", fill: "bg-success" },
  { grade: "easy", label: "Easy", fill: "bg-accent-solid" },
];

/** The biggest type that still fits the card, from a phone up to a full-width tablet. */
function cardTextClass(text: string) {
  if (text.length <= 6) return "text-8xl md:text-[10rem] lg:text-[12rem]";
  if (text.length <= 11) return "text-5xl sm:text-6xl md:text-8xl xl:text-9xl";
  if (text.length <= 24) return "text-5xl md:text-7xl xl:text-8xl";
  if (text.length <= 48) return "text-4xl md:text-6xl xl:text-7xl";
  return "text-3xl md:text-5xl xl:text-6xl";
}

type Screen = "loading" | "load-failed" | "playing" | "round-over" | "all-done";

interface HistoryEntry {
  cardId: string;
  before: CardState | undefined;
  changedSchedule: boolean;
  queue: QueueItem[];
}

export default function WordClimbPage() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);

  const statesRef = useRef<CardStates>({});
  const dirty = useRef(new Set<string>());
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const startRound = useCallback(() => {
    const round = buildRound(statesRef.current, localDay(new Date()));
    setQueue(round);
    setHistory([]);
    setScreen(round.length ? "playing" : "all-done");
  }, []);

  /** A failed load must stop here: playing on empty state would overwrite the saved schedule. */
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${PROGRESS_URL}?player=${PLAYER}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `Load failed: ${res.status}`);
      const cards: CardStates = {};
      for (const [id, value] of Object.entries(json.cards as Record<string, unknown>)) {
        const state = parseCardState(value);
        if (state) cards[id] = state;
      }
      statesRef.current = cards;
      startRound();
    } catch (e) {
      console.error("Failed to load reading progress", e);
      setScreen("load-failed");
    }
  }, [startRound]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Uploads every unsaved card. Chained so that an older write can't land last. */
  const flush = () => {
    saveChain.current = saveChain.current.then(async () => {
      const ids = [...dirty.current];
      if (!ids.length) return;
      const cards = Object.fromEntries(ids.map((id) => [id, statesRef.current[id]]));
      try {
        const res = await fetch(PROGRESS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player_name: PLAYER, cards }),
        });
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        for (const id of ids) {
          if (statesRef.current[id] === cards[id]) dirty.current.delete(id);
        }
        setSaveFailed(false);
      } catch (e) {
        // Unsaved cards stay in `dirty` and go up with the next grade.
        console.error("Failed to save reading progress", e);
        setSaveFailed(true);
      }
    });
  };

  const commitCard = (cardId: string, state: CardState) => {
    statesRef.current = { ...statesRef.current, [cardId]: state };
    dirty.current.add(cardId);
    flush();
  };

  const handleGrade = (grade: Grade) => {
    const item = queue[0];
    if (!item) return;
    const before = statesRef.current[item.cardId];
    const today = localDay(new Date());
    setHistory((h) => [...h, { cardId: item.cardId, before, changedSchedule: !item.redrill, queue }]);

    if (!item.redrill) {
      const unlockedBefore = unlockedLevelCount(statesRef.current);
      commitCard(item.cardId, applyGrade(before ?? NEW_CARD_STATE, grade, today, Date.now()));
      if (unlockedLevelCount(statesRef.current) > unlockedBefore) {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });
      }
    }

    const cardsShown = history.length + 1;
    const next = topUpQueue(advanceQueue(queue, grade), statesRef.current, today, ROUND_SIZE - cardsShown);
    setQueue(next);
    if (!next.length) setScreen(buildRound(statesRef.current, today).length ? "round-over" : "all-done");
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    if (last.changedSchedule) commitCard(last.cardId, { ...(last.before ?? NEW_CARD_STATE), updatedAt: Date.now() });
    setHistory(history.slice(0, -1));
    setQueue(last.queue);
    setScreen("playing");
  };

  const retryLoad = () => {
    setScreen("loading");
    void load();
  };

  // Number keys grade too. No dependency array: handleGrade closes over the queue.
  useEffect(() => {
    if (screen !== "playing") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const tile = GRADE_TILES[Number(e.key) - 1];
      if (tile) handleGrade(tile.grade);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const card = screen === "playing" && queue[0] ? CARD_BY_ID.get(queue[0].cardId) : undefined;

  const undoButton = history.length > 0 && (
    <Button size='icon-xl' variant='ghost' aria-label='Undo' onClick={undo}>
      <Undo2 className='w-6 h-6' />
    </Button>
  );

  return (
    // min-h-0! because globals.css gives every <main> an unlayered min-height: 100vh.
    <main className='h-[100dvh] min-h-0! w-full bg-surface-base text-ink-primary flex flex-col gap-3 p-3 overflow-hidden'>
      <div className='flex-1 min-h-0 relative bg-surface-raised border border-line-subtle rounded-lg p-6 flex flex-col items-center justify-center gap-6 overflow-hidden'>
        {screen === "playing" && <div className='absolute top-2 right-2'>{undoButton}</div>}

        {card && (
          <p lang='en' className={`font-semibold text-center leading-snug text-balance max-w-full break-words ${cardTextClass(card.text)}`}>
            {card.text}
          </p>
        )}

        {screen === "round-over" && (
          <>
            <Button size='xl' variant='primary' onClick={startRound}>
              Next round <ChevronRight className='w-5 h-5' />
            </Button>
            {undoButton}
          </>
        )}

        {screen === "all-done" && (
          <>
            <p className='text-48 font-semibold text-center'>All done for today</p>
            {undoButton}
          </>
        )}

        {screen === "load-failed" && (
          <Button size='xl' variant='primary' onClick={retryLoad}>
            Try again
          </Button>
        )}

        {saveFailed && <p className='absolute bottom-2 text-13 text-danger'>Not saving. Check the connection.</p>}
      </div>

      {card && (
        <div className='grid grid-cols-4 gap-3 shrink-0'>
          {GRADE_TILES.map((tile, index) => (
            <button
              key={tile.grade}
              type='button'
              aria-keyshortcuts={String(index + 1)}
              onClick={() => handleGrade(tile.grade)}
              className={`h-20 md:h-32 rounded-lg text-20 md:text-32 font-semibold text-ink-on-primary select-none touch-manipulation hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 ${tile.fill}`}
            >
              {tile.label}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
