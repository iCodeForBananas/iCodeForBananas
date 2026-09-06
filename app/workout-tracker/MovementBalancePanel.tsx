"use client";

import { useMemo, useState } from "react";
import {
  MOVEMENT_COLORS,
  MOVEMENT_EXERCISES,
  REST_DAYS,
  WINDOW_DAYS,
  movementBalance,
  type Movement,
  type MovementLoad,
} from "./movementBalance";

const restLabel = ({ daysSinceLast }: MovementLoad) => {
  if (daysSinceLast === null) return "not trained yet";
  if (daysSinceLast === 0) return "trained today";
  return `${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} of rest`;
};

/**
 * Push / pull / legs load over the last two weeks: what has been worked, how
 * long each pattern has rested, and what is safe to train next.
 */
export default function MovementBalancePanel({
  entries,
  today,
}: {
  entries: { exercise: string; date: string }[];
  today: string;
}) {
  const [hoveredMovement, setHoveredMovement] = useState<Movement | null>(null);
  const report = useMemo(() => movementBalance(entries, today), [entries, today]);

  return (
    <div>
      <p className='text-xs text-ink-muted mb-3'>sessions in last {WINDOW_DAYS} days</p>

      <div className='space-y-2 mb-4'>
        {report.overworked && (
          <div className='rounded-lg border border-primary-solid/40 bg-primary-solid/10 px-3 py-2 text-10 text-ink-primary'>
            <span className='font-semibold capitalize'>{report.overworked}</span> is {report.gap} session
            {report.gap === 1 ? "" : "s"} ahead of your lightest pattern. Lay off it until the others catch up.
          </div>
        )}
        <div className='rounded-lg px-3 py-2 text-xs bg-surface-sunken/70 text-ink-muted'>
          {report.nextUp ? (
            <>
              Train next: <span className='font-semibold capitalize'>{report.nextUp}</span>
            </>
          ) : (
            <>Everything was worked in the last {REST_DAYS} days. Take a rest day.</>
          )}
        </div>
      </div>

      <div className='space-y-1'>
        {report.loads.map((load) => (
          <div
            key={load.movement}
            className='relative py-2.5 px-3 rounded-lg cursor-default'
            onMouseEnter={() => setHoveredMovement(load.movement)}
            onMouseLeave={() => setHoveredMovement(null)}
          >
            <div className='flex items-center gap-3'>
              <div className='capitalize text-sm w-14 shrink-0'>{load.movement}</div>
              <div className='flex flex-wrap gap-1 flex-1'>
                {Array.from({ length: load.days }, (_, i) => (
                  <span
                    key={i}
                    className='w-4 h-4 rounded-sm'
                    style={{ backgroundColor: MOVEMENT_COLORS[load.movement] }}
                  />
                ))}
              </div>
              <div className='text-xs text-ink-muted w-8 shrink-0 text-right'>{load.days}x</div>
            </div>
            <div className='ml-[4.25rem] mt-1 text-[11px]'>
              <span className={load.rested ? "text-ink-muted" : "text-primary-text"}>
                {restLabel(load)}
              </span>
              {load.streak > 1 && (
                <span className='text-danger'> · {load.streak} days in a row</span>
              )}
            </div>
            {hoveredMovement === load.movement && (
              <div className='absolute top-full left-0 mt-1 z-20 whitespace-nowrap rounded-lg border border-line-subtle bg-surface-overlay px-3 py-2 text-10 text-ink-primary shadow-overlay pointer-events-none'>
                <div className='font-semibold mb-1 capitalize'>{load.movement} exercises</div>
                {MOVEMENT_EXERCISES[load.movement].map((ex) => (
                  <div key={ex} className='text-ink-muted'>{ex}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
