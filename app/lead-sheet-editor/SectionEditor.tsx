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
      className='fixed inset-0 z-[60] flex items-end justify-center bg-surface-sunken/50 sm:items-center print:hidden'
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-label={editing ? "Rename section" : "New section"}
        className='w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-surface-base shadow-2xl border-t sm:border border-line-subtle'
      >
        <div className='flex items-center justify-between gap-2 px-4 pt-3 pb-2'>
          <span className='text-sm font-semibold text-ink-primary'>
            {editing ? "Section name" : `New section${afterLabel ? ` after ${afterLabel}` : ""}`}
          </span>
          <button
            type='button'
            onClick={onCancel}
            aria-label='Close without saving'
            className='h-9 w-9 flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-raised transition-colors duration-150'
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
                    ? "bg-primary-solid text-ink-on-primary"
                    : "bg-surface-raised text-ink-primary hover:bg-surface-overlay bg-surface-raised text-ink-primary hover:bg-surface-overlay"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <label className='mt-3 block text-[0.65rem] font-medium uppercase tracking-wide text-ink-muted'>
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
            className='mt-1 w-full rounded-xl border border-line-subtle bg-surface-base bg-surface-sunken px-3 py-2.5 text-[16px] text-ink-primary outline-none focus:border-primary-solid focus:ring-2 focus:ring-focus/40'
          />

          <div className='mt-3 rounded-xl bg-surface-raised bg-surface-raised px-3 py-2'>
            <div className='text-[0.65rem] font-medium uppercase tracking-wide text-ink-muted mb-1'>
              Preview
            </div>
            <span
              className='inline-block text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded'
              style={{ background: "var(--ds-color-primary-solid)", color: "var(--ds-color-text-on-primary)" }}
            >
              {label.trim() || suggested}
            </span>
          </div>

          <div className='mt-4 flex gap-2'>
            <button
              type='button'
              onClick={onCancel}
              className='h-12 flex-1 rounded-xl text-sm font-medium bg-surface-raised hover:bg-surface-overlay text-ink-primary transition-colors duration-150'
            >
              Cancel
            </button>
            <button
              type='button'
              onClick={add}
              className='h-12 flex-[2] flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold bg-surface-base hover:bg-surface-sunken/80 text-primary-text bg-primary-solid dark:text-ink-on-primary hover:bg-primary-hover transition-colors duration-150'
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
