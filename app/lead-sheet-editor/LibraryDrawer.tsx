"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useLeadSheetLibrary } from "./useLibrary";
import { goTo } from "./offlineNav";
import styles from "./lead-sheet-editor.module.css";

/**
 * The reference's `.lib` aside, inlined over the song being worked on
 * instead of a separate page navigated to — exactly how the reference
 * itself behaves. Reads the same `useLeadSheetLibrary` hook the full-page
 * library route (page-client.tsx) does, so the two can never disagree about
 * what's in the library; this view just doesn't expose the per-row
 * management actions (favorite, copy, share, visibility, delete) the
 * reference's own `.song-item` doesn't have room for either — those stay on
 * the full page, still reachable from the app's own sidebar link.
 */
export default function LibraryDrawer({
  activeId,
  onNavigate,
  onClose,
}: {
  /** The song currently open, for the reference's `.is-active` highlight. */
  activeId?: string;
  /** Called right before navigating to a different song or a new one — the
   *  caller's chance to guard against discarding unsaved work. */
  onNavigate?: () => boolean | void;
  /** Tapping the backdrop on a narrow screen — the reference has no such
   *  backdrop click-away on wide screens, where the panel isn't an overlay. */
  onClose: () => void;
}) {
  const router = useRouter();
  const { visibleSheets, sheets, query, setQuery, createSheet } = useLeadSheetLibrary();

  async function pick(id: string) {
    if (onNavigate?.() === false) return;
    goTo(router, `/lead-sheet-editor/${id}/preview`);
  }

  async function handleNew() {
    if (onNavigate?.() === false) return;
    const id = await createSheet();
    if (id) goTo(router, `/lead-sheet-editor/${id}/edit`);
  }

  return (
    <>
      <div
        className={`${styles.backdrop} absolute inset-0 z-30 bg-surface-sunken/40 print:hidden`}
        onClick={onClose}
        aria-hidden='true'
      />
      <aside aria-label='Song library' className={`${styles.sidePanel} ${styles.lib} print:hidden`}>
      <div className={styles.libTop}>
        <div className={styles.libRow}>
          <h2 className={styles.panelH}>Songs · {sheets.length}</h2>
          <button type='button' className={`${styles.ibtn} ${styles.ibtnAccent}`} onClick={handleNew} aria-label='New song'>
            <Plus className='w-[18px] h-[18px]' />
            New
          </button>
        </div>
        <label className={styles.field}>
          Search
          <input
            className={styles.tinput}
            type='search'
            placeholder='Find a song'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <nav className={styles.songlist}>
        {visibleSheets.map((sheet) => (
          <button
            key={sheet.id}
            type='button'
            className={`${styles.songItem} ${sheet.id === activeId ? styles.songItemActive : ""}`}
            onClick={() => void pick(sheet.id)}
          >
            <span className={styles.songItemTitle}>{sheet.title || "Untitled"}</span>
            <span className={styles.songItemMeta}>
              {sheet.capo ? `Capo ${sheet.capo}` : "No capo"} · {sheet.tempo ? `${sheet.tempo} bpm` : "–"}
            </span>
          </button>
        ))}
      </nav>
      </aside>
    </>
  );
}
