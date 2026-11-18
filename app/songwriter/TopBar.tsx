"use client";

import { AlignLeft, ChevronRight, Drum, Eye, Menu, PencilLine, Printer } from "lucide-react";
import { ToggleButton } from "@/app/components/ui/toggle-button";
import { Button } from "@/app/components/ui/button";
import styles from "./songwriter.module.css";

export type EditorMode = "play" | "lines" | "free";

const MODES: { id: EditorMode; label: string; icon: React.ReactNode }[] = [
  { id: "play", label: "Play", icon: <Eye className='w-[18px] h-[18px]' /> },
  { id: "lines", label: "Edit lines", icon: <PencilLine className='w-[18px] h-[18px]' /> },
  { id: "free", label: "Freeform", icon: <AlignLeft className='w-[18px] h-[18px]' /> },
];

/**
 * The bar every songwriter page shares — the reference's `.topbar`:
 * a library toggle, the song's name, the Play / Edit Lines / Freeform
 * switch, then (on Play) the text-size stepper, then the Drums toggle.
 * Present in the same place whether you're reading the sheet, tapping
 * lines, or in the raw text editor.
 */
export default function TopBar({
  onLibraryClick,
  libraryOpen,
  title,
  mode,
  onModeChange,
  rightSlot,
  drumsOpen,
  onDrumsToggle,
  drumsPlaying,
  onBackToSongs,
  notes,
  onPrint,
}: {
  /** Opens the song library. Takes its own confirm-before-discard guard where needed. */
  onLibraryClick: () => void;
  libraryOpen?: boolean;
  title: string;
  /** Omit entirely on the library page — there's no song open to switch modes on. */
  mode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;
  /** The text-size stepper — Play mode only, same gating as the reference. */
  rightSlot?: React.ReactNode;
  /** The right-hand drums panel, preview page only. */
  drumsOpen?: boolean;
  onDrumsToggle?: () => void;
  /** Shows the reference's live-dot on the Drums toggle while the loop plays. */
  drumsPlaying?: boolean;
  /**
   * Turns the title into a "Songs › Title" breadcrumb whose first link goes
   * back to the song list. A handler rather than a plain link so the edit
   * page can keep its discard-changes guard and offline navigation works.
   */
  onBackToSongs?: () => void;
  /** The song's general notes, shown on one line beside the title. */
  notes?: string | null;
  /** Prints the song laid out for paper. */
  onPrint?: () => void;
}) {
  const oneLineNotes = notes?.replace(/\s+/g, " ").trim();
  return (
    <header className={styles.topbar}>
      <ToggleButton size='lg' pressed={!!libraryOpen}
        onClick={onLibraryClick}
        aria-label='Song library'
      >
        <Menu className='w-5 h-5' />
        {/* The breadcrumb already says "Songs"; don't say it twice. */}
        {!onBackToSongs && <span className={styles.hideSm}>Songs</span>}
      </ToggleButton>
      {onBackToSongs ? (
        <nav className={styles.crumbs} aria-label='Breadcrumb'>
          <a
            href='/songwriter'
            className={styles.crumbLink}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onBackToSongs();
            }}
          >
            Songs
          </a>
          <ChevronRight className={styles.crumbSep} aria-hidden='true' />
          <span className={styles.brand} aria-current='page' title={title}>{title}</span>
          {oneLineNotes && (
            <span className={`${styles.crumbNotes} ${styles.hideSm}`} title={notes ?? undefined}>
              {oneLineNotes}
            </span>
          )}
        </nav>
      ) : (
        <span className={`${styles.brand} ${styles.hideSm}`}>{title}</span>
      )}

      {mode && onModeChange && (
        <div className={styles.segctl} role='group' aria-label='Mode'>
          {MODES.map((m) => (
            <Button variant='secondary' size='lg'
              key={m.id}
              onClick={() => onModeChange(m.id)}
              aria-pressed={mode === m.id}
            >
              {m.icon}
              {m.label}
            </Button>
          ))}
        </div>
      )}

      {/* With a breadcrumb, it takes the free space so the notes get it. */}
      {!onBackToSongs && <div className={styles.spacer} />}

      {rightSlot}

      {onPrint && (
        <Button variant='secondary' size='lg' onClick={onPrint} aria-label='Print'>
          <Printer className='w-5 h-5' />
          <span className={styles.hideSm}>Print</span>
        </Button>
      )}

      {onDrumsToggle && (
        <ToggleButton size='lg' pressed={!!drumsOpen}
          onClick={onDrumsToggle}
          aria-label='Drum loops'
        >
          {drumsPlaying && <span className={styles.livedot} />}
          <Drum className='w-5 h-5' />
          <span className={styles.hideSm}>Drums</span>
        </ToggleButton>
      )}
    </header>
  );
}
