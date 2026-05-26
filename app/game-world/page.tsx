'use client'

import { useEffect, useRef, useState } from 'react'
import type * as THREE from 'three'
import type { Object3D, BufferGeometry, Material } from 'three'

const WS_URL = process.env.NEXT_PUBLIC_GAME_WS_URL ?? 'ws://localhost:8080'

// Zombie visual mesh — AI state is fully server-authoritative
interface ZombieMesh {
  id: number
  group: THREE.Group
  body: THREE.Mesh
  head: THREE.Mesh
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
}

type ServerZombieState = 'idle' | 'chasing' | 'attacking' | 'dead'

export default function GameWorldPage() {
  const mountRef      = useRef<HTMLDivElement>(null)
  const staminaBarRef   = useRef<HTMLDivElement>(null)
  const healthBarRef    = useRef<HTMLDivElement>(null)
  const compassDegRef   = useRef<HTMLDivElement>(null)
  const compassStripRef = useRef<HTMLDivElement>(null)
  const activeSlotRef = useRef(0)
  const [activeSlot, setActiveSlot] = useState(0)
  const mouseDownRef = useRef(false)

  const [playerMoney,      setPlayerMoney]      = useState(10000)
  const [playerHealth,     setPlayerHealth]      = useState(100)
  const [isDead,           setIsDead]            = useState(false)
  const [respawnCountdown, setRespawnCountdown]  = useState(30)
  const [buyMenuOpen,      setBuyMenuOpen]       = useState(false)
  const [drugLabCount,     setDrugLabCount]      = useState(0)
  const [hasMiniGun,       setHasMiniGun]        = useState(false)
  const [hasPistol,        setHasPistol]         = useState(false)
  const [hasUzi,           setHasUzi]            = useState(false)
  const [uziAmmo,          setUziAmmo]           = useState(30)
  const [uziReloading,     setUziReloading]      = useState(false)

  const playerHealthRef  = useRef(100)
  const playerMoneyRef   = useRef(10000)
  const isDeadRef        = useRef(false)
  const lastDamageRef    = useRef(0)
  const respawnTimerRef  = useRef(0)
  const drugLabsRef      = useRef<{ group: THREE.Group; flask: THREE.Mesh; incomeTimer: number }[]>([])
  const zombieMeshesRef  = useRef<ZombieMesh[]>([])
  const wsRef            = useRef<WebSocket | null>(null)
  const pendingShotRef   = useRef(false)
  const buyMenuOpenRef   = useRef(false)
  const hasMiniGunRef    = useRef(false)
  const hasPistolRef     = useRef(false)
  const hasUziRef        = useRef(false)
  const uziAmmoRef       = useRef(30)
  const uziReloadingRef  = useRef(false)

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

      const wallBoxes: THREE.Box3[] = []

      // ── Underground Subway (NYC-style) ─────────────────────────────
      const subCX    = -15    // tunnel center X
      const subHW    = 3.2    // half-width
      const subFY    = -7     // floor Y
      const subTH    = 6      // tunnel height
      const subPlatH = 1.1    // platform slab height
      const subPlatW = 1.05   // platform width each side
      const subPlatY = subFY + subPlatH  // -5.9, top of platform

      const subConc   = new THREE.MeshLambertMaterial({ color: 0x888899 })
      const subFlrM   = new THREE.MeshLambertMaterial({ color: 0x4a4a52 })
      const subLitM   = new THREE.MeshBasicMaterial({ color: 0xfffde0 })
      const subYell   = new THREE.MeshLambertMaterial({ color: 0xf5c518 })
      const subTileM  = new THREE.MeshLambertMaterial({ color: 0xccc8b8 })
      const subGreenM = new THREE.MeshLambertMaterial({ color: 0x1a5c1a })
      const subRailM  = new THREE.MeshLambertMaterial({ color: 0x888888 })
      const subTieM   = new THREE.MeshLambertMaterial({ color: 0x5a4030 })
      const subGlbM   = new THREE.MeshBasicMaterial({ color: 0xeeeedd, transparent: true, opacity: 0.92 })
      const subSgnM   = new THREE.MeshBasicMaterial({ color: 0xffcc00 })
      const subStepM  = new THREE.MeshLambertMaterial({ color: 0x666677 })
      const subRailGM = new THREE.MeshLambertMaterial({ color: 0x1a4a1a }) // green railing

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subBox = (cx: number, cy: number, cz: number, w: number, h: number, d: number, mat: any) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
        m.position.set(cx, cy, cz)
        m.castShadow = true; m.receiveShadow = true
        scene.add(m)
      }

      // ── Tunnel shell ──────────────────────────────────────────────
      // Track-bed floor (center section, between platforms)
      const trackBedW = subHW * 2 - subPlatW * 2
      const trackFloor = new THREE.Mesh(new THREE.PlaneGeometry(trackBedW, 40), subFlrM)
      trackFloor.rotation.x = -Math.PI / 2
      trackFloor.position.set(subCX, subFY + 0.01, 0)
      trackFloor.receiveShadow = true; scene.add(trackFloor)

      // Platforms (raised slabs on east and west sides)
      const platX_W = subCX - subHW + subPlatW / 2  // west platform center X
      const platX_E = subCX + subHW - subPlatW / 2  // east platform center X
      subBox(platX_W, subFY + subPlatH / 2, 0, subPlatW, subPlatH, 40, subConc)
      subBox(platX_E, subFY + subPlatH / 2, 0, subPlatW, subPlatH, 40, subConc)
      // Platform tiles on top
      const platTileFloor = (cx: number) => {
        const pt = new THREE.Mesh(new THREE.PlaneGeometry(subPlatW - 0.04, 40), subTileM)
        pt.rotation.x = -Math.PI / 2; pt.position.set(cx, subPlatY + 0.01, 0)
        pt.receiveShadow = true; scene.add(pt)
      }
      platTileFloor(platX_W); platTileFloor(platX_E)

      // Yellow safety edge stripes on platforms
      subBox(platX_W, subPlatY + 0.04, 0, subPlatW, 0.06, 40, subYell)
      subBox(platX_E, subPlatY + 0.04, 0, subPlatW, 0.06, 40, subYell)

      // East & west tunnel walls
      subBox(subCX + subHW, subFY + subTH / 2, 0, 0.3, subTH, 64, subConc)
      subBox(subCX - subHW, subFY + subTH / 2, 0, 0.3, subTH, 64, subConc)

      // Ceiling (gap over stairwells Z: ±20 to ±30 for open shaft)
      subBox(subCX, subFY + subTH, 0,   subHW * 2, 0.3, 40, subConc)
      subBox(subCX, subFY + subTH, -31, subHW * 2, 0.3,  2, subConc)
      subBox(subCX, subFY + subTH,  31, subHW * 2, 0.3,  2, subConc)

      // End cap walls
      subBox(subCX, subFY + subTH / 2, -32, subHW * 2, subTH, 0.3, subConc)
      subBox(subCX, subFY + subTH / 2,  32, subHW * 2, subTH, 0.3, subConc)

      // Station name tiles on both walls (colored panel)
      const subNameM = new THREE.MeshBasicMaterial({ color: 0x1a4a8a })
      for (const wx of [subCX - subHW + 0.16, subCX + subHW - 0.16]) {
        for (const nz of [-10, 0, 10]) {
          subBox(wx, subFY + 2.6, nz, 0.06, 0.9, 3.5, subNameM)
        }
      }

      // Support columns every 8 units (I-beam style)
      for (let cz = -24; cz <= 24; cz += 8) {
        subBox(platX_W + 0.01, subFY + subTH / 2, cz, 0.28, subTH, 0.28, subConc)
        subBox(platX_E - 0.01, subFY + subTH / 2, cz, 0.28, subTH, 0.28, subConc)
      }

      // Overhead fluorescent light strips + point lights
      for (let lz = -16; lz <= 16; lz += 8) {
        subBox(subCX, subFY + subTH - 0.22, lz, 0.24, 0.1, 2.8, subLitM)
        const subPL = new THREE.PointLight(0xfff8e0, 1.0, 16)
        subPL.position.set(subCX, subFY + subTH - 0.5, lz); scene.add(subPL)
      }

      // ── Rail tracks ───────────────────────────────────────────────
      // Two rails running Z: -20 to 20 (platform length)
      const rail1X = subCX - 0.65, rail2X = subCX + 0.65
      subBox(rail1X, subFY + 0.12, 0, 0.08, 0.16, 40, subRailM)
      subBox(rail2X, subFY + 0.12, 0, 0.08, 0.16, 40, subRailM)
      // Rail head profile (top cap)
      subBox(rail1X, subFY + 0.22, 0, 0.12, 0.06, 40, subRailM)
      subBox(rail2X, subFY + 0.22, 0, 0.12, 0.06, 40, subRailM)
      // Wooden ties every 0.75 units
      for (let tz = -19.6; tz <= 19.6; tz += 0.75) {
        subBox(subCX, subFY + 0.07, tz, trackBedW - 0.1, 0.12, 0.22, subTieM)
      }
      // Third rail (electrified, offset east)
      subBox(subCX + 1.3, subFY + 0.16, 0, 0.06, 0.1, 40, subRailM)

      // ── NYC staircase (north: Z=-20→-30, south: Z=20→30) ─────────
      // 10 steps, each 0.7 tall × 1.0 deep; player Y interpolation unchanged
      const mkStaircase = (topZ: number, dir: number) => {
        for (let si = 0; si < 10; si++) {
          const stepZ  = topZ + dir * (si + 0.5)  // step center Z
          const stepY  = -(si * 0.7) - 0.35       // step center Y (descending)
          const treadH = 0.7
          const rise   = 0.09                      // visible riser lip height
          // Tread slab
          subBox(subCX, stepY, stepZ, subHW * 2, treadH, 1.0, subStepM)
          // Nosing accent strip
          subBox(subCX, stepY + treadH / 2 - 0.04, stepZ - dir * 0.47, subHW * 2, 0.06, 0.06, subYell)
          // Riser face (front of step)
          subBox(subCX, stepY - rise / 2, stepZ - dir * 0.5, subHW * 2, rise, 0.04, subConc)
        }

        // Side walls enclosing stair shaft
        const shaftZ = topZ + dir * 5  // center Z of shaft
        subBox(subCX - subHW + 0.15, -3.5, shaftZ, 0.3, 7, 10, subConc) // west shaft wall
        subBox(subCX + subHW - 0.15, -3.5, shaftZ, 0.3, 7, 10, subConc) // east shaft wall
        // Under-stair fill
        subBox(subCX, -5.25, shaftZ, subHW * 2, 3.5, 10, subConc)

        // Green handrails (two posts per side + diagonal bar)
        const railY_top = 0.9  // handrail height at top
        for (const hx of [subCX - subHW + 0.55, subCX + subHW - 0.55]) {
          // Vertical posts every 3 steps
          for (let pi = 0; pi < 10; pi += 3) {
            const pz = topZ + dir * (pi + 0.5)
            const py = -(pi * 0.7) + railY_top
            subBox(hx, py - 0.45, pz, 0.07, 0.9, 0.07, subRailGM)
          }
          // Diagonal handrail bar (tilted box)
          const hrBar = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.06, 10.4),
            subRailGM
          )
          hrBar.rotation.x = dir * Math.atan2(7, 10)
          hrBar.position.set(hx, -3.0, topZ + dir * 5)
          scene.add(hrBar)
        }
      }
      mkStaircase(-20, -1)  // north staircase (goes deeper as Z decreases)
      mkStaircase( 20,  1)  // south staircase (goes deeper as Z increases)

      // ── Street-level entrance structures ─────────────────────────
      // Classic NYC iron railing entrance with globe lights
      const mkSubwayEntrance = (surfaceZ: number, streetDir: number) => {
        const gateW = subHW * 2 + 0.6
        const gateH = 2.8

        // Iron frame: two side posts + header bar
        subBox(subCX - subHW - 0.2, gateH / 2, surfaceZ, 0.22, gateH, 0.22, subGreenM)
        subBox(subCX + subHW + 0.2, gateH / 2, surfaceZ, 0.22, gateH, 0.22, subGreenM)
        subBox(subCX, gateH - 0.11, surfaceZ, gateW, 0.22, 0.22, subGreenM)

        // Secondary horizontal bars
        for (const barY of [0.9, 1.7]) {
          subBox(subCX, barY, surfaceZ, gateW, 0.14, 0.14, subGreenM)
        }
        // Vertical pickets
        for (let px = -subHW + 0.5; px <= subHW - 0.3; px += 0.55) {
          subBox(subCX + px, 1.2, surfaceZ, 0.10, 2.0, 0.10, subGreenM)
        }

        // Canopy extending toward street
        const canoZ = surfaceZ + streetDir * 1.2
        subBox(subCX, gateH + 0.18, canoZ, gateW + 0.4, 0.14, 2.6, subGreenM)
        // Canopy ribs
        for (const rx of [-subHW + 0.1, 0, subHW - 0.1]) {
          subBox(subCX + rx, gateH + 0.14, canoZ, 0.08, 0.08, 2.6, subGreenM)
        }

        // Globe lights on top of posts
        const glbGeo = new THREE.SphereGeometry(0.22, 8, 6)
        for (const gx of [subCX - subHW - 0.2, subCX + subHW + 0.2]) {
          const glb = new THREE.Mesh(glbGeo, subGlbM)
          glb.position.set(gx, gateH + 0.3, surfaceZ); scene.add(glb)
          const gpl = new THREE.PointLight(0xffffcc, 1.2, 12)
          gpl.position.set(gx, gateH + 0.1, surfaceZ); scene.add(gpl)
        }

        // Yellow SUBWAY sign on header
        const sgn = new THREE.Mesh(new THREE.BoxGeometry(gateW - 0.3, 0.44, 0.12), subSgnM)
        sgn.position.set(subCX, gateH - 0.55, surfaceZ + streetDir * 0.08); scene.add(sgn)
        // Sign inner text panel
        const sgnInner = new THREE.Mesh(new THREE.BoxGeometry(gateW - 0.7, 0.26, 0.13), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }))
        sgnInner.position.set(subCX, gateH - 0.55, surfaceZ + streetDir * 0.09); scene.add(sgnInner)

        // Ground-level grate / threshold plate
        subBox(subCX, 0.04, surfaceZ + streetDir * 0.3, gateW, 0.08, 0.8, subConc)
      }
      mkSubwayEntrance(-20,  1)   // north entrance, street is toward south (+Z)
      mkSubwayEntrance( 20, -1)   // south entrance, street is toward north (-Z)

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

      // ── Zombie mesh builder ────────────────────────────────
      const buildZombie = () => {
        const g    = new THREE.Group()
        const mSkin  = new THREE.MeshLambertMaterial({ color: 0x7aad68 })
        const mCloth = new THREE.MeshLambertMaterial({ color: 0x4a3a2a })
        const mBody  = new THREE.MeshLambertMaterial({ color: 0x4a3a2a })
        const mShoe  = new THREE.MeshLambertMaterial({ color: 0x222211 })
        const mEye   = new THREE.MeshBasicMaterial({ color: 0xff2200 })

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.38), mSkin)
        head.position.y = 1.85; head.castShadow = true; g.add(head)

        for (const ex of [-0.1, 0.1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 4), mEye)
          eye.position.set(ex, 1.88, -0.19); g.add(eye)
        }

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.70, 0.32), mBody)
        body.position.y = 1.25; body.castShadow = true; g.add(body)

        const leftArm = new THREE.Group()
        leftArm.position.set(-0.44, 1.55, 0); leftArm.rotation.x = -0.75
        addTo(leftArm, box(0.22, 0.40, 0.22), mCloth, -0.20)
        addTo(leftArm, box(0.18, 0.36, 0.18), mSkin,  -0.58)
        g.add(leftArm)

        const rightArm = new THREE.Group()
        rightArm.position.set(0.44, 1.55, 0); rightArm.rotation.x = -0.75
        addTo(rightArm, box(0.22, 0.40, 0.22), mCloth, -0.20)
        addTo(rightArm, box(0.18, 0.36, 0.18), mSkin,  -0.58)
        g.add(rightArm)

        const leftLeg = new THREE.Group()
        leftLeg.position.set(-0.19, 0.9, 0)
        addTo(leftLeg, box(0.27, 0.44, 0.27), mCloth, -0.22)
        addTo(leftLeg, box(0.23, 0.44, 0.23), mCloth, -0.60)
        addTo(leftLeg, box(0.25, 0.10, 0.38), mShoe,  -0.87)
        g.add(leftLeg)

        const rightLeg = new THREE.Group()
        rightLeg.position.set(0.19, 0.9, 0)
        addTo(rightLeg, box(0.27, 0.44, 0.27), mCloth, -0.22)
        addTo(rightLeg, box(0.23, 0.44, 0.23), mCloth, -0.60)
        addTo(rightLeg, box(0.25, 0.10, 0.38), mShoe,  -0.87)
        g.add(rightLeg)

        return { group: g, head, body, leftArm, rightArm, leftLeg, rightLeg }
      }

      // ── Drug-lab mesh builder ──────────────────────────────
      const buildDrugLab = (x: number, z: number) => {
        const g       = new THREE.Group()
        const metalMat = new THREE.MeshLambertMaterial({ color: 0x333333 })
        const flaskMat = new THREE.MeshLambertMaterial({
          color: 0x88ff44, emissive: new THREE.Color(0x33aa00), emissiveIntensity: 0.4,
        })

        const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.9), metalMat)
        table.position.y = 0.82; table.castShadow = true; g.add(table)

        for (const [lx, lz] of [[-0.8,-0.38],[0.8,-0.38],[-0.8,0.38],[0.8,0.38]] as [number,number][]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), metalMat)
          leg.position.set(lx, 0.41, lz); g.add(leg)
        }

        const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 8), flaskMat)
        flask.position.set(0, 1.12, 0); g.add(flask)

        for (const bx of [-0.5, 0.5]) {
          const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.28, 6), flaskMat.clone())
          beaker.position.set(bx, 1.0, 0); g.add(beaker)
        }

        g.position.set(x, 0, z)
        scene.add(g)
        return { group: g, flask }
      }

      // ── Shantytown (east quadrant, dense sporadic layout) ───────────────
      // Seeded RNG — must match server so collision geometry is identical
      const mkShackRng = (seed: number) => {
        let s = seed
        return () => {
          s = (s + 0x6D2B79F5) | 0
          let t = Math.imul(s ^ (s >>> 15), 1 | s)
          t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
      }
      const shackRng = mkShackRng(42)

      const shWood1 = new THREE.MeshLambertMaterial({ color: 0x4a3218 })
      const shWood2 = new THREE.MeshLambertMaterial({ color: 0x3a2810 })
      const shTin1  = new THREE.MeshLambertMaterial({ color: 0x5a5044 })
      const shTin2  = new THREE.MeshLambertMaterial({ color: 0x483c30 })
      const shRust  = new THREE.MeshLambertMaterial({ color: 0x6b3318 })
      const shTarp  = new THREE.MeshLambertMaterial({ color: 0x2a3a22 })
      const shConc2 = new THREE.MeshLambertMaterial({ color: 0x666655 })
      const shMats  = [shWood1, shWood2, shTin1, shTin2, shRust, shConc2]

      const barrelMat2 = new THREE.MeshLambertMaterial({ color: 0x222211 })
      const fireMat2   = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 })

      type ShackDoor = { pivot: THREE.Group; doorBox: THREE.Box3; worldCenter: THREE.Vector3; open: boolean }
      const shackDoors: ShackDoor[] = []
      const openShackDoorBoxes = new Set<THREE.Box3>()

      const mkShack = (bx: number, bz: number, rot: number, rng: () => number) => {
        const w = 3 + rng() * 2.5
        const h = 3.2 + rng() * 2.5
        const d = 3 + rng() * 2.5
        const wt = 0.18
        const dw = Math.min(0.95, w * 0.32)
        const dh = Math.min(h - 0.3, 2.3)
        const fLW = (w - dw) / 2
        const wallM = shMats[Math.floor(rng() * shMats.length)]
        const roofM = rng() > 0.5 ? shTin1 : shTarp
        const g = new THREE.Group()
        g.rotation.y = rot

        const backW = new THREE.Mesh(new THREE.BoxGeometry(w, h, wt), wallM)
        backW.position.set(0, h / 2, d / 2); backW.castShadow = true; backW.receiveShadow = true; g.add(backW)

        const leftW = new THREE.Mesh(new THREE.BoxGeometry(wt, h, d), wallM)
        leftW.position.set(-w / 2, h / 2, 0); leftW.castShadow = true; leftW.receiveShadow = true; g.add(leftW)

        const rightW = new THREE.Mesh(new THREE.BoxGeometry(wt, h, d), wallM)
        rightW.position.set(w / 2, h / 2, 0); rightW.castShadow = true; rightW.receiveShadow = true; g.add(rightW)

        const frontL = new THREE.Mesh(new THREE.BoxGeometry(fLW, h, wt), wallM)
        frontL.position.set(-(dw / 2 + fLW / 2), h / 2, -d / 2); frontL.castShadow = true; frontL.receiveShadow = true; g.add(frontL)

        const frontR = new THREE.Mesh(new THREE.BoxGeometry(fLW, h, wt), wallM)
        frontR.position.set(dw / 2 + fLW / 2, h / 2, -d / 2); frontR.castShadow = true; frontR.receiveShadow = true; g.add(frontR)

        if (h > dh + 0.15) {
          const frontTop = new THREE.Mesh(new THREE.BoxGeometry(dw, h - dh, wt), wallM)
          frontTop.position.set(0, dh + (h - dh) / 2, -d / 2); frontTop.castShadow = true; frontTop.receiveShadow = true; g.add(frontTop)
        }

        const shFloor = new THREE.Mesh(new THREE.PlaneGeometry(w - wt * 2, d - wt), shConc2)
        shFloor.rotation.x = -Math.PI / 2; shFloor.position.set(0, 0.01, 0); shFloor.receiveShadow = true; g.add(shFloor)

        const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.15, d + 0.4), roofM)
        roofMesh.rotation.z = (rng() - 0.5) * 0.25
        roofMesh.position.y = h + 0.08; roofMesh.castShadow = true; g.add(roofMesh)

        if (rng() > 0.55) {
          const lw = 0.9 + rng() * 1.2
          const lean = new THREE.Mesh(new THREE.BoxGeometry(lw, h * 0.65, d * 0.8), wallM)
          lean.position.set(w / 2 + lw / 2, h * 0.65 / 2, 0); lean.castShadow = true; g.add(lean)
          const lroof = new THREE.Mesh(new THREE.BoxGeometry(lw + 0.2, 0.12, d * 0.8 + 0.2), roofM)
          lroof.rotation.z = 0.18; lroof.position.set(w / 2 + lw / 2, h * 0.65 + 0.06, 0); g.add(lroof)
        }

        const shDoorMat = new THREE.MeshLambertMaterial({ color: 0x5a3010 })
        const doorPiv = new THREE.Group()
        doorPiv.position.set(-dw / 2, 0, -d / 2)
        const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.07), shDoorMat)
        doorPanel.position.set(dw / 2, dh / 2, 0)
        doorPiv.add(doorPanel)
        g.add(doorPiv)

        g.position.set(bx, 0, bz)
        scene.add(g)

        const cosR = Math.cos(rot), sinR = Math.sin(rot)
        const absC = Math.abs(cosR), absS = Math.abs(sinR)
        const addWB = (lx: number, lz: number, hw: number, hd: number) => {
          const wx = bx + lx * cosR - lz * sinR
          const wz = bz + lx * sinR + lz * cosR
          wallBoxes.push(new THREE.Box3(
            new THREE.Vector3(wx - hw * absC - hd * absS, 0, wz - hw * absS - hd * absC),
            new THREE.Vector3(wx + hw * absC + hd * absS, h + 0.2, wz + hw * absS + hd * absC)
          ))
        }
        addWB(0, d / 2, w / 2, wt / 2)
        addWB(-w / 2, 0, wt / 2, d / 2)
        addWB(w / 2, 0, wt / 2, d / 2)
        addWB(-(dw / 2 + fLW / 2), -d / 2, fLW / 2, wt / 2)
        addWB(dw / 2 + fLW / 2, -d / 2, fLW / 2, wt / 2)

        const doorWX = bx + (d / 2) * sinR
        const doorWZ = bz - (d / 2) * cosR
        const doorBox = new THREE.Box3(
          new THREE.Vector3(doorWX - (dw / 2) * absC - 0.035 * absS, 0, doorWZ - (dw / 2) * absS - 0.035 * absC),
          new THREE.Vector3(doorWX + (dw / 2) * absC + 0.035 * absS, dh, doorWZ + (dw / 2) * absS + 0.035 * absC)
        )
        wallBoxes.push(doorBox)
        shackDoors.push({ pivot: doorPiv, doorBox, worldCenter: new THREE.Vector3(doorWX, 1, doorWZ), open: false })
      }

      const mkBarrel = (bx: number, bz: number) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.7, 8), barrelMat2)
        b.position.set(bx, 0.35, bz); scene.add(b)
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.25, 6), fireMat2)
        f.position.set(bx, 0.85, bz); scene.add(f)
        const fl = new THREE.PointLight(0xff5500, 1.2, 8)
        fl.position.set(bx, 1.1, bz); scene.add(fl)
      }

      for (const [sx, sz] of [
        [30,-18],[33,-12],[27,-8],[35,-5],[29,0],[38,3],[32,9],[26,14],[36,18],[30,24],
        [41,-15],[42,8],[24,-3],[38,-10],[25,20],[44,-2],[28,-22],[34,25],[40,15],[45,-20],
        [22,10],[46,5],[31,-28],[43,22],
      ] as [number,number][]) {
        mkShack(sx + (shackRng()-0.5)*2.5, sz + (shackRng()-0.5)*2.5, (shackRng()-0.5)*0.7, shackRng)
      }
      for (const [bx,bz] of [[29,-14],[37,1],[32,16],[26,8],[41,-8],[44,12]] as [number,number][]) {
        mkBarrel(bx+(shackRng()-0.5), bz+(shackRng()-0.5))
      }

      // ── Market District (west side, stores face east, front wall at X=-29) ───

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stB = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: any) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat)
        m.position.set(cx, cy, cz)
        m.castShadow = true; m.receiveShadow = true
        scene.add(m)
      }

      // Market alley pavement (X=-25 to -29, Z=-52 to 18)
      const mktPaveMat = new THREE.MeshLambertMaterial({ color: 0x888877 })
      const mktCurbMat = new THREE.MeshLambertMaterial({ color: 0xa0a090 })
      const mktAlleyPav = new THREE.Mesh(new THREE.PlaneGeometry(4, 72), mktPaveMat)
      mktAlleyPav.rotation.x = -Math.PI / 2
      mktAlleyPav.position.set(-27, 0.07, -17)
      mktAlleyPav.receiveShadow = true
      scene.add(mktAlleyPav)
      for (const ax of [-25.0, -29.1]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 72), mktCurbMat)
        curb.position.set(ax, 0.06, -17)
        scene.add(curb)
      }

      // Street lamps along alley
      const mkAlleyLamp = (z: number) => {
        const ironM  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
        const lensM  = new THREE.MeshBasicMaterial({ color: 0xffffdd })
        stB(-25.4, 2.3, z, 0.08, 4.6, 0.08, ironM)
        stB(-25.0, 4.6, z, 0.62, 0.06, 0.06, ironM)
        stB(-24.7, 4.46, z, 0.46, 0.22, 0.30, ironM)
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.21), lensM)
        lens.position.set(-24.7, 4.33, z); scene.add(lens)
        const lampPL = new THREE.PointLight(0xffeecc, 1.3, 18)
        lampPL.position.set(-24.7, 4.2, z); scene.add(lampPL)
      }
      for (const lz of [-47, -35, -23, -11, 1, 13]) mkAlleyLamp(lz)

      // Wall sconce lantern
      const mkSconce = (wallX: number, y: number, z: number) => {
        const iron = new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
        stB(wallX + 0.14, y + 0.32, z, 0.26, 0.05, 0.05, iron)
        stB(wallX + 0.27, y + 0.19, z, 0.15, 0.27, 0.15, iron)
        const gM = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.19, 0.09),
          new THREE.MeshBasicMaterial({ color: 0xffeeaa, transparent: true, opacity: 0.95 })
        )
        gM.position.set(wallX + 0.27, y + 0.19, z); scene.add(gM)
        const sconPL = new THREE.PointLight(0xffcc66, 0.9, 8)
        sconPL.position.set(wallX + 0.27, y, z); scene.add(sconPL)
      }

      // Store sign panel (protruding from east/front face)
      const mkStoreSign = (wallX: number, cy: number, cz: number, zW: number, boardC: number, textC: number) => {
        stB(wallX + 0.04, cy, cz, 0.08, 0.52, zW, new THREE.MeshLambertMaterial({ color: boardC }))
        stB(wallX + 0.045, cy, cz, 0.09, 0.30, zW * 0.73, new THREE.MeshBasicMaterial({ color: textC }))
      }

      // Reusable shelf material (used by grocery + hardware)
      const mktShelfMat = new THREE.MeshLambertMaterial({ color: 0x8a7060 })

      const buildStore = (
        sx1: number, sx2: number, sz1: number, sz2: number,
        h: number, h2: number,
        dz: number, dw: number,
        wallC: number, trimC: number, roofC: number, floorC: number,
        signC: number, signTC: number,
        countFront: number
      ) => {
        const WT  = 0.18
        const D   = sx1 - sx2
        const W   = sz2 - sz1
        const cxM = (sx1 + sx2) / 2
        const czM = (sz1 + sz2) / 2
        const dh  = Math.min(h - 0.35, 2.3)
        const wFX = sx1 + WT / 2

        const wallM  = new THREE.MeshLambertMaterial({ color: wallC })
        const trimM  = new THREE.MeshLambertMaterial({ color: trimC })
        const roofM  = new THREE.MeshLambertMaterial({ color: roofC })
        const winM   = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.38 })
        const doorM  = new THREE.MeshLambertMaterial({ color: 0x5c3820 })
        const cntM   = new THREE.MeshLambertMaterial({ color: 0x7a6248 })
        const cntTM  = new THREE.MeshLambertMaterial({ color: 0xa08060 })

        // Floor
        const storeFloor = new THREE.Mesh(
          new THREE.PlaneGeometry(D - WT * 2, W - WT * 2),
          new THREE.MeshLambertMaterial({ color: floorC })
        )
        storeFloor.rotation.x = -Math.PI / 2
        storeFloor.position.set(cxM, 0.01, czM)
        storeFloor.receiveShadow = true
        scene.add(storeFloor)

        // Roof + front fascia
        stB(cxM, h + 0.09, czM, D + 0.5, 0.18, W + 0.5, roofM)
        stB(wFX + 0.02, h + 0.09, czM, 0.15, 0.34, W + 0.5, trimM)

        // Back wall (west)
        stB(sx2 - WT / 2, h / 2, czM, WT, h, W + WT * 2, wallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(sx2 - WT, 0, sz1 - WT),
          new THREE.Vector3(sx2, h + 0.2, sz2 + WT)
        ))
        // North wall
        stB(cxM, h / 2, sz2 + WT / 2, D + WT * 2, h, WT, wallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(sx2 - WT, 0, sz2),
          new THREE.Vector3(sx1 + WT, h + 0.2, sz2 + WT)
        ))
        // South wall
        stB(cxM, h / 2, sz1 - WT / 2, D + WT * 2, h, WT, wallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(sx2 - WT, 0, sz1 - WT),
          new THREE.Vector3(sx1 + WT, h + 0.2, sz1)
        ))

        // Front wall sections with optional window
        const mkFrontSection = (sZ: number, eZ: number) => {
          const secW  = eZ - sZ
          const secCZ = (sZ + eZ) / 2
          const winW  = secW - 0.35
          if (secW > 1.5 && winW > 0.7) {
            stB(wFX, 0.45, secCZ, WT, 0.9, secW, wallM)
            stB(wFX, 1.8, secCZ, WT - 0.02, 1.8, winW, winM)
            stB(wFX + 0.04, 0.9, secCZ, 0.06, 0.06, winW + 0.1, trimM)
            if (h > 2.8) stB(wFX, 2.7 + (h - 2.7) / 2, secCZ, WT, h - 2.7, secW, wallM)
          } else {
            stB(wFX, h / 2, secCZ, WT, h, secW, wallM)
          }
        }
        const southGap = dz - dw / 2 - sz1
        const northGap = sz2 - (dz + dw / 2)
        if (southGap > 0.05) {
          mkFrontSection(sz1, dz - dw / 2)
          wallBoxes.push(new THREE.Box3(
            new THREE.Vector3(sx1, 0, sz1),
            new THREE.Vector3(sx1 + WT, h + 0.2, dz - dw / 2)
          ))
        }
        if (northGap > 0.05) {
          mkFrontSection(dz + dw / 2, sz2)
          wallBoxes.push(new THREE.Box3(
            new THREE.Vector3(sx1, 0, dz + dw / 2),
            new THREE.Vector3(sx1 + WT, h + 0.2, sz2)
          ))
        }
        // Panel above door opening
        if (h > dh + 0.25) stB(wFX, dh + (h - dh) / 2, dz, WT, h - dh, dw, wallM)

        // Corner trim pillars on front corners
        stB(wFX, h / 2, sz1 - WT / 2, WT * 1.8, h + 0.1, WT * 1.8, trimM)
        stB(wFX, h / 2, sz2 + WT / 2, WT * 1.8, h + 0.1, WT * 1.8, trimM)

        // Door pivot (swings inward — west — when opened)
        const dPiv = new THREE.Group()
        dPiv.position.set(sx1 + WT, 0, dz - dw / 2)
        const dPanel = new THREE.Mesh(new THREE.BoxGeometry(WT, dh, dw), doorM)
        dPanel.position.set(0, dh / 2, dw / 2)
        dPiv.add(dPanel); scene.add(dPiv)
        const dBox = new THREE.Box3(
          new THREE.Vector3(sx1, 0, dz - dw / 2),
          new THREE.Vector3(sx1 + WT, dh, dz + dw / 2)
        )
        wallBoxes.push(dBox)
        shackDoors.push({ pivot: dPiv, doorBox: dBox, worldCenter: new THREE.Vector3(sx1 + WT / 2, 1, dz), open: false })

        // Sconces flanking door + sign
        mkSconce(sx1 + WT, h - 0.65, dz - dw / 2 - 0.42)
        mkSconce(sx1 + WT, h - 0.65, dz + dw / 2 + 0.42)
        mkStoreSign(sx1 + WT, h - 0.7, dz, Math.min(W * 0.38, 3.5), signC, signTC)

        // Counter parallel to front wall
        stB(sx1 - countFront, 0.45, czM, 0.55, 0.9, W * 0.45, cntM)
        stB(sx1 - countFront, 0.92, czM, 0.60, 0.06, W * 0.45 + 0.1, cntTM)

        // Backroom divider wall (1/3 depth from back)
        const brX  = sx2 + D * 0.33
        const brDH = Math.min(h - 0.3, 2.1)
        const brL  = czM - 0.45 - sz1
        const brR  = sz2 - (czM + 0.45)
        if (brL > 0.1) {
          stB(brX, h / 2, sz1 + brL / 2, WT, h, brL, wallM)
          wallBoxes.push(new THREE.Box3(new THREE.Vector3(brX - WT / 2, 0, sz1), new THREE.Vector3(brX + WT / 2, h, czM - 0.45)))
        }
        if (brR > 0.1) {
          stB(brX, h / 2, sz2 - brR / 2, WT, h, brR, wallM)
          wallBoxes.push(new THREE.Box3(new THREE.Vector3(brX - WT / 2, 0, czM + 0.45), new THREE.Vector3(brX + WT / 2, h, sz2)))
        }
        if (h > brDH + 0.25) stB(brX, brDH + (h - brDH) / 2, czM, WT, h - brDH, 0.9, wallM)
        // Backroom door pivot
        const brPiv = new THREE.Group()
        brPiv.position.set(brX - WT / 2, 0, czM - 0.45)
        const brP = new THREE.Mesh(new THREE.BoxGeometry(WT, brDH, 0.9), doorM)
        brP.position.set(0, brDH / 2, 0.45); brPiv.add(brP); scene.add(brPiv)
        const brDBox = new THREE.Box3(
          new THREE.Vector3(brX - WT, 0, czM - 0.45),
          new THREE.Vector3(brX, brDH, czM + 0.45)
        )
        wallBoxes.push(brDBox)
        shackDoors.push({ pivot: brPiv, doorBox: brDBox, worldCenter: new THREE.Vector3(brX, 1, czM), open: false })

        // Second story (if h2 > 0)
        if (h2 > 0) {
          const s2Mat = new THREE.MeshLambertMaterial({ color: Math.min(wallC + 0x181818, 0xffffff) })
          // 2nd-floor slab
          stB(cxM, h + 0.19, czM, D - WT * 2, 0.2, W - WT * 2, new THREE.MeshLambertMaterial({ color: 0x888877 }))
          // 2nd-story walls
          stB(sx2 - WT / 2, h + h2 / 2, czM, WT, h2, W, s2Mat)
          stB(cxM, h + h2 / 2, sz2 + WT / 2, D, h2, WT, s2Mat)
          stB(cxM, h + h2 / 2, sz1 - WT / 2, D, h2, WT, s2Mat)
          const solidW = (W - dw * 0.7) / 2
          stB(wFX, h + h2 / 2, sz1 + solidW / 2, WT, h2, solidW, s2Mat)
          stB(wFX, h + h2 / 2, sz2 - solidW / 2, WT, h2, solidW, s2Mat)
          // Center window on 2F east face
          stB(wFX, h + h2 * 0.28, czM, WT, h2 * 0.50, dw * 0.65, s2Mat)
          stB(wFX - 0.01, h + h2 * 0.65, czM, WT - 0.02, h2 * 0.45, dw * 0.60, winM)
          stB(wFX, h + h2 * 0.93, czM, WT, h2 * 0.14, dw * 0.65, s2Mat)
          // 2F roof + parapet
          stB(cxM, h + h2 + 0.09, czM, D + 0.45, 0.18, W + 0.45, roofM)
          stB(wFX + 0.02, h + h2 + 0.09, czM, 0.14, 0.30, W + 0.45, trimM)
        }
      }

      // ── STORE 1: Grocery (2-story, cream/forest-green) ────────────────────
      buildStore(-29, -43, -50, -34, 4.5, 3.2, -42, 1.5,
        0xd8c89a, 0x2d5a1e, 0x3e4e2a, 0xb09070,
        0x2d5a1e, 0xf5f0e0, 3.5)
      // Produce shelves along north and south interior walls
      const prodMat = new THREE.MeshBasicMaterial({ color: 0x44aa22 })
      for (const [rx, rz] of [
        [-34,-49],[-36,-49],[-38,-49],[-40,-49],
        [-34,-35],[-36,-35],[-38,-35],[-40,-35],
      ] as [number,number][]) {
        stB(rx, 0.9, rz, 0.22, 1.8, 1.5, mktShelfMat)
        stB(rx, 1.42, rz, 0.28, 0.26, 1.3, prodMat)
      }
      // Cooler wall along back (tinted glass)
      stB(-42.5, 1.2, -42, 0.3, 2.4, 14, new THREE.MeshLambertMaterial({ color: 0x7899aa, transparent: true, opacity: 0.62 }))
      // Grocery interior light
      const grocPL = new THREE.PointLight(0xfff8ee, 0.7, 14); grocPL.position.set(-40, 3, -42); scene.add(grocPL)

      // ── STORE 2: Blue Boutique (1-story, navy/gold, small) ───────────────
      buildStore(-29, -37, -32, -25, 3.5, 0, -28.5, 1.0,
        0x1a2a5a, 0xc9a227, 0x111830, 0x8a7a6a,
        0xc9a227, 0x1a2a5a, 2.5)
      // Glass display case near entrance
      stB(-31.5, 0.36, -28.5, 0.6, 0.72, 1.8, new THREE.MeshLambertMaterial({ color: 0x8899aa, transparent: true, opacity: 0.55 }))
      stB(-31.5, 0.73, -28.5, 0.62, 0.06, 1.82, new THREE.MeshLambertMaterial({ color: 0x999999 }))
      const boutPL = new THREE.PointLight(0xffe8cc, 0.65, 10); boutPL.position.set(-33, 2.5, -28.5); scene.add(boutPL)

      // ── STORE 3: Electronics Shop (1-story, grey/cyan, medium) ────────────
      buildStore(-29, -39, -23, -15, 4.0, 0, -19, 1.2,
        0x888898, 0x3a3a4a, 0x2a2a34, 0x9a9aa8,
        0x3a3a4a, 0x00ccff, 3.0)
      // Work bench along south interior wall
      stB(-34, 0.45, -22.4, 10, 0.9, 0.55, new THREE.MeshLambertMaterial({ color: 0x5a5a6a }))
      stB(-34, 0.92, -22.4, 10.1, 0.06, 0.60, new THREE.MeshLambertMaterial({ color: 0x7a7a8a }))
      // Glowing screen display
      stB(-35, 1.50, -22.2, 1.4, 0.80, 0.08, new THREE.MeshBasicMaterial({ color: 0x003366 }))
      stB(-35, 1.50, -22.2, 1.2, 0.60, 0.09, new THREE.MeshBasicMaterial({ color: 0x0088ff }))
      const elecPL = new THREE.PointLight(0x4488ff, 0.65, 10); elecPL.position.set(-35, 2.2, -19); scene.add(elecPL)

      // ── STORE 4: Hardware Store (2-story, warm brown/tan, large) ──────────
      buildStore(-29, -45, -13, -1, 4.5, 3.0, -7, 1.5,
        0xa07848, 0x6a4a28, 0x5a3c22, 0x988060,
        0x6a4a28, 0xf5e8d0, 3.8)
      // Central shelving aisles
      for (const rz of [-11, -8, -5]) {
        stB(-37, 0.9, rz, 0.22, 1.8, 1.8, mktShelfMat)
        stB(-40, 0.9, rz, 0.22, 1.8, 1.8, mktShelfMat)
      }
      // Small outdoor tool rack east of storefront
      stB(-28.4, 0.45, -11, 0.1, 0.9, 0.9, new THREE.MeshLambertMaterial({ color: 0x8a6040 }))
      const hwPL = new THREE.PointLight(0xffe8cc, 0.65, 14); hwPL.position.set(-37, 3, -7); scene.add(hwPL)

      // ── STORE 5: Red Brick Shop (1-story, crimson, narrow) ────────────────
      buildStore(-29, -37, 1, 7, 3.2, 0, 4, 0.95,
        0x7a2a1a, 0x4a1a0a, 0x3a1a0a, 0x8a7060,
        0x4a1a0a, 0xffcc88, 2.5)
      // Horizontal brick course lines on south exterior wall
      const brickM = new THREE.MeshLambertMaterial({ color: 0x5a1808 })
      for (let bi = 0; bi < 8; bi++) {
        stB(-33, 0.3 + bi * 0.35, 0.72, 8, 0.04, 0.04, brickM)
      }
      const redPL = new THREE.PointLight(0xffaa66, 0.7, 9); redPL.position.set(-33, 2, 4); scene.add(redPL)

      // ── STORE 6: Cream Corner Shop (1-story, cream/teal, medium) ─────────
      buildStore(-29, -38, 9, 16, 3.8, 0, 12.5, 1.1,
        0xe8ddc0, 0x2a5a5a, 0x3a6a6a, 0xb8a888,
        0x2a5a5a, 0xf0ece0, 3.0)
      // Outdoor cafe table just east of storefront
      const cafeIron = new THREE.MeshLambertMaterial({ color: 0x3a3a3a })
      const cafeTop  = new THREE.MeshLambertMaterial({ color: 0xeeeecc })
      stB(-28.2, 0.68, 11.0, 0.08, 1.36, 0.08, cafeIron)
      stB(-28.2, 1.38, 11.0, 0.75, 0.06, 0.75, cafeTop)
      stB(-28.2, 0.30, 11.6, 0.06, 0.60, 0.06, cafeIron)
      stB(-28.2, 0.56, 11.6, 0.35, 0.05, 0.35, cafeIron)
      const creamPL = new THREE.PointLight(0xfff0dd, 0.6, 10); creamPL.position.set(-33.5, 2.5, 12.5); scene.add(creamPL)

      // ── Opposite row: west-facing stores (front at X=-24, extend east) ────────

      // West-facing sconce (arm protrudes into alley on the west side)
      const mkSconceW = (wallX: number, y: number, z: number) => {
        const iron = new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
        stB(wallX - 0.14, y + 0.32, z, 0.26, 0.05, 0.05, iron)
        stB(wallX - 0.27, y + 0.19, z, 0.15, 0.27, 0.15, iron)
        const gM = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.19, 0.09),
          new THREE.MeshBasicMaterial({ color: 0xffeeaa, transparent: true, opacity: 0.95 })
        )
        gM.position.set(wallX - 0.27, y + 0.19, z); scene.add(gM)
        const wsPL = new THREE.PointLight(0xffcc66, 0.9, 8)
        wsPL.position.set(wallX - 0.27, y, z); scene.add(wsPL)
      }

      // West-facing sign (protrudes west into alley)
      const mkSignW = (wallX: number, cy: number, cz: number, zW: number, boardC: number, textC: number) => {
        stB(wallX - 0.04, cy, cz, 0.08, 0.52, zW, new THREE.MeshLambertMaterial({ color: boardC }))
        stB(wallX - 0.045, cy, cz, 0.09, 0.30, zW * 0.73, new THREE.MeshBasicMaterial({ color: textC }))
      }

      // Build a west-facing store: sx1 = WEST (front/alley) face, sx2 = EAST (back) face, sx2 > sx1
      const buildStoreW = (
        sx1: number, sx2: number, sz1: number, sz2: number,
        h: number, h2: number,
        dz: number, dw: number,
        wallC: number, trimC: number, roofC: number, floorC: number,
        signC: number, signTC: number,
        countFront: number
      ) => {
        const WT  = 0.18
        const D   = sx2 - sx1
        const W   = sz2 - sz1
        const cxM = (sx1 + sx2) / 2
        const czM = (sz1 + sz2) / 2
        const dh  = Math.min(h - 0.35, 2.3)
        const wFX = sx1 - WT / 2  // front wall center X

        const wallM = new THREE.MeshLambertMaterial({ color: wallC })
        const trimM = new THREE.MeshLambertMaterial({ color: trimC })
        const roofM = new THREE.MeshLambertMaterial({ color: roofC })
        const winM  = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.38 })
        const doorM = new THREE.MeshLambertMaterial({ color: 0x5c3820 })
        const cntM  = new THREE.MeshLambertMaterial({ color: 0x7a6248 })
        const cntTM = new THREE.MeshLambertMaterial({ color: 0xa08060 })

        // Floor
        const wsFloor = new THREE.Mesh(
          new THREE.PlaneGeometry(D - WT * 2, W - WT * 2),
          new THREE.MeshLambertMaterial({ color: floorC })
        )
        wsFloor.rotation.x = -Math.PI / 2
        wsFloor.position.set(cxM, 0.01, czM)
        wsFloor.receiveShadow = true; scene.add(wsFloor)

        // Roof + front fascia (protrudes west)
        stB(cxM, h + 0.09, czM, D + 0.5, 0.18, W + 0.5, roofM)
        stB(wFX - 0.02, h + 0.09, czM, 0.15, 0.34, W + 0.5, trimM)

        // Back wall (east)
        stB(sx2 + WT / 2, h / 2, czM, WT, h, W + WT * 2, wallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(sx2, 0, sz1 - WT),
          new THREE.Vector3(sx2 + WT, h + 0.2, sz2 + WT)
        ))
        // North wall
        stB(cxM, h / 2, sz2 + WT / 2, D + WT * 2, h, WT, wallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(sx1 - WT, 0, sz2),
          new THREE.Vector3(sx2 + WT, h + 0.2, sz2 + WT)
        ))
        // South wall
        stB(cxM, h / 2, sz1 - WT / 2, D + WT * 2, h, WT, wallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(sx1 - WT, 0, sz1 - WT),
          new THREE.Vector3(sx2 + WT, h + 0.2, sz1)
        ))

        // Front wall sections (west face) with windows
        const mkFW = (sZ: number, eZ: number) => {
          const secW  = eZ - sZ
          const secCZ = (sZ + eZ) / 2
          const winW  = secW - 0.35
          if (secW > 1.5 && winW > 0.7) {
            stB(wFX, 0.45, secCZ, WT, 0.9, secW, wallM)
            stB(wFX, 1.8, secCZ, WT - 0.02, 1.8, winW, winM)
            stB(wFX - 0.04, 0.9, secCZ, 0.06, 0.06, winW + 0.1, trimM)
            if (h > 2.8) stB(wFX, 2.7 + (h - 2.7) / 2, secCZ, WT, h - 2.7, secW, wallM)
          } else {
            stB(wFX, h / 2, secCZ, WT, h, secW, wallM)
          }
        }
        const southGap = dz - dw / 2 - sz1
        const northGap = sz2 - (dz + dw / 2)
        if (southGap > 0.05) {
          mkFW(sz1, dz - dw / 2)
          wallBoxes.push(new THREE.Box3(new THREE.Vector3(sx1 - WT, 0, sz1), new THREE.Vector3(sx1, h + 0.2, dz - dw / 2)))
        }
        if (northGap > 0.05) {
          mkFW(dz + dw / 2, sz2)
          wallBoxes.push(new THREE.Box3(new THREE.Vector3(sx1 - WT, 0, dz + dw / 2), new THREE.Vector3(sx1, h + 0.2, sz2)))
        }
        if (h > dh + 0.25) stB(wFX, dh + (h - dh) / 2, dz, WT, h - dh, dw, wallM)

        // Corner trim pillars
        stB(wFX, h / 2, sz1 - WT / 2, WT * 1.8, h + 0.1, WT * 1.8, trimM)
        stB(wFX, h / 2, sz2 + WT / 2, WT * 1.8, h + 0.1, WT * 1.8, trimM)

        // Door (pivot on west face, opens inward/east with rotation PI/2)
        const wdPiv = new THREE.Group()
        wdPiv.position.set(sx1 - WT, 0, dz - dw / 2)
        const wdPanel = new THREE.Mesh(new THREE.BoxGeometry(WT, dh, dw), doorM)
        wdPanel.position.set(0, dh / 2, dw / 2)
        wdPiv.add(wdPanel); scene.add(wdPiv)
        const wdBox = new THREE.Box3(
          new THREE.Vector3(sx1 - WT, 0, dz - dw / 2),
          new THREE.Vector3(sx1, dh, dz + dw / 2)
        )
        wallBoxes.push(wdBox)
        shackDoors.push({ pivot: wdPiv, doorBox: wdBox, worldCenter: new THREE.Vector3(sx1 - WT / 2, 1, dz), open: false })

        // Sconces + sign on west face
        mkSconceW(sx1 - WT, h - 0.65, dz - dw / 2 - 0.42)
        mkSconceW(sx1 - WT, h - 0.65, dz + dw / 2 + 0.42)
        mkSignW(sx1 - WT, h - 0.7, dz, Math.min(W * 0.38, 3.5), signC, signTC)

        // Counter (east of front wall, parallel to it)
        stB(sx1 + countFront, 0.45, czM, 0.55, 0.9, W * 0.45, cntM)
        stB(sx1 + countFront, 0.92, czM, 0.60, 0.06, W * 0.45 + 0.1, cntTM)

        // Backroom divider (1/3 depth from east/back wall)
        const wbX  = sx2 - D * 0.33
        const wbDH = Math.min(h - 0.3, 2.1)
        const wbL  = czM - 0.45 - sz1
        const wbR  = sz2 - (czM + 0.45)
        if (wbL > 0.1) { stB(wbX, h / 2, sz1 + wbL / 2, WT, h, wbL, wallM); wallBoxes.push(new THREE.Box3(new THREE.Vector3(wbX - WT / 2, 0, sz1), new THREE.Vector3(wbX + WT / 2, h, czM - 0.45))) }
        if (wbR > 0.1) { stB(wbX, h / 2, sz2 - wbR / 2, WT, h, wbR, wallM); wallBoxes.push(new THREE.Box3(new THREE.Vector3(wbX - WT / 2, 0, czM + 0.45), new THREE.Vector3(wbX + WT / 2, h, sz2))) }
        if (h > wbDH + 0.25) stB(wbX, wbDH + (h - wbDH) / 2, czM, WT, h - wbDH, 0.9, wallM)
        const wbPiv = new THREE.Group()
        wbPiv.position.set(wbX - WT / 2, 0, czM - 0.45)
        const wbP = new THREE.Mesh(new THREE.BoxGeometry(WT, wbDH, 0.9), doorM)
        wbP.position.set(0, wbDH / 2, 0.45); wbPiv.add(wbP); scene.add(wbPiv)
        const wbDBox = new THREE.Box3(new THREE.Vector3(wbX - WT, 0, czM - 0.45), new THREE.Vector3(wbX, wbDH, czM + 0.45))
        wallBoxes.push(wbDBox)
        shackDoors.push({ pivot: wbPiv, doorBox: wbDBox, worldCenter: new THREE.Vector3(wbX, 1, czM), open: false })

        // Second story
        if (h2 > 0) {
          const ws2M = new THREE.MeshLambertMaterial({ color: Math.min(wallC + 0x181818, 0xffffff) })
          stB(cxM, h + 0.19, czM, D - WT * 2, 0.2, W - WT * 2, new THREE.MeshLambertMaterial({ color: 0x888877 }))
          stB(sx2 + WT / 2, h + h2 / 2, czM, WT, h2, W, ws2M)
          stB(cxM, h + h2 / 2, sz2 + WT / 2, D, h2, WT, ws2M)
          stB(cxM, h + h2 / 2, sz1 - WT / 2, D, h2, WT, ws2M)
          const ws2solidW = (W - dw * 0.7) / 2
          stB(wFX, h + h2 / 2, sz1 + ws2solidW / 2, WT, h2, ws2solidW, ws2M)
          stB(wFX, h + h2 / 2, sz2 - ws2solidW / 2, WT, h2, ws2solidW, ws2M)
          stB(wFX, h + h2 * 0.28, czM, WT, h2 * 0.50, dw * 0.65, ws2M)
          stB(wFX - 0.01, h + h2 * 0.65, czM, WT - 0.02, h2 * 0.45, dw * 0.60, winM)
          stB(wFX, h + h2 * 0.93, czM, WT, h2 * 0.14, dw * 0.65, ws2M)
          stB(cxM, h + h2 + 0.09, czM, D + 0.45, 0.18, W + 0.45, roofM)
          stB(wFX - 0.02, h + h2 + 0.09, czM, 0.14, 0.30, W + 0.45, trimM)
        }
      }

      // ── STORE A: Olive Warehouse (2-story, dark olive/brown) ──────────────
      buildStoreW(-24, -16, -50, -36, 4.5, 3.0, -43, 1.3,
        0x8a9a4a, 0x6a5228, 0x5a6a30, 0x9a8860,
        0x6a5228, 0xf5ece0, 3.5)
      // Storage crates along east wall
      const crateMat = new THREE.MeshLambertMaterial({ color: 0x7a6040 })
      for (const [rx, rz] of [[-17,-48],[-17,-45],[-17,-42],[-17,-39]] as [number,number][]) {
        stB(rx, 0.55, rz, 1.6, 1.1, 1.6, crateMat)
        stB(rx, 1.15, rz, 1.62, 0.08, 1.62, new THREE.MeshLambertMaterial({ color: 0x5a4828 }))
      }
      const warehPL = new THREE.PointLight(0xfff0cc, 0.7, 16); warehPL.position.set(-20, 3.5, -43); scene.add(warehPL)

      // ── STORE B: Orange Spice Market (1-story, warm orange/red) ──────────
      buildStoreW(-24, -19, -33, -24, 3.5, 0, -28.5, 1.0,
        0xc88048, 0x7a3a18, 0x5a3018, 0x9a7850,
        0x7a3a18, 0xffe0aa, 2.0)
      // Colorful hanging fabric strips (stacked flat boxes)
      const fab1 = new THREE.MeshBasicMaterial({ color: 0xff6622 })
      const fab2 = new THREE.MeshBasicMaterial({ color: 0xffaa00 })
      const fab3 = new THREE.MeshBasicMaterial({ color: 0xcc2222 })
      for (let fi = 0; fi < 5; fi++) {
        stB(-24.1, 1.0 + fi * 0.4, -28.5 + (fi % 3) * 0.5, 0.05, 0.35, 0.9, [fab1, fab2, fab3][fi % 3])
      }
      const spicePL = new THREE.PointLight(0xff8833, 0.7, 10); spicePL.position.set(-21.5, 2.5, -28.5); scene.add(spicePL)

      // ── STORE C: Purple Curiosity Shop (1-story, deep purple/gold) ───────
      buildStoreW(-24, -19, -22, -14, 3.8, 0, -18, 1.0,
        0x4a2a6a, 0xd4aa44, 0x2a1a4a, 0x3a2a4a,
        0xd4aa44, 0x2a1a4a, 2.0)
      // Glowing glass display cases
      const curioMat  = new THREE.MeshLambertMaterial({ color: 0x8844aa, transparent: true, opacity: 0.5 })
      const curioGlow = new THREE.MeshBasicMaterial({ color: 0x9922cc })
      for (const [rx, rz] of [[-26,-20],[-26,-16]] as [number,number][]) {
        stB(rx, 0.36, rz, 0.5, 0.72, 0.7, curioMat)
        stB(rx, 0.73, rz, 0.52, 0.06, 0.72, new THREE.MeshLambertMaterial({ color: 0x888899 }))
        stB(rx, 0.55, rz, 0.52, 0.06, 0.72, curioGlow)
      }
      const curPL = new THREE.PointLight(0xaa44ff, 0.9, 10); curPL.position.set(-21.5, 2.5, -18); scene.add(curPL)

      // ── STORE D: Yellow General Store (2-story, warm yellow/amber) ───────
      buildStoreW(-24, -16, -12, 2, 4.5, 3.2, -5, 1.4,
        0xe0d080, 0x8a7020, 0x5a5020, 0xb0a070,
        0x8a7020, 0xf5ece0, 3.5)
      // Central table with goods
      stB(-20, 0.45, -5, 1.6, 0.9, 3.2, new THREE.MeshLambertMaterial({ color: 0x8a6840 }))
      stB(-20, 0.92, -5, 1.65, 0.06, 3.25, new THREE.MeshLambertMaterial({ color: 0xaaa078 }))
      // Barrels along south wall
      const brl2 = new THREE.MeshLambertMaterial({ color: 0x5a3a20 })
      for (const rz of [-10, -8, -6]) {
        stB(-15.5, 0.35, rz, 0.44, 0.7, 0.44, brl2)
      }
      const genPL = new THREE.PointLight(0xffe8aa, 0.7, 16); genPL.position.set(-20, 3, -5); scene.add(genPL)

      // ── STORE E: Teal Garden Shop (1-story, teal/sage) ────────────────────
      buildStoreW(-24, -18, 4, 17, 3.8, 0, 10.5, 1.1,
        0x4a8a7a, 0x2a4a5a, 0x1a3a4a, 0x7a9080,
        0x2a4a5a, 0xd0f0e0, 2.5)
      // Potted plants + planter boxes
      const plantMat = new THREE.MeshLambertMaterial({ color: 0x226622 })
      const potMat   = new THREE.MeshLambertMaterial({ color: 0xaa7744 })
      for (const [rx, rz] of [[-26,6],[-26,9],[-26,12],[-26,15]] as [number,number][]) {
        stB(rx, 0.25, rz, 0.35, 0.5, 0.35, potMat)
        stB(rx, 0.7, rz, 0.3, 0.55, 0.3, plantMat)
      }
      // Hanging planter along front ceiling
      for (const rz of [6.5, 9, 11.5, 14]) {
        stB(-24.1, 3.4, rz, 0.08, 0.4, 0.08, new THREE.MeshLambertMaterial({ color: 0x333333 }))
        stB(-24.1, 3.1, rz, 0.25, 0.22, 0.25, potMat)
        stB(-24.1, 2.9, rz, 0.18, 0.28, 0.18, plantMat)
      }
      const gardenPL = new THREE.PointLight(0xaaffcc, 0.6, 12); gardenPL.position.set(-21, 2.5, 10.5); scene.add(gardenPL)

      // Arena wall removed

      // ── Chancellor's Market Square (south of shantytown, X=35, Z=52) ──────────
      {
        const sqCX = 35, sqCZ = 52

        const plazaStone = new THREE.MeshLambertMaterial({ color: 0x6e6b5c })
        const stepStone  = new THREE.MeshLambertMaterial({ color: 0x9a9888 })
        const pedGran    = new THREE.MeshLambertMaterial({ color: 0x1e1c1a })
        const statCoat   = new THREE.MeshLambertMaterial({ color: 0x1a1818 })
        const statBrz    = new THREE.MeshLambertMaterial({ color: 0x6a4820 })
        const statFace   = new THREE.MeshLambertMaterial({ color: 0x8a6840 })
        const medalGold  = new THREE.MeshBasicMaterial({ color: 0xffcc00 })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sqCyl = (x: number, y: number, z: number, r: number, h: number, mat: any) => {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), mat)
          m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m)
        }

        // Cobblestone plaza floor (radius 18)
        sqCyl(sqCX, 0.15, sqCZ, 18, 0.3, plazaStone)

        // Three concentric step rings ascending toward center
        sqCyl(sqCX, 0.49, sqCZ, 13, 0.38, stepStone)  // outer step
        sqCyl(sqCX, 0.87, sqCZ, 9,  0.38, stepStone)  // mid step
        sqCyl(sqCX, 1.25, sqCZ, 6,  0.38, stepStone)  // inner step

        // Central raised platform (dark granite, radius 4)
        sqCyl(sqCX, 1.715, sqCZ, 4, 0.55, pedGran)

        // Pedestal shaft with base and top molding
        stB(sqCX, 2.04,  sqCZ, 3.4, 0.28, 3.4, pedGran)  // base molding
        stB(sqCX, 3.89,  sqCZ, 2.8, 3.5,  2.8, pedGran)  // shaft
        stB(sqCX, 5.765, sqCZ, 3.4, 0.28, 3.4, pedGran)  // top cap

        // Collision — players can't walk through the pedestal
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(sqCX - 1.7, 0, sqCZ - 1.7),
          new THREE.Vector3(sqCX + 1.7, 9, sqCZ + 1.7)
        ))

        // ── The Chancellor Statue ──────────────────────────────────────────────
        const chG = new THREE.Group()
        chG.position.set(sqCX, 5.905, sqCZ)  // on top of pedestal cap

        // Boots
        for (const bx of [-0.22, 0.22]) {
          const boot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.48), statCoat)
          boot.position.set(bx, 0.1, -0.04); boot.castShadow = true; chG.add(boot)
        }

        // Legs (trousers)
        const trouserStripe = new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
        for (const lx of [-0.22, 0.22]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.78, 0.34), statCoat)
          leg.position.set(lx, 0.59, 0); leg.castShadow = true; chG.add(leg)
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.78, 0.04), trouserStripe)
          stripe.position.set(lx, 0.59, -0.16); chG.add(stripe)
        }

        // Torso / military greatcoat
        const chBody = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.08, 0.48), statCoat)
        chBody.position.y = 1.28; chBody.castShadow = true; chG.add(chBody)

        // Chest medals (four gold squares)
        for (let mi = 0; mi < 4; mi++) {
          const medal = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.07), medalGold)
          medal.position.set(-0.32 + mi * 0.19, 1.35, -0.28); chG.add(medal)
        }

        // Flowing cape (behind torso)
        const chCape = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.62, 0.16), statCoat)
        chCape.position.set(0, 1.06, 0.28); chCape.castShadow = true; chG.add(chCape)

        // Gold epaulettes
        for (const ex of [-0.58, 0.58]) {
          const ep = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.38), medalGold)
          ep.position.set(ex, 1.76, 0); chG.add(ep)
        }

        // Neck + head
        const chNeck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.24), statFace)
        chNeck.position.y = 1.88; chG.add(chNeck)
        const chHead = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.54), statFace)
        chHead.position.y = 2.25; chHead.castShadow = true; chG.add(chHead)

        // Military peaked cap
        const chBrim = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.09, 0.72), statCoat)
        chBrim.position.y = 2.56; chG.add(chBrim)
        const chCapTop = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.38, 0.56), statCoat)
        chCapTop.position.y = 2.77; chG.add(chCapTop)
        const chBadge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.05), medalGold)
        chBadge.position.set(0, 2.58, -0.28); chG.add(chBadge)

        // Left arm — at side, slight forward angle
        const chLArmG = new THREE.Group()
        chLArmG.position.set(-0.62, 1.76, 0); chLArmG.rotation.x = 0.18
        const chLUpper = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.54, 0.32), statCoat)
        chLUpper.position.y = -0.27; chLArmG.add(chLUpper)
        const chLFore = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.48, 0.28), statBrz)
        chLFore.position.y = -0.77; chLArmG.add(chLFore)
        chG.add(chLArmG)

        // Right arm — raised in commanding pointing gesture
        const chRArmG = new THREE.Group()
        chRArmG.position.set(0.62, 1.76, 0)
        chRArmG.rotation.x = -1.15; chRArmG.rotation.z = -0.2
        const chRUpper = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.54, 0.32), statCoat)
        chRUpper.position.y = -0.27; chRArmG.add(chRUpper)
        const chRFore = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.48, 0.28), statBrz)
        chRFore.position.y = -0.77; chRArmG.add(chRFore)
        const chRHand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.26), statFace)
        chRHand.position.y = -1.03; chRArmG.add(chRHand)
        chG.add(chRArmG)

        scene.add(chG)

        // Dramatic upward lighting on the statue
        const chLight = new THREE.PointLight(0xfff0dd, 1.6, 24)
        chLight.position.set(sqCX, 2.5, sqCZ - 2); scene.add(chLight)

        // ── Market stalls ringing the outer plaza (radius 15.5) ───────────────
        const stallWoodM  = new THREE.MeshLambertMaterial({ color: 0x7a5a38 })
        const stallColors = [0x8a2a2a, 0x2a5a8a, 0x5a8a2a, 0x8a6a22, 0x7a2a7a, 0xaa5522, 0x225a5a, 0x6a2222]

        const mkStall = (angle: number, roofColor: number) => {
          const r = 15.5
          const sx = sqCX + Math.sin(angle) * r
          const sz = sqCZ + Math.cos(angle) * r
          const stallG = new THREE.Group()
          stallG.rotation.y = -angle

          for (const [px, pz] of [[-0.72,-0.42],[0.72,-0.42],[-0.72,0.42],[0.72,0.42]] as [number,number][]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), stallWoodM)
            post.position.set(px, 1.15, pz); stallG.add(post)
          }
          const ctr = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.09, 0.9), stallWoodM)
          ctr.position.set(0, 0.92, 0); stallG.add(ctr)
          const ctrFace = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.9, 0.09), stallWoodM)
          ctrFace.position.set(0, 0.46, -0.44); stallG.add(ctrFace)
          const roofMst = new THREE.MeshLambertMaterial({ color: roofColor })
          const awning = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.12, 1.15), roofMst)
          awning.position.set(0, 2.2, -0.04); stallG.add(awning)
          const flap = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.06, 0.52), roofMst)
          flap.rotation.x = 0.45; flap.position.set(0, 2.04, -0.72); stallG.add(flap)

          stallG.position.set(sx, 0, sz); scene.add(stallG)

          wallBoxes.push(new THREE.Box3(
            new THREE.Vector3(sx - 1.1, 0, sz - 0.7),
            new THREE.Vector3(sx + 1.1, 2.35, sz + 0.7)
          ))
        }

        for (let i = 0; i < 8; i++) mkStall((i / 8) * Math.PI * 2, stallColors[i])

        // ── Lamp posts at radius 11, offset from stalls ───────────────────────
        const sqIronM = new THREE.MeshLambertMaterial({ color: 0x1a1010 })
        const sqLensM = new THREE.MeshBasicMaterial({ color: 0xfffae0 })

        const mkPlazaLamp = (angle: number) => {
          const r = 11
          const lx = sqCX + Math.sin(angle) * r
          const lz = sqCZ + Math.cos(angle) * r
          stB(lx, 2.75, lz, 0.11, 5.5, 0.11, sqIronM)
          stB(lx, 5.4, lz - 0.25, 0.08, 0.08, 0.6, sqIronM)
          stB(lx, 5.5, lz - 0.64, 0.08, 0.24, 0.08, sqIronM)
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.26), sqLensM)
          lamp.position.set(lx, 5.36, lz - 0.64); scene.add(lamp)
          const pl = new THREE.PointLight(0xffeecc, 1.1, 18)
          pl.position.set(lx, 5.1, lz - 0.64); scene.add(pl)
        }

        for (let i = 0; i < 8; i++) mkPlazaLamp((i / 8) * Math.PI * 2 + Math.PI / 8)
      }

      // ── Water Tower (northeast corner: X=52 Z=-45, platform at Y=9) ──────────
      {
        const wtCX = 52, wtCZ = -45, wtPY = 9.0, wtLeg = 2.2
        const wtWood = new THREE.MeshLambertMaterial({ color: 0x5a3520 })
        const wtTankM = new THREE.MeshLambertMaterial({ color: 0x7a5032 })
        const wtIron = new THREE.MeshLambertMaterial({ color: 0x242424 })
        const wtRoofM = new THREE.MeshLambertMaterial({ color: 0x3a3a3a })

        // Legs (4 corners)
        for (const [lx, lz] of [[wtLeg,wtLeg],[-wtLeg,wtLeg],[wtLeg,-wtLeg],[-wtLeg,-wtLeg]] as [number,number][]) {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, wtPY, 8), wtWood)
          l.position.set(wtCX + lx, wtPY / 2, wtCZ + lz); l.castShadow = true; scene.add(l)
        }
        // Cross-braces
        for (const bz of [wtLeg, -wtLeg]) {
          for (const by of [2.5, 5.5]) stB(wtCX, by, wtCZ + bz, wtLeg * 2, 0.1, 0.1, wtWood)
        }
        for (const bx of [wtLeg, -wtLeg]) {
          for (const by of [2.5, 5.5]) stB(wtCX + bx, by, wtCZ, 0.1, 0.1, wtLeg * 2, wtWood)
        }

        // Platform deck (top surface at y=wtPY)
        stB(wtCX, wtPY - 0.1, wtCZ, 8.0, 0.2, 8.0, wtWood)

        // Railing posts — N/E/W full, S with center gap for ladder exit
        const rpH = 0.9, deckR = 4.0, rpY = wtPY + rpH / 2
        for (const ox of [-deckR, -deckR/2, 0, deckR/2, deckR])
          stB(wtCX + ox, rpY, wtCZ - deckR, 0.08, rpH, 0.08, wtIron) // N
        for (const oz of [-deckR, -deckR/2, 0, deckR/2, deckR]) {
          stB(wtCX + deckR, rpY, wtCZ + oz, 0.08, rpH, 0.08, wtIron) // E
          stB(wtCX - deckR, rpY, wtCZ + oz, 0.08, rpH, 0.08, wtIron) // W
        }
        stB(wtCX + deckR, rpY, wtCZ + deckR, 0.08, rpH, 0.08, wtIron) // S corner E
        stB(wtCX - deckR, rpY, wtCZ + deckR, 0.08, rpH, 0.08, wtIron) // S corner W
        for (const dy of [0.3, 0.72]) {
          stB(wtCX,          wtPY + dy, wtCZ - deckR, 8.0, 0.05, 0.05, wtIron) // N bar
          stB(wtCX + deckR,  wtPY + dy, wtCZ,         0.05, 0.05, 8.0, wtIron) // E bar
          stB(wtCX - deckR,  wtPY + dy, wtCZ,         0.05, 0.05, 8.0, wtIron) // W bar
          stB(wtCX + 2.5,    wtPY + dy, wtCZ + deckR, 3.0, 0.05, 0.05, wtIron) // S bar E
          stB(wtCX - 2.5,    wtPY + dy, wtCZ + deckR, 3.0, 0.05, 0.05, wtIron) // S bar W
        }

        // Water tank
        const wtTankMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.0, 5.0, 12), wtTankM)
        wtTankMesh.position.set(wtCX, wtPY + 2.5, wtCZ); wtTankMesh.castShadow = true; scene.add(wtTankMesh)
        // Iron bands around tank
        for (const by of [0.5, 2.0, 3.6]) {
          const band = new THREE.Mesh(new THREE.CylinderGeometry(3.06, 3.06, 0.14, 12), wtIron)
          band.position.set(wtCX, wtPY + by, wtCZ); scene.add(band)
        }
        // Conical tin roof
        const wtRoofMesh = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.8, 12), wtRoofM)
        wtRoofMesh.position.set(wtCX, wtPY + 5.9, wtCZ); scene.add(wtRoofMesh)

        // Ladder (south face: z = wtCZ + deckR + 0.12 = -40.88, y=0 to y=wtPY)
        const ladZ = wtCZ + deckR + 0.12
        for (const lx of [-0.19, 0.19])
          stB(wtCX + lx, wtPY / 2, ladZ, 0.06, wtPY, 0.06, wtIron) // vertical rails
        for (let ry = 0.5; ry <= wtPY - 0.4; ry += 0.65)
          stB(wtCX, ry, ladZ, 0.36, 0.06, 0.08, wtIron) // rungs

        // Lantern at top
        const wtLight = new THREE.PointLight(0xffcc66, 0.9, 22)
        wtLight.position.set(wtCX, wtPY + 7.5, wtCZ); scene.add(wtLight)
      }

      // ── Local player ───────────────────────────────────────
      const { group: player, leftArm, rightArm, leftLeg, rightLeg } = buildPlayer(0x1565c0)
      scene.add(player)
      player.visible = false

      // ── Zombie spawning (underground subway) ─────────────
      // Zombie meshes indexed by server ID (deterministic, matches server spawn positions)
      const zombieMeshToId = new Map<THREE.Mesh, number>()
      const serverZombieAlive: boolean[] = Array(8).fill(true)
      for (let i = 0; i < 8; i++) {
        const sx = subCX + ((i / 7) * subHW * 1.6 - subHW * 0.8)
        const sz = -16 + i * 4
        const { group, head, body, leftArm: zLA, rightArm: zRA, leftLeg: zLL, rightLeg: zRL } = buildZombie()
        group.position.set(sx, subFY, sz)
        scene.add(group)
        const zm: ZombieMesh = { id: i, group, body, head, leftArm: zLA, rightArm: zRA, leftLeg: zLL, rightLeg: zRL }
        zombieMeshesRef.current.push(zm)
        zombieMeshToId.set(body, i)
        zombieMeshToId.set(head, i)
      }

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

      // Mini gun mesh (shown in slot 5 when purchased)
      const mgMat    = new THREE.MeshLambertMaterial({ color: 0x222222 })
      const mgAccent = new THREE.MeshLambertMaterial({ color: 0x555566 })
      const mgGroup  = new THREE.Group()
      mgGroup.position.set(0, -0.76, 0)
      const mgBody   = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.38), mgMat)
      mgBody.position.set(0, -0.08, -0.22)
      const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.52, 6), mgMat)
      mgBarrel.rotation.x = Math.PI / 2; mgBarrel.position.set(0, -0.06, -0.46)
      const mgMag    = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.07), mgAccent)
      mgMag.position.set(0, -0.18, -0.18)
      const mgStock  = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.14), mgAccent)
      mgStock.position.set(0, -0.10, -0.01)
      mgGroup.add(mgBody, mgBarrel, mgMag, mgStock)
      mgGroup.visible = false
      rightArm.add(mgGroup)

      // Pistol mesh (slot 6, buyable)
      const pistolMat    = new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
      const pistolAccent = new THREE.MeshLambertMaterial({ color: 0x3a3a3a })
      const pistolGroup  = new THREE.Group()
      pistolGroup.position.set(0, -0.76, 0)
      const pBody   = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.26), pistolMat)
      pBody.position.set(0, -0.06, -0.18)
      const pBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), pistolMat)
      pBarrel.rotation.x = Math.PI / 2; pBarrel.position.set(0, -0.04, -0.38)
      const pGrip   = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.09), pistolAccent)
      pGrip.rotation.x = 0.28; pGrip.position.set(0, -0.19, -0.08)
      pistolGroup.add(pBody, pBarrel, pGrip)
      pistolGroup.visible = false
      rightArm.add(pistolGroup)

      // Uzi mesh (slot 7, buyable)
      const uziMat    = new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
      const uziAccent = new THREE.MeshLambertMaterial({ color: 0x4a4a4a })
      const uziGroup  = new THREE.Group()
      uziGroup.position.set(0, -0.76, 0)
      const uziBody   = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.32), uziMat)
      uziBody.position.set(0, -0.05, -0.20)
      const uziBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 6), uziMat)
      uziBarrel.rotation.x = Math.PI / 2; uziBarrel.position.set(0, -0.04, -0.42)
      const uziMag    = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.20, 0.06), uziAccent)
      uziMag.position.set(0, -0.20, -0.14)
      const uziStock  = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.10), uziAccent)
      uziStock.position.set(0, -0.08, -0.01)
      uziGroup.add(uziBody, uziBarrel, uziMag, uziStock)
      uziGroup.visible = false
      rightArm.add(uziGroup)

      // Bullet tracers
      type BulletTracer = { mesh: THREE.Mesh; vel: THREE.Vector3; age: number }
      const tracers: BulletTracer[] = []
      let mgCooldown = 0

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
        if (e.code === 'Digit5') { activeSlotRef.current = 4; setActiveSlot(4) }
        if (e.code === 'Digit6') { activeSlotRef.current = 5; setActiveSlot(5) }
        if (e.code === 'Digit7') { activeSlotRef.current = 6; setActiveSlot(6) }
        if (e.code === 'KeyE') {
          for (const sd of shackDoors) {
            if (player.position.distanceTo(sd.worldCenter) < 3.5) {
              sd.open = !sd.open
              if (sd.open) openShackDoorBoxes.add(sd.doorBox)
              else openShackDoorBoxes.delete(sd.doorBox)
              break
            }
          }
        }
        if (e.code === 'KeyM') {
          const next = !buyMenuOpenRef.current
          buyMenuOpenRef.current = next
          setBuyMenuOpen(next)
          if (next && document.pointerLockElement === renderer.domElement) document.exitPointerLock()
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

      // ── Camera control (Pointer Lock FPS) ─────────────────
      let cameraAngle = 0
      let playerAngle = 0
      let camPitch = 0

      // Click canvas to capture mouse; ESC releases (browser default)
      renderer.domElement.addEventListener('click', () => {
        renderer.domElement.requestPointerLock()
      }, { signal: sig })

      document.addEventListener('mousemove', (e: MouseEvent) => {
        if (document.pointerLockElement !== renderer.domElement) return
        cameraAngle -= e.movementX * 0.003
        camPitch = Math.max(-1.4, Math.min(1.4, camPitch - e.movementY * 0.003))
      }, { signal: sig })

      // Only register weapon-fire when pointer is already locked (ignore the lock-in click)
      renderer.domElement.addEventListener('mousedown', () => {
        if (document.pointerLockElement === renderer.domElement) {
          mouseDownRef.current = true
          pendingShotRef.current = true
        }
      }, { signal: sig })
      window.addEventListener('mouseup', () => { mouseDownRef.current = false }, { signal: sig })
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
        cameraAngle -= (e.touches[0].clientX - lastTouchX) * 0.005
        camPitch = Math.max(-1.4, Math.min(1.4, camPitch - (e.touches[0].clientY - lastTouchY) * 0.005))
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

      // Server-authoritative position correction
      let serverX = 0, serverZ = 0
      // Display tracking vars (hoisted here so the WS handler can update them)
      let lastDispHealth = 100, lastDispMoney = 10000, lastDispCountdown = 30

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
        wsRef.current = ws

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
            type SP = {
              id: string; x: number; y: number; z: number; angle: number
              health: number; money: number; stamina: number
              isDead: boolean; respawnTicks: number
              hasPistol: boolean; hasMiniGun: boolean; hasUzi: boolean
              uziAmmo: number; uziReloading: boolean
              drugLabCount: number; drugLabs: { x: number; z: number }[]
            }
            type SZ = { id: number; x: number; y: number; z: number; angle: number; state: ServerZombieState; walkTime: number }
            const pList = msg.players as SP[]
            const zList = msg.zombies as SZ[]
            const activeIds = new Set<string>()

            for (const p of pList) {
              activeIds.add(p.id)

              if (p.id === myId) {
                // Position correction
                serverX = p.x; serverZ = p.z

                // Health bar
                if (p.health !== lastDispHealth) {
                  lastDispHealth = p.health
                  setPlayerHealth(p.health)
                  if (healthBarRef.current) {
                    healthBarRef.current.style.width = `${p.health}%`
                    healthBarRef.current.style.background = p.health > 60 ? '#44dd44' : p.health > 30 ? '#ffaa00' : '#ff2200'
                  }
                }
                // Stamina bar
                if (staminaBarRef.current) {
                  staminaBarRef.current.style.width = `${p.stamina * 100}%`
                  staminaBarRef.current.style.background = p.stamina > 0.5 ? '#39ff14' : p.stamina > 0.25 ? '#ffaa00' : '#ff3300'
                }
                // Money
                if (p.money !== lastDispMoney) {
                  lastDispMoney = p.money
                  playerMoneyRef.current = p.money
                  setPlayerMoney(p.money)
                }
                // Death / respawn
                if (p.isDead !== isDeadRef.current) {
                  isDeadRef.current = p.isDead
                  setIsDead(p.isDead)
                  if (!p.isDead) {
                    player.position.set(serverX, p.y, serverZ)
                    playerHealthRef.current = 100
                  }
                }
                if (p.isDead) {
                  const cd = Math.ceil(p.respawnTicks / 20)
                  if (cd !== lastDispCountdown) { lastDispCountdown = cd; setRespawnCountdown(cd) }
                }
                // Weapons
                hasPistolRef.current = p.hasPistol; setHasPistol(p.hasPistol)
                hasMiniGunRef.current = p.hasMiniGun; setHasMiniGun(p.hasMiniGun)
                hasUziRef.current = p.hasUzi; setHasUzi(p.hasUzi)
                if (p.uziAmmo !== uziAmmoRef.current) { uziAmmoRef.current = p.uziAmmo; setUziAmmo(p.uziAmmo) }
                if (p.uziReloading !== uziReloadingRef.current) { uziReloadingRef.current = p.uziReloading; setUziReloading(p.uziReloading) }
                // Drug labs — create Three.js meshes as server confirms new ones
                while (drugLabsRef.current.length < p.drugLabs.length) {
                  const pos = p.drugLabs[drugLabsRef.current.length]
                  const lab = buildDrugLab(pos.x, pos.z)
                  drugLabsRef.current.push({ ...lab, incomeTimer: 0 })
                }
                setDrugLabCount(p.drugLabCount)
                continue
              }

              // Remote players
              if (!remotePlayers.has(p.id)) {
                const color = shirtColorFromId(p.id)
                const built = buildPlayer(color)
                built.group.position.set(p.x, p.y, p.z)
                built.group.rotation.y = p.angle
                scene.add(built.group)
                remotePlayers.set(p.id, {
                  group: built.group,
                  targetX: p.x, targetZ: p.z, targetAngle: p.angle,
                  walkTime: 0,
                  leftArm: built.leftArm, rightArm: built.rightArm,
                  leftLeg: built.leftLeg, rightLeg: built.rightLeg,
                })
              } else {
                const rp = remotePlayers.get(p.id)!
                rp.targetX = p.x; rp.targetZ = p.z; rp.targetAngle = p.angle
              }
            }

            for (const [id, rp] of remotePlayers) {
              if (!activeIds.has(id)) { scene.remove(rp.group); remotePlayers.delete(id) }
            }

            // Apply server zombie state to meshes
            for (const zs of zList) {
              const zm = zombieMeshesRef.current[zs.id]
              if (!zm) continue
              serverZombieAlive[zs.id] = zs.state !== 'dead'
              zm.group.visible = zs.state !== 'dead'
              if (zs.state !== 'dead') {
                zm.group.position.set(zs.x, zs.y, zs.z)
                zm.group.rotation.y = zs.angle
                const sv = zs.state === 'chasing' || zs.state === 'attacking'
                  ? Math.sin(zs.walkTime) * 0.55
                  : Math.sin(zs.walkTime) * 0.25
                zm.leftLeg.rotation.x = -sv; zm.rightLeg.rotation.x = sv
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
      let lastInputSend = 0
      let uziVisualCooldown = 0
      let jumpVelY = 0
      let isGrounded = true
      let spaceWas = false

      const raycaster = new THREE.Raycaster()
      let flashTimer = 0

      const loop = () => {
        if (disposed) return
        rafId = requestAnimationFrame(loop)

        // ── Respawn countdown ──────────────────────────────
        if (isDeadRef.current) {
          respawnTimerRef.current--
          const cd = Math.ceil(Math.max(0, respawnTimerRef.current) / 60)
          if (cd !== lastDispCountdown) { lastDispCountdown = cd; setRespawnCountdown(cd) }
          if (respawnTimerRef.current <= 0) {
            isDeadRef.current = false; setIsDead(false)
            player.position.set(0, 0, 0)
            playerHealthRef.current = 100; lastDispHealth = 100; setPlayerHealth(100)
            if (healthBarRef.current) {
              healthBarRef.current.style.width = '100%'
              healthBarRef.current.style.background = '#44dd44'
            }
            lastDamageRef.current = 0
          }
        }

        const playerActive = !isDeadRef.current && !buyMenuOpenRef.current

        // ── Stamina + movement (only when alive and not in menu) ──
        let moving = false
        if (playerActive) {
          const shift = !!(keys['ShiftLeft'] || keys['ShiftRight'])
          isSprinting = shift && stamina > 0
          if (isSprinting) stamina = Math.max(0, stamina - 0.008)
          else             stamina = Math.min(1, stamina + 0.004)
          if (staminaBarRef.current) {
            staminaBarRef.current.style.width = `${stamina * 100}%`
            staminaBarRef.current.style.background = stamina > 0.5 ? '#39ff14' : stamina > 0.25 ? '#ffaa00' : '#ff3300'
          }

          const w = !!(keys['KeyW'] || keys['ArrowUp'])
          const s = !!(keys['KeyS'] || keys['ArrowDown'])
          const a = !!(keys['KeyA'] || keys['ArrowLeft'])
          const d = !!(keys['KeyD'] || keys['ArrowRight'])
          moving = w || s || a || d

          const spaceNow = !!keys['Space']
          if (spaceNow && !spaceWas && isGrounded) jumpVelY = 0.18
          spaceWas = spaceNow

          playerAngle = cameraAngle
          player.rotation.y = playerAngle

          if (myId) {
            player.position.x += (serverX - player.position.x) * 0.35
            player.position.z += (serverZ - player.position.z) * 0.35
          }

          if (connected && ws) {
            const now2 = Date.now()
            if (now2 - lastInputSend >= 50) {
              lastInputSend = now2
              ws.send(JSON.stringify({
                type: 'input',
                w, s, a, d,
                sprint: isSprinting,
                angle: playerAngle,
              }))
            }
          }
        }

        // ── Local walk animation ───────────────────────────
        if (moving) {
          walkTime += isSprinting ? 0.28 : 0.16
          const sv = Math.sin(walkTime) * 0.65
          leftArm.rotation.x  =  sv;  rightArm.rotation.x = -sv
          leftLeg.rotation.x  = -sv;  rightLeg.rotation.x =  sv
        } else if (playerActive) {
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

        // Zombie positions/states applied in WS handler (server-authoritative)

        // ── Drug lab flask pulse (visual only, income is server-side) ────
        for (const lab of drugLabsRef.current) {
          const t = Date.now() * 0.002
          ;(lab.flask.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.3 + Math.sin(t + lab.group.position.x) * 0.15
        }

        // ── Shooting (raycast on left click) ──────────────────
        if (pendingShotRef.current && playerActive) {
          pendingShotRef.current = false
          const usingPistol = activeSlotRef.current === 5 && hasPistolRef.current
          if (usingPistol) {
            flashTimer = 3
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
            const targets = zombieMeshesRef.current.filter(zm => serverZombieAlive[zm.id]).flatMap(zm => [zm.body, zm.head])
            const hits = raycaster.intersectObjects(targets)
            if (hits.length > 0) {
              const hitMesh = hits[0].object as THREE.Mesh
              const zid = zombieMeshToId.get(hitMesh)
              if (zid !== undefined) {
                const zm = zombieMeshesRef.current[zid]
                const mat = zm.body.material as THREE.MeshLambertMaterial
                mat.color.setHex(0xff2200)
                setTimeout(() => mat.color.setHex(0x4a3a2a), 100)
                if (connected && ws) ws.send(JSON.stringify({ type: 'shoot', weapon: 'pistol', zombieId: zid }))
              }
            }
            // Pistol bullet tracer
            const hand = new THREE.Vector3()
            rightArm.getWorldPosition(hand)
            hand.y -= 0.7
            const fwd = new THREE.Vector3(-Math.sin(playerAngle), 0, -Math.cos(playerAngle))
            const tracerMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.02, 0.02, 0.65),
              new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true })
            )
            tracerMesh.position.copy(hand).addScaledVector(fwd, 0.7)
            tracerMesh.rotation.y = playerAngle
            scene.add(tracerMesh)
            tracers.push({ mesh: tracerMesh, vel: fwd.clone().multiplyScalar(0.85), age: 0 })
          }
        }
        if (flashTimer > 0) flashTimer--

        // ── Flamethrower ──────────────────────────────────────
        if (mouseDownRef.current && activeSlotRef.current === 1) {
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
        const lOn = !!(mouseDownRef.current && activeSlotRef.current === 2)
        if (lOn) {
          boltL.geometry.dispose(); boltL.geometry = mkLightGeo(7)
          boltR.geometry.dispose(); boltR.geometry = mkLightGeo(7)
          boltL.visible = Math.random() > 0.25
          boltR.visible = Math.random() > 0.25
        } else {
          boltL.visible = false; boltR.visible = false
        }

        // ── Pistol ────────────────────────────────────────────
        pistolGroup.visible = hasPistolRef.current && activeSlotRef.current === 5

        // ── Uzi ───────────────────────────────────────────────
        uziGroup.visible = hasUziRef.current && activeSlotRef.current === 6
        if (uziVisualCooldown > 0) uziVisualCooldown--
        if (mouseDownRef.current && activeSlotRef.current === 6 && hasUziRef.current && playerActive && !uziReloadingRef.current && uziAmmoRef.current > 0) {
          if (uziVisualCooldown === 0) {
            uziVisualCooldown = 2
            flashTimer = 2
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
            const uziTargets = zombieMeshesRef.current.filter(zm => serverZombieAlive[zm.id]).flatMap(zm => [zm.body, zm.head])
            const uziHits = raycaster.intersectObjects(uziTargets)
            let uziZombieId = -1
            if (uziHits.length > 0) {
              const hitMesh = uziHits[0].object as THREE.Mesh
              const zid = zombieMeshToId.get(hitMesh)
              if (zid !== undefined) {
                uziZombieId = zid
                const zm = zombieMeshesRef.current[zid]
                const mat = zm.body.material as THREE.MeshLambertMaterial
                mat.color.setHex(0xff2200)
                setTimeout(() => mat.color.setHex(0x4a3a2a), 80)
              }
            }
            if (connected && ws) ws.send(JSON.stringify({ type: 'shoot', weapon: 'uzi', zombieId: uziZombieId }))
            const uziHand = new THREE.Vector3()
            rightArm.getWorldPosition(uziHand); uziHand.y -= 0.7
            const uFwd = new THREE.Vector3(-Math.sin(playerAngle), 0, -Math.cos(playerAngle))
            const muzzleMesh = new THREE.Mesh(
              new THREE.SphereGeometry(0.08, 5, 5),
              new THREE.MeshBasicMaterial({ color: 0xffff99, transparent: true })
            )
            muzzleMesh.position.copy(uziHand).addScaledVector(uFwd, 0.55)
            scene.add(muzzleMesh)
            tracers.push({ mesh: muzzleMesh, vel: new THREE.Vector3(0, 0, 0), age: 4 })
            const uTracer = new THREE.Mesh(
              new THREE.BoxGeometry(0.045, 0.045, 0.85),
              new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true })
            )
            uTracer.position.copy(uziHand).addScaledVector(uFwd, 1.0)
            uTracer.rotation.y = playerAngle
            scene.add(uTracer)
            tracers.push({ mesh: uTracer, vel: uFwd.clone().multiplyScalar(1.1), age: 0 })
          }
        }

        // ── Mini gun ─────────────────────────────────────────
        mgGroup.visible = hasMiniGunRef.current && activeSlotRef.current === 4
        if (mgCooldown > 0) mgCooldown--
        if (mouseDownRef.current && activeSlotRef.current === 4 && hasMiniGunRef.current && playerActive) {
          if (mgCooldown === 0) {
            mgCooldown = 3
            flashTimer = 2
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
            const mgTargets = zombieMeshesRef.current.filter(zm => serverZombieAlive[zm.id]).flatMap(zm => [zm.body, zm.head])
            const mgHits = raycaster.intersectObjects(mgTargets)
            let mgZombieId = -1
            if (mgHits.length > 0) {
              const hitMesh = mgHits[0].object as THREE.Mesh
              const zid = zombieMeshToId.get(hitMesh)
              if (zid !== undefined) {
                mgZombieId = zid
                const zm = zombieMeshesRef.current[zid]
                const mat = zm.body.material as THREE.MeshLambertMaterial
                mat.color.setHex(0xff2200)
                setTimeout(() => mat.color.setHex(0x4a3a2a), 80)
              }
            }
            if (connected && ws) ws.send(JSON.stringify({ type: 'shoot', weapon: 'minigun', zombieId: mgZombieId }))
            // Bullet tracer
            const hand = new THREE.Vector3()
            rightArm.getWorldPosition(hand)
            hand.y -= 0.7
            const fwd = new THREE.Vector3(-Math.sin(playerAngle), 0, -Math.cos(playerAngle))
            const tracerMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.025, 0.025, 0.55),
              new THREE.MeshBasicMaterial({ color: 0xffee66, transparent: true })
            )
            tracerMesh.position.copy(hand).addScaledVector(fwd, 0.7)
            tracerMesh.rotation.y = playerAngle
            scene.add(tracerMesh)
            tracers.push({ mesh: tracerMesh, vel: fwd.clone().multiplyScalar(0.65), age: 0 })
          }
        }
        for (let ti = tracers.length - 1; ti >= 0; ti--) {
          const tr = tracers[ti]
          tr.age++
          tr.mesh.position.addScaledVector(tr.vel, 1)
          ;(tr.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - tr.age / 7
          if (tr.age >= 7) {
            scene.remove(tr.mesh)
            tr.mesh.geometry.dispose()
            ;(tr.mesh.material as THREE.MeshBasicMaterial).dispose()
            tracers.splice(ti, 1)
          }
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

        // ── Player Y — jump physics + ramp floor ──────────────────
        {
          const inSubX = Math.abs(player.position.x - subCX) < subHW - 0.3
          const pz = player.position.z
          const ppx = player.position.x
          let floorY = 0
          if (inSubX) {
            if (pz >= -20 && pz <= 20)     floorY = subFY
            else if (pz < -20 && pz > -30) floorY = ((-20 - pz) / 10) * subFY
            else if (pz >  20 && pz <  30) floorY = ((pz - 20)  / 10) * subFY
          } else if (Math.abs(ppx - 52) < 0.9 && pz >= -41 && pz <= -39) {
            // Water tower ladder (south approach, walking north raises Y)
            floorY = Math.max(0, Math.min(9, (-39 - pz) / 2 * 9))
          } else if (Math.abs(ppx - 52) <= 4.0 && Math.abs(pz + 45) <= 4.0 && player.position.y > 7.0) {
            // Water tower platform (square deck, Y-gated to prevent teleport from ground)
            floorY = 9
          }
          jumpVelY -= 0.010
          player.position.y += jumpVelY
          if (player.position.y <= floorY) {
            player.position.y = floorY
            jumpVelY = 0
            isGrounded = true
          } else {
            isGrounded = false
          }
        }

        for (const sd of shackDoors) {
          sd.pivot.rotation.y += ((sd.open ? Math.PI / 2 : 0) - sd.pivot.rotation.y) * 0.12
        }

        // First-person camera
        const px = player.position.x
        const py = player.position.y
        const pz = player.position.z
        camera.position.set(px, py + 1.65, pz)
        camera.lookAt(
          px - Math.sin(cameraAngle) * Math.cos(camPitch),
          py + 1.65 + Math.sin(camPitch),
          pz - Math.cos(cameraAngle) * Math.cos(camPitch)
        )

        // ── Compass HUD ───────────────────────────────────────
        if (compassDegRef.current && compassStripRef.current) {
          const deg = ((-cameraAngle * 180 / Math.PI) % 360 + 360) % 360
          compassDegRef.current.textContent = `${Math.round(deg)}°`
          const dirs: [number, string][] = [
            [0,'N'],[45,'NE'],[90,'E'],[135,'SE'],[180,'S'],[225,'SW'],[270,'W'],[315,'NW'],
          ]
          const range = 72, scale = 1.5, cx = 108
          let html = ''
          for (const [d, label] of dirs) {
            for (const wrap of [-360, 0, 360]) {
              const diff = (d + wrap) - deg
              if (Math.abs(diff) <= range) {
                const x = cx + diff * scale
                const opacity = Math.abs(diff) < 20 ? 1 : 0.55
                html += `<span style="position:absolute;top:0;left:${x}px;transform:translateX(-50%);font-size:10px;font-weight:700;color:rgba(255,255,255,${opacity});letter-spacing:1px">${label}</span>`
              }
            }
          }
          compassStripRef.current.innerHTML = html
        }

        renderer.render(scene, camera)
      }

      loop()

      sig.addEventListener('abort', () => {
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
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
    { label: 'MiniGun', key: '5', sub: hasMiniGun ? 'hold'  : 'buy' },
    { label: 'Pistol',  key: '6', sub: hasPistol  ? 'click' : 'buy' },
    { label: 'Uzi',     key: '7', sub: hasUzi ? (uziReloading ? 'reload…' : `${uziAmmo}/30`) : 'buy' },
  ]

  return (
    <div className='relative w-full flex-1 overflow-hidden bg-black'>

      {/* Instructions */}
      <div
        className='pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs text-white'
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      >
        WASD · Space jump · Mouse · Shift sprint · Click shoot · E shack · M buy menu · ESC release
      </div>

      {/* Compass */}
      <div
        className='pointer-events-none absolute left-1/2 z-10 -translate-x-1/2'
        style={{ top: 52 }}
      >
        <div style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderRadius: 8, padding: '4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ position: 'relative', width: 216, height: 16, overflow: 'hidden' }}>
            {/* center tick */}
            <div style={{ position: 'absolute', left: '50%', bottom: 0, width: 1, height: 10, background: 'rgba(255,255,255,0.85)', transform: 'translateX(-50%)' }} />
            <div ref={compassStripRef} style={{ position: 'absolute', inset: 0 }} />
          </div>
          <div ref={compassDegRef} style={{ color: 'white', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1 }}>0°</div>
        </div>
      </div>

      {/* Money */}
      <div
        className='pointer-events-none absolute right-4 top-4 z-10 font-mono font-bold text-white'
        style={{ fontSize: 18, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
      >
        ${playerMoney.toLocaleString()}
      </div>

      {/* Drug lab count */}
      {drugLabCount > 0 && (
        <div
          className='pointer-events-none absolute right-4 top-10 z-10 font-mono text-xs'
          style={{ color: '#39ff14', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
        >
          {drugLabCount} lab{drugLabCount > 1 ? 's' : ''} · +$200/30s each
        </div>
      )}

      {/* Crosshair */}
      <div className='pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2'>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.5)' }} />
      </div>

      {/* Death overlay */}
      {isDead && (
        <div className='pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center' style={{ background: 'rgba(120,0,0,0.4)' }}>
          <div style={{ color: '#ff2222', fontSize: 64, fontWeight: 900, letterSpacing: 8, textShadow: '0 0 30px rgba(255,0,0,0.7)' }}>
            YOU DIED
          </div>
          <div style={{ color: '#fff', fontSize: 18, marginTop: 12, opacity: 0.8 }}>
            Respawning in {respawnCountdown}s…
          </div>
        </div>
      )}

      {/* Buy menu */}
      {buyMenuOpen && (
        <div className='absolute inset-0 z-40 flex items-center justify-center' style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'rgba(8,10,18,0.97)', border: '1.5px solid rgba(57,255,20,0.3)', borderRadius: 20, padding: '36px 40px', minWidth: 320 }}>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, letterSpacing: 4, marginBottom: 4 }}>BUY MENU</div>
            <div style={{ color: '#555', fontSize: 13, marginBottom: 24 }}>Balance: ${playerMoney.toLocaleString()}</div>

            <button
              onClick={() => {
                if (!hasPistol && wsRef.current) {
                  wsRef.current.send(JSON.stringify({ type: 'buy', item: 'pistol' }))
                  buyMenuOpenRef.current = false; setBuyMenuOpen(false)
                }
              }}
              disabled={playerMoney < 250 || hasPistol}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: hasPistol ? 'rgba(255,255,255,0.05)' : playerMoney >= 250 ? 'rgba(100,180,255,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${hasPistol ? '#555' : playerMoney >= 250 ? '#64b4ff' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12, padding: '14px 16px', marginBottom: 12,
                cursor: hasPistol || playerMoney < 250 ? 'not-allowed' : 'pointer',
                color: hasPistol ? '#555' : playerMoney >= 250 ? '#64b4ff' : '#444',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>PISTOL</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Click on slot 6 — 65 damage per shot</div>
              <div style={{ fontWeight: 900, fontSize: 16, marginTop: 6 }}>{hasPistol ? 'OWNED' : '$250'}</div>
            </button>

            <button
              onClick={() => {
                wsRef.current?.send(JSON.stringify({ type: 'buy', item: 'druglab' }))
                buyMenuOpenRef.current = false; setBuyMenuOpen(false)
              }}
              disabled={playerMoney < 1000}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: playerMoney >= 1000 ? 'rgba(57,255,20,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${playerMoney >= 1000 ? '#39ff14' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12, padding: '14px 16px', marginBottom: 12, cursor: playerMoney >= 1000 ? 'pointer' : 'not-allowed',
                color: playerMoney >= 1000 ? '#39ff14' : '#444',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>DRUG LAB</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>$200 passive income every 30s</div>
              <div style={{ fontWeight: 900, fontSize: 16, marginTop: 6 }}>$1,000</div>
            </button>

            <button
              onClick={() => {
                if (!hasUzi && wsRef.current) {
                  wsRef.current.send(JSON.stringify({ type: 'buy', item: 'uzi' }))
                  buyMenuOpenRef.current = false; setBuyMenuOpen(false)
                }
              }}
              disabled={playerMoney < 400 || hasUzi}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: hasUzi ? 'rgba(255,255,255,0.05)' : playerMoney >= 400 ? 'rgba(255,136,0,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${hasUzi ? '#555' : playerMoney >= 400 ? '#ff8800' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12, padding: '14px 16px', marginBottom: 12,
                cursor: hasUzi || playerMoney < 400 ? 'not-allowed' : 'pointer',
                color: hasUzi ? '#555' : playerMoney >= 400 ? '#ff8800' : '#444',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>UZI</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Hold click on slot 7 — 30 rounds, 18 dmg each, auto-reload</div>
              <div style={{ fontWeight: 900, fontSize: 16, marginTop: 6 }}>{hasUzi ? 'OWNED' : '$400'}</div>
            </button>

            <button
              onClick={() => {
                if (!hasMiniGun && wsRef.current) {
                  wsRef.current.send(JSON.stringify({ type: 'buy', item: 'minigun' }))
                  buyMenuOpenRef.current = false; setBuyMenuOpen(false)
                }
              }}
              disabled={playerMoney < 500 || hasMiniGun}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: hasMiniGun ? 'rgba(255,255,255,0.05)' : playerMoney >= 500 ? 'rgba(255,180,0,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${hasMiniGun ? '#555' : playerMoney >= 500 ? '#ffb400' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12, padding: '14px 16px', marginBottom: 12,
                cursor: hasMiniGun || playerMoney < 500 ? 'not-allowed' : 'pointer',
                color: hasMiniGun ? '#555' : playerMoney >= 500 ? '#ffb400' : '#444',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>MINI GUN</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Hold click on slot 5 to rapid-fire zombies</div>
              <div style={{ fontWeight: 900, fontSize: 16, marginTop: 6 }}>{hasMiniGun ? 'OWNED' : '$500'}</div>
            </button>

            <div style={{ color: '#444', fontSize: 11, textAlign: 'center', marginTop: 8 }}>Press M to close</div>
          </div>
        </div>
      )}

      {/* Hotbar */}
      <div className='pointer-events-none absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2'>
        {/* Health bar */}
        <div className='w-52 overflow-hidden rounded-full' style={{ height: 5, background: 'rgba(255,255,255,0.12)' }}>
          <div
            ref={healthBarRef}
            style={{ width: '100%', height: '100%', background: '#44dd44', borderRadius: 9999, transition: 'background 0.3s' }}
          />
        </div>
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
