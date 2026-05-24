import { WebSocketServer, WebSocket } from 'ws'

const PORT = parseInt(process.env.GAME_WS_PORT ?? '8080')
const TICK_MS = 50     // 20 fps
const SPEED = 0.08
const ROT_SPEED = 0.03
const BOUNDS = 95
// max distance a player can travel in one tick — used to detect speed hacks
const MAX_SPEED_PER_TICK = SPEED * 1.5

type Keys = { w: boolean; s: boolean; a: boolean; d: boolean }

type Player = {
  id: string
  x: number
  z: number
  angle: number
  keys: Keys
  ws: WebSocket
  lastX: number
  lastZ: number
}

const players = new Map<WebSocket, Player>()

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function broadcast(msg: string, exclude?: WebSocket) {
  for (const p of players.values()) {
    if (p.ws !== exclude && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg)
    }
  }
}

// Server-authoritative game loop
setInterval(() => {
  for (const p of players.values()) {
    p.lastX = p.x
    p.lastZ = p.z

    if (p.keys.a) p.angle += ROT_SPEED
    if (p.keys.d) p.angle -= ROT_SPEED
    if (p.keys.w) {
      p.x -= Math.sin(p.angle) * SPEED
      p.z -= Math.cos(p.angle) * SPEED
    }
    if (p.keys.s) {
      p.x += Math.sin(p.angle) * SPEED
      p.z += Math.cos(p.angle) * SPEED
    }

    p.x = Math.max(-BOUNDS, Math.min(BOUNDS, p.x))
    p.z = Math.max(-BOUNDS, Math.min(BOUNDS, p.z))
  }

  if (players.size === 0) return

  const state = Array.from(players.values()).map(p => ({
    id: p.id,
    x: p.x,
    z: p.z,
    angle: p.angle,
  }))

  const msg = JSON.stringify({ type: 'state', players: state })
  for (const p of players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg)
  }
}, TICK_MS)

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  const id = genId()
  const player: Player = {
    id,
    x: (Math.random() - 0.5) * 10,  // spawn near center with slight spread
    z: (Math.random() - 0.5) * 10,
    angle: 0,
    keys: { w: false, s: false, a: false, d: false },
    lastX: 0,
    lastZ: 0,
    ws,
  }
  players.set(ws, player)

  ws.send(JSON.stringify({ type: 'init', id }))
  console.log(`[+] Player ${id} connected (${players.size} total)`)

  ws.on('message', (data) => {
    let msg: unknown
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (typeof msg !== 'object' || msg === null) return

    const { type } = msg as Record<string, unknown>

    if (type === 'keys') {
      // Only accept boolean key states — ignore anything else in the payload
      const p = players.get(ws)
      if (!p) return
      const { w, s, a, d } = msg as Record<string, unknown>
      p.keys.w = w === true
      p.keys.s = s === true
      p.keys.a = a === true
      p.keys.d = d === true
    }
  })

  ws.on('close', () => {
    const p = players.get(ws)
    if (!p) return
    players.delete(ws)
    console.log(`[-] Player ${p.id} disconnected (${players.size} total)`)
    broadcast(JSON.stringify({ type: 'leave', id: p.id }))
  })

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${id}:`, err.message)
  })
})

wss.on('listening', () => {
  console.log(`Game server listening on ws://localhost:${PORT}`)
})
