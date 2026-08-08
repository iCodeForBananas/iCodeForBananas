"use client";

import { useEffect, useRef } from "react";

const HORIZON_RATIO = 0.45;
const CHUNK_WIDTH = 900;
const PLAYER_SPEED = 260;
const PLAYER_DEPTH_SPEED = 0.6;
const MIN_SCALE = 0.45;
const MAX_SCALE = 1.55;
const ANCHOR_X_RATIO = 0.35;
const DEPTH_TO_WORLD = 200;
const ENEMY_SPEED = 55;
const ENEMY_DEPTH_SPEED = 0.18;
const MAX_ENEMIES = 5;
const ENEMY_XP = 25;
const XP_THRESHOLDS = [100, 250, 500];
const COMBO_WINDOW_MS = 600;
const MIN_PLAYER_DEPTH = 0.32; // top of walkable road (~1/3 viewport from bottom)
const MAX_PLAYER_DEPTH = 0.92; // bottom of walkable road
const CAMERA_ZOOM = 1.4; // world is drawn in a smaller logical viewport, scaled up = tighter, cinematic framing

const PARROT_LIFT_HEIGHT = 210; // how high the parrot hauls an enemy before dropping them
const PARROT_LIFT_MS = 650;
const PARROT_HANG_MS = 180;
const PARROT_SLAM_MS = 260;
const PARROT_SLAM_DAMAGE = 90;

const SCORE_KILL = 100;
const SCORE_PICKUP = 50;
const PICKUP_LIFETIME_MS = 9000;
const HIGH_SCORE_KEY = "shoot-simulator-high-score";

type PropType = "trashcan" | "dumpster" | "car";

// Where a prop actually touches the ground, in unscaled sprite pixels (multiplied
// by the prop's draw scale). Deliberately just the base — not the sprite's bounding
// box — so you can walk close behind or in front of a car instead of hitting an
// invisible wall. halfD is screen pixels, converted to depth at collision time.
const PROP_FOOTPRINT: Record<PropType, { halfW: number; halfD: number }> = {
  trashcan: { halfW: 9, halfD: 4 },
  dumpster: { halfW: 24, halfD: 5 },
  car: { halfW: 30, halfD: 6 },
};
// Player and enemies share a footprint — roughly the width of their stance
const ACTOR_HALF_W = 7;
const ACTOR_HALF_D = 3;
const ENEMY_AVOID_DEPTH_SPEED = 0.5; // faster than their normal drift so they round a car promptly

interface GroundProp {
  x: number;
  depth: number;
  type: PropType;
  color: string;
  size: number;
  /** Ground-footprint half-extents in screen pixels, already scaled. */
  halfW: number;
  halfD: number;
}

interface Building {
  x: number;
  width: number;
  height: number;
  color: string;
  windows: { x: number; y: number; lit: boolean }[];
}

interface Chunk {
  props: GroundProp[];
  buildings: Building[];
}

interface Enemy {
  id: number;
  worldX: number;
  depth: number;
  hp: number;
  dying: boolean;
  deathStartedAt: number | null;
  stunUntil: number;
  floatY: number;
  grabbed: boolean;
  /** Which way they try to step around an obstacle that blocks their path. */
  avoidDir: 1 | -1;
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
  const propCount = 2 + Math.floor(rand() * 4);
  const props: GroundProp[] = [];
  const propColors: Record<PropType, string[]> = {
    trashcan: ["#4a4a4a", "#3a3a3a", "#555", "#606060"],
    dumpster: ["#1a5c1a", "#0e420e", "#1d6b22", "#2d4a0a"],
    car: ["#7a1f1f", "#1f3f7a", "#3a3a3a", "#4a4a1f"],
  };
  for (let i = 0; i < propCount; i++) {
    const roll = rand();
    const type: PropType = roll < 0.35 ? "trashcan" : roll < 0.65 ? "dumpster" : "car";
    const depth = 0.34 + rand() * 0.54;
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
  // Props are solid, so keep them apart along x — two overlapping footprints
  // could span the whole road depth and wall the street off completely.
  props.sort((a, b) => a.x - b.x);
  const placed: GroundProp[] = [];
  for (const prop of props) {
    const prev = placed[placed.length - 1];
    if (prev) prop.x = Math.max(prop.x, prev.x + prev.halfW + prop.halfW + 70);
    if (prop.x + prop.halfW > CHUNK_WIDTH) break;
    placed.push(prop);
  }
  return { buildings, props: placed };
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
  const rightArmDx =
    opts.comboHit === 0 ? 9 + cp * 22 : opts.comboHit === 1 ? 9 + cp * 10 : 9 + (stunned ? 0 : wp * 8);
  const leftArmDx =
    opts.comboHit === 1 ? -(9 + cp * 14) : -(9 + (stunned ? 0 : wp * 6));
  ctx.beginPath();
  ctx.moveTo(9 * s, -38 * s);
  ctx.lineTo(rightArmDx * s, -26 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9 * s, -38 * s);
  ctx.lineTo(leftArmDx * s, -26 * s);
  ctx.stroke();

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

function drawEnemyPerson(ctx: CanvasRenderingContext2D, s: number, walkT: number, stunned: boolean) {
  ctx.lineCap = "round";
  const wp = stunned ? 0 : Math.sin(walkT * 6) * 0.8;

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

  // Arms (menacing — both angled forward)
  ctx.lineWidth = 5 * s;
  ctx.strokeStyle = "#991b1b";
  ctx.beginPath();
  ctx.moveTo(-9 * s, -36 * s);
  ctx.lineTo(-15 * s, -24 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(9 * s, -36 * s);
  ctx.lineTo(15 * s, -24 * s);
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

export default function HomeGame() {
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

    // Title screen
    let titlePhase: "title" | "playing" = "title";
    const playBtn = { x: 0, y: 0, w: 0, h: 0 };
    const onCanvasClick = (e: MouseEvent) => {
      if (titlePhase !== "title") return;
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / CAMERA_ZOOM;
      const cy = (e.clientY - rect.top) / CAMERA_ZOOM;
      if (cx >= playBtn.x && cx <= playBtn.x + playBtn.w && cy >= playBtn.y && cy <= playBtn.y + playBtn.h) {
        titlePhase = "playing";
        canvas.style.cursor = "default";
      }
    };
    const onCanvasMouseMove = (e: MouseEvent) => {
      if (titlePhase !== "title") return;
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

    let storedHigh = 0;
    try {
      storedHigh = Number(window.localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    } catch {
      storedHigh = 0;
    }

    const state = {
      player: { worldX: (width * ANCHOR_X_RATIO) || 300, depth: 0.6, facing: 1 as 1 | -1, level: 1, xp: 0 },
      selectedAttack: 1 as 1 | 2 | 3,
      attackReadyAt: { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>,
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
      floaters: [] as Floater[],
    };

    // Don't start the player standing inside a prop
    {
      const s = MIN_SCALE + state.player.depth * (MAX_SCALE - MIN_SCALE);
      const hw = ACTOR_HALF_W * s;
      const hd = ACTOR_HALF_D * s;
      let guard = 0;
      while (overlapsProp(state.player.worldX, state.player.depth, hw, hd) && guard++ < 100) {
        state.player.worldX += 20;
      }
    }

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
      if (enemy.hp <= 0) {
        const now = performance.now();
        enemy.dying = true;
        enemy.deathStartedAt = now;
        enemy.grabbed = false;
        gainXp(ENEMY_XP);
        addScore(SCORE_KILL, enemy.worldX, enemy.depth, "#facc15", now);
        state.pickups.push({ worldX: enemy.worldX, depth: enemy.depth, spawnedAt: now });
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
      state.attackReadyAt[3] = now + 3000;
      state.shakeUntil = now + 500;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "1", "2", "3", " "].includes(key)) e.preventDefault();
      if (titlePhase === "title" && (key === " " || key === "enter")) {
        titlePhase = "playing";
        canvas.style.cursor = "default";
        return;
      }
      keys.add(key);
      if (key === "1" || key === "2" || key === "3") {
        const id = Number(key) as 1 | 2 | 3;
        const unlock = [0, 1, 2, 3];
        if (state.player.level >= unlock[id]) state.selectedAttack = id;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let cameraX = 0;
    let lastTime = performance.now();
    let rafId = 0;
    let spaceWasDown = false;

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

      // City silhouette
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
            ctx.fillStyle = w.lit ? "#facc15" : "rgba(255,255,255,0.04)";
            ctx.fillRect(bx + w.x, groundY - b.height + w.y, 5, 7);
          }
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
      ctx.fillText("WASD / ARROWS · SPACE to attack · 1 / 2 / 3 switch attacks", width / 2, btnY + btnH + 28);
      if (state.highScore > 0) {
        ctx.fillStyle = "rgba(250,204,21,0.6)";
        ctx.font = `bold ${Math.max(11, Math.min(14, width * 0.024))}px system-ui, sans-serif`;
        ctx.fillText(`HIGH SCORE ${String(state.highScore).padStart(5, "0")}`, width / 2, btnY + btnH + 50);
      }
      ctx.restore();
    };

    const drawScore = (now: number) => {
      const pad = 16;
      const boxW = 168;
      const boxH = 62;
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
      ctx.translate(bx + boxW - 10, by + 40);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 24px system-ui, sans-serif";
      ctx.fillText(String(state.score).padStart(5, "0"), 0, 0);
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(`HIGH ${String(state.highScore).padStart(5, "0")}`, bx + boxW - 10, by + 55);
      ctx.restore();
    };

    const drawHud = () => {
      const { level, xp } = state.player;
      const threshold = xpToNext(level);
      const boxSize = 38;
      const gap = 8;
      const sw = boxSize * 3 + gap * 2;
      const px = 16;
      const pw = sw + 16;
      const pb = height - 16;
      const sy = pb - boxSize;
      const labelY = sy - 6;
      const bh = 12;
      const by = labelY - 10 - bh;
      const lty = by - 8;
      const pt = lty - 22;
      const names: Record<1 | 2 | 3, string> = { 1: "Punch", 2: "Parrot", 3: "Fishcar" };
      const unlocks: Record<1 | 2 | 3, number> = { 1: 1, 2: 2, 3: 3 };

      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(px - 8, pt, pw, pb - pt + 8);
      ctx.strokeStyle = "rgba(250,204,21,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 8, pt, pw, pb - pt + 8);

      ctx.fillStyle = "#facc15";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textBaseline = "alphabetic";
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

      for (let i = 1; i <= 3; i++) {
        const id = i as 1 | 2 | 3;
        const unlocked = level >= unlocks[id];
        const selected = state.selectedAttack === id;
        const x = px + (i - 1) * (boxSize + gap);
        ctx.fillStyle = unlocked ? (selected ? "#facc15" : "rgba(250,204,21,0.15)") : "rgba(255,255,255,0.06)";
        ctx.fillRect(x, sy, boxSize, boxSize);
        ctx.strokeStyle = selected ? "#fff" : unlocked ? "rgba(250,204,21,0.7)" : "rgba(255,255,255,0.2)";
        ctx.lineWidth = selected ? 2.5 : 1;
        ctx.strokeRect(x, sy, boxSize, boxSize);
        ctx.fillStyle = unlocked ? (selected ? "#111" : "#facc15") : "rgba(255,255,255,0.3)";
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(i), x + boxSize / 2, sy + boxSize / 2 + 6);
        ctx.font = "8px system-ui, sans-serif";
        ctx.fillStyle = unlocked ? "rgba(250,204,21,0.85)" : "rgba(255,255,255,0.25)";
        ctx.fillText(unlocked ? names[id] : "???", x + boxSize / 2, labelY);
      }
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

      let vx = 0, vd = 0;
      if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
      if (keys.has("arrowright") || keys.has("d")) vx += 1;
      if (keys.has("arrowup") || keys.has("w")) vd -= 1;
      if (keys.has("arrowdown") || keys.has("s")) vd += 1;

      state.isMoving = vx !== 0 || vd !== 0;
      if (state.isMoving) state.walkTime += dt;

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

      const psx = state.player.worldX - cameraX;
      const psy = horizonY + state.player.depth * (floorBottom - horizonY);
      const ps = MIN_SCALE + state.player.depth * (MAX_SCALE - MIN_SCALE);

      // Space: trigger on leading edge
      const spaceDown = keys.has(" ");
      if (spaceDown && !spaceWasDown) {
        if (state.selectedAttack === 1) doComboHit(nowTs);
        else if (state.selectedAttack === 2) doParrotAttack(nowTs, psx, psy);
        else if (state.selectedAttack === 3) doCarAttack(nowTs, psy);
      }
      spaceWasDown = spaceDown;

      // Enemy update
      for (const enemy of state.enemies) {
        if (enemy.dying || enemy.grabbed) continue;
        if (enemy.floatY > 0) enemy.floatY = Math.max(0, enemy.floatY - 80 * dt);
        if (nowTs < enemy.stunUntil) continue;
        const dxp = state.player.worldX - enemy.worldX;
        const ddp = state.player.depth - enemy.depth;
        const eScale = MIN_SCALE + enemy.depth * (MAX_SCALE - MIN_SCALE);
        const eHalfW = ACTOR_HALF_W * eScale;
        const eHalfD = ACTOR_HALF_D * eScale;
        // Same escape hatch as the player: never freeze an enemy inside a prop
        const eInside = overlapsProp(enemy.worldX, enemy.depth, eHalfW, eHalfD);

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
      state.enemies = state.enemies.filter((e) => {
        if (e.dying) return nowTs - (e.deathStartedAt ?? 0) < 260;
        return e.worldX >= cameraX - 500;
      });
      if (state.enemies.length < MAX_ENEMIES && nowTs >= state.nextSpawnAt) {
        state.enemies.push({
          id: state.nextEnemyId++,
          worldX: cameraX + width + 80 + Math.random() * 220,
          depth: MIN_PLAYER_DEPTH + 0.05 + Math.random() * (MAX_PLAYER_DEPTH - MIN_PLAYER_DEPTH - 0.05),
          hp: 100,
          dying: false,
          deathStartedAt: null,
          stunUntil: 0,
          floatY: 0,
          grabbed: false,
          avoidDir: Math.random() < 0.5 ? 1 : -1,
        });
        state.nextSpawnAt = nowTs + 1400 + Math.random() * 900;
      }

      // Banana pickups dropped by fallen enemies
      state.pickups = state.pickups.filter((pu) => {
        if (nowTs - pu.spawnedAt > PICKUP_LIFETIME_MS) return false;
        const dx = Math.abs(pu.worldX - state.player.worldX);
        const dd = Math.abs(pu.depth - state.player.depth);
        if (dx < 34 && dd < 0.07) {
          addScore(SCORE_PICKUP, pu.worldX, pu.depth, "#fde68a", nowTs);
          return false;
        }
        return pu.worldX >= cameraX - 400;
      });
      state.floaters = state.floaters.filter((f) => nowTs - f.startedAt < 900);

      // Parrot state machine
      if (parrot.phase === "flying-out") {
        const tgt = state.enemies.find((e) => e.id === parrot.targetId);
        if (!tgt || tgt.dying) {
          parrot.phase = "idle";
        } else {
          const tSX = tgt.worldX - cameraX;
          const tSY = horizonY + tgt.depth * (floorBottom - horizonY) - 20 * ps;
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
          const tgtGroundY = horizonY + tgt.depth * (floorBottom - horizonY);
          // Lift as high as the street allows, stopping just under the horizon
          parrot.liftHeight = Math.max(90, Math.min(PARROT_LIFT_HEIGHT, tgtGroundY - horizonY + 40));
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
            horizonY + tgt.depth * (floorBottom - horizonY) - parrot.liftHeight - 34 - 12 * ps - hang * 6;
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

      let carDrawCx = 0;
      let carDrawCy = 0;
      if (carState.active) {
        const carProgress = (nowTs - carState.startedAt) / 1600;
        carDrawCx = -120 + (width + 240) * carProgress;
        carDrawCy = carState.screenY - 14;
        for (const e of state.enemies) {
          if (e.dying || carState.hitIds.has(e.id)) continue;
          const eesx = e.worldX - cameraX;
          const eesy = horizonY + e.depth * (floorBottom - horizonY);
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

      // Buildings (parallax)
      const par = 0.4;
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
            ctx.fillStyle = w.lit ? "#facc15" : "rgba(255,255,255,0.05)";
            ctx.fillRect(bx + w.x, by2 + w.y, 6, 8);
          }
        }
      }

      // Ground base
      ctx.fillStyle = "#09090c";
      ctx.fillRect(0, horizonY, width, floorBottom - horizonY);

      // Sidewalk (above the walkable road)
      const curbY = horizonY + MIN_PLAYER_DEPTH * (floorBottom - horizonY);
      const swGrad = ctx.createLinearGradient(0, horizonY, 0, curbY);
      swGrad.addColorStop(0, "#222226");
      swGrad.addColorStop(1, "#35353c");
      ctx.fillStyle = swGrad;
      ctx.fillRect(0, horizonY, width, curbY - horizonY);

      // Sidewalk tile seams — horizontal
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.lineWidth = 1;
      for (let d = 0.25; d < 1; d += 0.25) {
        const ty = horizonY + d * (curbY - horizonY);
        ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(width, ty); ctx.stroke();
      }
      // Sidewalk tile seams — vertical, scrolling with camera
      const tileW = 68;
      const tileOff = tileW - (cameraX * 0.55) % tileW;
      for (let tx = tileOff - tileW; tx < width + tileW; tx += tileW) {
        ctx.beginPath(); ctx.moveTo(tx, horizonY); ctx.lineTo(tx, curbY); ctx.stroke();
      }

      // Curb lip
      ctx.fillStyle = "#505058";
      ctx.fillRect(0, curbY - 5, width, 9);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(0, curbY - 5, width, 2); // highlight top
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, curbY + 3, width, 2); // shadow bottom

      // Road / asphalt
      const roadGrad = ctx.createLinearGradient(0, curbY + 4, 0, floorBottom);
      roadGrad.addColorStop(0, "#161619");
      roadGrad.addColorStop(1, "#0b0b0d");
      ctx.fillStyle = roadGrad;
      ctx.fillRect(0, curbY + 4, width, floorBottom - curbY - 4);

      // Road center dashed yellow line — scrolls with camera
      const laneY = curbY + (floorBottom - curbY) * 0.5;
      ctx.strokeStyle = "rgba(220,170,0,0.5)";
      ctx.lineWidth = 3;
      ctx.setLineDash([34, 24]);
      ctx.lineDashOffset = -(cameraX * 0.4) % 58;
      ctx.beginPath(); ctx.moveTo(0, laneY); ctx.lineTo(width, laneY); ctx.stroke();
      ctx.setLineDash([]);

      // Bottom vignette
      const vigGrad = ctx.createLinearGradient(0, floorBottom - 28, 0, floorBottom);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, floorBottom - 28, width, 28);

      // Depth-sorted entities
      type Entity = { depth: number; draw: () => void };
      const entities: Entity[] = [];

      for (let ci = Math.max(0, Math.floor((cameraX - width) / CHUNK_WIDTH) - 1);
           ci <= Math.floor((cameraX + width) / CHUNK_WIDTH) + 1; ci++) {
        const ch = getChunk(ci);
        for (const prop of ch.props) {
          const wx = ci * CHUNK_WIDTH + prop.x;
          const esx = wx - cameraX;
          if (esx < -100 || esx > width + 100) continue;
          const esy = horizonY + prop.depth * (floorBottom - horizonY);
          const sc = (MIN_SCALE + prop.depth * (MAX_SCALE - MIN_SCALE)) * prop.size;
          const p = prop;
          entities.push({
            depth: prop.depth,
            draw: () =>
              drawShadowAndSprite(ctx, esx, esy, sc, (c, s) => {
                c.fillStyle = p.color;
                if (p.type === "trashcan") {
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
                  // Main body (wider box)
                  c.fillRect(-28 * s, -36 * s, 56 * s, 36 * s);
                  // Darker bottom strip
                  c.fillStyle = "rgba(0,0,0,0.35)";
                  c.fillRect(-28 * s, -8 * s, 56 * s, 8 * s);
                  // Lid panels (two halves, angled)
                  const lidColor = c.fillStyle = p.color;
                  void lidColor;
                  c.fillStyle = p.color;
                  // Left lid half
                  c.beginPath();
                  c.moveTo(-28 * s, -36 * s);
                  c.lineTo(0, -44 * s);
                  c.lineTo(0, -36 * s);
                  c.closePath();
                  c.fill();
                  // Right lid half
                  c.fillStyle = "rgba(0,0,0,0.15)";
                  c.beginPath();
                  c.moveTo(28 * s, -36 * s);
                  c.lineTo(0, -44 * s);
                  c.lineTo(0, -36 * s);
                  c.closePath();
                  c.fill();
                  // Reset to prop color for outlines
                  c.fillStyle = p.color;
                  // Side handles
                  c.strokeStyle = "rgba(0,0,0,0.5)";
                  c.lineWidth = 2 * s;
                  c.strokeRect(-28 * s, -36 * s, 56 * s, 36 * s);
                  // Handle bars on sides
                  c.strokeStyle = "#888";
                  c.lineWidth = 3 * s;
                  c.strokeRect(-24 * s, -28 * s, 8 * s, 10 * s);
                  c.strokeRect(16 * s, -28 * s, 8 * s, 10 * s);
                  // Graffiti stripe
                  c.fillStyle = "rgba(250,204,21,0.18)";
                  c.fillRect(-20 * s, -26 * s, 14 * s, 4 * s);
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
        const esy = horizonY + enemy.depth * (floorBottom - horizonY) - enemy.floatY;
        let sc = MIN_SCALE + enemy.depth * (MAX_SCALE - MIN_SCALE);
        let alpha = 1;
        if (enemy.dying) {
          const t = Math.min(1, (nowTs - (enemy.deathStartedAt ?? nowTs)) / 260);
          alpha = 1 - t;
          sc *= 1 - 0.3 * t;
        }
        const e2 = enemy;
        const eWalkT = nowTs / 1000;
        const eStunned = nowTs < e2.stunUntil;
        entities.push({
          depth: enemy.depth,
          draw: () => {
            ctx.save();
            ctx.globalAlpha = alpha;
            drawShadowAndSprite(ctx, esx, esy, sc, (c) => {
              drawEnemyPerson(c, sc, eWalkT, eStunned);
            });
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
        const usy = horizonY + pu.depth * (floorBottom - horizonY);
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

      const walkPhase = state.isMoving ? Math.sin(state.walkTime * 8) : 0;
      entities.push({
        depth: state.player.depth,
        draw: () => {
          drawShadowAndSprite(ctx, psx, psy, ps, (c, s) => {
            c.save();
            if (state.player.facing === -1) c.scale(-1, 1);
            drawPerson(c, s, {
              walkPhase,
              skinColor: "#fbbf24",
              shirtColor: "#1d4ed8",
              pantsColor: "#1e293b",
              hairColor: "#111827",
              comboHit: comboHitStep,
              comboProgress,
            });
            c.restore();
          });

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
        const fy = horizonY + f.depth * (floorBottom - horizonY) - 60 - t * 40;
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
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
