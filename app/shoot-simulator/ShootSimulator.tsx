"use client";

import { useEffect, useRef } from "react";

const HORIZON_RATIO = 0.45;
const CHUNK_WIDTH = 900;
const PLAYER_SPEED = 260;
const PLAYER_DEPTH_SPEED = 0.6;
// Belt-scrollers keep sprites a fixed size and read depth purely from where the
// feet sit on the ground. Only the barest taper here, so walking up onto the
// sidewalk moves you up the screen without visibly shrinking you.
const MIN_SCALE = 0.94;
const MAX_SCALE = 1.06;
const ANCHOR_X_RATIO = 0.35;
const DEPTH_TO_WORLD = 200;
const ENEMY_SPEED = 55;
const ENEMY_DEPTH_SPEED = 0.18;
const MAX_ENEMIES = 5;
const ENEMY_XP = 25;
// Kills per level at 25 XP a head: 4, 8, 12, 18. Flat enough that a good run
// reaches the sword instead of stalling out with two slots still greyed.
const XP_THRESHOLDS = [100, 200, 300, 450, 700];
const COMBO_WINDOW_MS = 600;
// Belt-scroll playfield: you walk the whole depth of the street, from up on the
// sidewalk by the storefronts, over the curb, down to the near edge of the road.
const MIN_PLAYER_DEPTH = 0.06; // up against the building fronts
const MAX_PLAYER_DEPTH = 0.92; // near edge of the road
const SIDEWALK_DEPTH = 0.17; // curb line — a lane you can step up onto, not a slab
const CAMERA_ZOOM = 1.4; // world is drawn in a smaller logical viewport, scaled up = tighter, cinematic framing

const PARROT_LIFT_HEIGHT = 210; // how high the parrot hauls an enemy before dropping them
const PARROT_LIFT_MS = 650;
const PARROT_HANG_MS = 180;
const PARROT_SLAM_MS = 260;
const PARROT_SLAM_DAMAGE = 90;

const PLAYER_MAX_HP = 100;
const PLAYER_IFRAME_MS = 900; // grace period after taking a hit
const HP_REGEN_DELAY_MS = 4500; // quiet time before you start patching yourself up
const HP_REGEN_PER_SEC = 4.5; // slow enough that you still have to disengage
const ENEMY_DAMAGE = 12;
const ENEMY_ATTACK_RANGE = 48;
const ENEMY_ATTACK_DEPTH_TOL = 0.07;
const ENEMY_WINDUP_MS = 320; // telegraph so a hit is always readable
const ENEMY_ATTACK_COOLDOWN_MS = 1500;

// Robo-snake: the occasional ranged enemy. Everything about the shot is tuned so
// you can see it coming, step out of the lane, or put a dumpster between you.
const SNAKE_HP = 140;
const SNAKE_XP = 60;
const SNAKE_SCORE = 250;
const SNAKE_SPEED = 80;
const SNAKE_DEPTH_SPEED = 0.09; // creeps into your lane slowly enough to leave it
const SNAKE_NEAR_RANGE = 190; // slithers back if you get inside this
const SNAKE_FAR_RANGE = 430; // closes until you are this near
const SNAKE_AIM_MS = 950; // laser sight is up this long before the first round
const SNAKE_BURST = 2;
const SNAKE_BURST_GAP_MS = 430;
const SNAKE_RELOAD_MS = 2800;
const SNAKE_SPAWN_MIN_MS = 22000;
const SNAKE_SPAWN_VAR_MS = 14000;
const SNAKE_BULLET_SPEED = 300; // slow enough to walk out of the way of
const SNAKE_BULLET_RANGE = 900;
const SNAKE_BULLET_DAMAGE = 14;
const SNAKE_BULLET_DEPTH_TOL = 0.045; // the lane the round travels down
const SNAKE_BULLET_HALF_W = 7; // for the cover test against props
const MUZZLE_Y = 38; // height of the snake's barrel, and so of the round in flight
const SNAKE_BULLET_HALF_D = 3;

const CAR_DRIVEBY_MS = 5600; // slow enough that you actually watch the goldfish drive past
const CAR_COOLDOWN_MS = 11000;

// Minigun (attack 4): a held burst of tracer fire down the street
const MINIGUN_DURATION_MS = 1500;
const MINIGUN_FIRE_INTERVAL_MS = 65;
const MINIGUN_DAMAGE = 16;
const MINIGUN_RANGE = 560; // world px before a tracer fizzles out
const MINIGUN_COOLDOWN_MS = 4200; // measured from when the barrel stops
const BULLET_SPEED = 1150;
const BULLET_HIT_W = 26;
const BULLET_HIT_DEPTH = 0.09;

// Sword (attack 5): two slashes then a spin that cuts both ways
const SWORD_SWING_MS = 260;
const SWORD_DAMAGE = 62;
const SWORD_SPIN_DAMAGE = 95;
const SWORD_REACH = 118;
const SWORD_DEPTH_TOL = 0.3;
const SWORD_COOLDOWN_MS = 380;
const SWORD_SPIN_COOLDOWN_MS = 700;

const SCORE_KILL = 100;
const SCORE_PICKUP = 50;
const PICKUP_HEAL = 8; // bananas are the only way back up, so they're worth chasing
const PICKUP_LIFETIME_MS = 9000;
const HIGH_SCORE_KEY = "shoot-simulator-high-score";

/** Attack slots, earned one per level: punch, parrot, fishcar, minigun, sword. */
type SlotId = 1 | 2 | 3 | 4 | 5;
const SLOT_IDS: SlotId[] = [1, 2, 3, 4, 5];

type PropType = "trashcan" | "dumpster" | "car" | "tree";

/** The street trees you actually see planted along a city block. */
type TreeKind =
  | "plane" // London plane — broad mottled crown, the classic city street tree
  | "pear" // callery pear — tight upright oval
  | "locust" // honey locust — airy, open, fine-leaved
  | "maple" // young red maple — dense rounded crown
  | "ginkgo"; // ginkgo — narrow, fan-shaped, the yellowest green of the bunch

// Where a prop actually touches the ground, in unscaled sprite pixels (multiplied
// by the prop's draw scale). Deliberately just the base — not the sprite's bounding
// box — so you can walk close behind or in front of a car instead of hitting an
// invisible wall. halfD is screen pixels, converted to depth at collision time.
const PROP_FOOTPRINT: Record<PropType, { halfW: number; halfD: number }> = {
  trashcan: { halfW: 9, halfD: 4 },
  dumpster: { halfW: 24, halfD: 5 },
  car: { halfW: 30, halfD: 6 },
  // Only the trunk is solid — the crown hangs over your head, not in your way
  tree: { halfW: 6, halfD: 3 },
};
// Player and enemies share a footprint — roughly the width of their stance
const ACTOR_HALF_W = 7;
const ACTOR_HALF_D = 3;
const ENEMY_AVOID_DEPTH_SPEED = 0.5; // faster than their normal drift so they round a car promptly
const GROUND_FLOOR_H = 78; // storefront band at the base of every facade
const DOOR_DEPTH = 0.02; // enemies step out at the threshold, behind the walk limit
const EMERGE_TARGET_DEPTH = 0.14; // clear of the doorway, out on the sidewalk
const EMERGE_DEPTH_SPEED = 0.42;

interface GroundProp {
  x: number;
  depth: number;
  type: PropType;
  color: string;
  size: number;
  /** Ground-footprint half-extents in screen pixels, already scaled. */
  halfW: number;
  halfD: number;
  /** Set on street trees; the crown is baked at generation so it never shimmers. */
  tree?: TreeSpec;
}

/** One street tree. Foliage is a pile of overlapping blobs, each its own shade of green. */
interface TreeSpec {
  kind: TreeKind;
  /** Base foliage colour, varied per tree; blobs shift lightness around it. */
  hue: number;
  sat: number;
  light: number;
  trunkH: number;
  trunkW: number;
  barkColor: string;
  /** Bare limbs, drawn under the crown so an airy tree reads as branches + leaves. */
  limbs: { x: number; y: number }[];
  blobs: { x: number; y: number; r: number; dl: number }[];
  /** Cast-iron grate around the pit, the way a downtown block plants them. */
  grate: boolean;
}

/** Distant skyline, drawn with parallax well behind the street. */
interface Building {
  x: number;
  width: number;
  height: number;
  color: string;
  windows: { x: number; y: number; lit: boolean }[];
}

interface Doorway {
  x: number;
  width: number;
  height: number;
  lit: boolean;
  /** Shop entrances get an awning and a sign; the rest are plain stoops. */
  shop: boolean;
}

interface Graffiti {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  style: 0 | 1 | 2;
}

/** The building fronts you actually walk past — grounded at the back of the sidewalk. */
interface Facade {
  kind: "facade";
  x: number;
  width: number;
  /** Fraction of the available height to the horizon, so rooflines stay varied
   *  at any viewport size instead of all clamping to the same ceiling. */
  heightRatio: number;
  color: string;
  trimColor: string;
  groundColor: string;
  windows: { x: number; y: number; w: number; h: number; lit: boolean }[];
  doors: Doorway[];
  awningColor: string;
  signColor: string | null;
  signX: number;
  /** Big lit shop window beside the door on some storefronts. */
  shopWindow: { x: number; width: number; lit: boolean; tint: string } | null;
  /** Sign hanging perpendicular off the wall. */
  bladeSign: { x: number; height: number; color: string } | null;
  graffiti: Graffiti[];
}

interface Alley {
  kind: "alley";
  x: number;
  width: number;
  heightRatio: number;
  lampLit: boolean;
}

/** A gap in the row: chain-link fence, weeds and rubble where a building was. */
interface Lot {
  kind: "lot";
  x: number;
  width: number;
  wallRatio: number;
  debris: { x: number; w: number; h: number }[];
  weeds: { x: number; h: number }[];
  graffiti: Graffiti[];
  billboard: { x: number; width: number; color: string } | null;
}

/** A stretch running under an overpass — dark, tiled, strip-lit. */
interface Underpass {
  kind: "underpass";
  x: number;
  width: number;
  pillarXs: number[];
  lightXs: number[];
  graffiti: Graffiti[];
}

type StreetSpan = Facade | Alley | Lot | Underpass;

/** Where enemies walk in from: a doorway or the mouth of an alley. */
interface SpawnPoint {
  x: number;
  kind: "door" | "alley";
}

/** Chalk scrawls, manhole covers and tar patches scattered on the paving. */
interface GroundMark {
  x: number;
  depth: number;
  kind: "chalk" | "hopscotch" | "manhole" | "patch";
  size: number;
  color: string;
}

interface Chunk {
  props: GroundProp[];
  buildings: Building[];
  spans: StreetSpan[];
  spawnPoints: SpawnPoint[];
  marks: GroundMark[];
}

interface Enemy {
  id: number;
  /** Street thugs brawl; robo-snakes hang back and shoot. */
  kind: "thug" | "snake";
  worldX: number;
  depth: number;
  hp: number;
  dying: boolean;
  deathStartedAt: number | null;
  stunUntil: number;
  floatY: number;
  grabbed: boolean;
  /** Walking out of a doorway/alley across the sidewalk; not yet in the fight. */
  emerging: boolean;
  spawnedAt: number;
  /** Which way they try to step around an obstacle that blocks their path. */
  avoidDir: 1 | -1;
  attackReadyAt: number;
  /** Set when a swing starts; the hit lands ENEMY_WINDUP_MS later. */
  attackStartedAt: number | null;
  /** Snakes only: set while the laser sight is up, before the first round. */
  aimStartedAt: number | null;
  /** Snakes only: rounds left in the current burst, and when the next one leaves the barrel. */
  shotsLeft: number;
  nextShotAt: number;
}

/** A round from a robo-snake. Travels down one depth lane so you can step out of it. */
interface EnemyBullet {
  worldX: number;
  depth: number;
  dir: 1 | -1;
  travelled: number;
}

/** Minigun tracer, tracked in world space so it rides the camera with everything else. */
interface Bullet {
  worldX: number;
  depth: number;
  dir: 1 | -1;
  /** Height above the ground line, in unscaled sprite px. */
  yOff: number;
  travelled: number;
}

interface Pickup {
  worldX: number;
  depth: number;
  spawnedAt: number;
}

interface Floater {
  worldX: number;
  depth: number;
  text: string;
  color: string;
  startedAt: number;
}

function xpToNext(level: number) {
  if (level <= XP_THRESHOLDS.length) return XP_THRESHOLDS[level - 1];
  return XP_THRESHOLDS[XP_THRESHOLDS.length - 1] + (level - XP_THRESHOLDS.length) * 300;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The street does not run dead straight: every so often it turns, which in a
// belt-scroller reads as the whole ground plane sliding up or down the screen
// while you keep walking. Turns alternate direction so the street always comes
// back to level rather than wandering off.
const BEND_SPACING = 2300; // world px between turns
const BEND_RAMP = 820; // how much street the turn takes to complete
const BEND_MIN = 42;
const BEND_MAX = 96;

const bendTotals: number[] = [0, 0]; // offset once bend k has fully completed
function bendTotal(k: number): number {
  while (bendTotals.length <= k) {
    const i = bendTotals.length;
    const r = mulberry32(0x9e3779b9 ^ (i * 2654435761));
    const magnitude = BEND_MIN + r() * (BEND_MAX - BEND_MIN);
    // Each turn heads back against wherever the street has drifted to, so it
    // always comes back to level instead of wandering off over a long run.
    const prev = bendTotals[i - 1];
    const dir = prev > 0 ? -1 : prev < 0 ? 1 : i % 2 === 1 ? 1 : -1;
    bendTotals.push(prev + dir * magnitude);
  }
  return bendTotals[k];
}

/** Vertical offset of the street's ground line at a world x. */
function bendAt(x: number): number {
  if (x <= BEND_SPACING) return 0;
  const k = Math.floor(x / BEND_SPACING);
  const t = Math.min(1, Math.max(0, (x - k * BEND_SPACING) / BEND_RAMP));
  const eased = t * t * (3 - 2 * t);
  return bendTotal(k) + (bendTotal(k + 1) - bendTotal(k)) * eased;
}

/** Builds one street tree's crown. Every kind has its own silhouette and its own green. */
function makeTree(rand: () => number): TreeSpec {
  const kinds: TreeKind[] = ["plane", "pear", "locust", "maple", "ginkgo"];
  const kind = kinds[Math.floor(rand() * kinds.length)];
  // Greens run from the blue-green of a plane tree to the yellow-green of a
  // ginkgo, and every individual tree gets its own shade inside that range.
  const hueRange: Record<TreeKind, [number, number]> = {
    plane: [104, 132],
    pear: [96, 120],
    locust: [78, 98],
    maple: [88, 116],
    ginkgo: [68, 88],
  };
  const [h0, h1] = hueRange[kind];
  const hue = h0 + rand() * (h1 - h0);
  const sat = 22 + rand() * 30;
  const light = 17 + rand() * 12; // night street: everything sits dark
  const barkColor =
    kind === "plane"
      ? "#6b6255" // plane trees have that pale patchy bark
      : kind === "ginkgo"
        ? "#4a4038"
        : ["#3f342b", "#4a3b2e", "#352d26"][Math.floor(rand() * 3)];

  const blobs: TreeSpec["blobs"] = [];
  const limbs: TreeSpec["limbs"] = [];
  const puff = (x: number, y: number, r: number, dl: number) => blobs.push({ x, y, r, dl });
  let trunkH = 34;
  let trunkW = 5;

  if (kind === "plane" || kind === "maple") {
    // Broad rounded crown, widest of the street trees
    trunkH = kind === "plane" ? 38 : 32;
    trunkW = kind === "plane" ? 6.5 : 5.5;
    const spread = 24 + rand() * 8;
    const top = -trunkH - 30 - rand() * 12;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.5;
      const rad = i === 0 ? 0 : 0.55 + rand() * 0.45;
      puff(
        Math.cos(a) * spread * rad,
        top + Math.sin(a) * 13 * rad,
        13 + rand() * 7,
        -5 + rand() * 12
      );
    }
    limbs.push({ x: -9, y: -trunkH - 8 }, { x: 9, y: -trunkH - 10 });
  } else if (kind === "pear" || kind === "ginkgo") {
    // Upright oval — the tree they plant where the sidewalk is narrow
    trunkH = kind === "ginkgo" ? 44 : 38;
    trunkW = 5;
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const y = -trunkH - 8 - t * (34 + rand() * 10);
      const halfW = (kind === "ginkgo" ? 13 : 16) * (1 - Math.abs(t - 0.45) * 0.7);
      puff(-halfW * 0.5, y, 11 + rand() * 4, -4 + rand() * 10);
      puff(halfW * 0.5, y, 11 + rand() * 4, -4 + rand() * 10);
    }
    limbs.push({ x: -5, y: -trunkH - 6 }, { x: 5, y: -trunkH - 6 });
  } else {
    // Honey locust: tall clear trunk, open crown you can see the street through
    trunkH = 46;
    trunkW = 4.5;
    limbs.push({ x: -16, y: -trunkH - 16 }, { x: 15, y: -trunkH - 20 }, { x: 2, y: -trunkH - 26 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rand() * 0.6;
      puff(
        Math.cos(a) * (18 + rand() * 10),
        -trunkH - 20 + Math.sin(a) * 12,
        8 + rand() * 5,
        2 + rand() * 12 // lighter, so the crown reads as thin foliage
      );
    }
    // A little foliage through the middle as well, or the crown reads as a ring
    puff(-4 + rand() * 8, -trunkH - 22 + rand() * 6, 9 + rand() * 4, 1 + rand() * 8);
    puff(-2 + rand() * 6, -trunkH - 14 + rand() * 5, 7 + rand() * 4, 1 + rand() * 8);
  }

  return {
    kind,
    hue,
    sat,
    light,
    trunkH,
    trunkW,
    barkColor,
    limbs,
    blobs,
    grate: rand() < 0.6,
  };
}

function generateChunk(index: number): Chunk {
  const rand = mulberry32((index + 1) * 2654435761);
  const buildingCount = 3 + Math.floor(rand() * 3);
  const buildings: Building[] = [];
  let bx = rand() * 80;
  for (let i = 0; i < buildingCount; i++) {
    const w = 120 + rand() * 180;
    const h = 140 + rand() * 260;
    const hue = 210 + Math.floor(rand() * 40);
    const lit = 6 + Math.floor(rand() * 8);
    const color = `hsl(${hue}, 30%, ${lit}%)`;
    const wins: Building["windows"] = [];
    const cols = 2 + Math.floor(rand() * 3);
    const rows = 3 + Math.floor(rand() * 5);
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++)
        wins.push({
          x: 12 + (c * (w - 24)) / Math.max(cols - 1, 1),
          y: 16 + (r * (h - 32)) / Math.max(rows - 1, 1),
          lit: rand() < 0.22,
        });
    buildings.push({ x: bx, width: w, height: h, color, windows: wins });
    bx += w + 10 + rand() * 40;
  }
  // Street-level row: building fronts broken up by alleys, empty lots and the
  // occasional underpass. Widths fill the chunk exactly so the row is continuous
  // across chunk seams.
  const spans: StreetSpan[] = [];
  const spawnPoints: SpawnPoint[] = [];
  const awningColors = ["#7f1d1d", "#14532d", "#1e3a5f", "#78350f", "#4c1d95"];
  const neonColors = ["#f472b6", "#22d3ee", "#facc15", "#4ade80", "#fb923c"];
  const tagColors = ["#f472b6", "#22d3ee", "#a3e635", "#fb923c", "#c084fc", "#fde047"];
  const makeGraffiti = (atX: number, spanW: number, count: number, maxH: number): Graffiti[] => {
    const tags: Graffiti[] = [];
    for (let g = 0; g < count; g++) {
      const gw = 26 + rand() * 46;
      tags.push({
        x: atX + 8 + rand() * Math.max(4, spanW - gw - 16),
        y: 6 + rand() * Math.max(6, maxH - 24),
        w: gw,
        h: 12 + rand() * 12,
        color: tagColors[Math.floor(rand() * tagColors.length)],
        style: Math.floor(rand() * 3) as 0 | 1 | 2,
      });
    }
    return tags;
  };

  let fx = 0;
  while (fx < CHUNK_WIDTH) {
    const remaining = CHUNK_WIDTH - fx;
    const roll = rand();

    // An underpass wants a good long run of street
    if (remaining > 520 && fx > 40 && roll < 0.11) {
      const uw = 260 + rand() * 150;
      const pillarXs: number[] = [];
      for (let p = 0; p < 3; p++) pillarXs.push(fx + 30 + p * ((uw - 60) / 2));
      const lightXs: number[] = [];
      const lightCount = Math.max(2, Math.floor(uw / 90));
      for (let l = 0; l < lightCount; l++) lightXs.push(fx + 40 + l * ((uw - 80) / Math.max(1, lightCount - 1)));
      spans.push({ kind: "underpass", x: fx, width: uw, pillarXs, lightXs, graffiti: makeGraffiti(fx, uw, 2 + Math.floor(rand() * 3), 70) });
      spawnPoints.push({ x: fx + uw * 0.25, kind: "alley" });
      spawnPoints.push({ x: fx + uw * 0.75, kind: "alley" });
      fx += uw;
      continue;
    }

    // Empty lot behind a chain-link fence
    if (remaining > 330 && fx > 40 && roll < 0.19) {
      const lw = 130 + rand() * 110;
      const debris: Lot["debris"] = [];
      for (let d = 0; d < 2 + Math.floor(rand() * 3); d++) {
        debris.push({ x: fx + 12 + rand() * (lw - 40), w: 14 + rand() * 30, h: 8 + rand() * 18 });
      }
      const weeds: Lot["weeds"] = [];
      for (let g = 0; g < 5 + Math.floor(rand() * 7); g++) {
        weeds.push({ x: fx + 6 + rand() * (lw - 12), h: 5 + rand() * 9 });
      }
      spans.push({
        kind: "lot",
        x: fx,
        width: lw,
        wallRatio: 0.16 + rand() * 0.16,
        debris,
        weeds,
        graffiti: makeGraffiti(fx, lw, 1 + Math.floor(rand() * 2), 34),
        billboard:
          rand() < 0.45
            ? {
                x: fx + 14 + rand() * Math.max(6, lw - 90),
                width: 60 + rand() * 24,
                color: neonColors[Math.floor(rand() * neonColors.length)],
              }
            : null,
      });
      spawnPoints.push({ x: fx + lw / 2, kind: "alley" });
      fx += lw;
      continue;
    }

    // An alley needs room for a building on either side of it
    if (remaining > 260 && fx > 40 && roll < 0.36) {
      const aw = 46 + rand() * 44;
      spans.push({ kind: "alley", x: fx, width: aw, heightRatio: 0.55 + rand() * 0.3, lampLit: rand() < 0.55 });
      spawnPoints.push({ x: fx + aw / 2, kind: "alley" });
      fx += aw;
      continue;
    }
    // Absorb the remainder rather than leaving a sliver too narrow for a door
    let w = Math.min(remaining, 150 + rand() * 170);
    if (remaining - w < 110) w = remaining;
    const hue = 205 + Math.floor(rand() * 45);
    const sat = 10 + Math.floor(rand() * 16);
    const lig = 9 + Math.floor(rand() * 9);
    const heightRatio = 0.52 + rand() * 0.48;
    // Generous nominal height for laying windows out; rows run from the roof
    // down and the draw clips any that reach the ground floor.
    const height = 460 * heightRatio;

    const doors: Doorway[] = [];
    const doorCount = w > 250 && rand() < 0.55 ? 2 : 1;
    const slot = w / doorCount;
    for (let d = 0; d < doorCount; d++) {
      const dw = 30 + rand() * 14;
      const jitter = Math.max(6, slot - dw - 28);
      doors.push({
        // Keep the whole door inside the facade whatever the width worked out to
        x: Math.min(fx + d * slot + 14 + rand() * jitter, fx + w - dw - 8),
        width: dw,
        height: 56 + rand() * 16,
        lit: rand() < 0.55,
        shop: rand() < 0.5,
      });
    }

    // Upper-storey windows, kept above the ground floor
    const windows: Facade["windows"] = [];
    const cols = Math.max(2, Math.floor(w / 48));
    const rows = Math.max(1, Math.floor((height - GROUND_FLOOR_H - 30) / 44));
    const wW = Math.min(22, (w - 20) / cols - 10);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        windows.push({
          x: fx + 12 + c * ((w - 24) / cols),
          y: 26 + r * 44,
          w: wW,
          h: 26,
          lit: rand() < 0.3,
        });
      }
    }

    // A storefront gets a lit display window in whatever space the doors left
    const rightmostDoor = doors.reduce((m, d) => Math.max(m, d.x + d.width), fx);
    const winGap = fx + w - rightmostDoor - 12;
    const shopWindow =
      winGap > 46 && rand() < 0.6
        ? {
            x: rightmostDoor + 8,
            width: Math.min(winGap - 6, 40 + rand() * 60),
            lit: rand() < 0.7,
            tint: neonColors[Math.floor(rand() * neonColors.length)],
          }
        : null;

    spans.push({
      kind: "facade",
      x: fx,
      width: w,
      heightRatio,
      color: `hsl(${hue}, ${sat}%, ${lig}%)`,
      trimColor: `hsl(${hue}, ${sat}%, ${lig + 9}%)`,
      groundColor: `hsl(${hue}, ${sat}%, ${Math.max(4, lig - 4)}%)`,
      windows,
      doors,
      awningColor: awningColors[Math.floor(rand() * awningColors.length)],
      signColor: rand() < 0.45 ? neonColors[Math.floor(rand() * neonColors.length)] : null,
      signX: fx + 16 + rand() * Math.max(10, w - 70),
      shopWindow,
      bladeSign:
        rand() < 0.35
          ? {
              x: fx + 10 + rand() * Math.max(6, w - 40),
              height: 40 + rand() * 34,
              color: neonColors[Math.floor(rand() * neonColors.length)],
            }
          : null,
      graffiti: rand() < 0.45 ? makeGraffiti(fx, w, 1 + Math.floor(rand() * 2), GROUND_FLOOR_H - 26) : [],
    });
    for (const d of doors) spawnPoints.push({ x: d.x + d.width / 2, kind: "door" });
    fx += w;
  }

  // Chalk, manholes and tar patches scattered over the paving and asphalt
  const marks: GroundMark[] = [];
  const markCount = 3 + Math.floor(rand() * 5);
  for (let m = 0; m < markCount; m++) {
    const r = rand();
    const kind: GroundMark["kind"] =
      r < 0.3 ? "chalk" : r < 0.45 ? "hopscotch" : r < 0.7 ? "manhole" : "patch";
    const onPaving = kind === "chalk" || kind === "hopscotch";
    marks.push({
      x: rand() * CHUNK_WIDTH,
      depth: onPaving ? 0.06 + rand() * (SIDEWALK_DEPTH - 0.07) : SIDEWALK_DEPTH + 0.08 + rand() * 0.6,
      kind,
      size: 0.8 + rand() * 0.6,
      color: kind === "chalk" || kind === "hopscotch" ? ["#e5e7eb", "#fbcfe8", "#bae6fd"][Math.floor(rand() * 3)] : "#000",
    });
  }

  const propCount = 2 + Math.floor(rand() * 4);
  const props: GroundProp[] = [];
  const propColors: Record<PropType, string[]> = {
    trashcan: ["#4a4a4a", "#3a3a3a", "#555", "#606060"],
    dumpster: ["#1a5c1a", "#0e420e", "#1d6b22", "#2d4a0a"],
    car: ["#7a1f1f", "#1f3f7a", "#3a3a3a", "#4a4a1f"],
    tree: ["#3f342b"], // trees carry their own palette on the TreeSpec
  };
  for (let i = 0; i < propCount; i++) {
    const roll = rand();
    const type: PropType = roll < 0.35 ? "trashcan" : roll < 0.65 ? "dumpster" : "car";
    // Bins sit up on the sidewalk against the storefronts, cars park on the
    // asphalt alongside the curb — all of it inside the walkable band, so it is
    // scenery you have to move around either way.
    const depth =
      type === "car"
        ? SIDEWALK_DEPTH + 0.05 + rand() * 0.12
        : 0.07 + rand() * 0.07;
    const size = 0.8 + rand() * 0.5;
    const scale = (MIN_SCALE + depth * (MAX_SCALE - MIN_SCALE)) * size;
    const fp = PROP_FOOTPRINT[type];
    props.push({
      x: rand() * CHUNK_WIDTH,
      depth,
      type,
      color: propColors[type][Math.floor(rand() * propColors[type].length)],
      size,
      halfW: fp.halfW * scale,
      halfD: fp.halfD * scale,
    });
  }
  // Street trees, planted in a line of pits just inside the curb the way a city
  // block does it — evenly spaced, but never so evenly that it looks stamped.
  const treeGap = 130 + rand() * 70;
  for (let tx = 30 + rand() * 90; tx < CHUNK_WIDTH - 30; tx += treeGap + (rand() - 0.5) * 50) {
    if (rand() < 0.12) continue; // the odd empty pit, as on any real block
    const depth = SIDEWALK_DEPTH - 0.045 + rand() * 0.03;
    const size = 0.85 + rand() * 0.45;
    const scale = (MIN_SCALE + depth * (MAX_SCALE - MIN_SCALE)) * size;
    const fp = PROP_FOOTPRINT.tree;
    props.push({
      x: tx,
      depth,
      type: "tree",
      color: "#3f342b",
      size,
      halfW: fp.halfW * scale,
      halfD: fp.halfD * scale,
      tree: makeTree(rand),
    });
  }

  // Props are solid, so keep them apart along x — two overlapping footprints
  // could span the whole road depth and wall the street off completely.
  props.sort((a, b) => a.x - b.x);
  const placed: GroundProp[] = [];
  for (const prop of props) {
    const prev = placed[placed.length - 1];
    // Trees only need room for their trunk; bins and cars need real clearance
    const clear = prev && (prev.type === "tree" || prop.type === "tree") ? 34 : 70;
    if (prev) prop.x = Math.max(prop.x, prev.x + prev.halfW + prop.halfW + clear);
    if (prop.x + prop.halfW > CHUNK_WIDTH) break;
    placed.push(prop);
  }
  return { buildings, props: placed, spans, spawnPoints, marks };
}

// Spray-painted tags. Not letters — just the gesture of them, which reads better
// at this size than any attempt at actual lettering would.
function drawGraffiti(ctx: CanvasRenderingContext2D, tags: Graffiti[], sx: number, spanX: number, baseY: number) {
  for (const g of tags) {
    const gx = sx + (g.x - spanX);
    const gy = baseY - g.y - g.h;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (g.style === 0) {
      // Looping scrawl
      ctx.moveTo(gx, gy + g.h);
      ctx.bezierCurveTo(gx + g.w * 0.2, gy - g.h * 0.3, gx + g.w * 0.45, gy + g.h * 1.2, gx + g.w * 0.6, gy + g.h * 0.4);
      ctx.bezierCurveTo(gx + g.w * 0.75, gy - g.h * 0.2, gx + g.w * 0.9, gy + g.h * 0.9, gx + g.w, gy + g.h * 0.2);
    } else if (g.style === 1) {
      // Angular throw-up
      ctx.moveTo(gx, gy + g.h);
      ctx.lineTo(gx + g.w * 0.25, gy);
      ctx.lineTo(gx + g.w * 0.45, gy + g.h * 0.8);
      ctx.lineTo(gx + g.w * 0.68, gy + g.h * 0.1);
      ctx.lineTo(gx + g.w, gy + g.h * 0.7);
    } else {
      // Fat blob tag with an outline
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = g.color;
      ctx.ellipse(gx + g.w / 2, gy + g.h / 2, g.w / 2, g.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
    }
    ctx.stroke();
    ctx.restore();
  }
}

// A building front standing at the back edge of the sidewalk. baseY is the
// building line; everything is drawn upward from there.
function drawFacade(ctx: CanvasRenderingContext2D, f: Facade, sx: number, baseY: number, maxH: number) {
  const h = Math.max(GROUND_FLOOR_H + 30, maxH * f.heightRatio);
  const top = baseY - h;

  ctx.fillStyle = f.color;
  ctx.fillRect(sx, top, f.width, h);

  // Light falls from the left, so shade toward the right edge
  const shade = ctx.createLinearGradient(sx, 0, sx + f.width, 0);
  shade.addColorStop(0, "rgba(255,255,255,0.045)");
  shade.addColorStop(0.6, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = shade;
  ctx.fillRect(sx, top, f.width, h);

  // Cornice
  ctx.fillStyle = f.trimColor;
  ctx.fillRect(sx, top, f.width, 5);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(sx, top + 5, f.width, 3);

  // Upper windows
  for (const w of f.windows) {
    const wy = top + w.y;
    if (wy + w.h > baseY - GROUND_FLOOR_H - 6) continue;
    ctx.fillStyle = w.lit ? "rgba(252,211,77,0.85)" : "rgba(120,160,200,0.07)";
    ctx.fillRect(sx + (w.x - f.x), wy, w.w, w.h);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + (w.x - f.x), wy, w.w, w.h);
    // Sill
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(sx + (w.x - f.x) - 1, wy + w.h, w.w + 2, 2);
  }

  // Ground floor band
  const gfTop = baseY - GROUND_FLOOR_H;
  ctx.fillStyle = f.groundColor;
  ctx.fillRect(sx, gfTop, f.width, GROUND_FLOOR_H);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(sx, gfTop, f.width, 3);

  for (const d of f.doors) {
    const dx = sx + (d.x - f.x);
    const dy = baseY - d.height;
    // Recess
    ctx.fillStyle = "#08080b";
    ctx.fillRect(dx, dy, d.width, d.height);
    if (d.lit) {
      const inner = ctx.createLinearGradient(0, dy, 0, baseY);
      inner.addColorStop(0, "rgba(253,224,71,0.5)");
      inner.addColorStop(1, "rgba(253,186,71,0.12)");
      ctx.fillStyle = inner;
      ctx.fillRect(dx + 2, dy + 3, d.width - 4, d.height - 3);
    }
    // Frame
    ctx.strokeStyle = f.trimColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(dx - 1, dy - 1, d.width + 2, d.height + 1);

    if (d.shop) {
      // Awning above the entrance
      const aw = d.width + 16;
      const ax = dx - 8;
      const ay = dy - 12;
      ctx.fillStyle = f.awningColor;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + aw, ay);
      ctx.lineTo(ax + aw - 4, ay + 11);
      ctx.lineTo(ax + 4, ay + 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let s = 0; s < aw; s += 8) ctx.fillRect(ax + s + 4, ay, 4, 11);
    }
  }

  // Lit display window beside the entrance
  if (f.shopWindow) {
    const sw = f.shopWindow;
    const wx = sx + (sw.x - f.x);
    const wy = baseY - 62;
    const wh = 46;
    ctx.fillStyle = sw.lit ? "rgba(253,230,138,0.22)" : "rgba(90,120,150,0.1)";
    ctx.fillRect(wx, wy, sw.width, wh);
    if (sw.lit) {
      // Goods on shelves, suggested with a few blocks
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(wx, wy + wh * 0.55, sw.width, 2);
      for (let s = 4; s < sw.width - 6; s += 13) {
        const bh = 6 + ((s * 7) % 9);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(wx + s, wy + wh * 0.55 - bh, 8, bh);
      }
      ctx.fillStyle = sw.tint;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(wx, wy, sw.width, wh * 0.4);
      ctx.globalAlpha = 1;
    }
    // Mullions and frame
    ctx.strokeStyle = f.trimColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(wx, wy, sw.width, wh);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx + sw.width / 2, wy);
    ctx.lineTo(wx + sw.width / 2, wy + wh);
    ctx.stroke();
  }

  if (f.graffiti.length) drawGraffiti(ctx, f.graffiti, sx, f.x, baseY);

  // Neon sign over the storefront
  if (f.signColor) {
    const sgx = sx + (f.signX - f.x);
    const sgy = gfTop - 14;
    ctx.save();
    ctx.shadowColor = f.signColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = f.signColor;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(sgx, sgy, Math.min(54, f.width - 24), 9);
    ctx.restore();
  }

  // Blade sign hanging out perpendicular to the wall
  if (f.bladeSign) {
    const b = f.bladeSign;
    const bx = sx + (b.x - f.x);
    const byTop = gfTop - 20 - b.height;
    ctx.save();
    // Bracket
    ctx.strokeStyle = "#2a2a30";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, byTop + 4);
    ctx.lineTo(bx + 13, byTop + 4);
    ctx.stroke();
    // Board
    ctx.fillStyle = "#111116";
    ctx.fillRect(bx + 9, byTop, 13, b.height);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 10;
    ctx.strokeRect(bx + 9, byTop, 13, b.height);
    // Stacked lettering, suggested as bars
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 0.9;
    for (let ly = byTop + 5; ly < byTop + b.height - 5; ly += 9) {
      ctx.fillRect(bx + 12, ly, 7, 4);
    }
    ctx.restore();
  }
}

// The gap between two buildings — a dark corridor enemies wander out of.
function drawAlley(ctx: CanvasRenderingContext2D, a: Alley, sx: number, baseY: number, maxH: number) {
  const h = maxH * a.heightRatio;
  const top = baseY - h;

  const g = ctx.createLinearGradient(0, top, 0, baseY);
  g.addColorStop(0, "#05050a");
  g.addColorStop(1, "#0d0d14");
  ctx.fillStyle = g;
  ctx.fillRect(sx, top, a.width, h);

  // Side walls converging toward the far end
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.moveTo(sx, top);
  ctx.lineTo(sx + a.width * 0.3, top + h * 0.22);
  ctx.lineTo(sx + a.width * 0.3, baseY);
  ctx.lineTo(sx, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.moveTo(sx + a.width, top);
  ctx.lineTo(sx + a.width * 0.7, top + h * 0.22);
  ctx.lineTo(sx + a.width * 0.7, baseY);
  ctx.lineTo(sx + a.width, baseY);
  ctx.closePath();
  ctx.fill();

  // Alley floor catching a little light from the street
  const floor = ctx.createLinearGradient(0, baseY - 16, 0, baseY);
  floor.addColorStop(0, "rgba(120,130,150,0.03)");
  floor.addColorStop(1, "rgba(150,160,180,0.14)");
  ctx.fillStyle = floor;
  ctx.fillRect(sx + a.width * 0.28, baseY - 16, a.width * 0.44, 16);

  if (a.lampLit) {
    // Wall lamp part way down
    const lx = sx + a.width * 0.32;
    const ly = top + h * 0.45;
    ctx.save();
    ctx.shadowColor = "rgba(253,224,71,0.9)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(253,224,71,0.8)";
    ctx.fillRect(lx, ly, 4, 5);
    ctx.restore();
    const spill = ctx.createRadialGradient(lx + 2, ly + 3, 1, lx + 2, ly + 3, 34);
    spill.addColorStop(0, "rgba(253,224,71,0.18)");
    spill.addColorStop(1, "rgba(253,224,71,0)");
    ctx.fillStyle = spill;
    ctx.fillRect(sx, ly - 34, a.width, 68);
  }
}

// A demolished plot: low back wall, rubble and weeds, fenced off from the street.
function drawLot(ctx: CanvasRenderingContext2D, l: Lot, sx: number, baseY: number, maxH: number) {
  const wallH = maxH * l.wallRatio;

  // Open sky behind, hazed at the back of the plot
  const back = ctx.createLinearGradient(0, baseY - wallH - 40, 0, baseY);
  back.addColorStop(0, "rgba(12,16,38,0.85)");
  back.addColorStop(1, "#0a0a10");
  ctx.fillStyle = back;
  ctx.fillRect(sx, baseY - wallH - 40, l.width, wallH + 40);

  // Party wall of the surviving building next door, with the ghost of the
  // demolished one's roofline still on it
  ctx.fillStyle = "#15151b";
  ctx.fillRect(sx, baseY - wallH, l.width, wallH);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.moveTo(sx, baseY - wallH * 0.55);
  ctx.lineTo(sx + l.width * 0.42, baseY - wallH * 0.9);
  ctx.lineTo(sx + l.width, baseY - wallH * 0.5);
  ctx.lineTo(sx + l.width, baseY);
  ctx.lineTo(sx, baseY);
  ctx.closePath();
  ctx.fill();

  if (l.graffiti.length) drawGraffiti(ctx, l.graffiti, sx, l.x, baseY);

  if (l.billboard) {
    const b = l.billboard;
    const bx = sx + (b.x - l.x);
    const byTop = baseY - wallH - 26;
    ctx.fillStyle = "#0d0d12";
    ctx.fillRect(bx, byTop, b.width, 26);
    ctx.save();
    ctx.strokeStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, byTop, b.width, 26);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = b.color;
    ctx.fillRect(bx + 6, byTop + 7, b.width * 0.45, 5);
    ctx.fillRect(bx + 6, byTop + 15, b.width * 0.7, 4);
    ctx.restore();
    // Legs
    ctx.fillStyle = "#17171d";
    ctx.fillRect(bx + 8, byTop + 26, 3, 16);
    ctx.fillRect(bx + b.width - 11, byTop + 26, 3, 16);
  }

  // Rubble
  for (const d of l.debris) {
    const dx = sx + (d.x - l.x);
    ctx.fillStyle = "#1e1e24";
    ctx.beginPath();
    ctx.moveTo(dx, baseY);
    ctx.lineTo(dx + d.w * 0.3, baseY - d.h);
    ctx.lineTo(dx + d.w * 0.7, baseY - d.h * 0.6);
    ctx.lineTo(dx + d.w, baseY);
    ctx.closePath();
    ctx.fill();
  }
  // Weeds
  ctx.strokeStyle = "rgba(74,124,60,0.55)";
  ctx.lineWidth = 1;
  for (const wd of l.weeds) {
    const wx = sx + (wd.x - l.x);
    ctx.beginPath();
    ctx.moveTo(wx, baseY);
    ctx.lineTo(wx + 2, baseY - wd.h);
    ctx.stroke();
  }

  // Chain-link fence across the front — posts, rails, and a diamond mesh
  const fenceH = 46;
  const fenceTop = baseY - fenceH;
  ctx.save();
  ctx.strokeStyle = "rgba(160,172,186,0.32)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let mx = sx - fenceH; mx < sx + l.width + fenceH; mx += 9) {
    ctx.moveTo(mx, fenceTop);
    ctx.lineTo(mx + fenceH, baseY);
    ctx.moveTo(mx + fenceH, fenceTop);
    ctx.lineTo(mx, baseY);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, fenceTop, l.width, fenceH);
  ctx.clip();
  ctx.stroke();
  ctx.restore();
  // Rails and posts
  ctx.strokeStyle = "rgba(190,200,212,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, fenceTop);
  ctx.lineTo(sx + l.width, fenceTop);
  ctx.stroke();
  for (let px2 = sx; px2 <= sx + l.width + 1; px2 += Math.max(40, l.width / 3)) {
    ctx.beginPath();
    ctx.moveTo(px2, fenceTop - 3);
    ctx.lineTo(px2, baseY);
    ctx.stroke();
  }
  ctx.restore();
}

// Running under an overpass: tiled wall, support pillars, strip lights, and a
// heavy deck overhead that darkens the street.
function drawUnderpass(ctx: CanvasRenderingContext2D, u: Underpass, sx: number, baseY: number, maxH: number) {
  const wallH = Math.min(maxH, 190);
  const top = baseY - wallH;

  // Back wall
  const wall = ctx.createLinearGradient(0, top, 0, baseY);
  wall.addColorStop(0, "#111119");
  wall.addColorStop(1, "#1a1a22");
  ctx.fillStyle = wall;
  ctx.fillRect(sx, top, u.width, wallH);

  // Tiling
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let ty = top + 16; ty < baseY; ty += 16) {
    ctx.moveTo(sx, ty);
    ctx.lineTo(sx + u.width, ty);
  }
  for (let tx = sx + 20; tx < sx + u.width; tx += 20) {
    ctx.moveTo(tx, top);
    ctx.lineTo(tx, baseY);
  }
  ctx.stroke();

  // Grime creeping up from the base
  const grime = ctx.createLinearGradient(0, baseY - 40, 0, baseY);
  grime.addColorStop(0, "rgba(0,0,0,0)");
  grime.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = grime;
  ctx.fillRect(sx, baseY - 40, u.width, 40);

  if (u.graffiti.length) drawGraffiti(ctx, u.graffiti, sx, u.x, baseY);

  // Support pillars
  for (const p of u.pillarXs) {
    const px2 = sx + (p - u.x);
    ctx.fillStyle = "#0e0e14";
    ctx.fillRect(px2, top, 16, wallH);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(px2, top, 3, wallH);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(px2 + 13, top, 3, wallH);
  }

  // Deck overhead
  ctx.fillStyle = "#08080c";
  ctx.fillRect(sx, top - 34, u.width, 36);
  ctx.fillStyle = "#1c1c24";
  ctx.fillRect(sx, top - 34, u.width, 5);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(sx, top + 2, u.width, 6);

  // Strip lights under the deck
  for (const lxw of u.lightXs) {
    const lx = sx + (lxw - u.x);
    ctx.save();
    ctx.shadowColor = "rgba(190,225,255,0.9)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(214,235,255,0.9)";
    ctx.fillRect(lx, top + 6, 20, 3);
    ctx.restore();
    const cone = ctx.createLinearGradient(0, top + 8, 0, baseY);
    cone.addColorStop(0, "rgba(190,225,255,0.11)");
    cone.addColorStop(1, "rgba(190,225,255,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(lx - 2, top + 8);
    ctx.lineTo(lx + 22, top + 8);
    ctx.lineTo(lx + 38, baseY);
    ctx.lineTo(lx - 18, baseY);
    ctx.closePath();
    ctx.fill();
  }
}

// Small things lying on the ground: kids' chalk on the paving, ironwork and tar
// patches out on the asphalt. Drawn flat, squashed vertically to sit on the plane.
function drawGroundMark(ctx: CanvasRenderingContext2D, m: GroundMark, sx: number, sy: number) {
  const s = m.size;
  ctx.save();
  ctx.translate(sx, sy);
  if (m.kind === "manhole") {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 15 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(140,140,150,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12 * s, 3.8 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9 * s, 0);
    ctx.lineTo(9 * s, 0);
    ctx.stroke();
  } else if (m.kind === "patch") {
    // Tar patch over a filled pothole
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.beginPath();
    ctx.ellipse(-4 * s, 0, 20 * s, 6 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(9 * s, 2 * s, 11 * s, 4 * s, -0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (m.kind === "hopscotch") {
    // Chalked hopscotch grid, flattened onto the paving
    ctx.strokeStyle = m.color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5;
    const cw = 13 * s;
    const chh = 5 * s;
    for (let i = 0; i < 4; i++) {
      ctx.strokeRect(-cw / 2, -i * chh - chh, cw, chh);
    }
    ctx.strokeRect(-cw, -4 * chh - chh, cw, chh);
    ctx.strokeRect(0, -4 * chh - chh, cw, chh);
  } else {
    // Loose chalk scrawl
    ctx.strokeStyle = m.color;
    ctx.globalAlpha = 0.34;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-14 * s, 0);
    ctx.quadraticCurveTo(-5 * s, -6 * s, 2 * s, -1 * s);
    ctx.quadraticCurveTo(9 * s, 4 * s, 15 * s, -2 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8 * s, 4 * s);
    ctx.lineTo(7 * s, 3 * s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShadowAndSprite(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  scale: number,
  draw: (ctx: CanvasRenderingContext2D, scale: number) => void
) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 22 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  draw(ctx, scale);
  ctx.restore();
}

/**
 * Robotic snake, origin (0,0) on the ground. A long body laid out along the
 * street, undulating as it slithers, with the gun mounted on the head itself.
 * Always drawn heading right; the caller flips it. `aimT` runs 0→1 while the
 * laser sight is up, `flash` while a round leaves the barrel.
 */
function drawRoboSnake(
  ctx: CanvasRenderingContext2D,
  s: number,
  t: number,
  opts: { aimT: number | null; flash: number; stunned: boolean }
) {
  const aiming = opts.aimT !== null;
  // It stops weaving to take the shot, so a steady body is the tell that a
  // round is coming.
  const swim = aiming ? 0.25 : 1;
  const SEGMENTS = 26;
  const TAIL_X = -104;
  const NECK_X = 10;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Spine, sampled head-to-tail. Amplitude grows toward the tail so the whole
  // length reads as one travelling wave rather than a wobbling stick.
  const spine: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const k = i / SEGMENTS; // 0 at the neck, 1 at the tail tip
    const x = NECK_X + (TAIL_X - NECK_X) * k;
    const amp = (1.2 + k * 5.5) * swim;
    const y = -6 - Math.sin(x * 0.075 + t * 4.2) * amp;
    // Thickest just behind the head, tapering to a point at the tail
    const r = 1 + 7.2 * Math.pow(Math.max(0, 1 - k), 0.55) * (0.55 + 0.45 * Math.sin(Math.min(1, k * 6)));
    spine.push({ x, y, r });
  }

  // Long ground shadow under the whole body
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(((TAIL_X + NECK_X) / 2) * s, 0, ((NECK_X - TAIL_X) / 2 + 6) * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body: one filled ribbon from the top edge out and the belly edge back
  ctx.beginPath();
  for (let i = 0; i < spine.length; i++) {
    const p = spine[i];
    if (i === 0) ctx.moveTo(p.x * s, (p.y - p.r) * s);
    else ctx.lineTo(p.x * s, (p.y - p.r) * s);
  }
  for (let i = spine.length - 1; i >= 0; i--) {
    const p = spine[i];
    ctx.lineTo(p.x * s, (p.y + p.r) * s);
  }
  ctx.closePath();
  const bodyG = ctx.createLinearGradient(0, -16 * s, 0, 2 * s);
  bodyG.addColorStop(0, "#e2e8f0");
  bodyG.addColorStop(0.4, "#94a3b8");
  bodyG.addColorStop(1, "#475569");
  ctx.fillStyle = bodyG;
  ctx.fill();
  ctx.strokeStyle = "rgba(15,23,42,0.55)";
  ctx.lineWidth = 1 * s;
  ctx.stroke();

  // Plated segments — a seam across the body every few samples
  ctx.strokeStyle = "rgba(15,23,42,0.45)";
  ctx.lineWidth = 1 * s;
  for (let i = 2; i < spine.length - 1; i += 2) {
    const p = spine[i];
    ctx.beginPath();
    ctx.moveTo(p.x * s, (p.y - p.r * 0.9) * s);
    ctx.lineTo(p.x * s, (p.y + p.r * 0.9) * s);
    ctx.stroke();
  }
  // Highlight running the length of the back
  ctx.strokeStyle = "rgba(241,245,249,0.5)";
  ctx.lineWidth = 1.4 * s;
  ctx.beginPath();
  for (let i = 0; i < spine.length; i++) {
    const p = spine[i];
    const y = (p.y - p.r * 0.55) * s;
    if (i === 0) ctx.moveTo(p.x * s, y);
    else ctx.lineTo(p.x * s, y);
  }
  ctx.stroke();

  // Neck, lifting the head clear of the road so the barrel sits at chest height
  const headY = -30 - Math.sin(t * 3.1) * 1.4 * swim;
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 9 * s;
  ctx.beginPath();
  ctx.moveTo(NECK_X * s, -6 * s);
  ctx.quadraticCurveTo(18 * s, -14 * s, 20 * s, (headY + 3) * s);
  ctx.stroke();
  ctx.strokeStyle = "rgba(226,232,240,0.45)";
  ctx.lineWidth = 2.6 * s;
  ctx.beginPath();
  ctx.moveTo((NECK_X - 2) * s, -6 * s);
  ctx.quadraticCurveTo(15.5 * s, -14 * s, 17 * s, (headY + 3) * s);
  ctx.stroke();

  // Head, with the weapon built into it
  ctx.save();
  ctx.translate(20 * s, headY * s);
  const headG = ctx.createLinearGradient(0, -8 * s, 0, 8 * s);
  headG.addColorStop(0, "#e2e8f0");
  headG.addColorStop(0.5, "#94a3b8");
  headG.addColorStop(1, "#475569");
  ctx.fillStyle = headG;
  ctx.beginPath();
  ctx.moveTo(-11 * s, -7 * s);
  ctx.lineTo(11 * s, -6 * s);
  ctx.lineTo(17 * s, 0);
  ctx.lineTo(11 * s, 6 * s);
  ctx.lineTo(-11 * s, 7.5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(15,23,42,0.6)";
  ctx.lineWidth = 1 * s;
  ctx.stroke();
  // Jaw seam
  ctx.beginPath();
  ctx.moveTo(-7 * s, 3 * s);
  ctx.lineTo(15 * s, 1 * s);
  ctx.stroke();
  // Forked tongue, flicking between shots
  if (!aiming && Math.sin(t * 6) > 0.7) {
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(17 * s, 2.5 * s);
    ctx.lineTo(24 * s, 2 * s);
    ctx.moveTo(22 * s, 2.2 * s);
    ctx.lineTo(25 * s, 4.5 * s);
    ctx.stroke();
  }

  // Gun, mounted along the top of the skull: receiver, magazine, barrel
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(-7 * s, -11 * s, 17 * s, 5.5 * s); // receiver
  ctx.fillStyle = "#111827";
  ctx.fillRect(-3.5 * s, -15 * s, 4.5 * s, 4 * s); // magazine standing proud of it
  ctx.fillStyle = "#374151";
  ctx.fillRect(9 * s, -10.5 * s, 16 * s, 3.6 * s); // barrel
  ctx.fillRect(24 * s, -11.5 * s, 4 * s, 5.5 * s); // muzzle brake
  // Mounting straps back onto the head
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.6 * s;
  for (const mx of [-4, 6]) {
    ctx.beginPath();
    ctx.moveTo(mx * s, -6 * s);
    ctx.lineTo(mx * s, -1 * s);
    ctx.stroke();
  }
  // Sensor eye — amber on patrol, hot red once it has you
  const eye = opts.stunned ? "#facc15" : aiming ? "#ef4444" : "#f59e0b";
  ctx.save();
  ctx.shadowColor = eye;
  ctx.shadowBlur = (aiming ? 12 : 6) * s;
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.ellipse(5 * s, -1.5 * s, 2.8 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (opts.flash > 0) {
    ctx.fillStyle = `rgba(254,240,138,${opts.flash})`;
    ctx.beginPath();
    ctx.moveTo(28 * s, -8.7 * s);
    ctx.lineTo(40 * s, -8.7 * s - 5 * s * opts.flash);
    ctx.lineTo(45 * s, -8.7 * s);
    ctx.lineTo(40 * s, -8.7 * s + 5 * s * opts.flash);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${opts.flash * 0.8})`;
    ctx.beginPath();
    ctx.arc(30 * s, -8.7 * s, 3.5 * s * opts.flash, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A street tree, origin (0,0) at the base of the trunk. `sway` drifts the crown in the wind. */
function drawStreetTree(ctx: CanvasRenderingContext2D, s: number, t: TreeSpec, sway: number) {
  const { hue, sat, light } = t;
  const leaf = (dl: number, alpha = 1) =>
    `hsla(${hue}, ${sat}%, ${Math.max(6, Math.min(52, light + dl))}%, ${alpha})`;

  // Tree pit: soil ring, and a grate on the blocks that got the nicer treatment
  ctx.fillStyle = "#1a1512";
  ctx.beginPath();
  ctx.ellipse(0, 0, 15 * s, 5.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  if (t.grate) {
    ctx.strokeStyle = "rgba(120,120,130,0.35)";
    ctx.lineWidth = 1 * s;
    for (const gx of [-9, -4.5, 0, 4.5, 9]) {
      ctx.beginPath();
      ctx.moveTo(gx * s, -3.4 * s);
      ctx.lineTo(gx * s, 3.4 * s);
      ctx.stroke();
    }
  }

  // Trunk — tapered, with the light side facing the streetlamps
  const th = t.trunkH * s;
  const tw = t.trunkW * s;
  ctx.fillStyle = t.barkColor;
  ctx.beginPath();
  ctx.moveTo(-tw, 0);
  ctx.lineTo(-tw * 0.6 + sway * 0.25, -th);
  ctx.lineTo(tw * 0.6 + sway * 0.25, -th);
  ctx.lineTo(tw, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.09)";
  ctx.fillRect(-tw, -th, tw * 0.55, th);
  if (t.kind === "plane") {
    // Plane-tree bark sheds in patches — a couple of pale flecks sells it
    ctx.fillStyle = "rgba(200,196,180,0.22)";
    ctx.fillRect(-tw * 0.2, -th * 0.75, tw * 0.7, th * 0.22);
    ctx.fillRect(-tw * 0.5, -th * 0.4, tw * 0.5, th * 0.15);
  }

  // Limbs under the crown
  ctx.strokeStyle = t.barkColor;
  ctx.lineCap = "round";
  for (const l of t.limbs) {
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(sway * 0.2, -th);
    ctx.quadraticCurveTo(l.x * 0.5 * s + sway * 0.4, (-th + l.y * 0.2) * 1, l.x * s + sway * 0.7, l.y * s);
    ctx.stroke();
  }

  // Crown: overlapping blobs, each a slightly different green
  for (const b of t.blobs) {
    ctx.fillStyle = leaf(b.dl);
    ctx.beginPath();
    ctx.ellipse(b.x * s + sway, b.y * s, b.r * s, b.r * 0.86 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sodium-lamp catchlight along the top of the crown
  for (const b of t.blobs) {
    if (b.dl < 4) continue;
    ctx.fillStyle = `hsla(${hue - 12}, ${sat + 10}%, ${Math.min(60, light + b.dl + 14)}%, 0.35)`;
    ctx.beginPath();
    ctx.ellipse(
      b.x * s + sway - b.r * 0.25 * s,
      b.y * s - b.r * 0.3 * s,
      b.r * 0.5 * s,
      b.r * 0.34 * s,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

/** Six-barrel minigun held at (hx, hy), pointing right; the caller has already flipped for facing. */
function drawMinigun(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  s: number,
  spin: number,
  firing: boolean
) {
  ctx.save();
  ctx.translate(hx, hy);
  // Receiver
  ctx.fillStyle = "#334155";
  ctx.fillRect(-6 * s, -5 * s, 20 * s, 10 * s);
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(-6 * s, -5 * s, 20 * s, 3 * s);
  // Ammo drum under the receiver
  ctx.fillStyle = "#475569";
  ctx.beginPath();
  ctx.arc(-1 * s, 8 * s, 6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.2 * s;
  ctx.stroke();
  // Belt feed
  ctx.strokeStyle = "#a16207";
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(-1 * s, 3 * s);
  ctx.lineTo(2 * s, 0);
  ctx.stroke();
  // Rotating barrel cluster: six barrels around the bore axis, seen end-on, so
  // the spin reads as the barrels swapping top and bottom.
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = "butt";
  for (let i = 0; i < 6; i++) {
    const a = spin + (i * Math.PI) / 3;
    const off = Math.sin(a) * 3.4 * s;
    const shade = 0.45 + 0.35 * (1 + Math.cos(a)) * 0.5;
    ctx.strokeStyle = `rgba(148,163,184,${shade})`;
    ctx.beginPath();
    ctx.moveTo(13 * s, off);
    ctx.lineTo(30 * s, off);
    ctx.stroke();
  }
  // Barrel shroud at the muzzle end
  ctx.fillStyle = "#475569";
  ctx.fillRect(28 * s, -5 * s, 4 * s, 10 * s);
  if (firing) {
    const flare = 0.6 + 0.4 * Math.sin(spin * 5);
    ctx.fillStyle = `rgba(253,224,71,${flare})`;
    ctx.beginPath();
    ctx.moveTo(32 * s, 0);
    ctx.lineTo(46 * s, -6 * s * flare);
    ctx.lineTo(52 * s, 0);
    ctx.lineTo(46 * s, 6 * s * flare);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${flare * 0.8})`;
    ctx.beginPath();
    ctx.arc(35 * s, 0, 4 * s * flare, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Banana-yellow-hilted blade held at (hx, hy). `angle` is null when sheathed at rest. */
function drawSword(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  s: number,
  angle: number | null
) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle ?? -Math.PI * 0.42); // resting: blade shouldered, tip up
  // Grip
  ctx.fillStyle = "#78350f";
  ctx.fillRect(-6 * s, -1.6 * s, 8 * s, 3.2 * s);
  // Pommel
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(-7 * s, 0, 2.2 * s, 0, Math.PI * 2);
  ctx.fill();
  // Crossguard
  ctx.fillRect(1 * s, -6 * s, 3 * s, 12 * s);
  // Blade
  const blade = ctx.createLinearGradient(4 * s, 0, 40 * s, 0);
  blade.addColorStop(0, "#e2e8f0");
  blade.addColorStop(0.55, "#f8fafc");
  blade.addColorStop(1, "#cbd5e1");
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(4 * s, -3.2 * s);
  ctx.lineTo(34 * s, -2.4 * s);
  ctx.lineTo(42 * s, 0);
  ctx.lineTo(34 * s, 2.4 * s);
  ctx.lineTo(4 * s, 3.2 * s);
  ctx.closePath();
  ctx.fill();
  // Fuller
  ctx.strokeStyle = "rgba(100,116,139,0.7)";
  ctx.lineWidth = 0.9 * s;
  ctx.beginPath();
  ctx.moveTo(6 * s, 0);
  ctx.lineTo(33 * s, 0);
  ctx.stroke();
  ctx.restore();
}

// Draws a person figure. Origin (0,0) = feet. Always faces right; caller scales(-1,1) to flip.
function drawPerson(
  ctx: CanvasRenderingContext2D,
  s: number,
  opts: {
    walkPhase: number;
    skinColor: string;
    shirtColor: string;
    pantsColor: string;
    hairColor: string;
    comboHit?: 0 | 1 | 2;
    comboProgress?: number;
    stunned?: boolean;
    /** Earned weapon held in the hands, drawn over the arms. */
    weapon?: "minigun" | "sword";
    /** Barrel rotation for the minigun, in radians. */
    weaponSpin?: number;
    firing?: boolean;
    /** 0→1 through a sword swing; null when the blade is at rest. */
    swordT?: number | null;
    swordSpin?: boolean;
  }
) {
  const { walkPhase: wp, skinColor, shirtColor, pantsColor, hairColor } = opts;
  const cp = opts.comboProgress ?? 0;
  const stunned = opts.stunned ?? false;

  ctx.lineCap = "round";

  // Legs
  ctx.lineWidth = 7 * s;
  ctx.strokeStyle = pantsColor;
  const leftLeg = stunned ? 0 : opts.comboHit === 2 ? -6 : -wp * 8;
  const rightLeg = stunned ? 0 : opts.comboHit === 2 ? cp * 30 : wp * 8;
  ctx.beginPath();
  ctx.moveTo(-5 * s, -20 * s);
  ctx.lineTo((-5 + leftLeg) * s, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5 * s, -20 * s);
  ctx.lineTo((5 + rightLeg) * s, 0);
  ctx.stroke();

  // Torso
  ctx.fillStyle = shirtColor;
  ctx.fillRect(-9 * s, -44 * s, 18 * s, 24 * s);

  // Arms
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = skinColor;
  // A weapon in hand overrides the empty-handed arm poses: both hands come up
  // onto the grip so the gun/blade reads as held rather than floating.
  const holding = opts.weapon !== undefined;
  const recoil = opts.weapon === "minigun" && opts.firing ? Math.sin((opts.weaponSpin ?? 0) * 3) * 1.6 : 0;
  const swingA =
    opts.swordT === null || opts.swordT === undefined
      ? null
      : opts.swordSpin
        ? -Math.PI * 0.6 + opts.swordT * Math.PI * 2
        : -Math.PI * 0.5 + opts.swordT * Math.PI * 0.75;
  const rightArmDx = holding
    ? opts.weapon === "minigun"
      ? 16 - recoil
      : 13
    : opts.comboHit === 0
      ? 9 + cp * 22
      : opts.comboHit === 1
        ? 9 + cp * 10
        : 9 + (stunned ? 0 : wp * 8);
  const rightArmDy = holding ? (opts.weapon === "minigun" ? -32 : -33) : -26;
  const leftArmDx = holding
    ? opts.weapon === "minigun"
      ? 4 - recoil
      : 2
    : opts.comboHit === 1
      ? -(9 + cp * 14)
      : -(9 + (stunned ? 0 : wp * 6));
  const leftArmDy = holding ? -30 : -26;
  ctx.beginPath();
  ctx.moveTo(9 * s, -38 * s);
  ctx.lineTo(rightArmDx * s, rightArmDy * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9 * s, -38 * s);
  ctx.lineTo(leftArmDx * s, leftArmDy * s);
  ctx.stroke();

  if (opts.weapon === "minigun") {
    drawMinigun(ctx, (rightArmDx - 2) * s, rightArmDy * s, s, opts.weaponSpin ?? 0, opts.firing ?? false);
  } else if (opts.weapon === "sword") {
    drawSword(ctx, rightArmDx * s, rightArmDy * s, s, swingA);
  }

  // Head
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(0, -54 * s, 10 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();

  // Hair
  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.arc(0, -57 * s, 8 * s, Math.PI, 0);
  ctx.fill();

  // Eye (right side = facing direction)
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(5 * s, -53 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = stunned ? "#dc2626" : "#111";
  ctx.beginPath();
  ctx.arc(6 * s, -53 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Stun stars
  if (stunned) {
    ctx.fillStyle = "#facc15";
    ctx.font = `${8 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("★", 0, -68 * s);
  }
}

function drawEnemyPerson(
  ctx: CanvasRenderingContext2D,
  s: number,
  walkT: number,
  stunned: boolean,
  opts: { attackT?: number; facing?: 1 | -1 } = {}
) {
  ctx.lineCap = "round";
  const wp = stunned ? 0 : Math.sin(walkT * 6) * 0.8;
  // attackT ramps 0→1 through the wind-up: cock back, then throw
  const at = opts.attackT ?? 0;
  const face = opts.facing ?? 1;
  const swing = at > 0 ? (at < 0.7 ? -at * 0.5 : (at - 0.7) / 0.3) : 0;

  // Legs
  ctx.lineWidth = 7 * s;
  ctx.strokeStyle = "#1c1c1c";
  ctx.beginPath();
  ctx.moveTo(-5 * s, -20 * s);
  ctx.lineTo((-5 - wp * 8) * s, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5 * s, -20 * s);
  ctx.lineTo((5 + wp * 8) * s, 0);
  ctx.stroke();

  // Torso
  ctx.fillStyle = "#7a1f1f";
  ctx.fillRect(-9 * s, -44 * s, 18 * s, 24 * s);

  // Arms (menacing — both angled forward; the lead arm throws the punch)
  ctx.lineWidth = 5 * s;
  ctx.strokeStyle = "#991b1b";
  const reach = 15 + swing * 22;
  ctx.beginPath();
  ctx.moveTo(-9 * s, -36 * s);
  ctx.lineTo((-15 - swing * 4) * s, -24 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(9 * s, -36 * s);
  ctx.lineTo(face * reach * s, (-24 - swing * 6) * s);
  ctx.stroke();

  // Head
  ctx.fillStyle = "#991b1b";
  ctx.beginPath();
  ctx.arc(0, -52 * s, 9 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  ctx.fillStyle = "#450a0a";
  ctx.beginPath();
  ctx.arc(0, -55 * s, 7 * s, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(3 * s, -52 * s, 2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = stunned ? "#facc15" : "#dc2626";
  ctx.beginPath();
  ctx.arc(4 * s, -52 * s, 1.2 * s, 0, Math.PI * 2);
  ctx.fill();

  if (stunned) {
    ctx.fillStyle = "#facc15";
    ctx.font = `${8 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("★", 0, -64 * s);
  } else if (at > 0 && at < 0.7) {
    // Wind-up tell so an incoming hit can be dodged
    ctx.fillStyle = "#fca5a5";
    ctx.font = `bold ${11 * s}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("!", 0, -66 * s);
  }
}

function drawParrot(ctx: CanvasRenderingContext2D, px: number, py: number, s: number, grey: boolean, flipped = false) {
  ctx.save();
  ctx.translate(px, py);
  if (flipped) ctx.scale(-1, 1);
  ctx.globalAlpha = grey ? 0.35 : 1;
  // Body
  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.ellipse(0, 0, 7 * s, 10 * s, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Wing
  ctx.fillStyle = "#15803d";
  ctx.beginPath();
  ctx.ellipse(-3 * s, 1 * s, 5 * s, 8 * s, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = "#dc2626";
  ctx.beginPath();
  ctx.arc(4 * s, -9 * s, 6 * s, 0, Math.PI * 2);
  ctx.fill();
  // Beak
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(10 * s, -9 * s);
  ctx.lineTo(14 * s, -7 * s);
  ctx.lineTo(10 * s, -6 * s);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(6 * s, -10 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGoldfishCar(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  // Car body
  ctx.fillStyle = "#b91c1c";
  ctx.fillRect(cx - 55, cy - 28, 110, 28);
  // Roof
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(cx - 38, cy - 48, 76, 22);
  // Windshields
  ctx.fillStyle = "rgba(147,210,255,0.7)";
  ctx.fillRect(cx - 26, cy - 46, 28, 16);
  ctx.fillRect(cx + 2, cy - 46, 22, 16);
  // Wheels
  for (const wx of [-36, 36]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(cx + wx, cy, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(cx + wx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Goldfish driver (orange oval out the window)
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.ellipse(cx + 16, cy - 44, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Fish tail
  ctx.fillStyle = "#fb923c";
  ctx.beginPath();
  ctx.moveTo(cx + 6, cy - 44);
  ctx.lineTo(cx - 4, cy - 50);
  ctx.lineTo(cx - 4, cy - 38);
  ctx.closePath();
  ctx.fill();
  // Fin
  ctx.beginPath();
  ctx.moveTo(cx + 12, cy - 52);
  ctx.lineTo(cx + 20, cy - 60);
  ctx.lineTo(cx + 26, cy - 52);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(cx + 23, cy - 46, 2, 0, Math.PI * 2);
  ctx.fill();
  // Tiny hat
  ctx.fillStyle = "#1e1b4b";
  ctx.fillRect(cx + 12, cy - 62, 12, 7);
  ctx.fillRect(cx + 9, cy - 63, 18, 3);
  // Gun barrel out window
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + 26, cy - 40);
  ctx.lineTo(cx + 46, cy - 36);
  ctx.stroke();
  ctx.restore();
}

function drawBanana(ctx: CanvasRenderingContext2D, s: number, spin: number) {
  ctx.save();
  ctx.scale(Math.cos(spin) >= 0 ? 1 : -1, 1);
  // Crescent body
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.moveTo(-11 * s, -4 * s);
  ctx.quadraticCurveTo(0, 14 * s, 11 * s, -4 * s);
  ctx.quadraticCurveTo(0, 6 * s, -11 * s, -4 * s);
  ctx.closePath();
  ctx.fill();
  // Shading along the inner curve
  ctx.strokeStyle = "rgba(180,120,0,0.55)";
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.moveTo(-11 * s, -4 * s);
  ctx.quadraticCurveTo(0, 14 * s, 11 * s, -4 * s);
  ctx.stroke();
  // Tips
  ctx.fillStyle = "#78350f";
  ctx.beginPath();
  ctx.arc(-11 * s, -4 * s, 1.8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(11 * s, -4 * s, 1.8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function ShootSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Everything below draws in a logical viewport shrunk by CAMERA_ZOOM and
    // scaled back up by the canvas transform — a straight camera zoom-in.
    const resize = () => {
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      width = cssW / CAMERA_ZOOM;
      height = cssH / CAMERA_ZOOM;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr * CAMERA_ZOOM, 0, 0, dpr * CAMERA_ZOOM, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const keys = new Set<string>();

    // Title screen / game over both use the same button rect
    let titlePhase: "title" | "playing" | "gameover" = "title";
    let gameOverAt = 0;
    // Don't let a key held at the moment of death instantly restart the run
    const restartArmed = () => titlePhase !== "gameover" || performance.now() - gameOverAt > 800;
    const playBtn = { x: 0, y: 0, w: 0, h: 0 };
    const onCanvasClick = (e: MouseEvent) => {
      if (titlePhase === "playing" || !restartArmed()) return;
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / CAMERA_ZOOM;
      const cy = (e.clientY - rect.top) / CAMERA_ZOOM;
      if (cx >= playBtn.x && cx <= playBtn.x + playBtn.w && cy >= playBtn.y && cy <= playBtn.y + playBtn.h) {
        if (titlePhase === "gameover") restartGame();
        titlePhase = "playing";
        canvas.style.cursor = "default";
      }
    };
    const onCanvasMouseMove = (e: MouseEvent) => {
      if (titlePhase === "playing") return;
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / CAMERA_ZOOM;
      const cy = (e.clientY - rect.top) / CAMERA_ZOOM;
      canvas.style.cursor =
        cx >= playBtn.x && cx <= playBtn.x + playBtn.w && cy >= playBtn.y && cy <= playBtn.y + playBtn.h
          ? "pointer"
          : "default";
    };
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("mousemove", onCanvasMouseMove);

    // On-screen controls, shown only where there is no mouse — tablets and
    // phones — and never on desktop.
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    let touchMode = coarseQuery.matches;
    const onPointerKind = (e: MediaQueryListEvent) => {
      touchMode = e.matches;
    };
    coarseQuery.addEventListener("change", onPointerKind);

    const STICK_RADIUS = 52;
    const SHOOT_RADIUS = 44;
    const touch = {
      moveId: null as number | null,
      moveOrigin: { x: 0, y: 0 },
      moveVec: { x: 0, y: 0 },
      shootId: null as number | null,
      shootDown: false,
    };
    /** Phone-sized viewports get tighter spacing so nothing collides. */
    const compactUI = () => width < 430 || height < 360;
    /** Resting positions: stick under the right hand, hit button under the left. */
    const touchLayout = () => {
      const inset = compactUI() ? 62 : 88;
      return {
        stick: { x: width - inset - 4, y: height - inset },
        shoot: { x: inset + 2, y: height - inset },
      };
    };
    /** Tap targets for the attack slots, refreshed by the HUD each frame. */
    const attackRects: { id: SlotId; x: number; y: number; w: number; h: number }[] = [];

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) / CAMERA_ZOOM, y: (e.clientY - rect.top) / CAMERA_ZOOM };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || titlePhase !== "playing") return;
      const p = toLocal(e);
      // Tapping an unlocked slot switches attack
      for (const r of attackRects) {
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          if (state.player.level >= r.id) state.selectedAttack = r.id;
          e.preventDefault();
          return;
        }
      }
      // Whole halves are live, not just the drawn circles — a thumb that lands
      // near enough still works, the way it does in Roblox.
      if (p.x < width * 0.5) {
        touch.shootId = e.pointerId;
        touch.shootDown = true;
      } else {
        touch.moveId = e.pointerId;
        touch.moveOrigin = p; // floating stick: it appears where you press
        touch.moveVec = { x: 0, y: 0 };
      }
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (touch.moveId !== e.pointerId) return;
      const p = toLocal(e);
      const dx = p.x - touch.moveOrigin.x;
      const dy = p.y - touch.moveOrigin.y;
      const dist = Math.hypot(dx, dy);
      const clamp = dist > STICK_RADIUS ? STICK_RADIUS / dist : 1;
      touch.moveVec = { x: (dx * clamp) / STICK_RADIUS, y: (dy * clamp) / STICK_RADIUS };
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (touch.moveId === e.pointerId) {
        touch.moveId = null;
        touch.moveVec = { x: 0, y: 0 };
      }
      if (touch.shootId === e.pointerId) {
        touch.shootId = null;
        touch.shootDown = false;
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const chunks = new Map<number, Chunk>();
    const getChunk = (i: number) => {
      if (!chunks.has(i)) chunks.set(i, generateChunk(i));
      return chunks.get(i)!;
    };

    // Solid-prop collision: axis-separated AABB test between ground footprints.
    // Both half-extents are screen pixels; depth is converted with the height of
    // the walkable band so the boxes match what you see at any viewport size.
    const overlapsProp = (x: number, depth: number, halfW: number, halfD: number) => {
      const depthSpan = height * (1 - HORIZON_RATIO);
      const ci = Math.floor(x / CHUNK_WIDTH);
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0) continue;
        for (const prop of getChunk(i).props) {
          const px = i * CHUNK_WIDTH + prop.x;
          if (
            Math.abs(x - px) < halfW + prop.halfW &&
            Math.abs(depth - prop.depth) * depthSpan < halfD + prop.halfD
          ) {
            return true;
          }
        }
      }
      return false;
    };

    // Enemies come out of a doorway or alley you are walking toward. If none is
    // in range (or they'd appear on top of you), fall back to walking in from
    // off-screen ahead.
    const pickSpawnPoint = () => {
      const playerX = state.player.worldX;
      const from = playerX - width * 0.15;
      const to = playerX + width * 0.85;
      const candidates: number[] = [];
      for (let ci = Math.floor(from / CHUNK_WIDTH); ci <= Math.floor(to / CHUNK_WIDTH); ci++) {
        if (ci < 0) continue;
        for (const sp of getChunk(ci).spawnPoints) {
          const wx = ci * CHUNK_WIDTH + sp.x;
          if (wx >= from && wx <= to && Math.abs(wx - playerX) > 130) candidates.push(wx);
        }
      }
      if (candidates.length === 0) {
        return { x: playerX + width * 0.8 + Math.random() * 220, emerging: false };
      }
      return { x: candidates[Math.floor(Math.random() * candidates.length)], emerging: true };
    };

    let storedHigh = 0;
    try {
      storedHigh = Number(window.localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    } catch {
      storedHigh = 0;
    }

    const state = {
      player: {
        worldX: (width * ANCHOR_X_RATIO) || 300,
        depth: 0.6,
        facing: 1 as 1 | -1,
        level: 1,
        xp: 0,
        hp: PLAYER_MAX_HP,
        invulnUntil: 0,
        hurtUntil: 0,
        regenAt: 0,
      },
      selectedAttack: 1 as SlotId,
      attackReadyAt: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<SlotId, number>,
      shakeUntil: 0,
      enemies: [] as Enemy[],
      nextEnemyId: 0,
      nextSpawnAt: 0,
      walkTime: 0,
      isMoving: false,
      score: 0,
      highScore: storedHigh,
      scorePulseUntil: 0,
      pickups: [] as Pickup[],
      bullets: [] as Bullet[],
      enemyBullets: [] as EnemyBullet[],
      nextSnakeAt: 0,
      floaters: [] as Floater[],
    };

    // Don't leave the player standing inside a prop
    const settlePlayer = () => {
      const s = MIN_SCALE + state.player.depth * (MAX_SCALE - MIN_SCALE);
      const hw = ACTOR_HALF_W * s;
      const hd = ACTOR_HALF_D * s;
      let guard = 0;
      while (overlapsProp(state.player.worldX, state.player.depth, hw, hd) && guard++ < 100) {
        state.player.worldX += 20;
      }
    };
    settlePlayer();

    const addScore = (amount: number, worldX: number, depth: number, color: string, now: number) => {
      state.score += amount;
      state.scorePulseUntil = now + 260;
      if (state.score > state.highScore) {
        state.highScore = state.score;
        try {
          window.localStorage.setItem(HIGH_SCORE_KEY, String(state.highScore));
        } catch {
          /* storage unavailable — high score just won't persist */
        }
      }
      state.floaters.push({ worldX, depth, text: `+${amount}`, color, startedAt: now });
    };

    const damagePlayer = (dmg: number, fromX: number, now: number) => {
      if (titlePhase !== "playing" || now < state.player.invulnUntil) return;
      state.player.hp = Math.max(0, state.player.hp - dmg);
      state.player.invulnUntil = now + PLAYER_IFRAME_MS;
      state.player.hurtUntil = now + 220;
      state.player.regenAt = now + HP_REGEN_DELAY_MS; // any hit restarts the clock
      state.shakeUntil = now + 240;
      state.floaters.push({
        worldX: state.player.worldX,
        depth: state.player.depth,
        text: `-${dmg}`,
        color: "#f87171",
        startedAt: now,
      });
      // Knocked back away from whoever landed it, unless a prop is in the way
      const away = state.player.worldX >= fromX ? 1 : -1;
      const s = MIN_SCALE + state.player.depth * (MAX_SCALE - MIN_SCALE);
      const knockedTo = Math.max(0, state.player.worldX + away * 30);
      if (!overlapsProp(knockedTo, state.player.depth, ACTOR_HALF_W * s, ACTOR_HALF_D * s)) {
        state.player.worldX = knockedTo;
      }
      if (state.player.hp <= 0) {
        titlePhase = "gameover";
        gameOverAt = now;
        // Freeze the street on a clean tableau
        carState.active = false;
        parrot.phase = "idle";
        parrot.targetId = null;
        combo.visual = null;
        minigun.firing = false;
        state.bullets = [];
        state.enemyBullets = [];
        sword.swingStartedAt = null;
        for (const e of state.enemies) e.grabbed = false;
      }
    };

    // Combo state (attack 1: jab → hook → kick)
    const combo = {
      step: 0 as 0 | 1 | 2,
      lastHitAt: 0,
      visual: null as { step: 0 | 1 | 2; startedAt: number; duration: number } | null,
    };

    // Parrot state (attack 2): fly out → carry the enemy way up → slam them down
    const parrot = {
      phase: "idle" as "idle" | "flying-out" | "lifting" | "slamming" | "returning" | "cooldown",
      phaseStartedAt: 0,
      targetId: null as number | null,
      fromX: 0,
      fromY: 0,
      pScreenX: 0,
      pScreenY: 0,
      liftHeight: 0,
    };

    // Car state (attack 3)
    const carState = {
      active: false,
      startedAt: 0,
      screenY: 0,
      hitIds: new Set<number>(),
    };

    // Minigun state (attack 4): spin up, hose the street, spin down
    const minigun = {
      firing: false,
      startedAt: 0,
      lastShotAt: 0,
    };

    // Sword state (attack 5): slash, slash, spin
    const sword = {
      step: 0 as 0 | 1 | 2,
      swingStartedAt: null as number | null,
      spin: false,
    };

    const gainXp = (amount: number) => {
      state.player.xp += amount;
      let t = xpToNext(state.player.level);
      while (state.player.xp >= t) {
        state.player.xp -= t;
        state.player.level += 1;
        t = xpToNext(state.player.level);
      }
    };

    const damageEnemy = (enemy: Enemy, dmg: number) => {
      if (enemy.dying) return;
      enemy.hp -= dmg;
      // Getting hit interrupts their swing — otherwise a stunned enemy lands it
      // the instant the stun wears off.
      if (enemy.attackStartedAt !== null) {
        enemy.attackStartedAt = null;
        enemy.attackReadyAt = performance.now() + ENEMY_ATTACK_COOLDOWN_MS * 0.6;
      }
      if (enemy.hp <= 0) {
        const now = performance.now();
        enemy.dying = true;
        enemy.deathStartedAt = now;
        enemy.grabbed = false;
        gainXp(enemy.kind === "snake" ? SNAKE_XP : ENEMY_XP);
        addScore(
          enemy.kind === "snake" ? SNAKE_SCORE : SCORE_KILL,
          enemy.worldX,
          enemy.depth,
          enemy.kind === "snake" ? "#67e8f9" : "#facc15",
          now
        );
        // Drop onto the road — a banana left up on the sidewalk is unreachable
        state.pickups.push({
          worldX: enemy.worldX,
          depth: Math.max(MIN_PLAYER_DEPTH + 0.03, enemy.depth),
          spawnedAt: now,
        });
      }
    };

    const doComboHit = (now: number) => {
      if (now < state.attackReadyAt[1]) return;
      // Reset combo if window expired
      if (now - combo.lastHitAt > COMBO_WINDOW_MS) combo.step = 0;

      const step = combo.step as 0 | 1 | 2;
      const reach = step === 0 ? 65 : step === 1 ? 90 : 125;
      const depthTol = step === 0 ? 0.2 : step === 1 ? 0.28 : 0.4;
      const dmg = step === 0 ? 35 : step === 1 ? 45 : 65;
      const dur = step === 0 ? 0.13 : step === 1 ? 0.2 : 0.28;

      combo.visual = { step, startedAt: now, duration: dur };
      combo.lastHitAt = now;
      combo.step = ((step + 1) % 3) as 0 | 1 | 2;
      if (step === 2) {
        state.attackReadyAt[1] = now + 450;
        combo.step = 0;
      }

      for (const enemy of state.enemies) {
        if (enemy.dying || now < enemy.stunUntil) continue;
        const facingDx = (enemy.worldX - state.player.worldX) * state.player.facing;
        const depthDiff = Math.abs(enemy.depth - state.player.depth) * DEPTH_TO_WORLD;
        if (facingDx >= -15 && facingDx <= reach && depthDiff <= depthTol * DEPTH_TO_WORLD) {
          damageEnemy(enemy, dmg);
          if (step === 2) enemy.worldX += state.player.facing * 90;
        }
      }
    };

    const doParrotAttack = (now: number, psx: number, psy: number) => {
      if (state.player.level < 2 || parrot.phase !== "idle" || now < state.attackReadyAt[2]) return;
      let nearest: Enemy | null = null;
      let bestDist = Infinity;
      for (const e of state.enemies) {
        if (e.dying) continue;
        const dx = (e.worldX - state.player.worldX) * state.player.facing;
        if (dx < -20) continue;
        if (dx < bestDist) { bestDist = dx; nearest = e; }
      }
      if (!nearest) return;
      parrot.phase = "flying-out";
      parrot.phaseStartedAt = now;
      parrot.targetId = nearest.id;
      parrot.fromX = psx + 14 * state.player.facing;
      parrot.fromY = psy - 46;
      parrot.pScreenX = parrot.fromX;
      parrot.pScreenY = parrot.fromY;
    };

    const doCarAttack = (now: number, psy: number) => {
      if (state.player.level < 3 || carState.active || now < state.attackReadyAt[3]) return;
      carState.active = true;
      carState.startedAt = now;
      carState.screenY = psy;
      carState.hitIds = new Set();
      state.attackReadyAt[3] = now + CAR_COOLDOWN_MS;
      state.shakeUntil = now + 500;
    };

    const doMinigunAttack = (now: number) => {
      if (state.player.level < 4 || minigun.firing || now < state.attackReadyAt[4]) return;
      minigun.firing = true;
      minigun.startedAt = now;
      minigun.lastShotAt = 0;
    };

    const doSwordAttack = (now: number) => {
      if (state.player.level < 5 || now < state.attackReadyAt[5]) return;
      const spin = sword.step === 2;
      sword.spin = spin;
      sword.swingStartedAt = now;
      sword.step = ((sword.step + 1) % 3) as 0 | 1 | 2;
      state.attackReadyAt[5] = now + (spin ? SWORD_SPIN_COOLDOWN_MS : SWORD_COOLDOWN_MS);
      if (spin) state.shakeUntil = now + 220;

      const dmg = spin ? SWORD_SPIN_DAMAGE : SWORD_DAMAGE;
      for (const enemy of state.enemies) {
        if (enemy.dying) continue;
        // The spin cuts a full circle, so it does not care which way you face
        const dx = (enemy.worldX - state.player.worldX) * state.player.facing;
        const inArc = spin ? Math.abs(dx) <= SWORD_REACH : dx >= -18 && dx <= SWORD_REACH;
        const depthDiff = Math.abs(enemy.depth - state.player.depth) * DEPTH_TO_WORLD;
        if (inArc && depthDiff <= SWORD_DEPTH_TOL * DEPTH_TO_WORLD) {
          damageEnemy(enemy, dmg);
          if (spin) enemy.worldX += Math.sign(dx || 1) * 70;
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "1", "2", "3", "4", "5", " "].includes(key))
        e.preventDefault();
      if (titlePhase !== "playing" && (key === " " || key === "enter")) {
        if (!restartArmed()) return;
        if (titlePhase === "gameover") restartGame();
        titlePhase = "playing";
        canvas.style.cursor = "default";
        return;
      }
      keys.add(key);
      if (["1", "2", "3", "4", "5"].includes(key)) {
        const id = Number(key) as SlotId;
        if (state.player.level >= id) state.selectedAttack = id;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let cameraX = 0;
    let lastTime = performance.now();
    let rafId = 0;
    let spaceWasDown = false;

    // Death sends you back to the start of the street with a fresh score. The
    // high score lives in state (and localStorage), so it survives the reset.
    const restartGame = () => {
      const now = performance.now();
      state.player.worldX = width * ANCHOR_X_RATIO || 300;
      state.player.depth = 0.6;
      state.player.facing = 1;
      state.player.level = 1;
      state.player.xp = 0;
      state.player.hp = PLAYER_MAX_HP;
      state.player.invulnUntil = 0;
      state.player.hurtUntil = 0;
      state.player.regenAt = 0;
      settlePlayer();
      state.selectedAttack = 1;
      state.attackReadyAt = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      state.enemies = [];
      state.pickups = [];
      state.bullets = [];
      state.enemyBullets = [];
      state.nextSnakeAt = now + SNAKE_SPAWN_MIN_MS;
      state.floaters = [];
      state.score = 0;
      state.scorePulseUntil = 0;
      state.shakeUntil = 0;
      state.nextSpawnAt = now + 1200;
      state.walkTime = 0;
      combo.step = 0;
      combo.visual = null;
      combo.lastHitAt = 0;
      parrot.phase = "idle";
      parrot.targetId = null;
      carState.active = false;
      carState.hitIds.clear();
      minigun.firing = false;
      sword.step = 0;
      sword.swingStartedAt = null;
      cameraX = 0;
      keys.clear();
      spaceWasDown = false;
    };

    const drawTitleScreen = (time: number) => {
      // Sky
      const skyG = ctx.createLinearGradient(0, 0, 0, height);
      skyG.addColorStop(0, "#01010b");
      skyG.addColorStop(0.6, "#0c0420");
      skyG.addColorStop(1, "#180828");
      ctx.fillStyle = skyG;
      ctx.fillRect(0, 0, width, height);

      // Stars (seeded — same positions every frame, brightness oscillates)
      const starRng = mulberry32(42);
      for (let i = 0; i < 90; i++) {
        const sx = starRng() * width;
        const sy = starRng() * height * 0.6;
        const sa = 0.25 + 0.5 * Math.sin(time * 0.0018 + i * 2.7);
        ctx.fillStyle = `rgba(255,255,255,${sa})`;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }

      // Skyline, then the same street row the game uses
      const groundY = height * 0.6;
      for (let ci = 0; ci <= Math.ceil(width / CHUNK_WIDTH) + 1; ci++) {
        const ch = getChunk(ci);
        const off = ci * CHUNK_WIDTH;
        for (const b of ch.buildings) {
          const bx = off + b.x;
          if (bx + b.width < 0 || bx > width) continue;
          ctx.fillStyle = b.color;
          ctx.fillRect(bx, groundY - b.height, b.width, b.height);
          for (const w of b.windows) {
            ctx.fillStyle = w.lit ? "rgba(250,204,21,0.5)" : "rgba(255,255,255,0.04)";
            ctx.fillRect(bx + w.x, groundY - b.height + w.y, 5, 7);
          }
        }
      }
      const titleMaxH = Math.max(120, groundY - 14);
      for (let ci = 0; ci <= Math.ceil(width / CHUNK_WIDTH) + 1; ci++) {
        const ch = getChunk(ci);
        const off = ci * CHUNK_WIDTH;
        for (const span of ch.spans) {
          const spanX = off + span.x;
          if (spanX > width + 20 || spanX + span.width < -20) continue;
          if (span.kind === "alley") drawAlley(ctx, span, spanX, groundY, titleMaxH);
          else if (span.kind === "lot") drawLot(ctx, span, spanX, groundY, titleMaxH);
          else if (span.kind === "underpass") drawUnderpass(ctx, span, spanX, groundY, titleMaxH);
          else drawFacade(ctx, span, spanX, groundY, titleMaxH);
        }
      }

      // Ground
      const gGrad = ctx.createLinearGradient(0, groundY, 0, height);
      gGrad.addColorStop(0, "#131318");
      gGrad.addColorStop(1, "#06060a");
      ctx.fillStyle = gGrad;
      ctx.fillRect(0, groundY, width, height - groundY);

      // Scanlines
      for (let y = 0; y < height; y += 3) {
        ctx.fillStyle = "rgba(0,0,0,0.09)";
        ctx.fillRect(0, y, width, 1);
      }

      // Neon glow atmosphere at horizon
      const horizonGlow = ctx.createLinearGradient(0, groundY - 18, 0, groundY + 12);
      horizonGlow.addColorStop(0, "rgba(0,0,0,0)");
      horizonGlow.addColorStop(0.5, "rgba(140,20,60,0.22)");
      horizonGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = horizonGlow;
      ctx.fillRect(0, groundY - 18, width, 30);

      const t = time * 0.001;
      const flicker = Math.random() < 0.025 ? 0.5 : 1;
      const pulse = 0.8 + 0.2 * Math.sin(t * 2.4);
      const titleCY = height * 0.29;
      const fs1 = Math.min(width * 0.17, 110);

      // "SHOOT" — white text with red neon glow
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${fs1}px system-ui, sans-serif`;
      ctx.shadowColor = "#ff1a1a";
      ctx.shadowBlur = 70 * pulse * flicker;
      ctx.fillStyle = `rgba(255,255,255,${flicker})`;
      ctx.fillText("SHOOT", width / 2, titleCY);
      ctx.shadowBlur = 110 * pulse * flicker;
      ctx.fillStyle = `rgba(255,50,50,${0.35 * flicker})`;
      ctx.fillText("SHOOT", width / 2, titleCY);
      ctx.restore();

      // "SIMULATOR" — red, slightly smaller
      const fs2 = Math.min(width * 0.09, 64);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${fs2}px system-ui, sans-serif`;
      ctx.shadowColor = "#cc2020";
      ctx.shadowBlur = 28 * pulse * flicker;
      ctx.fillStyle = `rgba(215,55,55,${flicker})`;
      ctx.fillText("SIMULATOR", width / 2, titleCY + fs1 * 0.88);
      ctx.restore();

      // PLAY button
      const btnW = Math.min(220, width * 0.44);
      const btnH = 60;
      const btnX = width / 2 - btnW / 2;
      const btnY = Math.min(height * 0.63, titleCY + fs1 * 0.88 + fs2 + 36);
      playBtn.x = btnX; playBtn.y = btnY; playBtn.w = btnW; playBtn.h = btnH;

      const bPulse = 0.75 + 0.25 * Math.sin(t * 3.8);
      ctx.save();
      ctx.shadowColor = "#facc15";
      ctx.shadowBlur = 32 * bPulse;
      const br = 10;
      ctx.beginPath();
      ctx.moveTo(btnX + br, btnY);
      ctx.lineTo(btnX + btnW - br, btnY);
      ctx.quadraticCurveTo(btnX + btnW, btnY, btnX + btnW, btnY + br);
      ctx.lineTo(btnX + btnW, btnY + btnH - br);
      ctx.quadraticCurveTo(btnX + btnW, btnY + btnH, btnX + btnW - br, btnY + btnH);
      ctx.lineTo(btnX + br, btnY + btnH);
      ctx.quadraticCurveTo(btnX, btnY + btnH, btnX, btnY + btnH - br);
      ctx.lineTo(btnX, btnY + br);
      ctx.quadraticCurveTo(btnX, btnY, btnX + br, btnY);
      ctx.closePath();
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#111";
      ctx.font = `bold ${Math.min(btnH * 0.44, 24)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▶  PLAY", width / 2, btnY + btnH / 2);
      ctx.restore();

      // Controls hint
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = `${Math.max(10, Math.min(12, width * 0.02))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        touchMode
          ? "STICK on the right · HIT on the left · tap a slot to switch attacks"
          : "WASD / ARROWS · SPACE to attack · 1 – 5 switch attacks",
        width / 2,
        btnY + btnH + 28
      );
      if (state.highScore > 0) {
        ctx.fillStyle = "rgba(250,204,21,0.6)";
        ctx.font = `bold ${Math.max(11, Math.min(14, width * 0.024))}px system-ui, sans-serif`;
        ctx.fillText(`HIGH SCORE ${String(state.highScore).padStart(5, "0")}`, width / 2, btnY + btnH + 50);
      }
      ctx.restore();
    };

    const drawScore = (now: number) => {
      const pad = 16;
      const narrow = width < 430;
      const boxW = narrow ? 116 : 168;
      const boxH = narrow ? 50 : 62;
      const bx = width - pad - boxW;
      const by = pad;
      const pulse = now < state.scorePulseUntil ? 1 + 0.12 * ((state.scorePulseUntil - now) / 260) : 1;

      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeStyle = "rgba(250,204,21,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, boxW, boxH);

      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(250,204,21,0.7)";
      ctx.font = "9px system-ui, sans-serif";
      ctx.fillText("SCORE", bx + boxW - 10, by + 17);

      ctx.save();
      ctx.translate(bx + boxW - 10, by + (narrow ? 34 : 40));
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#facc15";
      ctx.font = `bold ${narrow ? 19 : 24}px system-ui, sans-serif`;
      ctx.fillText(String(state.score).padStart(5, "0"), 0, 0);
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(`HIGH ${String(state.highScore).padStart(5, "0")}`, bx + boxW - 10, by + boxH - 7);
      ctx.restore();
    };

    const drawGameOver = (now: number) => {
      const t = Math.min(1, (now - gameOverAt) / 600);
      const isNewHigh = state.score > 0 && state.score >= state.highScore;

      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${0.72 * t})`;
      ctx.fillRect(0, 0, width, height);

      const cy = height * 0.34;
      const fs = Math.min(width * 0.13, 84);
      const flicker = Math.random() < 0.03 ? 0.55 : 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = t;

      ctx.save();
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      ctx.shadowColor = "#ff1a1a";
      ctx.shadowBlur = 60 * flicker;
      ctx.fillStyle = `rgba(255,255,255,${flicker})`;
      ctx.fillText("GAME OVER", width / 2, cy);
      ctx.restore();

      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText("FINAL SCORE", width / 2, cy + fs * 0.72);

      ctx.font = "bold 40px system-ui, sans-serif";
      ctx.fillStyle = "#facc15";
      ctx.fillText(String(state.score).padStart(5, "0"), width / 2, cy + fs * 0.72 + 32);

      if (isNewHigh) {
        ctx.font = "bold 13px system-ui, sans-serif";
        ctx.fillStyle = `rgba(250,204,21,${0.55 + 0.45 * Math.sin(now * 0.006)})`;
        ctx.fillText("★ NEW HIGH SCORE ★", width / 2, cy + fs * 0.72 + 60);
      } else {
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillText(`HIGH ${String(state.highScore).padStart(5, "0")}`, width / 2, cy + fs * 0.72 + 60);
      }

      // RETRY button — shares playBtn with the title screen so one click
      // handler covers both.
      const btnW = Math.min(220, width * 0.44);
      const btnH = 56;
      const btnX = width / 2 - btnW / 2;
      const btnY = Math.min(height * 0.74, cy + fs * 0.72 + 88);
      playBtn.x = btnX; playBtn.y = btnY; playBtn.w = btnW; playBtn.h = btnH;

      const bPulse = 0.75 + 0.25 * Math.sin(now * 0.0038);
      ctx.shadowColor = "#facc15";
      ctx.shadowBlur = 30 * bPulse;
      const br = 10;
      ctx.beginPath();
      ctx.moveTo(btnX + br, btnY);
      ctx.lineTo(btnX + btnW - br, btnY);
      ctx.quadraticCurveTo(btnX + btnW, btnY, btnX + btnW, btnY + br);
      ctx.lineTo(btnX + btnW, btnY + btnH - br);
      ctx.quadraticCurveTo(btnX + btnW, btnY + btnH, btnX + btnW - br, btnY + btnH);
      ctx.lineTo(btnX + br, btnY + btnH);
      ctx.quadraticCurveTo(btnX, btnY + btnH, btnX, btnY + btnH - br);
      ctx.lineTo(btnX, btnY + br);
      ctx.quadraticCurveTo(btnX, btnY, btnX + br, btnY);
      ctx.closePath();
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#111";
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.fillText("↺  RETRY", width / 2, btnY + btnH / 2);

      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("or press SPACE", width / 2, btnY + btnH + 20);
      ctx.restore();
    };

    const drawHud = () => {
      const { level, xp } = state.player;
      const threshold = xpToNext(level);
      // Bigger slots on touch, and the panel moves to the top so it is clear of
      // the thumb controls along the bottom.
      // Narrow phones shrink the slots again so the panel clears the score box
      const gap = touchMode ? 6 : 8;
      // Five slots have to fit the panel at any width, so the preferred size is
      // capped by whatever room is actually left beside the score box.
      const preferred = touchMode ? (width < 330 ? 30 : compactUI() ? 38 : 48) : 34;
      const maxRowW = Math.max(120, width * 0.62 - 32);
      const boxSize = Math.floor(
        Math.min(preferred, (maxRowW - gap * (SLOT_IDS.length - 1)) / SLOT_IDS.length)
      );
      const sw = boxSize * SLOT_IDS.length + gap * (SLOT_IDS.length - 1);
      const px = 16;
      const pw = sw + 16;
      const bh0 = 12;
      const hpH0 = 13;
      const pb = touchMode ? 16 + boxSize + bh0 + hpH0 + 48 : height - 16;
      const sy = pb - boxSize;
      const labelY = sy - 6;
      const bh = 12;
      const by = labelY - 10 - bh;
      const lty = by - 8;
      const hpH = 13;
      const hpY = lty - 14 - hpH;
      const pt = hpY - 10;
      const names: Record<SlotId, string> = {
        1: "Punch",
        2: "Parrot",
        3: "Fishcar",
        4: "Minigun",
        5: "Sword",
      };

      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(px - 8, pt, pw, pb - pt + 8);
      ctx.strokeStyle = "rgba(250,204,21,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 8, pt, pw, pb - pt + 8);

      // Health
      const hpRatio = state.player.hp / PLAYER_MAX_HP;
      const regenerating = performance.now() >= state.player.regenAt && state.player.hp < PLAYER_MAX_HP;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(px, hpY, sw, hpH);
      ctx.fillStyle = hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#facc15" : "#dc2626";
      ctx.fillRect(px, hpY, sw * hpRatio, hpH);
      if (regenerating) {
        // Pulsing edge on the bar while you are patching up
        const glow = 0.35 + 0.35 * Math.sin(performance.now() * 0.006);
        ctx.fillStyle = `rgba(134,239,172,${glow})`;
        ctx.fillRect(px + sw * hpRatio - 2, hpY, 3, hpH);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px, hpY, sw, hpH);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillText("HP", px + 4, hpY + hpH - 3.5);
      ctx.textAlign = "right";
      ctx.fillText(`${Math.ceil(state.player.hp)}/${PLAYER_MAX_HP}`, px + sw - 4, hpY + hpH - 3.5);

      ctx.fillStyle = "#facc15";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`LV ${level}`, px, lty);

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(px, by, sw, bh);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(px, by, sw * Math.min(1, xp / threshold), bh);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeRect(px, by, sw, bh);
      ctx.fillStyle = "#000";
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${xp}/${threshold}`, px + sw - 4, by + bh - 3);

      attackRects.length = 0;
      for (const id of SLOT_IDS) {
        // One slot earned per level, so the slot number is also its unlock level
        const unlocked = level >= id;
        const selected = state.selectedAttack === id;
        const x = px + (id - 1) * (boxSize + gap);
        attackRects.push({ id, x, y: sy, w: boxSize, h: boxSize });
        ctx.fillStyle = unlocked ? (selected ? "#facc15" : "rgba(250,204,21,0.15)") : "rgba(255,255,255,0.06)";
        ctx.fillRect(x, sy, boxSize, boxSize);
        ctx.strokeStyle = selected ? "#fff" : unlocked ? "rgba(250,204,21,0.7)" : "rgba(255,255,255,0.2)";
        ctx.lineWidth = selected ? 2.5 : 1;
        ctx.strokeRect(x, sy, boxSize, boxSize);
        ctx.fillStyle = unlocked ? (selected ? "#111" : "#facc15") : "rgba(255,255,255,0.3)";
        ctx.font = `bold ${touchMode ? 20 : 16}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(String(id), x + boxSize / 2, sy + boxSize / 2 + (touchMode ? 4 : 6));
        ctx.font = `${touchMode ? 9 : 8}px system-ui, sans-serif`;
        ctx.fillStyle = unlocked ? "rgba(250,204,21,0.85)" : "rgba(255,255,255,0.25)";
        ctx.fillText(unlocked ? names[id] : "???", x + boxSize / 2, touchMode ? sy + boxSize - 6 : labelY);
      }
      ctx.restore();
    };

    // Thumb controls: floating stick under the right hand, hit button under the
    // left. Drawn only on touch devices.
    const drawTouchControls = () => {
      const { stick, shoot } = touchLayout();
      const base = touch.moveId !== null ? touch.moveOrigin : stick;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.globalAlpha = touch.moveId !== null ? 0.55 : 0.3;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.arc(base.x, base.y, STICK_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(250,204,21,0.85)";
      ctx.lineWidth = 2;
      ctx.stroke();
      const kx = base.x + touch.moveVec.x * STICK_RADIUS * 0.7;
      const ky = base.y + touch.moveVec.y * STICK_RADIUS * 0.7;
      ctx.globalAlpha = touch.moveId !== null ? 0.9 : 0.5;
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(kx, ky, STICK_RADIUS * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = touch.shootDown ? 0.95 : 0.5;
      ctx.fillStyle = touch.shootDown ? "#facc15" : "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.arc(shoot.x, shoot.y, SHOOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(250,204,21,0.9)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = touch.shootDown ? "#111" : "#facc15";
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.fillText("HIT", shoot.x, shoot.y);
      ctx.restore();
    };

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      const nowTs = performance.now();

      // Title screen — draw and bail out before any game logic
      if (titlePhase === "title") {
        ctx.save();
        drawTitleScreen(time);
        ctx.restore();
        rafId = requestAnimationFrame(loop);
        return;
      }

      // On game over the street keeps drawing but nothing updates — the last
      // frame freezes behind the results panel.
      const live = titlePhase === "playing";

      let vx = 0, vd = 0;
      if (live) {
        if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
        if (keys.has("arrowright") || keys.has("d")) vx += 1;
        if (keys.has("arrowup") || keys.has("w")) vd -= 1;
        if (keys.has("arrowdown") || keys.has("s")) vd += 1;
        // Stick is analog, with a deadzone so a resting thumb does not drift
        if (touch.moveId !== null) {
          if (Math.abs(touch.moveVec.x) > 0.2) vx = touch.moveVec.x;
          if (Math.abs(touch.moveVec.y) > 0.2) vd = touch.moveVec.y;
        }
      }

      state.isMoving = vx !== 0 || vd !== 0;
      if (state.isMoving) state.walkTime += dt;

      // Health trickles back once you have gone long enough without being hit
      if (live && nowTs >= state.player.regenAt && state.player.hp < PLAYER_MAX_HP) {
        state.player.hp = Math.min(PLAYER_MAX_HP, state.player.hp + HP_REGEN_PER_SEC * dt);
      }

      // Move each axis on its own so obstacles block instead of stopping the
      // player dead — you slide along a car rather than sticking to it.
      const prevX = state.player.worldX;
      const prevDepth = state.player.depth;
      const pScale = MIN_SCALE + prevDepth * (MAX_SCALE - MIN_SCALE);
      const pHalfW = ACTOR_HALF_W * pScale;
      const pHalfD = ACTOR_HALF_D * pScale;
      // If we somehow start inside a prop, don't trap the player there.
      const startsInside = overlapsProp(prevX, prevDepth, pHalfW, pHalfD);

      const nextX = Math.max(0, prevX + vx * PLAYER_SPEED * dt);
      if (startsInside || !overlapsProp(nextX, prevDepth, pHalfW, pHalfD)) state.player.worldX = nextX;

      const nextDepth = Math.max(
        MIN_PLAYER_DEPTH,
        Math.min(MAX_PLAYER_DEPTH, prevDepth + vd * PLAYER_DEPTH_SPEED * dt)
      );
      // Footprint grows with depth, so test the step with the scale it will land at
      const nScale = MIN_SCALE + nextDepth * (MAX_SCALE - MIN_SCALE);
      const nHalfW = ACTOR_HALF_W * nScale;
      const nHalfD = ACTOR_HALF_D * nScale;
      if (startsInside || !overlapsProp(state.player.worldX, nextDepth, nHalfW, nHalfD)) {
        state.player.depth = nextDepth;
      }
      if (vx !== 0) state.player.facing = vx > 0 ? 1 : -1;

      const anchorX = width * ANCHOR_X_RATIO;
      cameraX = Math.max(0, state.player.worldX - anchorX);
      const horizonY = height * HORIZON_RATIO;
      const floorBottom = height;
      const bandH = floorBottom - horizonY;

      // The camera rides the bend under the player, so the street ahead and
      // behind slopes while the player stays put on screen.
      const bendBase = bendAt(state.player.worldX);
      const groundYAt = (worldX: number) => horizonY + (bendAt(worldX) - bendBase);
      /** Screen y of a point on the ground at a given world x and depth. */
      const groundY = (worldX: number, depth: number) => groundYAt(worldX) + depth * bandH;

      const psx = state.player.worldX - cameraX;
      const psy = groundY(state.player.worldX, state.player.depth);
      const ps = MIN_SCALE + state.player.depth * (MAX_SCALE - MIN_SCALE);

      // Space: trigger on leading edge
      const spaceDown = keys.has(" ") || touch.shootDown;
      if (live && spaceDown && !spaceWasDown) {
        if (state.selectedAttack === 1) doComboHit(nowTs);
        else if (state.selectedAttack === 2) doParrotAttack(nowTs, psx, psy);
        else if (state.selectedAttack === 3) doCarAttack(nowTs, psy);
        else if (state.selectedAttack === 4) doMinigunAttack(nowTs);
        else if (state.selectedAttack === 5) doSwordAttack(nowTs);
      }
      spaceWasDown = spaceDown;

      // Enemy update
      for (const enemy of state.enemies) {
        if (!live || enemy.dying || enemy.grabbed) continue;
        if (enemy.floatY > 0) enemy.floatY = Math.max(0, enemy.floatY - 80 * dt);
        if (nowTs < enemy.stunUntil) continue;

        // Stepping out of a doorway: cross the sidewalk before joining the fight
        if (enemy.emerging) {
          enemy.depth += EMERGE_DEPTH_SPEED * dt;
          if (enemy.depth >= EMERGE_TARGET_DEPTH) {
            enemy.depth = EMERGE_TARGET_DEPTH;
            enemy.emerging = false;
          }
          continue;
        }

        if (enemy.kind === "snake") {
          const sdx = state.player.worldX - enemy.worldX;
          const sdd = state.player.depth - enemy.depth;
          enemy.avoidDir = sdx >= 0 ? 1 : -1; // reused as facing for the sprite

          // Mid-burst: rounds leave the barrel on their own clock
          if (enemy.shotsLeft > 0) {
            if (nowTs >= enemy.nextShotAt) {
              const dir: 1 | -1 = sdx >= 0 ? 1 : -1;
              state.enemyBullets.push({
                worldX: enemy.worldX + dir * 48,
                depth: enemy.depth,
                dir,
                travelled: 0,
              });
              enemy.shotsLeft -= 1;
              enemy.nextShotAt = nowTs + SNAKE_BURST_GAP_MS;
              if (enemy.shotsLeft === 0) enemy.attackReadyAt = nowTs + SNAKE_RELOAD_MS;
            }
            continue; // holds still while it empties the burst
          }

          // Laser sight up: locked in place, which is the window to step aside
          if (enemy.aimStartedAt !== null) {
            if (nowTs - enemy.aimStartedAt >= SNAKE_AIM_MS) {
              enemy.aimStartedAt = null;
              enemy.shotsLeft = SNAKE_BURST;
              enemy.nextShotAt = nowTs;
            }
            continue;
          }

          // Hold a firing distance: close from far off, back away if crowded
          const absDx = Math.abs(sdx);
          const towards = Math.sign(sdx) || 1;
          const move =
            absDx > SNAKE_FAR_RANGE ? towards : absDx < SNAKE_NEAR_RANGE ? -towards : 0;
          if (move !== 0) {
            const nx = enemy.worldX + move * SNAKE_SPEED * dt;
            const sScale = MIN_SCALE + enemy.depth * (MAX_SCALE - MIN_SCALE);
            if (
              overlapsProp(enemy.worldX, enemy.depth, ACTOR_HALF_W * sScale, ACTOR_HALF_D * sScale) ||
              !overlapsProp(nx, enemy.depth, ACTOR_HALF_W * sScale, ACTOR_HALF_D * sScale)
            ) {
              enemy.worldX = Math.max(cameraX - 200, nx);
            }
          }
          // Lines itself up with your lane, slowly — this is what you dodge
          if (Math.abs(sdd) > 0.01) {
            enemy.depth = Math.max(
              MIN_PLAYER_DEPTH,
              Math.min(MAX_PLAYER_DEPTH, enemy.depth + Math.sign(sdd) * SNAKE_DEPTH_SPEED * dt)
            );
          }
          if (absDx >= 110 && absDx <= SNAKE_BULLET_RANGE && nowTs >= enemy.attackReadyAt) {
            enemy.aimStartedAt = nowTs;
          }
          continue;
        }

        const dxp = state.player.worldX - enemy.worldX;
        const ddp = state.player.depth - enemy.depth;
        const eScale = MIN_SCALE + enemy.depth * (MAX_SCALE - MIN_SCALE);
        const eHalfW = ACTOR_HALF_W * eScale;
        const eHalfD = ACTOR_HALF_D * eScale;
        // Same escape hatch as the player: never freeze an enemy inside a prop
        const eInside = overlapsProp(enemy.worldX, enemy.depth, eHalfW, eHalfD);

        // Swing at the player once they're in reach; the hit lands after a
        // telegraphed wind-up, and they hold still while throwing it.
        const inReach =
          Math.abs(dxp) <= ENEMY_ATTACK_RANGE && Math.abs(ddp) <= ENEMY_ATTACK_DEPTH_TOL;
        if (enemy.attackStartedAt !== null) {
          if (nowTs - enemy.attackStartedAt >= ENEMY_WINDUP_MS) {
            if (inReach) damagePlayer(ENEMY_DAMAGE, enemy.worldX, nowTs);
            enemy.attackStartedAt = null;
            enemy.attackReadyAt = nowTs + ENEMY_ATTACK_COOLDOWN_MS;
          }
          continue;
        }
        if (inReach && nowTs >= enemy.attackReadyAt) {
          enemy.attackStartedAt = nowTs;
          continue;
        }

        let blockedX = false;
        if (Math.abs(dxp) > 25) {
          const enx = enemy.worldX + Math.sign(dxp) * ENEMY_SPEED * dt;
          if (eInside || !overlapsProp(enx, enemy.depth, eHalfW, eHalfD)) enemy.worldX = enx;
          else blockedX = true;
        }

        // Normally close the depth gap to the player; when a prop is in the way,
        // step aside instead and flip direction whenever that route is shut too.
        const depthStep = blockedX
          ? enemy.avoidDir * ENEMY_AVOID_DEPTH_SPEED * dt
          : Math.abs(ddp) > 0.02
            ? Math.sign(ddp) * ENEMY_DEPTH_SPEED * dt
            : 0;
        const end = Math.max(MIN_PLAYER_DEPTH, Math.min(MAX_PLAYER_DEPTH, enemy.depth + depthStep));
        const enScale = MIN_SCALE + end * (MAX_SCALE - MIN_SCALE);
        const canDepth =
          eInside || !overlapsProp(enemy.worldX, end, ACTOR_HALF_W * enScale, ACTOR_HALF_D * enScale);
        if (canDepth && end !== enemy.depth) enemy.depth = end;
        else if (blockedX) enemy.avoidDir = (enemy.avoidDir * -1) as 1 | -1;
      }
      if (live) {
        state.enemies = state.enemies.filter((e) => {
          if (e.dying) return nowTs - (e.deathStartedAt ?? 0) < 260;
          return e.worldX >= cameraX - 500;
        });
      }
      if (live && state.enemies.length < MAX_ENEMIES && nowTs >= state.nextSpawnAt) {
        const from = pickSpawnPoint();
        state.enemies.push({
          id: state.nextEnemyId++,
          kind: "thug",
          aimStartedAt: null,
          shotsLeft: 0,
          nextShotAt: 0,
          worldX: from.x,
          depth: from.emerging
            ? DOOR_DEPTH
            : MIN_PLAYER_DEPTH + 0.05 + Math.random() * (MAX_PLAYER_DEPTH - MIN_PLAYER_DEPTH - 0.05),
          hp: 100,
          dying: false,
          deathStartedAt: null,
          stunUntil: 0,
          floatY: 0,
          grabbed: false,
          emerging: from.emerging,
          spawnedAt: nowTs,
          avoidDir: Math.random() < 0.5 ? 1 : -1,
          attackReadyAt: nowTs + 600,
          attackStartedAt: null,
        });
        state.nextSpawnAt = nowTs + 1400 + Math.random() * 900;
      }

      // A robo-snake shows up every so often, on its own timer and outside the
      // usual thug cap, so the street never has more than one gun on it.
      if (live && nowTs >= state.nextSnakeAt) {
        if (state.nextSnakeAt === 0) {
          state.nextSnakeAt = nowTs + SNAKE_SPAWN_MIN_MS;
        } else if (!state.enemies.some((e) => e.kind === "snake" && !e.dying)) {
          const side = Math.random() < 0.75 ? 1 : -1;
          state.enemies.push({
            id: state.nextEnemyId++,
            kind: "snake",
            aimStartedAt: null,
            shotsLeft: 0,
            nextShotAt: 0,
            worldX: Math.max(40, state.player.worldX + side * (width * 0.62 + Math.random() * 160)),
            depth: MIN_PLAYER_DEPTH + 0.12 + Math.random() * 0.5,
            hp: SNAKE_HP,
            dying: false,
            deathStartedAt: null,
            stunUntil: 0,
            floatY: 0,
            grabbed: false,
            emerging: false,
            spawnedAt: nowTs,
            avoidDir: 1,
            attackReadyAt: nowTs + 900,
            attackStartedAt: null,
          });
          state.nextSnakeAt = nowTs + SNAKE_SPAWN_MIN_MS + Math.random() * SNAKE_SPAWN_VAR_MS;
        }
      }

      // Snake rounds: they run down one lane, and any solid prop eats them —
      // which is what makes a dumpster worth standing behind.
      if (live && state.enemyBullets.length > 0) {
        const eStep = SNAKE_BULLET_SPEED * dt;
        state.enemyBullets = state.enemyBullets.filter((b) => {
          b.worldX += b.dir * eStep;
          b.travelled += eStep;
          if (b.travelled > SNAKE_BULLET_RANGE) return false;
          const bScale = MIN_SCALE + b.depth * (MAX_SCALE - MIN_SCALE);
          if (overlapsProp(b.worldX, b.depth, SNAKE_BULLET_HALF_W * bScale, SNAKE_BULLET_HALF_D * bScale)) {
            state.floaters.push({
              worldX: b.worldX,
              depth: b.depth,
              text: "CLANG",
              color: "#cbd5e1",
              startedAt: nowTs,
            });
            return false;
          }
          if (
            Math.abs(b.worldX - state.player.worldX) < 20 &&
            Math.abs(b.depth - state.player.depth) < SNAKE_BULLET_DEPTH_TOL
          ) {
            damagePlayer(SNAKE_BULLET_DAMAGE, b.worldX, nowTs);
            return false;
          }
          return true;
        });
      } else if (!live) {
        state.enemyBullets = [];
      }

      // Banana pickups dropped by fallen enemies
      if (live) {
        state.pickups = state.pickups.filter((pu) => {
          if (nowTs - pu.spawnedAt > PICKUP_LIFETIME_MS) return false;
          const dx = Math.abs(pu.worldX - state.player.worldX);
          const dd = Math.abs(pu.depth - state.player.depth);
          if (dx < 34 && dd < 0.07) {
            addScore(SCORE_PICKUP, pu.worldX, pu.depth, "#fde68a", nowTs);
            if (state.player.hp < PLAYER_MAX_HP) {
              state.player.hp = Math.min(PLAYER_MAX_HP, state.player.hp + PICKUP_HEAL);
              // Offset in depth so it doesn't sit on top of the score popup
              state.floaters.push({
                worldX: pu.worldX,
                depth: Math.min(MAX_PLAYER_DEPTH, pu.depth + 0.05),
                text: `+${PICKUP_HEAL} HP`,
                color: "#4ade80",
                startedAt: nowTs,
              });
            }
            return false;
          }
          return pu.worldX >= cameraX - 400;
        });
        state.floaters = state.floaters.filter((f) => nowTs - f.startedAt < 900);
      }

      // Parrot state machine
      if (!live) {
        // frozen on the game over screen
      } else if (parrot.phase === "flying-out") {
        const tgt = state.enemies.find((e) => e.id === parrot.targetId);
        if (!tgt || tgt.dying) {
          parrot.phase = "idle";
        } else {
          const tSX = tgt.worldX - cameraX;
          const tSY = groundY(tgt.worldX, tgt.depth) - 20 * ps;
          const t = Math.min(1, (nowTs - parrot.phaseStartedAt) / 500);
          parrot.pScreenX = parrot.fromX + (tSX - parrot.fromX) * t;
          parrot.pScreenY = parrot.fromY + (tSY - parrot.fromY) * t;
          if (t >= 1) {
            parrot.phase = "lifting";
            parrot.phaseStartedAt = nowTs;
            tgt.grabbed = true;
          }
        }
      } else if (parrot.phase === "lifting") {
        const tgt = state.enemies.find((e) => e.id === parrot.targetId);
        if (!tgt || tgt.dying) {
          if (tgt) tgt.grabbed = false;
          parrot.fromX = parrot.pScreenX;
          parrot.fromY = parrot.pScreenY;
          parrot.phase = "returning";
          parrot.phaseStartedAt = nowTs;
        } else {
          const tgtGroundY = groundY(tgt.worldX, tgt.depth);
          // Lift as high as the street allows, stopping just under the horizon
          parrot.liftHeight = Math.max(90, Math.min(PARROT_LIFT_HEIGHT, tgtGroundY - groundYAt(tgt.worldX) + 40));
          const t = Math.min(1, (nowTs - parrot.phaseStartedAt) / PARROT_LIFT_MS);
          tgt.grabbed = true;
          tgt.stunUntil = nowTs + 200;
          tgt.floatY = parrot.liftHeight * (1 - Math.pow(1 - t, 2)); // ease-out climb
          parrot.pScreenX = tgt.worldX - cameraX;
          parrot.pScreenY = tgtGroundY - tgt.floatY - 34 - 12 * ps;
          if (t >= 1) {
            parrot.phase = "slamming";
            parrot.phaseStartedAt = nowTs;
          }
        }
      } else if (parrot.phase === "slamming") {
        const tgt = state.enemies.find((e) => e.id === parrot.targetId);
        if (!tgt || tgt.dying) {
          if (tgt) tgt.grabbed = false;
          parrot.fromX = parrot.pScreenX;
          parrot.fromY = parrot.pScreenY;
          parrot.phase = "returning";
          parrot.phaseStartedAt = nowTs;
        } else {
          const hang = Math.min(1, (nowTs - parrot.phaseStartedAt) / PARROT_HANG_MS);
          const fallT = Math.max(0, (nowTs - parrot.phaseStartedAt - PARROT_HANG_MS) / PARROT_SLAM_MS);
          const t = Math.min(1, fallT);
          tgt.grabbed = true;
          tgt.stunUntil = nowTs + 200;
          tgt.floatY = parrot.liftHeight * (1 - t * t); // accelerating drop
          // Parrot lets go at the apex and hovers there
          parrot.pScreenX = tgt.worldX - cameraX;
          parrot.pScreenY =
            groundY(tgt.worldX, tgt.depth) - parrot.liftHeight - 34 - 12 * ps - hang * 6;
          if (t >= 1) {
            tgt.floatY = 0;
            tgt.grabbed = false;
            damageEnemy(tgt, PARROT_SLAM_DAMAGE);
            if (!tgt.dying) tgt.stunUntil = nowTs + 1200;
            state.shakeUntil = nowTs + 320;
            parrot.fromX = parrot.pScreenX;
            parrot.fromY = parrot.pScreenY;
            parrot.phase = "returning";
            parrot.phaseStartedAt = nowTs;
          }
        }
      } else if (parrot.phase === "returning") {
        const toX = psx + 14 * state.player.facing;
        const toY = psy - 46 * ps;
        const t = Math.min(1, (nowTs - parrot.phaseStartedAt) / 500);
        parrot.pScreenX = parrot.fromX + (toX - parrot.fromX) * t;
        parrot.pScreenY = parrot.fromY + (toY - parrot.fromY) * t;
        if (t >= 1) {
          parrot.phase = "cooldown";
          parrot.phaseStartedAt = nowTs;
          state.attackReadyAt[2] = nowTs + 2000;
        }
      } else if (parrot.phase === "cooldown" && nowTs >= state.attackReadyAt[2]) {
        parrot.phase = "idle";
      }

      // Minigun: spits a tracer every few frames while the barrel is spinning,
      // and only starts its cooldown once the burst is done.
      if (live && minigun.firing) {
        if (nowTs - minigun.startedAt >= MINIGUN_DURATION_MS) {
          minigun.firing = false;
          state.attackReadyAt[4] = nowTs + MINIGUN_COOLDOWN_MS;
        } else if (nowTs - minigun.lastShotAt >= MINIGUN_FIRE_INTERVAL_MS) {
          minigun.lastShotAt = nowTs;
          state.bullets.push({
            worldX: state.player.worldX + state.player.facing * 26,
            depth: state.player.depth + (Math.random() - 0.5) * 0.03,
            dir: state.player.facing,
            yOff: 32 + (Math.random() - 0.5) * 5,
            travelled: 0,
          });
          state.shakeUntil = Math.max(state.shakeUntil, nowTs + 90);
        }
      } else if (!live) {
        minigun.firing = false;
      }

      // Tracers travel until they hit someone or run out of street
      if (live && state.bullets.length > 0) {
        const step = BULLET_SPEED * dt;
        state.bullets = state.bullets.filter((b) => {
          b.worldX += b.dir * step;
          b.travelled += step;
          if (b.travelled > MINIGUN_RANGE) return false;
          for (const enemy of state.enemies) {
            if (enemy.dying || enemy.grabbed) continue;
            if (
              Math.abs(enemy.worldX - b.worldX) < BULLET_HIT_W &&
              Math.abs(enemy.depth - b.depth) < BULLET_HIT_DEPTH
            ) {
              damageEnemy(enemy, MINIGUN_DAMAGE);
              return false;
            }
          }
          return true;
        });
      } else if (!live) {
        state.bullets = [];
      }

      // Sword swing is instantaneous in damage; this just times the arc visual
      if (sword.swingStartedAt !== null && nowTs - sword.swingStartedAt >= SWORD_SWING_MS) {
        sword.swingStartedAt = null;
      }

      let carDrawCx = 0;
      let carDrawCy = 0;
      if (live && carState.active) {
        const carProgress = (nowTs - carState.startedAt) / CAR_DRIVEBY_MS;
        carDrawCx = -120 + (width + 240) * carProgress;
        carDrawCy = carState.screenY - 14;
        for (const e of state.enemies) {
          if (e.dying || carState.hitIds.has(e.id)) continue;
          const eesx = e.worldX - cameraX;
          const eesy = groundY(e.worldX, e.depth);
          if (Math.abs(eesx - carDrawCx) < 50 && Math.abs(eesy - carDrawCy) < 100) {
            damageEnemy(e, 50);
            carState.hitIds.add(e.id);
          }
        }
        if (carProgress >= 1) carState.active = false;
      }

      // Screen shake
      let sx2 = 0, sy2 = 0;
      const shakeLeft = state.shakeUntil - nowTs;
      if (shakeLeft > 0) {
        const intensity = (shakeLeft / 400) * 8;
        sx2 = (Math.random() - 0.5) * intensity;
        sy2 = (Math.random() - 0.5) * intensity;
      }

      ctx.save();
      ctx.translate(sx2, sy2);

      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, "#02020a");
      skyGrad.addColorStop(1, "#0a1030");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY);

      // Distant skyline — parallaxed, so it drifts behind the street
      const par = 0.25;
      for (let ci = Math.max(0, Math.floor((cameraX * par - width) / CHUNK_WIDTH) - 1);
           ci <= Math.floor((cameraX * par + width) / CHUNK_WIDTH) + 1; ci++) {
        const ch = getChunk(ci);
        const off = ci * CHUNK_WIDTH - cameraX * par;
        for (const b of ch.buildings) {
          const bx = off + b.x;
          if (bx + b.width < 0 || bx > width) continue;
          const by2 = horizonY - b.height;
          ctx.fillStyle = b.color;
          ctx.fillRect(bx, by2, b.width, b.height);
          for (const w of b.windows) {
            ctx.fillStyle = w.lit ? "rgba(250,204,21,0.5)" : "rgba(255,255,255,0.04)";
            ctx.fillRect(bx + w.x, by2 + w.y, 5, 7);
          }
        }
      }
      // Haze over the skyline so it reads as far off
      const hazeGrad = ctx.createLinearGradient(0, horizonY - 220, 0, horizonY);
      hazeGrad.addColorStop(0, "rgba(10,16,48,0)");
      hazeGrad.addColorStop(1, "rgba(10,16,48,0.75)");
      ctx.fillStyle = hazeGrad;
      ctx.fillRect(0, horizonY - 220, width, 220);

      // The street row, grounded at the back edge of the sidewalk and scrolling
      // 1:1. Each block sits at the ground height of its own stretch of street,
      // so the row steps up and down through a bend.
      const maxFacadeH = Math.max(120, horizonY - 14);
      const firstChunk = Math.max(0, Math.floor((cameraX - width) / CHUNK_WIDTH) - 1);
      const lastChunk = Math.floor((cameraX + width) / CHUNK_WIDTH) + 1;
      for (let ci = firstChunk; ci <= lastChunk; ci++) {
        const ch = getChunk(ci);
        const off = ci * CHUNK_WIDTH - cameraX;
        for (const span of ch.spans) {
          const spanX = off + span.x;
          if (spanX + span.width < -40 || spanX > width + 40) continue;
          const spanBase = groundYAt(ci * CHUNK_WIDTH + span.x + span.width / 2);
          if (span.kind === "alley") drawAlley(ctx, span, spanX, spanBase, maxFacadeH);
          else if (span.kind === "lot") drawLot(ctx, span, spanX, spanBase, maxFacadeH);
          else if (span.kind === "underpass") drawUnderpass(ctx, span, spanX, spanBase, maxFacadeH);
          else drawFacade(ctx, span, spanX, spanBase, maxFacadeH);
        }
      }

      // Ground surfaces follow the bend, so they are drawn as sampled bands
      // rather than plain rectangles.
      const GROUND_SAMPLES = 28;
      const sampleStep = width / GROUND_SAMPLES;
      const topYs: number[] = [];
      for (let i = 0; i <= GROUND_SAMPLES; i++) topYs.push(groundYAt(cameraX + i * sampleStep));
      const midTop = topYs[Math.floor(GROUND_SAMPLES / 2)];
      /** Fill the strip between two depths, following the bend across the screen. */
      const fillBand = (dTop: number, dBot: number, style: string | CanvasGradient) => {
        ctx.beginPath();
        ctx.moveTo(0, topYs[0] + dTop * bandH);
        for (let i = 1; i <= GROUND_SAMPLES; i++) ctx.lineTo(i * sampleStep, topYs[i] + dTop * bandH);
        if (dBot === Infinity) {
          ctx.lineTo(width, height * 2);
          ctx.lineTo(0, height * 2);
        } else {
          for (let i = GROUND_SAMPLES; i >= 0; i--) ctx.lineTo(i * sampleStep, topYs[i] + dBot * bandH);
        }
        ctx.closePath();
        ctx.fillStyle = style;
        ctx.fill();
      };
      /** Stroke a line of constant depth along the bend. */
      const strokeAlong = (d: number) => {
        ctx.beginPath();
        ctx.moveTo(0, topYs[0] + d * bandH);
        for (let i = 1; i <= GROUND_SAMPLES; i++) ctx.lineTo(i * sampleStep, topYs[i] + d * bandH);
        ctx.stroke();
      };
      const curbY = midTop + SIDEWALK_DEPTH * bandH; // representative, for gradients
      const pavingH = SIDEWALK_DEPTH * bandH;

      fillBand(0, Infinity, "#09090c");

      // Paving is hazier and lighter where it recedes, darker underfoot at the
      // kerb — a wall would be lit the other way round
      const swGrad = ctx.createLinearGradient(0, midTop, 0, curbY);
      swGrad.addColorStop(0, "#3b3b43");
      swGrad.addColorStop(0.45, "#33333a");
      swGrad.addColorStop(1, "#26262c");
      fillBand(0, SIDEWALK_DEPTH, swGrad);
      // Shadow the buildings cast across the back of the paving
      const wallShadow = ctx.createLinearGradient(0, midTop, 0, midTop + pavingH * 0.5);
      wallShadow.addColorStop(0, "rgba(0,0,0,0.5)");
      wallShadow.addColorStop(1, "rgba(0,0,0,0)");
      fillBand(0, SIDEWALK_DEPTH * 0.5, wallShadow);

      // Paving seams. Sprites do not scale with depth, so the ground is drawn in
      // the matching oblique projection: seams all lean the same way instead of
      // converging on a vanishing point, and rows are evenly spaced rather than
      // foreshortened.
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.lineWidth = 1;
      strokeAlong(SIDEWALK_DEPTH * 0.34);
      strokeAlong(SIDEWALK_DEPTH * 0.67);
      const seamLean = pavingH * 0.42; // constant sideways lean over the band
      const tileW = 76;
      const tileOff = tileW - cameraX % tileW;
      for (let tx = tileOff - tileW - seamLean; tx < width + tileW + seamLean; tx += tileW) {
        const backY = groundYAt(cameraX + tx + seamLean);
        const frontY = groundYAt(cameraX + tx) + pavingH;
        ctx.beginPath(); ctx.moveTo(tx + seamLean, backY); ctx.lineTo(tx, frontY); ctx.stroke();
      }

      // Chalk, manholes and patches lying on the ground
      for (let ci = firstChunk; ci <= lastChunk; ci++) {
        const ch = getChunk(ci);
        for (const mk of ch.marks) {
          const mwx = ci * CHUNK_WIDTH + mk.x;
          const mx = mwx - cameraX;
          if (mx < -60 || mx > width + 60) continue;
          const my = groundY(mwx, mk.depth);
          drawGroundMark(ctx, mk, mx, my);
        }
      }

      // Warm light pooling on the sidewalk out of lit doorways and alleys
      ctx.save();
      for (let ci = firstChunk; ci <= lastChunk; ci++) {
        const ch = getChunk(ci);
        const off = ci * CHUNK_WIDTH - cameraX;
        for (const span of ch.spans) {
          if (span.kind === "facade") {
            for (const d of span.doors) {
              if (!d.lit) continue;
              const cxd = off + d.x + d.width / 2;
              if (cxd < -60 || cxd > width + 60) continue;
              const backY = groundYAt(cameraX + cxd + seamLean);
              const frontY = groundYAt(cameraX + cxd) + pavingH;
              // Widens toward the curb, and leans with the paving so the light
              // lies on the same ground plane as the seams
              const spread = d.width * 1.9;
              ctx.beginPath();
              ctx.moveTo(cxd - d.width * 0.5 + seamLean, backY);
              ctx.lineTo(cxd + d.width * 0.5 + seamLean, backY);
              ctx.lineTo(cxd + spread, frontY);
              ctx.lineTo(cxd - spread, frontY);
              ctx.closePath();
              const spillGrad = ctx.createLinearGradient(0, backY, 0, frontY);
              spillGrad.addColorStop(0, "rgba(253,224,71,0.17)");
              spillGrad.addColorStop(1, "rgba(253,186,71,0)");
              ctx.fillStyle = spillGrad;
              ctx.fill();
            }
          } else if (span.kind === "alley" && span.lampLit) {
            const cxa = off + span.x + span.width / 2;
            if (cxa < -60 || cxa > width + 60) continue;
            const backY = groundYAt(cameraX + cxa + seamLean);
            const frontY = groundYAt(cameraX + cxa) + pavingH;
            const spillGrad = ctx.createLinearGradient(0, backY, 0, frontY);
            spillGrad.addColorStop(0, "rgba(200,215,255,0.09)");
            spillGrad.addColorStop(1, "rgba(200,215,255,0)");
            ctx.fillStyle = spillGrad;
            ctx.beginPath();
            ctx.moveTo(cxa - span.width * 0.5 + seamLean, backY);
            ctx.lineTo(cxa + span.width * 0.5 + seamLean, backY);
            ctx.lineTo(cxa + span.width * 0.7, frontY);
            ctx.lineTo(cxa - span.width * 0.7, frontY);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      ctx.restore();

      // Curb — a thin kerb top with a short face dropping to the asphalt
      const kerbTopD = SIDEWALK_DEPTH - 3 / bandH;
      fillBand(kerbTopD, SIDEWALK_DEPTH, "#4c4c54");
      fillBand(kerbTopD, kerbTopD + 1 / bandH, "rgba(255,255,255,0.16)");
      fillBand(SIDEWALK_DEPTH, SIDEWALK_DEPTH + 4 / bandH, "#26262c"); // shaded face
      fillBand(SIDEWALK_DEPTH + 4 / bandH, SIDEWALK_DEPTH + 6 / bandH, "rgba(0,0,0,0.5)"); // gutter

      // Road / asphalt
      const roadGrad = ctx.createLinearGradient(0, curbY + 5, 0, floorBottom);
      roadGrad.addColorStop(0, "#161619");
      roadGrad.addColorStop(1, "#0b0b0d");
      fillBand(SIDEWALK_DEPTH + 6 / bandH, Infinity, roadGrad);

      // Road center dashed yellow line — follows the bend
      ctx.strokeStyle = "rgba(220,170,0,0.5)";
      ctx.lineWidth = 3;
      ctx.setLineDash([34, 24]);
      ctx.lineDashOffset = -cameraX % 58;
      strokeAlong(SIDEWALK_DEPTH + (1 - SIDEWALK_DEPTH) * 0.5);
      ctx.setLineDash([]);

      // Streetlamps along the curb, spaced evenly in world space. The pools of
      // light go down here; the posts are drawn later as depth-sorted entities
      // so you can walk behind them.
      const lampGap = 340;
      const lampScreens: { x: number; baseY: number }[] = [];
      for (let lampX = Math.floor(cameraX / lampGap) * lampGap; lampX < cameraX + width + lampGap; lampX += lampGap) {
        const lx = lampX - cameraX;
        if (lx < -40 || lx > width + 40) continue;
        const baseYl = groundY(lampX, SIDEWALK_DEPTH) + 2;
        lampScreens.push({ x: lx, baseY: baseYl });
        const pool = ctx.createRadialGradient(lx + 12, baseYl + 26, 4, lx + 12, baseYl + 26, 96);
        pool.addColorStop(0, "rgba(253,224,71,0.13)");
        pool.addColorStop(1, "rgba(253,224,71,0)");
        ctx.fillStyle = pool;
        ctx.fillRect(lx - 90, baseYl - 20, 200, 130);
      }

      // Bottom vignette
      const vigGrad = ctx.createLinearGradient(0, floorBottom - 28, 0, floorBottom);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, floorBottom - 28, width, 28);

      // Depth-sorted entities
      type Entity = { depth: number; draw: () => void };
      const entities: Entity[] = [];

      // Lamp posts stand on the curb, so they sort at the curb's depth
      for (const lamp of lampScreens) {
        const lx = lamp.x;
        const baseYl = lamp.baseY;
        const headY = baseYl - 118;
        entities.push({
          depth: SIDEWALK_DEPTH,
          draw: () => {
            ctx.fillStyle = "#1b1b20";
            ctx.fillRect(lx - 2, headY, 4, baseYl - headY);
            ctx.fillRect(lx - 6, baseYl - 4, 12, 5);
            ctx.strokeStyle = "#1b1b20";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(lx, headY + 4);
            ctx.quadraticCurveTo(lx + 10, headY - 4, lx + 18, headY + 3);
            ctx.stroke();
            ctx.save();
            ctx.shadowColor = "rgba(253,224,71,0.9)";
            ctx.shadowBlur = 18;
            ctx.fillStyle = "rgba(253,230,138,0.95)";
            ctx.beginPath();
            ctx.ellipse(lx + 18, headY + 7, 5, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          },
        });
      }

      for (let ci = Math.max(0, Math.floor((cameraX - width) / CHUNK_WIDTH) - 1);
           ci <= Math.floor((cameraX + width) / CHUNK_WIDTH) + 1; ci++) {
        const ch = getChunk(ci);
        for (const prop of ch.props) {
          const wx = ci * CHUNK_WIDTH + prop.x;
          const esx = wx - cameraX;
          if (esx < -100 || esx > width + 100) continue;
          const esy = groundY(wx, prop.depth);
          const sc = (MIN_SCALE + prop.depth * (MAX_SCALE - MIN_SCALE)) * prop.size;
          const p = prop;
          entities.push({
            depth: prop.depth,
            draw: () =>
              drawShadowAndSprite(ctx, esx, esy, sc, (c, s) => {
                c.fillStyle = p.color;
                if (p.tree) {
                  // Barely-there sway, tied to world x so no two trees move together
                  drawStreetTree(c, s, p.tree, Math.sin(nowTs * 0.0009 + wx * 0.01) * 1.6 * s);
                } else if (p.type === "trashcan") {
                  // Cylinder body
                  c.fillRect(-10 * s, -34 * s, 20 * s, 34 * s);
                  // Rounded bottom
                  c.beginPath();
                  c.ellipse(0, 0, 10 * s, 5 * s, 0, 0, Math.PI * 2);
                  c.fill();
                  // Lid (slightly wider, offset)
                  c.fillStyle = "#888";
                  c.beginPath();
                  c.ellipse(0, -34 * s, 12 * s, 5 * s, 0, 0, Math.PI * 2);
                  c.fill();
                  // Lid handle
                  c.fillStyle = "#aaa";
                  c.fillRect(-3 * s, -40 * s, 6 * s, 6 * s);
                  // Ribs
                  c.strokeStyle = "rgba(0,0,0,0.3)";
                  c.lineWidth = 1.5 * s;
                  for (const ry of [-28, -20, -12]) {
                    c.beginPath();
                    c.moveTo(-10 * s, ry * s);
                    c.lineTo(10 * s, ry * s);
                    c.stroke();
                  }
                } else if (p.type === "dumpster") {
                  // Lid top surface — two flat panels seen from slightly above
                  c.fillStyle = p.color;
                  c.fillRect(-28 * s, -45 * s, 27 * s, 9 * s); // left panel
                  c.fillStyle = "rgba(0,0,0,0.16)";
                  c.fillRect(1 * s, -45 * s, 27 * s, 9 * s);   // right panel (shadowed)
                  // Lid front face (visible thickness)
                  c.fillStyle = p.color;
                  c.fillRect(-28 * s, -36 * s, 56 * s, 6 * s);
                  // Top edge highlight
                  c.strokeStyle = "rgba(255,255,255,0.1)";
                  c.lineWidth = s;
                  c.beginPath();
                  c.moveTo(-28 * s, -45 * s);
                  c.lineTo(28 * s, -45 * s);
                  c.stroke();
                  // Center hinge gap
                  c.strokeStyle = "rgba(0,0,0,0.7)";
                  c.lineWidth = 2.5 * s;
                  c.lineCap = "butt";
                  c.beginPath();
                  c.moveTo(0, -45 * s);
                  c.lineTo(0, -30 * s);
                  c.stroke();
                  // Body
                  c.fillStyle = p.color;
                  c.fillRect(-28 * s, -30 * s, 56 * s, 30 * s);
                  // Lower darker strip
                  c.fillStyle = "rgba(0,0,0,0.22)";
                  c.fillRect(-28 * s, -10 * s, 56 * s, 10 * s);
                  // Horizontal rib
                  c.strokeStyle = "rgba(0,0,0,0.28)";
                  c.lineWidth = 1.5 * s;
                  c.beginPath();
                  c.moveTo(-28 * s, -18 * s);
                  c.lineTo(28 * s, -18 * s);
                  c.stroke();
                  // Body outline
                  c.strokeStyle = "rgba(0,0,0,0.55)";
                  c.lineWidth = 1.5 * s;
                  c.strokeRect(-28 * s, -30 * s, 56 * s, 30 * s);
                  // Lift pockets (slots for garbage truck forks)
                  c.strokeStyle = "#3a3a3a";
                  c.lineWidth = 2.5 * s;
                  c.strokeRect(-28 * s, -24 * s, 10 * s, 8 * s);
                  c.strokeRect(18 * s, -24 * s, 10 * s, 8 * s);
                  // Wheels
                  c.fillStyle = "#1a1a1a";
                  c.beginPath(); c.arc(-18 * s, 0, 4.5 * s, 0, Math.PI * 2); c.fill();
                  c.beginPath(); c.arc(18 * s, 0, 4.5 * s, 0, Math.PI * 2); c.fill();
                  c.fillStyle = "#333";
                  c.beginPath(); c.arc(-18 * s, 0, 2.5 * s, 0, Math.PI * 2); c.fill();
                  c.beginPath(); c.arc(18 * s, 0, 2.5 * s, 0, Math.PI * 2); c.fill();
                } else {
                  // Parked car (polygon)
                  // Body
                  c.fillRect(-36 * s, -22 * s, 72 * s, 22 * s);
                  // Roof (trapezoid)
                  c.beginPath();
                  c.moveTo(-22 * s, -22 * s);
                  c.lineTo(-18 * s, -38 * s);
                  c.lineTo(18 * s, -38 * s);
                  c.lineTo(22 * s, -22 * s);
                  c.closePath();
                  c.fill();
                  // Windows
                  c.fillStyle = "rgba(100,180,255,0.4)";
                  c.fillRect(-16 * s, -36 * s, 13 * s, 13 * s);
                  c.fillRect(3 * s, -36 * s, 13 * s, 13 * s);
                  // Outline
                  c.strokeStyle = "rgba(0,0,0,0.45)";
                  c.lineWidth = 1.5 * s;
                  c.strokeRect(-36 * s, -22 * s, 72 * s, 22 * s);
                  // Wheels
                  c.fillStyle = "#111";
                  c.beginPath(); c.ellipse(-22 * s, 0, 9 * s, 5 * s, 0, 0, Math.PI * 2); c.fill();
                  c.beginPath(); c.ellipse(22 * s, 0, 9 * s, 5 * s, 0, 0, Math.PI * 2); c.fill();
                  c.fillStyle = "#444";
                  c.beginPath(); c.ellipse(-22 * s, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); c.fill();
                  c.beginPath(); c.ellipse(22 * s, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); c.fill();
                  // Headlights
                  c.fillStyle = "rgba(255,240,100,0.7)";
                  c.fillRect(28 * s, -16 * s, 8 * s, 5 * s);
                  // Taillights
                  c.fillStyle = "rgba(200,30,30,0.8)";
                  c.fillRect(-36 * s, -16 * s, 6 * s, 5 * s);
                }
              }),
          });
        }
      }

      for (const enemy of state.enemies) {
        const esx = enemy.worldX - cameraX;
        if (esx < -100 || esx > width + 100) continue;
        const esy = groundY(enemy.worldX, enemy.depth) - enemy.floatY;
        let sc = MIN_SCALE + enemy.depth * (MAX_SCALE - MIN_SCALE);
        // Fade up out of the dark doorway they stepped from
        let alpha = enemy.emerging ? Math.min(1, (nowTs - enemy.spawnedAt) / 320) : 1;
        if (enemy.dying) {
          const t = Math.min(1, (nowTs - (enemy.deathStartedAt ?? nowTs)) / 260);
          alpha = 1 - t;
          sc *= 1 - 0.3 * t;
        }
        const e2 = enemy;
        const eWalkT = (live ? nowTs : gameOverAt) / 1000;
        const eStunned = nowTs < e2.stunUntil;
        const eAttackT =
          e2.attackStartedAt !== null
            ? Math.min(1, (nowTs - e2.attackStartedAt) / ENEMY_WINDUP_MS)
            : 0;
        const eFacing: 1 | -1 = state.player.worldX >= e2.worldX ? 1 : -1;
        // Snakes: aim window and muzzle flash both drive the sprite
        const sAimT =
          e2.aimStartedAt !== null ? Math.min(1, (nowTs - e2.aimStartedAt) / SNAKE_AIM_MS) : null;
        const sFlash =
          e2.kind === "snake" && e2.shotsLeft > 0
            ? Math.max(0, 1 - (nowTs - (e2.nextShotAt - SNAKE_BURST_GAP_MS)) / 90)
            : 0;
        entities.push({
          depth: enemy.depth,
          draw: () => {
            ctx.save();
            ctx.globalAlpha = alpha;
            if (e2.kind === "snake") {
              // Laser sight down the lane it is about to fire along
              if (sAimT !== null) {
                const laserY = esy - MUZZLE_Y * sc;
                const grow = Math.min(1, sAimT * 1.6);
                ctx.save();
                ctx.globalAlpha = alpha * (0.35 + 0.35 * Math.sin(nowTs * 0.02));
                ctx.strokeStyle = "#ef4444";
                ctx.lineWidth = 1.5;
                ctx.setLineDash([9, 7]);
                ctx.beginPath();
                ctx.moveTo(esx + eFacing * 46 * sc, laserY);
                ctx.lineTo(esx + eFacing * (46 + 620 * grow) * sc, laserY);
                ctx.stroke();
                ctx.restore();
              }
              drawShadowAndSprite(ctx, esx, esy, sc, (c) => {
                c.save();
                if (eFacing === -1) c.scale(-1, 1);
                drawRoboSnake(c, sc, eWalkT, { aimT: sAimT, flash: sFlash, stunned: eStunned });
                c.restore();
              });
            } else {
              drawShadowAndSprite(ctx, esx, esy, sc, (c) => {
                drawEnemyPerson(c, sc, eWalkT, eStunned, { attackT: eAttackT, facing: eFacing });
              });
            }
            ctx.restore();
          },
        });
      }

      for (const pu of state.pickups) {
        const usx = pu.worldX - cameraX;
        if (usx < -60 || usx > width + 60) continue;
        const age = nowTs - pu.spawnedAt;
        // Blink out over the last second of its life
        const fading = age > PICKUP_LIFETIME_MS - 1200;
        if (fading && Math.floor(age / 110) % 2 === 0) continue;
        const usy = groundY(pu.worldX, pu.depth);
        const usc = MIN_SCALE + pu.depth * (MAX_SCALE - MIN_SCALE);
        const bob = Math.sin(nowTs * 0.005 + pu.worldX) * 4 * usc;
        const spin = nowTs * 0.003 + pu.worldX;
        entities.push({
          depth: pu.depth,
          draw: () => {
            ctx.save();
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.beginPath();
            ctx.ellipse(usx, usy, 12 * usc, 4 * usc, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.translate(usx, usy - 14 * usc - bob);
            ctx.shadowColor = "rgba(250,204,21,0.8)";
            ctx.shadowBlur = 12;
            drawBanana(ctx, usc, spin);
            ctx.restore();
          },
        });
      }

      for (const b of state.bullets) {
        const bsx = b.worldX - cameraX;
        if (bsx < -80 || bsx > width + 80) continue;
        const bsc = MIN_SCALE + b.depth * (MAX_SCALE - MIN_SCALE);
        const bsy = groundY(b.worldX, b.depth) - b.yOff * bsc;
        const tail = 26 * bsc;
        entities.push({
          depth: b.depth,
          draw: () => {
            ctx.save();
            ctx.strokeStyle = "rgba(253,224,71,0.55)";
            ctx.lineWidth = 2 * bsc;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(bsx - b.dir * tail, bsy);
            ctx.lineTo(bsx, bsy);
            ctx.stroke();
            ctx.fillStyle = "#fef08a";
            ctx.beginPath();
            ctx.arc(bsx, bsy, 2.4 * bsc, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          },
        });
      }

      for (const b of state.enemyBullets) {
        const bsx = b.worldX - cameraX;
        if (bsx < -60 || bsx > width + 60) continue;
        const bsc = MIN_SCALE + b.depth * (MAX_SCALE - MIN_SCALE);
        const bsy = groundY(b.worldX, b.depth) - MUZZLE_Y * bsc;
        entities.push({
          depth: b.depth,
          draw: () => {
            ctx.save();
            // Hot core with a smear behind it — reads as a slug in flight, not a dot
            ctx.strokeStyle = "rgba(248,113,113,0.45)";
            ctx.lineWidth = 3 * bsc;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(bsx - b.dir * 16 * bsc, bsy);
            ctx.lineTo(bsx, bsy);
            ctx.stroke();
            ctx.shadowColor = "rgba(248,113,113,0.9)";
            ctx.shadowBlur = 10;
            ctx.fillStyle = "#fecaca";
            ctx.beginPath();
            ctx.ellipse(bsx, bsy, 4.5 * bsc, 3 * bsc, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          },
        });
      }

      // Combo visual state for player draw
      let comboHitStep: 0 | 1 | 2 | undefined;
      let comboProgress = 0;
      if (combo.visual) {
        const prog = (nowTs - combo.visual.startedAt) / (combo.visual.duration * 1000);
        if (prog >= 1) {
          combo.visual = null;
        } else {
          comboHitStep = combo.visual.step;
          comboProgress = Math.sin(prog * Math.PI);
        }
      }

      // Whichever earned weapon is selected rides in the player's hands
      const heldWeapon: "minigun" | "sword" | undefined =
        state.selectedAttack === 4 && state.player.level >= 4
          ? "minigun"
          : state.selectedAttack === 5 && state.player.level >= 5
            ? "sword"
            : undefined;
      // Barrels idle slowly and whip round while firing
      const barrelSpin = nowTs * (minigun.firing ? 0.03 : 0.0035);
      const swordT =
        sword.swingStartedAt !== null
          ? Math.min(1, (nowTs - sword.swingStartedAt) / SWORD_SWING_MS)
          : null;

      const walkPhase = state.isMoving ? Math.sin(state.walkTime * 8) : 0;
      entities.push({
        depth: state.player.depth,
        draw: () => {
          // Flicker while invulnerable, and flash red on the hit itself
          const hurt = nowTs < state.player.hurtUntil;
          const invuln = nowTs < state.player.invulnUntil;
          ctx.save();
          if (invuln && !hurt && Math.floor(nowTs / 90) % 2 === 0) ctx.globalAlpha = 0.4;
          drawShadowAndSprite(ctx, psx, psy, ps, (c, s) => {
            c.save();
            if (state.player.facing === -1) c.scale(-1, 1);
            drawPerson(c, s, {
              walkPhase,
              skinColor: hurt ? "#fca5a5" : "#fbbf24",
              shirtColor: hurt ? "#b91c1c" : "#1d4ed8",
              pantsColor: hurt ? "#7f1d1d" : "#1e293b",
              hairColor: "#111827",
              comboHit: comboHitStep,
              comboProgress,
              weapon: heldWeapon,
              weaponSpin: barrelSpin,
              firing: minigun.firing,
              swordT,
              swordSpin: sword.spin,
            });
            c.restore();
          });
          ctx.restore();

          // Slash arc — swept where the blade just went, so the hit reads even
          // though the damage all lands on the first frame
          if (heldWeapon === "sword" && swordT !== null) {
            const fade = 1 - swordT;
            const r = SWORD_REACH * 0.62 * ps;
            ctx.save();
            ctx.translate(psx, psy - 32 * ps);
            ctx.scale(state.player.facing, 1);
            ctx.strokeStyle = `rgba(226,232,240,${0.75 * fade})`;
            ctx.lineWidth = 7 * ps * fade + 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            if (sword.spin) {
              ctx.arc(0, 0, r, -Math.PI * 0.6, -Math.PI * 0.6 + swordT * Math.PI * 2);
            } else {
              const a0 = -Math.PI * 0.5;
              ctx.arc(0, 0, r, a0, a0 + swordT * Math.PI * 0.75);
            }
            ctx.stroke();
            ctx.strokeStyle = `rgba(250,204,21,${0.4 * fade})`;
            ctx.lineWidth = 2 * ps;
            ctx.stroke();
            ctx.restore();
          }

          // Parrot on shoulder when slot 2 is idle/cooldown
          if (state.selectedAttack === 2 && state.player.level >= 2) {
            if (parrot.phase === "idle" || parrot.phase === "cooldown") {
              const parrX = psx + state.player.facing * 13 * ps;
              const parrY = psy - 46 * ps;
              drawParrot(ctx, parrX, parrY, ps * 0.85, parrot.phase === "cooldown", state.player.facing === -1);
            }
          }
        },
      });

      entities.sort((a, b) => a.depth - b.depth);
      for (const ent of entities) ent.draw();

      // Parrot in flight (over everything)
      if (parrot.phase !== "idle" && parrot.phase !== "cooldown") {
        const flyingRight = parrot.phase === "returning" ? false : state.player.facing === -1;
        drawParrot(ctx, parrot.pScreenX, parrot.pScreenY, ps * 0.9, false, flyingRight);
      }

      // Score floaters
      for (const f of state.floaters) {
        const t = (nowTs - f.startedAt) / 900;
        const fx = f.worldX - cameraX;
        const fy = groundY(f.worldX, f.depth) - 60 - t * 40;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = f.color;
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 3;
        ctx.strokeText(f.text, fx, fy);
        ctx.fillText(f.text, fx, fy);
        ctx.restore();
      }

      // Goldfish car drive-by
      if (carState.active) {
        const cx = carDrawCx;
        const cy = carDrawCy;
        drawGoldfishCar(ctx, cx, cy);
        // Bullet spray
        ctx.save();
        for (let i = 0; i < 7; i++) {
          const bt = (nowTs * 0.004 + i * 0.36) % 1;
          const bx = cx + 42 + bt * 90;
          const by2 = cy - 32 - bt * 55 + Math.sin(bt * 14 + i * 1.3) * 18;
          ctx.fillStyle = `rgba(250,204,21,${1 - bt})`;
          ctx.beginPath();
          ctx.arc(bx, by2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.restore();
      drawHud();
      drawScore(nowTs);
      if (touchMode && live) drawTouchControls();
      if (titlePhase === "gameover") drawGameOver(nowTs);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("click", onCanvasClick);
      canvas.removeEventListener("mousemove", onCanvasMouseMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      coarseQuery.removeEventListener("change", onPointerKind);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      {/* touchAction none so dragging the stick never scrolls the page */}
      <canvas ref={canvasRef} className="block w-full h-full" style={{ touchAction: "none" }} />
    </div>
  );
}
