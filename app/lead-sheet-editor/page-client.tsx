"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import Link from "next/link";
import { Plus, Trash2, Music, Eye, Pencil, Copy, Check, Link2, Star } from "lucide-react";
import type { LeadSheet } from "./shared";
import { makeSection, getPlainText, OfflineBadge } from "./shared";
import BentoPageLayout from "@/app/components/BentoPageLayout";
import { cacheSheet, cacheSheetList, getCachedSheetList } from "./offlineCache";
import { useCommands } from "@/app/components/ui/command-palette";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Bento } from "@/app/components/ui/bento";
import { Button as RadixButton, IconButton, Select } from "@radix-ui/themes";
import {
  loadDensity,
  loadSortOrder,
  saveDensity,
  saveSortOrder,
  searchLibrary,
  sortLibrary,
  type Density,
  type SortOrder,
} from "./library";
import { VisibilityPicker } from "./VisibilityPicker";
import { SongAttribution } from "./SongAttribution";
import type { Visibility } from "./sharing";

export default function LeadSheetList() {
  const { user, loading: authLoading } = useAuth();
  const [sheets, setSheets] = useState<LeadSheet[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Read once on mount rather than during render, so the server and the first
  // client render agree and hydration does not complain.
  const [density, setDensityState] = useState<Density>("comfortable");
  const [sortOrder, setSortOrderState] = useState<SortOrder>("alphabetical");
  useEffect(() => {
    setDensityState(loadDensity());
    setSortOrderState(loadSortOrder());
  }, []);
  const setDensity = (next: Density) => {
    setDensityState(next);
    saveDensity(next);
  };
  const setSortOrder = (next: SortOrder) => {
    setSortOrderState(next);
    saveSortOrder(next);
  };
  const router = useRouter();

  // By name or by when it was last touched, whichever the picker says — with
  // the starred ones held above either. The set being played this month sits
  // where a thumb lands, and everything else falls where the sort puts it.
  const sortedSheets = useMemo(() => sortLibrary(sheets, sortOrder), [sheets, sortOrder]);

  const getSb = () => createClient()!;

  useEffect(() => {
    if (user) loadSheets();
  }, [user]);

  async function loadSheets() {
    if (!user) return;
    try {
      const { data, error } = await getSb()
        .from("lead_sheets")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setSheets(data ?? []);
      setOffline(false);
      await cacheSheetList(data ?? []);
    } catch {
      const cached = await getCachedSheetList();
      setSheets(cached ?? []);
      setOffline(true);
    }
  }

  async function createSheet() {
    if (!user) return;
    const { data } = await getSb()
      .from("lead_sheets")
      .insert({
        user_id: user.id,
        title: "Untitled",
        key: "",
        tempo: null,
        general_notes: "",
        sections: [makeSection("verse")],
      })
      .select()
      .single();
    if (data) router.push(`/lead-sheet-editor/${data.id}/edit`);
  }

  const visibleSheets = useMemo(() => searchLibrary(sortedSheets, query), [sortedSheets, query]);

  // Every song by name, plus the one thing you do when none of them is what
  // you wanted. Rebuilt when the library changes; `run` reads nothing that is
  // not in the dependency list.
  const commands = useMemo(
    () => [
      {
        id: "song:new",
        label: "Create song",
        group: "Library",
        keywords: "new add write",
        run: (): void => void createSheet(),
      },
      ...sortedSheets.map((sheet) => ({
        id: `song:${sheet.id}`,
        label: sheet.title || "Untitled",
        group: "Songs",
        hint: [sheet.key, sheet.tempo ? `${sheet.tempo} bpm` : null].filter(Boolean).join("  "),
        run: (): void => void router.push(`/lead-sheet-editor/${sheet.id}/preview`),
      })),
    ],
    // createSheet closes over `user` and `router`, both of which are listed.
    [sortedSheets, router, user] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useCommands("library", commands);

  /**
   * Who can see a song. Written straight through rather than optimistically:
   * getting this wrong in the permissive direction is not recoverable, so the
   * control should reflect the database rather than an intention.
   */
  async function setVisibility(sheet: LeadSheet, visibility: Visibility) {
    const { error } = await getSb().from("lead_sheets").update({ visibility }).eq("id", sheet.id);
    if (error) {
      setFavoriteError("Could not change who can see that song.");
      return;
    }
    setSheets((current) => current.map((s) => (s.id === sheet.id ? { ...s, visibility } : s)));
  }

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

  /**
   * Star or unstar a song. The flag rides on the sheet's own metadata rather
   * than this device, so a set starred on a laptop is still starred on the
   * phone that gets played from. The row moves as soon as it's tapped and goes
   * back where it was if the write is refused.
   */
  async function toggleFavorite(sheet: LeadSheet) {
    const next = !sheet.metadata?.favorite;
    const metadata = { ...(sheet.metadata ?? {}), favorite: next };
    setFavoriteError(null);
    setSheets((prev) => prev.map((s) => (s.id === sheet.id ? { ...s, metadata } : s)));
    try {
      const { error } = await getSb().from("lead_sheets").update({ metadata }).eq("id", sheet.id);
      if (error) throw error;
      await cacheSheet({ ...sheet, metadata });
    } catch {
      setSheets((prev) => prev.map((s) => (s.id === sheet.id ? sheet : s)));
      setFavoriteError("Couldn't save that favorite — check your connection and try again.");
    }
  }

  async function deleteSheet(id: string) {
    await getSb().from("lead_sheets").delete().eq("id", id);
    setSheets((prev) => prev.filter((s) => s.id !== id));
  }

  if (authLoading) {
    return (
      <BentoPageLayout title='Lead Sheet Editor'>
        <div className='flex-1 flex items-center justify-center text-ink-muted'>Loading...</div>
      </BentoPageLayout>
    );
  }

  if (!user) {
    return (
      <BentoPageLayout title='Lead Sheet Editor'>
        <div className='flex-1 flex flex-col items-center justify-center text-center'>
          <p className='text-ink-muted mb-6'>Sign in to create and manage your lead sheets.</p>
          <Link
            href='/login'
            className='inline-block rounded bg-surface-base px-6 py-2 text-sm font-medium text-primary-text'
          >
            Sign In
          </Link>
        </div>
      </BentoPageLayout>
    );
  }

  return (
    <BentoPageLayout
      title='Lead Sheet Editor'
      titleAdornment={offline && <OfflineBadge />}
      headerActions={
        <RadixButton onClick={createSheet}>
          <Plus className='w-4 h-4' />
          New Sheet
        </RadixButton>
      }
    >
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
        <Select.Content>
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
            className={`group cursor-pointer flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${density === "compact" ? "py-1.5" : ""}`}
            onClick={() => router.push(`/lead-sheet-editor/${sheet.id}/preview`)}
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
                onClick={(e) => { e.stopPropagation(); router.push(`/lead-sheet-editor/${sheet.id}/edit`); }}
              >
                <Pencil className='w-3.5 h-3.5' />
                Edit
              </RadixButton>
              <RadixButton size='1' onClick={(e) => { e.stopPropagation(); router.push(`/lead-sheet-editor/${sheet.id}/preview`); }}>
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
    </BentoPageLayout>
  );
}
