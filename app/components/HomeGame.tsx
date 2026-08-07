"use client";

import { useEffect, useRef } from "react";

const HORIZON_RATIO = 0.4;
const CHUNK_WIDTH = 900;
const PLAYER_SPEED = 260;
const PLAYER_DEPTH_SPEED = 0.6;
const MIN_SCALE = 0.35;
const MAX_SCALE = 1.4;
const ANCHOR_X_RATIO = 0.35;
const DEPTH_TO_WORLD = 200;
const ENEMY_SPEED = 55;
const ENEMY_DEPTH_SPEED = 0.18;
const MAX_ENEMIES = 5;
const ENEMY_XP = 25;
const XP_THRESHOLDS = [100, 250, 500];
const COMBO_WINDOW_MS = 600;
const MIN_PLAYER_DEPTH = 0.15; // top of walkable street (below curb)
const MAX_PLAYER_DEPTH = 0.95; // bottom of walkable street

type PropType = "trashcan" | "dumpster" | "car";

interface GroundProp {
  x: number;
  depth: number;
  type: PropType;
  color: string;
  size: number;
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
    props.push({
      x: rand() * CHUNK_WIDTH,
      depth: 0.15 + rand() * 0.8,
      type,
      color: propColors[type][Math.floor(rand() * propColors[type].length)],
      size: 0.8 + rand() * 0.5,
    });
  }
  return { buildings, props };
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

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const keys = new Set<string>();
    const chunks = new Map<number, Chunk>();
    const getChunk = (i: number) => {
      if (!chunks.has(i)) chunks.set(i, generateChunk(i));
      return chunks.get(i)!;
    };

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
    };

    // Combo state (attack 1: jab → hook → kick)
    const combo = {
      step: 0 as 0 | 1 | 2,
      lastHitAt: 0,
      visual: null as { step: 0 | 1 | 2; startedAt: number; duration: number } | null,
    };

    // Parrot state (attack 2)
    const parrot = {
      phase: "idle" as "idle" | "flying-out" | "grabbing" | "returning" | "cooldown",
      phaseStartedAt: 0,
      targetId: null as number | null,
      fromX: 0,
      fromY: 0,
      pScreenX: 0,
      pScreenY: 0,
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
        enemy.dying = true;
        enemy.deathStartedAt = performance.now();
        gainXp(ENEMY_XP);
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

      let vx = 0, vd = 0;
      if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
      if (keys.has("arrowright") || keys.has("d")) vx += 1;
      if (keys.has("arrowup") || keys.has("w")) vd -= 1;
      if (keys.has("arrowdown") || keys.has("s")) vd += 1;

      state.isMoving = vx !== 0 || vd !== 0;
      if (state.isMoving) state.walkTime += dt;
      state.player.worldX = Math.max(0, state.player.worldX + vx * PLAYER_SPEED * dt);
      state.player.depth = Math.max(MIN_PLAYER_DEPTH, Math.min(MAX_PLAYER_DEPTH, state.player.depth + vd * PLAYER_DEPTH_SPEED * dt));
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
        if (enemy.dying) continue;
        if (enemy.floatY > 0) enemy.floatY = Math.max(0, enemy.floatY - 80 * dt);
        if (nowTs < enemy.stunUntil) continue;
        const dxp = state.player.worldX - enemy.worldX;
        const ddp = state.player.depth - enemy.depth;
        if (Math.abs(dxp) > 25) enemy.worldX += Math.sign(dxp) * ENEMY_SPEED * dt;
        if (Math.abs(ddp) > 0.02) enemy.depth += Math.sign(ddp) * ENEMY_DEPTH_SPEED * dt;
        enemy.depth = Math.max(MIN_PLAYER_DEPTH, Math.min(MAX_PLAYER_DEPTH, enemy.depth));
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
        });
        state.nextSpawnAt = nowTs + 1400 + Math.random() * 900;
      }

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
            parrot.phase = "grabbing";
            parrot.phaseStartedAt = nowTs;
          }
        }
      } else if (parrot.phase === "grabbing") {
        const tgt = state.enemies.find((e) => e.id === parrot.targetId);
        if (tgt && !tgt.dying) {
          tgt.floatY = 30;
          parrot.pScreenX = tgt.worldX - cameraX;
          parrot.pScreenY = horizonY + tgt.depth * (floorBottom - horizonY) - 32 - 12 * ps;
        }
        if (nowTs - parrot.phaseStartedAt > 420) {
          if (tgt && !tgt.dying) {
            damageEnemy(tgt, 40);
            tgt.floatY = 0;
            if (!tgt.dying) tgt.stunUntil = nowTs + 1000;
          }
          parrot.fromX = parrot.pScreenX;
          parrot.fromY = parrot.pScreenY;
          parrot.phase = "returning";
          parrot.phaseStartedAt = nowTs;
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

      // Ground
      const groundGrad = ctx.createLinearGradient(0, horizonY, 0, floorBottom);
      groundGrad.addColorStop(0, "#1c1c22");
      groundGrad.addColorStop(1, "#08080a");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizonY, width, floorBottom - horizonY);

      // Sidewalk / curb — marks the top boundary of the walkable street
      const curbY = horizonY + MIN_PLAYER_DEPTH * (floorBottom - horizonY);
      ctx.fillStyle = "#2a2a30";
      ctx.fillRect(0, curbY - 6, width, 8);
      ctx.strokeStyle = "rgba(250,204,21,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, curbY);
      ctx.lineTo(width, curbY);
      ctx.stroke();
      // Road center line (dashed)
      const midY = horizonY + 0.55 * (floorBottom - horizonY);
      ctx.setLineDash([28, 18]);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Perspective grid
      ctx.strokeStyle = "rgba(250,204,21,0.12)";
      ctx.lineWidth = 1;
      const vx2 = width / 2;
      for (let i = -10; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(vx2, horizonY);
        ctx.lineTo(vx2 + i * (width / 10), floorBottom);
        ctx.stroke();
      }
      for (let r = 1; r <= 14; r++) {
        const t = r / 14;
        const y = horizonY + t * t * (floorBottom - horizonY);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

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
      if (parrot.phase === "flying-out" || parrot.phase === "grabbing" || parrot.phase === "returning") {
        const flyingRight = parrot.phase === "returning" ? false : state.player.facing === -1;
        drawParrot(ctx, parrot.pScreenX, parrot.pScreenY, ps * 0.9, false, flyingRight);
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
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
