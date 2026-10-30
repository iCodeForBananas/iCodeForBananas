"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import type { LeadSheet } from "./shared";
import { makeSection } from "./shared";
import { cacheSheet, cacheSheetList, getCachedSheetList, getCachedSheetIds } from "./offlineCache";
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
import type { Visibility } from "./sharing";

/**
 * The song library's data and the actions that mutate it — one place, so the
 * full-page library route and the reference's inline library drawer read and
 * write the exact same way and can never drift apart. Each caller gets its
 * own fetch on mount (the two surfaces are never mounted at once — different
 * routes, and the drawer only exists on a page a route change already
 * unmounts), so this is "one implementation" rather than "one live store",
 * which is what keeping them from drifting actually requires here.
 */
export function useLeadSheetLibrary() {
  const { user, loading: authLoading } = useAuth();
  const [sheets, setSheets] = useState<LeadSheet[]>([]);
  const [offline, setOffline] = useState(false);
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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

  const getSb = () => createClient()!;

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
      setCachedIds(await getCachedSheetIds());
    } catch {
      const cached = await getCachedSheetList();
      setSheets(cached ?? []);
      setOffline(true);
      setCachedIds(await getCachedSheetIds());
    }
  }

  useEffect(() => {
    if (user) loadSheets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function createSheet(): Promise<string | null> {
    if (!user) return null;
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
    return data?.id ?? null;
  }

  async function setVisibility(sheet: LeadSheet, visibility: Visibility) {
    const { error } = await getSb().from("lead_sheets").update({ visibility }).eq("id", sheet.id);
    if (error) {
      setFavoriteError("Could not change who can see that song.");
      return;
    }
    setSheets((current) => current.map((s) => (s.id === sheet.id ? { ...s, visibility } : s)));
  }

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

  const sortedSheets = useMemo(() => sortLibrary(sheets, sortOrder), [sheets, sortOrder]);
  const visibleSheets = useMemo(() => searchLibrary(sortedSheets, query), [sortedSheets, query]);

  return {
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
    loadSheets,
    createSheet,
    setVisibility,
    toggleFavorite,
    deleteSheet,
  };
}
