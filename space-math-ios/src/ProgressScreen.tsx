import { useMemo } from "react";
import { X, Check, Circle, CircleDot } from "lucide-react";
import { Button } from "./Button";
import { loadProgress, summarizeProgress, type SkillStatus } from "./lib/progressStore";

// The parent view: what the main site's /learning-progress page showed from
// Supabase, computed here from the on-device history instead.

const STATUS_ICON: Record<SkillStatus, React.ReactNode> = {
  mastered: <Check className='w-5 h-5 text-success shrink-0' aria-label='Mastered' />,
  practicing: <CircleDot className='w-5 h-5 text-primary-text shrink-0' aria-label='Practicing' />,
  "not-started": <Circle className='w-5 h-5 text-ink-muted/50 shrink-0' aria-label='Not started' />,
};

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

function relativeDay(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function ProgressScreen({ onClose }: { onClose: () => void }) {
  // Read once when opened; nothing is answered while this screen is up.
  const summary = useMemo(() => summarizeProgress(loadProgress()), []);
  const { week } = summary;

  return (
    <div className='absolute inset-0 z-[60] bg-surface-sunken/95 backdrop-blur-sm safe-area flex flex-col'>
      <div className='flex items-center justify-between px-4 sm:px-6 py-4 shrink-0'>
        <h1 className='text-2xl font-black'>Progress</h1>
        <Button size='md' variant='secondary' onClick={onClose} aria-label='Close progress'>
          <X className='w-5 h-5' /> Close
        </Button>
      </div>

      <div className='flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-8' style={{ WebkitOverflowScrolling: "touch" }}>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3 mb-6'>
          <Stat label='Skills mastered' value={`${summary.overallMasteredCount} / ${summary.overallTotalCount}`} />
          <Stat label='Sessions' value={String(summary.totalSessions)} />
          <Stat label='Questions answered' value={String(summary.totalQuestions)} />
          <Stat label='This week' value={`${week.questions} · ${pct(week.accuracy)}`} hint='questions · correct' />
        </div>

        {(week.newlyMastered.length > 0 || week.practicingCount > 0 || week.reviewedCount > 0) && (
          <section className='mb-6 rounded-lg border border-line-subtle bg-surface-raised p-4'>
            <h2 className='font-bold mb-2'>Last 7 days</h2>
            {week.newlyMastered.length > 0 && (
              <p className='mb-1'>
                <span className='text-success font-bold'>Newly mastered:</span> {week.newlyMastered.join(", ")}
              </p>
            )}
            <p className='text-ink-muted'>
              {week.practicingCount} skill{week.practicingCount === 1 ? "" : "s"} being practiced · {week.reviewedCount} mastered skill
              {week.reviewedCount === 1 ? "" : "s"} reviewed
            </p>
          </section>
        )}

        <div className='grid md:grid-cols-2 gap-4'>
          {summary.subjects.map((subject) => (
            <section key={subject.id} className='rounded-lg border border-line-subtle bg-surface-raised p-4'>
              <div className='flex items-baseline justify-between gap-2 mb-1'>
                <h2 className='font-bold text-lg'>{subject.label}</h2>
                <span className='text-sm text-ink-muted shrink-0'>
                  {subject.masteredCount} / {subject.totalCount} mastered
                </span>
              </div>
              <div className='h-2 rounded-full bg-white/10 overflow-hidden mb-3'>
                <div className='h-full bg-success' style={{ width: `${(subject.masteredCount / subject.totalCount) * 100}%` }} />
              </div>
              <ul className='flex flex-col gap-2'>
                {subject.skills.map((skill) => (
                  <li key={skill.key} className='flex items-center gap-3'>
                    {STATUS_ICON[skill.status]}
                    <span className={`flex-1 ${skill.status === "not-started" ? "text-ink-muted" : ""}`}>{skill.name}</span>
                    {skill.total > 0 && (
                      <span className='text-sm text-ink-muted text-right'>
                        {pct(skill.accuracy)} of {skill.total}
                        <span className='block text-xs'>{relativeDay(skill.lastPlayed)}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className='rounded-lg border border-line-subtle bg-surface-raised p-4'>
      <div className='text-xs font-bold uppercase tracking-wider text-ink-muted'>{label}</div>
      <div className='text-2xl font-black mt-1'>{value}</div>
      {hint && <div className='text-xs text-ink-muted'>{hint}</div>}
    </div>
  );
}
