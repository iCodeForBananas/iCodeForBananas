"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { Button } from "@/app/components/ui/button";
import { Separator } from "@/app/components/ui/separator";
import { TextArea } from "@radix-ui/themes";
import { Bento } from "@/app/components/ui/bento";

interface Comment {
  id: string;
  user_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * Comments on a song. Not co-editing: everyone reads the same list and adds to
 * the end, and nothing here touches the song itself.
 */
export function SongComments({ songId }: { songId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async (): Promise<Comment[]> => {
    const sb = createClient();
    if (!sb) return [];
    const { data } = await sb
      .from("song_comments")
      .select("id, user_id, author_name, body, created_at")
      .eq("lead_sheet_id", songId)
      .order("created_at");
    return (data ?? []) as Comment[];
  }, [songId]);

  // The guard is not ceremony: moving between two songs quickly can land the
  // first song's reply after the second's, and without it the wrong comments
  // would be shown under the right song.
  useEffect(() => {
    let cancelled = false;
    void fetchComments().then((rows) => {
      if (!cancelled) setComments(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchComments]);

  async function post() {
    const body = draft.trim();
    if (!body || !user) return;
    setBusy(true);
    setError(null);
    const sb = createClient();
    const { error: writeError } = (await sb?.from("song_comments").insert({
      lead_sheet_id: songId,
      user_id: user.id,
      author_name: user.email?.split("@")[0] ?? null,
      body,
    })) ?? { error: null };
    setBusy(false);
    if (writeError) {
      setError("That did not save. Try again.");
      return;
    }
    setDraft("");
    setComments(await fetchComments());
  }

  return (
    <section className='mt-8' data-testid='comments'>
      <h2 className='mb-2 text-13 font-semibold text-ink-primary'>
        Comments{comments.length > 0 && ` (${comments.length})`}
      </h2>
      <Separator />

      <ul className='my-3 flex flex-col gap-3'>
        {comments.map((comment) => (
          <li key={comment.id}>
            <Bento size='1'>
              <p className='text-12 text-ink-muted'>
                {comment.author_name ?? "Someone"} · {when(comment.created_at)}
              </p>
              <p className='mt-1 whitespace-pre-wrap text-13 text-ink-primary'>{comment.body}</p>
            </Bento>
          </li>
        ))}
        {comments.length === 0 && <li className='text-13 text-ink-muted'>Nothing yet.</li>}
      </ul>

      {user ? (
        <div className='flex flex-col gap-2'>
          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={4000}
            resize='vertical'
            placeholder='Say something about this song'
            aria-label='Write a comment'
          />
          {error && <p className='text-12 text-danger'>{error}</p>}
          <div>
            <Button variant='primary' size='sm' onClick={post} disabled={busy || draft.trim() === ""}>
              {busy ? "Posting" : "Post"}
            </Button>
          </div>
        </div>
      ) : (
        <p className='text-13 text-ink-muted'>Sign in to leave a comment.</p>
      )}
    </section>
  );
}
