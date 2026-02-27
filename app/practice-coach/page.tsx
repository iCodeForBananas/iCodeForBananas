"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  PracticeSession, PracticeBlock,
  loadSessions, saveSession, deleteSession, sessionStats,
  loadActiveSession, persistActiveSession, clearActiveSession,
} from "../lib/practiceCoach";

// ─── Types ────────────────────────────────────────────────────

type View = "setup" | "session" | "history";
type SkillLevel = "beginner" | "intermediate" | "advanced";

// ─── Block Timer ──────────────────────────────────────────────

function BlockTimer({ minutes, running, onDone }: { minutes: number; running: boolean; onDone: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(minutes * 60);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSecondsLeft(minutes * 60);
  }, [minutes]);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) { clearInterval(ref.current!); onDone(); return 0; }
          return s - 1;
        });
      }, 1000);
    } else {
      clearInterval(ref.current!);
    }
    return () => clearInterval(ref.current!);
  }, [running, onDone]);

  const m = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const s = (secondsLeft % 60).toString().padStart(2, "0");
  const pct = ((minutes * 60 - secondsLeft) / (minutes * 60)) * 100;

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-mono text-4xl font-black text-yellow-400">{m}:{s}</span>
      <div className="w-full h-2 bg-yellow-400/20 border border-yellow-400/30">
        <div className="h-full bg-yellow-400 transition-all duration-1000" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Session View ─────────────────────────────────────────────

function SessionView({ session, onUpdate, onFinish }: {
  session: PracticeSession;
  onUpdate: (s: PracticeSession) => void;
  onFinish: (s: PracticeSession) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(
    () => session.blocks.findIndex((b) => !b.completed && !b.skipped) === -1
      ? session.blocks.length - 1
      : session.blocks.findIndex((b) => !b.completed && !b.skipped)
  );
  const [timerRunning, setTimerRunning] = useState(false);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [adapting, setAdapting] = useState(false);

  const activeBlock = session.blocks[activeIdx];
  const doneCount = session.blocks.filter((b) => b.completed || b.skipped).length;
  const progress = (doneCount / session.blocks.length) * 100;

  const markBlock = async (action: "complete" | "skip") => {
    const updatedBlocks = session.blocks.map((b, i) =>
      i === activeIdx ? { ...b, completed: action === "complete", skipped: action === "skip" } : b
    );
    const updatedSession: PracticeSession = { ...session, blocks: updatedBlocks };
    const nextIdx = activeIdx + 1;

    setTimerRunning(false);
    setAgentMessage(null);

    if (nextIdx >= session.blocks.length) {
      onFinish(updatedSession);
      return;
    }

    // Call the agent to decide if remaining blocks should adapt
    setAdapting(true);
    onUpdate(updatedSession);
    try {
      const res = await fetch("/api/practice-coach/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: updatedSession, completedBlock: session.blocks[activeIdx], action }),
      });
      const data = await res.json();
      if (data.modified) {
        // Splice adapted remaining blocks back in
        const doneBlocks = updatedBlocks.filter((b) => b.completed || b.skipped);
        const adapted: PracticeSession = { ...updatedSession, blocks: [...doneBlocks, ...data.remainingBlocks] };
        onUpdate(adapted);
        setAgentMessage(data.agentMessage);
        setActiveIdx(doneBlocks.length);
      } else {
        setActiveIdx(nextIdx);
      }
    } catch {
      setActiveIdx(nextIdx);
    } finally {
      setAdapting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Agent message */}
      {agentMessage && (
        <div className="border-2 border-yellow-400 bg-yellow-400/10 px-4 py-3 flex items-start gap-3">
          <span className="text-lg shrink-0">🤖</span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-yellow-400 mb-0.5">Agent adjusted your session</p>
            <p className="text-sm text-yellow-600">{agentMessage}</p>
          </div>
          <button onClick={() => setAgentMessage(null)} className="ml-auto text-yellow-800 hover:text-yellow-400 shrink-0">✕</button>
        </div>
      )}

      {/* Adapting indicator */}
      {adapting && (
        <div className="border border-yellow-400/30 px-4 py-2 flex items-center gap-2 text-xs text-yellow-600">
          <span className="animate-pulse">🤖</span>
          <span>Agent is reviewing your session...</span>
        </div>
      )}

      {/* Progress */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-yellow-600">
          <span>Block {activeIdx + 1} of {session.blocks.length}</span>
          <span>{doneCount} done</span>
        </div>
        <div className="w-full h-2 bg-yellow-400/20 border border-yellow-400/30">
          <div className="h-full bg-yellow-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Active block */}
      <div className="border-2 border-yellow-400 bg-yellow-400/5 p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-yellow-600">{activeBlock.durationMinutes} min</p>
            <h2 className="text-xl font-black uppercase tracking-wide text-yellow-400 mt-0.5">{activeBlock.title}</h2>
          </div>
          {activeBlock.toolLink && (
            <Link
              href={activeBlock.toolLink.href}
              target="_blank"
              className="shrink-0 text-xs font-black uppercase tracking-widest px-3 py-1.5 bg-yellow-400 text-black border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
            >
              Open {activeBlock.toolLink.label} →
            </Link>
          )}
        </div>

        <p className="text-sm text-yellow-600 leading-relaxed">{activeBlock.description}</p>

        <BlockTimer
          minutes={activeBlock.durationMinutes}
          running={timerRunning}
          onDone={() => markBlock("complete")}
        />

        <div className="flex gap-3">
          <button
            onClick={() => setTimerRunning((r) => !r)}
            className="flex-1 py-2 bg-yellow-400 text-black font-black uppercase tracking-widest border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all text-sm"
          >
            {timerRunning ? "⏸ Pause" : "▶ Start"}
          </button>
          <button
            onClick={() => markBlock("complete")}
            className="flex-1 py-2 bg-black text-yellow-400 font-black uppercase tracking-widest border-2 border-yellow-400 text-sm hover:bg-yellow-400/10 transition-colors"
          >
            ✓ Done
          </button>
          <button
            onClick={() => markBlock("skip")}
            className="px-4 py-2 text-yellow-600 font-bold uppercase tracking-widest border border-yellow-400/30 text-sm hover:border-yellow-400 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>

      {/* Block list */}
      <div className="flex flex-col gap-2">
        {session.blocks.map((b, i) => (
          <div
            key={b.id}
            className={`flex items-center gap-3 px-4 py-2 border text-sm ${
              i === activeIdx
                ? "border-yellow-400 bg-yellow-400/10 text-yellow-400 font-bold"
                : b.completed
                ? "border-yellow-400/20 text-yellow-600 line-through"
                : b.skipped
                ? "border-yellow-400/10 text-yellow-800"
                : "border-yellow-400/20 text-yellow-600"
            }`}
          >
            <span className="w-5 text-center">{b.completed ? "✓" : b.skipped ? "–" : i === activeIdx ? "▶" : "○"}</span>
            <span className="flex-1">{b.title}</span>
            <span className="font-mono text-xs">{b.durationMinutes}m</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Summary View ─────────────────────────────────────────────

function SummaryView({ session, onRate, onNew }: {
  session: PracticeSession;
  onRate: (r: PracticeSession["rating"]) => void;
  onNew: () => void;
}) {
  const completed = session.blocks.filter((b) => b.completed).length;
  const skipped = session.blocks.filter((b) => b.skipped).length;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="border-2 border-yellow-400 p-6 flex flex-col gap-4">
        <p className="text-xs font-bold uppercase tracking-widest text-yellow-600">Session Complete 🍌</p>
        <h2 className="text-2xl font-black uppercase tracking-wide text-yellow-400">{session.goal}</h2>
        <div className="flex gap-6 text-sm">
          <span className="text-yellow-400 font-bold">{completed} completed</span>
          <span className="text-yellow-600">{skipped} skipped</span>
          <span className="text-yellow-600">{session.totalMinutes} min</span>
        </div>
        {session.summary && (
          <p className="text-sm text-yellow-600 leading-relaxed border-l-2 border-yellow-400 pl-4">{session.summary}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-yellow-600">How was it?</p>
        <div className="flex gap-3">
          {(["too-easy", "just-right", "too-hard"] as const).map((r) => (
            <button
              key={r}
              onClick={() => onRate(r)}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-widest border-2 transition-all ${
                session.rating === r
                  ? "bg-yellow-400 text-black border-black shadow-[4px_4px_0px_rgba(0,0,0,1)]"
                  : "border-yellow-400/40 text-yellow-600 hover:border-yellow-400 hover:text-yellow-400"
              }`}
            >
              {r === "too-easy" ? "😴 Too Easy" : r === "just-right" ? "🎯 Just Right" : "🔥 Too Hard"}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onNew}
        className="py-3 bg-yellow-400 text-black font-black uppercase tracking-widest border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
      >
        Start New Session
      </button>
    </div>
  );
}

// ─── History View ─────────────────────────────────────────────

function HistoryView({ sessions, onDelete }: { sessions: PracticeSession[]; onDelete: (id: string) => void }) {
  const stats = sessionStats(sessions);

  if (!sessions.length) return (
    <div className="text-center py-16 text-yellow-600">
      <p className="text-4xl mb-3">🍌</p>
      <p className="font-black uppercase tracking-widest text-yellow-400">No sessions yet</p>
      <p className="text-sm mt-1">Complete your first session to see history here</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Sessions", value: stats.total },
          { label: "Completed", value: stats.completed },
          { label: "Total Min", value: stats.totalMinutes },
        ].map(({ label, value }) => (
          <div key={label} className="border border-yellow-400/30 p-4 text-center">
            <p className="text-2xl font-black text-yellow-400">{value}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-yellow-600 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {sessions.map((s) => {
          const done = s.blocks.filter((b) => b.completed).length;
          const total = s.blocks.length;
          return (
            <div key={s.id} className="border border-yellow-400/30 p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-yellow-400 text-sm">{s.goal}</p>
                  <p className="text-xs text-yellow-600 mt-0.5">
                    {new Date(s.date).toLocaleDateString()} · {s.totalMinutes}min · {s.skillLevel} · {done}/{total} blocks
                    {s.rating && ` · ${s.rating === "too-easy" ? "😴" : s.rating === "just-right" ? "🎯" : "🔥"}`}
                  </p>
                </div>
                <button
                  onClick={() => onDelete(s.id)}
                  className="text-yellow-800 hover:text-yellow-400 text-xs transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
              {s.summary && <p className="text-xs text-yellow-600 leading-relaxed">{s.summary}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function PracticeCoachPage() {
  const [view, setView] = useState<View>("setup");
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [activeSession, setActiveSession] = useState<PracticeSession | null>(null);
  const [sessionDone, setSessionDone] = useState(false);

  // Setup form
  const [goal, setGoal] = useState("");
  const [totalMinutes, setTotalMinutes] = useState(30);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("intermediate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Restore sessions and any in-progress active session
    loadSessions().then(setSessions);
    loadActiveSession().then((session) => {
      if (session) {
        setActiveSession(session);
        const allDone = session.blocks.every((b) => b.completed || b.skipped);
        setSessionDone(allDone);
        setView("session");
      }
    });
  }, []);

  const generateSession = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/practice-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, totalMinutes, skillLevel, history: sessions }),
      });
      if (!res.ok) throw new Error("Failed to generate session");
      const { blocks, summary } = await res.json();
      const session: PracticeSession = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        goal,
        totalMinutes,
        skillLevel,
        blocks,
        summary,
      };
      setActiveSession(session);
      setSessionDone(false);
      await persistActiveSession(session);
      setView("session");
    } catch {
      setError("Couldn't generate session. Check your GEMINI_API_KEY.");
    } finally {
      setLoading(false);
    }
  };

  const handleSessionUpdate = async (s: PracticeSession) => {
    setActiveSession(s);
    await persistActiveSession(s);
    await saveSession(s);
    loadSessions().then(setSessions);
  };

  const handleSessionFinish = async (s: PracticeSession) => {
    setActiveSession(s);
    setSessionDone(true);
    await saveSession(s);
    await clearActiveSession();
    loadSessions().then(setSessions);
  };

  const handleRate = async (rating: PracticeSession["rating"]) => {
    if (!activeSession) return;
    const updated = { ...activeSession, rating };
    setActiveSession(updated);
    await saveSession(updated);
    loadSessions().then(setSessions);
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    loadSessions().then(setSessions);
  };

  return (
    <div className="min-h-screen bg-black text-yellow-400 px-6 py-10">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-yellow-600 mb-1">AI Practice Coach</p>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Your Guitar Practice, Planned.</h1>
          <p className="text-sm text-yellow-600 mt-2">Tell the AI what you want to work on. It builds the session.</p>
        </div>

        {/* Nav */}
        <div className="flex gap-1 mb-8 border-b-2 border-yellow-400/20 pb-4">
          {(["setup", "session", "history"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest transition-colors ${
                view === v ? "bg-yellow-400 text-black" : "text-yellow-600 hover:text-yellow-400"
              }`}
            >
              {v === "setup" ? "🎸 New Session" : v === "session" ? "▶ Active" : "📋 History"}
            </button>
          ))}
        </div>

        {/* Setup */}
        {view === "setup" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-yellow-600">What do you want to work on?</label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Get better at soloing over minor blues in A, improve barre chord transitions, learn the CAGED system..."
                rows={3}
                className="bg-black border-2 border-yellow-400/40 focus:border-yellow-400 outline-none text-yellow-400 placeholder-yellow-800 p-3 text-sm resize-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-yellow-600">Time Available</label>
                <div className="flex gap-2">
                  {[15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      onClick={() => setTotalMinutes(m)}
                      className={`flex-1 py-2 text-xs font-black border-2 transition-all ${
                        totalMinutes === m
                          ? "bg-yellow-400 text-black border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                          : "border-yellow-400/30 text-yellow-600 hover:border-yellow-400 hover:text-yellow-400"
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-yellow-600">Skill Level</label>
                <div className="flex gap-2">
                  {(["beginner", "intermediate", "advanced"] as SkillLevel[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setSkillLevel(l)}
                      className={`flex-1 py-2 text-xs font-black border-2 transition-all capitalize ${
                        skillLevel === l
                          ? "bg-yellow-400 text-black border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                          : "border-yellow-400/30 text-yellow-600 hover:border-yellow-400 hover:text-yellow-400"
                      }`}
                    >
                      {l.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-xs font-bold">{error}</p>}

            <button
              onClick={generateSession}
              disabled={loading || !goal.trim()}
              className="py-4 bg-yellow-400 text-black font-black uppercase tracking-widest border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[4px_4px_0px_rgba(0,0,0,1)]"
            >
              {loading ? "🍌 Generating Session..." : "Generate My Session →"}
            </button>
          </div>
        )}

        {/* Session / Summary */}
        {view === "session" && activeSession && (
          sessionDone
            ? <SummaryView session={activeSession} onRate={handleRate} onNew={() => { clearActiveSession(); setActiveSession(null); setView("setup"); }} />
            : <SessionView session={activeSession} onUpdate={handleSessionUpdate} onFinish={handleSessionFinish} />
        )}
        {view === "session" && !activeSession && (
          <div className="text-center py-16 text-yellow-600">
            <p className="text-4xl mb-3">🎸</p>
            <p className="font-black uppercase tracking-widest text-yellow-400">No active session</p>
            <p className="text-sm mt-1">Set up a new session first</p>
          </div>
        )}

        {/* History */}
        {view === "history" && (
          <HistoryView sessions={sessions} onDelete={handleDelete} />
        )}
      </div>
    </div>
  );
}
