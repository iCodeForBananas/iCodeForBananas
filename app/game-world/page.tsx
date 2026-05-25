'use client'

import { useEffect, useRef, useState } from 'react'
import type * as THREE from 'three'
import type { Object3D, BufferGeometry, Material } from 'three'

const WS_URL = process.env.NEXT_PUBLIC_GAME_WS_URL ?? 'ws://localhost:8080'

export default function GameWorldPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const staminaBarRef = useRef<HTMLDivElement>(null)
  const activeSlotRef = useRef(0)
  const [activeSlot, setActiveSlot] = useState(0)
  const mouseDownRef = useRef(false)

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
        if (x > 4 && x < 40 && z > -8 && z < 8) continue  // street + building footprint

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

      // ── Street ─────────────────────────────────────────────
      const stRoadMat  = new THREE.MeshLambertMaterial({ color: 0x333344 })
      const stCurbMat  = new THREE.MeshLambertMaterial({ color: 0x888899 })

      const stRoad = new THREE.Mesh(new THREE.PlaneGeometry(30, 80), stRoadMat)
      stRoad.rotation.x = -Math.PI / 2
      stRoad.position.set(14, 0.005, 0)
      stRoad.receiveShadow = true
      scene.add(stRoad)

      const stStripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.25, 80),
        new THREE.MeshLambertMaterial({ color: 0xffdd00 })
      )
      stStripe.rotation.x = -Math.PI / 2
      stStripe.position.set(14, 0.01, 0)
      scene.add(stStripe)

      for (const sz of [-5, 5]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(30, 0.12, 0.3), stCurbMat)
        curb.position.set(14, 0.06, sz)
        scene.add(curb)
      }

      const stSidewalk = new THREE.Mesh(new THREE.PlaneGeometry(6, 80), stCurbMat)
      stSidewalk.rotation.x = -Math.PI / 2
      stSidewalk.position.set(22, 0.06, 0)
      stSidewalk.receiveShadow = true
      scene.add(stSidewalk)

      // ── Building (x=[24,36], z=[-5,5], 5 floors × 3 units) ───
      const bldConcrete = new THREE.MeshLambertMaterial({ color: 0x8a8a9a })
      const bldGlass    = new THREE.MeshLambertMaterial({ color: 0x1a3a5a })
      const bldSlab     = new THREE.MeshLambertMaterial({ color: 0x6a6a7a })
      const wallBoxes: THREE.Box3[] = []

      const bldWall = (cx: number, cy: number, cz: number, w: number, h: number, d: number, col = true) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bldConcrete)
        m.position.set(cx, cy, cz)
        m.castShadow = true
        m.receiveShadow = true
        scene.add(m)
        if (col) wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
          new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)
        ))
      }

      // Exterior walls (full 15-unit height)
      bldWall(36,   7.5,  0,    0.3, 15, 10.3)   // east
      bldWall(30,   7.5, -5,   12.3, 15,  0.3)   // north
      bldWall(30,   7.5,  5,   12.3, 15,  0.3)   // south
      bldWall(24,   7.5, -2.85, 0.3, 15,  4.3)   // west-left
      bldWall(24,   7.5,  2.85, 0.3, 15,  4.3)   // west-right
      bldWall(24,   8.7,  0,    0.3, 12.6, 1.4)  // door arch

      // Roof
      const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 10), bldConcrete)
      roofMesh.position.set(30, 15.15, 0)
      roofMesh.castShadow = true
      scene.add(roofMesh)

      // Interior floor slabs (floors 2–5)
      for (let f = 1; f <= 4; f++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.15, 9.4), bldSlab)
        slab.position.set(30, f * 3, 0)
        slab.receiveShadow = true
        scene.add(slab)
      }

      // Ground-floor interior surface
      const intFloor = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 9.4), bldSlab)
      intFloor.rotation.x = -Math.PI / 2
      intFloor.position.set(30, 0.01, 0)
      scene.add(intFloor)

      // Interior room divider at x=30, gap at z=[-0.7, 0.7]
      bldWall(30, 1.5, -2.85, 0.2, 3, 4.3)
      bldWall(30, 1.5,  2.85, 0.2, 3, 4.3)

      // Staircase ramp (visual, NE corner)
      const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 3.5), bldSlab)
      rampMesh.rotation.x = -Math.PI / 6
      rampMesh.position.set(33.5, 1.1, -3.6)
      rampMesh.castShadow = true
      scene.add(rampMesh)

      // Windows — 5 floors × 4 faces
      for (let f = 0; f < 5; f++) {
        const wy = f * 3 + 1.8
        for (const wx of [26, 29, 32, 35]) {
          const wN = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), bldGlass)
          wN.position.set(wx, wy, -4.88)
          scene.add(wN)
          const wS = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), bldGlass)
          wS.rotation.y = Math.PI
          wS.position.set(wx, wy, 4.88)
          scene.add(wS)
        }
        for (const wz of [-3, 0, 3]) {
          const wE = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), bldGlass)
          wE.rotation.y = -Math.PI / 2
          wE.position.set(35.88, wy, wz)
          scene.add(wE)
        }
        if (f > 0) {
          for (const wz of [-3, 3]) {
            const wW = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), bldGlass)
            wW.rotation.y = Math.PI / 2
            wW.position.set(24.12, wy, wz)
            scene.add(wW)
          }
        }
      }

      // ── Door ──────────────────────────────────────────────
      let doorOpen = false
      const doorWallBox = new THREE.Box3(
        new THREE.Vector3(23.85, 0, -0.7),
        new THREE.Vector3(24.15, 2.4, 0.7)
      )
      wallBoxes.push(doorWallBox)

      const doorPivot = new THREE.Group()
      doorPivot.position.set(24.05, 0, -0.7)
      scene.add(doorPivot)

      const doorPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 2.4, 1.4),
        new THREE.MeshLambertMaterial({ color: 0x6b3a1f })
      )
      doorPanel.position.set(0, 1.2, 0.7)
      doorPivot.add(doorPanel)

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

      // ── Weapons ─────────────────────────────────────────────

      // Lightsaber (toggle with 1, cycles colors)
      let saberOn = false
      let saberColorIdx = 0
      const saberHues = [0x00ff88, 0xff2244, 0x4488ff, 0xffbb00]
      const saberMat     = new THREE.MeshBasicMaterial({ color: saberHues[0] })
      const saberGlowMat = new THREE.MeshBasicMaterial({ color: saberHues[0], transparent: true, opacity: 0.35 })
      const saberBlade = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8), saberMat)
      const saberGlowM = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8), saberGlowMat)
      saberBlade.rotation.x = Math.PI / 2;  saberGlowM.rotation.x = Math.PI / 2
      saberBlade.position.z = -0.65;        saberGlowM.position.z  = -0.65
      const saberGroup = new THREE.Group()
      saberGroup.position.set(0, -0.76, 0)
      saberGroup.add(saberBlade, saberGlowM)
      saberGroup.visible = false
      rightArm.add(saberGroup)

      // Flamethrower (hold F)
      type FlamePart = { mesh: THREE.Mesh; vel: THREE.Vector3; age: number; max: number }
      const flames: FlamePart[] = []

      // Lightning (hold L)
      const mkLightGeo = (len: number) => {
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 10; i++) {
          const t = i / 10
          const s = t < 1 ? Math.sin(t * Math.PI) * 0.3 : 0
          pts.push(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, -t * len))
        }
        return new THREE.BufferGeometry().setFromPoints(pts)
      }
      const ltMat = new THREE.LineBasicMaterial({ color: 0xaabbff })
      const boltL = new THREE.Line(mkLightGeo(7), ltMat.clone())
      const boltR = new THREE.Line(mkLightGeo(7), ltMat.clone())
      boltL.position.set(0, -0.76, 0);  boltR.position.set(0, -0.76, 0)
      boltL.visible = false;             boltR.visible = false
      leftArm.add(boltL);                rightArm.add(boltR)

      // Gravity gun (G to grab/throw) — alien lab devices scattered around the world
      type Grabbable = {
        group: THREE.Group
        mesh: THREE.Mesh
        vel: THREE.Vector3
        grounded: boolean
        halfH: number
        arcs: THREE.LineSegments[]
        glowOrb: THREE.Mesh
        arcTimer: number
        makeArcGeo: () => THREE.BufferGeometry
      }

      const buildAlienDevice = () => {
        const g = new THREE.Group()

        const bodyMat = new THREE.MeshStandardMaterial({
          color: 0x0a0a0a, emissive: 0x00ff44, emissiveIntensity: 0.5,
          metalness: 0.95, roughness: 0.15,
        })
        const coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), bodyMat)
        coreMesh.castShadow = true
        g.add(coreMesh)

        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 8, 28), bodyMat.clone())
        ring1.rotation.x = Math.PI / 2
        g.add(ring1)

        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 8, 28), bodyMat.clone())
        ring2.rotation.z = Math.PI / 3
        g.add(ring2)

        const glowMat = new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.7 })
        const glowOrb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), glowMat)
        g.add(glowOrb)

        const arcMat = new THREE.LineBasicMaterial({ color: 0x00ff44 })
        const makeArcGeo = () => {
          const pts: THREE.Vector3[] = []
          const origin = new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2)
          for (let s = 0; s <= 6; s++) {
            pts.push(new THREE.Vector3(
              origin.x + (Math.random() - 0.5) * 0.55,
              origin.y + (Math.random() - 0.5) * 0.55,
              origin.z + (Math.random() - 0.5) * 0.55,
            ))
          }
          return new THREE.BufferGeometry().setFromPoints(pts)
        }

        const arcs: THREE.LineSegments[] = []
        for (let a = 0; a < 3; a++) {
          const arc = new THREE.LineSegments(makeArcGeo(), arcMat.clone())
          g.add(arc)
          arcs.push(arc)
        }

        return { group: g, coreMesh, glowOrb, arcs, makeArcGeo }
      }

      const grabPool: Grabbable[] = []
      for (let i = 0; i < 12; i++) {
        const { group, coreMesh, glowOrb, arcs, makeArcGeo } = buildAlienDevice()
        const px = rng(-55, 55), pz = rng(-55, 55)
        group.position.set(px, 0.32, pz)
        scene.add(group)
        grabPool.push({
          group,
          mesh: coreMesh,
          vel: new THREE.Vector3(),
          grounded: true,
          halfH: 0.32,
          arcs,
          glowOrb,
          arcTimer: 0,
          makeArcGeo,
        })
      }
      let heldObj: Grabbable | null = null
      let gWas = false

      // ── Input ──────────────────────────────────────────────
      const keys: Record<string, boolean> = {}
      window.addEventListener('keydown', (e) => {
        keys[e.code] = true
        if (e.code === 'Digit1') { activeSlotRef.current = 0; setActiveSlot(0) }
        if (e.code === 'Digit2') { activeSlotRef.current = 1; setActiveSlot(1) }
        if (e.code === 'Digit3') { activeSlotRef.current = 2; setActiveSlot(2) }
        if (e.code === 'Digit4') { activeSlotRef.current = 3; setActiveSlot(3) }
        if (e.code === 'KeyE') {
          if (player.position.distanceTo(new THREE.Vector3(24, 0, 0)) < 5) doorOpen = !doorOpen
        }
        if (e.code === 'Digit1') {
          saberOn = !saberOn
          saberGroup.visible = saberOn
          if (saberOn) {
            saberColorIdx = (saberColorIdx + 1) % saberHues.length
            saberMat.color.setHex(saberHues[saberColorIdx])
            saberGlowMat.color.setHex(saberHues[saberColorIdx])
          }
        }
      }, { signal: sig })
      window.addEventListener('keyup',   (e) => { keys[e.code] = false }, { signal: sig })

      // Mouse orbit
      let isDragging = false
      let lastY = 0
      let playerAngle = 0
      let camPitch = 0.38
      let camDist  = 6.5
      const camTarget = new THREE.Vector3(0, 1.2, 0)
      const raycaster = new THREE.Raycaster()
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const mouseNDC = new THREE.Vector2(0, 0)
      const mouseWorld = new THREE.Vector3()

      renderer.domElement.addEventListener('mousedown', (e: MouseEvent) => {
        isDragging = true; lastY = e.clientY
        mouseDownRef.current = true
      }, { signal: sig })
      window.addEventListener('mouseup', () => { isDragging = false; mouseDownRef.current = false }, { signal: sig })
      window.addEventListener('mousemove', (e: MouseEvent) => {
        mouseNDC.x = (e.clientX / mount.clientWidth) * 2 - 1
        mouseNDC.y = -(e.clientY / mount.clientHeight) * 2 + 1
        if (isDragging) {
          camPitch = Math.max(0.05, Math.min(1.3, camPitch + (e.clientY - lastY) * 0.005))
          lastY = e.clientY
        }
      }, { signal: sig })
      renderer.domElement.addEventListener('wheel', (e: WheelEvent) => {
        camDist = Math.max(2, Math.min(14, camDist + e.deltaY * 0.01))
      }, { signal: sig })
      renderer.domElement.addEventListener('contextmenu', (e: Event) => e.preventDefault(), { signal: sig })

      // ── Touch support ──────────────────────────────────────
      let lastTouchY = 0, isTouching = false
      renderer.domElement.addEventListener('touchstart', (e: TouchEvent) => {
        isTouching = true
        lastTouchY = e.touches[0].clientY
      }, { signal: sig })
      renderer.domElement.addEventListener('touchend', () => { isTouching = false }, { signal: sig })
      renderer.domElement.addEventListener('touchmove', (e: TouchEvent) => {
        if (!isTouching) return
        e.preventDefault()
        camPitch = Math.max(0.05, Math.min(1.3, camPitch + (e.touches[0].clientY - lastTouchY) * 0.005))
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
      let stamina = 1.0
      let isSprinting = false
      let prevKeys = { w: false, s: false, a: false, d: false }

      const loop = () => {
        if (disposed) return
        rafId = requestAnimationFrame(loop)

        const shift = !!(keys['ShiftLeft'] || keys['ShiftRight'])
        isSprinting = shift && stamina > 0
        if (isSprinting) stamina = Math.max(0, stamina - 0.008)
        else             stamina = Math.min(1, stamina + 0.004)
        if (staminaBarRef.current) {
          staminaBarRef.current.style.width = `${stamina * 100}%`
          staminaBarRef.current.style.background = stamina > 0.5 ? '#39ff14' : stamina > 0.25 ? '#ffaa00' : '#ff3300'
        }

        const speed = isSprinting ? 0.17 : 0.08
        let moving = false

        const w = !!(keys['KeyW'] || keys['ArrowUp'])
        const s = !!(keys['KeyS'] || keys['ArrowDown'])
        const a = !!(keys['KeyA'] || keys['ArrowLeft'])
        const d = !!(keys['KeyD'] || keys['ArrowRight'])

        // Mouse look — rotate player to face mouse cursor on the ground plane
        raycaster.setFromCamera(mouseNDC, camera)
        if (raycaster.ray.intersectPlane(groundPlane, mouseWorld)) {
          const dx = mouseWorld.x - player.position.x
          const dz = mouseWorld.z - player.position.z
          if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
            playerAngle = Math.atan2(-dx, -dz)
          }
        }

        // Client-side prediction — keeps local movement responsive
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
        if (a) {
          player.position.x -= Math.cos(playerAngle) * speed
          player.position.z += Math.sin(playerAngle) * speed
          moving = true
        }
        if (d) {
          player.position.x += Math.cos(playerAngle) * speed
          player.position.z -= Math.sin(playerAngle) * speed
          moving = true
        }

        player.rotation.y = playerAngle

        // Gently correct local player toward server position to prevent drift
        if (myId) {
          player.position.x += (serverX - player.position.x) * 0.05
          player.position.z += (serverZ - player.position.z) * 0.05
        }

        // Wall collision (AABB push-out)
        for (const wb of wallBoxes) {
          if (wb === doorWallBox && doorOpen) continue
          const wCX = (wb.min.x + wb.max.x) / 2
          const wCZ = (wb.min.z + wb.max.z) / 2
          const wHW = (wb.max.x - wb.min.x) / 2
          const wHD = (wb.max.z - wb.min.z) / 2
          const dx = player.position.x - wCX
          const dz = player.position.z - wCZ
          const overlapX = 0.25 + wHW - Math.abs(dx)
          const overlapZ = 0.25 + wHD - Math.abs(dz)
          if (overlapX > 0 && overlapZ > 0) {
            if (overlapX < overlapZ) player.position.x += Math.sign(dx) * overlapX
            else                     player.position.z += Math.sign(dz) * overlapZ
          }
        }

        // Send key state to server only when it changes
        if (connected && ws && (w !== prevKeys.w || s !== prevKeys.s || a !== prevKeys.a || d !== prevKeys.d)) {
          ws.send(JSON.stringify({ type: 'keys', w, s, a, d }))
          prevKeys = { w, s, a, d }
        }

        // Local walk animation
        if (moving) {
          walkTime += isSprinting ? 0.28 : 0.16
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

        // ── Flamethrower ──────────────────────────────────────
        if (keys['KeyF'] || (mouseDownRef.current && activeSlotRef.current === 1)) {
          const hand = new THREE.Vector3()
          rightArm.getWorldPosition(hand)
          hand.y -= 0.7
          const fwd = new THREE.Vector3(-Math.sin(playerAngle), 0.05, -Math.cos(playerAngle))
          for (let fi = 0; fi < 2; fi++) {
            const fgeo = new THREE.SphereGeometry(0.06 + Math.random() * 0.07, 5, 5)
            const fmat = new THREE.MeshBasicMaterial({
              color: [0xff6600, 0xff2200, 0xffaa00, 0xff4400][Math.floor(Math.random() * 4)],
              transparent: true,
            })
            const fm = new THREE.Mesh(fgeo, fmat)
            fm.position.copy(hand)
            scene.add(fm)
            flames.push({
              mesh: fm,
              vel: new THREE.Vector3(
                fwd.x + (Math.random() - 0.5) * 0.12,
                fwd.y + Math.random() * 0.04,
                fwd.z + (Math.random() - 0.5) * 0.12,
              ).multiplyScalar(0.2),
              age: 0,
              max: 15 + Math.floor(Math.random() * 10),
            })
          }
        }
        for (let fi = flames.length - 1; fi >= 0; fi--) {
          const fp = flames[fi]
          fp.age++
          fp.mesh.position.addScaledVector(fp.vel, 1)
          fp.vel.y += 0.003
          const ft = fp.age / fp.max
          ;(fp.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - ft
          fp.mesh.scale.setScalar(1 + ft * 3)
          if (fp.age >= fp.max) {
            scene.remove(fp.mesh)
            fp.mesh.geometry.dispose()
            ;(fp.mesh.material as THREE.MeshBasicMaterial).dispose()
            flames.splice(fi, 1)
          }
        }

        // ── Lightning ─────────────────────────────────────────
        const lOn = !!(keys['KeyL'] || (mouseDownRef.current && activeSlotRef.current === 2))
        if (lOn) {
          boltL.geometry.dispose(); boltL.geometry = mkLightGeo(7)
          boltR.geometry.dispose(); boltR.geometry = mkLightGeo(7)
          boltL.visible = Math.random() > 0.25
          boltR.visible = Math.random() > 0.25
        } else {
          boltL.visible = false; boltR.visible = false
        }

        // ── Gravity gun ───────────────────────────────────────
        const gNow = !!keys['KeyG']
        if (gNow && !gWas) {
          if (heldObj) {
            const throwFwd = new THREE.Vector3(-Math.sin(playerAngle), 0.25, -Math.cos(playerAngle))
            heldObj.vel.copy(throwFwd).multiplyScalar(0.45)
            heldObj.grounded = false
            heldObj = null
          } else {
            let best: Grabbable | null = null, bestD = 6
            for (const g of grabPool) {
              const gd = g.group.position.distanceTo(player.position)
              if (gd < bestD) { best = g; bestD = gd }
            }
            heldObj = best
          }
        }
        gWas = gNow

        if (heldObj) {
          const holdTarget = new THREE.Vector3(
            player.position.x - Math.sin(playerAngle) * 1.8,
            player.position.y + 1.3,
            player.position.z - Math.cos(playerAngle) * 1.8,
          )
          heldObj.group.position.lerp(holdTarget, 0.18)
          heldObj.group.rotation.y += 0.04
        }
        for (const g of grabPool) {
          if (g === heldObj) continue
          if (!g.grounded) {
            g.vel.y -= 0.012
            g.group.position.addScaledVector(g.vel, 1)
            g.vel.multiplyScalar(0.99)
            if (g.group.position.y <= g.halfH) {
              g.group.position.y = g.halfH
              g.vel.y = Math.abs(g.vel.y) * 0.4
              g.vel.x *= 0.85; g.vel.z *= 0.85
              if (g.vel.length() < 0.01) { g.vel.set(0, 0, 0); g.grounded = true }
            }
          }
          // Alien device animations
          g.group.rotation.y += 0.01
          g.arcTimer++
          if (g.arcTimer % 3 === 0) {
            for (const arc of g.arcs) {
              arc.geometry.dispose()
              arc.geometry = g.makeArcGeo()
            }
          }
          const pulse = 0.5 + Math.sin(Date.now() * 0.004 + g.group.position.x) * 0.3
          ;(g.glowOrb.material as THREE.MeshBasicMaterial).opacity = pulse
        }

        // Door swing animation
        doorPivot.rotation.y += ((doorOpen ? Math.PI / 2 : 0) - doorPivot.rotation.y) * 0.12

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

  const slots = [
    { label: 'Saber',   key: '1', sub: 'toggle' },
    { label: 'Flame',   key: '2', sub: 'hold' },
    { label: 'Bolt',    key: '3', sub: 'hold' },
    { label: 'Grab',    key: '4', sub: 'press' },
  ]

  return (
    <div className='relative w-full flex-1 overflow-hidden bg-black'>
      <div
        className='pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs text-white'
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      >
        WASD to move &nbsp;·&nbsp; Mouse to aim &nbsp;·&nbsp; Drag to tilt &nbsp;·&nbsp; Scroll to zoom &nbsp;·&nbsp; Shift to sprint
      </div>

      {/* Hotbar */}
      <div className='pointer-events-none absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2'>
        {/* Stamina bar */}
        <div className='w-52 overflow-hidden rounded-full' style={{ height: 5, background: 'rgba(255,255,255,0.12)' }}>
          <div
            ref={staminaBarRef}
            style={{ width: '100%', height: '100%', background: '#39ff14', borderRadius: 9999, transition: 'background 0.3s' }}
          />
        </div>
        {/* Slots */}
        <div className='flex gap-2'>
          {slots.map((slot, i) => (
            <div
              key={i}
              className='flex flex-col items-center rounded-xl px-3 py-2'
              style={{
                minWidth: 56,
                background: activeSlot === i ? 'rgba(57,255,20,0.18)' : 'rgba(0,0,0,0.62)',
                border: `1.5px solid ${activeSlot === i ? '#39ff14' : 'rgba(255,255,255,0.18)'}`,
                backdropFilter: 'blur(10px)',
                color: '#fff',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{slot.label}</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: activeSlot === i ? '#39ff14' : '#aaa', lineHeight: 1.4 }}>{slot.key}</span>
              <span style={{ fontSize: 9, opacity: 0.45, marginTop: 1 }}>{slot.sub}</span>
            </div>
          ))}
        </div>
      </div>

      <div ref={mountRef} className='h-full w-full' />
    </div>
  )
}
