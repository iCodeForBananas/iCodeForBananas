"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { SECTION_TYPES, nextSectionLabel, type Section, type SectionType } from "./shared";

/**
 * Naming a part of the song. Typing [Chorus] into a line does the same thing,
 * but only if you already know that — this is the door with a sign on it: pick
 * what kind of part it is, take the name it suggests or write your own.
 *
 * With `editing` it renames the part instead of adding one, which is what
 * tapping a section's badge in the preview's edit mode opens.
 */
export default function SectionEditor({
  sections,
  afterLabel,
  editing = null,
  onAdd,
  onCancel,
}: {
  /** The song as it stands, for numbering the suggested name. */
  sections: Section[];
  /** The section this one will follow, or null when the song has none yet. */
  afterLabel: string | null;
  /** The section being renamed. Null adds a new one instead. */
  editing?: Section | null;
  /** Takes the chosen type and name — a new section's, or the edited one's. */
  onAdd: (type: SectionType, label: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<SectionType>(editing?.type ?? "verse");
  const [label, setLabel] = useState(
    () => editing?.label || (editing ? editing.type : nextSectionLabel(sections, "verse"))
  );
  // Whether the name is still the suggestion, and so free to follow the type.
  // An existing name is already the section's own, so it never gets rewritten.
  const [named, setNamed] = useState(!!editing);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const pickType = (next: SectionType) => {
    setType(next);
    if (!named) setLabel(nextSectionLabel(sections, next));
  };

  const suggested = editing ? editing.label || editing.type : nextSectionLabel(sections, type);
  const add = () => onAdd(type, label.trim() || suggested);

  return (
    <div
      className='fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center print:hidden'
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-label={editing ? "Rename section" : "New section"}
        className='w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl border-t sm:border border-gray-200 dark:border-neutral-700'
      >
        <div className='flex items-center justify-between gap-2 px-4 pt-3 pb-2'>
          <span className='text-sm font-semibold text-black dark:text-white'>
            {editing ? "Section name" : `New section${afterLabel ? ` after ${afterLabel}` : ""}`}
          </span>
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
          <div className='flex flex-wrap gap-1.5'>
            {SECTION_TYPES.map((t) => (
              <button
                key={t}
                type='button'
                onClick={() => pickType(t)}
                aria-pressed={type === t}
                className={`h-10 rounded-lg px-3 text-sm font-medium capitalize transition-colors duration-150 ${
                  type === t
                    ? "bg-yellow-400 text-black"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <label className='mt-3 block text-[0.65rem] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500'>
            Name
          </label>
          <input
            value={label}
            onChange={(e) => {
              setNamed(true);
              setLabel(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={suggested}
            className='mt-1 w-full rounded-xl border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-[16px] text-black dark:text-white outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40'
          />

          <div className='mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 px-3 py-2'>
            <div className='text-[0.65rem] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500 mb-1'>
              Preview
            </div>
            <span
              className='inline-block text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded'
              style={{ background: "#facc15", color: "#000" }}
            >
              {label.trim() || suggested}
            </span>
          </div>

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
              onClick={add}
              className='h-12 flex-[2] flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold bg-black hover:bg-black/80 text-yellow-400 dark:bg-yellow-400 dark:text-black dark:hover:bg-yellow-300 transition-colors duration-150'
            >
              <Check className='w-4 h-4' />
              {editing ? "Save name" : "Add section"}
            </button>
          </div>
        </div>

        {/* Home-indicator gap on phones, nothing on anything else. */}
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </div>
    </div>
  );
}
