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

type PropType = "barrel" | "crate" | "car";
type AttackId = 1 | 2 | 3;

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
  dying: boolean;
  deathStartedAt: number | null;
}

interface AttackDef {
  id: AttackId;
  name: string;
  reach: number;
  depthTol: number;
  radius: number;
  duration: number;
  cooldown: number;
  unlockLevel: number;
  visualReach: number;
  visualArc: number;
  visualMaxRadius: number;
  color: string;
}

const ATTACKS: Record<AttackId, AttackDef> = {
  1: {
    id: 1,
    name: "Punch",
    reach: 70,
    depthTol: 0.22,
    radius: 0,
    duration: 0.16,
    cooldown: 0.32,
    unlockLevel: 1,
    visualReach: 42,
    visualArc: 0.9,
    visualMaxRadius: 0,
    color: "rgba(250, 204, 21, 0.6)",
  },
  2: {
    id: 2,
    name: "Kick",
    reach: 105,
    depthTol: 0.3,
    radius: 0,
    duration: 0.26,
    cooldown: 0.5,
    unlockLevel: 2,
    visualReach: 62,
    visualArc: 1.35,
    visualMaxRadius: 0,
    color: "rgba(251, 146, 60, 0.55)",
  },
  3: {
    id: 3,
    name: "Special",
    reach: 0,
    depthTol: 0,
    radius: 230,
    duration: 0.5,
    cooldown: 1.2,
    unlockLevel: 3,
    visualReach: 0,
    visualArc: 0,
    visualMaxRadius: 150,
    color: "#facc15",
  },
};

function xpToNext(level: number) {
  if (level <= XP_THRESHOLDS.length) return XP_THRESHOLDS[level - 1];
  const last = XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
  return last + (level - XP_THRESHOLDS.length) * 300;
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
    const width = 120 + rand() * 180;
    const height = 140 + rand() * 260;
    const hue = 210 + Math.floor(rand() * 40);
    const lightness = 6 + Math.floor(rand() * 8);
    const color = `hsl(${hue}, 30%, ${lightness}%)`;
    const windows: Building["windows"] = [];
    const cols = 2 + Math.floor(rand() * 3);
    const rows = 3 + Math.floor(rand() * 5);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        windows.push({
          x: 12 + (c * (width - 24)) / Math.max(cols - 1, 1),
          y: 16 + (r * (height - 32)) / Math.max(rows - 1, 1),
          lit: rand() < 0.22,
        });
      }
    }
    buildings.push({ x: bx, width, height, color, windows });
    bx += width + 10 + rand() * 40;
  }

  const propCount = 2 + Math.floor(rand() * 4);
  const props: GroundProp[] = [];
  const propColors: Record<PropType, string[]> = {
    barrel: ["#7f5a2a", "#8a6432", "#6b4423"],
    crate: ["#5a4a36", "#4d4038", "#6b5a42"],
    car: ["#7a1f1f", "#1f3f7a", "#3a3a3a", "#4a4a1f"],
  };
  for (let i = 0; i < propCount; i++) {
    const roll = rand();
    const type: PropType = roll < 0.45 ? "barrel" : roll < 0.75 ? "crate" : "car";
    const colors = propColors[type];
    props.push({
      x: rand() * CHUNK_WIDTH,
      depth: 0.15 + rand() * 0.8,
      type,
      color: colors[Math.floor(rand() * colors.length)],
      size: 0.8 + rand() * 0.5,
    });
  }

  return { buildings, props };
}

function drawShadowAndSprite(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  scale: number,
  draw: (ctx: CanvasRenderingContext2D, scale: number) => void
) {
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 22 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  draw(ctx, scale);
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
    const getChunk = (index: number) => {
      let chunk = chunks.get(index);
      if (!chunk) {
        chunk = generateChunk(index);
        chunks.set(index, chunk);
      }
      return chunk;
    };

    const state = {
      player: {
        worldX: width * ANCHOR_X_RATIO || 300,
        depth: 0.6,
        facing: 1 as 1 | -1,
        level: 1,
        xp: 0,
      },
      selectedAttack: 1 as AttackId,
      attackReadyAt: { 1: 0, 2: 0, 3: 0 } as Record<AttackId, number>,
      activeAttack: null as { type: AttackId; startedAt: number; duration: number } | null,
      shakeUntil: 0,
      enemies: [] as Enemy[],
      nextEnemyId: 0,
      nextSpawnAt: 0,
    };

    const gainXp = (amount: number) => {
      state.player.xp += amount;
      let threshold = xpToNext(state.player.level);
      while (state.player.xp >= threshold) {
        state.player.xp -= threshold;
        state.player.level += 1;
        threshold = xpToNext(state.player.level);
      }
    };

    const triggerAttack = (type: AttackId) => {
      if (state.player.level < ATTACKS[type].unlockLevel) return;
      const now = performance.now();
      if (now < (state.attackReadyAt[type] ?? 0)) return;
      const atk = ATTACKS[type];
      state.attackReadyAt[type] = now + atk.cooldown * 1000;
      state.activeAttack = { type, startedAt: now, duration: atk.duration };
      if (type === 3) state.shakeUntil = now + 300;

      let kills = 0;
      for (const enemy of state.enemies) {
        if (enemy.dying) continue;
        const rawDx = enemy.worldX - state.player.worldX;
        const depthDiff = Math.abs(enemy.depth - state.player.depth) * DEPTH_TO_WORLD;
        let hit = false;
        if (atk.radius > 0) {
          const dist = Math.sqrt(rawDx * rawDx + depthDiff * depthDiff);
          hit = dist <= atk.radius;
        } else {
          const facingDx = rawDx * state.player.facing;
          hit = facingDx >= -15 && facingDx <= atk.reach && depthDiff <= atk.depthTol * DEPTH_TO_WORLD;
        }
        if (hit) {
          enemy.dying = true;
          enemy.deathStartedAt = now;
          kills++;
        }
      }
      if (kills > 0) gainXp(kills * ENEMY_XP);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "1", "2", "3"].includes(key) || key === " ") {
        e.preventDefault();
      }
      keys.add(key);
      if (key === "1" || key === "2" || key === "3") {
        const id = Number(key) as AttackId;
        if (state.player.level >= ATTACKS[id].unlockLevel) {
          state.selectedAttack = id;
        }
      }
      if (key === " ") {
        triggerAttack(state.selectedAttack);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let cameraX = 0;
    let lastTime = performance.now();
    let rafId = 0;

    const drawHud = () => {
      const level = state.player.level;
      const xp = state.player.xp;
      const threshold = xpToNext(level);
      const boxSize = 38;
      const gap = 8;
      const slotsWidth = boxSize * 3 + gap * 2;
      const panelX = 16;
      const panelWidth = slotsWidth + 16;
      const panelBottom = height - 16;
      const slotsY = panelBottom - boxSize;
      const labelY = slotsY - 6;
      const barHeight = 12;
      const barY = labelY - 10 - barHeight;
      const barWidth = slotsWidth;
      const levelTextY = barY - 8;
      const panelTop = levelTextY - 22;

      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(panelX - 8, panelTop, panelWidth, panelBottom - panelTop + 8);
      ctx.strokeStyle = "rgba(250,204,21,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(panelX - 8, panelTop, panelWidth, panelBottom - panelTop + 8);

      ctx.fillStyle = "#facc15";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillText(`LV ${level}`, panelX, levelTextY);

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(panelX, barY, barWidth, barHeight);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(panelX, barY, barWidth * Math.min(1, xp / threshold), barHeight);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeRect(panelX, barY, barWidth, barHeight);
      ctx.fillStyle = "#000";
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${xp}/${threshold}`, panelX + barWidth - 4, barY + barHeight - 3);

      for (let i = 1; i <= 3; i++) {
        const id = i as AttackId;
        const atk = ATTACKS[id];
        const unlocked = level >= atk.unlockLevel;
        const selected = state.selectedAttack === id;
        const x = panelX + (i - 1) * (boxSize + gap);
        ctx.fillStyle = unlocked ? (selected ? "#facc15" : "rgba(250,204,21,0.15)") : "rgba(255,255,255,0.06)";
        ctx.fillRect(x, slotsY, boxSize, boxSize);
        ctx.strokeStyle = selected ? "#ffffff" : unlocked ? "rgba(250,204,21,0.7)" : "rgba(255,255,255,0.2)";
        ctx.lineWidth = selected ? 2.5 : 1;
        ctx.strokeRect(x, slotsY, boxSize, boxSize);
        ctx.fillStyle = unlocked ? (selected ? "#111" : "#facc15") : "rgba(255,255,255,0.3)";
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(i), x + boxSize / 2, slotsY + boxSize / 2 + 6);
        ctx.font = "8px system-ui, sans-serif";
        ctx.fillStyle = unlocked ? "rgba(250,204,21,0.85)" : "rgba(255,255,255,0.25)";
        ctx.fillText(unlocked ? atk.name : "???", x + boxSize / 2, labelY);
      }
      ctx.restore();
    };

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      const nowTs = performance.now();

      let vx = 0;
      let vd = 0;
      if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
      if (keys.has("arrowright") || keys.has("d")) vx += 1;
      if (keys.has("arrowup") || keys.has("w")) vd -= 1;
      if (keys.has("arrowdown") || keys.has("s")) vd += 1;

      state.player.worldX = Math.max(0, state.player.worldX + vx * PLAYER_SPEED * dt);
      state.player.depth = Math.max(0.05, Math.min(1, state.player.depth + vd * PLAYER_DEPTH_SPEED * dt));
      if (vx !== 0) state.player.facing = vx > 0 ? 1 : -1;

      const anchorX = width * ANCHOR_X_RATIO;
      cameraX = Math.max(0, state.player.worldX - anchorX);

      const horizonY = height * HORIZON_RATIO;
      const floorBottom = height;

      // Enemy update: movement, spawning, culling
      for (const enemy of state.enemies) {
        if (enemy.dying) continue;
        const dxp = state.player.worldX - enemy.worldX;
        const ddp = state.player.depth - enemy.depth;
        if (Math.abs(dxp) > 25) enemy.worldX += Math.sign(dxp) * ENEMY_SPEED * dt;
        if (Math.abs(ddp) > 0.02) enemy.depth += Math.sign(ddp) * ENEMY_DEPTH_SPEED * dt;
        enemy.depth = Math.max(0.05, Math.min(1, enemy.depth));
      }
      state.enemies = state.enemies.filter((e) => {
        if (e.dying) return nowTs - (e.deathStartedAt ?? 0) < 260;
        if (e.worldX < cameraX - 500) return false;
        return true;
      });
      if (state.enemies.length < MAX_ENEMIES && nowTs >= state.nextSpawnAt) {
        state.enemies.push({
          id: state.nextEnemyId++,
          worldX: cameraX + width + 80 + Math.random() * 220,
          depth: 0.2 + Math.random() * 0.65,
          dying: false,
          deathStartedAt: null,
        });
        state.nextSpawnAt = nowTs + 1400 + Math.random() * 900;
      }

      let shakeX = 0;
      let shakeY = 0;
      const shakeRemaining = state.shakeUntil - nowTs;
      if (shakeRemaining > 0) {
        const intensity = (shakeRemaining / 300) * 8;
        shakeX = (Math.random() - 0.5) * intensity;
        shakeY = (Math.random() - 0.5) * intensity;
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, "#02020a");
      skyGrad.addColorStop(1, "#0a1030");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY);

      // Buildings (parallax, behind ground)
      const parallax = 0.4;
      const firstChunk = Math.floor((cameraX * parallax - width) / CHUNK_WIDTH) - 1;
      const lastChunk = Math.floor((cameraX * parallax + width) / CHUNK_WIDTH) + 1;
      for (let ci = Math.max(0, firstChunk); ci <= lastChunk; ci++) {
        const chunk = getChunk(ci);
        const chunkOffset = ci * CHUNK_WIDTH - cameraX * parallax;
        for (const b of chunk.buildings) {
          const bx = chunkOffset + b.x;
          if (bx + b.width < 0 || bx > width) continue;
          const by = horizonY - b.height;
          ctx.fillStyle = b.color;
          ctx.fillRect(bx, by, b.width, b.height);
          for (const win of b.windows) {
            ctx.fillStyle = win.lit ? "#facc15" : "rgba(255,255,255,0.05)";
            ctx.fillRect(bx + win.x, by + win.y, 6, 8);
          }
        }
      }

      // Ground
      const groundGrad = ctx.createLinearGradient(0, horizonY, 0, floorBottom);
      groundGrad.addColorStop(0, "#1c1c22");
      groundGrad.addColorStop(1, "#08080a");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizonY, width, floorBottom - horizonY);

      // Perspective grid
      ctx.strokeStyle = "rgba(250, 204, 21, 0.12)";
      ctx.lineWidth = 1;
      const vanishX = width / 2;
      const laneCount = 10;
      for (let i = -laneCount; i <= laneCount; i++) {
        const bottomX = vanishX + i * (width / laneCount);
        ctx.beginPath();
        ctx.moveTo(vanishX, horizonY);
        ctx.lineTo(bottomX, floorBottom);
        ctx.stroke();
      }
      const rowCount = 14;
      for (let r = 1; r <= rowCount; r++) {
        const t = r / rowCount;
        const y = horizonY + t * t * (floorBottom - horizonY);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Ground entities: props + enemies + player, depth sorted (painter's algorithm)
      type Entity = { screenX: number; depth: number; draw: () => void };
      const entities: Entity[] = [];

      const groundFirstChunk = Math.floor((cameraX - width) / CHUNK_WIDTH) - 1;
      const groundLastChunk = Math.floor((cameraX + width) / CHUNK_WIDTH) + 1;
      for (let ci = Math.max(0, groundFirstChunk); ci <= groundLastChunk; ci++) {
        const chunk = getChunk(ci);
        for (const prop of chunk.props) {
          const worldX = ci * CHUNK_WIDTH + prop.x;
          const screenX = worldX - cameraX;
          if (screenX < -100 || screenX > width + 100) continue;
          const screenY = horizonY + prop.depth * (floorBottom - horizonY);
          const scale = (MIN_SCALE + prop.depth * (MAX_SCALE - MIN_SCALE)) * prop.size;
          entities.push({
            screenX,
            depth: prop.depth,
            draw: () =>
              drawShadowAndSprite(ctx, screenX, screenY, scale, (c, s) => {
                c.fillStyle = prop.color;
                if (prop.type === "barrel") {
                  c.beginPath();
                  c.ellipse(0, -18 * s, 14 * s, 20 * s, 0, 0, Math.PI * 2);
                  c.fill();
                } else if (prop.type === "crate") {
                  c.fillRect(-16 * s, -32 * s, 32 * s, 32 * s);
                  c.strokeStyle = "rgba(0,0,0,0.4)";
                  c.strokeRect(-16 * s, -32 * s, 32 * s, 32 * s);
                } else {
                  c.fillRect(-36 * s, -26 * s, 72 * s, 26 * s);
                  c.fillStyle = "rgba(180, 220, 255, 0.5)";
                  c.fillRect(-24 * s, -24 * s, 48 * s, 10 * s);
                }
              }),
          });
        }
      }

      for (const enemy of state.enemies) {
        const screenX = enemy.worldX - cameraX;
        if (screenX < -100 || screenX > width + 100) continue;
        const screenY = horizonY + enemy.depth * (floorBottom - horizonY);
        let scale = MIN_SCALE + enemy.depth * (MAX_SCALE - MIN_SCALE);
        let alpha = 1;
        if (enemy.dying) {
          const t = Math.min(1, (nowTs - (enemy.deathStartedAt ?? nowTs)) / 260);
          alpha = 1 - t;
          scale *= 1 - 0.3 * t;
        }
        entities.push({
          screenX,
          depth: enemy.depth,
          draw: () => {
            ctx.save();
            ctx.globalAlpha = alpha;
            drawShadowAndSprite(ctx, screenX, screenY, scale, (c, s) => {
              c.fillStyle = "#7a1f1f";
              c.fillRect(-13 * s, -46 * s, 26 * s, 46 * s);
              c.fillStyle = "#2a0a0a";
              c.fillRect(-9 * s, -46 * s, 18 * s, 10 * s);
            });
            ctx.restore();
          },
        });
      }

      const playerScreenX = state.player.worldX - cameraX;
      const playerScreenY = horizonY + state.player.depth * (floorBottom - horizonY);
      const playerScale = MIN_SCALE + state.player.depth * (MAX_SCALE - MIN_SCALE);
      entities.push({
        screenX: playerScreenX,
        depth: state.player.depth,
        draw: () =>
          drawShadowAndSprite(ctx, playerScreenX, playerScreenY, playerScale, (c, s) => {
            c.fillStyle = "#facc15";
            c.fillRect(-14 * s, -50 * s, 28 * s, 50 * s);
            c.fillStyle = "#111";
            c.fillRect(-10 * s, -50 * s, 20 * s, 12 * s);
          }),
      });

      entities.sort((a, b) => a.depth - b.depth);
      for (const entity of entities) entity.draw();

      // Attack visual effect (drawn on top, tied to player position)
      if (state.activeAttack) {
        const progress = (nowTs - state.activeAttack.startedAt) / (state.activeAttack.duration * 1000);
        if (progress >= 1) {
          state.activeAttack = null;
        } else {
          const atk = ATTACKS[state.activeAttack.type];
          const alpha = 1 - progress;
          const px = playerScreenX;
          const py = playerScreenY - 25 * playerScale;
          ctx.save();
          if (atk.radius > 0) {
            ctx.globalAlpha = alpha * 0.85;
            ctx.strokeStyle = atk.color;
            ctx.lineWidth = 6 * playerScale;
            ctx.beginPath();
            ctx.arc(px, py, atk.visualMaxRadius * playerScale * progress, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = atk.color;
            const centerAngle = state.player.facing === 1 ? 0 : Math.PI;
            const halfArc = atk.visualArc / 2;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.arc(px, py, atk.visualReach * playerScale, centerAngle - halfArc, centerAngle + halfArc);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
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
    <div ref={containerRef} className='w-full h-full'>
      <canvas ref={canvasRef} className='block w-full h-full' />
    </div>
  );
}
