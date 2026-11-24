"use client";

// Turn a deployment off, back on, or tear it down, from the leaderboard's
// deployment panel. The writes go through /api/strategy-deployments, which
// only trading operators can use; anyone else gets its error back here.
// Neither pausing nor deleting touches Tradier: a position it holds stays
// open there until it's closed there.

import { useState } from "react";
import { Callout } from "@radix-ui/themes";
import { Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { DeploymentConfig } from "@/app/lib/deploymentDetails";

export interface DeploymentControlsProps {
  id: string;
  label: string;
  /** undefined when it's no longer deployed. */
  config: DeploymentConfig | undefined;
  /** The new config after a pause or resume, null after a delete. */
  onChange: (id: string, config: DeploymentConfig | null) => void;
}

export function DeploymentControls({ id, label, config, onChange }: DeploymentControlsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function send(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(url, init).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { error?: string; details?: string[] }) : {};
    setBusy(false);
    if (!res?.ok) {
      setError([json.error ?? "That didn't work.", ...(json.details ?? [])].join(" "));
      return false;
    }
    return true;
  }

  async function setEnabled(enabled: boolean) {
    if (!config) return;
    const ok = await send("/api/strategy-deployments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    if (ok) onChange(id, { ...config, enabled });
  }

  async function remove() {
    const ok = await send(`/api/strategy-deployments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setConfirming(false);
    if (ok) onChange(id, null);
  }

  if (!config) {
    return <p className="text-sm text-ink-muted">Not deployed any more. Deploy it again from the Algo Back Tester.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        {config.enabled
          ? "Running. Disabling stops it trading from the next bar; enabling it again picks up where it left off."
          : "Disabled: the dispatcher skips it. Enable it to resume trading with its state intact."}{" "}
        Neither disabling nor deleting closes a position it holds in Tradier.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void setEnabled(!config.enabled)}>
          {config.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {config.enabled ? "Disable" : "Enable"}
        </Button>
        {confirming ? (
          <>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="size-3.5" />
              Delete {label} for good
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        )}
      </div>
      {error && (
        <Callout.Root color="red" size="1" role="alert">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
    </div>
  );
}
