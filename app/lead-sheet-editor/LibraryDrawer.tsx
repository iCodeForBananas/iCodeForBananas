"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { LeadSheet } from "./shared";
import { goTo } from "./offlineNav";
import styles from "./lead-sheet-editor.module.css";

/**
 * The reference's `.lib` aside, inlined over the song being worked on
 * instead of a separate page navigated to — exactly how the reference
 * itself behaves. Takes the library's data as props rather than calling
 * `useLeadSheetLibrary` itself: the preview page now fetches on its own
 * mount (so opening the drawer is instant, not the first trigger for a
 * fetch) and this just renders whatever that call already produced. This
 * view still doesn't expose the per-row management actions (favorite, copy,
 * share, visibility, delete) the reference's own `.song-item` has no room
 * for either — those stay on the full page, still reachable from the app's
 * own sidebar link.
 */
export default function LibraryDrawer({
  activeId,
  onNavigate,
  onClose,
  sheets,
  visibleSheets,
  query,
  onQueryChange,
  offline,
  cachedIds,
  onCreateSheet,
}: {
  /** The song currently open, for the reference's `.is-active` highlight. */
  activeId?: string;
  /** Called right before navigating to a different song or a new one — the
   *  caller's chance to guard against discarding unsaved work. */
  onNavigate?: () => boolean | void;
  /** Tapping the backdrop on a narrow screen — the reference has no such
   *  backdrop click-away on wide screens, where the panel isn't an overlay. */
  onClose: () => void;
  sheets: LeadSheet[];
  visibleSheets: LeadSheet[];
  query: string;
  onQueryChange: (query: string) => void;
  /** True once the live fetch has failed and this list is the cached one. */
  offline: boolean;
  /** Which songs have an offline copy — so a song that isn't one reads as
   *  unreachable the moment the connection drops, not after tapping it. */
  cachedIds: Set<string>;
  onCreateSheet: () => Promise<string | null>;
}) {
  const router = useRouter();

  async function pick(id: string) {
    if (onNavigate?.() === false) return;
    goTo(router, `/lead-sheet-editor/${id}/preview`);
  }

  async function handleNew() {
    if (onNavigate?.() === false) return;
    const id = await onCreateSheet();
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
          <button
            type='button'
            className={`${styles.ibtn} ${styles.ibtnAccent}`}
            onClick={handleNew}
            aria-label='New song'
            disabled={offline}
            title={offline ? "Offline — new songs need a connection" : undefined}
          >
            <Plus className='w-[18px] h-[18px]' />
            New
          </button>
        </div>
        {offline && (
          <p className={styles.offlineNote}>Offline — showing songs saved on this device.</p>
        )}
        <label className={styles.field}>
          Search
          <input
            className={styles.tinput}
            type='search'
            placeholder='Find a song'
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </label>
      </div>
      <nav className={styles.songlist}>
        {visibleSheets.map((sheet) => {
          const reachable = !offline || cachedIds.has(sheet.id);
          return (
            <button
              key={sheet.id}
              type='button'
              className={`${styles.songItem} ${sheet.id === activeId ? styles.songItemActive : ""}`}
              onClick={() => void pick(sheet.id)}
              disabled={!reachable}
              title={reachable ? undefined : "Not saved on this device — needs a connection"}
            >
              <span className={styles.songItemTitle}>{sheet.title || "Untitled"}</span>
              <span className={styles.songItemMeta}>
                {sheet.capo ? `Capo ${sheet.capo}` : "No capo"} · {sheet.tempo ? `${sheet.tempo} bpm` : "–"}
                {!reachable && " · not downloaded"}
              </span>
            </button>
          );
        })}
      </nav>
      </aside>
    </>
  );
}
