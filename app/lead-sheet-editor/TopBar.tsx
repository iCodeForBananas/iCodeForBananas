"use client";

import { AlignLeft, Eye, Menu, PencilLine, Sliders } from "lucide-react";
import styles from "./lead-sheet-editor.module.css";

export type EditorMode = "play" | "lines" | "free";

const MODES: { id: EditorMode; label: string; icon: React.ReactNode }[] = [
  { id: "play", label: "Play", icon: <Eye className='w-[18px] h-[18px]' /> },
  { id: "lines", label: "Edit lines", icon: <PencilLine className='w-[18px] h-[18px]' /> },
  { id: "free", label: "Freeform", icon: <AlignLeft className='w-[18px] h-[18px]' /> },
];

/**
 * The bar every lead-sheet-editor page shares — the reference's `.topbar`:
 * a library toggle, the song's name, and (where a song is open) the
 * Play / Edit Lines / Freeform switch that used to be a sidebar toggle plus
 * a separate route. All three now read as one control, present in the same
 * place whether you're looking at the sheet, tapping lines, or in the raw
 * text editor.
 */
export default function TopBar({
  onLibraryClick,
  title,
  mode,
  onModeChange,
  rightSlot,
  toolsOpen,
  onToolsToggle,
}: {
  /** Opens the song library. Takes its own confirm-before-discard guard where needed. */
  onLibraryClick: () => void;
  title: string;
  /** Omit entirely on the library page — there's no song open to switch modes on. */
  mode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;
  /** Page-specific controls (text size stepper on Play, nothing on the others). */
  rightSlot?: React.ReactNode;
  /** The right-hand tools panel, preview page only. */
  toolsOpen?: boolean;
  onToolsToggle?: () => void;
}) {
  return (
    <header className={styles.topbar}>
      <button
        type='button'
        className={styles.ibtn}
        onClick={onLibraryClick}
        aria-label='Song library'
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

      {onToolsToggle && (
        <button
          type='button'
          className={`${styles.ibtn} ${toolsOpen ? styles.ibtnOn : ""}`}
          onClick={onToolsToggle}
          aria-label='Tools'
          aria-pressed={!!toolsOpen}
        >
          <Sliders className='w-5 h-5' />
          <span className={styles.hideSm}>Tools</span>
        </button>
      )}
    </header>
  );
}
