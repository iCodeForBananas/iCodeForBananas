"use client";

import { useMemo, useState } from "react";
import { Download, Play, Square, Volume2, X } from "lucide-react";
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
  LAYER_LABELS,
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
const MIN_BPM = 40;
const MAX_BPM = 240;

/**
 * The reference's Drum editor, as one modal: a head with the kit's name, the
 * time signature and tempo and the transport; a sequencer with one row per
 * track, a sound panel beside it and a groove control; the drone; and a foot
 * with Start blank, Discard and Save kit.
 *
 * Edits land on the kit as they are made, the way they always have here, so
 * Discard reverts to the kit as it was when the editor opened rather than
 * throwing away a draft that never existed. Everything the designer used to
 * hold that the reference's layout has no place for is still in here, in a
 * section of its own underneath: the layers, the pattern, the voices, the
 * percussion part, the drone's key and variation, the level, and the WAV.
 */
export default function DrumEditor({
  kit,
  onChange,
  bpm,
  onBpmChange,
  playing,
  onPlayingChange,
  onClose,
  songKey,
  transpose = 0,
  songTitle,
}: {
  kit: KitSettings;
  onChange: (next: KitSettings) => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onClose: () => void;
  songKey?: string | null;
  transpose?: number;
  songTitle?: string | null;
}) {
  // What Discard goes back to. Taken once, when the editor opens.
  const [opening] = useState(() => kit);
  // Select menus portal to <body> unless told otherwise, which is outside the
  // scoped tokens; this keeps them inside the Songbook subtree.
  const portal = useSongbookPortal();
  const [track, setTrack] = useState<GridLane>("kick");
  const step = useKitStep();

  const grid = useMemo(() => effectiveGrid(kit.drums), [kit.drums]);
  const library = useMemo(() => gridFromPattern(kit.drums.pattern), [kit.drums.pattern]);
  const edited = kit.drums.steps !== null && !gridsEqual(grid, library);
  const clean = matchesPreset(kit);
  const name = kit.preset ?? "Custom kit";

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

  return (
    <div className={styles.modalBack} role='presentation'>
      <section className={styles.modal} role='dialog' aria-modal='true' aria-label='Drum editor'>
        <div className={styles.mHead}>
          <h2 className={styles.mTitle}>Drum editor</h2>
          <Text size='2' className='min-w-0 truncate'>
            {name}
            {kit.preset && !clean && <span className={styles.mMuted}> · edited</span>}
          </Text>
          <div className={styles.segctl} role='group' aria-label='Time signature'>
            <button type='button' className={`${styles.segBtn} ${styles.segBtnOn}`} aria-pressed='true'>
              4/4
            </button>
            <button
              type='button'
              className={styles.segBtn}
              disabled
              aria-pressed='false'
              title='3/4 needs a 12-step beat, which the engine does not play yet'
            >
              3/4
            </button>
          </div>
          <div className={styles.spacer} />
          <div className={styles.miniTempo}>
            <button
              type='button'
              className={styles.ibtn}
              onClick={() => onBpmChange(Math.max(MIN_BPM, bpm - 2))}
              aria-label='Slower'
            >
              <Minus16 />
            </button>
            <span className={styles.miniTempoValue}>{bpm} bpm</span>
            <button
              type='button'
              className={styles.ibtn}
              onClick={() => onBpmChange(Math.min(MAX_BPM, bpm + 2))}
              aria-label='Faster'
            >
              <Plus16 />
            </button>
          </div>
          {playing ? (
            <button
              type='button'
              className={`${styles.ibtn} ${styles.ibtnCream}`}
              onClick={() => onPlayingChange(false)}
            >
              <Square className='h-[18px] w-[18px]' fill='currentColor' />
              Stop
            </button>
          ) : (
            <button type='button' className={`${styles.ibtn} ${styles.ibtnAccent}`} onClick={() => onPlayingChange(true)}>
              <Play className='h-[18px] w-[18px]' fill='currentColor' />
              Play
            </button>
          )}
          <button type='button' className={styles.ibtn} onClick={onClose} aria-label='Close drum editor'>
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className={styles.mBody}>
          <div className={styles.mSeq}>
            <div className={styles.seqscroll}>
              <div className={styles.seqin}>
                <div className={styles.srow} style={{ gridTemplateColumns: `132px repeat(${STEPS_PER_BAR}, minmax(0, 1fr))` }}>
                  <span />
                  {Array.from({ length: STEPS_PER_BAR }, (_, i) => (
                    <span
                      key={i}
                      className={`${styles.num} ${i > 0 && i % 4 === 0 ? styles.grp : ""}`}
                      aria-hidden='true'
                    >
                      {i % 4 === 0 ? i / 4 + 1 : ""}
                    </span>
                  ))}
                </div>
                {GRID_LANES.map((lane) => (
                  <div
                    key={lane}
                    className={styles.srow}
                    style={{ gridTemplateColumns: `132px repeat(${STEPS_PER_BAR}, minmax(0, 1fr))` }}
                  >
                    <button
                      type='button'
                      className={`${styles.trk} ${lane === track ? styles.trkOn : ""}`}
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
                          styles.st,
                          cell === CELL_HIT ? styles.stFull : cell === CELL_SOFT ? styles.stSoft : "",
                          i % 4 === 0 ? styles.stDown : "",
                          i > 0 && i % 4 === 0 ? styles.grp : "",
                          playing && step === i ? styles.stNow : "",
                        ].join(" ")}
                        onClick={() => cycle(lane, i)}
                        aria-label={`${LANE_LABELS[lane]} step ${i + 1}, ${cell === CELL_HIT ? "hit" : cell === CELL_SOFT ? "soft" : "off"}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.legend}>
              <span>
                <span className={styles.sw} style={{ background: "var(--ds-color-primary-solid)" }} />
                Hit
              </span>
              <span>
                <span className={styles.sw} style={{ background: "color-mix(in srgb, var(--ds-color-primary-solid) 38%, #1A1E23)" }} />
                Soft hit
              </span>
              <span>Tap a step to cycle hit, soft, off. Tap a name to hear it and shape its sound.</span>
            </div>

            <div className={styles.group}>
              <h3 className={styles.panelH}>Pattern</h3>
              <div className='flex items-center gap-2'>
                <Select.Root
                  value={kit.drums.pattern}
                  onValueChange={(pattern) => onChange({ ...kit, drums: { ...kit.drums, pattern, steps: null } })}
                >
                  <Select.Trigger aria-label='Drum pattern' className='min-w-0 flex-1' />
                  <Select.Content position='popper' container={portal}>
                    {kit.drums.pattern === CUSTOM_PATTERN && (
                      <Select.Item value={CUSTOM_PATTERN}>{CUSTOM_PATTERN}</Select.Item>
                    )}
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
                  Reset beat
                </button>
              </div>
            </div>
          </div>

          <aside className={styles.mSide}>
            <div className={styles.libRow}>
              <h3 className={styles.panelH}>Sound · {selected}</h3>
              <button
                type='button'
                className={styles.ibtn}
                onClick={() => auditionTrack(track, kit.drums)}
                aria-label={`Hear ${selected}`}
              >
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
            {/* The reference's Tune, Decay and Tone. The voices are fixed-character
                synthesis today; these need a parameter in each one, which would
                change how every existing song sounds. Shown so the panel reads as
                the reference's, and disabled until a voice takes them. */}
            {(["Tune", "Decay", "Tone"] as const).map((label) => (
              <label key={label} className={styles.sl} title='Not yet taken by the voices'>
                <span className={styles.slRow}>
                  <span>{label}</span>
                  <span className={styles.slValue}>—</span>
                </span>
                <input className={styles.vol} type='range' disabled value={50} readOnly />
              </label>
            ))}
            <button
              type='button'
              className={styles.ibtn}
              onClick={() => setGrid({ ...grid, [track]: Array(STEPS_PER_BAR).fill(CELL_OFF) })}
            >
              Clear {selected} row
            </button>

            <h3 className={styles.panelH} style={{ marginTop: 6 }}>
              Groove
            </h3>
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
                onChange={(e) =>
                  onChange({ ...kit, drums: { ...kit.drums, swing: (Number(e.target.value) / 100) * MAX_SWING } })
                }
              />
            </label>

            {/* The app's own voice and part choices, with no reference equivalent. */}
            <h3 className={styles.panelH} style={{ marginTop: 6 }}>
              Voices
            </h3>
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
              Percussion part · the part the Percussion layer plays
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
          </aside>
        </div>

        {/* The reference's drone block, in its own row under the sequencer. */}
        <div className={styles.drone}>
          <div className={styles.droneCol}>
            <h3 className={styles.panelH}>Drone</h3>
            <button
              type='button'
              className={`${styles.ibtn} ${droneOn ? styles.ibtnAccent : ""}`}
              style={{ minWidth: 120 }}
              onClick={() => onChange(toggleLayer(kit, "drone"))}
              aria-pressed={droneOn}
            >
              {droneOn ? "Drone on" : "Drone off"}
            </button>
            <span className={styles.droneSummary}>
              {soundingLabel} · {(DRONE_STYLES.find((s) => s.value === drone.style) ?? DRONE_STYLES[0]).label}
            </span>
          </div>

          <div className={styles.droneCol}>
            <span className={styles.field}>Note</span>
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
          </div>

          <div className={styles.droneCol}>
            <span className={styles.field}>Shape</span>
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
            <span className={styles.field}>Key · what the drone holds</span>
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
            <span className={styles.field}>Variation</span>
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
          </div>

          <div className={`${styles.droneCol} ${styles.droneWide}`}>
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
            {/* Brightness, Motion and Octave in the reference. The drone's voicing
                is fixed in the engine today (root, third and fifth across three
                octaves), so these have nothing to set yet. */}
            {["Brightness", "Motion", "Octave"].map((label) => (
              <label key={label} className={styles.sl} title='Not yet taken by the drone engine'>
                <span className={styles.slRow}>
                  <span>{label}</span>
                  <span className={styles.slValue}>—</span>
                </span>
                <input className={styles.vol} type='range' disabled value={50} readOnly />
              </label>
            ))}
          </div>
        </div>

        {/* The app's own layers, mix and download — no reference equivalent. */}
        <div className={styles.mix}>
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
              <span>Kit level</span>
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
          <KitDownload kit={kit} bpm={bpm} songTitle={songTitle} songKey={songKey} transpose={transpose} />
        </div>

        <div className={styles.mFoot}>
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
          >
            Start blank
          </button>
          <div className={styles.spacer} />
          <button type='button' className={styles.ibtn} onClick={() => { onChange(opening); onClose(); }}>
            Discard
          </button>
          <button type='button' className={`${styles.ibtn} ${styles.ibtnAccent}`} onClick={onClose}>
            Save kit
          </button>
        </div>
      </section>
    </div>
  );
}

function Minus16() {
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round'>
      <path d='M5 12h14' />
    </svg>
  );
}

function Plus16() {
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round'>
      <path d='M12 5v14M5 12h14' />
    </svg>
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
