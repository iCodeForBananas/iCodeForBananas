"use client";

import { useMemo, useState } from "react";
import { Download, Volume2 } from "lucide-react";
import { Select, Button as RadixButton, Text } from "@radix-ui/themes";
import { ACCENT_GROUPS, auditionAccent } from "./accents";
import {
  CELL_HIT,
  CELL_OFF,
  CELL_SOFT,
  CUSTOM_PATTERN,
  GRID_LANES,
  LANE_LABELS,
  MAX_SWING,
  PATTERN_GROUPS,
  STEPS_PER_BAR,
  auditionTrack,
  effectiveGrid,
  emptyGrid,
  gridFromPattern,
  gridsEqual,
  laneLevel,
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
  KIT_PRESETS,
  LAYER_LABELS,
  PRESET_GROUPS,
  applyPreset,
  hasLayer,
  kitIsSilent,
  matchesPreset,
  toggleLayer,
  type KitSettings,
} from "./kit";
import { KIT_RENDER_SECONDS, kitWavFileName, renderKitToWav } from "./kitRender";
import styles from "./lead-sheet-editor.module.css";
import { useSongbookPortal } from "./portal";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** The dropdown's value for a kit that no longer is any one preset. */
const CUSTOM_KIT = "__custom";

/**
 * Which kit to play, as one dropdown. Picking a preset sets the beat, the
 * voices, the layers and the tempo it was written for, all at once; editing
 * anything after that is what the controls under it are for.
 */
export function KitPresetSelect({
  kit,
  onChange,
  onBpmChange,
}: {
  kit: KitSettings;
  onChange: (next: KitSettings) => void;
  onBpmChange: (bpm: number) => void;
}) {
  const portal = useSongbookPortal();
  const edited = kit.preset !== null && !matchesPreset(kit);
  return (
    <div className={styles.group}>
      <h3 className={styles.panelH}>Kit</h3>
      <Select.Root
        value={kit.preset ?? CUSTOM_KIT}
        onValueChange={(name) => {
          const preset = KIT_PRESETS.find((p) => p.name === name);
          if (!preset) return;
          onChange(applyPreset(preset, kit));
          onBpmChange(preset.bpm);
        }}
      >
        <Select.Trigger aria-label='Kit' className='w-full' />
        <Select.Content position='popper' container={portal}>
          {kit.preset === null && <Select.Item value={CUSTOM_KIT}>Custom kit</Select.Item>}
          {PRESET_GROUPS.map((g) => (
            <Select.Group key={g.label}>
              <Select.Label>{g.label}</Select.Label>
              {g.items.map((preset) => (
                <Select.Item key={preset.name} value={preset.name}>
                  {preset.name}
                </Select.Item>
              ))}
            </Select.Group>
          ))}
        </Select.Content>
      </Select.Root>
      {edited && <span className={styles.droneSummary}>Edited from {kit.preset}</span>}
    </div>
  );
}

/**
 * Everything the kit can be told, laid out down the Drums panel: the beat as
 * a step grid, the pattern it started from, each track's level, the groove,
 * the voices, which layers play, the drone, and the kit as a WAV. Edits land
 * on the kit as they are made, so there is nothing to save.
 */
export default function DrumControls({
  kit,
  onChange,
  bpm,
  playing,
  songKey,
  transpose = 0,
  songTitle,
}: {
  kit: KitSettings;
  onChange: (next: KitSettings) => void;
  bpm: number;
  playing: boolean;
  songKey?: string | null;
  transpose?: number;
  songTitle?: string | null;
}) {
  // Select menus portal to <body> unless told otherwise, which is outside the
  // scoped tokens; this keeps them inside the Songbook subtree.
  const portal = useSongbookPortal();
  const [track, setTrack] = useState<GridLane>("kick");
  const step = useKitStep();

  const grid = useMemo(() => effectiveGrid(kit.drums), [kit.drums]);
  const library = useMemo(() => gridFromPattern(kit.drums.pattern), [kit.drums.pattern]);
  const edited = kit.drums.steps !== null && !gridsEqual(grid, library);

  const setGrid = (next: DrumGrid) => {
    // Landing back on the library pattern by hand drops the override, so the
    // beat goes back to being the named pattern rather than "edited".
    const steps = gridsEqual(next, library) ? null : next;
    onChange({ ...kit, drums: { ...kit.drums, steps } });
  };
  const cycle = (lane: GridLane, i: number) => {
    const next = { ...grid, [lane]: [...grid[lane]] };
    const v = grid[lane][i];
    next[lane][i] = v === CELL_OFF ? CELL_HIT : v === CELL_HIT ? CELL_SOFT : CELL_OFF;
    setGrid(next);
  };
  const setLevel = (lane: GridLane, level: number) =>
    onChange({ ...kit, drums: { ...kit.drums, levels: { ...kit.drums.levels, [lane]: level } } });

  const selected = LANE_LABELS[track];
  const drone = kit.drone;
  const droneOn = hasLayer(kit, "drone");
  const sounding = resolveDroneKey(drone, songKey, transpose);
  const soundingLabel = droneKeyLabel(sounding);
  const dronePitch = NOTES[sounding.semitone % 12];

  const setDroneKey = (semitoneName: string, minor: boolean) =>
    onChange({ ...kit, drone: { ...drone, key: `${semitoneName}${minor ? "m" : ""}` } });

  const gridColumns = { gridTemplateColumns: `52px repeat(${STEPS_PER_BAR}, minmax(0, 1fr))` };

  return (
    <>
      <div className={styles.group}>
        <h3 className={styles.panelH}>Beat</h3>
        <div className={styles.pSeq}>
          {GRID_LANES.map((lane) => (
            <div key={lane} className={styles.pRow} style={gridColumns}>
              <button
                type='button'
                className={`${styles.pTrk} ${lane === track ? styles.trkOn : ""}`}
                aria-pressed={lane === track}
                onClick={() => {
                  setTrack(lane);
                  auditionTrack(lane, kit.drums);
                }}
              >
                {LANE_LABELS[lane]}
              </button>
              {grid[lane].map((cell, i) => (
                <button
                  key={i}
                  type='button'
                  className={[
                    styles.pSt,
                    cell === CELL_HIT ? styles.stFull : cell === CELL_SOFT ? styles.stSoft : "",
                    i % 4 === 0 ? styles.stDown : "",
                    i > 0 && i % 4 === 0 ? styles.pGrp : "",
                    playing && step === i ? styles.stNow : "",
                  ].join(" ")}
                  onClick={() => cycle(lane, i)}
                  aria-label={`${LANE_LABELS[lane]} step ${i + 1}, ${cell === CELL_HIT ? "hit" : cell === CELL_SOFT ? "soft" : "off"}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className={styles.legend}>
          <span>
            <span className={styles.sw} style={{ background: "var(--ds-color-primary-solid)" }} />
            Hit
          </span>
          <span>
            <span className={styles.sw} style={{ background: "color-mix(in srgb, var(--ds-color-primary-solid) 38%, #1A1E23)" }} />
            Soft
          </span>
          <span>Tap a step to cycle hit, soft, off.</span>
        </div>
        <span className={styles.field}>Pattern</span>
        <div className='flex items-center gap-2'>
          <Select.Root
            value={kit.drums.pattern}
            onValueChange={(pattern) => onChange({ ...kit, drums: { ...kit.drums, pattern, steps: null } })}
          >
            <Select.Trigger aria-label='Drum pattern' className='min-w-0 flex-1' />
            <Select.Content position='popper' container={portal}>
              {kit.drums.pattern === CUSTOM_PATTERN && <Select.Item value={CUSTOM_PATTERN}>{CUSTOM_PATTERN}</Select.Item>}
              {PATTERN_GROUPS.map((g) => (
                <Select.Group key={g.label}>
                  <Select.Label>{g.label}</Select.Label>
                  {g.items.map((item) => (
                    <Select.Item key={item.name} value={item.name}>
                      {item.name}
                    </Select.Item>
                  ))}
                </Select.Group>
              ))}
            </Select.Content>
          </Select.Root>
          <button
            type='button'
            className={styles.ibtn}
            disabled={!edited}
            onClick={() => onChange({ ...kit, drums: { ...kit.drums, steps: null } })}
            title='Put the beat back the way the pattern has it'
          >
            Reset
          </button>
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.libRow}>
          <h3 className={styles.panelH}>Sound · {selected}</h3>
          <button type='button' className={styles.ibtn} onClick={() => auditionTrack(track, kit.drums)} aria-label={`Hear ${selected}`}>
            <Volume2 className='h-[18px] w-[18px]' />
          </button>
        </div>
        <label className={styles.sl}>
          <span className={styles.slRow}>
            <span>Level</span>
            <span className={styles.slValue}>{Math.round(laneLevel(kit.drums, track) * 100)}</span>
          </span>
          <input
            className={styles.vol}
            type='range'
            min={0}
            max={100}
            value={Math.round(laneLevel(kit.drums, track) * 100)}
            onChange={(e) => setLevel(track, Number(e.target.value) / 100)}
          />
        </label>
        <button type='button' className={styles.ibtn} onClick={() => setGrid({ ...grid, [track]: Array(STEPS_PER_BAR).fill(CELL_OFF) })}>
          Clear {selected} row
        </button>
        <label className={styles.sl}>
          <span className={styles.slRow}>
            <span>Swing</span>
            <span className={styles.slValue}>{Math.round((kit.drums.swing / MAX_SWING) * 100)}%</span>
          </span>
          <input
            className={styles.vol}
            type='range'
            min={0}
            max={100}
            value={Math.round((kit.drums.swing / MAX_SWING) * 100)}
            onChange={(e) => onChange({ ...kit, drums: { ...kit.drums, swing: (Number(e.target.value) / 100) * MAX_SWING } })}
          />
        </label>
      </div>

      <div className={styles.group}>
        <h3 className={styles.panelH}>Voices</h3>
        <div className={styles.choiceRow}>
          <span className={styles.field}>Kick</span>
          <div className={styles.segctl} role='group' aria-label='Kick voice'>
            {(
              [
                ["folk", "Acoustic"],
                ["808", "808"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type='button'
                className={`${styles.segBtn} ${kit.drums.kick === value ? styles.segBtnOn : ""}`}
                aria-pressed={kit.drums.kick === value}
                onClick={() => onChange({ ...kit, drums: { ...kit.drums, kick: value } })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.choiceRow}>
          <span className={styles.field}>Snare</span>
          <div className={styles.segctl} role='group' aria-label='Snare voice'>
            {(
              [
                ["regular", "Regular"],
                ["brush", "Brush"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type='button'
                className={`${styles.segBtn} ${kit.drums.snare === value ? styles.segBtnOn : ""}`}
                aria-pressed={kit.drums.snare === value}
                onClick={() => onChange({ ...kit, drums: { ...kit.drums, snare: value } })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className={styles.field}>
          Percussion part
          <Select.Root
            value={kit.drums.shimmer}
            onValueChange={(shimmer) => {
              onChange({ ...kit, drums: { ...kit.drums, shimmer } });
              auditionAccent(shimmer, 120);
            }}
          >
            <Select.Trigger aria-label='Percussion part' className='w-full' />
            <Select.Content position='popper' container={portal}>
              {ACCENT_GROUPS.map((g) => (
                <Select.Group key={g.label}>
                  <Select.Label>{g.label}</Select.Label>
                  {g.items.map((item) => (
                    <Select.Item key={item.name} value={item.name}>
                      {item.name}
                    </Select.Item>
                  ))}
                </Select.Group>
              ))}
            </Select.Content>
          </Select.Root>
        </label>
      </div>

      <div className={styles.group}>
        <h3 className={styles.panelH}>Layers</h3>
        <div className={styles.layerRow}>
          {KIT_LAYERS.map((layer) => (
            <button
              key={layer}
              type='button'
              className={`${styles.ibtn} ${hasLayer(kit, layer) ? styles.ibtnOn : ""}`}
              aria-pressed={hasLayer(kit, layer)}
              onClick={() => onChange(toggleLayer(kit, layer))}
            >
              {LAYER_LABELS[layer]}
            </button>
          ))}
        </div>
        <label className={styles.sl}>
          <span className={styles.slRow}>
            <span>Volume</span>
            <span className={styles.slValue}>{Math.round(kit.drums.volume * 100)}</span>
          </span>
          <input
            className={styles.vol}
            type='range'
            min={0}
            max={100}
            value={Math.round(kit.drums.volume * 100)}
            onChange={(e) => onChange({ ...kit, drums: { ...kit.drums, volume: Number(e.target.value) / 100 } })}
          />
        </label>
      </div>

      <div className={styles.group}>
        <div className={styles.libRow}>
          <h3 className={styles.panelH}>Drone</h3>
          <button
            type='button'
            className={`${styles.ibtn} ${droneOn ? styles.ibtnAccent : ""}`}
            onClick={() => onChange(toggleLayer(kit, "drone"))}
            aria-pressed={droneOn}
          >
            {droneOn ? "On" : "Off"}
          </button>
        </div>
        <span className={styles.droneSummary}>
          {soundingLabel} · {(DRONE_STYLES.find((s) => s.value === drone.style) ?? DRONE_STYLES[0]).label}
        </span>
        <div className={styles.notes}>
          {NOTES.map((note) => (
            <button
              key={note}
              type='button'
              className={`${styles.nbtn} ${note === dronePitch ? styles.nbtnOn : ""}`}
              aria-pressed={note === dronePitch}
              onClick={() => {
                setDroneKey(note, sounding.minor);
                if (!droneOn) onChange(toggleLayer(kit, "drone"));
              }}
            >
              {note}
            </button>
          ))}
        </div>
        <div className={styles.segctl} role='group' aria-label='Chord shape'>
          <button
            type='button'
            className={`${styles.segBtn} ${!sounding.minor ? styles.segBtnOn : ""}`}
            aria-pressed={!sounding.minor}
            onClick={() => setDroneKey(dronePitch, false)}
          >
            Major
          </button>
          <button
            type='button'
            className={`${styles.segBtn} ${sounding.minor ? styles.segBtnOn : ""}`}
            aria-pressed={sounding.minor}
            onClick={() => setDroneKey(dronePitch, true)}
          >
            Minor
          </button>
        </div>
        <label className={styles.field}>
          Key · what the drone holds
          <Select.Root value={drone.key} onValueChange={(key) => onChange({ ...kit, drone: { ...drone, key } })}>
            <Select.Trigger aria-label='Drone key' className='w-full' />
            <Select.Content position='popper' container={portal}>
              <Select.Item value={SONG_KEY}>Song key ({soundingLabel})</Select.Item>
              {DRONE_KEY_GROUPS.map((g) => (
                <Select.Group key={g.label}>
                  <Select.Label>{g.label}</Select.Label>
                  {g.items.map((item) => (
                    <Select.Item key={item.value} value={item.value}>
                      {item.label}
                    </Select.Item>
                  ))}
                </Select.Group>
              ))}
            </Select.Content>
          </Select.Root>
        </label>
        <div className={styles.segctl} role='group' aria-label='Drone variation'>
          {DRONE_STYLES.map((s) => (
            <button
              key={s.value}
              type='button'
              className={`${styles.segBtn} ${drone.style === s.value ? styles.segBtnOn : ""}`}
              aria-pressed={drone.style === s.value}
              onClick={() => onChange({ ...kit, drone: { ...drone, style: s.value as DroneStyle } })}
              title={s.blurb}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className={styles.sl}>
          <span className={styles.slRow}>
            <span>Level</span>
            <span className={styles.slValue}>{Math.round(drone.volume * 100)}</span>
          </span>
          <input
            className={styles.vol}
            type='range'
            min={0}
            max={100}
            value={Math.round(drone.volume * 100)}
            onChange={(e) => onChange({ ...kit, drone: { ...drone, volume: Number(e.target.value) / 100 } })}
          />
        </label>
      </div>

      <div className={styles.group}>
        <KitDownload kit={kit} bpm={bpm} songTitle={songTitle} songKey={songKey} transpose={transpose} />
        <button
          type='button'
          className={styles.ibtn}
          onClick={() =>
            onChange({
              ...kit,
              layers: kit.layers.filter((l) => l !== "drone"),
              drums: { ...kit.drums, steps: emptyGrid(), swing: 0, levels: {} },
            })
          }
          title='Clear every step, the swing and the levels, and turn the drone off'
        >
          Start blank
        </button>
      </div>
    </>
  );
}

/**
 * The kit as a file, rendered faster than real time. The button says what it is
 * doing, and a failure is said out loud beneath it rather than producing a click
 * that quietly yields no file.
 */
function KitDownload({
  kit,
  bpm,
  songTitle,
  songKey,
  transpose,
}: {
  kit: KitSettings;
  bpm: number;
  songTitle?: string | null;
  songKey?: string | null;
  transpose: number;
}) {
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const silent = kitIsSilent(kit);

  const download = async () => {
    setRendering(true);
    setError(null);
    try {
      const wav = await renderKitToWav({ kit, bpm, songKey, transpose });
      const url = URL.createObjectURL(wav);
      const link = Object.assign(document.createElement("a"), {
        href: url,
        download: kitWavFileName(songTitle, kit, bpm),
      });
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className={styles.downloadRow}>
      <RadixButton
        type='button'
        variant='soft'
        color='gray'
        disabled={silent || rendering}
        onClick={download}
        title={silent ? "Switch a layer on first" : `Render ${KIT_RENDER_SECONDS} seconds of this kit as a WAV`}
      >
        <Download className='h-4 w-4' />
        {rendering ? "Rendering…" : `Download ${KIT_RENDER_SECONDS} seconds`}
      </RadixButton>
      {error && (
        <Text size='1' color='red'>
          Couldn’t render the kit: {error}
        </Text>
      )}
    </div>
  );
}
