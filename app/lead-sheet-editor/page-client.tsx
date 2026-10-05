"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Music, Eye, Pencil, Copy, Check, Link2, Star, Download } from "lucide-react";
import type { LeadSheet } from "./shared";
import { getPlainText, OfflineBadge } from "./shared";
import TopBar from "./TopBar";
import { useLeadSheetLibrary } from "./useLibrary";
import { goTo } from "./offlineNav";
import { useCommands } from "@/app/components/ui/command-palette";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Bento } from "@/app/components/ui/bento";
import { Button as RadixButton, IconButton, Select } from "@radix-ui/themes";
import { type SortOrder } from "./library";
import { VisibilityPicker } from "./VisibilityPicker";
import { SongAttribution } from "./SongAttribution";
import styles from "./lead-sheet-editor.module.css";
import { useSongbookPortal } from "./portal";

/**
 * The full-page library — reachable from the app's own sidebar link, not
 * from the editor's topbar any more (that opens the reference's inline
 * drawer instead; see LibraryDrawer.tsx). This is where the per-row
 * management actions the reference's own `.song-item` has no room for live:
 * favorite, copy text, visibility, share, delete. Reads the same
 * useLeadSheetLibrary hook the drawer does, so the two can never disagree
 * about what's in the library.
 */
export default function LeadSheetList() {
  const portal = useSongbookPortal();
  const {
    user,
    authLoading,
    sheets,
    sortedSheets,
    visibleSheets,
    offline,
    cachedIds,
    favoriteError,
    query,
    setQuery,
    density,
    setDensity,
    sortOrder,
    setSortOrder,
    createSheet,
    setVisibility,
    toggleFavorite,
    deleteSheet,
  } = useLeadSheetLibrary();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const router = useRouter();

  const handleCreateSheet = useCallback(async () => {
    const id = await createSheet();
    if (id) router.push(`/lead-sheet-editor/${id}/edit`);
  }, [createSheet, router]);

  // Every song by name, plus the one thing you do when none of them is what
  // you wanted. Rebuilt whenever the library or the create action changes —
  // handleCreateSheet is a fresh closure each render, so this recomputes
  // every render too; the list is short and off the hot path, so that's fine.
  const commands = useMemo(
    () => [
      {
        id: "song:new",
        label: "Create song",
        group: "Library",
        keywords: "new add write",
        run: (): void => void handleCreateSheet(),
      },
      ...sortedSheets.map((sheet) => ({
        id: `song:${sheet.id}`,
        label: sheet.title || "Untitled",
        group: "Songs",
        hint: [sheet.key, sheet.tempo ? `${sheet.tempo} bpm` : null].filter(Boolean).join("  "),
        run: (): void => goTo(router, `/lead-sheet-editor/${sheet.id}/preview`),
      })),
    ],
    [sortedSheets, router, handleCreateSheet]
  );
  useCommands("library", commands);

  async function handleCopyText(sheet: LeadSheet) {
    await navigator.clipboard.writeText(getPlainText(sheet));
    setCopiedId(sheet.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleShare(sheet: LeadSheet) {
    // A private song's share link opens for nobody, so sharing it is what
    // makes it unlisted — the visibility picker is there for dialing it back,
    // not for remembering to open it up first.
    if ((sheet.visibility ?? "private") === "private") {
      await setVisibility(sheet, "unlisted");
    }
    await navigator.clipboard.writeText(`${window.location.origin}/lead-sheet-editor/share/${sheet.id}`);
    setSharedId(sheet.id);
    setTimeout(() => setSharedId(null), 2000);
  }

  if (authLoading) {
    return (
      <div className='flex flex-col flex-1 min-h-0'>
        <TopBar onLibraryClick={() => {}} title='Lead Sheet Editor' />
        <div className='flex-1 flex items-center justify-center text-ink-muted'>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className='flex flex-col flex-1 min-h-0'>
        <TopBar onLibraryClick={() => {}} title='Lead Sheet Editor' />
        <div className='flex-1 flex flex-col items-center justify-center text-center'>
          <p className='text-ink-muted mb-6'>Sign in to create and manage your lead sheets.</p>
          <Link
            href='/login'
            className='inline-block rounded bg-surface-base px-6 py-2 text-sm font-medium text-primary-text'
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col flex-1 min-h-0'>
      {/* The library's not a drawer over a song here — it's its own full
          page, the way it was reachable before the editor grew the
          reference's inline drawer — so the toggle just points at itself;
          there's nowhere else a click on it could usefully go. */}
      <TopBar onLibraryClick={() => {}} title='Lead Sheet Editor' />
      <div className='flex-1 overflow-auto p-4 sm:p-6 flex flex-col'>
        {/* The reference's `.lib-top`: a heading with the count and the New
            button, then search — just stretched to full-page width instead
            of a 280px rail. */}
        <div className='flex items-center justify-between gap-3 mb-3'>
          <div className='flex items-center gap-2'>
            <h1 className='text-sm font-bold uppercase tracking-widest text-ink-muted'>
              Songs · {sheets.length}
            </h1>
            {offline && <OfflineBadge />}
          </div>
          <RadixButton onClick={handleCreateSheet}>
            <Plus className='w-4 h-4' />
            New
          </RadixButton>
        </div>

        {favoriteError && (
          <p className='mb-3 text-sm font-medium text-danger'>{favoriteError}</p>
        )}
        <div className='mb-3 flex items-center gap-2'>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search by title or artist'
            aria-label='Search by title or artist'
            data-testid='library-search'
            className='max-w-xs'
          />
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
            aria-label={`Switch to ${density === "compact" ? "comfortable" : "compact"} density`}
            data-testid='library-density'
          >
            {density === "compact" ? "Compact" : "Comfortable"}
          </Button>
          <Select.Root value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
            <Select.Trigger aria-label='Sort songs' title='Favorites stay at the top either way' data-testid='library-sort' />
            <Select.Content container={portal}>
              <Select.Item value='alphabetical'>A–Z</Select.Item>
              <Select.Item value='recent'>Recently updated</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>

        {sheets.length === 0 ? (
          <div className='flex-1 flex flex-col items-center justify-center text-ink-muted'>
            <Music className='w-12 h-12 mb-3 opacity-40' />
            <p>No lead sheets yet. Create your first one!</p>
          </div>
        ) : (
          <div className={density === "compact" ? "space-y-1" : "space-y-2"}>
            {visibleSheets.map((sheet) => (
              <Bento
                key={sheet.id}
                size={density === "compact" ? "1" : "2"}
                variant='ghost'
                className={`${styles.libraryRow} group cursor-pointer flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${density === "compact" ? "py-1.5" : ""}`}
                onClick={() => goTo(router, `/lead-sheet-editor/${sheet.id}/preview`)}
              >
                <div className='flex flex-1 min-w-0 items-start gap-2'>
                  <IconButton
                    variant='ghost'
                    color={sheet.metadata?.favorite ? undefined : "gray"}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(sheet); }}
                    title={sheet.metadata?.favorite ? "Remove from favorites" : "Keep this song at the top"}
                    aria-label={sheet.metadata?.favorite ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={!!sheet.metadata?.favorite}
                    className='shrink-0'
                  >
                    <Star className='w-5 h-5' fill={sheet.metadata?.favorite ? "currentColor" : "none"} />
                  </IconButton>
                  <div className='min-w-0'>
                    <div className='font-semibold text-ink-primary'>
                      {sheet.title || "Untitled"}
                    </div>
                    <SongAttribution song={sheet} />
                    <div className='text-sm text-ink-muted flex flex-wrap gap-3 mt-0.5'>
                      {sheet.key && <span>Key: {sheet.key}</span>}
                      {sheet.artist && <span>{sheet.artist}</span>}
                      {sheet.tempo && <span>{sheet.tempo} BPM</span>}
                      <span>{sheet.sections?.length ?? 0} sections</span>
                      <span>{new Date(sheet.updated_at).toLocaleDateString()}</span>
                      {/* Redundant once the whole page is already showing the cached
                          list — every row visible then is, by definition, cached. */}
                      {!offline && cachedIds.has(sheet.id) && (
                        <span className='inline-flex items-center gap-1 text-ink-muted'>
                          <Download className='w-3.5 h-3.5' />
                          Offline ready
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className='flex flex-wrap items-center gap-1.5 md:ml-3 shrink-0'>
                  <RadixButton size='1' variant='surface' color='gray' onClick={(e) => { e.stopPropagation(); handleCopyText(sheet); }}>
                    {copiedId === sheet.id ? <Check className='w-3.5 h-3.5' /> : <Copy className='w-3.5 h-3.5' />}
                    {copiedId === sheet.id ? "Copied!" : "Copy Text"}
                  </RadixButton>
                  {/* Share opens a private song up to unlisted on its own; the
                      picker here is for dialing visibility back down or up to public. */}
                  <span onClick={(e) => e.stopPropagation()}>
                    <VisibilityPicker
                      value={sheet.visibility ?? "private"}
                      onChange={(next) => void setVisibility(sheet, next)}
                    />
                  </span>
                  <RadixButton size='1' variant='surface' color='gray' onClick={(e) => { e.stopPropagation(); handleShare(sheet); }}>
                    {sharedId === sheet.id ? <Check className='w-3.5 h-3.5' /> : <Link2 className='w-3.5 h-3.5' />}
                    {sharedId === sheet.id ? "Copied!" : "Share"}
                  </RadixButton>
                  <RadixButton
                    size='1'
                    variant='surface'
                    color='gray'
                    onClick={(e) => { e.stopPropagation(); goTo(router, `/lead-sheet-editor/${sheet.id}/edit`); }}
                  >
                    <Pencil className='w-3.5 h-3.5' />
                    Edit
                  </RadixButton>
                  <RadixButton size='1' onClick={(e) => { e.stopPropagation(); goTo(router, `/lead-sheet-editor/${sheet.id}/preview`); }}>
                    <Eye className='w-3.5 h-3.5' />
                    Preview
                  </RadixButton>
                  <IconButton
                    size='1'
                    variant='ghost'
                    color='red'
                    aria-label={`Delete ${sheet.title || "this song"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${sheet.title}"?`)) deleteSheet(sheet.id);
                    }}
                    className='ml-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100'
                  >
                    <Trash2 className='w-4 h-4' />
                  </IconButton>
                </div>
              </Bento>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
