"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import Link from "next/link";
import { Plus, Trash2, ListMusic, ArrowLeft, Check, X } from "lucide-react";

interface Setlist {
  id: string;
  name: string;
  created_at: string;
  setlist_songs: { count: number }[];
}

export default function SetlistList() {
  const { user, loading: authLoading } = useAuth();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const router = useRouter();

  const getSb = () => createClient()!;

  useEffect(() => {
    if (user) loadSetlists();
  }, [user]);

  async function loadSetlists() {
    if (!user) return;
    const { data } = await getSb()
      .from("setlists")
      .select("*, setlist_songs(count)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSetlists(data ?? []);
  }

  async function createSetlist() {
    if (!user || !newName.trim()) return;
    const { data } = await getSb()
      .from("setlists")
      .insert({ user_id: user.id, name: newName.trim() })
      .select("*, setlist_songs(count)")
      .single();
    if (data) setSetlists((prev) => [data, ...prev]);
    setNewName("");
    setCreating(false);
  }

  async function deleteSetlist(id: string) {
    await getSb().from("setlists").delete().eq("id", id);
    setSetlists((prev) => prev.filter((s) => s.id !== id));
  }

  if (authLoading) {
    return (
      <div className='flex flex-col flex-1 min-h-0'>
        <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div
            className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900'
            style={{ border: "1px solid var(--border-color)" }}
          >
            <div className='flex-1 flex items-center justify-center text-[#373A40]/50 dark:text-white/50'>Loading...</div>
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
            className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900'
            style={{ border: "1px solid var(--border-color)" }}
          >
            <div className='border-b shrink-0' style={{ borderColor: "var(--border-color)" }}>
              <div className='px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5'>
                <h1 className='text-lg sm:text-xl font-bold leading-tight text-black dark:text-yellow-400'>
                  Setlists
                </h1>
              </div>
            </div>
            <div className='flex-1 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-center text-center'>
              <p className='text-[#373A40]/60 dark:text-white/60 mb-6'>Sign in to create and manage your setlists.</p>
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
          className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900'
          style={{ border: "1px solid var(--border-color)" }}
        >
          <div className='border-b shrink-0' style={{ borderColor: "var(--border-color)" }}>
            <div className='flex items-center justify-between px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5'>
              <div className='flex items-center gap-3'>
                <Link
                  href='/lead-sheet-editor'
                  className='flex items-center gap-2 text-[#373A40]/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors text-sm font-medium'
                >
                  <ArrowLeft className='w-4 h-4' />
                  All Sheets
                </Link>
                <h1 className='text-lg sm:text-xl font-bold leading-tight text-black dark:text-yellow-400'>
                  Setlists
                </h1>
              </div>
              {creating ? (
                <div className='flex items-center gap-1.5'>
                  <input
                    type='text'
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createSetlist();
                      if (e.key === "Escape") {
                        setCreating(false);
                        setNewName("");
                      }
                    }}
                    placeholder='Setlist name'
                    className='rounded border border-[#373A40]/30 dark:border-white/30 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white'
                  />
                  <button
                    onClick={createSetlist}
                    className='flex items-center gap-1.5 rounded bg-black px-3 py-2 text-sm font-medium text-yellow-400 hover:bg-black/80 transition-colors'
                  >
                    <Check className='w-4 h-4' />
                  </button>
                  <button
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                    }}
                    className='flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white transition-colors'
                  >
                    <X className='w-4 h-4' />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className='flex items-center gap-2 rounded bg-black px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-black/80 transition-colors'
                >
                  <Plus className='w-4 h-4' />
                  New Setlist
                </button>
              )}
            </div>
          </div>

          <div className='flex-1 overflow-auto p-4 sm:p-6 flex flex-col'>
            {setlists.length === 0 ? (
              <div className='flex-1 flex flex-col items-center justify-center text-[#373A40]/40 dark:text-white/40'>
                <ListMusic className='w-12 h-12 mb-3 opacity-40' />
                <p>No setlists yet. Create your first one!</p>
              </div>
            ) : (
              <div className='space-y-2'>
                {setlists.map((setlist) => (
                  <div
                    key={setlist.id}
                    className='flex items-center justify-between p-4 border border-[#373A40]/20 dark:border-white/20 rounded-lg hover:border-black dark:hover:border-white transition-colors group cursor-pointer'
                    onClick={() => router.push(`/lead-sheet-editor/setlists/${setlist.id}`)}
                  >
                    <div className='flex-1 min-w-0'>
                      <div className='font-semibold text-black dark:text-white'>
                        {setlist.name}
                      </div>
                      <div className='text-sm text-[#373A40]/50 dark:text-white/50 flex flex-wrap gap-3 mt-0.5'>
                        <span>{setlist.setlist_songs?.[0]?.count ?? 0} songs</span>
                        <span>{new Date(setlist.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className='flex items-center gap-1.5 ml-3 shrink-0'>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${setlist.name}"?`)) deleteSetlist(setlist.id);
                        }}
                        className='opacity-0 group-hover:opacity-100 p-1.5 text-[#373A40]/40 dark:text-white/40 hover:text-red-500 transition-all ml-1'
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
