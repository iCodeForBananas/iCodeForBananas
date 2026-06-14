"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import Link from "next/link";
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Plus, Play, X, Music } from "lucide-react";

interface SetlistSong {
  id: string;
  lead_sheet_id: string;
  position: number;
  lead_sheets: {
    id: string;
    title: string;
    key: string;
    tempo: number | null;
  } | null;
}

interface LeadSheetOption {
  id: string;
  title: string;
  key: string;
  tempo: number | null;
}

export default function SetlistDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [songs, setSongs] = useState<SetlistSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [available, setAvailable] = useState<LeadSheetOption[]>([]);

  const getSb = () => createClient()!;

  useEffect(() => {
    if (user) loadSetlist();
  }, [user, id]);

  async function loadSetlist() {
    setLoading(true);
    const sb = getSb();
    const [{ data: setlist }, { data: setlistSongs }] = await Promise.all([
      sb.from("setlists").select("*").eq("id", id).single(),
      sb
        .from("setlist_songs")
        .select("*, lead_sheets(id, title, key, tempo)")
        .eq("setlist_id", id)
        .order("position", { ascending: true }),
    ]);
    setName(setlist?.name ?? null);
    setSongs(setlistSongs ?? []);
    setLoading(false);
  }

  async function openPicker() {
    if (!user) return;
    const { data } = await getSb()
      .from("lead_sheets")
      .select("id, title, key, tempo")
      .eq("user_id", user.id)
      .order("title", { ascending: true });
    const existingIds = new Set(songs.map((s) => s.lead_sheet_id));
    setAvailable((data ?? []).filter((sheet) => !existingIds.has(sheet.id)));
    setShowPicker(true);
  }

  async function addSong(leadSheetId: string) {
    const nextPosition = songs.length;
    const { data } = await getSb()
      .from("setlist_songs")
      .insert({ setlist_id: id, lead_sheet_id: leadSheetId, position: nextPosition })
      .select("*, lead_sheets(id, title, key, tempo)")
      .single();
    if (data) setSongs((prev) => [...prev, data]);
    setAvailable((prev) => prev.filter((sheet) => sheet.id !== leadSheetId));
  }

  async function removeSong(songId: string) {
    await getSb().from("setlist_songs").delete().eq("id", songId);
    setSongs((prev) => prev.filter((s) => s.id !== songId));
  }

  async function moveSong(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= songs.length) return;

    const reordered = [...songs];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setSongs(reordered);

    const a = reordered[index];
    const b = reordered[targetIndex];
    const sb = getSb();
    await Promise.all([
      sb.from("setlist_songs").update({ position: index }).eq("id", b.id),
      sb.from("setlist_songs").update({ position: targetIndex }).eq("id", a.id),
    ]);
    setSongs((prev) =>
      prev.map((s) => {
        if (s.id === a.id) return { ...s, position: targetIndex };
        if (s.id === b.id) return { ...s, position: index };
        return s;
      }),
    );
  }

  function startSet() {
    if (songs.length === 0) return;
    const ids = songs.map((s) => s.lead_sheet_id);
    router.push(`/lead-sheet-editor/${ids[0]}/preview?set=${ids.join(",")}&pos=0`);
  }

  if (authLoading || loading) {
    return (
      <div className='flex flex-col flex-1 min-h-0'>
        <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div
            className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden'
            style={{ background: "#fff", border: "1px solid var(--border-color)" }}
          >
            <div className='flex-1 flex items-center justify-center text-[#373A40]/50'>Loading...</div>
          </div>
        </main>
      </div>
    );
  }

  if (!user || name === null) {
    return (
      <div className='flex flex-col flex-1 min-h-0'>
        <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div
            className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden'
            style={{ background: "#fff", border: "1px solid var(--border-color)" }}
          >
            <div className='flex-1 flex items-center justify-center text-[#373A40]/50'>Setlist not found.</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className='flex flex-col flex-1 min-h-0'>
      <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
        <div
          className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden'
          style={{ background: "#fff", border: "1px solid var(--border-color)" }}
        >
          <div className='border-b shrink-0' style={{ borderColor: "var(--border-color)" }}>
            <div className='flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5'>
              <div className='flex items-center gap-3 min-w-0'>
                <Link
                  href='/lead-sheet-editor/setlists'
                  className='flex items-center gap-2 text-[#373A40]/50 hover:text-black transition-colors text-sm font-medium shrink-0'
                >
                  <ArrowLeft className='w-4 h-4' />
                  Setlists
                </Link>
                <h1 className='text-lg sm:text-xl font-bold leading-tight truncate' style={{ color: "#000" }}>
                  {name}
                </h1>
              </div>
              <div className='flex items-center gap-2 shrink-0'>
                <button
                  onClick={openPicker}
                  className='flex items-center gap-2 rounded border border-[#373A40]/30 px-4 py-2 text-sm font-medium hover:border-black transition-colors'
                >
                  <Plus className='w-4 h-4' />
                  Add Song
                </button>
                <button
                  onClick={startSet}
                  disabled={songs.length === 0}
                  className='flex items-center gap-2 rounded bg-black px-4 py-2 text-sm font-medium hover:bg-black/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed'
                  style={{ color: "#facc15" }}
                >
                  <Play className='w-4 h-4' />
                  Start Set
                </button>
              </div>
            </div>
          </div>

          <div className='flex-1 overflow-auto p-4 sm:p-6 flex flex-col'>
            {songs.length === 0 ? (
              <div className='flex-1 flex flex-col items-center justify-center text-[#373A40]/40'>
                <Music className='w-12 h-12 mb-3 opacity-40' />
                <p>No songs yet. Add one to get started!</p>
              </div>
            ) : (
              <div className='space-y-2'>
                {songs.map((song, index) => (
                  <div
                    key={song.id}
                    className='flex items-center justify-between p-4 border border-[#373A40]/20 rounded-lg'
                  >
                    <div className='flex items-center gap-3 min-w-0'>
                      <span className='text-sm font-mono text-[#373A40]/40 w-6 text-right shrink-0'>{index + 1}</span>
                      <div className='min-w-0'>
                        <div className='font-semibold truncate' style={{ color: "#000" }}>
                          {song.lead_sheets?.title || "Untitled"}
                        </div>
                        <div className='text-sm text-[#373A40]/50 flex flex-wrap gap-3 mt-0.5'>
                          {song.lead_sheets?.key && <span>Key: {song.lead_sheets.key}</span>}
                          {song.lead_sheets?.tempo && <span>{song.lead_sheets.tempo} BPM</span>}
                        </div>
                      </div>
                    </div>
                    <div className='flex items-center gap-1.5 ml-3 shrink-0'>
                      <button
                        onClick={() => moveSong(index, -1)}
                        disabled={index === 0}
                        className='p-1.5 text-[#373A40]/40 hover:text-black disabled:opacity-20 disabled:cursor-not-allowed transition-colors'
                        aria-label='Move up'
                      >
                        <ArrowUp className='w-4 h-4' />
                      </button>
                      <button
                        onClick={() => moveSong(index, 1)}
                        disabled={index === songs.length - 1}
                        className='p-1.5 text-[#373A40]/40 hover:text-black disabled:opacity-20 disabled:cursor-not-allowed transition-colors'
                        aria-label='Move down'
                      >
                        <ArrowDown className='w-4 h-4' />
                      </button>
                      <button
                        onClick={() => removeSong(song.id)}
                        className='p-1.5 text-[#373A40]/40 hover:text-red-500 transition-colors ml-1'
                        aria-label='Remove song'
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

      {showPicker && (
        <div
          className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'
          onClick={() => setShowPicker(false)}
        >
          <div
            className='rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden'
            style={{ background: "#fff", border: "1px solid var(--border-color)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-center justify-between border-b px-4 py-3' style={{ borderColor: "var(--border-color)" }}>
              <h2 className='font-bold' style={{ color: "#000" }}>
                Add Song
              </h2>
              <button
                onClick={() => setShowPicker(false)}
                className='p-1 text-[#373A40]/50 hover:text-black transition-colors'
                aria-label='Close'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
            <div className='flex-1 overflow-auto p-2'>
              {available.length === 0 ? (
                <div className='p-6 text-center text-[#373A40]/40'>All your lead sheets are already in this set.</div>
              ) : (
                available.map((sheet) => (
                  <button
                    key={sheet.id}
                    onClick={() => addSong(sheet.id)}
                    className='w-full flex items-center justify-between text-left p-3 rounded-lg hover:bg-black/5 transition-colors'
                  >
                    <div className='min-w-0'>
                      <div className='font-semibold truncate' style={{ color: "#000" }}>
                        {sheet.title || "Untitled"}
                      </div>
                      <div className='text-sm text-[#373A40]/50 flex flex-wrap gap-3 mt-0.5'>
                        {sheet.key && <span>Key: {sheet.key}</span>}
                        {sheet.tempo && <span>{sheet.tempo} BPM</span>}
                      </div>
                    </div>
                    <Plus className='w-4 h-4 text-[#373A40]/40 shrink-0' />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
