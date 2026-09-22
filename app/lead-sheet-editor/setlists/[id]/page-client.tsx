"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { ArrowUp, ArrowDown, Trash2, Plus, Play, X, Music } from "lucide-react";
import { Button, Dialog, Flex, IconButton, ScrollArea, Text } from "@radix-ui/themes";
import { Bento } from "@/app/components/ui/bento";
import BentoPageLayout from "@/app/components/BentoPageLayout";

const BREADCRUMBS = [
  { label: "Lead Sheets", href: "/lead-sheet-editor" },
  { label: "Setlists", href: "/lead-sheet-editor/setlists" },
];

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

    const sb = getSb();
    const [r1, r2] = await Promise.all([
      sb.from("setlist_songs").update({ position: index }).eq("id", reordered[index].id),
      sb.from("setlist_songs").update({ position: targetIndex }).eq("id", reordered[targetIndex].id),
    ]);
    if (r1.error || r2.error) {
      setSongs(songs);
      console.error("Failed to save order:", r1.error ?? r2.error);
    }
  }

  function startSet() {
    if (songs.length === 0) return;
    const ids = songs.map((s) => s.lead_sheet_id);
    router.push(`/lead-sheet-editor/${ids[0]}/preview?set=${ids.join(",")}&pos=0`);
  }

  if (authLoading || loading) {
    return (
      <BentoPageLayout title='Setlist' breadcrumbs={BREADCRUMBS}>
        <div className='flex-1 flex items-center justify-center text-ink-muted'>Loading...</div>
      </BentoPageLayout>
    );
  }

  if (!user || name === null) {
    return (
      <BentoPageLayout title='Setlist' breadcrumbs={BREADCRUMBS}>
        <div className='flex-1 flex items-center justify-center text-ink-muted'>Setlist not found.</div>
      </BentoPageLayout>
    );
  }

  return (
    <>
      <BentoPageLayout
        title={name}
        breadcrumbs={BREADCRUMBS}
        headerActions={
          <>
            <Button variant='surface' color='gray' onClick={openPicker}>
              <Plus className='w-4 h-4' />
              Add Song
            </Button>
            <Button onClick={startSet} disabled={songs.length === 0}>
              <Play className='w-4 h-4' />
              Start Set
            </Button>
          </>
        }
      >
        {songs.length === 0 ? (
          <div className='flex-1 flex flex-col items-center justify-center text-ink-muted'>
            <Music className='w-12 h-12 mb-3 opacity-40' />
            <p>No songs yet. Add one to get started!</p>
          </div>
        ) : (
          <div className='space-y-2'>
            {songs.map((song, index) => (
              <Bento key={song.id} className='flex items-center justify-between'>
                <div className='flex items-center gap-3 min-w-0'>
                  <span className='text-sm font-mono text-ink-muted w-6 text-right shrink-0'>{index + 1}</span>
                  <div className='min-w-0'>
                    <div className='font-semibold truncate text-ink-primary'>
                      {song.lead_sheets?.title || "Untitled"}
                    </div>
                    <div className='text-sm text-ink-muted flex flex-wrap gap-3 mt-0.5'>
                      {song.lead_sheets?.key && <span>Key: {song.lead_sheets.key}</span>}
                      {song.lead_sheets?.tempo && <span>{song.lead_sheets.tempo} BPM</span>}
                    </div>
                  </div>
                </div>
                <div className='flex items-center gap-1.5 ml-3 shrink-0'>
                  <IconButton variant='ghost' color='gray' onClick={() => moveSong(index, -1)} disabled={index === 0} aria-label='Move up'>
                    <ArrowUp className='w-4 h-4' />
                  </IconButton>
                  <IconButton
                    variant='ghost'
                    color='gray'
                    onClick={() => moveSong(index, 1)}
                    disabled={index === songs.length - 1}
                    aria-label='Move down'
                  >
                    <ArrowDown className='w-4 h-4' />
                  </IconButton>
                  <IconButton variant='ghost' color='red' onClick={() => removeSong(song.id)} aria-label='Remove song' className='ml-1'>
                    <Trash2 className='w-4 h-4' />
                  </IconButton>
                </div>
              </Bento>
            ))}
          </div>
        )}
      </BentoPageLayout>

      <Dialog.Root open={showPicker} onOpenChange={setShowPicker}>
        <Dialog.Content maxWidth='28rem' aria-describedby={undefined} className='flex max-h-[80vh] flex-col overflow-hidden p-0'>
          <Flex align='center' justify='between' className='border-b border-line-subtle px-4 py-3'>
            <Dialog.Title size='4' mb='0'>
              Add Song
            </Dialog.Title>
            <Dialog.Close>
              <IconButton variant='ghost' color='gray' aria-label='Close'>
                <X className='w-4 h-4' />
              </IconButton>
            </Dialog.Close>
          </Flex>
          <ScrollArea type='auto' scrollbars='vertical' className='flex-1'>
            <div className='p-2'>
              {available.length === 0 ? (
                <Text as='p' align='center' color='gray' className='p-6'>
                  All your lead sheets are already in this set.
                </Text>
              ) : (
                available.map((sheet) => (
                  <button
                    key={sheet.id}
                    onClick={() => addSong(sheet.id)}
                    className='w-full flex items-center justify-between text-left p-3 rounded-lg hover:bg-surface-raised transition-colors'
                  >
                    <div className='min-w-0'>
                      <div className='font-semibold truncate text-ink-primary'>
                        {sheet.title || "Untitled"}
                      </div>
                      <div className='text-sm text-ink-muted flex flex-wrap gap-3 mt-0.5'>
                        {sheet.key && <span>Key: {sheet.key}</span>}
                        {sheet.tempo && <span>{sheet.tempo} BPM</span>}
                      </div>
                    </div>
                    <Plus className='w-4 h-4 text-ink-muted shrink-0' />
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}
