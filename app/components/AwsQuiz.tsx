"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QUESTIONS, type Question, type Domain } from "./quizQuestions";

// ── Types ──────────────────────────────────────────────────────────────────────

type Mode = "menu" | "exam" | "practice" | "results";

interface Answer {
  questionId: string;
  selectedIndex: number | null;
}

const DOMAINS: Domain[] = ["Cloud Concepts", "Security & Compliance", "Technology", "Billing & Pricing"];
const EXAM_DURATION = 90 * 60; // 90 minutes in seconds

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getExamQuestions(): Question[] {
  // Pick questions proportionally across domains to fill 65 slots
  const perDomain = Math.floor(65 / DOMAINS.length);
  const selected: Question[] = [];
  for (const domain of DOMAINS) {
    const pool = shuffle(QUESTIONS.filter((q) => q.domain === domain));
    selected.push(...pool.slice(0, perDomain));
  }
  // Fill remaining slots from any domain
  const remaining = shuffle(QUESTIONS.filter((q) => !selected.includes(q)));
  selected.push(...remaining.slice(0, 65 - selected.length));
  return shuffle(selected);
}

// ── Timer ──────────────────────────────────────────────────────────────────────

function useTimer(initialSeconds: number, active: boolean) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [active]);
  const reset = () => setSeconds(initialSeconds);
  return { seconds, reset };
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ── Domain Score ───────────────────────────────────────────────────────────────

function calcDomainScores(questions: Question[], answers: Answer[]) {
  return DOMAINS.map((domain) => {
    const qs = questions.filter((q) => q.domain === domain);
    const correct = qs.filter((q) => {
      const a = answers.find((a) => a.questionId === q.id);
      return a?.selectedIndex === q.correctIndex;
    }).length;
    return { domain, correct, total: qs.length };
  });
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  page: "min-h-screen font-sans",
  header: "border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-3 flex items-center justify-between",
  badge: "text-xs px-2 py-0.5 rounded-full border border-[color-mix(in_oklab,var(--accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] text-[var(--accent)] font-bold tracking-widest",
  btn: "px-5 py-2.5 rounded-full text-sm font-bold transition-all",
  btnPrimary: "text-white hover:opacity-85",
  btnGhost: "border border-[var(--border-dark)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors",
  card: "rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5",
};

// ── Menu Screen ────────────────────────────────────────────────────────────────

function MenuScreen({ onStart }: { onStart: (mode: "exam" | "practice") => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-4" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="text-center">
        <div className={`${S.badge} mb-4 inline-block`}>AWS CLOUD PRACTITIONER · CLF-C02</div>
        <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Certification Quiz</h1>
        <p className="text-sm max-w-md" style={{ color: "var(--text-secondary)" }}>
          {QUESTIONS.length} questions across 4 official exam domains
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 w-full max-w-2xl">
        <button
          onClick={() => onStart("exam")}
          className="flex flex-col gap-3 p-6 rounded-2xl border transition-all text-left hover:-translate-y-1 hover:shadow-lg"
          style={{
            borderColor: "color-mix(in oklab, var(--accent) 30%, var(--border-color))",
            background: "color-mix(in oklab, var(--accent) 6%, var(--bg-secondary))",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg" style={{ color: "var(--accent)" }}>⏱</span>
            <span className="font-bold" style={{ color: "var(--text-primary)" }}>Exam Mode</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            65 questions · 90 minutes · No feedback until the end. Simulates the real exam environment.
          </p>
          <div className="flex gap-2 flex-wrap">
            {["65 Questions", "90 Min", "Timed"].map((t) => (
              <span key={t} className={S.badge}>{t}</span>
            ))}
          </div>
        </button>

        <button
          onClick={() => onStart("practice")}
          className="flex flex-col gap-3 p-6 rounded-2xl border transition-all text-left hover:-translate-y-1 hover:shadow-lg"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-secondary)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg" style={{ color: "var(--accent)" }}>📚</span>
            <span className="font-bold" style={{ color: "var(--text-primary)" }}>Practice Mode</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Immediate feedback after every answer with detailed explanations of why each answer is correct.
          </p>
          <div className="flex gap-2 flex-wrap">
            {["Instant Feedback", "Explanations", "Learn"].map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{ color: "var(--text-secondary)", borderColor: "var(--border-color)", background: "var(--bg-primary)" }}>{t}</span>
            ))}
          </div>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl">
        {DOMAINS.map((d) => {
          const count = QUESTIONS.filter((q) => q.domain === d).length;
          return (
            <div key={d} className={`${S.card} text-center`}>
              <div className="text-lg font-bold" style={{ color: "var(--accent)" }}>{count}</div>
              <div className="text-[10px] mt-1 leading-tight" style={{ color: "var(--text-secondary)" }}>{d}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Question Card ──────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  total,
  selectedIndex,
  onSelect,
  showFeedback,
}: {
  question: Question;
  index: number;
  total: number;
  selectedIndex: number | null;
  onSelect: (i: number) => void;
  showFeedback: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>{question.domain}</span>
        <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>Q {index + 1} / {total}</span>
      </div>

      <p className="text-base leading-relaxed" style={{ color: "var(--text-primary)" }}>{question.question}</p>

      <div className="flex flex-col gap-2">
        {question.options.map((opt, i) => {
          const isSelected = selectedIndex === i;
          const isCorrect = i === question.correctIndex;
          const isWrong = showFeedback && isSelected && !isCorrect;
          const baseStyle: React.CSSProperties = {
            borderColor: showFeedback
              ? isCorrect ? "#22c55e" : isWrong ? "#ef4444" : "var(--border-color)"
              : isSelected ? "var(--accent)" : "var(--border-color)",
            background: showFeedback
              ? isCorrect ? "rgba(34,197,94,0.08)" : isWrong ? "rgba(239,68,68,0.08)" : "var(--bg-primary)"
              : isSelected ? "color-mix(in oklab, var(--accent) 8%, var(--bg-primary))" : "var(--bg-primary)",
            color: showFeedback
              ? isCorrect ? "#22c55e" : isWrong ? "#ef4444" : "var(--text-secondary)"
              : isSelected ? "var(--text-primary)" : "var(--text-secondary)",
          };
          return (
            <button
              key={i}
              className="w-full text-left px-4 py-3 rounded-xl border text-sm transition-all hover:border-[var(--accent)]"
              style={baseStyle}
              onClick={() => !showFeedback && onSelect(i)}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {showFeedback && (
        <div className="rounded-xl border p-4" style={{ borderColor: "rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.05)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#22c55e" }}>Explanation</div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{question.explanation}</p>
        </div>
      )}
    </div>
  );
}

// ── Results Screen ─────────────────────────────────────────────────────────────

function ResultsScreen({
  questions,
  answers,
  onRestart,
}: {
  questions: Question[];
  answers: Answer[];
  onRestart: () => void;
}) {
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const correct = answers.filter((a) => {
    const q = questions.find((q) => q.id === a.questionId);
    return q && a.selectedIndex === q.correctIndex;
  }).length;
  const pct = Math.round((correct / questions.length) * 100);
  const passed = pct >= 70;
  const domainScores = calcDomainScores(questions, answers);

  if (reviewIndex !== null) {
    const q = questions[reviewIndex];
    const a = answers.find((a) => a.questionId === q.id);
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
        <div className="flex items-center justify-between">
          <button onClick={() => setReviewIndex(null)} className={`${S.btn} ${S.btnGhost}`}>← Back to Results</button>
          <div className="flex gap-2">
            {reviewIndex > 0 && <button onClick={() => setReviewIndex(reviewIndex - 1)} className={`${S.btn} ${S.btnGhost}`}>Prev</button>}
            {reviewIndex < questions.length - 1 && <button onClick={() => setReviewIndex(reviewIndex + 1)} className={`${S.btn} ${S.btnGhost}`}>Next</button>}
          </div>
        </div>
        <QuestionCard
          question={q}
          index={reviewIndex}
          total={questions.length}
          selectedIndex={a?.selectedIndex ?? null}
          onSelect={() => {}}
          showFeedback
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className={`${S.card} text-center`}>
        <div className={`text-5xl font-bold mb-1`} style={{ color: passed ? "#22c55e" : "#ef4444" }}>{pct}%</div>
        <div className="text-sm font-bold mb-1" style={{ color: passed ? "#22c55e" : "#ef4444" }}>
          {passed ? "PASS" : "FAIL"} · {correct}/{questions.length} correct
        </div>
        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Passing score: 70%</div>
      </div>

      <div className={S.card}>
        <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-secondary)" }}>Domain Breakdown</div>
        <div className="flex flex-col gap-3">
          {domainScores.map(({ domain, correct, total }) => {
            const p = total > 0 ? Math.round((correct / total) * 100) : 0;
            return (
              <div key={domain}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: "var(--text-secondary)" }}>{domain}</span>
                  <span style={{ color: p >= 70 ? "#22c55e" : "#ef4444" }}>{correct}/{total} · {p}%</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--border-color)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${p}%`, background: p >= 70 ? "#22c55e" : "#ef4444" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={S.card}>
        <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-secondary)" }}>Review Answers</div>
        <div className="grid grid-cols-8 gap-1.5">
          {questions.map((q, i) => {
            const a = answers.find((a) => a.questionId === q.id);
            const isCorrect = a?.selectedIndex === q.correctIndex;
            return (
              <button
                key={q.id}
                onClick={() => setReviewIndex(i)}
                className="h-8 w-full rounded-lg text-xs font-bold border transition-all hover:opacity-80"
                style={{
                  background: isCorrect ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  borderColor: isCorrect ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
                  color: isCorrect ? "#22c55e" : "#ef4444",
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={onRestart}
        className={`${S.btn} ${S.btnPrimary} w-full`}
        style={{ background: "var(--seam-gradient)" }}
      >
        Start New Session
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AwsQuiz() {
  const [mode, setMode] = useState<Mode>("menu");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceRevealed, setPracticeRevealed] = useState(false);
  const timerActive = mode === "exam";
  const { seconds, reset: resetTimer } = useTimer(EXAM_DURATION, timerActive);
  const timerExpired = mode === "exam" && seconds === 0;
  const sidebarRef = useRef<HTMLDivElement>(null);

  const currentAnswer = answers.find((a) => a.questionId === questions[currentIndex]?.id);

  const startSession = useCallback((m: "exam" | "practice") => {
    const qs = getExamQuestions();
    setQuestions(qs);
    setAnswers(qs.map((q) => ({ questionId: q.id, selectedIndex: null })));
    setCurrentIndex(0);
    setPracticeRevealed(false);
    resetTimer();
    setMode(m);
  }, [resetTimer]);

  // Auto-submit when exam timer expires
  useEffect(() => {
    if (timerExpired) setMode("results");
  }, [timerExpired]);

  // Scroll sidebar item into view
  useEffect(() => {
    const el = sidebarRef.current?.querySelector(`[data-idx="${currentIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [currentIndex]);

  const selectAnswer = (i: number) => {
    setAnswers((prev) =>
      prev.map((a) => a.questionId === questions[currentIndex].id ? { ...a, selectedIndex: i } : a)
    );
    if (mode === "practice") setPracticeRevealed(true);
  };

  const goTo = (i: number) => {
    setCurrentIndex(i);
    setPracticeRevealed(false);
  };

  const submitExam = () => setMode("results");

  if (mode === "menu") return <div className={S.page} style={{ background: "var(--bg-primary)" }}><MenuScreen onStart={startSession} /></div>;
  if (mode === "results") return (
    <div className={S.page} style={{ background: "var(--bg-primary)" }}>
      <div className={S.header}>
        <span className={S.badge}>RESULTS</span>
      </div>
      <ResultsScreen questions={questions} answers={answers} onRestart={() => setMode("menu")} />
    </div>
  );

  const answered = answers.filter((a) => a.selectedIndex !== null).length;
  const q = questions[currentIndex];

  return (
    <div className={`${S.page} flex flex-col`} style={{ height: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Header */}
      <div className={S.header}>
        <div className="flex items-center gap-3">
          <span className={S.badge}>{mode === "exam" ? "EXAM MODE" : "PRACTICE MODE"}</span>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{answered}/{questions.length} answered</span>
        </div>
        <div className="flex items-center gap-3">
          {mode === "exam" && (
            <span className="text-sm font-bold tabular-nums" style={{ color: seconds < 300 ? "#ef4444" : "var(--accent)" }}>
              ⏱ {formatTime(seconds)}
            </span>
          )}
          {mode === "exam" && (
            <button onClick={submitExam} className={`${S.btn} ${S.btnPrimary} text-xs`} style={{ background: "var(--seam-gradient)" }}>
              Submit Exam
            </button>
          )}
          <button onClick={() => setMode("menu")} className={`${S.btn} ${S.btnGhost} text-xs`}>
            Exit
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          ref={sidebarRef}
          className="w-20 shrink-0 border-r overflow-y-auto p-2 flex flex-col gap-1"
          style={{ borderColor: "var(--border-color)", background: "var(--bg-secondary)" }}
        >
          {questions.map((question, i) => {
            const ans = answers.find((a) => a.questionId === question.id);
            const isAnswered = ans?.selectedIndex !== null && ans?.selectedIndex !== undefined;
            const isCorrect = isAnswered && ans?.selectedIndex === question.correctIndex;
            const isCurrent = i === currentIndex;
            // In practice mode show green/red; in exam mode just show answered (accent)
            const answeredColor = mode === "practice"
              ? (isCorrect ? "#22c55e" : "#ef4444")
              : "var(--accent)";
            const answeredBorder = mode === "practice"
              ? (isCorrect ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)")
              : "color-mix(in oklab, var(--accent) 40%, transparent)";
            const answeredBg = mode === "practice"
              ? (isCorrect ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)")
              : "color-mix(in oklab, var(--accent) 8%, transparent)";
            return (
              <button
                key={question.id}
                data-idx={i}
                onClick={() => goTo(i)}
                className="w-full h-8 rounded-lg text-[10px] font-bold border transition-all"
                style={{
                  borderColor: isCurrent ? "rgba(59,130,246,0.6)" : isAnswered ? answeredBorder : "var(--border-color)",
                  background: isCurrent ? "rgba(59,130,246,0.12)" : isAnswered ? answeredBg : "transparent",
                  color: isCurrent ? "#3b82f6" : isAnswered ? answeredColor : "var(--text-secondary)",
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* Question area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <QuestionCard
              question={q}
              index={currentIndex}
              total={questions.length}
              selectedIndex={currentAnswer?.selectedIndex ?? null}
              onSelect={selectAnswer}
              showFeedback={mode === "practice" && practiceRevealed}
            />

            <div className="flex justify-between">
              <button
                onClick={() => goTo(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                className={`${S.btn} ${S.btnGhost} disabled:opacity-30`}
              >
                ← Prev
              </button>
              {currentIndex < questions.length - 1 ? (
                <button onClick={() => goTo(currentIndex + 1)} className={`${S.btn} ${S.btnPrimary}`} style={{ background: "var(--seam-gradient)" }}>
                  Next →
                </button>
              ) : mode === "exam" ? (
                <button onClick={submitExam} className={`${S.btn} ${S.btnPrimary}`} style={{ background: "var(--seam-gradient)" }}>
                  Submit Exam
                </button>
              ) : (
                <button onClick={() => setMode("results")} className={`${S.btn} ${S.btnPrimary}`} style={{ background: "var(--seam-gradient)" }}>
                  View Results
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
