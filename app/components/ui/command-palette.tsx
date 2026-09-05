"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { cn } from "@/app/lib/utils";
import { Kbd } from "./kbd";

export interface Command {
  id: string;
  label: string;
  /** Heading the command is listed under. Groups appear in registration order. */
  group: string;
  /** Right-aligned secondary text: an artist, a current value, a shortcut. */
  hint?: string;
  /** Extra words that should match, but that are not worth showing. */
  keywords?: string;
  run: () => void;
}

interface CommandPaletteContext {
  register: (key: string, commands: Command[]) => () => void;
  setOpen: (open: boolean) => void;
}

const Ctx = createContext<CommandPaletteContext | null>(null);

export function useCommandPalette(): CommandPaletteContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  return ctx;
}

/**
 * Publish a set of commands for as long as the calling component is mounted.
 *
 * Memoize the array, as you would an effect dependency: it is re-registered
 * whenever its identity changes, so an array rebuilt every render would loop.
 * Memoizing is also what keeps a command's `run` closure current, so list the
 * state each `run` reads in the memo's dependencies, or write `run` with a
 * functional updater and depend on nothing.
 */
export function useCommands(key: string, commands: Command[]): void {
  const { register } = useCommandPalette();
  useEffect(() => register(key, commands), [key, register, commands]);
}

// ─── Matching ────────────────────────────────────────────────────────────────

/** Lower is better; null means no match. Substring, because it is predictable. */
function score(command: Command, query: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const label = command.label.toLowerCase();
  if (label.startsWith(q)) return 0;
  const inLabel = label.indexOf(q);
  if (inLabel !== -1) return 1 + inLabel;
  const rest = `${command.group} ${command.hint ?? ""} ${command.keywords ?? ""}`.toLowerCase();
  const inRest = rest.indexOf(q);
  return inRest === -1 ? null : 1000 + inRest;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [sources, setSources] = useState<ReadonlyMap<string, Command[]>>(new Map());
  const [open, setOpen] = useState(false);

  const register = useCallback((key: string, commands: Command[]) => {
    setSources((prev) => new Map(prev).set(key, commands));
    return () =>
      setSources((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen((wasOpen) => !wasOpen);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<CommandPaletteContext>(() => ({ register, setOpen }), [register]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} sources={sources} />
    </Ctx.Provider>
  );
}

// ─── Palette ─────────────────────────────────────────────────────────────────

function CommandPalette({
  open,
  onOpenChange,
  sources,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: ReadonlyMap<string, Command[]>;
}) {
  // Query and highlight are one piece of state because they always move
  // together: typing puts the highlight back at the top, and closing clears
  // both. Two useStates would need an effect to keep them in step.
  const [{ query, active }, setState] = useState({ query: "", active: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const matches = [...sources.values()]
    .flat()
    .map((command) => ({ command, rank: score(command, query) }))
    .filter((m): m is { command: Command; rank: number } => m.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((m) => m.command);

  const groups: { name: string; commands: Command[] }[] = [];
  for (const command of matches) {
    const group = groups.find((g) => g.name === command.group);
    if (group) group.commands.push(command);
    else groups.push({ name: command.group, commands: [command] });
  }
  const ordered = groups.flatMap((g) => g.commands);
  const activeCommand = ordered[Math.min(active, ordered.length - 1)];

  const setQuery = (next: string) => setState({ query: next, active: 0 });
  const setActive = (next: (current: number) => number) =>
    setState((s) => ({ ...s, active: next(s.active) }));

  /** Closing clears the palette, so the next Cmd-K starts from a blank field. */
  function handleOpenChange(next: boolean) {
    if (!next) setState({ query: "", active: 0 });
    onOpenChange(next);
  }

  // Keep the highlighted row on screen when it moves by keyboard.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, query]);

  function run(command: Command | undefined) {
    if (!command) return;
    handleOpenChange(false);
    command.run();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setActive((i) => (ordered.length ? (i + 1) % ordered.length : 0));
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActive((i) => (ordered.length ? (i - 1 + ordered.length) % ordered.length : 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(() => 0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(() => Math.max(0, ordered.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(activeCommand);
    }
  }

  return (
    <BaseDialog.Root open={open} onOpenChange={handleOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-surface-sunken/70 backdrop-blur-[2px]",
            "transition-opacity duration-180 ease-ui motion-reduce:transition-none",
            "data-starting-style:opacity-0 data-ending-style:opacity-0"
          )}
        />
        <BaseDialog.Popup
          // A palette sits high rather than centred: it is a thing you summon
          // over your work, not a decision that interrupts it.
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2",
            "overflow-hidden rounded-xl border border-line-subtle bg-surface-overlay",
            "text-ink-primary shadow-overlay outline-none",
            "transition-[opacity,transform] duration-240 ease-ui motion-reduce:transition-none",
            "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            "data-ending-style:scale-[0.98] data-ending-style:opacity-0"
          )}
        >
          <BaseDialog.Title className='sr-only'>Command palette</BaseDialog.Title>

          <div className='flex items-center gap-3 border-b border-line-subtle px-4'>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder='Search songs and commands'
              aria-label='Search songs and commands'
              role='combobox'
              aria-expanded
              aria-controls='command-palette-list'
              aria-activedescendant={activeCommand ? `command-${activeCommand.id}` : undefined}
              // The one control that keeps no ring of its own. Focus is not
              // hidden here, it is shown differently: the caret is in the
              // field, and the highlighted row below says what Enter will do.
              className={cn(
                "h-12 w-full bg-transparent text-15 text-ink-primary outline-none",
                "placeholder:text-ink-muted"
              )}
            />
            <Kbd>Esc</Kbd>
          </div>

          <div
            ref={listRef}
            id='command-palette-list'
            role='listbox'
            className='max-h-[min(24rem,60vh)] overflow-y-auto p-1'
          >
            {ordered.length === 0 && (
              <p className='px-3 py-6 text-center text-13 text-ink-muted'>Nothing matches that.</p>
            )}
            {groups.map((group) => (
              <div key={group.name} className='mb-1 last:mb-0'>
                <p className='px-3 pb-1 pt-2 text-10 font-semibold uppercase tracking-wide text-ink-muted'>
                  {group.name}
                </p>
                {group.commands.map((command) => {
                  const isActive = command.id === activeCommand?.id;
                  return (
                    <button
                      key={command.id}
                      id={`command-${command.id}`}
                      type='button'
                      role='option'
                      aria-selected={isActive}
                      data-active={isActive}
                      // Pointer down rather than click: the input keeps focus,
                      // so the palette does not flicker as it closes.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        run(command);
                      }}
                      onMouseMove={() => setActive(() => ordered.indexOf(command))}
                      className={cn(
                        "flex w-full items-center justify-between gap-4 rounded px-3 py-2 text-left text-13",
                        "outline-none transition-colors duration-120 ease-ui motion-reduce:transition-none",
                        isActive ? "bg-surface-raised text-ink-primary" : "text-ink-muted"
                      )}
                    >
                      <span className='truncate'>{command.label}</span>
                      {command.hint && (
                        <span className='shrink-0 text-12 text-ink-muted'>{command.hint}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
