"use client";

import { useState, type ReactNode } from "react";
import { formatChordLabel } from "@/app/lib/chordVoicings";
import { useGuitarSettings } from "@/app/lib/guitarSettings";
import GuitarSettingsPanel from "./GuitarSettingsPanel";

const PANEL_OPEN_KEY = "guitar-settings-panel-open";

function readPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * One guitar tool on its own page: a heading, the shared settings, then the tool.
 *
 * The settings sit above every tool so the root note, chord type and tuning can
 * be changed in place. Folding them away is remembered across tools.
 *
 * The tool is not mounted until the saved settings have arrived, so it never
 * draws the defaults and then swaps them for the chords you actually asked for.
 */
export default function GuitarToolView({
  title,
  tooltip,
  showSettings = true,
  children,
}: {
  title: string;
  tooltip?: string;
  /** The Settings page is the panel itself, so it has no use for another copy. */
  showSettings?: boolean;
  children: ReactNode;
}) {
  const { rootNote, chordType, tuning, ready } = useGuitarSettings();
  const [panelOpen, setPanelOpen] = useState(readPanelOpen);
  if (!ready) return null;

  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    try {
      localStorage.setItem(PANEL_OPEN_KEY, String(next));
    } catch {
      // Storage blocked: the choice just lasts for this page.
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-10 lg:pl-0">
        <h1 className="font-display text-20 font-semibold text-ink-primary" title={tooltip}>
          {title}
        </h1>
        {showSettings && (
          <button
            type="button"
            onClick={togglePanel}
            aria-expanded={panelOpen}
            title={panelOpen ? "Hide settings" : "Show settings"}
            className="text-13 text-ink-muted hover:text-ink-primary"
          >
            {formatChordLabel(rootNote, chordType)} · {tuning.name} {panelOpen ? "▴" : "▾"}
          </button>
        )}
      </header>
      {showSettings && panelOpen && <GuitarSettingsPanel />}
      {children}
    </div>
  );
}
