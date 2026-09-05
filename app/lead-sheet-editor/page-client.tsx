"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import Link from "next/link";
import { Plus, Trash2, Music, Eye, Pencil, Copy, Check, Link2, ListMusic, Star } from "lucide-react";
import type { LeadSheet } from "./shared";
import { makeSection, getPlainText, OfflineBadge } from "./shared";
import { cacheSheet, cacheSheetList, getCachedSheetList } from "./offlineCache";
import { useCommands } from "@/app/components/ui/command-palette";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { loadDensity, saveDensity, searchLibrary, type Density } from "./library";
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
  useEffect(() => setDensityState(loadDensity()), []);
  const setDensity = (next: Density) => {
    setDensityState(next);
    saveDensity(next);
  };
  const router = useRouter();

  // Songs read alphabetically, with the starred ones held at the top — the set
  // being played this month sits where a thumb lands, and everything else stays
  // where its name says it should be.
  const sortedSheets = useMemo(
    () =>
      [...sheets].sort((a, b) => {
        const aFav = a.metadata?.favorite ? 0 : 1;
        const bFav = b.metadata?.favorite ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        return (a.title || "Untitled").localeCompare(b.title || "Untitled", undefined, {
          sensitivity: "base",
          numeric: true,
        });
      }),
    [sheets]
  );

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
        run: () => void createSheet(),
      },
      {
        id: "setlists",
        label: "Go to setlists",
        group: "Library",
        keywords: "set list gig show",
        run: () => router.push("/lead-sheet-editor/setlists"),
      },
      ...sortedSheets.map((sheet) => ({
        id: `song:${sheet.id}`,
        label: sheet.title || "Untitled",
        group: "Songs",
        hint: [sheet.key, sheet.tempo ? `${sheet.tempo} bpm` : null].filter(Boolean).join("  "),
        run: () => router.push(`/lead-sheet-editor/${sheet.id}/preview`),
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

  async function handleShare(id: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/lead-sheet-editor/share/${id}`);
    setSharedId(id);
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
      <div className='flex flex-col flex-1 min-h-0'>
        <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div
            className='flex flex-col flex-1 min-h-0 rounded-none border-none bg-black overflow-hidden'
          >
            <div className='flex-1 flex items-center justify-center text-white/50'>Loading...</div>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className='flex flex-col flex-1 min-h-0'>
        <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div
            className='flex flex-col flex-1 min-h-0 rounded-none border-none bg-black overflow-hidden'
          >
            <div className='shrink-0'>
              <div className='px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5'>
                <h1 className='text-lg sm:text-xl font-bold leading-tight text-yellow-400'>
                  Lead Sheet Editor
                </h1>
              </div>
            </div>
            <div className='flex-1 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-center text-center'>
              <p className='text-white/60 mb-6'>Sign in to create and manage your lead sheets.</p>
              <Link
                href='/login'
                className='inline-block rounded bg-black px-6 py-2 text-sm font-medium text-yellow-400'
              >
                Sign In
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className='flex flex-col flex-1 min-h-0'>
      <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
        <div
          className='flex flex-col flex-1 min-h-0 rounded-none border-none bg-black overflow-hidden'
        >
          <div className='shrink-0'>
            <div className='flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-6 sm:pb-5'>
              <div className='flex items-center gap-3'>
                <h1 className='text-lg sm:text-xl font-bold leading-tight text-yellow-400'>
                  Lead Sheet Editor
                </h1>
                {offline && <OfflineBadge />}
              </div>
              <div className='flex items-center gap-2'>
                <Link
                  href='/lead-sheet-editor/setlists'
                  className='flex items-center gap-2 rounded border border-white/30 px-4 py-2 text-sm font-medium text-white/80 hover:border-white transition-colors'
                >
                  <ListMusic className='w-4 h-4' />
                  Setlists
                </Link>
                <button
                  onClick={createSheet}
                  className='flex items-center gap-2 rounded bg-black px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-black/80 transition-colors'
                >
                  <Plus className='w-4 h-4' />
                  New Sheet
                </button>
              </div>
            </div>
          </div>

          <div className='flex-1 overflow-auto p-4 sm:p-6 flex flex-col'>
            {favoriteError && (
              <p className='mb-3 text-sm font-medium text-red-500'>{favoriteError}</p>
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
            </div>

            {sheets.length === 0 ? (
              <div className='flex-1 flex flex-col items-center justify-center text-[#373A40]/40 dark:text-white/40'>
                <Music className='w-12 h-12 mb-3 opacity-40' />
                <p>No lead sheets yet. Create your first one!</p>
              </div>
            ) : (
              <div className={density === "compact" ? "space-y-1" : "space-y-2"}>
                {visibleSheets.map((sheet) => (
                  <div
                    key={sheet.id}
                    className={`flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${density === "compact" ? "px-3 py-1.5" : "p-4"} border border-[#373A40]/20 dark:border-white/20 rounded-lg hover:border-black dark:hover:border-white transition-colors group cursor-pointer`}
                    onClick={() => router.push(`/lead-sheet-editor/${sheet.id}/preview`)}
                  >
                    <div className='flex flex-1 min-w-0 items-start gap-2'>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(sheet); }}
                        title={sheet.metadata?.favorite ? "Remove from favorites" : "Keep this song at the top"}
                        aria-label={sheet.metadata?.favorite ? "Remove from favorites" : "Add to favorites"}
                        aria-pressed={!!sheet.metadata?.favorite}
                        className={`-ml-1 shrink-0 rounded p-1 transition-colors ${
                          sheet.metadata?.favorite
                            ? "text-yellow-400 hover:text-yellow-300"
                            : "text-[#373A40]/30 dark:text-white/30 hover:text-yellow-400"
                        }`}
                      >
                        <Star className='w-5 h-5' fill={sheet.metadata?.favorite ? "currentColor" : "none"} />
                      </button>
                      <div className='min-w-0'>
                      <div className='font-semibold text-black dark:text-white'>
                        {sheet.title || "Untitled"}
                      </div>
                      <SongAttribution song={sheet} />
                      <div className='text-sm text-[#373A40]/50 dark:text-white/50 flex flex-wrap gap-3 mt-0.5'>
                        {sheet.key && <span>Key: {sheet.key}</span>}
                        {sheet.artist && <span>{sheet.artist}</span>}
                        {sheet.tempo && <span>{sheet.tempo} BPM</span>}
                        <span>{sheet.sections?.length ?? 0} sections</span>
                        <span>{new Date(sheet.updated_at).toLocaleDateString()}</span>
                      </div>
                      </div>
                    </div>
                    <div className='flex flex-wrap items-center gap-1.5 md:ml-3 shrink-0'>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyText(sheet); }}
                        className='flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-2 py-1 md:px-3 md:py-1.5 text-xs font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white transition-colors'
                      >
                        {copiedId === sheet.id ? <Check className='w-3.5 h-3.5' /> : <Copy className='w-3.5 h-3.5' />}
                        {copiedId === sheet.id ? "Copied!" : "Copy Text"}
                      </button>
                      {/* Copying a link is only half the job: a private song's
                          link opens for nobody, so the two sit together. */}
                      <span onClick={(e) => e.stopPropagation()}>
                        <VisibilityPicker
                          value={sheet.visibility ?? "private"}
                          onChange={(next) => void setVisibility(sheet, next)}
                        />
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleShare(sheet.id); }}
                        className='flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-2 py-1 md:px-3 md:py-1.5 text-xs font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white transition-colors'
                      >
                        {sharedId === sheet.id ? <Check className='w-3.5 h-3.5' /> : <Link2 className='w-3.5 h-3.5' />}
                        {sharedId === sheet.id ? "Copied!" : "Share"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/lead-sheet-editor/${sheet.id}/edit`); }}
                        className='flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-2 py-1 md:px-3 md:py-1.5 text-xs font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white transition-colors'
                      >
                        <Pencil className='w-3.5 h-3.5' />
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/lead-sheet-editor/${sheet.id}/preview`); }}
                        className='flex items-center gap-1.5 rounded bg-black px-2 py-1 md:px-3 md:py-1.5 text-xs font-medium text-yellow-400 hover:bg-black/80 transition-colors'
                      >
                        <Eye className='w-3.5 h-3.5' />
                        Preview
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${sheet.title}"?`)) deleteSheet(sheet.id);
                        }}
                        className='opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 text-[#373A40]/40 dark:text-white/40 hover:text-red-500 transition-all ml-1'
                      >
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
