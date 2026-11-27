"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";

/**
 * One line of the song, edited where it sits on the sheet. No modal: the
 * input takes the line's place in edit mode, so nothing moves when it is
 * tapped and the keyboard comes up over the line you were reading.
 *
 * It edits the line as *stored*: brackets, cue tags and @0:12 markers come
 * through untouched unless they're typed over.
 *
 * - Leaving the input (blur) saves it, if it changed.
 * - Enter saves it and opens a new line underneath, so a verse gets typed in
 *   one go.
 * - Escape puts the text back the way it was.
 * - The bin on the right deletes the line outright.
 *
 * The parent keys each instance by the stored text, so when a save lands the
 * input starts over from what the song now says.
 */
export default function InlineLineInput({
  value,
  label,
  autoFocus = false,
  onFocused,
  onCommit,
  onDelete,
}: {
  /** The line as stored. Empty for a blank line, or a new one not in the song yet. */
  value: string;
  /** Read out for the input and its delete button, e.g. "Chorus, line 3". */
  label: string;
  /** Takes focus (caret at the end) when it mounts. */
  autoFocus?: boolean;
  /** Called once focus has been taken, so the parent can stop asking. */
  onFocused?: () => void;
  /** `andAnother` asks for a fresh line underneath once this one is stored. */
  onCommit: (text: string, andAnother: boolean) => void;
  /**
   * Takes the line out. Given the text the song should hold there right now,
   * so the parent can refuse if a save that landed first already moved it.
   */
  onDelete: (expected: string) => void;
}) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // What was last handed to the parent, so the blur that follows an Enter
  // doesn't save the same text a second time.
  const committed = useRef(value);

  useEffect(() => {
    if (!autoFocus) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    onFocused?.();
    // Mount only: focusing again on a later render would steal the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = () => {
    // On a phone the tap on the bin can blur the input first, and a blur that
    // saved an emptied line has already deleted it.
    if (committed.current !== value && committed.current.trim() === "") return;
    onDelete(committed.current);
  };

  const commit = (andAnother: boolean) => {
    if (!andAnother && text === committed.current) return;
    committed.current = text;
    onCommit(text, andAnother);
  };

  return (
    <div className='flex min-w-0 flex-1 items-stretch gap-1'>
      <input
        ref={inputRef}
        type='text'
        value={text}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setText(committed.current);
            // Blur after the revert has rendered, so blur sees nothing to save.
            requestAnimationFrame(() => inputRef.current?.blur());
          }
        }}
        spellCheck
        autoCapitalize='sentences'
        autoComplete='off'
        enterKeyHint='next'
        // 16px floor: iOS zooms the page into any input set smaller than that.
        className='leadsheet-doc min-w-0 flex-1 rounded-md border border-line-subtle bg-surface-sunken px-3 py-2 text-[max(1em,16px)] leading-normal text-ink-primary outline-none focus:border-primary-solid focus:ring-2 focus:ring-focus/40'
      />
      <Button
        type='button'
        variant='ghost'
        size='icon-lg'
        // Pointer-down would blur the input first and save what's in it; the
        // delete should win, so keep focus where it is until the click lands.
        onMouseDown={(e) => e.preventDefault()}
        onClick={remove}
        aria-label={`Delete ${label}`}
        title='Delete this line'
        className='m-0 shrink-0 !h-auto self-stretch'
      >
        <Trash2 className='h-4 w-4' />
      </Button>
    </div>
  );
}
