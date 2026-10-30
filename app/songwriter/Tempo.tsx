"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { IconButton, TextField } from "@radix-ui/themes";
import { ControlRow } from "./SidebarRows";

export const MIN_BPM = 30;
export const MAX_BPM = 240;
export const DEFAULT_BPM = 90;

export function clampBpm(value: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
}

// ─── Sidebar control ──────────────────────────────────────────────────────────

export function TempoControl({ bpm, onBpmChange }: { bpm: number; onBpmChange: (next: number) => void }) {
  // Held locally so the field can be empty mid-edit without snapping back.
  const [draft, setDraft] = useState<string | null>(null);

  // On the sidebar's shared grid, so tempo lines up with the steppers above
  // it instead of wrapping into a row of its own shape.
  return (
    <ControlRow label='Tempo'>
      <IconButton
        type='button'
        size='3'
        variant='soft'
        color='gray'
        onClick={() => onBpmChange(bpm - 1)}
        disabled={bpm <= MIN_BPM}
        aria-label='Decrease tempo'
      >
        <Minus className='w-4 h-4' />
      </IconButton>
      <TextField.Root
        type='number'
        inputMode='numeric'
        min={MIN_BPM}
        max={MAX_BPM}
        value={draft ?? bpm}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseInt(e.target.value, 10);
          if (!isNaN(parsed) && parsed >= MIN_BPM && parsed <= MAX_BPM) onBpmChange(parsed);
        }}
        onBlur={() => setDraft(null)}
        aria-label='Beats per minute'
        size='3'
        className='w-full [&_input]:text-center [&_input]:tabular-nums'
      />
      <IconButton
        type='button'
        size='3'
        variant='soft'
        color='gray'
        onClick={() => onBpmChange(bpm + 1)}
        disabled={bpm >= MAX_BPM}
        aria-label='Increase tempo'
      >
        <Plus className='w-4 h-4' />
      </IconButton>
    </ControlRow>
  );
}
