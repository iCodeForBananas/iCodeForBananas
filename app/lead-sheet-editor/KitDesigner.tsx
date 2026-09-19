"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Play, RotateCcw, Square, Volume2, X } from "lucide-react";
import {
  Card,
  Dialog,
  Flex,
  SegmentedControl,
  Select,
  Slider,
  Tabs,
  Text,
  TextField,
  Button as RadixButton,
} from "@radix-ui/themes";
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

  const preset = kit.preset;
  const clean = matchesPreset(kit);

  // Escape, the overlay and the focus trap are Radix Dialog's.
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content
        maxWidth='48rem'
        aria-describedby={undefined}
        className='flex max-h-[92vh] flex-col overflow-hidden p-0 print:hidden'
      >
        <Dialog.Title className='sr-only'>Kit designer</Dialog.Title>
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
            <RadixButton
              key={layer}
              type='button'
              radius='full'
              variant={hasLayer(kit, layer) ? "solid" : "soft"}
              color={hasLayer(kit, layer) ? undefined : "gray"}
              onClick={() => onChange(toggleLayer(kit, layer))}
              aria-pressed={hasLayer(kit, layer)}
            >
              {LAYER_LABELS[layer]}
            </RadixButton>
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
      </Dialog.Content>
    </Dialog.Root>
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
    <Tabs.Root value={tab} onValueChange={(v) => onChange(v as TabId)} className='shrink-0'>
      <Tabs.List className='px-2'>
        {TABS.map((t) => (
          <Tabs.Trigger key={t.id} value={t.id}>
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

function TempoField({ bpm, onChange }: { bpm: number; onChange: (bpm: number) => void }) {
  return (
    <Text as='label' size='1' color='gray' className='shrink-0'>
      <Flex align='center' gap='2'>
        <TextField.Root
          type='number'
          min={40}
          max={240}
          value={bpm}
          onChange={(e) => {
            const next = parseInt(e.target.value, 10);
            if (isFinite(next)) onChange(Math.min(240, Math.max(40, next)));
          }}
          aria-label='Tempo in beats per minute'
          className='w-16 tabular-nums'
        />
        bpm
      </Flex>
    </Text>
  );
}

/** A label above a control, used the same way in every tab. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Flex direction='column' gap='2'>
      <Flex align='baseline' gap='2'>
        <Text size='1' weight='bold' color='gray' className='uppercase tracking-wider'>
          {label}
        </Text>
        {hint && (
          <Text size='1' color='gray'>
            {hint}
          </Text>
        )}
      </Flex>
      {children}
    </Flex>
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
    <SegmentedControl.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      aria-label={ariaLabel}
      className='self-start'
    >
      {options.map((option) => (
        <SegmentedControl.Item key={option.value} value={option.value}>
          {option.label}
        </SegmentedControl.Item>
      ))}
    </SegmentedControl.Root>
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
    <Flex align='center' gap='3'>
      <Text size='2' className='w-20 shrink-0'>
        {label}
      </Text>
      <Slider
        min={0}
        max={100}
        value={[Math.round(value * 100)]}
        onValueChange={([v]) => onChange(v / 100)}
        aria-label={`${label} level`}
        className='flex-1'
      />
      <Text size='1' color='gray' align='right' className='w-10 shrink-0 tabular-nums'>
        {Math.round(value * 100)}%
      </Text>
    </Flex>
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
                <Card
                  key={preset.name}
                  asChild
                  className={cn(active && "shadow-[inset_0_0_0_1px_var(--accent-9)] bg-[var(--accent-a3)]")}
                >
                  <button
                    type='button'
                    aria-pressed={active}
                    onClick={() => {
                      onChange(applyPreset(preset, kit));
                      onBpmChange(preset.bpm);
                    }}
                    className='flex flex-col items-start gap-0.5 text-left'
                  >
                    <Text size='2' weight='medium' className='flex items-center gap-1.5'>
                      {preset.name}
                      {active && <Check className='h-3.5 w-3.5 text-primary-text' />}
                    </Text>
                    <Text size='1' color='gray'>
                      {preset.blurb}
                    </Text>
                    <Text size='1' color='gray' className='tabular-nums'>
                      {preset.bpm} bpm
                    </Text>
                  </button>
                </Card>
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
          <Select.Root
            value={kit.drums.pattern}
            onValueChange={(pattern) => onChange({ ...kit, drums: { ...kit.drums, pattern, steps: null } })}
          >
            <Select.Trigger aria-label='Drum pattern' className='min-w-0 flex-1' />
            <Select.Content position='popper'>
              {kit.drums.pattern === CUSTOM_PATTERN && (
                <Select.Item value={CUSTOM_PATTERN}>{CUSTOM_PATTERN}</Select.Item>
              )}
              {PATTERN_GROUPS.map((group) => (
                <Select.Group key={group.label}>
                  <Select.Label>{group.label}</Select.Label>
                  {group.items.map((item) => (
                    <Select.Item key={item.name} value={item.name}>
                      {item.name}
                    </Select.Item>
                  ))}
                </Select.Group>
              ))}
            </Select.Content>
          </Select.Root>
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
        <Select.Root
          value={kit.drums.shimmer}
          onValueChange={(shimmer) => {
            onChange({ ...kit, drums: { ...kit.drums, shimmer } });
            // Picking a part plays a bar of it. Twenty-two of these are only
            // names until you hear one.
            auditionAccent(shimmer, 120);
          }}
        >
          <Select.Trigger aria-label='Percussion part' className='w-full' />
          <Select.Content position='popper'>
            {ACCENT_GROUPS.map((group) => (
              <Select.Group key={group.label}>
                <Select.Label>{group.label}</Select.Label>
                {group.items.map((item) => (
                  <Select.Item key={item.name} value={item.name}>
                    {item.name}
                  </Select.Item>
                ))}
              </Select.Group>
            ))}
          </Select.Content>
        </Select.Root>
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
        <Select.Root value={kit.drone.key} onValueChange={(key) => onChange({ ...kit, drone: { ...kit.drone, key } })}>
          <Select.Trigger aria-label='Drone key' className='w-full' />
          <Select.Content position='popper'>
            <Select.Item value={SONG_KEY}>Song key ({sounding})</Select.Item>
            {DRONE_KEY_GROUPS.map((group) => (
              <Select.Group key={group.label}>
                <Select.Label>{group.label}</Select.Label>
                {group.items.map((item) => (
                  <Select.Item key={item.value} value={item.value}>
                    {item.label}
                  </Select.Item>
                ))}
              </Select.Group>
            ))}
          </Select.Content>
        </Select.Root>
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

      <RadixButton type='button' variant='soft' color='gray' className='self-start' onClick={() => auditionAccent(kit.drums.shimmer, bpm)}>
        <Volume2 className='h-4 w-4' /> Hear {kit.drums.shimmer}
      </RadixButton>
    </div>
  );
}
