'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useAuth } from '@/app/hooks/useAuth';
import { useTheme } from '@/app/lib/ThemeContext';
import { createClient } from '@/utils/supabase/client';

// ─── Constants ────────────────────────────────────────────────────────────────
// GRID_SIZE must match v_grid in the SQL attack_tile function.
const GRID_SIZE = 50;
const TILE_PX = 20;            // base pixels per tile at zoom = 1
// ATTACK_COOLDOWN_MS must match v_cooldown (seconds) in the SQL attack_tile function.
const ATTACK_COOLDOWN_MS = 15_000;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 6;

// ─── Types ────────────────────────────────────────────────────────────────────
type TileData   = { owner_id: string | null; claimed_at: string | null };
type PlayerData = { color_hue: number };
type Coord      = { x: number; y: number };
type RpcResult  = {
  ok: boolean;
  error?: string;
  retry_in?: number;
  start_x?: number;
  start_y?: number;
  already_in_game?: boolean;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function tileKey(x: number, y: number): string { return `${x},${y}`; }

// Mirrors: ((hashtext(uid::text) % 360) + 360) % 360  in SQL
function playerHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

function tileColor(hue: number, isDark: boolean): string {
  return isDark
    ? `hsl(${hue},50%,38%)`
    : `hsl(${hue},65%,53%)`;
}

const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TerritoryGame() {
  const { user, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Stable Supabase client (created once per mount)
  const sb = useMemo(() => createClient()!, []);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Map state ──────────────────────────────────────────────────────────────
  const [tiles,      setTiles]      = useState<Map<string, TileData>>(new Map());
  const [players,    setPlayers]    = useState<Map<string, PlayerData>>(new Map());
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [offset,     setOffset]     = useState<Coord>({ x: 0, y: 0 });
  const [zoom,       setZoom]       = useState(1);
  const [hoveredTile, setHoveredTile] = useState<Coord | null>(null);

  // ── Cooldown ───────────────────────────────────────────────────────────────
  const [cooldownEnd,  setCooldownEnd]  = useState<number | null>(null); // epoch ms
  const [cooldownLeft, setCooldownLeft] = useState(0);                   // ms remaining

  // ── UI state ───────────────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(true);
  const [joining,   setJoining]   = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // ── Refs for imperative handlers (avoid stale closures) ───────────────────
  const zoomRef   = useRef(zoom);
  const offsetRef = useRef(offset);
  // Panning
  const isDragging = useRef(false);
  const lastMouse  = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  // One-time initialisation flag
  const hasInitialized = useRef(false);

  useEffect(() => { zoomRef.current = zoom; },     [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  // ── Derived: my tile set ───────────────────────────────────────────────────
  const myTileKeys = useMemo(() => {
    if (!user) return new Set<string>();
    const s = new Set<string>();
    for (const [key, t] of tiles) {
      if (t.owner_id === user.id) s.add(key);
    }
    return s;
  }, [tiles, user]);

  const isInGame = myTileKeys.size > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Load all tiles + players on sign-in
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const [tilesRes, playersRes] = await Promise.all([
        sb.from('game_tiles').select('x,y,owner_id,claimed_at'),
        sb.from('game_players').select('id,color_hue,last_action_at'),
      ]);

      if (cancelled) return;

      if (tilesRes.data) {
        const m = new Map<string, TileData>();
        for (const t of tilesRes.data as Array<{
          x: number; y: number; owner_id: string | null; claimed_at: string | null
        }>) {
          m.set(tileKey(t.x, t.y), { owner_id: t.owner_id, claimed_at: t.claimed_at });
        }
        setTiles(m);
      }

      if (playersRes.data) {
        const m = new Map<string, PlayerData>();
        for (const p of playersRes.data as Array<{
          id: string; color_hue: number; last_action_at: string | null
        }>) {
          m.set(p.id, { color_hue: p.color_hue });
          if (p.id === user.id && p.last_action_at) {
            const end = new Date(p.last_action_at).getTime() + ATTACK_COOLDOWN_MS;
            if (end > Date.now()) setCooldownEnd(end);
          }
        }
        setPlayers(m);
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user, sb]);

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime subscriptions
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const chan = sb
      .channel('territory_realtime')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_tiles' },
        (payload) => {
          const r = payload.new as { x: number; y: number; owner_id: string | null; claimed_at: string | null };
          setTiles((prev) => {
            const next = new Map(prev);
            next.set(tileKey(r.x, r.y), { owner_id: r.owner_id, claimed_at: r.claimed_at });
            return next;
          });
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_players' },
        (payload) => {
          const r = payload.new as { id: string; color_hue: number };
          setPlayers((prev) => {
            const next = new Map(prev);
            next.set(r.id, { color_hue: r.color_hue });
            return next;
          });
        }
      )
      .subscribe();

    return () => { sb.removeChannel(chan); };
  }, [user, sb]);

  // ─────────────────────────────────────────────────────────────────────────
  // Cooldown countdown ticker
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cooldownEnd) { setCooldownLeft(0); return; }
    const tick = () => {
      const left = Math.max(0, cooldownEnd - Date.now());
      setCooldownLeft(left);
      if (left === 0) setCooldownEnd(null);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  // ─────────────────────────────────────────────────────────────────────────
  // Resize observer → keeps canvas pixel dims in sync with container
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        setCanvasSize({
          w: Math.round(e.contentRect.width),
          h: Math.round(e.contentRect.height),
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Centre view on the grid on first canvas size measurement
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasInitialized.current || canvasSize.w === 0) return;
    hasInitialized.current = true;
    setOffset({
      x: canvasSize.w / 2 - (GRID_SIZE * TILE_PX) / 2,
      y: canvasSize.h / 2 - (GRID_SIZE * TILE_PX) / 2,
    });
  }, [canvasSize]);

  // ─────────────────────────────────────────────────────────────────────────
  // Wheel zoom — attached imperatively so we can call preventDefault()
  // (React's synthetic onWheel is passive in modern browsers)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect   = canvas.getBoundingClientRect();
      const cx     = e.clientX - rect.left;
      const cy     = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.87 : 1.15;
      const cur    = zoomRef.current;
      const next   = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cur * factor));
      const scale  = next / cur;
      const off    = offsetRef.current;
      setZoom(next);
      setOffset({ x: cx - (cx - off.x) * scale, y: cy - (cy - off.y) * scale });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Canvas draw — runs whenever visual state changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.w === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = canvasSize.w;
    canvas.height = canvasSize.h;

    const { w, h } = canvasSize;
    const tilePx  = TILE_PX * zoom;
    const gap     = Math.max(1, zoom * 0.6);
    const cell    = tilePx - gap;

    // Grid background (fills gaps between tiles)
    ctx.fillStyle = isDark ? '#141414' : '#c8cdd6';
    ctx.fillRect(0, 0, w, h);

    // Compute attackable neighbours (highlighted when cooldown is clear)
    const attackable = new Set<string>();
    if (user && cooldownLeft === 0) {
      for (const key of myTileKeys) {
        const [tx, ty] = key.split(',').map(Number);
        for (const [dx, dy] of DIRS) {
          const nx = tx + dx, ny = ty + dy;
          if (inBounds(nx, ny)) {
            const nk = tileKey(nx, ny);
            if (!myTileKeys.has(nk)) attackable.add(nk);
          }
        }
      }
    }

    // Visible tile range (culled to viewport)
    const x0 = Math.max(0, Math.floor(-offset.x / tilePx));
    const x1 = Math.min(GRID_SIZE - 1, Math.ceil((w - offset.x) / tilePx));
    const y0 = Math.max(0, Math.floor(-offset.y / tilePx));
    const y1 = Math.min(GRID_SIZE - 1, Math.ceil((h - offset.y) / tilePx));

    const unclaimedFill = isDark ? '#252525' : '#f0f2f5';

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const px  = offset.x + x * tilePx;
        const py  = offset.y + y * tilePx;
        const key = tileKey(x, y);
        const tile    = tiles.get(key);
        const ownerId = tile?.owner_id ?? null;
        const isOwn   = ownerId === user?.id;

        // Base fill
        let fill: string;
        if (!ownerId) {
          fill = unclaimedFill;
        } else {
          const hue = players.get(ownerId)?.color_hue ?? playerHue(ownerId);
          fill = tileColor(hue, isDark);
        }
        ctx.fillStyle = fill;
        ctx.fillRect(px, py, cell, cell);

        // Attackable highlight (golden shimmer)
        if (attackable.has(key)) {
          ctx.fillStyle = isDark ? 'rgba(250,204,21,0.16)' : 'rgba(250,204,21,0.26)';
          ctx.fillRect(px, py, cell, cell);
        }

        // Hover overlay
        if (hoveredTile?.x === x && hoveredTile?.y === y) {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(px, py, cell, cell);
        }

        // Own tile border (banana yellow)
        if (isOwn && cell > 4) {
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth   = Math.max(1, zoom * 0.7);
          ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
        }
      }
    }
  }, [tiles, players, myTileKeys, offset, zoom, hoveredTile, canvasSize, isDark, user, cooldownLeft]);

  // ─────────────────────────────────────────────────────────────────────────
  // Coordinate helpers
  // ─────────────────────────────────────────────────────────────────────────
  const canvasToTile = useCallback((cx: number, cy: number): Coord => {
    const tilePx = TILE_PX * zoomRef.current;
    const off    = offsetRef.current;
    return {
      x: Math.floor((cx - off.x) / tilePx),
      y: Math.floor((cy - off.y) / tilePx),
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Mouse event handlers
  // ─────────────────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    hasDragged.current = false;
    lastMouse.current  = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const t    = canvasToTile(e.clientX - rect.left, e.clientY - rect.top);
    setHoveredTile(inBounds(t.x, t.y) ? t : null);

    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged.current = true;
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, [canvasToTile]);

  const onMouseLeave = useCallback(() => {
    setHoveredTile(null);
    isDragging.current = false;
    hasDragged.current = false;
  }, []);

  const onMouseUp = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDrag = hasDragged.current;
    isDragging.current = false;
    hasDragged.current = false;
    if (wasDrag || !user) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const tile = canvasToTile(e.clientX - rect.left, e.clientY - rect.top);
    if (!inBounds(tile.x, tile.y)) return;

    const key = tileKey(tile.x, tile.y);

    if (myTileKeys.has(key)) { setStatusMsg('Already yours.'); return; }

    if (!isInGame) { setStatusMsg('Click "Join Game" first.'); return; }

    if (cooldownLeft > 0) {
      setStatusMsg(`On cooldown — ${(cooldownLeft / 1000).toFixed(1)}s left.`);
      return;
    }

    // Client-side adjacency pre-check (server re-validates atomically)
    const adjacent = DIRS.some(([dx, dy]) => myTileKeys.has(tileKey(tile.x + dx, tile.y + dy)));
    if (!adjacent) {
      setStatusMsg('You can only attack tiles adjacent to your territory.');
      return;
    }

    setStatusMsg('');
    const { data, error } = await sb.rpc('attack_tile', {
      target_x: tile.x,
      target_y: tile.y,
    });
    if (error) { setStatusMsg(error.message); return; }

    const res = data as RpcResult;
    if (!res.ok) {
      if (res.error === 'cooldown') {
        const retryMs = (res.retry_in ?? 0) * 1000;
        setCooldownEnd(Date.now() + retryMs);
        setStatusMsg('');
      } else if (res.error === 'eliminated') {
        setStatusMsg('Eliminated — click "Rejoin" to start fresh.');
      } else {
        setStatusMsg(res.error ?? 'Attack failed.');
      }
      return;
    }

    setCooldownEnd(Date.now() + ATTACK_COOLDOWN_MS);
    setStatusMsg('');
  }, [user, myTileKeys, isInGame, cooldownLeft, canvasToTile, sb]);

  // ─────────────────────────────────────────────────────────────────────────
  // Join / Rejoin
  // ─────────────────────────────────────────────────────────────────────────
  const handleJoin = useCallback(async () => {
    if (!user || joining) return;
    setJoining(true);
    setStatusMsg('');
    const { data, error } = await sb.rpc('join_territory_game');
    setJoining(false);
    if (error) { setStatusMsg(error.message); return; }

    const res = data as RpcResult;
    if (!res.ok) { setStatusMsg(res.error ?? 'Could not join.'); return; }
    if (res.already_in_game) { setStatusMsg('Already in game!'); return; }

    // Centre view on the starting tile
    if (res.start_x !== undefined && canvasSize.w > 0) {
      const tilePx = TILE_PX * zoomRef.current;
      setOffset({
        x: canvasSize.w  / 2 - res.start_x * tilePx - tilePx / 2,
        y: canvasSize.h / 2 - (res.start_y ?? 0) * tilePx - tilePx / 2,
      });
    }
  }, [user, joining, canvasSize, sb]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className='flex h-full items-center justify-center dark:bg-neutral-900 bg-white'>
        <span className='text-sm dark:text-yellow-400 text-black'>Loading…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-4 dark:bg-neutral-900 bg-white'>
        <p className='text-sm dark:text-yellow-400 text-black font-medium'>
          Sign in to play Territory.
        </p>
        <a
          href='/login'
          className='px-4 py-2 rounded text-sm font-semibold'
          style={{ background: '#facc15', color: '#000' }}
        >
          Sign In
        </a>
      </div>
    );
  }

  const myHue    = players.get(user.id)?.color_hue ?? playerHue(user.id);
  const onCooldown = cooldownLeft > 0;
  const cooldownSec = (cooldownLeft / 1000).toFixed(1);

  return (
    <div className='flex flex-col h-full dark:bg-neutral-900 bg-white select-none overflow-hidden'>

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 shrink-0
                      border-b dark:border-neutral-800 border-gray-200'>

        <h1 className='font-bold text-sm uppercase tracking-widest dark:text-yellow-400 text-black'>
          Territory
        </h1>

        {/* Player colour swatch + tile count */}
        <div className='flex items-center gap-1.5'>
          <div
            className='w-3 h-3 rounded-sm border border-black/20 dark:border-white/20 shrink-0'
            style={{ background: tileColor(myHue, isDark) }}
          />
          <span className='text-xs dark:text-neutral-300 text-neutral-600 tabular-nums'>
            {myTileKeys.size} tile{myTileKeys.size !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Cooldown indicator */}
        <span className={`text-xs font-mono tabular-nums ${
          onCooldown ? 'text-yellow-500' : 'dark:text-neutral-400 text-neutral-500'
        }`}>
          {onCooldown ? `⏳ ${cooldownSec}s` : '⚔ Ready'}
        </span>

        {/* Status message */}
        {statusMsg && (
          <span className='text-xs dark:text-neutral-300 text-neutral-600 truncate max-w-xs'>
            {statusMsg}
          </span>
        )}

        {/* Join / Rejoin */}
        {!isInGame ? (
          <button
            onClick={handleJoin}
            disabled={joining}
            className='ml-auto px-3 py-1 rounded text-xs font-semibold disabled:opacity-50 shrink-0'
            style={{ background: '#facc15', color: '#000' }}
          >
            {joining ? 'Joining…' : 'Join Game'}
          </button>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className='ml-auto px-3 py-1 rounded text-xs font-semibold disabled:opacity-50 shrink-0
                       border dark:border-neutral-600 border-gray-300
                       dark:text-neutral-300 text-neutral-600
                       dark:hover:bg-neutral-800 hover:bg-gray-100 transition-colors'
          >
            {joining ? 'Joining…' : 'Rejoin'}
          </button>
        )}
      </div>

      {/* ── Canvas area ──────────────────────────────────────────────────── */}
      <div ref={containerRef} className='flex-1 relative overflow-hidden'>
        {loading && (
          <div className='absolute inset-0 z-10 flex items-center justify-center
                          dark:bg-neutral-900/80 bg-white/80'>
            <span className='text-sm dark:text-yellow-400 text-black'>Loading map…</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className='absolute inset-0 cursor-crosshair'
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        />
      </div>

      {/* ── Footer help bar ───────────────────────────────────────────────── */}
      <div className='px-4 py-1 shrink-0 border-t dark:border-neutral-800 border-gray-200'>
        <p className='text-xs dark:text-neutral-500 text-neutral-400'>
          Scroll to zoom · Drag to pan · Click an adjacent tile to attack
        </p>
      </div>
    </div>
  );
}
