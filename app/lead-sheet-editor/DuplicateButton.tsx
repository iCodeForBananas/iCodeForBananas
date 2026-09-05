"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { Button } from "@/app/components/ui/button";
import { forkRow, isForkable, type ForkSource } from "./sharing";

/**
 * Copies a public song into your own library.
 *
 * One direction only. The copy records where it came from and says so on its
 * face; nothing flows back to the original, and nothing about the original
 * changes. See forkRow for what is and is not carried across.
 */
export function DuplicateButton({ song }: { song: ForkSource }) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unlisted means "shared with whoever has the link", which is not the same
  // as inviting the world to copy it.
  if (!isForkable(song.visibility ?? "private")) return null;

  async function duplicate() {
    if (!user) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    const sb = createClient();
    const { data, error: writeError } =
      (await sb?.from("lead_sheets").insert(forkRow(song, user.id)).select("id").single()) ?? {};
    setBusy(false);
    if (writeError || !data) {
      setError("That did not copy. Try again.");
      return;
    }
    router.push(`/lead-sheet-editor/${data.id}/edit`);
  }

  return (
    <div className='flex items-center gap-2'>
      <Button variant='secondary' size='sm' onClick={duplicate} disabled={busy} data-testid='duplicate'>
        <Copy className='size-3.5' />
        {busy ? "Copying" : "Duplicate to my library"}
      </Button>
      {error && <span className='text-12 text-danger'>{error}</span>}
    </div>
  );
}
