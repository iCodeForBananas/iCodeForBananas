"use client";

import { AlignLeft, Drum, Eye, Menu, PencilLine } from "lucide-react";
import styles from "./lead-sheet-editor.module.css";

export type EditorMode = "play" | "lines" | "free";

const MODES: { id: EditorMode; label: string; icon: React.ReactNode }[] = [
  { id: "play", label: "Play", icon: <Eye className='w-[18px] h-[18px]' /> },
  { id: "lines", label: "Edit lines", icon: <PencilLine className='w-[18px] h-[18px]' /> },
  { id: "free", label: "Freeform", icon: <AlignLeft className='w-[18px] h-[18px]' /> },
];

/**
 * The bar every lead-sheet-editor page shares — the reference's `.topbar`:
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
}) {
  return (
    <header className={styles.topbar}>
      <button
        type='button'
        className={`${styles.ibtn} ${libraryOpen ? styles.ibtnOn : ""}`}
        onClick={onLibraryClick}
        aria-label='Song library'
        aria-pressed={!!libraryOpen}
      >
        <Menu className='w-5 h-5' />
        <span className={styles.hideSm}>Songs</span>
      </button>
      <span className={`${styles.brand} ${styles.hideSm}`}>{title}</span>

      {mode && onModeChange && (
        <div className={styles.segctl} role='group' aria-label='Mode'>
          {MODES.map((m) => (
            <button
              key={m.id}
              type='button'
              className={`${styles.segBtn} ${mode === m.id ? styles.segBtnOn : ""}`}
              onClick={() => onModeChange(m.id)}
              aria-pressed={mode === m.id}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.spacer} />

      {rightSlot}

      {onDrumsToggle && (
        <button
          type='button'
          className={`${styles.ibtn} ${drumsOpen ? styles.ibtnOn : ""}`}
          onClick={onDrumsToggle}
          aria-label='Drum loops'
          aria-pressed={!!drumsOpen}
        >
          {drumsPlaying && <span className={styles.livedot} />}
          <Drum className='w-5 h-5' />
          <span className={styles.hideSm}>Drums</span>
        </button>
      )}
    </header>
  );
}
