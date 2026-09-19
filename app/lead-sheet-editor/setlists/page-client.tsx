"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import Link from "next/link";
import { Plus, Trash2, ListMusic, ArrowLeft, Check, X } from "lucide-react";
import { Button, IconButton, TextField } from "@radix-ui/themes";
import { Bento } from "@/app/components/ui/bento";

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
            className='flex flex-col flex-1 min-h-0 rounded-none border-none bg-surface-base overflow-hidden'
          >
            <div className='flex-1 flex items-center justify-center text-ink-muted'>Loading...</div>
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
            className='flex flex-col flex-1 min-h-0 rounded-none border-none bg-surface-base overflow-hidden'
          >
            <div className='shrink-0'>
              <div className='px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5'>
                <h1 className='text-lg sm:text-xl font-bold leading-tight text-primary-text'>
                  Setlists
                </h1>
              </div>
            </div>
            <div className='flex-1 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-center text-center'>
              <p className='text-ink-muted mb-6'>Sign in to create and manage your setlists.</p>
              <Link
                href='/login'
                className='inline-block rounded bg-surface-base px-6 py-2 text-sm font-medium text-primary-text'
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
          className='flex flex-col flex-1 min-h-0 rounded-none border-none bg-surface-base overflow-hidden'
        >
          <div className='shrink-0'>
            <div className='flex items-center justify-between px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5'>
              <div className='flex items-center gap-3'>
                <Link
                  href='/lead-sheet-editor'
                  className='flex items-center gap-2 text-ink-muted hover:text-ink-primary transition-colors text-sm font-medium'
                >
                  <ArrowLeft className='w-4 h-4' />
                  All Sheets
                </Link>
                <h1 className='text-lg sm:text-xl font-bold leading-tight text-primary-text'>
                  Setlists
                </h1>
              </div>
              {creating ? (
                <div className='flex items-center gap-1.5'>
                  <TextField.Root
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
                    aria-label='Setlist name'
                  />
                  <IconButton onClick={createSetlist} aria-label='Create setlist'>
                    <Check className='w-4 h-4' />
                  </IconButton>
                  <IconButton
                    variant='surface'
                    color='gray'
                    aria-label='Cancel'
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                    }}
                  >
                    <X className='w-4 h-4' />
                  </IconButton>
                </div>
              ) : (
                <Button onClick={() => setCreating(true)}>
                  <Plus className='w-4 h-4' />
                  New Setlist
                </Button>
              )}
            </div>
          </div>

          <div className='flex-1 overflow-auto p-4 sm:p-6 flex flex-col'>
            {setlists.length === 0 ? (
              <div className='flex-1 flex flex-col items-center justify-center text-ink-muted'>
                <ListMusic className='w-12 h-12 mb-3 opacity-40' />
                <p>No setlists yet. Create your first one!</p>
              </div>
            ) : (
              <div className='space-y-2'>
                {setlists.map((setlist) => (
                  <Bento
                    key={setlist.id}
                    className='group flex cursor-pointer items-center justify-between'
                    onClick={() => router.push(`/lead-sheet-editor/setlists/${setlist.id}`)}
                  >
                    <div className='flex-1 min-w-0'>
                      <div className='font-semibold text-ink-primary'>
                        {setlist.name}
                      </div>
                      <div className='text-sm text-ink-muted flex flex-wrap gap-3 mt-0.5'>
                        <span>{setlist.setlist_songs?.[0]?.count ?? 0} songs</span>
                        <span>{new Date(setlist.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className='flex items-center gap-1.5 ml-3 shrink-0'>
                      <IconButton
                        variant='ghost'
                        color='red'
                        aria-label={`Delete ${setlist.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${setlist.name}"?`)) deleteSetlist(setlist.id);
                        }}
                        className='ml-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
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
      </main>
    </div>
  );
}
