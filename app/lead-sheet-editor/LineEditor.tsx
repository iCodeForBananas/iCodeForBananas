"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { ChordLyricLine } from "./shared";

/** Which line of the song was tapped, and what it says right now. */
export interface LineTarget {
  sectionIndex: number;
  lineIndex: number;
  /** The part the line belongs to — "Chorus", "Verse 2" — for the header. */
  sectionLabel: string;
  /** The line exactly as stored: chord brackets, cue tags and @0:12 markers included. */
  text: string;
}

/**
 * One line of the song, on its own, in a sheet that opens straight into the
 * keyboard. Tap a lyric, fix the word, save — the whole point is that it takes
 * one gesture each on a phone, so the buttons are thumb-sized and the sheet
 * rides above the on-screen keyboard.
 *
 * It edits the line as *stored*, not as displayed: brackets, cue tags and time
 * markers all come through untouched unless they're typed over.
 */
export default function LineEditor({
  target,
  transposeSteps = 0,
  saving = false,
  error = null,
  onSave,
  onCancel,
}: {
  target: LineTarget;
  /** Non-zero means the page is showing a different key than the one being edited. */
  transposeSteps?: number;
  saving?: boolean;
  error?: string | null;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(target.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Open with the caret at the end of the line, keyboard already up.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // On a phone the keyboard covers the bottom of the window, which is exactly
  // where the sheet sits. visualViewport says how much is covered; padding the
  // overlay by that much keeps Save in reach instead of under the keys.
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const save = () => {
    if (saving) return;
    onSave(text);
  };

  return (
    <div
      className='fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center print:hidden'
      style={{ paddingBottom: keyboardInset }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-label='Edit line'
        className='w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl border-t sm:border border-gray-200 dark:border-neutral-700'
      >
        <div className='flex items-center justify-between gap-2 px-4 pt-3 pb-2'>
          <div className='flex items-center gap-2 min-w-0'>
            <span
              className='text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded shrink-0'
              style={{ background: "#facc15", color: "#000" }}
            >
              {target.sectionLabel}
            </span>
            <span className='text-xs text-gray-500 dark:text-neutral-400 truncate'>
              Line {target.lineIndex + 1}
            </span>
          </div>
          <button
            type='button'
            onClick={onCancel}
            aria-label='Close without saving'
            className='h-9 w-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors duration-150'
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        <div className='px-4 pb-4'>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\n/g, ""))}
            onKeyDown={(e) => {
              // One line in, one line out — Enter is Save, not a new line.
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            rows={2}
            spellCheck
            autoCapitalize='sentences'
            className='w-full resize-none rounded-xl border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 font-mono text-[16px] leading-relaxed text-black dark:text-white outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40'
          />

          <div className='mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 px-3 py-2'>
            <div className='text-[0.65rem] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500 mb-1'>
              Preview
            </div>
            <ChordLyricLine line={text} />
          </div>

          {transposeSteps !== 0 && (
            <p className='mt-2 text-xs text-amber-600 dark:text-amber-400'>
              The page is transposed {transposeSteps > 0 ? `+${transposeSteps}` : transposeSteps}.
              This edits the song&apos;s written key.
            </p>
          )}

          {error && <p className='mt-2 text-xs font-medium text-red-600 dark:text-red-400'>{error}</p>}

          <div className='mt-4 flex gap-2'>
            <button
              type='button'
              onClick={onCancel}
              className='h-12 flex-1 rounded-xl text-sm font-medium bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 transition-colors duration-150'
            >
              Cancel
            </button>
            <button
              type='button'
              onClick={save}
              disabled={saving}
              className='h-12 flex-[2] flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold bg-black hover:bg-black/80 text-yellow-400 dark:bg-yellow-400 dark:text-black dark:hover:bg-yellow-300 transition-colors duration-150 disabled:opacity-60'
            >
              <Check className='w-4 h-4' />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* Home-indicator gap on phones, nothing on anything else. */}
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </div>
    </div>
  );
}
