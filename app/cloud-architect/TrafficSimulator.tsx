"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Activity } from "lucide-react";
import { Node, Connection } from "./types";

/* ── Types ── */

interface Path {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isEntry: boolean;
  destNodeId: string | null; // node ID at the end of this path segment
}

interface Particle {
  id: number;
  pathIdx: number;     // current path segment being traversed
  progress: number;    // 0→1 along current segment
  speed: number;
  status: "active" | "success" | "failed";
}

interface TrafficSimulatorProps {
  nodes: Node[];
  connections: Connection[];
  score: number;
  targetRPS: number;
  onComplete: () => void;
}

/* ── Phase config ── */

type Phase = "deploying" | "warmup" | "traffic" | "scaling" | "done";

const PHASE_LABELS: Record<Phase, string> = {
  deploying: "Provisioning infrastructure…",
  warmup: "Warming up services…",
  traffic: "Routing live traffic…",
  scaling: "Scaling under peak load…",
  done: "Analysis complete",
};

const TOTAL_DURATION_MS = 6000;

/* ── Component ── */

export default function TrafficSimulator({ nodes, connections, score, targetRPS, onComplete }: TrafficSimulatorProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [stats, setStats] = useState({ sent: 0, processed: 0, failed: 0 });
  const [phase, setPhase] = useState<Phase>("deploying");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeNodes, setActiveNodes] = useState<Set<string>>(new Set());

  const animRef = useRef<number>(0);
  const prevTimeRef = useRef(0);
  const pidRef = useRef(0);

  // Mutable refs so the animation loop always reads latest values
  const particlesRef = useRef<Particle[]>([]);
  const statsRef = useRef(stats);
  const phaseRef = useRef<Phase>("deploying");

  // Keep phaseRef in sync
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* ── Build paths: virtual entry paths + real connections ── */

  const { allPaths, entryPathIndices, outgoingByNode } = useMemo(() => {
    // Entry nodes = nodes with no incoming connection (or fallback to leftmost)
    const incomingSet = new Set(connections.map((c) => c.to));
    let entries = nodes.filter((n) => !incomingSet.has(n.id));
    if (entries.length === 0 && nodes.length > 0) {
      entries = [nodes.reduce((a, b) => (a.x < b.x ? a : b))];
    }

    const paths: Path[] = [];
    const entryIndices: number[] = [];

    // Virtual "Users → entry node" paths
    for (const n of entries) {
      entryIndices.push(paths.length);
      paths.push({
        fromX: 30,
        fromY: n.y,
        toX: n.x,
        toY: n.y,
        isEntry: true,
        destNodeId: n.id,
      });
    }

    // Real connection paths
    for (const c of connections) {
      const from = nodes.find((n) => n.id === c.from);
      const to = nodes.find((n) => n.id === c.to);
      if (!from || !to) continue;
      paths.push({
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        isEntry: false,
        destNodeId: to.id,
      });
    }

    // Build lookup: nodeId → indices of paths that START from that node
    const outgoing: Record<string, number[]> = {};
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (p.isEntry) continue; // entry paths start from "Users", not a node
      // Find which node is at the start of this connection path
      const fromNode = nodes.find(
        (n) => Math.abs(n.x - p.fromX) < 1 && Math.abs(n.y - p.fromY) < 1,
      );
      if (fromNode) {
        if (!outgoing[fromNode.id]) outgoing[fromNode.id] = [];
        outgoing[fromNode.id].push(i);
      }
    }

    return { allPaths: paths, entryPathIndices: entryIndices, outgoingByNode: outgoing };
  }, [nodes, connections]);

  /* ── Phase schedule ── */

  const stableOnComplete = useCallback(onComplete, [onComplete]);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("warmup"), 800),
      setTimeout(() => setPhase("traffic"), 2000),
      setTimeout(() => setPhase("scaling"), 4200),
      setTimeout(() => {
        setPhase("done");
        setTimeout(stableOnComplete, 800);
      }, TOTAL_DURATION_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [stableOnComplete]);

  /* ── Animation loop ── */

  useEffect(() => {
    if (phase === "deploying" || phase === "done" || allPaths.length === 0 || entryPathIndices.length === 0) return;

    const successRate = Math.min(score / 100, 1);

    // Spawn interval: faster spawn during scaling, influenced by targetRPS
    const baseInterval = Math.max(30, 200 - targetRPS * 0.01);

    let timeSinceSpawn = 0;

    const tick = (time: number) => {
      if (!prevTimeRef.current) prevTimeRef.current = time;
      const dt = Math.min(time - prevTimeRef.current, 50); // cap dt to avoid jumps
      prevTimeRef.current = time;

      const currentPhase = phaseRef.current;
      if (currentPhase === "done") return;

      const spawnMult = currentPhase === "warmup" ? 0.4 : currentPhase === "scaling" ? 2.0 : 1.0;
      const interval = baseInterval / spawnMult;

      // ── Spawn only on ENTRY paths ──
      timeSinceSpawn += dt;
      while (timeSinceSpawn >= interval) {
        timeSinceSpawn -= interval;
        const pathIdx = entryPathIndices[Math.floor(Math.random() * entryPathIndices.length)];
        const p: Particle = {
          id: pidRef.current++,
          pathIdx,
          progress: 0,
          speed: 0.0004 + Math.random() * 0.0008,
          status: "active",
        };
        particlesRef.current.push(p);
        statsRef.current = { ...statsRef.current, sent: statsRef.current.sent + 1 };
      }

      // ── Update ──
      const alive: Particle[] = [];
      const newStats = { ...statsRef.current };
      const active = new Set<string>();

      for (const p of particlesRef.current) {
        p.progress += p.speed * dt;

        // Particle reached end of current segment
        if (p.progress >= 1 && p.status === "active") {
          const currentPath = allPaths[p.pathIdx];
          const destNodeId = currentPath?.destNodeId;

          if (destNodeId) {
            // Check for outgoing connections from this node
            const nextPaths = outgoingByNode[destNodeId];
            if (nextPaths && nextPaths.length > 0) {
              // Chain to next segment: pick a random outgoing connection
              p.pathIdx = nextPaths[Math.floor(Math.random() * nextPaths.length)];
              p.progress = 0;
              p.speed = 0.0004 + Math.random() * 0.0008; // slight speed variation per hop
              continue; // don't terminate, keep moving
            }
          }

          // Terminal node — no outgoing connections; resolve success/fail
          if (Math.random() < successRate) {
            p.status = "success";
            newStats.processed++;
          } else {
            p.status = "failed";
            newStats.failed++;
          }
        }

        // Mid-path failure for low scores
        if (
          p.status === "active" &&
          p.progress > 0.3 &&
          p.progress < 0.9 &&
          Math.random() < 0.0008 * (1 - successRate)
        ) {
          p.status = "failed";
          newStats.failed++;
        }

        // Track which nodes are receiving traffic
        if (p.status === "active") {
          const path = allPaths[p.pathIdx];
          if (path) {
            // Find nodes near current position
            const cx = path.fromX + (path.toX - path.fromX) * p.progress;
            const cy = path.fromY + (path.toY - path.fromY) * p.progress;
            for (const n of nodes) {
              if (Math.abs(n.x - cx) < 40 && Math.abs(n.y - cy) < 40) {
                active.add(n.id);
              }
            }
          }
        }

        // Keep until faded
        if (p.progress < 1.5) {
          alive.push(p);
        }
      }

      particlesRef.current = alive;
      statsRef.current = newStats;

      setParticles([...alive]);
      setStats({ ...newStats });
      setActiveNodes(active);
      setElapsedMs((prev) => prev + dt);

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animRef.current);
      prevTimeRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, allPaths.length]);

  /* ── Derived ── */

  const uptimePct =
    stats.sent > 0 ? Math.round((stats.processed / Math.max(stats.processed + stats.failed, 1)) * 100) : 100;

  /* ── Render ── */

  return (
    <div className='absolute inset-0 z-30 pointer-events-none'>
      {/* ── Particle layer (SVG) ── */}
      <svg className='absolute inset-0 w-full h-full' style={{ filter: "url(#glow)" }}>
        <defs>
          <filter id='glow'>
            <feGaussianBlur stdDeviation='2' result='blur' />
            <feMerge>
              <feMergeNode in='blur' />
              <feMergeNode in='SourceGraphic' />
            </feMerge>
          </filter>
        </defs>

        {/* Virtual entry lines */}
        {phase !== "deploying" &&
          allPaths
            .filter((p) => p.isEntry)
            .map((p, i) => (
              <line
                key={`entry-${i}`}
                x1={p.fromX}
                y1={p.fromY}
                x2={p.toX}
                y2={p.toY}
                stroke='#f97316'
                strokeWidth='1'
                strokeDasharray='6,6'
                opacity={0.25}
              />
            ))}

        {/* Particles */}
        {particles.map((p) => {
          const path = allPaths[p.pathIdx];
          if (!path) return null;

          const t = Math.min(p.progress, 1);
          const x = path.fromX + (path.toX - path.fromX) * t;
          const y = path.fromY + (path.toY - path.fromY) * t;

          const color = p.status === "failed" ? "#ef4444" : p.status === "success" ? "#22c55e" : "#f97316";
          const opacity = p.status !== "active" ? Math.max(0, 1 - (p.progress - 1) * 4) : 0.9;
          const r = p.status === "failed" ? 3 : 4;

          return (
            <g key={p.id}>
              {/* Glow ring */}
              {p.status === "active" && <circle cx={x} cy={y} r={r + 5} fill={color} opacity={0.12} />}
              {/* Core dot */}
              <circle cx={x} cy={y} r={r} fill={color} opacity={opacity} />
              {/* Failure burst */}
              {p.status === "failed" && p.progress <= 1.1 && (
                <>
                  <circle cx={x} cy={y} r={8} fill='none' stroke='#ef4444' strokeWidth='1' opacity={0.5}>
                    <animate attributeName='r' from='4' to='14' dur='0.4s' fill='freeze' />
                    <animate attributeName='opacity' from='0.6' to='0' dur='0.4s' fill='freeze' />
                  </circle>
                </>
              )}
            </g>
          );
        })}

        {/* Users source indicator */}
        {phase !== "deploying" && (
          <g>
            <rect
              x='8'
              y={nodes.length > 0 ? Math.min(...nodes.map((n) => n.y)) - 30 : 100}
              width='44'
              height='24'
              rx='6'
              fill='#1e293b'
              stroke='#f97316'
              strokeWidth='1'
              opacity='0.8'
            />
            <text
              x='30'
              y={(nodes.length > 0 ? Math.min(...nodes.map((n) => n.y)) - 30 : 100) + 16}
              textAnchor='middle'
              fill='#f97316'
              fontSize='9'
              fontWeight='bold'
            >
              Users
            </text>
          </g>
        )}
      </svg>

      {/* ── Node glow effects ── */}
      {nodes.map((node) => {
        const isActive = activeNodes.has(node.id);
        const showGlow = phase === "deploying" || isActive;
        if (!showGlow) return null;

        return (
          <div
            key={`glow-${node.id}`}
            className='absolute -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-all duration-300'
            style={{
              left: node.x,
              top: node.y,
              width: isActive ? 90 : 70,
              height: isActive ? 90 : 70,
              background: `radial-gradient(circle, ${
                phase === "deploying"
                  ? "rgba(249,115,22,0.25)"
                  : isActive
                    ? "rgba(249,115,22,0.35)"
                    : "rgba(34,197,94,0.15)"
              } 0%, transparent 70%)`,
              animation: phase === "deploying" ? "pulse 1.5s ease-in-out infinite" : undefined,
            }}
          />
        );
      })}

      {/* ── Live Traffic Dashboard ── */}
      <div className='absolute top-20 left-1/2 -translate-x-1/2 pointer-events-auto'>
        <div className='bg-slate-900/95 backdrop-blur-md rounded-2xl border border-orange-500/30 shadow-2xl shadow-orange-500/10 px-6 py-4 flex items-center gap-6'>
          {/* Phase indicator */}
          <div className='flex items-center gap-3 pr-5 border-r border-slate-700'>
            <div className={phase !== "done" ? "animate-spin" : ""} style={{ animationDuration: "2s" }}>
              <Activity size={18} className='text-orange-500' />
            </div>
            <div>
              <div className='text-[10px] text-slate-500 uppercase font-bold tracking-widest'>Status</div>
              <div className='text-xs font-bold text-orange-400'>{PHASE_LABELS[phase]}</div>
            </div>
          </div>

          {/* Stats counters */}
          <div className='flex gap-5'>
            <div className='text-center'>
              <div className='text-[10px] text-slate-500 uppercase font-bold tracking-widest'>Sent</div>
              <div className='text-base font-black text-orange-400 tabular-nums'>{stats.sent.toLocaleString()}</div>
            </div>
            <div className='text-center'>
              <div className='text-[10px] text-slate-500 uppercase font-bold tracking-widest'>Processed</div>
              <div className='text-base font-black text-green-400 tabular-nums'>{stats.processed.toLocaleString()}</div>
            </div>
            <div className='text-center'>
              <div className='text-[10px] text-slate-500 uppercase font-bold tracking-widest'>Failed</div>
              <div className='text-base font-black text-red-400 tabular-nums'>{stats.failed.toLocaleString()}</div>
            </div>
            <div className='text-center'>
              <div className='text-[10px] text-slate-500 uppercase font-bold tracking-widest'>Uptime</div>
              <div
                className={`text-base font-black tabular-nums ${uptimePct >= 90 ? "text-green-400" : uptimePct >= 70 ? "text-yellow-400" : "text-red-400"}`}
              >
                {uptimePct}%
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className='pl-5 border-l border-slate-700 w-28'>
            <div className='text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1'>Progress</div>
            <div className='w-full bg-slate-700 h-1.5 rounded-full overflow-hidden'>
              <div
                className='h-full bg-gradient-to-r from-orange-500 to-green-500 transition-all duration-300'
                style={{ width: `${Math.min(100, (elapsedMs / TOTAL_DURATION_MS) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
