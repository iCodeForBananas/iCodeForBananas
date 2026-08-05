"use client";

import { useEffect, useRef } from "react";

const HORIZON_RATIO = 0.4;
const CHUNK_WIDTH = 900;
const PLAYER_SPEED = 260;
const PLAYER_DEPTH_SPEED = 0.6;
const MIN_SCALE = 0.35;
const MAX_SCALE = 1.4;
const ANCHOR_X_RATIO = 0.35;

type PropType = "barrel" | "crate" | "car";

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
          x: 12 + c * (width - 24) / Math.max(cols - 1, 1),
          y: 16 + r * (height - 32) / Math.max(rows - 1, 1),
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
    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const chunks = new Map<number, Chunk>();
    const getChunk = (index: number) => {
      let chunk = chunks.get(index);
      if (!chunk) {
        chunk = generateChunk(index);
        chunks.set(index, chunk);
      }
      return chunk;
    };

    const player = {
      worldX: width * ANCHOR_X_RATIO || 300,
      depth: 0.6,
    };

    let cameraX = 0;
    let lastTime = performance.now();
    let rafId = 0;

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      let vx = 0;
      let vd = 0;
      if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
      if (keys.has("arrowright") || keys.has("d")) vx += 1;
      if (keys.has("arrowup") || keys.has("w")) vd -= 1;
      if (keys.has("arrowdown") || keys.has("s")) vd += 1;

      player.worldX = Math.max(0, player.worldX + vx * PLAYER_SPEED * dt);
      player.depth = Math.max(0.05, Math.min(1, player.depth + vd * PLAYER_DEPTH_SPEED * dt));

      const anchorX = width * ANCHOR_X_RATIO;
      cameraX = Math.max(0, player.worldX - anchorX);

      const horizonY = height * HORIZON_RATIO;
      const floorBottom = height;

      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, "#02020a");
      skyGrad.addColorStop(1, "#0a1030");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY);

      // Buildings (parallax, behind ground)
      const parallax = 0.4;
      const firstChunk = Math.floor(((cameraX * parallax) - width) / CHUNK_WIDTH) - 1;
      const lastChunk = Math.floor(((cameraX * parallax) + width) / CHUNK_WIDTH) + 1;
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

      // Ground entities: props + player, depth sorted (painter's algorithm)
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

      const playerScreenX = player.worldX - cameraX;
      const playerScreenY = horizonY + player.depth * (floorBottom - horizonY);
      const playerScale = MIN_SCALE + player.depth * (MAX_SCALE - MIN_SCALE);
      entities.push({
        screenX: playerScreenX,
        depth: player.depth,
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
