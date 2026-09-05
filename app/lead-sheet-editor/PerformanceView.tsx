"use client";

import { useCallback, useEffect, useRef } from "react";
import { Minus, Pause, Play, Plus, X } from "lucide-react";
import type { Song } from "@/app/lib/chordPro";
import type { View } from "@/app/lib/harmony";
import { Button } from "@/app/components/ui/button";
import { Kbd } from "@/app/components/ui/kbd";
import { cn } from "@/app/lib/utils";
import { ChordProSong } from "./ChordProSong";
import { useAutoscroll } from "./useAutoscroll";

/**
 * The song at playing distance: large type, a low-light surface, and as little
 * else on screen as the job allows. Everything is reachable from the keyboard,
 * because on stage a pointer is not.
 *
 * prefers-reduced-motion is not consulted for the scroll itself. That setting
 * is about motion a person did not ask for; someone who pressed play on an
 * autoscroll has asked for it, and honouring the preference here would break
 * the feature rather than soften it. The chrome around it still respects it.
 */
export function PerformanceView({
  song,
  songId,
  view,
  onExit,
}: {
  song: Song;
  songId: string;
  view?: View;
  onExit?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { running, speed, toggle, faster, slower } = useAutoscroll(scroller, content, songId);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Never steal a key from something being typed into.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;

      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowUp" || event.key === "+" || event.key === "=") {
        event.preventDefault();
        faster();
      } else if (event.key === "ArrowDown" || event.key === "-") {
        event.preventDefault();
        slower();
      } else if (event.key === "Escape" && onExit) {
        onExit();
      }
    },
    [toggle, faster, slower, onExit]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  return (
    <div className='fixed inset-0 z-40 flex flex-col bg-surface-sunken' data-testid='performance'>
      <div
        ref={scroller}
        data-testid='performance-scroller'
        className='flex-1 overflow-y-auto px-8 py-12'
      >
        {/* The fraction of a pixel the scroll offset cannot carry is applied
            here as a transform, which is why the content has its own wrapper. */}
        <div ref={content}>
          <ChordProSong song={song} view={view} large className='mx-auto max-w-3xl' />
          {/* Room to keep the last line off the floor of the screen. */}
          <div className='h-[40vh]' aria-hidden />
        </div>
      </div>

      <div
        className={cn(
          "flex items-center justify-center gap-2 border-t border-line-subtle",
          "bg-surface-base/80 px-4 py-2 backdrop-blur-sm"
        )}
      >
        <Button
          variant={running ? "primary" : "secondary"}
          size='icon'
          onClick={toggle}
          aria-label={running ? "Pause scrolling" : "Start scrolling"}
          data-testid='performance-toggle'
        >
          {running ? <Pause className='size-4' /> : <Play className='size-4' />}
        </Button>
        <Button variant='ghost' size='icon-sm' onClick={slower} aria-label='Scroll slower'>
          <Minus className='size-4' />
        </Button>
        <span
          data-testid='performance-speed'
          className='leadsheet-doc w-10 text-center text-12 text-ink-muted'
        >
          {speed}
        </span>
        <Button variant='ghost' size='icon-sm' onClick={faster} aria-label='Scroll faster'>
          <Plus className='size-4' />
        </Button>

        <span className='ml-4 hidden items-center gap-1 text-10 text-ink-muted sm:flex'>
          <Kbd>Space</Kbd> play <Kbd>↑</Kbd> <Kbd>↓</Kbd> speed
        </span>

        {onExit && (
          <Button variant='ghost' size='icon-sm' onClick={onExit} aria-label='Leave performance mode' className='ml-auto'>
            <X className='size-4' />
          </Button>
        )}
      </div>
    </div>
  );
}
