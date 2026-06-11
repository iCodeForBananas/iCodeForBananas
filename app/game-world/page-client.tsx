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
  const mouseDownRef    = useRef(false)
  const joystickRef     = useRef({ x: 0, y: 0 })
  const jumpTouchRef    = useRef(false)
  const joystickBaseRef = useRef<HTMLDivElement>(null)
  const joystickKnobRef = useRef<HTMLDivElement>(null)

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
  const [inHospital,       setInHospital]        = useState(false)
  const [isIPad,           setIsIPad]            = useState(false)

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
  const inHospitalRef    = useRef(false)

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
      scene.background = new THREE.Color(0x06060f)
      scene.fog = new THREE.Fog(0x06060f, 18, 70)

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
      const ambientLight = new THREE.AmbientLight(0x1a2244, 0.52)
      scene.add(ambientLight)

      const moon = new THREE.DirectionalLight(0x8899cc, 0.63)
      moon.position.set(-30, 60, -20)
      moon.castShadow = true
      moon.shadow.mapSize.set(2048, 2048)
      moon.shadow.camera.left = -60
      moon.shadow.camera.right = 60
      moon.shadow.camera.top = 60
      moon.shadow.camera.bottom = -60
      moon.shadow.camera.far = 200
      scene.add(moon)

      // Dim fill to lift shadow-side geometry off pure black
      const fillLight = new THREE.DirectionalLight(0x223344, 0.21)
      fillLight.position.set(30, 20, 20)
      scene.add(fillLight)

      // ── Moon disc in sky (sits within cloud layer, hazy) ──
      const moonPos = new THREE.Vector3(-75, 62, -120)
      const moonDisc = new THREE.Mesh(
        new THREE.CircleGeometry(5.5, 32),
        new THREE.MeshBasicMaterial({ color: 0xdde8ff })
      )
      moonDisc.position.copy(moonPos)
      moonDisc.lookAt(0, 10, 0)
      scene.add(moonDisc)

      // Layered haze planes between moon and viewer — simulate cloud diffusion
      const hazeConfigs: [number, number, number, number][] = [
        [9,  0.22, 0, 0],       // inner glow ring
        [14, 0.10, 0.5, 0.5],   // mid haze
        [20, 0.07, 1.2, 1.0],   // outer diffusion
        [28, 0.04, 2.0, 1.8],   // far bleed
      ]
      for (const [r, op, ox, oy] of hazeConfigs) {
        const haze = new THREE.Mesh(
          new THREE.CircleGeometry(r, 32),
          new THREE.MeshBasicMaterial({ color: 0xaabbdd, transparent: true, opacity: op, depthWrite: false })
        )
        haze.position.set(moonPos.x + ox, moonPos.y + oy, moonPos.z + 2)
        haze.lookAt(0, 10, 0)
        scene.add(haze)
      }

      // Thin dark cloud wisps draped over the moon
      const wispMat = new THREE.MeshBasicMaterial({ color: 0x090912, transparent: true, opacity: 0.55, depthWrite: false })
      for (const [wx, wy, ww, wh] of [
        [-4, 1.5, 14, 2.8], [3, -1, 18, 2.2], [-7, -2.5, 10, 2.0], [6, 3, 12, 1.8],
      ] as [number,number,number,number][]) {
        const wisp = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), wispMat)
        wisp.position.set(moonPos.x + wx, moonPos.y + wy, moonPos.z + 3)
        wisp.lookAt(0, 10, 0)
        scene.add(wisp)
      }

      // ── Overcast cloud layer ───────────────────────────────
      const mkCloud = (cx: number, cy: number, cz: number, w: number, d: number) => {
        const puffs = [
          [0, 0, 0, w, 5, d],
          [-w * 0.28, -1.2, 0, w * 0.65, 3.5, d * 0.75],
          [w * 0.25, -0.8, d * 0.18, w * 0.55, 3.2, d * 0.6],
          [0, 1.5, -d * 0.2, w * 0.75, 3, d * 0.55],
        ] as [number,number,number,number,number,number][]
        const cloudMat = new THREE.MeshLambertMaterial({ color: 0x0e0e18, transparent: true, opacity: 0.88 })
        for (const [ox, oy, oz, pw, ph, pd] of puffs) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), cloudMat)
          c.position.set(cx + ox, cy + oy, cz + oz)
          scene.add(c)
        }
      }
      mkCloud(-40, 55, -50, 55, 22)
      mkCloud(10,  58, -70, 65, 28)
      mkCloud(60,  52, -45, 48, 20)
      mkCloud(-80, 60, -20, 70, 30)
      mkCloud(30,  56, 40,  52, 24)
      mkCloud(-20, 62, 30,  60, 26)
      mkCloud(80,  54, 10,  44, 18)
      mkCloud(-60, 50, 50,  58, 22)
      mkCloud(5,   64, -120, 80, 35)
      // cloud mass flanking the moon — gives it something to diffuse through
      mkCloud(-90, 60, -110, 60, 25)
      mkCloud(-55, 63, -130, 50, 20)

      // ── Ground ─────────────────────────────────────────────
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshLambertMaterial({ color: 0x0f1a0a })
      )
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)

      const grid = new THREE.GridHelper(200, 40, 0x0a1006, 0x0d1508)
      grid.position.y = 0.01
      scene.add(grid)

      // ── Trees ──────────────────────────────────────────────
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x2a1a0a })
      const crownMat = new THREE.MeshLambertMaterial({ color: 0x0e2210 })
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
      const subHW    = 5.0    // half-width (wall to wall)
      const subFY    = -7     // floor Y (track pit level)
      const subTH    = 6      // tunnel height
      const subPlatH = 1.5    // platform slab height (raised above track pit)
      const subPlatW = 1.8    // platform width each side
      const subPlatY = subFY + subPlatH  // -5.5, top of platform

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

      // ── Rail tracks (two lines: one each direction) ───────────────
      const track1CX = subCX - 0.9   // west track (northbound)
      const track2CX = subCX + 0.9   // east track (southbound)
      const gauge    = 0.72           // rail separation per track

      // Track 1 rails + heads
      subBox(track1CX - gauge / 2, subFY + 0.12, 0, 0.08, 0.16, 40, subRailM)
      subBox(track1CX + gauge / 2, subFY + 0.12, 0, 0.08, 0.16, 40, subRailM)
      subBox(track1CX - gauge / 2, subFY + 0.22, 0, 0.12, 0.06, 40, subRailM)
      subBox(track1CX + gauge / 2, subFY + 0.22, 0, 0.12, 0.06, 40, subRailM)

      // Track 2 rails + heads
      subBox(track2CX - gauge / 2, subFY + 0.12, 0, 0.08, 0.16, 40, subRailM)
      subBox(track2CX + gauge / 2, subFY + 0.12, 0, 0.08, 0.16, 40, subRailM)
      subBox(track2CX - gauge / 2, subFY + 0.22, 0, 0.12, 0.06, 40, subRailM)
      subBox(track2CX + gauge / 2, subFY + 0.22, 0, 0.12, 0.06, 40, subRailM)

      // Wooden ties per track every 0.75 units
      for (let tz = -19.6; tz <= 19.6; tz += 0.75) {
        subBox(track1CX, subFY + 0.07, tz, gauge + 0.5, 0.12, 0.22, subTieM)
        subBox(track2CX, subFY + 0.07, tz, gauge + 0.5, 0.12, 0.22, subTieM)
      }

      // Third rails (electrified, outer side of each track)
      subBox(track1CX - gauge / 2 - 0.3, subFY + 0.16, 0, 0.06, 0.10, 40, subRailM)
      subBox(track2CX + gauge / 2 + 0.3, subFY + 0.16, 0, 0.06, 0.10, 40, subRailM)

      // Tunnel portal pillars at Z = ±20 (center divider marking two separate tunnel openings)
      subBox(subCX, subFY + subTH / 2, -20, 0.35, subTH, 0.5, subConc)
      subBox(subCX, subFY + subTH / 2,  20, 0.35, subTH, 0.5, subConc)

      // ── Staircases (north: street at Z=-30, descend south to platform at Z=-20)
      //              (south: street at Z=+30, descend north to platform at Z=+20) ───
      // topZ = street end, dir = direction toward platform (+1 south, -1 north)
      const mkStaircase = (topZ: number, dir: number) => {
        const shaftLen = 10
        const shaftCenterZ = topZ + dir * (shaftLen / 2)  // Z=-25 or Z=+25

        // 10 steps: si=0 is top (street, Y≈0), si=9 is bottom (platform, Y≈-7)
        for (let si = 0; si < 10; si++) {
          const stepZ = topZ + dir * (si + 0.5)
          const stepY = -(si * 0.7) - 0.35
          const treadH = 0.7
          // Tread slab (slightly narrower than shaft so shaft walls show)
          subBox(subCX, stepY, stepZ, subHW * 2 - 0.8, treadH, 1.0, subStepM)
          // Yellow nosing strip on leading edge
          subBox(subCX, stepY + treadH / 2 - 0.04, stepZ - dir * 0.47, subHW * 2 - 0.8, 0.06, 0.06, subYell)
        }

        // Shaft side walls: rise from Y=-7 to Y=+0.8 so they're visible above ground
        const shaftWallH = -subFY + 0.8  // 7.8 units tall
        const shaftWallCY = (subFY - 0.8) / 2  // center Y ≈ -3.9
        subBox(subCX - subHW + 0.2, shaftWallCY, shaftCenterZ, 0.4, shaftWallH, shaftLen, subConc)
        subBox(subCX + subHW - 0.2, shaftWallCY, shaftCenterZ, 0.4, shaftWallH, shaftLen, subConc)

        // Concrete lip at street entrance (low curb marks the top of shaft)
        subBox(subCX, 0.3, topZ - dir * 0.4, subHW * 2 + 1.0, 0.6, 0.8, subConc)

        // Under-stair fill (solid concrete wedge behind the steps)
        subBox(subCX, subFY + 1.75, shaftCenterZ, subHW * 2 - 1.0, 3.5, shaftLen, subConc)

        // Green handrails
        const railY_top = 0.9
        for (const hx of [subCX - subHW + 0.65, subCX + subHW - 0.65]) {
          for (let pi = 0; pi < 10; pi += 3) {
            const pz = topZ + dir * (pi + 0.5)
            const py = -(pi * 0.7) + railY_top
            subBox(hx, py - 0.45, pz, 0.07, 0.9, 0.07, subRailGM)
          }
          const hrBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 10.4), subRailGM)
          hrBar.rotation.x = dir * Math.atan2(7, 10)
          hrBar.position.set(hx, -3.0, topZ + dir * 5)
          scene.add(hrBar)
        }
      }
      mkStaircase(-30, +1)  // north: street at Z=-30, walk south (↑Z) to descend
      mkStaircase(+30, -1)  // south: street at Z=+30, walk north (↓Z) to descend

      // ── Street-level entrance structures (at street end of each shaft) ────────
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
        // Vertical pickets (spaced across full new width)
        for (let px = -subHW + 0.5; px <= subHW - 0.3; px += 0.65) {
          subBox(subCX + px, 1.2, surfaceZ, 0.10, 2.0, 0.10, subGreenM)
        }

        // Canopy extending toward street
        const canoZ = surfaceZ + streetDir * 1.2
        subBox(subCX, gateH + 0.18, canoZ, gateW + 0.4, 0.14, 2.6, subGreenM)
        for (const rx of [-subHW + 0.1, -subHW * 0.3, 0, subHW * 0.3, subHW - 0.1]) {
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

        // SUBWAY sign
        const sgn = new THREE.Mesh(new THREE.BoxGeometry(gateW - 0.3, 0.44, 0.12), subSgnM)
        sgn.position.set(subCX, gateH - 0.55, surfaceZ + streetDir * 0.08); scene.add(sgn)
        const sgnInner = new THREE.Mesh(new THREE.BoxGeometry(gateW - 0.7, 0.26, 0.13), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }))
        sgnInner.position.set(subCX, gateH - 0.55, surfaceZ + streetDir * 0.09); scene.add(sgnInner)

        // Ground grate at threshold
        subBox(subCX, 0.04, surfaceZ + streetDir * 0.3, gateW, 0.08, 0.8, subConc)
      }
      mkSubwayEntrance(-30, -1)   // north entrance: gate at Z=-30, street faces north (-Z)
      mkSubwayEntrance(+30, +1)   // south entrance: gate at Z=+30, street faces south (+Z)

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

        // Interior hanging bulb (cord + emissive globe)
        const cordM3 = new THREE.MeshLambertMaterial({ color: 0x1a1410 })
        const cord3  = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.28, 0.018), cordM3)
        cord3.position.set(0, h - 0.26, 0)
        g.add(cord3)
        const blbM3 = new THREE.MeshBasicMaterial({ color: 0xffdd88 })
        const blb3  = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), blbM3)
        blb3.position.set(0, h - 0.42, 0)
        g.add(blb3)
        return h
      }

      const mkBarrel = (bx: number, bz: number) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.7, 8), barrelMat2)
        b.position.set(bx, 0.35, bz); scene.add(b)
      }

      const shackPositions: Array<{x: number, z: number, roofY: number}> = []
      for (const [sx, sz] of [
        // original east cluster
        [30,-18],[33,-12],[27,-8],[35,-5],[29,0],[38,3],[32,9],[26,14],[36,18],[30,24],
        [41,-15],[42,8],[24,-3],[38,-10],[25,20],[44,-2],[28,-22],[34,25],[40,15],[45,-20],
        [22,10],[46,5],[31,-28],[43,22],
        // west expansion — between street and east cluster
        [18,-25],[16,-18],[20,-10],[17,-3],[19,5],[15,12],[18,20],[21,28],
        [13,-22],[11,-14],[14,-6],[12,2],[10,10],[13,18],[16,26],[11,30],
        // far-west fringe across the street
        [5,-30],[7,-22],[4,-14],[6,-6],[3,2],[8,14],[5,22],[2,30],
        [-4,-18],[-6,-8],[-3,4],[-5,16],[-7,-28],[-2,26],
        // southern sprawl
        [32,-35],[26,-38],[38,-32],[20,-40],[44,-36],[14,-34],[8,-36],[0,-32],
        // northern sprawl
        [30,32],[24,36],[38,30],[18,34],[44,28],[12,30],[6,36],[0,28],
      ] as [number,number][]) {
        const ax = sx + (shackRng()-0.5)*2.5
        const az = sz + (shackRng()-0.5)*2.5
        const arot = (shackRng()-0.5)*0.7
        const roofY = mkShack(ax, az, arot, shackRng)
        shackPositions.push({ x: ax, z: az, roofY })
      }
      for (const [bx,bz] of [
        // original barrels
        [29,-14],[37,1],[32,16],[26,8],[41,-8],[44,12],
        // west expansion barrels
        [17,-20],[13,-8],[10,5],[15,22],[19,-2],[12,14],
        [5,-25],[7,-12],[4,8],[6,20],[2,-18],[8,28],
        [-4,-10],[-3,12],[-6,-22],[-2,24],
        // sprawl barrels
        [31,-33],[22,-37],[6,-34],[-1,-28],[28,32],[10,34],[-3,28],[40,30],
        // east cluster outer edge (dark corners)
        [43,-14],[46,4],[47,-12],[45,-22],[45,22],[42,-20],[47,8],
        // southern sprawl gaps
        [38,-34],[44,-34],[14,-36],[8,-38],[0,-34],[26,-34],[20,-36],
        // northern sprawl gaps
        [24,34],[38,32],[18,32],[44,30],[6,34],[0,30],[12,34],[36,34],
        // inner east cluster gaps
        [35,-15],[33,5],[40,8],[36,20],[42,15],
      ] as [number,number][]) {
        mkBarrel(bx+(shackRng()-0.5), bz+(shackRng()-0.5))
      }

      // ── Shantytown power poles + electrical wiring ─────────────────────────
      const shPoleM = new THREE.MeshLambertMaterial({ color: 0x2a1a08 })
      const shInsM  = new THREE.MeshBasicMaterial({ color: 0xd8d4c2 })
      const shWireM = new THREE.LineBasicMaterial({ color: 0x181208 })

      const mkPowerPole = (px: number, pz: number) => {
        subBox(px, 4.0, pz, 0.18, 8.0, 0.18, shPoleM)           // main pole
        subBox(px, 8.1, pz, 0.28, 0.18, 0.28, shPoleM)          // top cap
        subBox(px, 7.0, pz, 0.12, 0.14, 4.4, shPoleM)           // upper crossarm
        subBox(px, 6.0, pz, 0.10, 0.12, 3.2, shPoleM)           // lower crossarm
        // upper-arm insulators
        for (const oz of [-2.2, -0.8, 0.8, 2.2]) {
          const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 6), shInsM)
          ins.position.set(px, 7.12, pz + oz); scene.add(ins)
        }
        // lower-arm insulators
        for (const oz of [-1.6, 1.6]) {
          const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 6), shInsM)
          ins.position.set(px, 6.13, pz + oz); scene.add(ins)
        }
      }

      const mkWireLine = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
        const wS = new THREE.Vector3(x1, y1, z1)
        const wE = new THREE.Vector3(x2, y2, z2)
        const wM = wS.clone().lerp(wE, 0.5)
        wM.y -= wS.distanceTo(wE) * 0.065   // catenary sag
        const crv = new THREE.QuadraticBezierCurve3(wS, wM, wE)
        const geo = new THREE.BufferGeometry().setFromPoints(crv.getPoints(8))
        scene.add(new THREE.Line(geo, shWireM))
      }

      const shPoles = [
        { x: 36, z: -8  },
        { x: 28, z: 18  },
        { x: 14, z: -12 },
        { x:  0, z:  6  },
      ]
      for (const p of shPoles) mkPowerPole(p.x, p.z)

      // Trunk wires pole-to-pole (two parallel runs for visual weight)
      for (const [ai, bi] of [[0,2],[2,3],[0,1],[1,2]] as [number,number][]) {
        const pa = shPoles[ai], pb = shPoles[bi]
        mkWireLine(pa.x, 7.1, pa.z - 0.15, pb.x, 7.1, pb.z - 0.15)
        mkWireLine(pa.x, 7.1, pa.z + 0.15, pb.x, 7.1, pb.z + 0.15)
      }

      // Service wire from every shack roof to its nearest pole
      for (const sp of shackPositions) {
        let nPole = shPoles[0], nDist = Infinity
        for (const pole of shPoles) {
          const d = Math.hypot(sp.x - pole.x, sp.z - pole.z)
          if (d < nDist) { nDist = d; nPole = pole }
        }
        mkWireLine(sp.x, sp.roofY + 0.12, sp.z, nPole.x, 7.1, nPole.z)
      }

      // ── Shantytown street lamps ────────────────────────────────────────────
      const shLPolM = new THREE.MeshLambertMaterial({ color: 0x2a1a08 })
      const shLGlbM = new THREE.MeshBasicMaterial({ color: 0xffee88 })
      const mkShLamp = (lx: number, lz: number) => {
        subBox(lx, 2.75, lz, 0.12, 5.5, 0.12, shLPolM)
        subBox(lx + 0.35, 5.5, lz, 0.7, 0.08, 0.08, shLPolM)
        const glb = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 5), shLGlbM)
        glb.position.set(lx + 0.7, 5.3, lz); scene.add(glb)
        const lpl = new THREE.PointLight(0xffcc77, 6.0, 50)
        lpl.position.set(lx + 0.7, 5.0, lz); scene.add(lpl)
      }
      // Tap power poles for extra overhead light
      for (const p of shPoles) {
        const ppl = new THREE.PointLight(0xffcc77, 4.5, 45)
        ppl.position.set(p.x, 7.5, p.z); scene.add(ppl)
      }
      // Street lamp posts distributed across the full shantytown
      mkShLamp(31, -24); mkShLamp(40, -12); mkShLamp(28,   2); mkShLamp(36,  12)
      mkShLamp(43,  -4); mkShLamp(44,  20); mkShLamp(25, -10); mkShLamp(17, -22)
      mkShLamp(14,  -4); mkShLamp(19,  14); mkShLamp(11,  26); mkShLamp(12, -14)
      mkShLamp( 5, -27); mkShLamp( 4,  -8); mkShLamp( 6,  12); mkShLamp( 2,  28)
      mkShLamp(35, -35); mkShLamp(18, -37); mkShLamp( 3, -31)
      mkShLamp(33,  32); mkShLamp(15,  34); mkShLamp(-1,  29)

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
        const lampPL = new THREE.PointLight(0xffcc88, 6.6, 44)
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

      // ── Industrial District (north corridor, X=-5→22, Z=-58→-92) ─────────────
      // Dark warehouses connecting Market District (west) to Shantytown (east).
      // WH_A (NW, biggest): X=-5→9,  Z=-77→-92, h=8.5  — ladder + rampart
      // WH_B (NE):          X=13→22, Z=-77→-92, h=7.5  — ladder + rampart
      // WH_C (SW, sealed):  X=-5→6,  Z=-60→-73, h=6.0  — no roof access
      // WH_D (SE):          X=13→22, Z=-60→-73, h=7.0  — ladder + rampart
      // Cross alley: Z=-73→-77  |  North alley (A-B gap): X=9→13
      {
        const IWT = 0.25  // wall thickness

        // ── Materials ──────────────────────────────────────────────────────
        const idBk1 = new THREE.MeshLambertMaterial({ color: 0x1e1208 })   // dark brick
        const idBk2 = new THREE.MeshLambertMaterial({ color: 0x2a1a0c })   // mid brick
        const idCnc = new THREE.MeshLambertMaterial({ color: 0x181614 })   // dark concrete
        const idMtl = new THREE.MeshLambertMaterial({ color: 0x141412 })   // iron/metal
        const idGls = new THREE.MeshLambertMaterial({ color: 0x0a1420, transparent: true, opacity: 0.82 })
        const idWlk = new THREE.MeshLambertMaterial({ color: 0x151513 })   // walkway grating
        const idRal = new THREE.MeshLambertMaterial({ color: 0x0c0c0a })   // railing iron
        const idRst = new THREE.MeshLambertMaterial({ color: 0x2e1506 })   // rust
        const idDmp = new THREE.MeshLambertMaterial({ color: 0x16200e })   // dumpster
        const idCrt = new THREE.MeshLambertMaterial({ color: 0x3a2a14 })   // wood crate
        const idCap = new THREE.MeshLambertMaterial({ color: 0x2a1e0e })   // crate cap darker

        // ── District ground (covers all 8 warehouses, X=-44→22, Z=-57→-95) ──
        const distGnd = new THREE.Mesh(
          new THREE.PlaneGeometry(68, 40),
          new THREE.MeshLambertMaterial({ color: 0x0e0d0c })
        )
        distGnd.rotation.x = -Math.PI / 2
        distGnd.position.set(-11, 0.004, -76)
        distGnd.receiveShadow = true
        scene.add(distGnd)
        // Subtle cracked-concrete grid
        const distGr = new THREE.GridHelper(68, 14, 0x1c1b1a, 0x1c1b1a)
        distGr.position.set(-11, 0.007, -76)
        scene.add(distGr)

        // ── Rampart helper: walkway slab + outer parapet + inner railing ──
        const mkRampart = (rx1: number, rx2: number, rz1: number, rz2: number, ry: number) => {
          const rW = 1.4, parH = 1.0, slabT = 0.18
          const rcx = (rx1 + rx2) / 2, rcz = (rz1 + rz2) / 2
          const W = rx2 - rx1, D = Math.abs(rz2 - rz1)
          // Walkway slabs around perimeter (atop each wall)
          stB(rcx, ry + slabT / 2, rz1, W + rW * 2, slabT, rW, idWlk) // south
          stB(rcx, ry + slabT / 2, rz2, W + rW * 2, slabT, rW, idWlk) // north
          stB(rx1, ry + slabT / 2, rcz, rW, slabT, D - rW * 2, idWlk) // west
          stB(rx2, ry + slabT / 2, rcz, rW, slabT, D - rW * 2, idWlk) // east
          // Outer parapet walls (short walls on outer edge)
          const parY = ry + slabT + parH / 2
          stB(rcx, parY, rz1 - rW / 2, W + rW * 2, parH, IWT, idBk1)   // south outer
          stB(rcx, parY, rz2 + rW / 2, W + rW * 2, parH, IWT, idBk1)   // north outer
          stB(rx1 - rW / 2, parY, rcz, IWT, parH, D + rW * 2, idBk1)   // west outer
          stB(rx2 + rW / 2, parY, rcz, IWT, parH, D + rW * 2, idBk1)   // east outer
          // Inner railing posts every ~3 units
          const postH = 0.68, postY = ry + slabT + postH / 2
          for (let px = rx1; px <= rx2 + 0.1; px += 3.0) {
            stB(px, postY, rz1 + rW / 2, 0.08, postH, 0.08, idRal)
            stB(px, postY, rz2 - rW / 2, 0.08, postH, 0.08, idRal)
          }
          for (let pz = rz1 + rW + 1; pz <= rz2 - rW - 1; pz += 3.0) {
            stB(rx1 + rW / 2, postY, pz, 0.08, postH, 0.08, idRal)
            stB(rx2 - rW / 2, postY, pz, 0.08, postH, 0.08, idRal)
          }
          // Horizontal rail bars on inner edges
          const rbY = ry + slabT + postH * 0.65
          stB(rcx, rbY, rz1 + rW / 2, W, 0.06, 0.06, idRal)
          stB(rcx, rbY, rz2 - rW / 2, W, 0.06, 0.06, idRal)
          stB(rx1 + rW / 2, rbY, rcz, 0.06, 0.06, D - rW * 2, idRal)
          stB(rx2 - rW / 2, rbY, rcz, 0.06, 0.06, D - rW * 2, idRal)
        }

        // ── Ladder helper (east-wall: rails run Z, rungs stick out in Z) ───
        const mkIndLadderE = (lx: number, lz: number, topY: number) => {
          for (const oz of [-0.22, 0.22]) stB(lx, topY / 2, lz + oz, 0.06, topY, 0.06, idRst)
          for (let ry = 0.55; ry < topY - 0.15; ry += 0.62)
            stB(lx, ry, lz, 0.08, 0.06, 0.42, idMtl)
        }

        // ── Metal gate builder (closed metal bars across door opening) ─────
        const warehouseGateMeshes = new Map<string, THREE.Group>()
        const mkGate = (id: string, cx: number, southZ: number, gw: number, gh: number) => {
          const gateGroup = new THREE.Group()
          const gateMat = new THREE.MeshLambertMaterial({ color: 0x181614 })
          const nBars = Math.max(3, Math.round(gw / 0.32))
          for (let i = 0; i <= nBars; i++) {
            const bx = cx - gw / 2 + (i / nBars) * gw
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, gh, 0.07), gateMat)
            bar.position.set(bx, gh / 2, southZ)
            bar.castShadow = true
            gateGroup.add(bar)
          }
          for (const yf of [0.12, 0.50, 0.88]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.08, 0.08), gateMat)
            rail.position.set(cx, yf * gh, southZ)
            gateGroup.add(rail)
          }
          scene.add(gateGroup)
          warehouseGateMeshes.set(id, gateGroup)
        }

        // ── Fire barrel ────────────────────────────────────────────────────
        const mkIndBarrel = (bx: number, bz: number) => {
          stB(bx, 0.38, bz, 0.46, 0.76, 0.46, idRst)
        }

        // ── Dumpster ───────────────────────────────────────────────────────
        const mkDumpster = (dx: number, dz: number, rotY: number) => {
          const dg = new THREE.Group(); dg.rotation.y = rotY
          const dBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.95), idDmp)
          dBody.position.set(0, 0.55, 0); dBody.castShadow = true; dg.add(dBody)
          const dLid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.95), idCrt)
          dLid.position.set(0, 1.14, 0); dg.add(dLid)
          dg.position.set(dx, 0, dz); scene.add(dg)
        }

        // ── Sodium-vapor street lamp ───────────────────────────────────────
        const mkIndLamp = (lx: number, lz: number) => {
          stB(lx, 2.9, lz, 0.1, 5.8, 0.1, idMtl)              // pole
          stB(lx + 0.45, 5.5, lz, 0.9, 0.08, 0.08, idMtl)     // arm
          stB(lx + 0.9, 5.28, lz, 0.42, 0.32, 0.28, idMtl)    // head
          const lensM = new THREE.MeshBasicMaterial({ color: 0xffcc88 })
          const lns = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.20), lensM)
          lns.position.set(lx + 0.9, 5.12, lz); scene.add(lns)
          const lPL = new THREE.PointLight(0xff9944, 4.0, 52)
          lPL.position.set(lx + 0.9, 4.9, lz); scene.add(lPL)
        }

        // ── Industrial overhead cage light (interior) ──────────────────────
        const wlCordM = new THREE.MeshLambertMaterial({ color: 0x1a1410 })
        const wlCageM = new THREE.MeshLambertMaterial({ color: 0x252018 })
        const wlBulbM = new THREE.MeshBasicMaterial({ color: 0xfff4cc })
        const mkWhLight = (lx: number, ly: number, lz: number) => {
          const wlCord = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), wlCordM)
          wlCord.position.set(lx, ly - 0.3, lz); scene.add(wlCord)
          const wlCage = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.30, 0.42), wlCageM)
          wlCage.position.set(lx, ly - 0.75, lz); wlCage.castShadow = true; scene.add(wlCage)
          const wlBulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), wlBulbM)
          wlBulb.position.set(lx, ly - 0.80, lz); scene.add(wlBulb)
          const wlPL = new THREE.PointLight(0xfff0aa, 2.2, 24)
          wlPL.position.set(lx, ly - 1.1, lz); scene.add(wlPL)
        }

        // ── WH_A: Main NW warehouse (X=-8→9, Z=-77→-92, h=8.5) ───────────
        {
          const ax1 = -8, ax2 = 9, az1 = -77, az2 = -92, ah = 8.5
          const acx = (ax1 + ax2) / 2, acz = (az1 + az2) / 2
          const aW = ax2 - ax1, aD = Math.abs(az2 - az1)

          // Floor
          const whAF = new THREE.Mesh(new THREE.PlaneGeometry(aW, aD), idCnc)
          whAF.rotation.x = -Math.PI / 2; whAF.position.set(acx, 0.01, acz)
          whAF.receiveShadow = true; scene.add(whAF)

          // North wall
          stB(acx, ah / 2, az2 - IWT / 2, aW + IWT * 2, ah, IWT, idBk1)
          // West wall
          stB(ax1 - IWT / 2, ah / 2, acz, IWT, ah, aD + IWT * 2, idBk1)
          // East wall
          stB(ax2 + IWT / 2, ah / 2, acz, IWT, ah, aD + IWT * 2, idBk2)

          // South wall — large loading door opening (center X=2, width=3.5, doorH=3.2)
          const adx = 2.0, adw = 3.5, adh = 3.2
          const afl = (adx - adw / 2) - ax1        // left section X width
          const afr = ax2 - (adx + adw / 2)        // right section X width
          stB(ax1 + afl / 2, ah / 2, az1 - IWT / 2, afl, ah, IWT, idBk1)
          stB(ax2 - afr / 2, ah / 2, az1 - IWT / 2, afr, ah, IWT, idBk1)
          stB(adx, adh + (ah - adh) / 2, az1 - IWT / 2, adw, ah - adh, IWT, idBk1) // above door

          // Corrugated metal door panels (visual, leaning against wall sides)
          stB(adx - adw / 2 - 0.22, ah * 0.4, az1 - 0.12, 0.4, ah * 0.78, 0.08, idMtl)
          stB(adx + adw / 2 + 0.22, ah * 0.4, az1 - 0.12, 0.4, ah * 0.78, 0.08, idMtl)

          // Loading dock threshold
          stB(adx, 0.22, az1 + 0.6, adw + 0.8, 0.44, 1.2, idCnc)

          // Windows near top — north face (3), west face (2), east face (2)
          for (const wx of [-2.0, 2.0, 6.0]) {
            stB(wx, ah - 1.45, az2, 0.95, 1.55, IWT * 2.5, idBk1)          // frame
            stB(wx, ah - 1.45, az2 + 0.02, 0.6, 1.05, IWT * 0.7, idGls)   // glass
          }
          for (const wz of [-81.5, -87.5]) {
            stB(ax1, ah - 1.45, wz, IWT * 2.5, 1.55, 0.95, idBk1)
            stB(ax1 - 0.02, ah - 1.45, wz, IWT * 0.7, 1.05, 0.6, idGls)
            stB(ax2, ah - 1.45, wz, IWT * 2.5, 1.55, 0.95, idBk2)
            stB(ax2 + 0.02, ah - 1.45, wz, IWT * 0.7, 1.05, 0.6, idGls)
          }

          // Interior: steel columns + overhead hoist track
          for (const cz of [-80.5, -86.5]) {
            stB(ax1 + 2.2, ah * 0.45, cz, 0.3, ah * 0.9, 0.3, idCnc)
            stB(ax2 - 2.2, ah * 0.45, cz, 0.3, ah * 0.9, 0.3, idCnc)
          }
          stB(acx, ah - 0.24, acz, 0.22, 0.28, aD - 2.5, idMtl) // hoist rail

          // Rooftop: vent stacks + chimney details
          stB(acx, ah + 1.1, acz - 4, 0.55, 2.2, 0.55, idMtl)
          stB(acx + 4, ah + 0.9, acz, 0.48, 1.8, 0.48, idRst)
          stB(ax1 + 2.5, ah + 0.7, az2 + 2.5, 0.42, 1.4, 0.42, idMtl)
          // Vent cap discs
          stB(acx, ah + 2.25, acz - 4, 0.78, 0.12, 0.78, idMtl)
          stB(acx + 4, ah + 1.84, acz, 0.68, 0.12, 0.68, idMtl)

          mkRampart(ax1, ax2, az1, az2, ah)
          mkIndLadderE(ax2 + 0.15, (az1 + az2) / 2, ah)   // east-wall ladder
          mkGate('WH_A', adx, az1 - IWT / 2, adw, adh)    // closed metal gate
        }

        // ── WH_B: NE warehouse (X=13→22, Z=-77→-92, h=7.5) ──────────────
        {
          const bx1 = 13, bx2 = 22, bz1 = -77, bz2 = -92, bh = 7.5
          const bcx = (bx1 + bx2) / 2, bcz = (bz1 + bz2) / 2
          const bW = bx2 - bx1, bD = Math.abs(bz2 - bz1)

          const whBF = new THREE.Mesh(new THREE.PlaneGeometry(bW, bD), idCnc)
          whBF.rotation.x = -Math.PI / 2; whBF.position.set(bcx, 0.01, bcz)
          whBF.receiveShadow = true; scene.add(whBF)

          stB(bcx, bh / 2, bz2 - IWT / 2, bW + IWT * 2, bh, IWT, idBk2)
          stB(bx1 - IWT / 2, bh / 2, bcz, IWT, bh, bD + IWT * 2, idBk1)
          stB(bx2 + IWT / 2, bh / 2, bcz, IWT, bh, bD + IWT * 2, idBk2)

          // South wall — door opening (center X=17.5, width=2.5, h=3.0)
          const bdx = 17.5, bdw = 2.5, bdh = 3.0
          const bfl = (bdx - bdw / 2) - bx1
          const bfr = bx2 - (bdx + bdw / 2)
          stB(bx1 + bfl / 2, bh / 2, bz1 - IWT / 2, bfl, bh, IWT, idBk2)
          stB(bx2 - bfr / 2, bh / 2, bz1 - IWT / 2, bfr, bh, IWT, idBk2)
          stB(bdx, bdh + (bh - bdh) / 2, bz1 - IWT / 2, bdw, bh - bdh, IWT, idBk2)

          stB(bdx, 0.22, bz1 + 0.55, bdw + 0.6, 0.44, 1.1, idCnc) // dock

          // Windows
          for (const wx of [15.5, 19.5]) {
            stB(wx, bh - 1.35, bz2, 0.9, 1.45, IWT * 2.5, idBk2)
            stB(wx, bh - 1.35, bz2 + 0.02, 0.56, 0.98, IWT * 0.7, idGls)
          }
          for (const wz of [-82.0, -88.0]) {
            stB(bx1, bh - 1.35, wz, IWT * 2.5, 1.45, 0.9, idBk1)
            stB(bx1 - 0.02, bh - 1.35, wz, IWT * 0.7, 0.98, 0.56, idGls)
            stB(bx2, bh - 1.35, wz, IWT * 2.5, 1.45, 0.9, idBk2)
            stB(bx2 + 0.02, bh - 1.35, wz, IWT * 0.7, 0.98, 0.56, idGls)
          }

          // Interior column
          stB(bcx, bh * 0.45, bcz, 0.3, bh * 0.9, 0.3, idCnc)
          stB(bcx, bh - 0.24, bcz, 0.2, 0.26, bD - 2.5, idMtl)

          // Rooftop vents
          stB(bcx - 1.5, bh + 0.9, bcz - 2, 0.5, 1.8, 0.5, idMtl)
          stB(bx2 - 2, bh + 0.7, bz2 + 2.5, 0.45, 1.4, 0.45, idRst)
          stB(bcx - 1.5, bh + 1.85, bcz - 2, 0.72, 0.12, 0.72, idMtl)

          mkRampart(bx1, bx2, bz1, bz2, bh)
          mkIndLadderE(bx2 + 0.15, (bz1 + bz2) / 2, bh)
          mkGate('WH_B', bdx, bz1 - IWT / 2, bdw, bdh)
        }

        // ── WH_C: SW warehouse (X=-8→6, Z=-60→-73, h=6.5) ───────────────
        {
          const cx1 = -8, cx2 = 6, cz1 = -60, cz2 = -73, ch = 6.5
          const ccx = (cx1 + cx2) / 2, ccz = (cz1 + cz2) / 2
          const cW = cx2 - cx1, cD = Math.abs(cz2 - cz1)

          const whCF = new THREE.Mesh(new THREE.PlaneGeometry(cW, cD), idCnc)
          whCF.rotation.x = -Math.PI / 2; whCF.position.set(ccx, 0.01, ccz)
          whCF.receiveShadow = true; scene.add(whCF)

          stB(ccx, ch / 2, cz2 - IWT / 2, cW + IWT * 2, ch, IWT, idBk1)
          stB(cx1 - IWT / 2, ch / 2, ccz, IWT, ch, cD + IWT * 2, idBk1)
          stB(cx2 + IWT / 2, ch / 2, ccz, IWT, ch, cD + IWT * 2, idBk2)

          // South wall — narrow door (center X=0.5, width=2.2, h=2.8)
          const cdx = 0.5, cdw = 2.2, cdh = 2.8
          const cfl = (cdx - cdw / 2) - cx1
          const cfr = cx2 - (cdx + cdw / 2)
          stB(cx1 + cfl / 2, ch / 2, cz1 - IWT / 2, cfl, ch, IWT, idBk1)
          stB(cx2 - cfr / 2, ch / 2, cz1 - IWT / 2, cfr, ch, IWT, idBk1)
          stB(cdx, cdh + (ch - cdh) / 2, cz1 - IWT / 2, cdw, ch - cdh, IWT, idBk1)

          // Windows (2 north, 1 each side)
          for (const wx of [-1.5, 3.5]) {
            stB(wx, ch - 1.2, cz2, 0.9, 1.35, IWT * 2.5, idBk1)
            stB(wx, ch - 1.2, cz2 + 0.02, 0.56, 0.9, IWT * 0.7, idGls)
          }
          for (const wz of [-64.0, -70.0]) {
            stB(cx1, ch - 1.2, wz, IWT * 2.5, 1.35, 0.9, idBk1)
            stB(cx1 - 0.02, ch - 1.2, wz, IWT * 0.7, 0.9, 0.56, idGls)
            stB(cx2, ch - 1.2, wz, IWT * 2.5, 1.35, 0.9, idBk2)
            stB(cx2 + 0.02, ch - 1.2, wz, IWT * 0.7, 0.9, 0.56, idGls)
          }

          // Rooftop vent
          stB(ccx + 1.5, ch + 0.75, ccz - 1, 0.45, 1.5, 0.45, idRst)
          stB(ccx + 1.5, ch + 1.55, ccz - 1, 0.65, 0.12, 0.65, idMtl)

          mkRampart(cx1, cx2, cz1, cz2, ch)
          mkIndLadderE(cx2 + 0.15, (cz1 + cz2) / 2, ch)
          mkGate('WH_C', cdx, cz1 - IWT / 2, cdw, cdh)
        }

        // ── WH_D: SE warehouse (X=13→22, Z=-60→-73, h=7.0) — with stairs ─
        {
          const dx1 = 13, dx2 = 22, dz1 = -60, dz2 = -73, dh = 7.0
          const dcx = (dx1 + dx2) / 2, dcz = (dz1 + dz2) / 2
          const dW = dx2 - dx1, dD = Math.abs(dz2 - dz1)

          const whDF = new THREE.Mesh(new THREE.PlaneGeometry(dW, dD), idCnc)
          whDF.rotation.x = -Math.PI / 2; whDF.position.set(dcx, 0.01, dcz)
          whDF.receiveShadow = true; scene.add(whDF)

          stB(dcx, dh / 2, dz2 - IWT / 2, dW + IWT * 2, dh, IWT, idBk2)
          stB(dx1 - IWT / 2, dh / 2, dcz, IWT, dh, dD + IWT * 2, idBk2)
          stB(dx2 + IWT / 2, dh / 2, dcz, IWT, dh, dD + IWT * 2, idBk1)

          // South wall — door opening (center X=17.5, width=2.5, h=3.0)
          const ddx = 17.5, ddw = 2.5, ddh = 3.0
          const dfl = (ddx - ddw / 2) - dx1
          const dfr = dx2 - (ddx + ddw / 2)
          stB(dx1 + dfl / 2, dh / 2, dz1 - IWT / 2, dfl, dh, IWT, idBk2)
          stB(dx2 - dfr / 2, dh / 2, dz1 - IWT / 2, dfr, dh, IWT, idBk2)
          stB(ddx, ddh + (dh - ddh) / 2, dz1 - IWT / 2, ddw, dh - ddh, IWT, idBk2)

          stB(ddx, 0.22, dz1 + 0.55, ddw + 0.6, 0.44, 1.1, idCnc) // dock

          // Windows
          for (const wx of [15.5, 19.5]) {
            stB(wx, dh - 1.3, dz2, 0.9, 1.45, IWT * 2.5, idBk2)
            stB(wx, dh - 1.3, dz2 + 0.02, 0.56, 0.98, IWT * 0.7, idGls)
          }
          for (const wz of [-64.0, -70.0]) {
            stB(dx1, dh - 1.3, wz, IWT * 2.5, 1.45, 0.9, idBk2)
            stB(dx1 - 0.02, dh - 1.3, wz, IWT * 0.7, 0.98, 0.56, idGls)
            stB(dx2, dh - 1.3, wz, IWT * 2.5, 1.45, 0.9, idBk1)
            stB(dx2 + 0.02, dh - 1.3, wz, IWT * 0.7, 0.98, 0.56, idGls)
          }

          // Interior column + hoist
          stB(dcx, dh * 0.45, dcz, 0.3, dh * 0.9, 0.3, idCnc)
          stB(dcx, dh - 0.22, dcz, 0.2, 0.26, dD - 2.5, idMtl)

          // Rooftop vents
          stB(dcx - 1, dh + 0.85, dcz - 1.5, 0.5, 1.7, 0.5, idMtl)
          stB(dcx - 1, dh + 1.75, dcz - 1.5, 0.72, 0.12, 0.72, idMtl)

          mkRampart(dx1, dx2, dz1, dz2, dh)
          mkIndLadderE(dx2 + 0.15, (dz1 + dz2) / 2, dh)
          mkGate('WH_D', ddx, dz1 - IWT / 2, ddw, ddh)
        }

        // ── Overhead catwalk connecting WH_A east rampart → WH_B west rampart ─
        // Spans the 4-unit gap X=9→13, at Z=-84.5, elevation Y=7.5 (WH_B rampart height)
        stB(11, 7.5 + 0.09, -84.5, 4.6, 0.18, 1.3, idWlk) // catwalk floor slab
        for (const oz of [-0.65, 0.65]) {
          stB(11, 7.5 + 0.45, -84.5 + oz, 4.6, 0.06, 0.06, idRal) // side rails
          for (const px of [9.4, 11.0, 12.6]) stB(px, 7.5 + 0.38, -84.5 + oz, 0.07, 0.56, 0.07, idRal) // posts
        }

        // ── WH_E: west-extension NW (X=-26→-12, Z=-77→-92, h=7.5) ──────────
        {
          const ex1 = -26, ex2 = -12, ez1 = -77, ez2 = -92, eh = 7.5
          const ecx = (ex1 + ex2) / 2, ecz = (ez1 + ez2) / 2
          const eW = ex2 - ex1, eD = Math.abs(ez2 - ez1)
          const edx = -19.0, edw = 3.0, edh = 3.0

          const eF = new THREE.Mesh(new THREE.PlaneGeometry(eW, eD), idCnc)
          eF.rotation.x = -Math.PI / 2; eF.position.set(ecx, 0.01, ecz); eF.receiveShadow = true; scene.add(eF)

          stB(ecx, eh / 2, ez2 - IWT / 2, eW + IWT * 2, eh, IWT, idBk2)  // north
          stB(ex1 - IWT / 2, eh / 2, ecz, IWT, eh, eD + IWT * 2, idBk1)  // west
          stB(ex2 + IWT / 2, eh / 2, ecz, IWT, eh, eD + IWT * 2, idBk2)  // east

          // South wall with loading door
          const efl = (edx - edw / 2) - ex1, efr = ex2 - (edx + edw / 2)
          stB(ex1 + efl / 2, eh / 2, ez1 - IWT / 2, efl, eh, IWT, idBk1)
          stB(ex2 - efr / 2, eh / 2, ez1 - IWT / 2, efr, eh, IWT, idBk1)
          stB(edx, edh + (eh - edh) / 2, ez1 - IWT / 2, edw, eh - edh, IWT, idBk1)
          stB(edx, 0.22, ez1 + 0.55, edw + 0.6, 0.44, 1.1, idCnc)

          // Windows
          for (const wx of [-23, -17]) {
            stB(wx, eh - 1.35, ez2, 0.9, 1.4, IWT * 2.5, idBk2)
            stB(wx, eh - 1.35, ez2 + 0.02, 0.55, 0.95, IWT * 0.7, idGls)
          }
          for (const wz of [-81, -87]) {
            stB(ex1, eh - 1.35, wz, IWT * 2.5, 1.4, 0.9, idBk1)
            stB(ex1 - 0.02, eh - 1.35, wz, IWT * 0.7, 0.95, 0.55, idGls)
            stB(ex2, eh - 1.35, wz, IWT * 2.5, 1.4, 0.9, idBk2)
            stB(ex2 + 0.02, eh - 1.35, wz, IWT * 0.7, 0.95, 0.55, idGls)
          }

          // Interior column + hoist rail
          stB(ecx, eh * 0.45, ecz, 0.3, eh * 0.9, 0.3, idCnc)
          stB(ecx, eh - 0.24, ecz, 0.22, 0.28, eD - 2.5, idMtl)

          // Rooftop vents
          stB(ecx - 2, eh + 0.9, ecz + 2, 0.5, 1.8, 0.5, idMtl)
          stB(ecx - 2, eh + 1.84, ecz + 2, 0.72, 0.12, 0.72, idMtl)
          stB(ecx + 3, eh + 0.7, ecz - 3, 0.45, 1.4, 0.45, idRst)

          mkRampart(ex1, ex2, ez1, ez2, eh)
          mkIndLadderE(ex2 + 0.15, (ez1 + ez2) / 2, eh)
          mkGate('WH_E', edx, ez1 - IWT / 2, edw, edh)
        }

        // ── WH_F: west-extension SW (X=-26→-12, Z=-60→-73, h=6.5) ──────────
        {
          const fx1 = -26, fx2 = -12, fz1 = -60, fz2 = -73, fh = 6.5
          const fcx = (fx1 + fx2) / 2, fcz = (fz1 + fz2) / 2
          const fW = fx2 - fx1, fD = Math.abs(fz2 - fz1)
          const fdx = -19.0, fdw = 2.8, fdh = 2.8

          const fFlr = new THREE.Mesh(new THREE.PlaneGeometry(fW, fD), idCnc)
          fFlr.rotation.x = -Math.PI / 2; fFlr.position.set(fcx, 0.01, fcz); fFlr.receiveShadow = true; scene.add(fFlr)

          stB(fcx, fh / 2, fz2 - IWT / 2, fW + IWT * 2, fh, IWT, idBk1)
          stB(fx1 - IWT / 2, fh / 2, fcz, IWT, fh, fD + IWT * 2, idBk1)
          stB(fx2 + IWT / 2, fh / 2, fcz, IWT, fh, fD + IWT * 2, idBk2)

          const ffl = (fdx - fdw / 2) - fx1, ffr = fx2 - (fdx + fdw / 2)
          stB(fx1 + ffl / 2, fh / 2, fz1 - IWT / 2, ffl, fh, IWT, idBk1)
          stB(fx2 - ffr / 2, fh / 2, fz1 - IWT / 2, ffr, fh, IWT, idBk1)
          stB(fdx, fdh + (fh - fdh) / 2, fz1 - IWT / 2, fdw, fh - fdh, IWT, idBk1)
          stB(fdx, 0.22, fz1 + 0.5, fdw + 0.5, 0.44, 1.0, idCnc)

          for (const wx of [-23, -17]) {
            stB(wx, fh - 1.2, fz2, 0.88, 1.35, IWT * 2.5, idBk1)
            stB(wx, fh - 1.2, fz2 + 0.02, 0.54, 0.9, IWT * 0.7, idGls)
          }
          for (const wz of [-64, -70]) {
            stB(fx1, fh - 1.2, wz, IWT * 2.5, 1.35, 0.88, idBk1)
            stB(fx1 - 0.02, fh - 1.2, wz, IWT * 0.7, 0.9, 0.54, idGls)
            stB(fx2, fh - 1.2, wz, IWT * 2.5, 1.35, 0.88, idBk2)
            stB(fx2 + 0.02, fh - 1.2, wz, IWT * 0.7, 0.9, 0.54, idGls)
          }

          stB(fcx, fh * 0.45, fcz, 0.3, fh * 0.9, 0.3, idCnc)
          stB(fcx, fh - 0.22, fcz, 0.2, 0.26, fD - 2.5, idMtl)
          stB(fcx + 2, fh + 0.75, fcz - 1.5, 0.45, 1.5, 0.45, idRst)
          stB(fcx + 2, fh + 1.55, fcz - 1.5, 0.65, 0.12, 0.65, idMtl)

          mkRampart(fx1, fx2, fz1, fz2, fh)
          mkIndLadderE(fx2 + 0.15, (fz1 + fz2) / 2, fh)
          mkGate('WH_F', fdx, fz1 - IWT / 2, fdw, fdh)
        }

        // ── WH_G: far-west NW (X=-44→-30, Z=-77→-92, h=8.0) ────────────────
        {
          const gx1 = -44, gx2 = -30, gz1 = -77, gz2 = -92, gh = 8.0
          const gcx = (gx1 + gx2) / 2, gcz = (gz1 + gz2) / 2
          const gW = gx2 - gx1, gD = Math.abs(gz2 - gz1)
          const gdx = -37.0, gdw = 3.5, gdh = 3.2

          const gFlr = new THREE.Mesh(new THREE.PlaneGeometry(gW, gD), idCnc)
          gFlr.rotation.x = -Math.PI / 2; gFlr.position.set(gcx, 0.01, gcz); gFlr.receiveShadow = true; scene.add(gFlr)

          stB(gcx, gh / 2, gz2 - IWT / 2, gW + IWT * 2, gh, IWT, idBk1)
          stB(gx1 - IWT / 2, gh / 2, gcz, IWT, gh, gD + IWT * 2, idBk1)
          stB(gx2 + IWT / 2, gh / 2, gcz, IWT, gh, gD + IWT * 2, idBk2)

          const gfl = (gdx - gdw / 2) - gx1, gfr = gx2 - (gdx + gdw / 2)
          stB(gx1 + gfl / 2, gh / 2, gz1 - IWT / 2, gfl, gh, IWT, idBk1)
          stB(gx2 - gfr / 2, gh / 2, gz1 - IWT / 2, gfr, gh, IWT, idBk1)
          stB(gdx, gdh + (gh - gdh) / 2, gz1 - IWT / 2, gdw, gh - gdh, IWT, idBk1)
          stB(gdx, 0.22, gz1 + 0.6, gdw + 0.8, 0.44, 1.2, idCnc)

          for (const wx of [-41, -35]) {
            stB(wx, gh - 1.4, gz2, 0.95, 1.5, IWT * 2.5, idBk1)
            stB(wx, gh - 1.4, gz2 + 0.02, 0.6, 1.05, IWT * 0.7, idGls)
          }
          for (const wz of [-81, -87]) {
            stB(gx1, gh - 1.4, wz, IWT * 2.5, 1.5, 0.95, idBk1)
            stB(gx1 - 0.02, gh - 1.4, wz, IWT * 0.7, 1.05, 0.6, idGls)
            stB(gx2, gh - 1.4, wz, IWT * 2.5, 1.5, 0.95, idBk2)
            stB(gx2 + 0.02, gh - 1.4, wz, IWT * 0.7, 1.05, 0.6, idGls)
          }

          for (const cz of [-81, -87]) {
            stB(gx1 + 2.5, gh * 0.45, cz, 0.3, gh * 0.9, 0.3, idCnc)
            stB(gx2 - 2.5, gh * 0.45, cz, 0.3, gh * 0.9, 0.3, idCnc)
          }
          stB(gcx, gh - 0.24, gcz, 0.22, 0.28, gD - 2.5, idMtl)

          stB(gcx, gh + 1.1, gcz - 3, 0.55, 2.2, 0.55, idMtl)
          stB(gcx, gh + 2.25, gcz - 3, 0.78, 0.12, 0.78, idMtl)
          stB(gcx + 4, gh + 0.8, gcz + 2, 0.48, 1.6, 0.48, idRst)

          mkRampart(gx1, gx2, gz1, gz2, gh)
          mkIndLadderE(gx2 + 0.15, (gz1 + gz2) / 2, gh)
          mkGate('WH_G', gdx, gz1 - IWT / 2, gdw, gdh)
        }

        // ── WH_H: far-west SW (X=-44→-30, Z=-60→-73, h=7.0) ────────────────
        {
          const hx1 = -44, hx2 = -30, hz1 = -60, hz2 = -73, hh = 7.0
          const hcx = (hx1 + hx2) / 2, hcz = (hz1 + hz2) / 2
          const hW = hx2 - hx1, hD = Math.abs(hz2 - hz1)
          const hdx = -37.0, hdw = 3.0, hdh = 3.0

          const hFlr = new THREE.Mesh(new THREE.PlaneGeometry(hW, hD), idCnc)
          hFlr.rotation.x = -Math.PI / 2; hFlr.position.set(hcx, 0.01, hcz); hFlr.receiveShadow = true; scene.add(hFlr)

          stB(hcx, hh / 2, hz2 - IWT / 2, hW + IWT * 2, hh, IWT, idBk2)
          stB(hx1 - IWT / 2, hh / 2, hcz, IWT, hh, hD + IWT * 2, idBk1)
          stB(hx2 + IWT / 2, hh / 2, hcz, IWT, hh, hD + IWT * 2, idBk2)

          const hfl = (hdx - hdw / 2) - hx1, hfr = hx2 - (hdx + hdw / 2)
          stB(hx1 + hfl / 2, hh / 2, hz1 - IWT / 2, hfl, hh, IWT, idBk2)
          stB(hx2 - hfr / 2, hh / 2, hz1 - IWT / 2, hfr, hh, IWT, idBk2)
          stB(hdx, hdh + (hh - hdh) / 2, hz1 - IWT / 2, hdw, hh - hdh, IWT, idBk2)
          stB(hdx, 0.22, hz1 + 0.55, hdw + 0.6, 0.44, 1.1, idCnc)

          for (const wx of [-41, -35]) {
            stB(wx, hh - 1.3, hz2, 0.9, 1.4, IWT * 2.5, idBk2)
            stB(wx, hh - 1.3, hz2 + 0.02, 0.56, 0.95, IWT * 0.7, idGls)
          }
          for (const wz of [-64, -70]) {
            stB(hx1, hh - 1.3, wz, IWT * 2.5, 1.4, 0.9, idBk1)
            stB(hx1 - 0.02, hh - 1.3, wz, IWT * 0.7, 0.95, 0.56, idGls)
            stB(hx2, hh - 1.3, wz, IWT * 2.5, 1.4, 0.9, idBk2)
            stB(hx2 + 0.02, hh - 1.3, wz, IWT * 0.7, 0.95, 0.56, idGls)
          }

          stB(hcx, hh * 0.45, hcz, 0.3, hh * 0.9, 0.3, idCnc)
          stB(hcx, hh - 0.22, hcz, 0.2, 0.26, hD - 2.5, idMtl)
          stB(hcx - 2, hh + 0.85, hcz - 2, 0.5, 1.7, 0.5, idMtl)
          stB(hcx - 2, hh + 1.75, hcz - 2, 0.72, 0.12, 0.72, idMtl)

          mkRampart(hx1, hx2, hz1, hz2, hh)
          mkIndLadderE(hx2 + 0.15, (hz1 + hz2) / 2, hh)
          mkGate('WH_H', hdx, hz1 - IWT / 2, hdw, hdh)
        }

        // ── Alley props ────────────────────────────────────────────────────
        // Fire barrels
        mkIndBarrel(-1.0, -64.5)
        mkIndBarrel(10.5, -75.5)
        mkIndBarrel(20.5, -68.5)
        mkIndBarrel(4.5, -88.5)
        mkIndBarrel(17.0, -85.5)
        mkIndBarrel(7.5, -63.5)

        // Dumpsters in alleys
        mkDumpster(7.2,  -65.5, 0.18)
        mkDumpster(-3.8, -75.5, 0)
        mkDumpster(21.0, -79.0, Math.PI / 2)
        mkDumpster(11.0, -62.5, 0.05)

        // Stacked wooden crates
        for (const [cx3, cz3, stack] of [
          [-3.5, -70, 2], [8.5, -90, 3], [14.0, -62.5, 2], [21.5, -90, 2], [11.5, -85, 2],
        ] as [number, number, number][]) {
          for (let ci = 0; ci < stack; ci++) {
            stB(cx3, 0.55 + ci * 1.0, cz3, 1.6, 0.9, 1.6, idCrt)
            stB(cx3, 0.96 + ci * 1.0, cz3, 1.62, 0.08, 1.62, idCap)
          }
        }

        // Rusty 55-gal barrels (non-lit)
        for (const [bx, bz] of [[-4, -90], [8, -79], [22, -63], [12, -72]] as [number, number][]) {
          stB(bx, 0.4, bz, 0.46, 0.8, 0.46, idRst)
        }

        // Chain-link fence fragments along alley edges
        const fenceM = new THREE.MeshLambertMaterial({ color: 0x1c1c18, transparent: true, opacity: 0.72 })
        for (const [fx, fy, fz, fw, fh, fd] of [
          [11.5, 0.9, -70.5, 2.6, 1.8, 0.06],  // east side of cross-alley
          [11.5, 0.9, -67.0, 2.6, 1.8, 0.06],
          [-3.8, 0.9, -59.2, 0.06, 1.8, 2.5],  // south entrance west
          [22.2, 0.9, -59.2, 0.06, 1.8, 2.5],  // south entrance east
        ] as [number, number, number, number, number, number][]) {
          const fm = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fd), fenceM)
          fm.position.set(fx, fy, fz); scene.add(fm)
        }

        // Alley street lamps — full district coverage (sodium vapor)
        mkIndLamp(-4.0,  -64.0)
        mkIndLamp(10.5,  -66.5)
        mkIndLamp(10.5,  -84.5)
        mkIndLamp(23.0,  -75.5)
        mkIndLamp(10.5,  -58.5)  // south entrance east
        mkIndLamp(-4.0,  -75.5)  // east cross-alley
        mkIndLamp(-13.5, -58.5)  // south entrance mid
        mkIndLamp(-28.5, -58.5)  // south entrance west
        mkIndLamp(-43.5, -58.5)  // south entrance far-west
        mkIndLamp(-13.5, -66.5)  // WH_F south row
        mkIndLamp(-28.5, -66.5)  // WH_H south row
        mkIndLamp(-13.5, -75.5)  // cross-alley center
        mkIndLamp(-28.5, -75.5)  // cross-alley west
        mkIndLamp(-43.5, -75.5)  // cross-alley far-west
        mkIndLamp(-13.5, -84.5)  // WH_E north row
        mkIndLamp(-28.5, -84.5)  // WH_G north row

        // Interior warehouse cage lights (2 per warehouse)
        mkWhLight(  0.5, 8.5, -81.0); mkWhLight(  0.5, 8.5, -88.0)  // WH_A
        mkWhLight( 17.5, 7.5, -81.0); mkWhLight( 17.5, 7.5, -88.0)  // WH_B
        mkWhLight( -1.0, 6.5, -63.0); mkWhLight( -1.0, 6.5, -70.0)  // WH_C
        mkWhLight( 17.5, 7.0, -63.0); mkWhLight( 17.5, 7.0, -70.0)  // WH_D
        mkWhLight(-19.0, 7.5, -81.0); mkWhLight(-19.0, 7.5, -88.0)  // WH_E
        mkWhLight(-19.0, 6.5, -63.0); mkWhLight(-19.0, 6.5, -70.0)  // WH_F
        mkWhLight(-37.0, 8.0, -81.0); mkWhLight(-37.0, 8.0, -88.0)  // WH_G
        mkWhLight(-37.0, 7.0, -63.0); mkWhLight(-37.0, 7.0, -70.0)  // WH_H
      }

      // ── Perimeter road loop around Industrial District ─────────────────────────
      // Road centerlines: south Z=-55, north Z=-97, east X=28, west X=-51
      {
        const rdMat   = new THREE.MeshLambertMaterial({ color: 0x1c1c22 })
        const swMat   = new THREE.MeshLambertMaterial({ color: 0x38383e })
        const cuMat   = new THREE.MeshLambertMaterial({ color: 0x4e4e58 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poleMat: any = new THREE.MeshLambertMaterial({ color: 0x111116 })
        const lensM   = new THREE.MeshBasicMaterial({ color: 0xffee88 })
        const dashMat = new THREE.MeshLambertMaterial({ color: 0xffcc00 })

        const prS = -55, prN = -97, prE = 28, prW = -51
        const rdW = 4.0, swW = 1.8, cuW = 0.22, cuH = 0.12
        const hX     = rdW / 2 + cuW + swW   // half cross-section = 4.02
        const ewCX   = (prW + prE) / 2        // -11.5
        const nsCZ   = (prN + prS) / 2        // -76
        const ewLen  = prE - prW               // 79
        const nsLen  = prS - prN               // 42
        const ewFull = ewLen + 2 * hX          // 87.04 — extends into corners
        const nsFull = nsLen - 2 * hX          // 33.96 — trimmed at corners

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rPlane = (cx: number, cz: number, w: number, d: number, y: number, mat: any) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
          m.rotation.x = -Math.PI / 2; m.position.set(cx, y, cz)
          m.receiveShadow = true; scene.add(m)
        }
        const rBox = (cx: number, cz: number, bw: number, bd: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(bw, cuH, bd), cuMat)
          m.position.set(cx, cuH / 2, cz); scene.add(m)
        }

        // Asphalt road surfaces
        rPlane(ewCX, prS, ewFull, rdW, 0.006, rdMat)       // south E-W (covers corners)
        rPlane(ewCX, prN, ewFull, rdW, 0.006, rdMat)       // north E-W (covers corners)
        rPlane(prE,  nsCZ, rdW,  nsFull, 0.006, rdMat)    // east N-S (trimmed)
        rPlane(prW,  nsCZ, rdW,  nsFull, 0.006, rdMat)    // west N-S (trimmed)

        // Yellow center-line stripe on each segment
        rPlane(ewCX, prS,  ewLen, 0.18, 0.012, dashMat)
        rPlane(ewCX, prN,  ewLen, 0.18, 0.012, dashMat)
        rPlane(prE,  nsCZ, 0.18, nsLen, 0.012, dashMat)
        rPlane(prW,  nsCZ, 0.18, nsLen, 0.012, dashMat)

        // Curbs — raised stone strips at road edges
        rBox(ewCX, prS + rdW / 2 + cuW / 2, ewFull, cuW)   // south road N curb
        rBox(ewCX, prS - rdW / 2 - cuW / 2, ewFull, cuW)   // south road S curb
        rBox(ewCX, prN + rdW / 2 + cuW / 2, ewFull, cuW)   // north road N curb (inner)
        rBox(ewCX, prN - rdW / 2 - cuW / 2, ewFull, cuW)   // north road S curb (outer)
        rBox(prE + rdW / 2 + cuW / 2, nsCZ, cuW, nsFull)   // east road E curb (outer)
        rBox(prE - rdW / 2 - cuW / 2, nsCZ, cuW, nsFull)   // east road W curb (inner)
        rBox(prW + rdW / 2 + cuW / 2, nsCZ, cuW, nsFull)   // west road E curb (inner)
        rBox(prW - rdW / 2 - cuW / 2, nsCZ, cuW, nsFull)   // west road W curb (outer)

        // Sidewalks — concrete paving on both sides of each road segment
        rPlane(ewCX, prS + rdW / 2 + cuW + swW / 2, ewFull, swW, 0.07, swMat)  // south-N
        rPlane(ewCX, prS - rdW / 2 - cuW - swW / 2, ewFull, swW, 0.07, swMat)  // south-S
        rPlane(ewCX, prN + rdW / 2 + cuW + swW / 2, ewFull, swW, 0.07, swMat)  // north-N (inner)
        rPlane(ewCX, prN - rdW / 2 - cuW - swW / 2, ewFull, swW, 0.07, swMat)  // north-S (outer)
        rPlane(prE + rdW / 2 + cuW + swW / 2, nsCZ, swW, nsFull, 0.07, swMat)  // east-E (outer)
        rPlane(prE - rdW / 2 - cuW - swW / 2, nsCZ, swW, nsFull, 0.07, swMat)  // east-W (inner)
        rPlane(prW + rdW / 2 + cuW + swW / 2, nsCZ, swW, nsFull, 0.07, swMat)  // west-E (inner)
        rPlane(prW - rdW / 2 - cuW - swW / 2, nsCZ, swW, nsFull, 0.07, swMat)  // west-W (outer)

        // Street lamp: tall iron pole + horizontal arm + sodium-vapor head + PointLight
        const mkStrLamp = (lx: number, lz: number, armAxis: 'x' | 'z', armSign: number) => {
          const pH = 6.2, aL = 2.0
          stB(lx, pH / 2, lz, 0.1, pH, 0.1, poleMat)
          const aox = armAxis === 'x' ? armSign * aL / 2 : 0
          const aoz = armAxis === 'z' ? armSign * aL / 2 : 0
          stB(lx + aox, pH - 0.05, lz + aoz,
            armAxis === 'x' ? aL : 0.08, 0.08, armAxis === 'z' ? aL : 0.08, poleMat)
          const hx = lx + (armAxis === 'x' ? armSign * aL : 0)
          const hz = lz + (armAxis === 'z' ? armSign * aL : 0)
          stB(hx, pH - 0.42, hz,
            armAxis === 'x' ? 0.38 : 0.24, 0.26, armAxis === 'z' ? 0.38 : 0.24, poleMat)
          const lens = new THREE.Mesh(
            new THREE.BoxGeometry(armAxis === 'x' ? 0.24 : 0.16, 0.09, armAxis === 'z' ? 0.24 : 0.16),
            lensM
          )
          lens.position.set(hx, pH - 0.57, hz); scene.add(lens)
          const pl = new THREE.PointLight(0xffbb55, 4.2, 40)
          pl.position.set(hx, pH - 0.8, hz); scene.add(pl)
        }

        // Pole placed on outer sidewalk; arm swings toward road center over carriageway
        const outerOff = rdW / 2 + cuW + swW * 0.7  // ≈ 3.48 from road center

        // South road — outer sidewalk is south (more −Z); arm points +Z toward road
        for (let lx = prW + 8; lx <= prE - 6; lx += 14)
          mkStrLamp(lx, prS - outerOff, 'z', +1)

        // North road — outer sidewalk is north (more −Z); arm points +Z toward road
        for (let lx = prW + 8; lx <= prE - 6; lx += 14)
          mkStrLamp(lx, prN - outerOff, 'z', +1)

        // East road — outer sidewalk is east (more +X); arm points −X toward road
        for (let lz = prN + 8; lz <= prS - 6; lz += 12)
          mkStrLamp(prE + outerOff, lz, 'x', -1)

        // West road — outer sidewalk is west (more −X); arm points +X toward road
        for (let lz = prN + 8; lz <= prS - 6; lz += 12)
          mkStrLamp(prW - outerOff, lz, 'x', +1)
      }

      // ── The Sanctum — Chancellor's Command Stronghold ─────────────────────────
      // Compound wall: X=47→73, Z=-57(south)→-83(north)
      // Main building: X=54→66, Z=-63→-77, 2 floors + roof
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const smDkM:  any = new THREE.MeshLambertMaterial({ color: 0x060c06 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const smDk2M: any = new THREE.MeshLambertMaterial({ color: 0x0a100a })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const smGrnM: any = new THREE.MeshBasicMaterial({ color: 0x00ff55 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const smGrnDimM: any = new THREE.MeshLambertMaterial({ color: 0x003a18 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const smMtlM: any = new THREE.MeshLambertMaterial({ color: 0x060608 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const smGlsM: any = new THREE.MeshLambertMaterial({ color: 0x001a08, transparent: true, opacity: 0.74 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const smFlrM: any = new THREE.MeshLambertMaterial({ color: 0x0c120c })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const smCncM: any = new THREE.MeshLambertMaterial({ color: 0x0f150f })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const smConsMat: any = new THREE.MeshLambertMaterial({ color: 0x060e06 })

        const gPL = (x: number, y: number, z: number, intensity: number, range: number) => {
          const pl = new THREE.PointLight(0x00ff55, intensity, range)
          pl.position.set(x, y, z); scene.add(pl)
        }

        // Compound bounds
        const cwx1 = 47, cwx2 = 73, cwz1 = -57, cwz2 = -83
        const cwT = 0.5, cwH = 4.5
        const cwCX = (cwx1 + cwx2) / 2  // 60
        const cwCZ = (cwz1 + cwz2) / 2  // -70

        // Compound ground fill
        const cGnd = new THREE.Mesh(new THREE.PlaneGeometry(cwx2 - cwx1, Math.abs(cwz2 - cwz1)), smFlrM)
        cGnd.rotation.x = -Math.PI / 2; cGnd.position.set(cwCX, 0.005, cwCZ)
        cGnd.receiveShadow = true; scene.add(cGnd)
        const cGr = new THREE.GridHelper(26, 13, 0x0c180c, 0x0c180c)
        cGr.position.set(cwCX, 0.008, cwCZ); scene.add(cGr)

        // ── Perimeter walls ──────────────────────────────────────────────────────
        // South wall (cwz1=-57): front gate opening X=58.5→61.5
        stB(52.75, cwH / 2, cwz1, 11.5, cwH, cwT, smDkM)  // left of gate
        stB(67.25, cwH / 2, cwz1, 11.5, cwH, cwT, smDkM)  // right of gate
        // North wall (cwz2=-83): crawl gap X=59→61
        stB(53,    cwH / 2, cwz2, 12,   cwH, cwT, smDkM)
        stB(67,    cwH / 2, cwz2, 12,   cwH, cwT, smDkM)
        stB(60, 1.4 + (cwH - 1.4) / 2, cwz2, 2, cwH - 1.4, cwT, smDkM) // above crawl hole
        // West wall (cwx1=47): side gate Z=-68.5→-71.5
        stB(cwx1, cwH / 2, -62.75, cwT, cwH, 11.5, smDkM)
        stB(cwx1, cwH / 2, -77.25, cwT, cwH, 11.5, smDkM)
        // East wall (cwx2=73): mirror side gate
        stB(cwx2, cwH / 2, -62.75, cwT, cwH, 11.5, smDkM)
        stB(cwx2, cwH / 2, -77.25, cwT, cwH, 11.5, smDkM)

        // Green top-edge strips on all walls
        for (const [wx, wz, ww, wd] of [
          [cwCX, cwz1, cwx2 - cwx1, cwT * 1.1],
          [cwCX, cwz2, cwx2 - cwx1, cwT * 1.1],
          [cwx1, cwCZ, cwT * 1.1, Math.abs(cwz2 - cwz1)],
          [cwx2, cwCZ, cwT * 1.1, Math.abs(cwz2 - cwz1)],
        ] as [number, number, number, number][]) {
          stB(wx, cwH + 0.07, wz, ww, 0.14, wd, smGrnM)
        }

        // ── Front gate (south, iron bars) ────────────────────────────────────────
        const fgH = cwH + 1.2
        stB(58.2, fgH / 2, cwz1, 0.55, fgH, 0.55, smMtlM)   // left pillar
        stB(61.8, fgH / 2, cwz1, 0.55, fgH, 0.55, smMtlM)   // right pillar
        stB(60, fgH - 0.11, cwz1, 4.0, 0.22, 0.55, smMtlM)  // arch header
        stB(58.2, 2.8, cwz1 - 0.04, 0.07, 3.8, 0.07, smGrnM)  // pillar glow strip L
        stB(61.8, 2.8, cwz1 - 0.04, 0.07, 3.8, 0.07, smGrnM)  // pillar glow strip R
        // Vertical gate bars
        for (let gx = 58.5; gx <= 61.5; gx += 0.55) {
          const gb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.6, 0.07), smMtlM)
          gb.position.set(gx, 1.8, cwz1); scene.add(gb)
        }
        for (const gy of [0.4, 1.8, 3.3]) {
          const gr = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.07, 0.07), smMtlM)
          gr.position.set(60, gy, cwz1); scene.add(gr)
        }
        gPL(60, fgH + 0.6, cwz1 + 1.2, 20.0, 60)  // entry floodlight

        // ── Side gates (bars only) ────────────────────────────────────────────────
        for (const [gx5, gz5] of [[cwx1, -70], [cwx2, -70]] as [number, number][]) {
          stB(gx5, cwH / 2 + 0.25, gz5 - 1.4, cwT * 1.4, cwH + 0.5, 0.5, smMtlM)
          stB(gx5, cwH / 2 + 0.25, gz5 + 1.4, cwT * 1.4, cwH + 0.5, 0.5, smMtlM)
          for (let bi = -1.35; bi <= 1.35; bi += 0.6) {
            const gb2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.0, 0.07), smMtlM)
            gb2.position.set(gx5, 1.5, gz5 + bi); scene.add(gb2)
          }
          gPL(gx5, 4.5, gz5, 4.0, 26)
        }

        // ── Corner turrets + Sanctum flags ───────────────────────────────────────
        const flagBM = new THREE.MeshBasicMaterial({ color: 0x000d03 })
        const flagGM = new THREE.MeshBasicMaterial({ color: 0x00cc44 })
        for (const [fx, fz] of [[cwx1, cwz1], [cwx2, cwz1], [cwx1, cwz2], [cwx2, cwz2]] as [number, number][]) {
          stB(fx, cwH + 0.6, fz, 1.2, cwH + 1.2, 1.2, smDkM)           // turret body
          stB(fx, cwH * 2 + 1.25, fz, 1.4, 0.14, 1.4, smDkM)            // turret cap
          stB(fx, cwH + 0.07, fz, 1.22, 0.14, 1.22, smGrnM)             // turret base glow
          stB(fx, cwH * 2 + 1.06, fz, 0.07, cwH + 0.3, 0.07, smMtlM)   // flag pole
          // Flag body (thin box facing outward)
          const fSign = (fx < cwCX ? -1 : 1)
          const flagB = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 1.6), flagBM)
          flagB.position.set(fx + fSign * 0.82, cwH * 2 + 1.8, fz); scene.add(flagB)
          // Sanctum S-glyph bars on flag
          for (const [fy2, fz2] of [[0.38, 0], [0.0, 0], [-0.38, 0]] as [number, number][]) {
            const fb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 1.1), flagGM)
            fb.position.set(fx + fSign * 0.83, cwH * 2 + 1.8 + fy2, fz + fz2); scene.add(fb)
          }
          const fvL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.1), flagGM)
          fvL.position.set(fx + fSign * 0.83, cwH * 2 + 1.99, fz - 0.5); scene.add(fvL)
          const fvR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.1), flagGM)
          fvR.position.set(fx + fSign * 0.83, cwH * 2 + 1.61, fz + 0.5); scene.add(fvR)
          gPL(fx, cwH + 2.8, fz, 3.0, 24)
        }

        // ── Main building exterior ────────────────────────────────────────────────
        const bx1 = 54, bx2 = 66, bz1 = -63, bz2 = -77
        const bH1 = 4.0, bH2 = 3.5
        const bcx = (bx1 + bx2) / 2   // 60
        const bcz = (bz1 + bz2) / 2   // -70
        const bW = bx2 - bx1          // 12
        const bD = Math.abs(bz2 - bz1) // 14
        const bWT = 0.2

        // Building ground floor
        const bGnd = new THREE.Mesh(new THREE.PlaneGeometry(bW, bD), smCncM)
        bGnd.rotation.x = -Math.PI / 2; bGnd.position.set(bcx, 0.01, bcz)
        bGnd.receiveShadow = true; scene.add(bGnd)

        // South wall — iron double doors X=59→61 (sdw=2, sdh=3.2)
        const sdw = 2.0, sdh = 3.2
        stB(bx1 + 2.5, bH1 / 2, bz1, 5, bH1, bWT, smDkM)         // left
        stB(bx2 - 2.5, bH1 / 2, bz1, 5, bH1, bWT, smDkM)         // right
        stB(60, sdh + (bH1 - sdh) / 2, bz1, sdw, bH1 - sdh, bWT, smDkM) // above doors
        // Iron door panels
        for (const [dx, ds] of [[59.5, -1], [60.5, +1]] as [number, number][]) {
          stB(dx, sdh / 2, bz1 - 0.01, sdw / 2 - 0.02, sdh, 0.09, smMtlM)
          stB(dx, sdh * 0.07, bz1 - 0.07, sdw / 2 - 0.04, 0.07, 0.04, smGrnM)
          stB(dx, sdh * 0.93, bz1 - 0.07, sdw / 2 - 0.04, 0.07, 0.04, smGrnM)
          stB(dx + ds * 0.28, sdh * 0.45, bz1 - 0.1, 0.05, 0.55, 0.05, smGrnDimM) // handle
        }
        gPL(60, 4.8, bz1 - 1.4, 12.0, 44)  // entry spotlight

        // North, East, West walls (solid)
        stB(bcx, bH1 / 2, bz2, bW, bH1, bWT, smDkM)
        stB(bx2, bH1 / 2, bcz, bWT, bH1, bD, smDkM)
        stB(bx1, bH1 / 2, bcz, bWT, bH1, bD, smDkM)

        // Barred windows — east wall (jail side)
        for (const wz of [-66.5, -69.5, -72.5]) {
          stB(bx2, bH1 * 0.6, wz, bWT * 2.4, bH1 * 0.65, 0.95, smDkM)   // frame
          stB(bx2 + 0.02, bH1 * 0.6, wz, bWT * 0.7, bH1 * 0.48, 0.62, smGlsM)  // dark glass
          for (const boz of [-0.22, 0, 0.22]) {
            stB(bx2 + 0.01, bH1 * 0.6, wz + boz, bWT * 0.5, bH1 * 0.48, 0.05, smMtlM)
          }
        }
        // West wall small windows (armory)
        for (const wz of [-67.5, -71.0]) {
          stB(bx1, bH1 * 0.62, wz, bWT * 2.4, bH1 * 0.5, 1.1, smDkM)
          stB(bx1 - 0.02, bH1 * 0.62, wz, bWT * 0.7, bH1 * 0.35, 0.8, smGlsM)
        }

        // Building corner green strips (vertical)
        for (const [ex, ez] of [[bx1, bz1], [bx2, bz1], [bx1, bz2], [bx2, bz2]] as [number, number][]) {
          stB(ex, (bH1 + bH2) / 2, ez, 0.09, bH1 + bH2, 0.09, smGrnM)
        }
        // Horizontal green transition strips (at floor change)
        stB(bcx, bH1 + 0.04, bz1, bW + 0.1, 0.08, 0.08, smGrnM)
        stB(bcx, bH1 + 0.04, bz2, bW + 0.1, 0.08, 0.08, smGrnM)
        stB(bx1, bH1 + 0.04, bcz, 0.08, 0.08, bD, smGrnM)
        stB(bx2, bH1 + 0.04, bcz, 0.08, 0.08, bD, smGrnM)

        // ── F1 Interior: lobby / jails / armory / clone room ─────────────────────
        const lobZ = -66.5  // lobby divider Z
        const clnZ = -73.0  // clone room N divider Z
        // Lobby divider (E-W), door gap X=59→61
        stB(bx1 + 2.5, bH1 / 2, lobZ, 5, bH1, bWT, smDkM)
        stB(bx2 - 2.5, bH1 / 2, lobZ, 5, bH1, bWT, smDkM)
        stB(60, sdh + (bH1 - sdh) / 2, lobZ, 2.0, bH1 - sdh, bWT, smDkM)
        gPL(bcx, 3.2, (bz1 + lobZ) / 2, 14.0, 32)  // lobby fill

        // Clone room N divider (E-W), door gap X=59→61
        stB(bx1 + 2.5, bH1 / 2, clnZ, 5, bH1, bWT, smDkM)
        stB(bx2 - 2.5, bH1 / 2, clnZ, 5, bH1, bWT, smDkM)
        stB(60, sdh + (bH1 - sdh) / 2, clnZ, 2.0, bH1 - sdh, bWT, smDkM)

        // Armory / jail N-S divider (X=60)
        stB(60, bH1 / 2, (lobZ + clnZ) / 2, bWT, bH1, Math.abs(clnZ - lobZ), smDkM)

        // Jail bars on east interior (X=bx2 inner face, Z=lobZ→clnZ)
        for (let jz = lobZ + 0.8; jz <= clnZ - 0.6; jz += 1.1) {
          stB(bx2 - 0.06, bH1 * 0.44, jz, 0.06, bH1 * 0.76, 0.06, smMtlM)
        }
        gPL(bx2 - 1.5, 3.5, (lobZ + clnZ) / 2, 12.0, 26)

        // Armory weapon racks on west interior wall
        for (let az = lobZ + 1.0; az <= clnZ - 0.9; az += 2.1) {
          stB(bx1 + 0.24, 1.6, az, 0.14, 2.8, 0.95, smMtlM)
          stB(bx1 + 0.20, 0.5, az, 0.14, 0.07, 0.95, smGrnDimM)
          stB(bx1 + 0.20, 2.7, az, 0.14, 0.07, 0.95, smGrnDimM)
        }
        gPL(bx1 + 2.0, 3.5, (lobZ + clnZ) / 2, 12.0, 26)

        // Clone room lab tables + capsules
        const capMat = new THREE.MeshLambertMaterial({ color: 0x001604, transparent: true, opacity: 0.8 })
        const tblMat = new THREE.MeshLambertMaterial({ color: 0x0a160a })
        for (const [lcx, lcz] of [[57, -74.5], [60, -74.5], [63, -74.5], [57, -75.8], [63, -75.8]] as [number, number][]) {
          stB(lcx, 0.9, lcz, 1.5, 0.1, 0.85, tblMat)
          const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 1.15, 8), capMat)
          pod.rotation.z = Math.PI / 2; pod.position.set(lcx, 1.52, lcz); scene.add(pod)
          const podPL = new THREE.PointLight(0x00ff66, 0.5, 3.5)
          podPL.position.set(lcx, 1.5, lcz); scene.add(podPL)
        }
        gPL(bcx, 3.5, (clnZ + bz2) / 2, 14.0, 30)

        // ── F1 Ceiling light panels ───────────────────────────────────────────────
        const ceilLitM = new THREE.MeshBasicMaterial({ color: 0xaaffcc })
        stB(bcx,     bH1 - 0.04, (bz1 + lobZ) / 2,   2.8, 0.04, 0.5, ceilLitM) // lobby strip
        stB(bx1 + 3, bH1 - 0.04, (lobZ + clnZ) / 2,  0.4, 0.04, 3.2, ceilLitM) // armory strip
        stB(bx2 - 3, bH1 - 0.04, (lobZ + clnZ) / 2,  0.4, 0.04, 3.2, ceilLitM) // jail strip
        stB(bcx,     bH1 - 0.04, (clnZ + bz2) / 2,   2.8, 0.04, 0.5, ceilLitM) // clone room strip

        // ── Floor 2: Bridge / Command Room ───────────────────────────────────────
        const f2Y = bH1
        const f2Flr = new THREE.Mesh(new THREE.PlaneGeometry(bW - bWT * 2, bD - bWT * 2), smCncM)
        f2Flr.rotation.x = -Math.PI / 2; f2Flr.position.set(bcx, f2Y + 0.01, bcz)
        scene.add(f2Flr)

        // F2 walls
        stB(bcx, f2Y + bH2 / 2, bz1, bW, bH2, bWT, smDk2M)  // south (glass front)
        stB(bcx, f2Y + bH2 / 2, bz2, bW, bH2, bWT, smDkM)   // north
        stB(bx1, f2Y + bH2 / 2, bcz, bWT, bH2, bD, smDkM)   // west
        stB(bx2, f2Y + bH2 / 2, bcz, bWT, bH2, bD, smDkM)   // east

        // F2 south: panoramic command windows (3 panes)
        for (const wx of [55.5, 60, 64.5]) {
          stB(wx, f2Y + bH2 * 0.5, bz1 + 0.01, 3.2, bH2 * 0.72, 0.05, smGlsM)
          stB(wx, f2Y + bH2 * 0.06, bz1, 3.3, bH2 * 0.09, bWT, smDkM)
          stB(wx, f2Y + bH2 * 0.94, bz1, 3.3, bH2 * 0.09, bWT, smDkM)
        }

        // Command consoles (F2, facing south windows)
        const scrM = new THREE.MeshBasicMaterial({ color: 0x003322 })
        const actM = new THREE.MeshBasicMaterial({ color: 0x00ff77, transparent: true, opacity: 0.6 })
        for (const [cx7, cz7] of [[56, -64.2], [60, -64.2], [64, -64.2]] as [number, number][]) {
          stB(cx7, f2Y + 0.55, cz7, 2.2, 0.8, 0.7, smConsMat)
          const scr = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 0.06), scrM)
          scr.position.set(cx7, f2Y + 1.3, cz7 - 0.16); scene.add(scr)
          const act = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.05), actM)
          act.position.set(cx7, f2Y + 1.3, cz7 - 0.17); scene.add(act)
          const spl = new THREE.PointLight(0x00ffaa, 0.4, 5)
          spl.position.set(cx7, f2Y + 1.8, cz7); scene.add(spl)
        }
        gPL(bcx, f2Y + 2.8, bcz, 14.0, 38)

        // ── Roof ─────────────────────────────────────────────────────────────────
        const roofY = f2Y + bH2
        stB(bcx, roofY + 0.1, bcz, bW + 0.4, 0.2, bD + 0.4, smDkM)         // roof slab
        stB(bcx, roofY + 0.7, bz1, bW, 1.4, bWT, smDkM)                      // parapet S
        stB(bcx, roofY + 0.7, bz2, bW, 1.4, bWT, smDkM)                      // parapet N
        stB(bx1, roofY + 0.7, bcz, bWT, 1.4, bD, smDkM)                      // parapet W
        stB(bx2, roofY + 0.7, bcz, bWT, 1.4, bD, smDkM)                      // parapet E
        stB(bcx, roofY + 1.42, bz1, bW + 0.1, 0.1, 0.1, smGrnM)             // parapet top strips
        stB(bcx, roofY + 1.42, bz2, bW + 0.1, 0.1, 0.1, smGrnM)
        stB(bx1, roofY + 1.42, bcz, 0.1, 0.1, bD, smGrnM)
        stB(bx2, roofY + 1.42, bcz, 0.1, 0.1, bD, smGrnM)
        // Comms antenna array
        stB(bcx, roofY + 2.5, bcz - 4, 0.08, 3.2, 0.08, smMtlM)
        stB(bcx + 1.6, roofY + 1.9, bcz - 4, 0.06, 1.8, 0.06, smMtlM)
        stB(bcx - 1.6, roofY + 1.9, bcz - 4, 0.06, 1.8, 0.06, smMtlM)
        stB(bcx, roofY + 3.5, bcz - 4, 3.6, 0.05, 0.05, smMtlM)
        stB(bcx, roofY + 2.9, bcz - 4, 2.4, 0.05, 0.05, smMtlM)
        const antL = new THREE.PointLight(0xff2200, 0.7, 8)
        antL.position.set(bcx, roofY + 4.1, bcz - 4); scene.add(antL)

        // Roof access ladder (east exterior wall, near south corner)
        const ladX = bx2 + 0.15, ladZ = bz1 + 3.5
        for (const zo of [-0.16, 0.16]) stB(ladX, roofY / 2, ladZ + zo, 0.05, roofY, 0.05, smMtlM)
        for (let ly = 0.6; ly < roofY - 0.1; ly += 0.65)
          stB(ladX, ly, ladZ, 0.07, 0.05, 0.3, smMtlM)

        // ── Compound perimeter lighting (low wall-mount, green sodium) ────────────
        for (let lpx = cwx1 + 6; lpx <= cwx2 - 6; lpx += 11) {
          gPL(lpx, cwH + 0.5, cwz1 - 1.0, 7.0, 40)
          gPL(lpx, cwH + 0.5, cwz2 + 1.0, 7.0, 40)
        }
        for (let lpz = cwz2 + 6; lpz <= cwz1 - 6; lpz += 11) {
          gPL(cwx1 - 1.0, cwH + 0.5, lpz, 7.0, 40)
          gPL(cwx2 + 1.0, cwH + 0.5, lpz, 7.0, 40)
        }
        // Building exterior flood lights
        for (const [flx, flz] of [[bx1, bz1], [bx2, bz1], [bx1, bz2], [bx2, bz2]] as [number, number][]) {
          gPL(flx, roofY + 0.6, flz, 12.0, 50)
        }

        // F2 ceiling panel
        const f2CeilM = new THREE.MeshBasicMaterial({ color: 0xaaffcc })
        stB(bcx, f2Y + bH2 - 0.04, bcz, 3.2, 0.04, 0.6, f2CeilM)
      }

      // ── Nexus Sky Beam (sanctum energy column) ───────────────────────────────
      // bcx=60, bcz=-70, roofY=7.5 from Sanctum building dims
      const nexusBX = 60, nexusBZ = -70, nexusBaseY = 8.2
      const nexusBeamH = 240

      const nexusCoreMat = new THREE.MeshBasicMaterial({ color: 0x00ff77 })
      const nexusCoreBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, nexusBeamH, 8), nexusCoreMat)
      nexusCoreBeam.position.set(nexusBX, nexusBaseY + nexusBeamH / 2, nexusBZ)
      scene.add(nexusCoreBeam)

      const nexusMidMat = new THREE.MeshBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.22 })
      const nexusMidBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, nexusBeamH, 10), nexusMidMat)
      nexusMidBeam.position.set(nexusBX, nexusBaseY + nexusBeamH / 2, nexusBZ)
      scene.add(nexusMidBeam)

      const nexusOuterMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.09 })
      const nexusOuterBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, nexusBeamH, 12), nexusOuterMat)
      nexusOuterBeam.position.set(nexusBX, nexusBaseY + nexusBeamH / 2, nexusBZ)
      scene.add(nexusOuterBeam)

      // Helical coils — created relative to origin so spinning the group looks correct
      const mkNexusHelix = (phase: number, radius: number, col: number, thick: number) => {
        const pts: THREE.Vector3[] = []
        const turns = 20, steps = 300
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * turns * Math.PI * 2
          pts.push(new THREE.Vector3(Math.cos(t + phase) * radius, (i / steps) * nexusBeamH, Math.sin(t + phase) * radius))
        }
        const curve = new THREE.CatmullRomCurve3(pts)
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.88 })
        return new THREE.Mesh(new THREE.TubeGeometry(curve, 400, thick, 5, false), mat)
      }
      const nexusHelixGroup = new THREE.Group()
      nexusHelixGroup.position.set(nexusBX, nexusBaseY, nexusBZ)
      nexusHelixGroup.add(mkNexusHelix(0,               0.32, 0x00ffaa, 0.045))
      nexusHelixGroup.add(mkNexusHelix(Math.PI,         0.32, 0x55ffbb, 0.045))
      nexusHelixGroup.add(mkNexusHelix(Math.PI / 2,     0.52, 0x00ee66, 0.030))
      nexusHelixGroup.add(mkNexusHelix(Math.PI * 3 / 2, 0.52, 0x00cc55, 0.030))
      scene.add(nexusHelixGroup)

      // Floating energy rings that drift upward along the beam
      const nexusRings: THREE.Mesh[] = []
      for (let ri = 0; ri < 14; ri++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.5 + ri * 0.035, 0.055, 6, 24),
          new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.75 })
        )
        ring.rotation.x = Math.PI / 2
        ring.position.set(nexusBX, nexusBaseY + (ri / 14) * nexusBeamH, nexusBZ)
        scene.add(ring)
        nexusRings.push(ring)
      }

      // Strong pulsing base floodlight
      const nexusBasePL = new THREE.PointLight(0x00ff77, 30, 90)
      nexusBasePL.position.set(nexusBX, nexusBaseY + 3, nexusBZ)
      scene.add(nexusBasePL)

      // ── Sanctum exterior street lamps ─────────────────────────────────────────
      {
        const sancPolM = new THREE.MeshLambertMaterial({ color: 0x111116 })
        const sancLnsM = new THREE.MeshBasicMaterial({ color: 0xbbffcc })
        const mkSancLamp = (lx: number, lz: number) => {
          const pH = 5.8
          stB(lx, pH / 2, lz, 0.1, pH, 0.1, sancPolM)
          stB(lx, pH - 0.12, lz, 0.36, 0.08, 0.36, sancPolM)
          const lens = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.22), sancLnsM)
          lens.position.set(lx, pH - 0.32, lz); scene.add(lens)
          const lp = new THREE.PointLight(0x99ffbb, 9.0, 70)
          lp.position.set(lx, pH - 0.55, lz); scene.add(lp)
        }
        // South approach flanking the front gate (Z=-57)
        mkSancLamp(50, -51)
        mkSancLamp(70, -51)
        // West side (outside west wall X=47)
        mkSancLamp(43, -63)
        mkSancLamp(43, -77)
        // East side (outside east wall X=73)
        mkSancLamp(77, -63)
        mkSancLamp(77, -77)
      }

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
          const pl = new THREE.PointLight(0xffeecc, 1.65, 18)
          pl.position.set(lx, 5.1, lz - 0.64); scene.add(pl)
        }

        for (let i = 0; i < 8; i++) mkPlazaLamp((i / 8) * Math.PI * 2 + Math.PI / 8)

        // ── Circular road ringing the plaza ───────────────────────────────────
        const roadAsph = new THREE.MeshLambertMaterial({ color: 0x111114 })
        const roadYell = new THREE.MeshLambertMaterial({ color: 0xffdd00 })
        const roadCurb = new THREE.MeshLambertMaterial({ color: 0x888899 })

        // Asphalt ring (inner radius 19.5, outer 24 — sits just outside plaza disc)
        const ringRoad = new THREE.Mesh(new THREE.RingGeometry(19.5, 24.0, 64), roadAsph)
        ringRoad.rotation.x = -Math.PI / 2
        ringRoad.position.set(sqCX, 0.02, sqCZ)
        ringRoad.receiveShadow = true
        scene.add(ringRoad)

        // Yellow double centerline at radius ~21.75
        const ringLineA = new THREE.Mesh(new THREE.RingGeometry(21.45, 21.68, 64), roadYell)
        ringLineA.rotation.x = -Math.PI / 2
        ringLineA.position.set(sqCX, 0.03, sqCZ)
        scene.add(ringLineA)
        const ringLineB = new THREE.Mesh(new THREE.RingGeometry(21.82, 22.05, 64), roadYell)
        ringLineB.rotation.x = -Math.PI / 2
        ringLineB.position.set(sqCX, 0.03, sqCZ)
        scene.add(ringLineB)

        // Curbs — inner and outer edges of ring road
        const curbInner = new THREE.Mesh(new THREE.RingGeometry(19.1, 19.55, 64), roadCurb)
        curbInner.rotation.x = -Math.PI / 2
        curbInner.position.set(sqCX, 0.04, sqCZ)
        scene.add(curbInner)
        const curbOuter = new THREE.Mesh(new THREE.RingGeometry(23.95, 24.4, 64), roadCurb)
        curbOuter.rotation.x = -Math.PI / 2
        curbOuter.position.set(sqCX, 0.04, sqCZ)
        scene.add(curbOuter)

        // ── NE exit road (bearing 45° — passes east of shantytown, seeds city growth) ──
        // Direction unit vector for NE bearing in XZ: (+sin45, -cos45)
        const neDirX = Math.sin(Math.PI / 4)   //  0.7071
        const neDirZ = -Math.cos(Math.PI / 4)  // -0.7071
        const neRoadLen = 54
        const neRoadW   = 5.5

        // Exit from ring road centerline (radius 21.75) heading NE
        const neExitX = sqCX + neDirX * 21.75
        const neExitZ = sqCZ + neDirZ * 21.75
        // Midpoint of straight segment
        const neMidX = neExitX + neDirX * (neRoadLen / 2)
        const neMidZ = neExitZ + neDirZ * (neRoadLen / 2)

        // Group rotated NE so its -Z axis points northeast; plane lays flat inside
        const neGrp = new THREE.Group()
        neGrp.position.set(neMidX, 0, neMidZ)
        neGrp.rotation.y = -Math.PI / 4

        const neRoadPlane = new THREE.Mesh(new THREE.PlaneGeometry(neRoadW, neRoadLen), roadAsph)
        neRoadPlane.rotation.x = -Math.PI / 2
        neRoadPlane.position.y = 0.02
        neRoadPlane.receiveShadow = true
        neGrp.add(neRoadPlane)

        // Yellow double centerline on NE road
        for (const ox of [-0.17, 0.17]) {
          const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.2, neRoadLen), roadYell)
          stripe.rotation.x = -Math.PI / 2
          stripe.position.set(ox, 0.03, 0)
          neGrp.add(stripe)
        }

        // Curbs on both sides of NE road
        for (const side of [-1, 1]) {
          const crbPl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, neRoadLen), roadCurb)
          crbPl.rotation.x = -Math.PI / 2
          crbPl.position.set((neRoadW / 2 + 0.21) * side, 0.04, 0)
          neGrp.add(crbPl)
        }

        scene.add(neGrp)
      }

      // ── East Side Urban District (NYC-dystopian, around Chancellor's plaza) ─────
      {
        const ubAsphM  = new THREE.MeshLambertMaterial({ color: 0x111116 })
        const ubCurbM  = new THREE.MeshLambertMaterial({ color: 0x3a3a44 })
        const ubLineM  = new THREE.MeshLambertMaterial({ color: 0xbbaa00 })
        const ubSwalkM = new THREE.MeshLambertMaterial({ color: 0x252530 })
        const ubPostM  = new THREE.MeshLambertMaterial({ color: 0x181818 })
        const ubGlowM  = new THREE.MeshBasicMaterial({ color: 0x88aaff })
        const ubStairM = new THREE.MeshLambertMaterial({ color: 0x28283a })
        const ubDumpM  = new THREE.MeshLambertMaterial({ color: 0x0e1e0e })
        const ubFescM  = new THREE.MeshLambertMaterial({ color: 0x3a2a18 })

        // ── Streets ─────────────────────────────────────────────────────
        const mkEWRoad = (cz: number, x1r: number, x2r: number) => {
          const w = x2r - x1r
          const r = new THREE.Mesh(new THREE.PlaneGeometry(w, 5), ubAsphM)
          r.rotation.x = -Math.PI / 2; r.position.set((x1r+x2r)/2, 0.03, cz); r.receiveShadow = true; scene.add(r)
          stB((x1r+x2r)/2, 0.04, cz, w, 0.02, 0.18, ubLineM)
          for (const sz of [cz-2.5, cz+2.5]) { const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.28), ubCurbM); c.position.set((x1r+x2r)/2, 0.05, sz); scene.add(c) }
        }
        const mkNSRoad = (cx: number, z1r: number, z2r: number) => {
          const d = z2r - z1r
          const r = new THREE.Mesh(new THREE.PlaneGeometry(5, d), ubAsphM)
          r.rotation.x = -Math.PI / 2; r.position.set(cx, 0.03, (z1r+z2r)/2); r.receiveShadow = true; scene.add(r)
          stB(cx, 0.04, (z1r+z2r)/2, 0.18, 0.02, d, ubLineM)
          for (const sx of [cx-2.5, cx+2.5]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, d), ubCurbM); c.position.set(sx, 0.05, (z1r+z2r)/2); scene.add(c) }
        }
        const mkSW = (cx: number, cz: number, w: number, d: number) => {
          const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ubSwalkM)
          s.rotation.x = -Math.PI / 2; s.position.set(cx, 0.06, cz); s.receiveShadow = true; scene.add(s)
        }

        // North Cross (44th St) Z=30; East Concourse Z=55; South Cross Z=73; Far South Z=89
        mkEWRoad(30, 59, 93); mkEWRoad(55, 59, 93); mkEWRoad(73, 12, 93); mkEWRoad(89, 10, 93)
        // 1st Ave X=62; 2nd Ave X=78; West Blvd X=13
        mkNSRoad(62, 27, 92); mkNSRoad(78, 27, 92); mkNSRoad(13, 55, 92)
        // Sidewalks
        mkSW(64.5,60,3,65); mkSW(59.5,60,3,65); mkSW(80.5,60,3,65); mkSW(75.5,60,3,65)
        mkSW(50,30,60,3); mkSW(50,55,60,3); mkSW(50,73,60,3); mkSW(50,89,60,3)

        // ── Building factory ─────────────────────────────────────────────
        const mkBuilding = (
          x1: number, x2: number, z1: number, z2: number,
          floors: number,
          doorSide: 'N'|'S'|'E'|'W',
          doorCenter: number, doorWidth: number,
          wallC: number, trimC: number, winC = 0x446688
        ) => {
          const FH = 3, H = floors * FH, WT = 0.22, DH = 2.4
          const cx = (x1+x2)/2, cz = (z1+z2)/2, W = x2-x1, D = z2-z1
          const wallM = new THREE.MeshLambertMaterial({ color: wallC })
          const trimM = new THREE.MeshLambertMaterial({ color: trimC })
          const winM  = new THREE.MeshLambertMaterial({ color: winC, transparent: true, opacity: 0.38 })
          const flrM  = new THREE.MeshLambertMaterial({ color: 0x181820 })
          const intM  = new THREE.MeshLambertMaterial({ color: 0x1e1e28 })
          // Floors
          stB(cx, 0.02, cz, W-WT*2, 0.04, D-WT*2, flrM)
          for (let f = 1; f < floors; f++) stB(cx, f*FH-0.04, cz, W-WT*2, 0.08, D-WT*2, intM)
          // Wall builder
          const mkWall = (axis: 'X'|'Z', fixC: number, from: number, to: number,
                          hasDoor: boolean, dCtr: number, dW: number) => {
            for (let f = 0; f < floors; f++) {
              const fy = f * FH, isG = f === 0, len = to - from
              if (hasDoor && isG) {
                const dL = dCtr - dW/2 - from, dR = to - (dCtr + dW/2)
                if (axis === 'X') {
                  if (dL > 0.05) stB(from+dL/2, fy+DH/2, fixC, dL, DH, WT, wallM)
                  if (dR > 0.05) stB(to-dR/2, fy+DH/2, fixC, dR, DH, WT, wallM)
                  if (FH > DH) stB(from+len/2, fy+DH+(FH-DH)/2, fixC, len, FH-DH, WT, wallM)
                } else {
                  if (dL > 0.05) stB(fixC, fy+DH/2, from+dL/2, WT, DH, dL, wallM)
                  if (dR > 0.05) stB(fixC, fy+DH/2, to-dR/2, WT, DH, dR, wallM)
                  if (FH > DH) stB(fixC, fy+DH+(FH-DH)/2, from+len/2, WT, FH-DH, len, wallM)
                }
              } else {
                if (axis === 'X') {
                  stB(from+len/2, fy+FH/2, fixC, len, FH, WT, wallM)
                  const nw = Math.max(1, Math.round(len/2.5))
                  for (let wi = 0; wi < nw; wi++) {
                    const wp = from+(wi+0.5)*len/nw, woff = fixC > cz ? -0.01 : 0.01
                    stB(wp, fy+1.65, fixC+woff, len/nw*0.52, 1.2, WT*0.35, winM)
                  }
                } else {
                  stB(fixC, fy+FH/2, from+len/2, WT, FH, len, wallM)
                  const nw = Math.max(1, Math.round(len/2.5))
                  for (let wi = 0; wi < nw; wi++) {
                    const wp = from+(wi+0.5)*len/nw, woff = fixC > cx ? -0.01 : 0.01
                    stB(fixC+woff, fy+1.65, wp, WT*0.35, 1.2, len/nw*0.52, winM)
                  }
                }
              }
            }
          }
          // 4 walls: ZMin='N' door wall, ZMax='S' door wall, XMin='W', XMax='E'
          mkWall('X', z1, x1, x2, doorSide==='N', doorSide==='N'?doorCenter:cx, doorSide==='N'?doorWidth:0)
          mkWall('X', z2, x1, x2, doorSide==='S', doorSide==='S'?doorCenter:cx, doorSide==='S'?doorWidth:0)
          mkWall('Z', x1, z1, z2, doorSide==='W', doorSide==='W'?doorCenter:cz, doorSide==='W'?doorWidth:0)
          mkWall('Z', x2, z1, z2, doorSide==='E', doorSide==='E'?doorCenter:cz, doorSide==='E'?doorWidth:0)
          // Roof slab + parapet
          stB(cx, H+0.1, cz, W+0.3, 0.2, D+0.3, trimM)
          stB(cx, H+0.45, z1-WT, W+0.3, 0.7, WT*2.5, trimM)
          stB(cx, H+0.45, z2+WT, W+0.3, 0.7, WT*2.5, trimM)
          stB(x1-WT, H+0.45, cz, WT*2.5, 0.7, D, trimM)
          stB(x2+WT, H+0.45, cz, WT*2.5, 0.7, D, trimM)
          // Rooftop details
          stB(cx+W*0.28, H+0.85, cz+D*0.28, 1.1, 1.6, 1.1, wallM) // water tank
          stB(cx-W*0.25, H+0.55, cz-D*0.25, 1.4, 0.85, 0.85, trimM) // AC unit
          // Visual interior staircase (NW corner, runs south)
          const sLen = D * 0.62, sSteps = Math.max(4, Math.floor(sLen / 0.82))
          for (let si = 0; si < sSteps; si++) {
            const sy = (si/sSteps) * H, sz = z1+0.4+si*(sLen/sSteps)
            stB(x1+1.1, sy+H/(sSteps*2), sz, 1.8, H/sSteps, sLen/sSteps, ubStairM)
          }
        }

        // ── Place all buildings ─────────────────────────────────────────
        // NE block (between North Cross Z=30 and Concourse Z=55)
        mkBuilding(65,76, 32,43, 4,'N',70.5,2.0, 0x2e2e3c,0x1c1c28)          // Apt NE1A
        mkBuilding(65,76, 45,53, 3,'S',70.5,1.8, 0x38200e,0x241408)           // Apt NE1B
        mkBuilding(80,90, 32,41, 2,'N',85,  2.5, 0x1c1c28,0x303050, 0x66aaee) // Store NE2A
        mkBuilding(80,90, 43,53, 5,'N',85,  1.8, 0x2a1a08,0x3a2a10)           // Apt NE2B

        // E block (Concourse Z=55 to South Cross Z=73)
        mkBuilding(65,76, 57,68, 2,'N',70.5,2.5, 0x122012,0x1c3018, 0x55dd88) // Grocery E1
        mkBuilding(65,76, 70,72, 3,'S',70.5,1.6, 0x281428,0x3a1e3a)           // Narrow E2
        mkBuilding(80,90, 57,71, 4,'W',64,  2.0, 0x181828,0x222238)           // Tower E3

        // SE block (South Cross Z=73 to Far South Z=89)
        mkBuilding(65,76, 75,86, 3,'N',70.5,2.0, 0x2a1c08,0x3c2c10)          // Apt SE1
        mkBuilding(80,90, 75,87, 4,'N',85,  1.8, 0x141420,0x1e1e2e)           // Apt SE2

        // South row (just south of ring road, Z=77+)
        mkBuilding(36,50, 77,87, 3,'N',43,  2.0, 0x2a0a16,0x3c1020)           // S1
        mkBuilding(52,62, 77,87, 4,'N',57,  2.0, 0x0a1826,0x121e30)           // S2 ← stairs

        // SW block
        mkBuilding(16,27, 77,87, 3,'N',21.5,1.8, 0x2a1a08,0x3c2c10)           // SW1
        mkBuilding(29,35, 77,87, 2,'N',32,  1.4, 0x142018,0x1e2e22)           // SW2

        // West (west of plaza ring road, south section)
        mkBuilding(3,11,  65,75, 3,'E',70,  1.6, 0x1a0826,0x281238)           // W1

        // ── Street lamps (futuristic angled arm) ──────────────────────
        const mkUrbLamp = (x: number, z: number) => {
          stB(x, 3.5, z, 0.1, 7.0, 0.1, ubPostM)
          stB(x+0.75, 7.1, z, 1.5, 0.07, 0.07, ubPostM)
          stB(x+1.5, 6.9, z, 0.07, 0.34, 0.24, ubGlowM)
          const lp = new THREE.PointLight(0xaabbff, 18, 80)
          lp.position.set(x+1.5, 6.6, z); scene.add(lp)
        }
        for (const z of [32,43,55,64,73,82,89]) { mkUrbLamp(64.5,z); mkUrbLamp(59.5,z) }
        for (const z of [34,47,57,66,76,85])     { mkUrbLamp(80.5,z); mkUrbLamp(75.5,z) }
        for (const x of [30,42,56,68,83])         { mkUrbLamp(x,75); mkUrbLamp(x,71) }
        for (const x of [68,84])                   { mkUrbLamp(x,32); mkUrbLamp(x,28) }
        for (const z of [62,72,82])                 mkUrbLamp(15,z)
        for (const x of [68,84])                   { mkUrbLamp(x,57); mkUrbLamp(x,53) }

        // ── Neon signs ────────────────────────────────────────────────
        const mkNeon = (x: number, y: number, z: number, w: number, col: number) => {
          const ns = new THREE.Mesh(new THREE.BoxGeometry(w,0.22,0.12), new THREE.MeshBasicMaterial({ color: col }))
          ns.position.set(x,y,z); scene.add(ns)
          const nl = new THREE.PointLight(col, 3.5, 28); nl.position.set(x,y,z); scene.add(nl)
        }
        mkNeon(70.5,13.2,32.1, 4.5,0xff2244)   // NE1A red
        mkNeon(70.5,9.5, 53.1, 3.8,0xffaa00)   // NE1B amber
        mkNeon(85,  6.9, 32.1, 5.0,0x33aaff)   // NE2A storefront blue
        mkNeon(85, 16.2, 43.1, 4.0,0xff6600)   // NE2B orange
        mkNeon(70.5,6.9, 57.1, 5.5,0x22ee66)   // Grocery green
        mkNeon(70.5,9.5, 72.1, 3.5,0xcc22ff)   // E2 purple
        mkNeon(80.1,13.2, 64,  4.0,0x00ccff)   // Tower cyan (west face)
        mkNeon(70.5,9.5, 75.1, 4.0,0xff8822)   // SE1 orange
        mkNeon(85, 13.2, 75.1, 4.0,0xffdd00)   // SE2 yellow
        mkNeon(43,  9.5, 77.1, 4.5,0xff3366)   // S1 pink
        mkNeon(57, 13.2, 77.1, 4.0,0x44ddff)   // S2 teal
        mkNeon(21.5,9.5, 77.1, 4.0,0xffcc22)   // SW1 gold
        mkNeon(32,  6.9, 77.1, 3.0,0x66ff44)   // SW2 lime
        mkNeon(11.1,9.5, 70,   3.5,0xdd44ff)   // W1 violet (east face)

        // ── Alley props ───────────────────────────────────────────────
        const mkDump = (x: number, z: number) => {
          stB(x,0.65,z, 1.8,1.3,0.9, ubDumpM)
          stB(x,1.32,z, 1.82,0.08,0.92, new THREE.MeshLambertMaterial({ color: 0x0a1a0a }))
        }
        mkDump(72,44.2); mkDump(74.5,44.5); mkDump(85,42.2); mkDump(88,42.5)
        mkDump(72,69.2); mkDump(74.5,69.5); mkDump(50.5,76); mkDump(63,76.5)
        mkDump(28,76);   mkDump(36,76.5);   mkDump(11,64);   mkDump(11.5,68)

        // Fire escapes on east faces
        const mkFesc = (x: number, yB: number, z: number, h: number) => {
          stB(x,yB+h/2,z-0.4, 0.06,h,0.06, ubFescM); stB(x,yB+h/2,z+0.4, 0.06,h,0.06, ubFescM)
          for (let ry = yB+0.25; ry < yB+h; ry += 0.55) stB(x,ry,z, 0.88,0.06,0.07, ubFescM)
        }
        mkFesc(76.15,3,37,9);  mkFesc(76.15,3,62,9)
        mkFesc(90.15,3,47,12); mkFesc(76.15,3,80,9)
        mkFesc(62.15,3,82,9)

        // Street-level detail: benches along concourse
        const benchM = new THREE.MeshLambertMaterial({ color: 0x3a2a18 })
        for (const [bx,bz] of [[68,56.5],[73,56.5],[68,53.5],[73,53.5]] as [number,number][]) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.08,0.4), benchM); s.position.set(bx,0.42,bz); scene.add(s)
          const b = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.06,0.35), benchM); b.rotation.x=0.25; b.position.set(bx,0.75,bz+0.16); scene.add(b)
        }

        // Newspaper boxes / phone booths along 1st Ave
        const kioskM = new THREE.MeshLambertMaterial({ color: 0x1a3a1a })
        const kioskGM= new THREE.MeshBasicMaterial({ color: 0x88ccaa, transparent:true, opacity:0.5 })
        for (const kz of [36,50,60,70,83]) {
          stB(64.7,0.9,kz, 0.55,1.8,0.55, kioskM)
          stB(64.7,1.3,kz+0.22, 0.4,1.0,0.08, kioskGM)
        }
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

      // ── Emergency Room Hospital (west of plaza, player spawn) ──────────────
      const HOSP_X1 = 8, HOSP_X2 = -12, HOSP_Z1 = 46, HOSP_Z2 = 58
      {
        const hospH  = 5.5
        const HWT    = 0.25
        const doorZ  = 52.0
        const doorW  = 3.2
        const hcxM   = (HOSP_X1 + HOSP_X2) / 2   // -2
        const hczM   = (HOSP_Z1 + HOSP_Z2) / 2   // 52

        const hospWallM  = new THREE.MeshLambertMaterial({ color: 0xf2f0ec })
        const hospFloorM = new THREE.MeshLambertMaterial({ color: 0xdce9e5 })
        const hospRoofM  = new THREE.MeshLambertMaterial({ color: 0xbbbbbb })
        const hospGlassM = new THREE.MeshLambertMaterial({ color: 0x99ccee, transparent: true, opacity: 0.38 })
        const hospTrimM  = new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
        const hospDeskM  = new THREE.MeshLambertMaterial({ color: 0x888899 })
        const hospBedM   = new THREE.MeshLambertMaterial({ color: 0xfafafa })
        const hospChairM = new THREE.MeshLambertMaterial({ color: 0x2a6a4a })

        // Floor tile
        const hospFloorMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(HOSP_X1 - HOSP_X2 - HWT * 2, HOSP_Z2 - HOSP_Z1 - HWT * 2),
          hospFloorM
        )
        hospFloorMesh.rotation.x = -Math.PI / 2
        hospFloorMesh.position.set(hcxM, 0.02, hczM)
        hospFloorMesh.receiveShadow = true
        scene.add(hospFloorMesh)

        // Roof slab
        stB(hcxM, hospH + 0.11, hczM, HOSP_X1 - HOSP_X2 + 0.6, 0.22, HOSP_Z2 - HOSP_Z1 + 0.6, hospRoofM)

        // North wall
        stB(hcxM, hospH / 2, HOSP_Z1 - HWT / 2, HOSP_X1 - HOSP_X2 + HWT * 2, hospH, HWT, hospWallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(HOSP_X2 - HWT, 0, HOSP_Z1 - HWT),
          new THREE.Vector3(HOSP_X1 + HWT, hospH + 0.2, HOSP_Z1)
        ))

        // South wall
        stB(hcxM, hospH / 2, HOSP_Z2 + HWT / 2, HOSP_X1 - HOSP_X2 + HWT * 2, hospH, HWT, hospWallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(HOSP_X2 - HWT, 0, HOSP_Z2),
          new THREE.Vector3(HOSP_X1 + HWT, hospH + 0.2, HOSP_Z2 + HWT)
        ))

        // West back wall
        stB(HOSP_X2 - HWT / 2, hospH / 2, hczM, HWT, hospH, HOSP_Z2 - HOSP_Z1 + HWT * 2, hospWallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(HOSP_X2 - HWT, 0, HOSP_Z1 - HWT),
          new THREE.Vector3(HOSP_X2, hospH + 0.2, HOSP_Z2 + HWT)
        ))

        // East front wall — north of entrance opening
        const fNorthLen = doorZ - doorW / 2 - HOSP_Z1
        stB(HOSP_X1 + HWT / 2, hospH / 2, HOSP_Z1 + fNorthLen / 2, HWT, hospH, fNorthLen, hospWallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(HOSP_X1, 0, HOSP_Z1),
          new THREE.Vector3(HOSP_X1 + HWT, hospH + 0.2, doorZ - doorW / 2)
        ))

        // East front wall — south of entrance opening
        const fSouthLen = HOSP_Z2 - (doorZ + doorW / 2)
        stB(HOSP_X1 + HWT / 2, hospH / 2, HOSP_Z2 - fSouthLen / 2, HWT, hospH, fSouthLen, hospWallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(HOSP_X1, 0, doorZ + doorW / 2),
          new THREE.Vector3(HOSP_X1 + HWT, hospH + 0.2, HOSP_Z2)
        ))

        // Panel above entrance opening
        stB(HOSP_X1 + HWT / 2, hospH * 0.88, doorZ, HWT, hospH * 0.24, doorW, hospWallM)

        // Glass sliding door panels (no collision — players walk through freely)
        stB(HOSP_X1 + 0.04, hospH * 0.44, doorZ - doorW / 4, 0.08, hospH * 0.72, doorW / 2 - 0.1, hospGlassM)
        stB(HOSP_X1 + 0.04, hospH * 0.44, doorZ + doorW / 4, 0.08, hospH * 0.72, doorW / 2 - 0.1, hospGlassM)

        // Entrance threshold / landing step
        stB(HOSP_X1 + 0.65, 0.07, doorZ, 1.3, 0.14, doorW + 1.2, hospTrimM)

        // Corner trim pillars on east face
        stB(HOSP_X1 + HWT / 2, hospH / 2, HOSP_Z1, HWT * 2.5, hospH + 0.1, HWT * 2.5, hospTrimM)
        stB(HOSP_X1 + HWT / 2, hospH / 2, HOSP_Z2, HWT * 2.5, hospH + 0.1, HWT * 2.5, hospTrimM)

        // ── Interior divider wall separating lobby (east) from surgery (west) ──
        const divX    = 0
        const divDZ   = hczM      // door in divider centered at Z=52
        const divDW   = 1.8
        const dNLen   = divDZ - divDW / 2 - HOSP_Z1
        const dSLen   = HOSP_Z2 - (divDZ + divDW / 2)

        stB(divX, hospH / 2, HOSP_Z1 + dNLen / 2, HWT, hospH, dNLen, hospWallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(divX - HWT / 2, 0, HOSP_Z1),
          new THREE.Vector3(divX + HWT / 2, hospH, divDZ - divDW / 2)
        ))
        stB(divX, hospH / 2, HOSP_Z2 - dSLen / 2, HWT, hospH, dSLen, hospWallM)
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(divX - HWT / 2, 0, divDZ + divDW / 2),
          new THREE.Vector3(divX + HWT / 2, hospH, HOSP_Z2)
        ))
        // Panel above divider door
        stB(divX, hospH * 0.88, divDZ, HWT, hospH * 0.24, divDW, hospWallM)

        // Surgery door (E to open, swings west into surgery room)
        const surgDMat = new THREE.MeshLambertMaterial({ color: 0xc8c8cc })
        const surgDPiv = new THREE.Group()
        surgDPiv.position.set(divX - HWT / 2, 0, divDZ - divDW / 2)
        const surgDP = new THREE.Mesh(new THREE.BoxGeometry(HWT * 0.9, hospH * 0.71, divDW), surgDMat)
        surgDP.position.set(0, hospH * 0.355, divDW / 2)
        surgDPiv.add(surgDP)
        scene.add(surgDPiv)
        const surgDBox = new THREE.Box3(
          new THREE.Vector3(divX - HWT, 0, divDZ - divDW / 2),
          new THREE.Vector3(divX, hospH * 0.71, divDZ + divDW / 2)
        )
        wallBoxes.push(surgDBox)
        shackDoors.push({ pivot: surgDPiv, doorBox: surgDBox, worldCenter: new THREE.Vector3(divX, 1, divDZ), open: false })

        // ── Lobby furnishings ────────────────────────────────────────────────
        // Reception desk (east-facing, centered in lobby)
        stB(2.0, 0.5, hczM, 3.8, 1.0, 1.4, hospDeskM)
        stB(2.0, 1.02, hczM, 3.9, 0.09, 1.5, hospTrimM)
        // Monitor on desk
        stB(1.2, 1.56, hczM, 0.07, 0.54, 0.46, new THREE.MeshLambertMaterial({ color: 0x1a1a22 }))
        stB(1.2, 1.44, hczM, 0.08, 0.09, 0.27, new THREE.MeshLambertMaterial({ color: 0x1a1a22 }))
        stB(1.19, 1.56, hczM, 0.07, 0.38, 0.33, new THREE.MeshBasicMaterial({ color: 0x1a44aa }))

        // Waiting chairs — north cluster
        for (const [chx, chz] of [[5.5, 48], [5.5, 49], [3.5, 48], [3.5, 49]] as [number, number][]) {
          stB(chx, 0.29, chz, 0.72, 0.3, 0.72, hospChairM)
          stB(chx, 0.72, chz + 0.34, 0.72, 0.58, 0.09, hospChairM)
        }
        // Waiting chairs — south cluster
        for (const [chx, chz] of [[5.5, 56], [5.5, 55], [3.5, 56], [3.5, 55]] as [number, number][]) {
          stB(chx, 0.29, chz, 0.72, 0.3, 0.72, hospChairM)
          stB(chx, 0.72, chz - 0.34, 0.72, 0.58, 0.09, hospChairM)
        }

        // Lobby ceiling fluorescent strips
        stB(4, hospH - 0.12, hczM - 2, 0.2, 0.07, 2.4, new THREE.MeshBasicMaterial({ color: 0xfffffa }))
        stB(4, hospH - 0.12, hczM + 2, 0.2, 0.07, 2.4, new THREE.MeshBasicMaterial({ color: 0xfffffa }))
        const hospLobbyPL = new THREE.PointLight(0xfff9f2, 1.0, 18)
        hospLobbyPL.position.set(4, hospH - 0.8, hczM); scene.add(hospLobbyPL)

        // ── Surgery room furnishings ─────────────────────────────────────────
        const surgCX = -6
        // Operating table pedestal + surface + padding
        stB(surgCX, 0.44, hczM, 0.55, 0.88, 0.62, new THREE.MeshLambertMaterial({ color: 0x555566 }))
        stB(surgCX, 0.92, hczM, 2.1, 0.14, 0.86, hospBedM)
        stB(surgCX, 1.07, hczM, 2.1, 0.06, 0.86, new THREE.MeshLambertMaterial({ color: 0xeeddcc }))
        // IV drip stand
        stB(surgCX - 1.0, 1.5, hczM - 0.46, 0.06, 3.0, 0.06, hospTrimM)
        stB(surgCX - 1.0, 3.08, hczM - 0.46, 0.44, 0.06, 0.44, hospTrimM)
        stB(surgCX - 1.0, 2.82, hczM - 0.46, 0.18, 0.38, 0.10,
          new THREE.MeshLambertMaterial({ color: 0xcce8dd, transparent: true, opacity: 0.75 }))
        // Overhead surgical light rig
        stB(surgCX, hospH - 0.24, hczM, 0.13, 0.13, 0.13, hospTrimM)
        stB(surgCX, hospH - 0.72, hczM, 0.09, 0.96, 0.09, hospTrimM)
        stB(surgCX, hospH - 1.22, hczM, 0.62, 0.16, 0.62, new THREE.MeshBasicMaterial({ color: 0xffffff }))
        const surgPL = new THREE.PointLight(0xffffff, 1.5, 10)
        surgPL.position.set(surgCX, hospH - 1.4, hczM); scene.add(surgPL)
        // Surgery ceiling strip
        stB(surgCX, hospH - 0.12, hczM, 0.2, 0.07, 2.6, new THREE.MeshBasicMaterial({ color: 0xfffffe }))
        const surgRoomPL = new THREE.PointLight(0xf4f8ff, 0.8, 14)
        surgRoomPL.position.set(surgCX, hospH - 0.8, hczM); scene.add(surgRoomPL)

        // ── Exterior signage — red cross above entrance ───────────────────────
        stB(HOSP_X1 + 0.07, hospH - 0.28, hczM, 0.14, 1.0, 3.8,
          new THREE.MeshLambertMaterial({ color: 0xffffff }))
        stB(HOSP_X1 + 0.08, hospH - 0.28, hczM, 0.15, 0.76, 2.8,
          new THREE.MeshBasicMaterial({ color: 0xcc1111 }))
        stB(HOSP_X1 + 0.09, hospH - 0.28, hczM, 0.16, 0.68, 0.30,
          new THREE.MeshBasicMaterial({ color: 0xffffff }))
        stB(HOSP_X1 + 0.09, hospH - 0.28, hczM, 0.16, 0.30, 0.68,
          new THREE.MeshBasicMaterial({ color: 0xffffff }))

        // Sconce lights flanking entrance
        for (const sz of [doorZ - doorW / 2 - 0.7, doorZ + doorW / 2 + 0.7]) {
          const ironM = new THREE.MeshLambertMaterial({ color: 0x333333 })
          stB(HOSP_X1 + 0.22, hospH - 0.9, sz, 0.3, 0.06, 0.06, ironM)
          stB(HOSP_X1 + 0.40, hospH - 1.06, sz, 0.2, 0.28, 0.2, ironM)
          const glM = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.22, 0.1),
            new THREE.MeshBasicMaterial({ color: 0xfff0cc, transparent: true, opacity: 0.95 })
          )
          glM.position.set(HOSP_X1 + 0.40, hospH - 1.06, sz); scene.add(glM)
          const hspl = new THREE.PointLight(0xffcc88, 1.0, 9)
          hspl.position.set(HOSP_X1 + 0.40, hospH - 1.26, sz); scene.add(hspl)
        }
      }

      // ── Perimeter Wall — Industrial Containment Ring ─────────────────────────
      // Bounds: W=-62, E=97, N=-100, S=97  — dystopian industrial-alien enclosure
      // Streets end at closed checkpoint gates; corner towers with alien sensor eyes
      {
        const WN = -100, WS = 97, WW = -62, WE = 97
        const WH = 7.5, WTk = 0.9, PWW = 2.2

        const wConc = new THREE.MeshLambertMaterial({ color: 0x0e0d0b })
        const wMtl  = new THREE.MeshLambertMaterial({ color: 0x141210 })
        const wRst  = new THREE.MeshLambertMaterial({ color: 0x1e0b03 })
        const wPlr  = new THREE.MeshLambertMaterial({ color: 0x090807 })
        const wWrn  = new THREE.MeshBasicMaterial({ color: 0xff4400 })
        const wBar  = new THREE.MeshLambertMaterial({ color: 0x0f0e0c })
        const wGlow = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.40 })

        // Buttress pillar on an E-W wall (wall runs along X, fixed Z)
        const mkPillarEW = (px: number, wz: number) => {
          const pH = WH + 1.8
          stB(px, pH/2,     wz,           PWW,        pH,       PWW*1.8, wPlr)
          stB(px, WH*0.45,  wz - PWW*0.8, PWW*0.85,   WH*0.78,  0.48,    wConc)
          stB(px, WH*0.45,  wz + PWW*0.8, PWW*0.85,   WH*0.78,  0.48,    wConc)
          stB(px, WH*0.28,  wz,           0.18,        WH*0.44,  PWW*1.8+0.1, wRst)
          stB(px, pH - 0.28,wz,           0.32,        0.28,     0.32,    wWrn)
          const l = new THREE.PointLight(0xff3300, 1.4, 22)
          l.position.set(px, pH + 0.1, wz); scene.add(l)
        }

        // Buttress pillar on an N-S wall (wall runs along Z, fixed X)
        const mkPillarNS = (wx: number, pz: number) => {
          const pH = WH + 1.8
          stB(wx,           pH/2,     pz,           PWW*1.8, pH,      PWW,       wPlr)
          stB(wx - PWW*0.8, WH*0.45,  pz,           0.48,    WH*0.78, PWW*0.85,  wConc)
          stB(wx + PWW*0.8, WH*0.45,  pz,           0.48,    WH*0.78, PWW*0.85,  wConc)
          stB(wx,           WH*0.28,  pz,           PWW*1.8+0.1, WH*0.44, 0.18,  wRst)
          stB(wx,           pH - 0.28,pz,           0.32,    0.28,    0.32,      wWrn)
          const l = new THREE.PointLight(0xff3300, 1.4, 22)
          l.position.set(wx, pH + 0.1, pz); scene.add(l)
        }

        // Checkpoint gate — gate opening runs along X axis (on N or S wall)
        const mkGateEW = (gx: number, wz: number, gW = 5.5) => {
          const ppH = WH + 3.4, nBars = Math.round(gW / 0.44)
          const outer = wz < 0 ? wz - 0.55 : wz + 0.55   // outward-facing side
          const inner = wz < 0 ? wz + 0.55 : wz - 0.55
          // Tall gate pillars + arch
          stB(gx - gW/2 - PWW/2, ppH/2,      wz, PWW,          ppH,  PWW*2.2,      wPlr)
          stB(gx + gW/2 + PWW/2, ppH/2,      wz, PWW,          ppH,  PWW*2.2,      wPlr)
          stB(gx,                 ppH - 0.22, wz, gW + PWW*2.4, 0.44, PWW*1.8,      wBar)
          // Warning lamps on gate pillars (outward-facing)
          stB(gx - gW/2 - PWW/2, ppH - 0.6, outer, 0.3, 0.28, 0.3, wWrn)
          stB(gx + gW/2 + PWW/2, ppH - 0.6, outer, 0.3, 0.28, 0.3, wWrn)
          const gl1 = new THREE.PointLight(0xff2200, 3.0, 22)
          gl1.position.set(gx - gW/2 - PWW/2, ppH - 0.2, outer); scene.add(gl1)
          const gl2 = new THREE.PointLight(0xff2200, 3.0, 22)
          gl2.position.set(gx + gW/2 + PWW/2, ppH - 0.2, outer); scene.add(gl2)
          // Alien glow strip on inner arch face
          stB(gx, ppH - 0.14, inner, gW*0.7, 0.08, 0.08, wGlow)
          const agl = new THREE.PointLight(0x00ff44, 2.5, 20)
          agl.position.set(gx, ppH + 0.5, wz); scene.add(agl)
          // Gate bars (closed — no passage)
          const bsp = gW / (nBars + 1)
          for (let i = 1; i <= nBars; i++)
            stB(gx - gW/2 + i*bsp, WH*0.44, wz, 0.09, WH*0.88, 0.09, wBar)
          for (const yf of [0.14, 0.44, 0.74])
            stB(gx, yf*WH, wz, gW, 0.10, 0.12, wBar)
          wallBoxes.push(new THREE.Box3(
            new THREE.Vector3(gx - gW/2, 0, wz - WTk/2 - 0.1),
            new THREE.Vector3(gx + gW/2, WH, wz + WTk/2 + 0.1)
          ))
        }

        // Checkpoint gate — gate opening runs along Z axis (on E or W wall)
        const mkGateNS = (wx: number, gz: number, gW = 5.5) => {
          const ppH = WH + 3.4, nBars = Math.round(gW / 0.44)
          const outer = wx < 0 ? wx - 0.55 : wx + 0.55
          const inner = wx < 0 ? wx + 0.55 : wx - 0.55
          stB(wx, ppH/2, gz - gW/2 - PWW/2, PWW*2.2, ppH,  PWW,         wPlr)
          stB(wx, ppH/2, gz + gW/2 + PWW/2, PWW*2.2, ppH,  PWW,         wPlr)
          stB(wx, ppH - 0.22, gz,            PWW*1.8, 0.44, gW + PWW*2.4, wBar)
          stB(outer, ppH - 0.6, gz - gW/2 - PWW/2, 0.3, 0.28, 0.3, wWrn)
          stB(outer, ppH - 0.6, gz + gW/2 + PWW/2, 0.3, 0.28, 0.3, wWrn)
          const gl1 = new THREE.PointLight(0xff2200, 3.0, 22)
          gl1.position.set(outer, ppH - 0.2, gz - gW/2 - PWW/2); scene.add(gl1)
          const gl2 = new THREE.PointLight(0xff2200, 3.0, 22)
          gl2.position.set(outer, ppH - 0.2, gz + gW/2 + PWW/2); scene.add(gl2)
          stB(inner, ppH - 0.14, gz, 0.08, 0.08, gW*0.7, wGlow)
          const agl = new THREE.PointLight(0x00ff44, 2.5, 20)
          agl.position.set(wx, ppH + 0.5, gz); scene.add(agl)
          const bsp = gW / (nBars + 1)
          for (let i = 1; i <= nBars; i++)
            stB(wx, WH*0.44, gz - gW/2 + i*bsp, 0.09, WH*0.88, 0.09, wBar)
          for (const yf of [0.14, 0.44, 0.74])
            stB(wx, yf*WH, gz, 0.12, 0.10, gW, wBar)
          wallBoxes.push(new THREE.Box3(
            new THREE.Vector3(wx - WTk/2 - 0.1, 0, gz - gW/2),
            new THREE.Vector3(wx + WTk/2 + 0.1, WH, gz + gW/2)
          ))
        }

        // Corner towers with alien sensor eyes and crenellated battlements
        const mkCorner = (tx: number, tz: number) => {
          const tH = WH + 5.2, tS = 4.2
          stB(tx, tH/2, tz, tS, tH, tS, wPlr)
          for (const [ox, oz] of [
            [-1.1,0],[1.1,0],[0,-1.1],[0,1.1],
            [-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2]
          ] as [number,number][]) {
            stB(tx+ox, tH+0.42, tz+oz, 0.88, 0.84, 0.88, wPlr)
          }
          // Alien sensor eye — faces outward from city on both exposed faces
          stB(tx < 0 ? tx-0.18 : tx+0.18, tH-1.6, tz,           0.14, 0.52, 0.52, wGlow)
          stB(tx,                           tH-1.6, tz < 0 ? tz-0.18 : tz+0.18, 0.52, 0.52, 0.14, wGlow)
          const l1 = new THREE.PointLight(0x00ff44, 4.0, 38)
          l1.position.set(tx, tH + 1.2, tz); scene.add(l1)
          const l2 = new THREE.PointLight(0xff3300, 3.0, 30)
          l2.position.set(tx, tH - 1.0, tz); scene.add(l2)
        }

        // Half-footprint of a gate + its pillars (gap to exclude from wall spans)
        const gHalf = 5.5/2 + PWW + 0.3

        // Build E-W wall segments (wall runs along X) with auto pillars between gates
        const mkEWSpan = (wz: number, gates: number[]) => {
          const skips = [...gates].sort((a, b) => a - b).map(g => [g - gHalf, g + gHalf] as [number,number])
          let cur = WW
          for (const [gs, ge] of skips) {
            if (gs > cur + 0.5) {
              const len = gs - cur, cx = (cur + gs) / 2
              stB(cx, WH/2,       wz, len, WH,   WTk,     wConc)
              stB(cx, WH - 0.36,  wz, len, 0.72, WTk*1.2, wMtl)
              stB(cx, WH + 0.18,  wz, len, 0.12, 0.12,    wRst)
              for (let pp = cur + 14; pp < gs - 7; pp += 14) mkPillarEW(pp, wz)
              wallBoxes.push(new THREE.Box3(
                new THREE.Vector3(cur, 0, wz - WTk/2), new THREE.Vector3(gs, WH, wz + WTk/2)
              ))
            }
            cur = ge
          }
          if (WE > cur + 0.5) {
            const len = WE - cur, cx = (cur + WE) / 2
            stB(cx, WH/2,       wz, len, WH,   WTk,     wConc)
            stB(cx, WH - 0.36,  wz, len, 0.72, WTk*1.2, wMtl)
            stB(cx, WH + 0.18,  wz, len, 0.12, 0.12,    wRst)
            for (let pp = cur + 14; pp < WE - 7; pp += 14) mkPillarEW(pp, wz)
            wallBoxes.push(new THREE.Box3(
              new THREE.Vector3(cur, 0, wz - WTk/2), new THREE.Vector3(WE, WH, wz + WTk/2)
            ))
          }
        }

        // Build N-S wall segments (wall runs along Z) with auto pillars between gates
        const mkNSSpan = (wx: number, gates: number[]) => {
          const skips = [...gates].sort((a, b) => a - b).map(g => [g - gHalf, g + gHalf] as [number,number])
          let cur = WN
          for (const [gs, ge] of skips) {
            if (gs > cur + 0.5) {
              const len = gs - cur, cz = (cur + gs) / 2
              stB(wx, WH/2,       cz, WTk,     WH,   len, wConc)
              stB(wx, WH - 0.36,  cz, WTk*1.2, 0.72, len, wMtl)
              stB(wx, WH + 0.18,  cz, 0.12,    0.12, len, wRst)
              for (let pp = cur + 14; pp < gs - 7; pp += 14) mkPillarNS(wx, pp)
              wallBoxes.push(new THREE.Box3(
                new THREE.Vector3(wx - WTk/2, 0, cur), new THREE.Vector3(wx + WTk/2, WH, gs)
              ))
            }
            cur = ge
          }
          if (WS > cur + 0.5) {
            const len = WS - cur, cz = (cur + WS) / 2
            stB(wx, WH/2,       cz, WTk,     WH,   len, wConc)
            stB(wx, WH - 0.36,  cz, WTk*1.2, 0.72, len, wMtl)
            stB(wx, WH + 0.18,  cz, 0.12,    0.12, len, wRst)
            for (let pp = cur + 14; pp < WS - 7; pp += 14) mkPillarNS(wx, pp)
            wallBoxes.push(new THREE.Box3(
              new THREE.Vector3(wx - WTk/2, 0, cur), new THREE.Vector3(wx + WTk/2, WH, WS)
            ))
          }
        }

        // Four walls — gaps align with street terminations
        mkEWSpan(WN, [14, -11, 60])         // north: main st, industrial center, sanctum
        mkEWSpan(WS, [14, 35, 62, 78])      // south: main st, market sq, 1st Ave, 2nd Ave
        mkNSSpan(WE, [30, 55, 73, 89])      // east: 44th, Concourse, South Cross, Far South
        mkNSSpan(WW, [-65, 30])             // west: industrial service, market approach

        // Checkpoint gates at every street terminus (all closed)
        mkGateEW(14,  WN); mkGateEW(-11, WN); mkGateEW(60,  WN)
        mkGateEW(14,  WS); mkGateEW(35,  WS); mkGateEW(62,  WS); mkGateEW(78, WS)
        mkGateNS(WE,  30); mkGateNS(WE,  55); mkGateNS(WE,  73); mkGateNS(WE, 89)
        mkGateNS(WW, -65); mkGateNS(WW,  30)

        // Corner towers
        mkCorner(WW, WN); mkCorner(WE, WN); mkCorner(WW, WS); mkCorner(WE, WS)
      }

      // ── Local player ───────────────────────────────────────
      const { group: player, leftArm, rightArm, leftLeg, rightLeg } = buildPlayer(0x1565c0)
      scene.add(player)
      player.position.set(5, 0, 52)
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

      // ── Sky lightning ──────────────────────────────────────────────
      const skyBoltMat = new THREE.LineBasicMaterial({ color: 0xd0e8ff })
      let skyBolts: THREE.Line[] = []
      let skyFlashIntensity = 0
      let skyBoltFrames = 0
      let skyNextStrike = 200 + Math.floor(Math.random() * 400)

      const skyCloudOrigins: [number, number, number][] = [
        [-40, 55, -50], [10, 58, -70], [60, 52, -45], [-80, 60, -20],
        [30, 56, 40],   [-20, 62, 30], [80, 54, 10],  [-60, 50, 50],
      ]

      const mkSkyBoltGeo = (ox: number, oy: number, oz: number, endY: number) => {
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 14; i++) {
          const t = i / 14
          const jitter = (1 - t * 0.65) * 4
          pts.push(new THREE.Vector3(
            ox + (Math.random() - 0.5) * jitter,
            oy + (endY - oy) * t,
            oz + (Math.random() - 0.5) * jitter
          ))
        }
        return new THREE.BufferGeometry().setFromPoints(pts)
      }

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

      // ── Touch support (camera swipe — joystick overlay handles its own touches) ─
      let lastTouchX = 0, lastTouchY = 0, isTouching = false
      renderer.domElement.addEventListener('touchstart', (e: TouchEvent) => {
        if (!e.targetTouches.length) return
        isTouching = true
        lastTouchX = e.targetTouches[0].clientX
        lastTouchY = e.targetTouches[0].clientY
      }, { signal: sig })
      renderer.domElement.addEventListener('touchend', (e: TouchEvent) => {
        if (!e.targetTouches.length) isTouching = false
      }, { signal: sig })
      renderer.domElement.addEventListener('touchmove', (e: TouchEvent) => {
        if (!isTouching || !e.targetTouches.length) return
        e.preventDefault()
        cameraAngle -= (e.targetTouches[0].clientX - lastTouchX) * 0.005
        camPitch = Math.max(-1.4, Math.min(1.4, camPitch - (e.targetTouches[0].clientY - lastTouchY) * 0.005))
        lastTouchX = e.targetTouches[0].clientX
        lastTouchY = e.targetTouches[0].clientY
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

      // Persistent id so a server redeploy can restore this player's
      // position, money and items once they reconnect.
      const PLAYER_ID_KEY = 'gameWorldPlayerId'
      let storedPlayerId: string
      try {
        storedPlayerId = localStorage.getItem(PLAYER_ID_KEY) ?? ''
        if (!storedPlayerId) {
          storedPlayerId = crypto.randomUUID()
          localStorage.setItem(PLAYER_ID_KEY, storedPlayerId)
        }
      } catch {
        storedPlayerId = crypto.randomUUID()
      }

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
          ws?.send(JSON.stringify({ type: 'join', id: storedPlayerId }))
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
            player.position.set(5, 0, 52)
            playerHealthRef.current = 100; lastDispHealth = 100; setPlayerHealth(100)
            if (healthBarRef.current) {
              healthBarRef.current.style.width = '100%'
              healthBarRef.current.style.background = '#44dd44'
            }
            lastDamageRef.current = 0
          }
        }

        const playerActive = !isDeadRef.current && !buyMenuOpenRef.current

        // ── Hospital safe zone ─────────────────────────────────────────────
        const inHosp = player.position.x < HOSP_X1 && player.position.x > HOSP_X2
          && player.position.z > HOSP_Z1 && player.position.z < HOSP_Z2
        if (inHosp !== inHospitalRef.current) {
          inHospitalRef.current = inHosp
          setInHospital(inHosp)
        }

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

          const w = !!(keys['KeyW'] || keys['ArrowUp'])    || joystickRef.current.y < -0.3
          const s = !!(keys['KeyS'] || keys['ArrowDown'])  || joystickRef.current.y >  0.3
          const a = !!(keys['KeyA'] || keys['ArrowLeft'])  || joystickRef.current.x < -0.3
          const d = !!(keys['KeyD'] || keys['ArrowRight']) || joystickRef.current.x >  0.3
          moving = w || s || a || d

          const spaceNow = !!keys['Space'] || jumpTouchRef.current
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
        if (pendingShotRef.current && playerActive && !inHospitalRef.current) {
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
        if (mouseDownRef.current && activeSlotRef.current === 1 && !inHospitalRef.current) {
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
        const lOn = !!(mouseDownRef.current && activeSlotRef.current === 2 && !inHospitalRef.current)
        if (lOn) {
          boltL.geometry.dispose(); boltL.geometry = mkLightGeo(7)
          boltR.geometry.dispose(); boltR.geometry = mkLightGeo(7)
          boltL.visible = Math.random() > 0.25
          boltR.visible = Math.random() > 0.25
        } else {
          boltL.visible = false; boltR.visible = false
        }

        // ── Sky lightning strikes ──────────────────────────────────────
        skyNextStrike--
        if (skyNextStrike <= 0) {
          for (const b of skyBolts) { scene.remove(b); b.geometry.dispose() }
          skyBolts = []
          const [ox, oy, oz] = skyCloudOrigins[Math.floor(Math.random() * skyCloudOrigins.length)]
          const sx = ox + (Math.random() - 0.5) * 24
          const sz = oz + (Math.random() - 0.5) * 24
          const mainBolt = new THREE.Line(mkSkyBoltGeo(sx, oy, sz, 4 + Math.random() * 8), skyBoltMat)
          scene.add(mainBolt); skyBolts.push(mainBolt)
          const branches = 1 + Math.floor(Math.random() * 2)
          for (let bi = 0; bi < branches; bi++) {
            const bsy = oy - 10 - Math.random() * 14
            const branch = new THREE.Line(
              mkSkyBoltGeo(sx + (Math.random() - 0.5) * 8, bsy, sz + (Math.random() - 0.5) * 8, bsy - 8 - Math.random() * 14),
              skyBoltMat
            )
            scene.add(branch); skyBolts.push(branch)
          }
          skyFlashIntensity = 1.6
          skyBoltFrames = 5
          skyNextStrike = 300 + Math.floor(Math.random() * 600)
        }
        if (skyBoltFrames > 0) {
          skyBoltFrames--
          if (skyBoltFrames === 0) {
            for (const b of skyBolts) { scene.remove(b); b.geometry.dispose() }
            skyBolts = []
          }
        }
        if (skyFlashIntensity > 0) {
          ambientLight.intensity = 0.18 + skyFlashIntensity
          skyFlashIntensity = Math.max(0, skyFlashIntensity - 0.07)
          if (skyFlashIntensity === 0) ambientLight.intensity = 0.18
        }

        // ── Pistol ────────────────────────────────────────────
        pistolGroup.visible = hasPistolRef.current && activeSlotRef.current === 5 && !inHospitalRef.current

        // ── Uzi ───────────────────────────────────────────────
        uziGroup.visible = hasUziRef.current && activeSlotRef.current === 6 && !inHospitalRef.current
        if (uziVisualCooldown > 0) uziVisualCooldown--
        if (mouseDownRef.current && activeSlotRef.current === 6 && hasUziRef.current && playerActive && !uziReloadingRef.current && uziAmmoRef.current > 0 && !inHospitalRef.current) {
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
        mgGroup.visible = hasMiniGunRef.current && activeSlotRef.current === 4 && !inHospitalRef.current
        if (inHospitalRef.current) saberGroup.visible = false
        if (mgCooldown > 0) mgCooldown--
        if (mouseDownRef.current && activeSlotRef.current === 4 && hasMiniGunRef.current && playerActive && !inHospitalRef.current) {
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

        // ── Nexus sky beam animation ───────────────────────────────────────────
        {
          const bt = Date.now() * 0.001
          nexusHelixGroup.rotation.y = bt * 1.8
          nexusMidMat.opacity = 0.18 + Math.sin(bt * 2.5) * 0.10
          nexusOuterMat.opacity = 0.07 + Math.sin(bt * 1.7 + 1.0) * 0.04
          nexusBasePL.intensity = 26 + Math.sin(bt * 4.0) * 9 + Math.sin(bt * 9.1) * 4
          for (let ri = 0; ri < nexusRings.length; ri++) {
            nexusRings[ri].position.y += 0.25
            if (nexusRings[ri].position.y > nexusBaseY + nexusBeamH - 5)
              nexusRings[ri].position.y = nexusBaseY + 2
            ;(nexusRings[ri].material as THREE.MeshBasicMaterial).opacity =
              0.25 + Math.sin(bt * 2.2 + ri * 0.9) * 0.35
          }
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
          } else if (Math.abs(ppx - 2.0) < 0.8 && pz >= -77 && pz <= -74) {
            // WH_A south ladder (approach from Z=-74, reach wall at Z=-77, rise to Y=8.5)
            floorY = Math.max(0, Math.min(8.5, (-74 - pz) / 3 * 8.5))
          } else if (Math.abs(ppx - 2.0) <= 7.5 && pz >= -92 && pz <= -77 && player.position.y > 7.0) {
            // WH_A roof/rampart platform
            floorY = 8.5
          } else if (Math.abs(ppx - 17.5) < 0.8 && pz >= -77 && pz <= -74) {
            // WH_B south ladder
            floorY = Math.max(0, Math.min(7.5, (-74 - pz) / 3 * 7.5))
          } else if (Math.abs(ppx - 17.5) <= 5.0 && pz >= -92 && pz <= -77 && player.position.y > 6.0) {
            // WH_B roof/rampart platform
            floorY = 7.5
          } else if (Math.abs(ppx - 17.5) < 0.8 && pz >= -60 && pz <= -57) {
            // WH_D south ladder (approach from Z=-57)
            floorY = Math.max(0, Math.min(7.0, (-57 - pz) / 3 * 7.0))
          } else if (Math.abs(ppx - 17.5) <= 5.0 && pz >= -73 && pz <= -60 && player.position.y > 6.0) {
            // WH_D roof/rampart platform
            floorY = 7.0
          // ── Urban District stairwells ──────────────────────────────
          } else if (ppx >= 65.5 && ppx <= 67.0 && pz >= 32.4 && pz <= 42.2) {
            // NE1A stairwell — walk south to climb 3 floors (Y 0→9)
            floorY = Math.max(0, Math.min(9, (pz - 32.4) / 9.8 * 9))
          } else if (ppx >= 65 && ppx <= 76 && pz >= 32 && pz <= 43 && player.position.y > 8.5) {
            floorY = 9 // NE1A floor 4
          } else if (ppx >= 65 && ppx <= 76 && pz >= 32 && pz <= 43 && player.position.y > 5.5) {
            floorY = 6 // NE1A floor 3
          } else if (ppx >= 65 && ppx <= 76 && pz >= 32 && pz <= 43 && player.position.y > 2.5) {
            floorY = 3 // NE1A floor 2
          } else if (ppx >= 52.5 && ppx <= 54.0 && pz >= 77.8 && pz <= 86.2) {
            // S2 stairwell — walk south to climb
            floorY = Math.max(0, Math.min(9, (pz - 77.8) / 8.4 * 9))
          } else if (ppx >= 52 && ppx <= 62 && pz >= 77 && pz <= 87 && player.position.y > 8.5) {
            floorY = 9 // S2 floor 4
          } else if (ppx >= 52 && ppx <= 62 && pz >= 77 && pz <= 87 && player.position.y > 5.5) {
            floorY = 6 // S2 floor 3
          } else if (ppx >= 52 && ppx <= 62 && pz >= 77 && pz <= 87 && player.position.y > 2.5) {
            floorY = 3 // S2 floor 2
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

  useEffect(() => {
    const ua = navigator.userAgent
    setIsIPad(/iPad/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1))
  }, [])

  useEffect(() => {
    if (!isIPad) return
    const base = joystickBaseRef.current
    const knob = joystickKnobRef.current
    if (!base || !knob) return
    const RADIUS = 44
    let startX = 0, startY = 0
    const onStart = (e: TouchEvent) => {
      e.preventDefault()
      startX = e.targetTouches[0].clientX
      startY = e.targetTouches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      e.preventDefault()
      const dx = e.targetTouches[0].clientX - startX
      const dy = e.targetTouches[0].clientY - startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const clamp = Math.min(dist, RADIUS)
      const nx = dist > 0 ? (dx / dist) * clamp : 0
      const ny = dist > 0 ? (dy / dist) * clamp : 0
      joystickRef.current = { x: nx / RADIUS, y: ny / RADIUS }
      knob.style.transform = `translate(${nx}px, ${ny}px)`
    }
    const onEnd = () => {
      joystickRef.current = { x: 0, y: 0 }
      knob.style.transform = 'translate(0px, 0px)'
    }
    base.addEventListener('touchstart',  onStart, { passive: false })
    base.addEventListener('touchmove',   onMove,  { passive: false })
    base.addEventListener('touchend',    onEnd)
    base.addEventListener('touchcancel', onEnd)
    return () => {
      base.removeEventListener('touchstart',  onStart)
      base.removeEventListener('touchmove',   onMove)
      base.removeEventListener('touchend',    onEnd)
      base.removeEventListener('touchcancel', onEnd)
    }
  }, [isIPad])

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

      {/* Hospital safe zone badge */}
      {inHospital && (
        <div
          className='pointer-events-none absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-bold text-white'
          style={{ background: 'rgba(20,80,50,0.78)', backdropFilter: 'blur(6px)', border: '1px solid rgba(100,200,140,0.35)', letterSpacing: 1 }}
        >
          SAFE ZONE — No weapons
        </div>
      )}

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

      {/* iPad virtual controls */}
      {isIPad && (
        <>
          {/* Left joystick */}
          <div
            ref={joystickBaseRef}
            className='absolute z-30'
            style={{
              bottom: 110,
              left: 36,
              width: 112,
              height: 112,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              border: '2px solid rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            <div
              ref={joystickKnobRef}
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.35)',
                border: '2px solid rgba(255,255,255,0.6)',
                pointerEvents: 'none',
                willChange: 'transform',
              }}
            />
          </div>

          {/* Jump button */}
          <div
            className='absolute z-30 flex items-center justify-center select-none'
            style={{
              bottom: 110,
              right: 36,
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'rgba(57,255,20,0.18)',
              border: '2px solid rgba(57,255,20,0.5)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              touchAction: 'none',
              userSelect: 'none',
            }}
            onTouchStart={(e) => { e.preventDefault(); jumpTouchRef.current = true }}
            onTouchEnd={() => { jumpTouchRef.current = false }}
            onTouchCancel={() => { jumpTouchRef.current = false }}
          >
            JUMP
          </div>
        </>
      )}

      <div ref={mountRef} className='h-full w-full' />
    </div>
  )
}
