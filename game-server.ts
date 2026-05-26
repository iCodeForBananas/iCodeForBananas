import { WebSocketServer, WebSocket } from "ws";

// ── Server ───────────────────────────────────────────────────────────────────
const PORT    = parseInt(process.env.GAME_WS_PORT ?? "8080");
const TICK_MS = 50; // 20 fps server tick

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
const UZI_PRICE      = 400;

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
const SUB_CX = -15, SUB_HW = 3.2, SUB_FY = -7;

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
  // Arena perimeter
  { minX: -59.1, minZ: -59.1, maxX: 59.1, maxZ: -56.9 },
  { minX: -59.1, minZ: 56.9, maxX: 59.1, maxZ: 59.1 },
  { minX: -59.1, minZ: -59.1, maxX: -56.9, maxZ: 59.1 },
  { minX: 56.9, minZ: -59.1, maxX: 59.1, maxZ: 59.1 },
  // Shantytown shacks (deterministic layout, mirrors client geometry)
  ...buildShackWalls(),
];
const DOOR_BOX: Box = { minX: 23.85, minZ: -0.7, maxX: 24.15, maxZ: 0.7 };

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

// ── World state ──────────────────────────────────────────────────────────────
const players = new Map<WebSocket, Player>();

// Deterministic zombie init — no Math.random so IDs are stable
function initZombies(): Zombie[] {
  return Array.from({ length: ZOMBIE_COUNT }, (_, i) => {
    const sx = SUB_CX + ((i / (ZOMBIE_COUNT - 1)) * SUB_HW * 1.6 - SUB_HW * 0.8);
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
        p.x = (Math.random() - 0.5) * 10;
        p.z = (Math.random() - 0.5) * 10;
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

    const walls = p.doorOpen ? STATIC_WALLS : [...STATIC_WALLS, DOOR_BOX];
    const pos = resolveCollision(nx, nz, walls);
    p.x = Math.max(-BOUNDS, Math.min(BOUNDS, pos.x));
    p.z = Math.max(-BOUNDS, Math.min(BOUNDS, pos.z));

    // Y — subway ramp interpolation (matches client)
    const inSub = Math.abs(p.x - SUB_CX) < SUB_HW - 0.3;
    let ty = 0;
    if (inSub) {
      if (p.z >= -20 && p.z <= 20) ty = SUB_FY;
      else if (p.z < -20 && p.z > -30) ty = ((-20 - p.z) / 10) * SUB_FY;
      else if (p.z > 20 && p.z < 30) ty = ((p.z - 20) / 10) * SUB_FY;
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
      z.x = Math.max(SUB_CX - SUB_HW + 0.5, Math.min(SUB_CX + SUB_HW - 0.5, z.x + Math.sin(z.wanderAngle) * ZOMBIE_WANDER_SPEED));
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

  const msg = JSON.stringify({ type: "state", tick, players: pArr, zombies: zArr });
  for (const p of players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}, TICK_MS);

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  const id = genId();
  const player: Player = {
    id,
    ws,
    x: (Math.random() - 0.5) * 10,
    y: 0,
    z: (Math.random() - 0.5) * 10,
    angle: 0,
    w: false,
    s: false,
    a: false,
    d: false,
    sprint: false,
    stamina: 1,
    health: 100,
    money: PLAYER_START_MONEY,
    isDead: false,
    respawnTimer: 0,
    lastDamageMs: 0,
    hasPistol: false,
    hasMiniGun: false,
    hasUzi: false,
    uziAmmo: UZI_AMMO,
    uziReloading: false,
    uziReloadTimer: 0,
    mgCooldown: 0,
    uziCooldown: 0,
    doorOpen: false,
    drugLabs: [],
  };
  players.set(ws, player);
  ws.send(JSON.stringify({ type: "init", id }));
  console.log(`[+] ${id} joined (${players.size} online)`);

  ws.on("message", (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
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

  ws.on("error", (err) => console.error(`WS error [${id}]:`, err.message));
});

wss.on("listening", () => console.log(`Game server on ws://localhost:${PORT}`));
