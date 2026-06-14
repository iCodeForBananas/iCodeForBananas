import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";

// ── Server ───────────────────────────────────────────────────────────────────
const PORT    = parseInt(process.env.GAME_WS_PORT ?? "8080");
const TICK_MS = 50; // 20 fps server tick

// ── Persistence (Supabase) ──────────────────────────────────────────────────
const GAME_STATE_ROW_ID = "main";
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
if (!supabase) {
  console.warn("[state] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — game state will not persist");
}

// ── Player movement ──────────────────────────────────────────────────────────
const WALK_SPEED       = 0.2900625;
const SPRINT_SPEED     = 0.490875;
const STAMINA_DRAIN    = 0.008;
const STAMINA_REGEN    = 0.004;
const BOUNDS           = 95;
const COLLISION_RADIUS = 0.25;

// ── Player health ────────────────────────────────────────────────────────────
const PLAYER_HEALTH_REGEN_DELAY_MS = 5000; // ms after last hit before regen starts
const PLAYER_HEALTH_REGEN_RATE     = 0.1;  // hp per tick

// ── Economy ──────────────────────────────────────────────────────────────────
const PLAYER_START_MONEY    = 10000;
const ZOMBIE_KILL_MONEY_MIN = 10;
const ZOMBIE_KILL_MONEY_MAX = 300;
const DRUG_LAB_PRICE        = 1000;
const DRUG_LAB_INCOME       = 200;
const DRUG_LAB_INCOME_TICKS = 600; // 30 s

// ── Weapons ──────────────────────────────────────────────────────────────────
const WEAPON_RANGE   = 50;
const PISTOL_DAMAGE  = 65;
const PISTOL_PRICE   = 250;
const MINIGUN_DAMAGE = 12;
const MINIGUN_PRICE  = 500;
const UZI_DAMAGE     = 18;
const UZI_AMMO       = 30;
const UZI_PRICE           = 400;
const WAREHOUSE_GATE_PRICE = 500;

// ── Timers (1 tick = TICK_MS ms) ─────────────────────────────────────────────
const ZOMBIE_DEAD_TICKS = 1200; // 60 s
const RESPAWN_TICKS     = 600;  // 30 s
const ATTACK_COOLDOWN   = 30;   // 1.5 s
const UZI_RELOAD_TICKS  = 50;   // 2.5 s
const UZI_COOLDOWN      = 1;
const MG_COOLDOWN       = 1;

// ── Zombie AI ────────────────────────────────────────────────────────────────
const ZOMBIE_COUNT         = 8;
const ZOMBIE_HEALTH        = 50;
const ZOMBIE_ATTACK_DAMAGE = 7;
const ZOMBIE_ATTACK_RANGE  = 2.0;
const ZOMBIE_CHASE_RANGE   = 20;
const ZOMBIE_CHASE_SPEED   = 0.045;
const ZOMBIE_WANDER_SPEED  = 0.015;

// ── World geometry ───────────────────────────────────────────────────────────
const SUB_CX = -15, SUB_HW = 5.0, SUB_FY = -7;

// ── Collision ────────────────────────────────────────────────────────────────
type Box = { minX: number; minZ: number; maxX: number; maxZ: number };

function mkRng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildShackWalls(): Box[] {
  const rng = mkRng(42);
  const boxes: Box[] = [];
  const positions: [number, number][] = [
    [30,-18],[33,-12],[27,-8],[35,-5],[29,0],[38,3],[32,9],[26,14],[36,18],[30,24],
    [41,-15],[42,8],[24,-3],[38,-10],[25,20],[44,-2],[28,-22],[34,25],[40,15],[45,-20],
    [22,10],[46,5],[31,-28],[43,22],
  ];
  for (const [sx, sz] of positions) {
    const bx = sx + (rng()-0.5)*2.5;
    const bz = sz + (rng()-0.5)*2.5;
    const rot = (rng()-0.5)*0.7;
    const w = 3 + rng() * 2.5;
    rng(); // h (visual only)
    const d = 3 + rng() * 2.5;
    const wt = 0.18;
    const dw = Math.min(0.95, w * 0.32);
    const fLW = (w - dw) / 2;
    rng(); // wallM (visual)
    rng(); // roofM (visual)
    rng(); // roof rotation (visual)
    const hasLean = rng() > 0.55;
    if (hasLean) rng(); // lean width (visual)

    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const absC = Math.abs(cosR), absS = Math.abs(sinR);
    const addWB = (lx: number, lz: number, hw: number, hd: number) => {
      const wx = bx + lx * cosR - lz * sinR;
      const wz = bz + lx * sinR + lz * cosR;
      boxes.push({
        minX: wx - hw * absC - hd * absS, minZ: wz - hw * absS - hd * absC,
        maxX: wx + hw * absC + hd * absS, maxZ: wz + hw * absS + hd * absC,
      });
    };
    addWB(0,              d / 2,   w / 2,   wt / 2); // back
    addWB(-w / 2,         0,       wt / 2,  d / 2);  // left
    addWB( w / 2,         0,       wt / 2,  d / 2);  // right
    addWB(-(dw/2+fLW/2), -d / 2,  fLW / 2, wt / 2); // front-left
    addWB( dw/2+fLW/2,  -d / 2,  fLW / 2, wt / 2);  // front-right
    // door gap is always passable server-side (no door box added)
  }
  return boxes;
}

function resolveCollision(x: number, z: number, boxes: Box[]) {
  const R = COLLISION_RADIUS;
  for (const b of boxes) {
    const cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2;
    const dx = x - cx,
      dz = z - cz;
    const hwX = (b.maxX - b.minX) / 2 + R,
      hwZ = (b.maxZ - b.minZ) / 2 + R;
    if (Math.abs(dx) < hwX && Math.abs(dz) < hwZ) {
      const ovX = hwX - Math.abs(dx),
        ovZ = hwZ - Math.abs(dz);
      if (ovX < ovZ) x += Math.sign(dx) * ovX;
      else z += Math.sign(dz) * ovZ;
    }
  }
  return { x, z };
}

// Static world collision boxes (mirror client geometry)
const STATIC_WALLS: Box[] = [
  // Main building exterior
  { minX: 35.85, minZ: -5.15, maxX: 36.15, maxZ: 5.15 },
  { minX: 23.85, minZ: -5.15, maxX: 36.15, maxZ: -4.85 },
  { minX: 23.85, minZ: 4.85, maxX: 36.15, maxZ: 5.15 },
  { minX: 23.85, minZ: -5.0, maxX: 24.15, maxZ: -0.7 },
  { minX: 23.85, minZ: 0.7, maxX: 24.15, maxZ: 5.0 },
  // Interior dividers
  { minX: 29.9, minZ: -5.0, maxX: 30.1, maxZ: -0.7 },
  { minX: 29.9, minZ: 0.7, maxX: 30.1, maxZ: 5.0 },
  // Arena perimeter removed
  // Shantytown shacks (deterministic layout, mirrors client geometry)
  ...buildShackWalls(),
  // Market District stores (west side, front at X=-29, stores face east)
  // Store 1: Grocery (sx1=-29,sx2=-43,sz1=-50,sz2=-34, door dz=-42 dw=1.5)
  { minX: -43.18, minZ: -50.18, maxX: -43,    maxZ: -33.82 },
  { minX: -43.18, minZ: -50.18, maxX: -28.82, maxZ: -50    },
  { minX: -43.18, minZ: -34,    maxX: -28.82, maxZ: -33.82 },
  { minX: -29,    minZ: -50,    maxX: -28.82, maxZ: -42.75 },
  { minX: -29,    minZ: -41.25, maxX: -28.82, maxZ: -34    },
  // Store 2: Boutique (sx1=-29,sx2=-37,sz1=-32,sz2=-25, door dz=-28.5 dw=1.0)
  { minX: -37.18, minZ: -32.18, maxX: -37,    maxZ: -24.82 },
  { minX: -37.18, minZ: -32.18, maxX: -28.82, maxZ: -32    },
  { minX: -37.18, minZ: -25,    maxX: -28.82, maxZ: -24.82 },
  { minX: -29,    minZ: -32,    maxX: -28.82, maxZ: -29    },
  { minX: -29,    minZ: -28,    maxX: -28.82, maxZ: -25    },
  // Store 3: Electronics (sx1=-29,sx2=-39,sz1=-23,sz2=-15, door dz=-19 dw=1.2)
  { minX: -39.18, minZ: -23.18, maxX: -39,    maxZ: -14.82 },
  { minX: -39.18, minZ: -23.18, maxX: -28.82, maxZ: -23    },
  { minX: -39.18, minZ: -15,    maxX: -28.82, maxZ: -14.82 },
  { minX: -29,    minZ: -23,    maxX: -28.82, maxZ: -19.6  },
  { minX: -29,    minZ: -18.4,  maxX: -28.82, maxZ: -15    },
  // Store 4: Hardware (sx1=-29,sx2=-45,sz1=-13,sz2=-1, door dz=-7 dw=1.5)
  { minX: -45.18, minZ: -13.18, maxX: -45,    maxZ: -0.82  },
  { minX: -45.18, minZ: -13.18, maxX: -28.82, maxZ: -13    },
  { minX: -45.18, minZ: -1,     maxX: -28.82, maxZ: -0.82  },
  { minX: -29,    minZ: -13,    maxX: -28.82, maxZ: -7.75  },
  { minX: -29,    minZ: -6.25,  maxX: -28.82, maxZ: -1     },
  // Store 5: Red Shop (sx1=-29,sx2=-37,sz1=1,sz2=7, door dz=4 dw=0.95)
  { minX: -37.18, minZ: 0.82,   maxX: -37,    maxZ: 7.18   },
  { minX: -37.18, minZ: 0.82,   maxX: -28.82, maxZ: 1      },
  { minX: -37.18, minZ: 7,      maxX: -28.82, maxZ: 7.18   },
  { minX: -29,    minZ: 1,      maxX: -28.82, maxZ: 3.525  },
  { minX: -29,    minZ: 4.475,  maxX: -28.82, maxZ: 7      },
  // Store 6: Cream Shop (sx1=-29,sx2=-38,sz1=9,sz2=16, door dz=12.5 dw=1.1)
  { minX: -38.18, minZ: 8.82,   maxX: -38,    maxZ: 16.18  },
  { minX: -38.18, minZ: 8.82,   maxX: -28.82, maxZ: 9      },
  { minX: -38.18, minZ: 16,     maxX: -28.82, maxZ: 16.18  },
  { minX: -29,    minZ: 9,      maxX: -28.82, maxZ: 11.95  },
  { minX: -29,    minZ: 13.05,  maxX: -28.82, maxZ: 16     },
  // Opposite row: west-facing stores (sx1=front/west, sx2=back/east, sx2>sx1)
  // Store A: Olive Warehouse (sx1=-24,sx2=-16,sz1=-50,sz2=-36, dz=-43 dw=1.3)
  { minX: -16, minZ: -50.18, maxX: -15.82, maxZ: -35.82 },
  { minX: -24.18, minZ: -50.18, maxX: -15.82, maxZ: -50 },
  { minX: -24.18, minZ: -36, maxX: -15.82, maxZ: -35.82 },
  { minX: -24.18, minZ: -50, maxX: -24, maxZ: -43.65 },
  { minX: -24.18, minZ: -42.35, maxX: -24, maxZ: -36 },
  // Store B: Orange Spice Market (sx1=-24,sx2=-19,sz1=-33,sz2=-24, dz=-28.5 dw=1.0)
  { minX: -19, minZ: -33.18, maxX: -18.82, maxZ: -23.82 },
  { minX: -24.18, minZ: -33.18, maxX: -18.82, maxZ: -33 },
  { minX: -24.18, minZ: -24, maxX: -18.82, maxZ: -23.82 },
  { minX: -24.18, minZ: -33, maxX: -24, maxZ: -29 },
  { minX: -24.18, minZ: -28, maxX: -24, maxZ: -24 },
  // Store C: Purple Curiosity Shop (sx1=-24,sx2=-19,sz1=-22,sz2=-14, dz=-18 dw=1.0)
  { minX: -19, minZ: -22.18, maxX: -18.82, maxZ: -13.82 },
  { minX: -24.18, minZ: -22.18, maxX: -18.82, maxZ: -22 },
  { minX: -24.18, minZ: -14, maxX: -18.82, maxZ: -13.82 },
  { minX: -24.18, minZ: -22, maxX: -24, maxZ: -18.5 },
  { minX: -24.18, minZ: -17.5, maxX: -24, maxZ: -14 },
  // Store D: Yellow General Store (sx1=-24,sx2=-16,sz1=-12,sz2=2, dz=-5 dw=1.4)
  { minX: -16, minZ: -12.18, maxX: -15.82, maxZ: 2.18 },
  { minX: -24.18, minZ: -12.18, maxX: -15.82, maxZ: -12 },
  { minX: -24.18, minZ: 2, maxX: -15.82, maxZ: 2.18 },
  { minX: -24.18, minZ: -12, maxX: -24, maxZ: -5.7 },
  { minX: -24.18, minZ: -4.3, maxX: -24, maxZ: 2 },
  // Store E: Teal Garden Shop (sx1=-24,sx2=-18,sz1=4,sz2=17, dz=10.5 dw=1.1)
  { minX: -18, minZ: 3.82, maxX: -17.82, maxZ: 17.18 },
  { minX: -24.18, minZ: 3.82, maxX: -17.82, maxZ: 4 },
  { minX: -24.18, minZ: 17, maxX: -17.82, maxZ: 17.18 },
  { minX: -24.18, minZ: 4, maxX: -24, maxZ: 9.95 },
  { minX: -24.18, minZ: 11.05, maxX: -24, maxZ: 17 },
  // Water tower legs (center X=52 Z=-45, legs at ±2.2)
  { minX: 53.98, minZ: -43.02, maxX: 54.42, maxZ: -42.58 },
  { minX: 49.58, minZ: -43.02, maxX: 50.02, maxZ: -42.58 },
  { minX: 53.98, minZ: -47.42, maxX: 54.42, maxZ: -47.02 },
  { minX: 49.58, minZ: -47.42, maxX: 50.02, maxZ: -47.02 },
  // Industrial District warehouses (8 total, 2 rows × 4 columns going west)
  // WH_A (X=-8→9, Z=-77→-92) — door gap X=0.25→3.75, ladder on east wall
  { minX: -8.25, minZ: -92.25, maxX:  9.25, maxZ: -92.00 }, // north wall
  { minX: -8.25, minZ: -92.00, maxX: -8.00, maxZ: -77.00 }, // west wall
  { minX:  9.00, minZ: -92.00, maxX:  9.25, maxZ: -77.00 }, // east wall
  { minX: -8.25, minZ: -77.25, maxX:  0.25, maxZ: -77.00 }, // south wall left of door
  { minX:  3.75, minZ: -77.25, maxX:  9.25, maxZ: -77.00 }, // south wall right of door
  // WH_B (X=13→22, Z=-77→-92) — door gap X=16.25→18.75, ladder on east wall
  { minX: 12.75, minZ: -92.25, maxX: 22.25, maxZ: -92.00 }, // north wall
  { minX: 12.75, minZ: -92.00, maxX: 13.00, maxZ: -77.00 }, // west wall
  { minX: 22.00, minZ: -92.00, maxX: 22.25, maxZ: -77.00 }, // east wall
  { minX: 12.75, minZ: -77.25, maxX: 16.25, maxZ: -77.00 }, // south wall left of door
  { minX: 18.75, minZ: -77.25, maxX: 22.25, maxZ: -77.00 }, // south wall right of door
  // WH_C (X=-8→6, Z=-60→-73) — door gap X=-0.60→1.60, ladder on east wall
  { minX: -8.25, minZ: -73.25, maxX:  6.25, maxZ: -73.00 }, // north wall
  { minX: -8.25, minZ: -73.00, maxX: -8.00, maxZ: -60.00 }, // west wall
  { minX:  6.00, minZ: -73.00, maxX:  6.25, maxZ: -60.00 }, // east wall
  { minX: -8.25, minZ: -60.25, maxX: -0.60, maxZ: -60.00 }, // south wall left of door
  { minX:  1.60, minZ: -60.25, maxX:  6.25, maxZ: -60.00 }, // south wall right of door
  // WH_D (X=13→22, Z=-60→-73) — door gap X=16.25→18.75, ladder on east wall
  { minX: 12.75, minZ: -73.25, maxX: 22.25, maxZ: -73.00 }, // north wall
  { minX: 12.75, minZ: -73.00, maxX: 13.00, maxZ: -60.00 }, // west wall
  { minX: 22.00, minZ: -73.00, maxX: 22.25, maxZ: -60.00 }, // east wall
  { minX: 12.75, minZ: -60.25, maxX: 16.25, maxZ: -60.00 }, // south wall left of door
  { minX: 18.75, minZ: -60.25, maxX: 22.25, maxZ: -60.00 }, // south wall right of door
  // WH_E (X=-26→-12, Z=-77→-92) — door gap X=-21.0→-18.0, ladder on east wall
  { minX: -26.25, minZ: -92.25, maxX: -11.75, maxZ: -92.00 }, // north wall
  { minX: -26.25, minZ: -92.00, maxX: -26.00, maxZ: -77.00 }, // west wall
  { minX: -12.00, minZ: -92.00, maxX: -11.75, maxZ: -77.00 }, // east wall
  { minX: -26.25, minZ: -77.25, maxX: -21.00, maxZ: -77.00 }, // south wall left of door
  { minX: -18.00, minZ: -77.25, maxX: -11.75, maxZ: -77.00 }, // south wall right of door
  // WH_F (X=-26→-12, Z=-60→-73) — door gap X=-20.4→-17.6, ladder on east wall
  { minX: -26.25, minZ: -73.25, maxX: -11.75, maxZ: -73.00 }, // north wall
  { minX: -26.25, minZ: -73.00, maxX: -26.00, maxZ: -60.00 }, // west wall
  { minX: -12.00, minZ: -73.00, maxX: -11.75, maxZ: -60.00 }, // east wall
  { minX: -26.25, minZ: -60.25, maxX: -20.40, maxZ: -60.00 }, // south wall left of door
  { minX: -17.60, minZ: -60.25, maxX: -11.75, maxZ: -60.00 }, // south wall right of door
  // WH_G (X=-44→-30, Z=-77→-92) — door gap X=-38.75→-35.25, ladder on east wall
  { minX: -44.25, minZ: -92.25, maxX: -29.75, maxZ: -92.00 }, // north wall
  { minX: -44.25, minZ: -92.00, maxX: -44.00, maxZ: -77.00 }, // west wall
  { minX: -30.00, minZ: -92.00, maxX: -29.75, maxZ: -77.00 }, // east wall
  { minX: -44.25, minZ: -77.25, maxX: -38.75, maxZ: -77.00 }, // south wall left of door
  { minX: -35.25, minZ: -77.25, maxX: -29.75, maxZ: -77.00 }, // south wall right of door
  // WH_H (X=-44→-30, Z=-60→-73) — door gap X=-38.5→-35.5, ladder on east wall
  { minX: -44.25, minZ: -73.25, maxX: -29.75, maxZ: -73.00 }, // north wall
  { minX: -44.25, minZ: -73.00, maxX: -44.00, maxZ: -60.00 }, // west wall
  { minX: -30.00, minZ: -73.00, maxX: -29.75, maxZ: -60.00 }, // east wall
  { minX: -44.25, minZ: -60.25, maxX: -38.50, maxZ: -60.00 }, // south wall left of door
  { minX: -35.50, minZ: -60.25, maxX: -29.75, maxZ: -60.00 }, // south wall right of door
  // Sanctum compound perimeter (X=47→73, Z=-57→-83; gates leave gaps)
  // South wall (Z=-57): front gate gap X=58.5→61.5
  { minX: 47.00, minZ: -57.25, maxX: 58.50, maxZ: -56.75 },
  { minX: 61.50, minZ: -57.25, maxX: 73.00, maxZ: -56.75 },
  // North wall (Z=-83): crawl hole gap X=59→61
  { minX: 47.00, minZ: -83.25, maxX: 59.00, maxZ: -82.75 },
  { minX: 61.00, minZ: -83.25, maxX: 73.00, maxZ: -82.75 },
  // West wall (X=47): side gate gap Z=-68.5→-71.5
  { minX: 46.75, minZ: -68.50, maxX: 47.25, maxZ: -57.00 },
  { minX: 46.75, minZ: -83.00, maxX: 47.25, maxZ: -71.50 },
  // East wall (X=73): mirror side gate
  { minX: 72.75, minZ: -68.50, maxX: 73.25, maxZ: -57.00 },
  { minX: 72.75, minZ: -83.00, maxX: 73.25, maxZ: -71.50 },
  // Sanctum main building (X=54→66, Z=-63→-77; front door gap X=59→61)
  { minX: 54.00, minZ: -63.10, maxX: 59.00, maxZ: -62.90 }, // south wall left of doors
  { minX: 61.00, minZ: -63.10, maxX: 66.00, maxZ: -62.90 }, // south wall right of doors
  { minX: 54.00, minZ: -77.10, maxX: 66.00, maxZ: -76.90 }, // north wall
  { minX: 53.90, minZ: -77.00, maxX: 54.10, maxZ: -63.00 }, // west wall
  { minX: 65.90, minZ: -77.00, maxX: 66.10, maxZ: -63.00 }, // east wall
  // Lobby divider (Z=-66.5), door gap X=59→61
  { minX: 54.00, minZ: -66.60, maxX: 59.00, maxZ: -66.40 },
  { minX: 61.00, minZ: -66.60, maxX: 66.00, maxZ: -66.40 },
  // Clone room divider (Z=-73), door gap X=59→61
  { minX: 54.00, minZ: -73.10, maxX: 59.00, maxZ: -72.90 },
  { minX: 61.00, minZ: -73.10, maxX: 66.00, maxZ: -72.90 },
  // Armory/jail N-S divider (X=60)
  { minX: 59.90, minZ: -73.00, maxX: 60.10, maxZ: -66.50 },
  // ── East Side Urban District ─────────────────────────────────────────
  // NE1A (65-76, 32-43, door N at X=70.5 dw=2.0)
  { minX: 65.00, minZ: 31.78, maxX: 69.50, maxZ: 32.22 },
  { minX: 71.50, minZ: 31.78, maxX: 76.00, maxZ: 32.22 },
  { minX: 65.00, minZ: 42.78, maxX: 76.00, maxZ: 43.22 },
  { minX: 64.78, minZ: 32.00, maxX: 65.22, maxZ: 43.00 },
  { minX: 75.78, minZ: 32.00, maxX: 76.22, maxZ: 43.00 },
  // NE1B (65-76, 45-53, door S at X=70.5 dw=1.8)
  { minX: 65.00, minZ: 44.78, maxX: 76.00, maxZ: 45.22 },
  { minX: 65.00, minZ: 52.78, maxX: 69.60, maxZ: 53.22 },
  { minX: 71.40, minZ: 52.78, maxX: 76.00, maxZ: 53.22 },
  { minX: 64.78, minZ: 45.00, maxX: 65.22, maxZ: 53.00 },
  { minX: 75.78, minZ: 45.00, maxX: 76.22, maxZ: 53.00 },
  // NE2A (80-90, 32-41, door N at X=85 dw=2.5)
  { minX: 80.00, minZ: 31.78, maxX: 83.75, maxZ: 32.22 },
  { minX: 86.25, minZ: 31.78, maxX: 90.00, maxZ: 32.22 },
  { minX: 80.00, minZ: 40.78, maxX: 90.00, maxZ: 41.22 },
  { minX: 79.78, minZ: 32.00, maxX: 80.22, maxZ: 41.00 },
  { minX: 89.78, minZ: 32.00, maxX: 90.22, maxZ: 41.00 },
  // NE2B (80-90, 43-53, door N at X=85 dw=1.8)
  { minX: 80.00, minZ: 42.78, maxX: 84.10, maxZ: 43.22 },
  { minX: 85.90, minZ: 42.78, maxX: 90.00, maxZ: 43.22 },
  { minX: 80.00, minZ: 52.78, maxX: 90.00, maxZ: 53.22 },
  { minX: 79.78, minZ: 43.00, maxX: 80.22, maxZ: 53.00 },
  { minX: 89.78, minZ: 43.00, maxX: 90.22, maxZ: 53.00 },
  // E1 Grocery (65-76, 57-68, door N at X=70.5 dw=2.5)
  { minX: 65.00, minZ: 56.78, maxX: 69.25, maxZ: 57.22 },
  { minX: 71.75, minZ: 56.78, maxX: 76.00, maxZ: 57.22 },
  { minX: 65.00, minZ: 67.78, maxX: 76.00, maxZ: 68.22 },
  { minX: 64.78, minZ: 57.00, maxX: 65.22, maxZ: 68.00 },
  { minX: 75.78, minZ: 57.00, maxX: 76.22, maxZ: 68.00 },
  // E2 Narrow (65-76, 70-72, door S at X=70.5 dw=1.6)
  { minX: 65.00, minZ: 69.78, maxX: 76.00, maxZ: 70.22 },
  { minX: 65.00, minZ: 71.78, maxX: 69.70, maxZ: 72.22 },
  { minX: 71.30, minZ: 71.78, maxX: 76.00, maxZ: 72.22 },
  { minX: 64.78, minZ: 70.00, maxX: 65.22, maxZ: 72.00 },
  { minX: 75.78, minZ: 70.00, maxX: 76.22, maxZ: 72.00 },
  // E3 Tower (80-90, 57-71, door W at Z=64 dw=2.0)
  { minX: 80.00, minZ: 56.78, maxX: 90.00, maxZ: 57.22 },
  { minX: 80.00, minZ: 70.78, maxX: 90.00, maxZ: 71.22 },
  { minX: 79.78, minZ: 57.00, maxX: 80.22, maxZ: 63.00 },
  { minX: 79.78, minZ: 65.00, maxX: 80.22, maxZ: 71.00 },
  { minX: 89.78, minZ: 57.00, maxX: 90.22, maxZ: 71.00 },
  // SE1 (65-76, 75-86, door N at X=70.5 dw=2.0)
  { minX: 65.00, minZ: 74.78, maxX: 69.50, maxZ: 75.22 },
  { minX: 71.50, minZ: 74.78, maxX: 76.00, maxZ: 75.22 },
  { minX: 65.00, minZ: 85.78, maxX: 76.00, maxZ: 86.22 },
  { minX: 64.78, minZ: 75.00, maxX: 65.22, maxZ: 86.00 },
  { minX: 75.78, minZ: 75.00, maxX: 76.22, maxZ: 86.00 },
  // SE2 (80-90, 75-87, door N at X=85 dw=1.8)
  { minX: 80.00, minZ: 74.78, maxX: 84.10, maxZ: 75.22 },
  { minX: 85.90, minZ: 74.78, maxX: 90.00, maxZ: 75.22 },
  { minX: 80.00, minZ: 86.78, maxX: 90.00, maxZ: 87.22 },
  { minX: 79.78, minZ: 75.00, maxX: 80.22, maxZ: 87.00 },
  { minX: 89.78, minZ: 75.00, maxX: 90.22, maxZ: 87.00 },
  // S1 (36-50, 77-87, door N at X=43 dw=2.0)
  { minX: 36.00, minZ: 76.78, maxX: 42.00, maxZ: 77.22 },
  { minX: 44.00, minZ: 76.78, maxX: 50.00, maxZ: 77.22 },
  { minX: 36.00, minZ: 86.78, maxX: 50.00, maxZ: 87.22 },
  { minX: 35.78, minZ: 77.00, maxX: 36.22, maxZ: 87.00 },
  { minX: 49.78, minZ: 77.00, maxX: 50.22, maxZ: 87.00 },
  // S2 (52-62, 77-87, door N at X=57 dw=2.0) ← stairwell
  { minX: 52.00, minZ: 76.78, maxX: 56.00, maxZ: 77.22 },
  { minX: 58.00, minZ: 76.78, maxX: 62.00, maxZ: 77.22 },
  { minX: 52.00, minZ: 86.78, maxX: 62.00, maxZ: 87.22 },
  { minX: 51.78, minZ: 77.00, maxX: 52.22, maxZ: 87.00 },
  { minX: 61.78, minZ: 77.00, maxX: 62.22, maxZ: 87.00 },
  // SW1 (16-27, 77-87, door N at X=21.5 dw=1.8)
  { minX: 16.00, minZ: 76.78, maxX: 20.60, maxZ: 77.22 },
  { minX: 22.40, minZ: 76.78, maxX: 27.00, maxZ: 77.22 },
  { minX: 16.00, minZ: 86.78, maxX: 27.00, maxZ: 87.22 },
  { minX: 15.78, minZ: 77.00, maxX: 16.22, maxZ: 87.00 },
  { minX: 26.78, minZ: 77.00, maxX: 27.22, maxZ: 87.00 },
  // SW2 (29-35, 77-87, door N at X=32 dw=1.4)
  { minX: 29.00, minZ: 76.78, maxX: 31.30, maxZ: 77.22 },
  { minX: 32.70, minZ: 76.78, maxX: 35.00, maxZ: 77.22 },
  { minX: 29.00, minZ: 86.78, maxX: 35.00, maxZ: 87.22 },
  { minX: 28.78, minZ: 77.00, maxX: 29.22, maxZ: 87.00 },
  { minX: 34.78, minZ: 77.00, maxX: 35.22, maxZ: 87.00 },
  // W1 (3-11, 65-75, door E at Z=70 dw=1.6)
  { minX:  3.00, minZ: 64.78, maxX: 11.00, maxZ: 65.22 },
  { minX:  3.00, minZ: 74.78, maxX: 11.00, maxZ: 75.22 },
  { minX:  2.78, minZ: 65.00, maxX:  3.22, maxZ: 75.00 },
  { minX: 10.78, minZ: 65.00, maxX: 11.22, maxZ: 69.20 },
  { minX: 10.78, minZ: 70.80, maxX: 11.22, maxZ: 75.00 },
];
const DOOR_BOX: Box = { minX: 23.85, minZ: -0.7, maxX: 24.15, maxZ: 0.7 };

const WAREHOUSE_GATE_BOXES: Record<string, Box> = {
  WH_A: { minX:  0.25, minZ: -77.25, maxX:  3.75, maxZ: -77.00 },
  WH_B: { minX: 16.25, minZ: -77.25, maxX: 18.75, maxZ: -77.00 },
  WH_C: { minX: -0.60, minZ: -60.25, maxX:  1.60, maxZ: -60.00 },
  WH_D: { minX: 16.25, minZ: -60.25, maxX: 18.75, maxZ: -60.00 },
  WH_E: { minX: -21.00, minZ: -77.25, maxX: -18.00, maxZ: -77.00 },
  WH_F: { minX: -20.40, minZ: -60.25, maxX: -17.60, maxZ: -60.00 },
  WH_G: { minX: -38.75, minZ: -77.25, maxX: -35.25, maxZ: -77.00 },
  WH_H: { minX: -38.50, minZ: -60.25, maxX: -35.50, maxZ: -60.00 },
};
const GATE_DOOR_CENTERS: Record<string, { x: number; z: number }> = {
  WH_A: { x:   2.0, z: -77 },
  WH_B: { x:  17.5, z: -77 },
  WH_C: { x:   0.5, z: -60 },
  WH_D: { x:  17.5, z: -60 },
  WH_E: { x: -19.5, z: -77 },
  WH_F: { x: -19.0, z: -60 },
  WH_G: { x: -37.0, z: -77 },
  WH_H: { x: -37.0, z: -60 },
};
const openGates = new Set<string>();

// ── Types ────────────────────────────────────────────────────────────────────
type ZombieAIState = "idle" | "chasing" | "attacking" | "dead";

interface Zombie {
  id: number;
  x: number;
  y: number;
  z: number;
  angle: number;
  health: number;
  state: ZombieAIState;
  deadTimer: number;
  spawnX: number;
  spawnZ: number;
  spawnY: number;
  walkTime: number;
  attackCooldown: number;
  wanderTimer: number;
  wanderAngle: number;
}

interface DrugLab {
  x: number;
  z: number;
  incomeTimer: number;
}

interface Player {
  id: string;
  ws: WebSocket;
  x: number;
  y: number;
  z: number;
  angle: number;
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
  sprint: boolean;
  stamina: number;
  health: number;
  money: number;
  isDead: boolean;
  respawnTimer: number;
  lastDamageMs: number;
  hasPistol: boolean;
  hasMiniGun: boolean;
  hasUzi: boolean;
  uziAmmo: number;
  uziReloading: boolean;
  uziReloadTimer: number;
  mgCooldown: number;
  uziCooldown: number;
  doorOpen: boolean;
  drugLabs: DrugLab[];
}

// Serializable subset of Player, persisted across restarts/redeploys
type PlayerSnapshot = Pick<Player,
  | "id" | "x" | "y" | "z" | "angle" | "stamina" | "health" | "money"
  | "isDead" | "respawnTimer" | "hasPistol" | "hasMiniGun" | "hasUzi"
  | "uziAmmo" | "uziReloading" | "uziReloadTimer" | "doorOpen" | "drugLabs"
>;

function serializePlayer(p: Player): PlayerSnapshot {
  return {
    id: p.id, x: p.x, y: p.y, z: p.z, angle: p.angle, stamina: p.stamina,
    health: p.health, money: p.money, isDead: p.isDead, respawnTimer: p.respawnTimer,
    hasPistol: p.hasPistol, hasMiniGun: p.hasMiniGun, hasUzi: p.hasUzi,
    uziAmmo: p.uziAmmo, uziReloading: p.uziReloading, uziReloadTimer: p.uziReloadTimer,
    doorOpen: p.doorOpen, drugLabs: p.drugLabs,
  };
}

// ── World state ──────────────────────────────────────────────────────────────
const players = new Map<WebSocket, Player>();

// Deterministic zombie init — no Math.random so IDs are stable
function initZombies(): Zombie[] {
  return Array.from({ length: ZOMBIE_COUNT }, (_, i) => {
    // Spawn in the track pit: subHW=5.0, platW=1.8 → pit half-width ≈ 3.0
    const sx = SUB_CX + ((i / (ZOMBIE_COUNT - 1)) * 6.0 - 3.0);
    const sz = -16 + i * 4;
    return {
      id: i,
      x: sx,
      y: SUB_FY,
      z: sz,
      angle: 0,
      health: ZOMBIE_HEALTH,
      state: "idle" as ZombieAIState,
      deadTimer: 0,
      spawnX: sx,
      spawnZ: sz,
      spawnY: SUB_FY,
      walkTime: i * 0.8,
      attackCooldown: 0,
      wanderTimer: 60 + i * 30,
      wanderAngle: i * (Math.PI / 4),
    };
  });
}
const zombies = initZombies();

// ── Persisted state (survives graceful restarts/redeploys) ──────────────────
const savedPlayers = new Map<string, PlayerSnapshot>();
if (supabase) {
  try {
    const { data, error } = await supabase
      .from("game_state")
      .select("data")
      .eq("id", GAME_STATE_ROW_ID)
      .maybeSingle();
    if (error) throw error;
    const saved = data?.data as {
      players?: PlayerSnapshot[];
      zombies?: Zombie[];
      openGates?: string[];
    } | undefined;
    for (const snap of saved?.players ?? []) savedPlayers.set(snap.id, snap);
    if (saved?.zombies?.length === zombies.length) {
      saved.zombies.forEach((z, i) => Object.assign(zombies[i], z));
    }
    for (const g of saved?.openGates ?? []) openGates.add(g);
    console.log(`[state] restored ${savedPlayers.size} player(s) from Supabase`);
  } catch (err) {
    console.error("[state] failed to load saved state:", err);
  }
}

async function saveState() {
  for (const p of players.values()) savedPlayers.set(p.id, serializePlayer(p));
  const data = { players: [...savedPlayers.values()], zombies, openGates: [...openGates] };
  if (!supabase) {
    console.warn("[state] Supabase not configured, skipping save");
    return;
  }
  const { error } = await supabase
    .from("game_state")
    .upsert({ id: GAME_STATE_ROW_ID, data, updated_at: new Date().toISOString() });
  if (error) throw error;
  console.log(`[state] saved ${data.players.length} player(s) to Supabase`);
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] received ${signal}, saving state...`);
  try {
    await saveState();
  } catch (err) {
    console.error("[shutdown] failed to save state:", err);
  }
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

function dist(ax: number, az: number, bx: number, bz: number) {
  return Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function broadcast(msg: string, exclude?: WebSocket) {
  for (const p of players.values()) {
    if (p.ws !== exclude && p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}

function applyDamage(z: Zombie, dmg: number, killer: Player) {
  z.health -= dmg;
  if (z.health <= 0 && z.state !== "dead") {
    z.state = "dead";
    z.deadTimer = ZOMBIE_DEAD_TICKS;
    const reward = ZOMBIE_KILL_MONEY_MIN + Math.floor(Math.random() * (ZOMBIE_KILL_MONEY_MAX - ZOMBIE_KILL_MONEY_MIN + 1));
    killer.money += reward;
    console.log(`[kill] ${killer.id} killed zombie #${z.id} (+$${reward}, total $${killer.money})`);
  }
}

// ── Main game loop ───────────────────────────────────────────────────────────
let tick = 0;
setInterval(() => {
  tick++;
  const now = Date.now();

  // ── Players ──────────────────────────────────────────────
  for (const p of players.values()) {
    if (p.isDead) {
      if (--p.respawnTimer <= 0) {
        p.isDead = false;
        p.health = 100;
        p.x = 5 + (Math.random() - 0.5) * 2;
        p.z = 52 + (Math.random() - 0.5) * 2;
        p.y = 0;
        console.log(`[respawn] ${p.id} respawned`);
      }
      continue;
    }

    // Stamina
    if (p.sprint && p.stamina > 0) p.stamina = Math.max(0, p.stamina - STAMINA_DRAIN);
    else p.stamina = Math.min(1, p.stamina + STAMINA_REGEN);
    const speed = p.sprint && p.stamina > 0 ? SPRINT_SPEED : WALK_SPEED;

    // Movement (camera-relative, WASD = forward/back/strafe)
    let nx = p.x,
      nz = p.z;
    if (p.w) {
      nx -= Math.sin(p.angle) * speed;
      nz -= Math.cos(p.angle) * speed;
    }
    if (p.s) {
      nx += Math.sin(p.angle) * speed;
      nz += Math.cos(p.angle) * speed;
    }
    if (p.a) {
      nx -= Math.cos(p.angle) * speed;
      nz += Math.sin(p.angle) * speed;
    }
    if (p.d) {
      nx += Math.cos(p.angle) * speed;
      nz -= Math.sin(p.angle) * speed;
    }

    const gateBoxes = Object.entries(WAREHOUSE_GATE_BOXES)
      .filter(([id]) => !openGates.has(id))
      .map(([, box]) => box);
    const walls = [...STATIC_WALLS, ...gateBoxes, ...(p.doorOpen ? [] : [DOOR_BOX])];
    const pos = resolveCollision(nx, nz, walls);
    p.x = Math.max(-BOUNDS, Math.min(BOUNDS, pos.x));
    p.z = Math.max(-BOUNDS, Math.min(BOUNDS, pos.z));

    // Y — subway ramp + water tower interpolation (matches client)
    const inSub = Math.abs(p.x - SUB_CX) < SUB_HW - 0.3;
    let ty = 0;
    if (inSub) {
      // Platform flat section; stairs: 0 at street end (Z=±30), -7 at platform end (Z=±20)
      if (p.z >= -20 && p.z <= 20) ty = SUB_FY;
      else if (p.z < -20 && p.z > -30) ty = ((p.z + 30) / 10) * SUB_FY;
      else if (p.z > 20 && p.z < 30) ty = ((30 - p.z) / 10) * SUB_FY;
    } else if (Math.abs(p.x - 52) < 0.9 && p.z >= -41 && p.z <= -39) {
      // Water tower ladder (south approach, walking north raises Y)
      ty = Math.max(0, Math.min(9, (-39 - p.z) / 2 * 9));
    } else if (Math.abs(p.x - 52) <= 4.0 && Math.abs(p.z + 45) <= 4.0 && p.y > 7.0) {
      // Water tower platform
      ty = 9;
    } else if (Math.abs(p.z + 84.5) < 0.8 && p.x >= 9 && p.x <= 12) {
      // WH_A east-wall ladder (approach from east, climb as x decreases to 9)
      ty = Math.max(0, Math.min(8.5, (12 - p.x) / 3 * 8.5));
    } else if (p.x >= -8 && p.x <= 9 && p.z >= -92 && p.z <= -77 && p.y > 7.0) {
      ty = 8.5; // WH_A roof
    } else if (Math.abs(p.z + 84.5) < 0.8 && p.x >= 22 && p.x <= 25) {
      // WH_B east-wall ladder
      ty = Math.max(0, Math.min(7.5, (25 - p.x) / 3 * 7.5));
    } else if (p.x >= 13 && p.x <= 22 && p.z >= -92 && p.z <= -77 && p.y > 6.0) {
      ty = 7.5; // WH_B roof
    } else if (Math.abs(p.z + 66.5) < 0.8 && p.x >= 6 && p.x <= 9) {
      // WH_C east-wall ladder
      ty = Math.max(0, Math.min(6.5, (9 - p.x) / 3 * 6.5));
    } else if (p.x >= -8 && p.x <= 6 && p.z >= -73 && p.z <= -60 && p.y > 5.0) {
      ty = 6.5; // WH_C roof
    } else if (Math.abs(p.z + 66.5) < 0.8 && p.x >= 22 && p.x <= 25) {
      // WH_D east-wall ladder
      ty = Math.max(0, Math.min(7.0, (25 - p.x) / 3 * 7.0));
    } else if (p.x >= 13 && p.x <= 22 && p.z >= -73 && p.z <= -60 && p.y > 6.0) {
      ty = 7.0; // WH_D roof
    } else if (Math.abs(p.z + 84.5) < 0.8 && p.x >= -12 && p.x <= -9) {
      // WH_E east-wall ladder
      ty = Math.max(0, Math.min(7.5, (-9 - p.x) / 3 * 7.5));
    } else if (p.x >= -26 && p.x <= -12 && p.z >= -92 && p.z <= -77 && p.y > 6.0) {
      ty = 7.5; // WH_E roof
    } else if (Math.abs(p.z + 66.5) < 0.8 && p.x >= -12 && p.x <= -9) {
      // WH_F east-wall ladder
      ty = Math.max(0, Math.min(6.5, (-9 - p.x) / 3 * 6.5));
    } else if (p.x >= -26 && p.x <= -12 && p.z >= -73 && p.z <= -60 && p.y > 5.0) {
      ty = 6.5; // WH_F roof
    } else if (Math.abs(p.z + 84.5) < 0.8 && p.x >= -30 && p.x <= -27) {
      // WH_G east-wall ladder
      ty = Math.max(0, Math.min(8.0, (-27 - p.x) / 3 * 8.0));
    } else if (p.x >= -44 && p.x <= -30 && p.z >= -92 && p.z <= -77 && p.y > 6.5) {
      ty = 8.0; // WH_G roof
    } else if (Math.abs(p.z + 66.5) < 0.8 && p.x >= -30 && p.x <= -27) {
      // WH_H east-wall ladder
      ty = Math.max(0, Math.min(7.0, (-27 - p.x) / 3 * 7.0));
    } else if (p.x >= -44 && p.x <= -30 && p.z >= -73 && p.z <= -60 && p.y > 5.5) {
      ty = 7.0; // WH_H roof
    // ── Urban District stairwells (NE1A and S2) ──────────────────────────
    } else if (p.x >= 65.5 && p.x <= 67.0 && p.z >= 32.4 && p.z <= 42.2) {
      // NE1A stairwell — walk south (+Z) to climb 9 floors
      ty = Math.max(0, Math.min(9, (p.z - 32.4) / 9.8 * 9));
    } else if (p.x >= 65 && p.x <= 76 && p.z >= 32 && p.z <= 43 && p.y > 8.5) {
      ty = 9; // NE1A floor 4
    } else if (p.x >= 65 && p.x <= 76 && p.z >= 32 && p.z <= 43 && p.y > 5.5) {
      ty = 6; // NE1A floor 3
    } else if (p.x >= 65 && p.x <= 76 && p.z >= 32 && p.z <= 43 && p.y > 2.5) {
      ty = 3; // NE1A floor 2
    } else if (p.x >= 52.5 && p.x <= 54.0 && p.z >= 77.8 && p.z <= 86.2) {
      // S2 stairwell — walk south (+Z) to climb
      ty = Math.max(0, Math.min(9, (p.z - 77.8) / 8.4 * 9));
    } else if (p.x >= 52 && p.x <= 62 && p.z >= 77 && p.z <= 87 && p.y > 8.5) {
      ty = 9; // S2 floor 4
    } else if (p.x >= 52 && p.x <= 62 && p.z >= 77 && p.z <= 87 && p.y > 5.5) {
      ty = 6; // S2 floor 3
    } else if (p.x >= 52 && p.x <= 62 && p.z >= 77 && p.z <= 87 && p.y > 2.5) {
      ty = 3; // S2 floor 2
    }
    p.y += (ty - p.y) * 0.15;

    // Health regen
    if (p.health < 100 && now - p.lastDamageMs > PLAYER_HEALTH_REGEN_DELAY_MS)
      p.health = Math.min(100, p.health + PLAYER_HEALTH_REGEN_RATE);

    // Drug lab passive income
    for (const lab of p.drugLabs) {
      lab.incomeTimer++;
      if (lab.incomeTimer >= DRUG_LAB_INCOME_TICKS) {
        lab.incomeTimer = 0;
        p.money += DRUG_LAB_INCOME;
        console.log(`[income] ${p.id} earned $${DRUG_LAB_INCOME} from drug lab (total $${p.money})`);
      }
    }

    // Weapon cooldowns
    if (p.mgCooldown > 0) p.mgCooldown--;
    if (p.uziCooldown > 0) p.uziCooldown--;
    if (p.uziReloading) {
      if (--p.uziReloadTimer <= 0) {
        p.uziReloading = false;
        p.uziAmmo = UZI_AMMO;
        console.log(`[reload] ${p.id} reloaded uzi`);
      }
    }
  }

  // ── Zombie AI ────────────────────────────────────────────
  for (const z of zombies) {
    if (z.state === "dead") {
      if (--z.deadTimer <= 0) {
        z.health = ZOMBIE_HEALTH;
        z.state = "idle";
        z.x = z.spawnX;
        z.z = z.spawnZ;
        z.y = z.spawnY;
        console.log(`[zombie] #${z.id} respawned`);
      }
      continue;
    }

    // Find nearest living player
    let nearest: Player | null = null,
      nearD = Infinity;
    for (const p of players.values()) {
      if (p.isDead) continue;
      const dd = dist(z.x, z.z, p.x, p.z);
      if (dd < nearD) {
        nearest = p;
        nearD = dd;
      }
    }

    if (z.attackCooldown > 0) z.attackCooldown--;

    if (nearest && nearD < ZOMBIE_ATTACK_RANGE) {
      z.state = "attacking";
      z.angle = Math.atan2(nearest.x - z.x, nearest.z - z.z);
      if (z.attackCooldown === 0) {
        z.attackCooldown = ATTACK_COOLDOWN;
        nearest.health = Math.max(0, nearest.health - ZOMBIE_ATTACK_DAMAGE);
        nearest.lastDamageMs = now;
        console.log(`[damage] zombie #${z.id} hit ${nearest.id} for ${ZOMBIE_ATTACK_DAMAGE} hp (${Math.floor(nearest.health)}/100)`);
        if (nearest.health <= 0 && !nearest.isDead) {
          nearest.isDead = true;
          nearest.respawnTimer = RESPAWN_TICKS;
          console.log(`[death] ${nearest.id} killed by zombie #${z.id}`);
        }
      }
    } else if (nearest && nearD < ZOMBIE_CHASE_RANGE) {
      z.state = "chasing";
      z.angle = Math.atan2(nearest.x - z.x, nearest.z - z.z);
      z.x += Math.sin(z.angle) * ZOMBIE_CHASE_SPEED;
      z.z += Math.cos(z.angle) * ZOMBIE_CHASE_SPEED;
      z.walkTime += 0.14;
    } else {
      z.state = "idle";
      if (--z.wanderTimer <= 0) {
        z.wanderTimer = 120 + Math.floor(Math.random() * 180);
        z.wanderAngle = Math.random() * Math.PI * 2;
      }
      z.angle = z.wanderAngle;
      z.x = Math.max(SUB_CX - 3.0, Math.min(SUB_CX + 3.0, z.x + Math.sin(z.wanderAngle) * ZOMBIE_WANDER_SPEED));
      z.z = Math.max(-28, Math.min(28, z.z + Math.cos(z.wanderAngle) * ZOMBIE_WANDER_SPEED));
      z.walkTime += 0.05;
    }
  }

  if (players.size === 0) return;

  // ── Broadcast full state ─────────────────────────────────
  const pArr = Array.from(players.values()).map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    z: p.z,
    angle: p.angle,
    health: Math.floor(p.health),
    money: p.money,
    stamina: Math.round(p.stamina * 100) / 100,
    isDead: p.isDead,
    respawnTicks: p.respawnTimer,
    hasPistol: p.hasPistol,
    hasMiniGun: p.hasMiniGun,
    hasUzi: p.hasUzi,
    uziAmmo: p.uziAmmo,
    uziReloading: p.uziReloading,
    drugLabCount: p.drugLabs.length,
    drugLabs: p.drugLabs.map((l) => ({ x: l.x, z: l.z })),
    doorOpen: p.doorOpen,
  }));

  const zArr = zombies.map((z) => ({
    id: z.id,
    x: z.x,
    y: z.y,
    z: z.z,
    angle: z.angle,
    state: z.state,
    walkTime: z.walkTime,
  }));

  const msg = JSON.stringify({ type: "state", tick, players: pArr, zombies: zArr, openGates: [...openGates] });
  for (const p of players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}, TICK_MS);

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // First message from a connection: claim/restore a player identity.
    // Clients send a persistent id (stored client-side) so a redeploy can
    // restore position, money, items etc. once they reconnect.
    if (msg.type === "join" && !players.has(ws)) {
      const requestedId = typeof msg.id === "string" ? msg.id : null;
      const idTaken = requestedId !== null &&
        Array.from(players.values()).some((pl) => pl.id === requestedId);
      const id = requestedId && !idTaken ? requestedId : genId();
      const saved = savedPlayers.get(id);
      savedPlayers.delete(id);

      const player: Player = {
        id,
        ws,
        x: saved?.x ?? 5 + (Math.random() - 0.5) * 2,
        y: saved?.y ?? 0,
        z: saved?.z ?? 52 + (Math.random() - 0.5) * 2,
        angle: saved?.angle ?? 0,
        w: false,
        s: false,
        a: false,
        d: false,
        sprint: false,
        stamina: saved?.stamina ?? 1,
        health: saved?.health ?? 100,
        money: saved?.money ?? PLAYER_START_MONEY,
        isDead: saved?.isDead ?? false,
        respawnTimer: saved?.respawnTimer ?? 0,
        lastDamageMs: 0,
        hasPistol: saved?.hasPistol ?? false,
        hasMiniGun: saved?.hasMiniGun ?? false,
        hasUzi: saved?.hasUzi ?? false,
        uziAmmo: saved?.uziAmmo ?? UZI_AMMO,
        uziReloading: saved?.uziReloading ?? false,
        uziReloadTimer: saved?.uziReloadTimer ?? 0,
        mgCooldown: 0,
        uziCooldown: 0,
        doorOpen: saved?.doorOpen ?? false,
        drugLabs: saved?.drugLabs ?? [],
      };
      players.set(ws, player);
      ws.send(JSON.stringify({ type: "init", id }));
      console.log(`[+] ${id} ${saved ? "rejoined" : "joined"} (${players.size} online)`);
      return;
    }

    const p = players.get(ws);
    if (!p) return;

    // Combined input message: movement keys + facing angle + sprint
    if (msg.type === "input") {
      p.w = msg.w === true;
      p.s = msg.s === true;
      p.a = msg.a === true;
      p.d = msg.d === true;
      p.sprint = msg.sprint === true;
      if (typeof msg.angle === "number" && isFinite(msg.angle)) p.angle = msg.angle;
    }

    // Shoot: client reports which zombie it hit (via client-side raycast)
    // Server validates distance is plausible before applying damage
    if (msg.type === "shoot" && !p.isDead) {
      const wep = msg.weapon as string;
      const zid = typeof msg.zombieId === "number" ? msg.zombieId : -1;
      const z = zombies[zid];

      if (wep === "pistol" && p.hasPistol) {
        if (z && z.state !== "dead" && dist(p.x, p.z, z.x, z.z) < WEAPON_RANGE) {
          applyDamage(z, PISTOL_DAMAGE, p);
        }
      }

      if (wep === "minigun" && p.hasMiniGun && p.mgCooldown === 0) {
        p.mgCooldown = MG_COOLDOWN;
        if (z && z.state !== "dead" && dist(p.x, p.z, z.x, z.z) < WEAPON_RANGE) {
          applyDamage(z, MINIGUN_DAMAGE, p);
        }
      }

      if (wep === "uzi" && p.hasUzi && !p.uziReloading && p.uziAmmo > 0 && p.uziCooldown === 0) {
        p.uziCooldown = UZI_COOLDOWN;
        p.uziAmmo--;
        if (p.uziAmmo === 0) {
          p.uziReloading = true;
          p.uziReloadTimer = UZI_RELOAD_TICKS;
        }
        if (z && z.state !== "dead" && dist(p.x, p.z, z.x, z.z) < WEAPON_RANGE) {
          applyDamage(z, UZI_DAMAGE, p);
        }
      }
    }

    // Purchase
    if (msg.type === "buy" && !p.isDead) {
      const item = msg.item as string;
      if (item === "pistol" && !p.hasPistol && p.money >= PISTOL_PRICE) {
        p.money -= PISTOL_PRICE;
        p.hasPistol = true;
        console.log(`[buy] ${p.id} bought pistol ($${PISTOL_PRICE}, remaining $${p.money})`);
      }
      if (item === "minigun" && !p.hasMiniGun && p.money >= MINIGUN_PRICE) {
        p.money -= MINIGUN_PRICE;
        p.hasMiniGun = true;
        console.log(`[buy] ${p.id} bought minigun ($${MINIGUN_PRICE}, remaining $${p.money})`);
      }
      if (item === "uzi" && !p.hasUzi && p.money >= UZI_PRICE) {
        p.money -= UZI_PRICE;
        p.hasUzi = true;
        console.log(`[buy] ${p.id} bought uzi ($${UZI_PRICE}, remaining $${p.money})`);
      }
      if (item === "druglab" && p.money >= DRUG_LAB_PRICE) {
        p.money -= DRUG_LAB_PRICE;
        p.drugLabs.push({ x: p.x + 1.5, z: p.z, incomeTimer: 0 });
        console.log(`[buy] ${p.id} placed drug lab #${p.drugLabs.length} ($${DRUG_LAB_PRICE}, remaining $${p.money})`);
      }
    }

    // Warehouse gate purchase
    if (msg.type === "buy_gate" && !p.isDead) {
      const gateId = msg.id as string;
      const center = GATE_DOOR_CENTERS[gateId];
      if (center && !openGates.has(gateId) && p.money >= WAREHOUSE_GATE_PRICE &&
          dist(p.x, p.z, center.x, center.z) < 6) {
        p.money -= WAREHOUSE_GATE_PRICE;
        openGates.add(gateId);
        console.log(`[gate] ${p.id} opened ${gateId} (-$${WAREHOUSE_GATE_PRICE}, remaining $${p.money})`);
      }
    }

    // Building door toggle
    if (msg.type === "door") {
      p.doorOpen = !p.doorOpen;
      console.log(`[door] ${p.id} ${p.doorOpen ? "opened" : "closed"} door`);
    }
  });

  ws.on("close", () => {
    const p = players.get(ws);
    if (!p) return;
    players.delete(ws);
    console.log(`[-] ${p.id} left (${players.size} online)`);
    broadcast(JSON.stringify({ type: "leave", id: p.id }));
  });

  ws.on("error", (err) => console.error(`WS error [${players.get(ws)?.id ?? "?"}]:`, err.message));
});

wss.on("listening", () => console.log(`Game server on ws://localhost:${PORT}`));
