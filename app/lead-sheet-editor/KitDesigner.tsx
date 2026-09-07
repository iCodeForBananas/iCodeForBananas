"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Play, RotateCcw, Square, Volume2, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import { ACCENT_GROUPS, auditionAccent } from "./accents";
import {
  CUSTOM_PATTERN,
  GRID_LANES,
  PATTERN_GROUPS,
  STEPS_PER_BAR,
  effectiveGrid,
  gridFromPattern,
  gridsEqual,
  type DrumGrid,
  type GridLane,
} from "./DrumMachine";
import {
  DRONE_KEY_GROUPS,
  DRONE_STYLES,
  SONG_KEY,
  droneKeyLabel,
  resolveDroneKey,
  type DroneStyle,
} from "./Drone";
import { useKitStep } from "./KitPlayer";
import {
  KIT_LAYERS,
  LAYER_LABELS,
  PRESET_GROUPS,
  applyPreset,
  hasLayer,
  matchesPreset,
  toggleLayer,
  type KitSettings,
} from "./kit";

/**
 * The whole backing track in one sheet.
 *
 * What used to be several separate rows down the sidebar, each with its own
 * toggle and its own popover, is one place here: pick a preset, or write the
 * beat on the grid. It plays the whole time it is open, through the page's
 * KitPlayer rather than one of its own, so closing it changes nothing about
 * what you hear.
 *
 * Edits land on the kit immediately. There is no draft copy and no cancel,
 * because everything in here is audible the moment it changes and hearing it is
 * the only way to know whether it is right — an OK button would mean choosing
 * before listening. Undo is the preset you started from, one click away.
 */
export default function KitDesigner({
  kit,
  onChange,
  bpm,
  onBpmChange,
  playing,
  onPlayingChange,
  onClose,
  songKey,
  transpose = 0,
}: {
  kit: KitSettings;
  onChange: (next: KitSettings) => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onClose: () => void;
  /** What the drone holds when it is set to follow the song. */
  songKey?: string | null;
  transpose?: number;
}) {
  const [tab, setTab] = useState<TabId>("presets");

  // Escape closes, the way every other sheet in the editor does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preset = kit.preset;
  const clean = matchesPreset(kit);

  return (
    <div
      className='fixed inset-0 z-50 flex items-end justify-center bg-surface-sunken/70 p-0 sm:items-center sm:p-4 print:hidden'
      onClick={onClose}
      role='presentation'
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-label='Kit designer'
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden",
          "rounded-t-2xl border border-line-subtle bg-surface-overlay shadow-overlay sm:rounded-2xl",
        )}
      >
        {/* ── Header: what this kit is, and whether you can hear it ─────────── */}
        <div className='flex shrink-0 items-center gap-3 border-b border-line-subtle px-4 py-3'>
          <Button
            variant={playing ? "primary" : "secondary"}
            size='icon'
            onClick={() => onPlayingChange(!playing)}
            aria-label={playing ? "Stop the kit" : "Play the kit"}
            title={playing ? "Stop the kit" : "Play the kit"}
          >
            {playing ? <Square className='h-4 w-4' /> : <Play className='h-4 w-4' />}
          </Button>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-15 font-medium text-ink-primary'>
              {preset ?? "Custom kit"}
              {preset && !clean && <span className='text-ink-muted'> · edited</span>}
            </p>
            <p className='truncate text-12 text-ink-muted'>
              {kit.layers.length === 0
                ? "Nothing switched on"
                : KIT_LAYERS.filter((l) => hasLayer(kit, l)).map((l) => LAYER_LABELS[l]).join(" · ")}
            </p>
          </div>
          <TempoField bpm={bpm} onChange={onBpmChange} />
          <Button variant='ghost' size='icon' onClick={onClose} aria-label='Close kit designer'>
            <X className='h-4 w-4' />
          </Button>
        </div>

        {/* ── Layers: the row of on/off switches everything else hangs off ──── */}
        <div className='flex shrink-0 flex-wrap gap-1.5 border-b border-line-subtle px-4 py-2.5'>
          {KIT_LAYERS.map((layer) => (
            <button
              key={layer}
              type='button'
              onClick={() => onChange(toggleLayer(kit, layer))}
              aria-pressed={hasLayer(kit, layer)}
              className={cn(
                "h-8 rounded-full px-3 text-12 font-medium",
                "transition-colors duration-120 ease-ui motion-reduce:transition-none",
                "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                hasLayer(kit, layer)
                  ? "bg-primary-solid text-ink-on-primary hover:bg-primary-hover"
                  : "bg-surface-raised text-ink-muted hover:bg-surface-sunken hover:text-ink-primary",
              )}
            >
              {LAYER_LABELS[layer]}
            </button>
          ))}
        </div>

        <TabBar tab={tab} onChange={setTab} />

        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4'>
          {tab === "presets" && <PresetsTab kit={kit} onChange={onChange} onBpmChange={onBpmChange} />}
          {tab === "beat" && <BeatTab kit={kit} onChange={onChange} />}
          {tab === "drone" && (
            <DroneTab kit={kit} onChange={onChange} songKey={songKey} transpose={transpose} />
          )}
          {tab === "mix" && <MixTab kit={kit} onChange={onChange} bpm={bpm} />}
        </div>
      </div>
    </div>
  );
}

// ── Chrome ────────────────────────────────────────────────────────────────────

type TabId = "presets" | "beat" | "drone" | "mix";

const TABS: { id: TabId; label: string }[] = [
  { id: "presets", label: "Presets" },
  { id: "beat", label: "Beat" },
  { id: "drone", label: "Drone" },
  { id: "mix", label: "Mix" },
];

function TabBar({ tab, onChange }: { tab: string; onChange: (tab: TabId) => void }) {
  return (
    <div role='tablist' className='flex shrink-0 gap-1 border-b border-line-subtle px-2'>
      {TABS.map((t) => (
        <button
          key={t.id}
          role='tab'
          aria-selected={tab === t.id}
          type='button'
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px h-10 border-b-2 px-3 text-13 font-medium",
            "transition-colors duration-120 ease-ui motion-reduce:transition-none",
            "focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
            tab === t.id
              ? "border-primary-solid text-ink-primary"
              : "border-transparent text-ink-muted hover:text-ink-primary",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TempoField({ bpm, onChange }: { bpm: number; onChange: (bpm: number) => void }) {
  return (
    <label className='flex shrink-0 items-center gap-1.5 text-12 text-ink-muted'>
      <input
        type='number'
        min={40}
        max={240}
        value={bpm}
        onChange={(e) => {
          const next = parseInt(e.target.value, 10);
          if (isFinite(next)) onChange(Math.min(240, Math.max(40, next)));
        }}
        aria-label='Tempo in beats per minute'
        className={cn(
          "h-8 w-16 rounded-md border border-line-subtle bg-surface-sunken px-2 text-13 text-ink-primary tabular-nums",
          "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
      />
      bpm
    </label>
  );
}

/** A label above a control, used the same way in every tab. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-baseline gap-2'>
        <span className='text-10 font-semibold uppercase tracking-wider text-ink-muted'>{label}</span>
        {hint && <span className='text-10 text-ink-muted'>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** A row of mutually exclusive choices. */
function Choices<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role='radiogroup' aria-label={ariaLabel} className='flex flex-wrap gap-1.5'>
      {options.map((option) => (
        <button
          key={option.value}
          type='button'
          role='radio'
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 rounded-md border px-3 text-12 font-medium",
            "transition-colors duration-120 ease-ui motion-reduce:transition-none",
            "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            value === option.value
              ? "border-primary-solid bg-primary-solid/15 text-ink-primary"
              : "border-line-subtle bg-surface-raised text-ink-muted hover:bg-surface-overlay hover:text-ink-primary",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function LevelSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className='flex items-center gap-3'>
      <span className='w-20 shrink-0 text-13 text-ink-primary'>{label}</span>
      <input
        type='range'
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)}
        aria-label={`${label} level`}
        className='h-1.5 flex-1 accent-primary-solid'
      />
      <span className='w-10 shrink-0 text-right text-12 tabular-nums text-ink-muted'>
        {Math.round(value * 100)}%
      </span>
    </label>
  );
}

// ── Presets ───────────────────────────────────────────────────────────────────

function PresetsTab({
  kit,
  onChange,
  onBpmChange,
}: {
  kit: KitSettings;
  onChange: (next: KitSettings) => void;
  onBpmChange: (bpm: number) => void;
}) {
  return (
    <div className='flex flex-col gap-5'>
      <p className='text-12 text-ink-muted'>
        A preset sets the beat, the voices, the levels and what is switched on, all at once.
      </p>
      {PRESET_GROUPS.map((group) => (
        <div key={group.label} className='flex flex-col gap-2'>
          <h3 className='text-10 font-semibold uppercase tracking-wider text-ink-muted'>
            {group.label}
          </h3>
          <div className='grid gap-2 sm:grid-cols-2'>
            {group.items.map((preset) => {
              const active = kit.preset === preset.name;
              return (
                <button
                  key={preset.name}
                  type='button'
                  onClick={() => {
                    onChange(applyPreset(preset, kit));
                    onBpmChange(preset.bpm);
                  }}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-lg border p-3 text-left",
                    "transition-colors duration-120 ease-ui motion-reduce:transition-none",
                    "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    active
                      ? "border-primary-solid bg-primary-solid/10"
                      : "border-line-subtle bg-surface-raised hover:bg-surface-overlay",
                  )}
                >
                  <span className='flex items-center gap-1.5 text-13 font-medium text-ink-primary'>
                    {preset.name}
                    {active && <Check className='h-3.5 w-3.5 text-primary-text' />}
                  </span>
                  <span className='text-12 text-ink-muted'>{preset.blurb}</span>
                  <span className='text-10 tabular-nums text-ink-muted'>{preset.bpm} bpm</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Beat ──────────────────────────────────────────────────────────────────────

const LANE_LABELS: Record<GridLane, string> = {
  kick: "Kick",
  snare: "Snare",
  hihat: "Hat",
  clap: "Clap",
};

/**
 * The step grid.
 *
 * Sixteen sixteenths across, four lanes down, beats marked every four columns
 * so a bar can be read at a glance. Dragging across cells paints them, which is
 * how a hat line gets written without sixteen separate clicks — the value the
 * first cell takes is the value the whole drag paints, so a drag can erase as
 * well as fill.
 */
function StepGrid({
  grid,
  onChange,
  activeStep,
}: {
  grid: DrumGrid;
  onChange: (next: DrumGrid) => void;
  activeStep: number;
}) {
  /** What the current drag is painting: 1 to fill, 0 to erase, null when idle. */
  const paintRef = useRef<number | null>(null);

  const paint = useCallback(
    (lane: GridLane, step: number, value: number) => {
      if (grid[lane][step] === value) return;
      const next = { ...grid, [lane]: [...grid[lane]] };
      next[lane][step] = value;
      onChange(next);
    },
    [grid, onChange],
  );

  useEffect(() => {
    const stop = () => {
      paintRef.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  return (
    <div className='flex flex-col gap-1.5 overflow-x-auto'>
      <div className='flex gap-1 pl-14'>
        {Array.from({ length: STEPS_PER_BAR }, (_, step) => (
          <span
            key={step}
            aria-hidden='true'
            className={cn(
              "w-6 shrink-0 text-center text-10 tabular-nums",
              step === activeStep ? "text-primary-text" : "text-ink-muted",
            )}
          >
            {step % 4 === 0 ? step / 4 + 1 : "·"}
          </span>
        ))}
      </div>
      {GRID_LANES.map((lane) => (
        <div key={lane} className='flex items-center gap-1'>
          <span className='w-13 shrink-0 pr-1 text-right text-12 text-ink-muted'>
            {LANE_LABELS[lane]}
          </span>
          {grid[lane].map((on, step) => (
            <button
              key={step}
              type='button'
              aria-label={`${LANE_LABELS[lane]} step ${step + 1}`}
              aria-pressed={on === 1}
              onPointerDown={(e) => {
                e.preventDefault();
                paintRef.current = on ? 0 : 1;
                paint(lane, step, paintRef.current);
              }}
              onPointerEnter={() => {
                if (paintRef.current !== null) paint(lane, step, paintRef.current);
              }}
              className={cn(
                "h-8 w-6 shrink-0 touch-none rounded",
                "transition-colors duration-120 ease-ui motion-reduce:transition-none",
                "focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                on
                  ? "bg-primary-solid hover:bg-primary-hover"
                  : step % 4 === 0
                    ? "bg-surface-raised hover:bg-surface-overlay"
                    : "bg-surface-sunken hover:bg-surface-raised",
                // The playhead brightens the column it is on rather than
                // covering it, so a hit stays visible underneath.
                step === activeStep && "ring-1 ring-inset ring-focus",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function BeatTab({ kit, onChange }: { kit: KitSettings; onChange: (next: KitSettings) => void }) {
  const step = useKitStep();
  const grid = useMemo(() => effectiveGrid(kit.drums), [kit.drums]);
  const library = useMemo(() => gridFromPattern(kit.drums.pattern), [kit.drums.pattern]);
  const edited = kit.drums.steps !== null && !gridsEqual(grid, library);

  const setGrid = (next: DrumGrid) => {
    // Landing back on the library pattern by hand drops the override, so the
    // beat goes back to being "Boom Bap" rather than "Boom Bap, edited".
    const steps = gridsEqual(next, library) ? null : next;
    onChange({ ...kit, drums: { ...kit.drums, steps } });
  };

  return (
    <div className='flex flex-col gap-5'>
      <Field label='Pattern' hint={edited ? "edited" : undefined}>
        <div className='flex items-center gap-2'>
          <select
            value={kit.drums.pattern}
            onChange={(e) =>
              onChange({ ...kit, drums: { ...kit.drums, pattern: e.target.value, steps: null } })
            }
            aria-label='Drum pattern'
            className={cn(
              "h-9 min-w-0 flex-1 rounded-md border border-line-subtle bg-surface-sunken px-2 text-13 text-ink-primary",
              "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            )}
          >
            {kit.drums.pattern === CUSTOM_PATTERN && (
              <option value={CUSTOM_PATTERN}>{CUSTOM_PATTERN}</option>
            )}
            {PATTERN_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Button
            variant='ghost'
            size='icon'
            disabled={!edited}
            onClick={() => onChange({ ...kit, drums: { ...kit.drums, steps: null } })}
            title='Put the pattern back the way the library has it'
            aria-label='Reset the beat to the pattern'
          >
            <RotateCcw className='h-4 w-4' />
          </Button>
        </div>
      </Field>

      <StepGrid grid={grid} onChange={setGrid} activeStep={step} />

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label='Kick'>
          <Choices
            ariaLabel='Kick voice'
            value={kit.drums.kick}
            onChange={(kick) => onChange({ ...kit, drums: { ...kit.drums, kick } })}
            options={[
              { value: "folk", label: "Acoustic" },
              { value: "808", label: "808" },
            ]}
          />
        </Field>
        <Field label='Snare'>
          <Choices
            ariaLabel='Snare voice'
            value={kit.drums.snare}
            onChange={(snare) => onChange({ ...kit, drums: { ...kit.drums, snare } })}
            options={[
              { value: "regular", label: "Regular" },
              { value: "brush", label: "Brush" },
            ]}
          />
        </Field>
      </div>

      <Field label='Percussion' hint='the part the Percussion layer plays'>
        <select
          value={kit.drums.shimmer}
          onChange={(e) => {
            onChange({ ...kit, drums: { ...kit.drums, shimmer: e.target.value } });
            // Picking a part plays a bar of it. Twenty-two of these are only
            // names until you hear one.
            auditionAccent(e.target.value, 120);
          }}
          aria-label='Percussion part'
          className={cn(
            "h-9 w-full rounded-md border border-line-subtle bg-surface-sunken px-2 text-13 text-ink-primary",
            "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          {ACCENT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
    </div>
  );
}

// ── Drone ─────────────────────────────────────────────────────────────────────

/**
 * The held chord: which one, and what it sounds like.
 *
 * Two decisions, and they are different in kind. The key is a fact about the
 * song and usually wants leaving on Song key, where it follows the header and
 * the transpose control. The variation is a taste, which is why the blurb for
 * the one selected sits under the row rather than on a tooltip nobody opens.
 */
function DroneTab({
  kit,
  onChange,
  songKey,
  transpose,
}: {
  kit: KitSettings;
  onChange: (next: KitSettings) => void;
  songKey?: string | null;
  transpose: number;
}) {
  const on = hasLayer(kit, "drone");
  const sounding = droneKeyLabel(resolveDroneKey(kit.drone, songKey, transpose));
  const variation = DRONE_STYLES.find((s) => s.value === kit.drone.style) ?? DRONE_STYLES[0];

  return (
    <div className='flex flex-col gap-5'>
      <p className='text-12 text-ink-muted'>
        {on
          ? `Holding ${sounding} under everything else.`
          : `Switch the Drone layer on to hear it. It would hold ${sounding}.`}
      </p>

      <Field label='Key' hint='what the drone holds'>
        <select
          value={kit.drone.key}
          onChange={(e) => onChange({ ...kit, drone: { ...kit.drone, key: e.target.value } })}
          aria-label='Drone key'
          className={cn(
            "h-9 w-full rounded-md border border-line-subtle bg-surface-sunken px-2 text-13 text-ink-primary",
            "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          <option value={SONG_KEY}>Song key ({sounding})</option>
          {DRONE_KEY_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <p className='-mt-3 text-10 text-ink-muted'>
        Song key follows the header and the transpose control. A key picked by name is held
        exactly as picked.
      </p>

      <Field label='Variation'>
        <Choices
          ariaLabel='Drone variation'
          value={kit.drone.style}
          onChange={(style: DroneStyle) => onChange({ ...kit, drone: { ...kit.drone, style } })}
          options={DRONE_STYLES.map((s) => ({ value: s.value, label: s.label }))}
        />
      </Field>
      <p className='-mt-3 text-12 text-ink-muted'>{variation.blurb}</p>

      <Field label='Level'>
        <div className='pt-1'>
          <LevelSlider
            label='Drone'
            value={kit.drone.volume}
            onChange={(volume) => onChange({ ...kit, drone: { ...kit.drone, volume } })}
          />
        </div>
      </Field>
    </div>
  );
}

// ── Mix ───────────────────────────────────────────────────────────────────────

function MixTab({
  kit,
  onChange,
  bpm,
}: {
  kit: KitSettings;
  onChange: (next: KitSettings) => void;
  bpm: number;
}) {
  return (
    <div className='flex flex-col gap-5'>
      <Field label='Levels'>
        <div className='flex flex-col gap-3 pt-1'>
          <LevelSlider
            label='Kit'
            value={kit.drums.volume}
            onChange={(volume) => onChange({ ...kit, drums: { ...kit.drums, volume } })}
          />
          <LevelSlider
            label='Drone'
            value={kit.drone.volume}
            onChange={(volume) => onChange({ ...kit, drone: { ...kit.drone, volume } })}
          />
        </div>
      </Field>

      <button
        type='button'
        onClick={() => auditionAccent(kit.drums.shimmer, bpm)}
        className={cn(
          "flex h-9 items-center gap-2 self-start rounded-md border border-line-subtle bg-surface-raised px-3 text-13 text-ink-primary",
          "transition-colors duration-120 ease-ui hover:bg-surface-overlay",
          "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <Volume2 className='h-4 w-4' /> Hear {kit.drums.shimmer}
      </button>
    </div>
  );
}
