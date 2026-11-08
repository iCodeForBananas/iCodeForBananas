"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatChordLabel } from "@/app/lib/chordVoicings";
import { useGuitarSettings } from "@/app/lib/guitarSettings";

/**
 * One guitar tool on its own page: a heading, then the tool.
 *
 * The tool is not mounted until the saved settings have arrived, so it never
 * draws the defaults and then swaps them for the chords you actually asked for.
 */
export default function GuitarToolView({
  title,
  tooltip,
  showSettingsLink = true,
  children,
}: {
  title: string;
  tooltip?: string;
  /** The Settings page is where this link goes, so it has no use for one. */
  showSettingsLink?: boolean;
  children: ReactNode;
}) {
  const { rootNote, chordType, tuning, ready } = useGuitarSettings();
  if (!ready) return null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-10 lg:pl-0">
        <h1 className="font-display text-20 font-semibold text-ink-primary" title={tooltip}>
          {title}
        </h1>
        {showSettingsLink && (
          <Link
            href="/guitar/settings"
            title="Change these in Settings"
            className="text-13 text-ink-muted hover:text-ink-primary"
          >
            {formatChordLabel(rootNote, chordType)} · {tuning.name}
          </Link>
        )}
      </header>
      {children}
    </div>
  );
}
