'use client'

import { useEffect, useRef } from 'react'
import type { Object3D, BufferGeometry, Material } from 'three'

const WS_URL = process.env.NEXT_PUBLIC_GAME_WS_URL ?? 'ws://localhost:8080'

export default function GameWorldPage() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let rafId = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any = null
    let disposed = false

    const init = async () => {
      const THREE = await import('three')
      if (disposed) return

      const ac = new AbortController()
      const sig = ac.signal

      // ── Scene ──────────────────────────────────────────────
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x87ceeb)
      scene.fog = new THREE.Fog(0x87ceeb, 40, 120)

      // ── Renderer ───────────────────────────────────────────
      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      mount.appendChild(renderer.domElement)

      // ── Camera ─────────────────────────────────────────────
      const camera = new THREE.PerspectiveCamera(
        60,
        mount.clientWidth / mount.clientHeight,
        0.1,
        200
      )

      // ── Lights ─────────────────────────────────────────────
      scene.add(new THREE.AmbientLight(0xffffff, 0.55))

      const sun = new THREE.DirectionalLight(0xfff5e0, 1.1)
      sun.position.set(20, 40, 20)
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.camera.left = -60
      sun.shadow.camera.right = 60
      sun.shadow.camera.top = 60
      sun.shadow.camera.bottom = -60
      sun.shadow.camera.far = 200
      scene.add(sun)

      // ── Ground ─────────────────────────────────────────────
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshLambertMaterial({ color: 0x5a8a40 })
      )
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)

      const grid = new THREE.GridHelper(200, 40, 0x3a6a28, 0x4a7a38)
      grid.position.y = 0.01
      scene.add(grid)

      // ── Trees ──────────────────────────────────────────────
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4226 })
      const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 })
      const rng = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

      for (let i = 0; i < 35; i++) {
        const x = rng(-90, 90)
        const z = rng(-90, 90)
        if (Math.abs(x) < 6 && Math.abs(z) < 6) continue

        const h = rng(1.5, 3.5)
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.3), trunkMat)
        trunk.position.set(x, h / 2, z)
        trunk.castShadow = true
        trunk.receiveShadow = true
        scene.add(trunk)

        const cs = rng(1.2, 2.2)
        const crown = new THREE.Mesh(new THREE.BoxGeometry(cs, cs * 1.3, cs), crownMat)
        crown.position.set(x, h + cs * 0.5, z)
        crown.castShadow = true
        scene.add(crown)
      }

      // ── Player mesh builder ────────────────────────────────
      const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
      const addTo = (parent: Object3D, geo: BufferGeometry, mat: Material, y: number) => {
        const m = new THREE.Mesh(geo, mat)
        m.position.y = y
        m.castShadow = true
        parent.add(m)
        return m
      }

      const buildPlayer = (shirtColor: number) => {
        const group = new THREE.Group()
        const mSkin  = new THREE.MeshLambertMaterial({ color: 0xf4c895 })
        const mShirt = new THREE.MeshLambertMaterial({ color: shirtColor })
        const mPants = new THREE.MeshLambertMaterial({ color: 0x263238 })
        const mShoe  = new THREE.MeshLambertMaterial({ color: 0x121212 })
        const mHair  = new THREE.MeshLambertMaterial({ color: 0x3e2723 })

        addTo(group, box(0.42, 0.42, 0.38), mSkin,  1.85)
        addTo(group, box(0.46, 0.12, 0.42), mHair,  2.06)
        addTo(group, box(0.65, 0.70, 0.32), mShirt, 1.25)

        const leftArm = new THREE.Group()
        leftArm.position.set(-0.44, 1.55, 0)
        addTo(leftArm, box(0.22, 0.40, 0.22), mShirt, -0.20)
        addTo(leftArm, box(0.18, 0.36, 0.18), mSkin,  -0.58)
        group.add(leftArm)

        const rightArm = new THREE.Group()
        rightArm.position.set(0.44, 1.55, 0)
        addTo(rightArm, box(0.22, 0.40, 0.22), mShirt, -0.20)
        addTo(rightArm, box(0.18, 0.36, 0.18), mSkin,  -0.58)
        group.add(rightArm)

        const leftLeg = new THREE.Group()
        leftLeg.position.set(-0.19, 0.9, 0)
        addTo(leftLeg, box(0.27, 0.44, 0.27), mPants, -0.22)
        addTo(leftLeg, box(0.23, 0.44, 0.23), mPants, -0.60)
        addTo(leftLeg, box(0.25, 0.10, 0.38), mShoe,  -0.87)
        group.add(leftLeg)

        const rightLeg = new THREE.Group()
        rightLeg.position.set(0.19, 0.9, 0)
        addTo(rightLeg, box(0.27, 0.44, 0.27), mPants, -0.22)
        addTo(rightLeg, box(0.23, 0.44, 0.23), mPants, -0.60)
        addTo(rightLeg, box(0.25, 0.10, 0.38), mShoe,  -0.87)
        group.add(rightLeg)

        return { group, leftArm, rightArm, leftLeg, rightLeg }
      }

      // ── Local player ───────────────────────────────────────
      const { group: player, leftArm, rightArm, leftLeg, rightLeg } = buildPlayer(0x1565c0)
      scene.add(player)

      // ── Input ──────────────────────────────────────────────
      const keys: Record<string, boolean> = {}
      window.addEventListener('keydown', (e) => { keys[e.code] = true },  { signal: sig })
      window.addEventListener('keyup',   (e) => { keys[e.code] = false }, { signal: sig })

      // Mouse orbit
      let isDragging = false
      let lastX = 0, lastY = 0
      let playerAngle = 0
      let camPitch = 0.38
      let camDist  = 6.5
      const camTarget = new THREE.Vector3(0, 1.2, 0)

      renderer.domElement.addEventListener('mousedown', (e: MouseEvent) => {
        isDragging = true; lastX = e.clientX; lastY = e.clientY
      }, { signal: sig })
      window.addEventListener('mouseup', () => { isDragging = false }, { signal: sig })
      window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return
        playerAngle -= (e.clientX - lastX) * 0.005
        camPitch = Math.max(0.05, Math.min(1.3, camPitch + (e.clientY - lastY) * 0.005))
        lastX = e.clientX; lastY = e.clientY
      }, { signal: sig })
      renderer.domElement.addEventListener('wheel', (e: WheelEvent) => {
        camDist = Math.max(2, Math.min(14, camDist + e.deltaY * 0.01))
      }, { signal: sig })
      renderer.domElement.addEventListener('contextmenu', (e: Event) => e.preventDefault(), { signal: sig })

      // ── Touch support ──────────────────────────────────────
      let lastTouchX = 0, lastTouchY = 0, isTouching = false
      renderer.domElement.addEventListener('touchstart', (e: TouchEvent) => {
        isTouching = true
        lastTouchX = e.touches[0].clientX
        lastTouchY = e.touches[0].clientY
      }, { signal: sig })
      renderer.domElement.addEventListener('touchend', () => { isTouching = false }, { signal: sig })
      renderer.domElement.addEventListener('touchmove', (e: TouchEvent) => {
        if (!isTouching) return
        e.preventDefault()
        playerAngle -= (e.touches[0].clientX - lastTouchX) * 0.005
        camPitch = Math.max(0.05, Math.min(1.3, camPitch + (e.touches[0].clientY - lastTouchY) * 0.005))
        lastTouchX = e.touches[0].clientX
        lastTouchY = e.touches[0].clientY
      }, { signal: sig, passive: false })

      // ── Resize ─────────────────────────────────────────────
      window.addEventListener('resize', () => {
        camera.aspect = mount.clientWidth / mount.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(mount.clientWidth, mount.clientHeight)
      }, { signal: sig })

      // ── WebSocket multiplayer ──────────────────────────────
      type RemotePlayer = {
        group: THREE.Group
        targetX: number
        targetZ: number
        targetAngle: number
        walkTime: number
        leftArm: THREE.Group
        rightArm: THREE.Group
        leftLeg: THREE.Group
        rightLeg: THREE.Group
      }

      const remotePlayers = new Map<string, RemotePlayer>()
      let myId: string | null = null

      // Server position for local player — used to correct client prediction drift
      let serverX = 0, serverZ = 0, serverAngle = 0

      const shirtColorFromId = (id: string) => {
        let h = 5381
        for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x9e3779b9)
        const hue = ((Math.abs(h) % 300) + 270) % 360
        return new THREE.Color().setHSL(hue / 360, 0.85, 0.45).getHex()
      }

      let ws: WebSocket | null = null
      let connected = false

      const connect = () => {
        ws = new WebSocket(WS_URL)

        ws.addEventListener('open', () => {
          connected = true
        })

        ws.addEventListener('message', (event) => {
          let msg: Record<string, unknown>
          try { msg = JSON.parse(event.data as string) } catch { return }

          if (msg.type === 'init') {
            myId = msg.id as string
            return
          }

          if (msg.type === 'state') {
            const incoming = msg.players as Array<{ id: string; x: number; z: number; angle: number }>
            const activeIds = new Set<string>()

            for (const p of incoming) {
              activeIds.add(p.id)

              if (p.id === myId) {
                // Store server-authoritative position for local player
                serverX = p.x
                serverZ = p.z
                serverAngle = p.angle
                continue
              }

              if (!remotePlayers.has(p.id)) {
                const color = shirtColorFromId(p.id)
                const built = buildPlayer(color)
                built.group.position.set(p.x, 0, p.z)
                built.group.rotation.y = p.angle
                scene.add(built.group)
                remotePlayers.set(p.id, {
                  group: built.group,
                  targetX: p.x,
                  targetZ: p.z,
                  targetAngle: p.angle,
                  walkTime: 0,
                  leftArm: built.leftArm,
                  rightArm: built.rightArm,
                  leftLeg: built.leftLeg,
                  rightLeg: built.rightLeg,
                })
              } else {
                const rp = remotePlayers.get(p.id)!
                rp.targetX = p.x
                rp.targetZ = p.z
                rp.targetAngle = p.angle
              }
            }

            // Remove players that left between state broadcasts
            for (const [id, rp] of remotePlayers) {
              if (!activeIds.has(id)) {
                scene.remove(rp.group)
                remotePlayers.delete(id)
              }
            }
            return
          }

          if (msg.type === 'leave') {
            const rp = remotePlayers.get(msg.id as string)
            if (rp) {
              scene.remove(rp.group)
              remotePlayers.delete(msg.id as string)
            }
          }
        })

        ws.addEventListener('close', () => {
          connected = false
          ws = null
          // Reconnect after 2 s if not unmounted
          if (!disposed) setTimeout(connect, 2000)
        })

        ws.addEventListener('error', () => {
          // error fires before close; let the close handler retry
        })
      }

      connect()
      sig.addEventListener('abort', () => { ws?.close() })

      // ── Loop ───────────────────────────────────────────────
      let walkTime = 0
      let prevKeys = { w: false, s: false, a: false, d: false }

      const loop = () => {
        if (disposed) return
        rafId = requestAnimationFrame(loop)

        const speed = 0.08
        const rotSpeed = 0.03
        let moving = false

        const w = !!(keys['KeyW'] || keys['ArrowUp'])
        const s = !!(keys['KeyS'] || keys['ArrowDown'])
        const a = !!(keys['KeyA'] || keys['ArrowLeft'])
        const d = !!(keys['KeyD'] || keys['ArrowRight'])

        // Client-side prediction — keeps local movement responsive
        if (a) playerAngle += rotSpeed
        if (d) playerAngle -= rotSpeed
        if (w) {
          player.position.x -= Math.sin(playerAngle) * speed
          player.position.z -= Math.cos(playerAngle) * speed
          moving = true
        }
        if (s) {
          player.position.x += Math.sin(playerAngle) * speed
          player.position.z += Math.cos(playerAngle) * speed
          moving = true
        }

        player.rotation.y = playerAngle

        // Gently correct local player toward server position to prevent drift
        if (myId) {
          player.position.x += (serverX - player.position.x) * 0.05
          player.position.z += (serverZ - player.position.z) * 0.05
        }

        // Send key state to server only when it changes
        if (connected && ws && (w !== prevKeys.w || s !== prevKeys.s || a !== prevKeys.a || d !== prevKeys.d)) {
          ws.send(JSON.stringify({ type: 'keys', w, s, a, d }))
          prevKeys = { w, s, a, d }
        }

        // Local walk animation
        if (moving) {
          walkTime += 0.16
          const sv = Math.sin(walkTime) * 0.65
          leftArm.rotation.x  =  sv;  rightArm.rotation.x = -sv
          leftLeg.rotation.x  = -sv;  rightLeg.rotation.x =  sv
        } else {
          leftArm.rotation.x  *= 0.82;  rightArm.rotation.x *= 0.82
          leftLeg.rotation.x  *= 0.82;  rightLeg.rotation.x *= 0.82
        }

        // Update remote players
        for (const rp of remotePlayers.values()) {
          const dx = rp.targetX - rp.group.position.x
          const dz = rp.targetZ - rp.group.position.z
          const isMoving = Math.abs(dx) > 0.002 || Math.abs(dz) > 0.002

          rp.group.position.x += dx * 0.2
          rp.group.position.z += dz * 0.2
          rp.group.rotation.y = rp.targetAngle

          if (isMoving) {
            rp.walkTime += 0.16
            const sv = Math.sin(rp.walkTime) * 0.65
            rp.leftArm.rotation.x  =  sv;  rp.rightArm.rotation.x = -sv
            rp.leftLeg.rotation.x  = -sv;  rp.rightLeg.rotation.x =  sv
          } else {
            rp.leftArm.rotation.x  *= 0.82;  rp.rightArm.rotation.x *= 0.82
            rp.leftLeg.rotation.x  *= 0.82;  rp.rightLeg.rotation.x *= 0.82
          }
        }

        // Third-person camera orbit behind player
        const px = player.position.x
        const py = player.position.y
        const pz = player.position.z
        const cosP = Math.cos(camPitch)
        camera.position.set(
          px + Math.sin(playerAngle) * camDist * cosP,
          py + Math.sin(camPitch) * camDist + 0.8,
          pz + Math.cos(playerAngle) * camDist * cosP
        )
        camTarget.lerp(new THREE.Vector3(px, py + 1.2, pz), 0.12)
        camera.lookAt(camTarget)

        renderer.render(scene, camera)
      }

      loop()

      sig.addEventListener('abort', () => {
        cancelAnimationFrame(rafId)
        renderer.dispose()
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      })

      ;(init as unknown as { _ac: AbortController })._ac = ac
    }

    init()

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ac = (init as any)._ac as AbortController | undefined
      ac?.abort()
      renderer?.dispose()
      const el = renderer?.domElement
      if (el && mount.contains(el)) mount.removeChild(el)
    }
  }, [])

  return (
    <div className='relative w-full flex-1 overflow-hidden bg-black'>
      <div
        className='pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs text-white'
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      >
        WASD / ↑↓←→ &nbsp;·&nbsp; Drag to orbit &nbsp;·&nbsp; Scroll to zoom
      </div>
      <div ref={mountRef} className='h-full w-full' />
    </div>
  )
}
