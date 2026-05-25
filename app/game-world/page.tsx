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
  const staminaBarRef = useRef<HTMLDivElement>(null)
  const healthBarRef  = useRef<HTMLDivElement>(null)
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

      // ── Building (x=[24,36], z=[-5,5], 5 floors × 3 units) ───

      // Procedural textures
      const mkConcreteMap = () => {
        const size = 256
        const cv = document.createElement('canvas')
        cv.width = cv.height = size
        const tc = cv.getContext('2d')!
        tc.fillStyle = '#8c8fa2'
        tc.fillRect(0, 0, size, size)
        const id = tc.getImageData(0, 0, size, size)
        for (let i = 0; i < id.data.length; i += 4) {
          const n = (Math.random() - 0.5) * 22
          id.data[i]   = Math.min(255, Math.max(0, id.data[i]   + n))
          id.data[i+1] = Math.min(255, Math.max(0, id.data[i+1] + n))
          id.data[i+2] = Math.min(255, Math.max(0, id.data[i+2] + n + 8))
        }
        tc.putImageData(id, 0, 0)
        // Horizontal floor bands (5 per tile → 3 units/band at repeat.y=5)
        tc.strokeStyle = 'rgba(0,0,0,0.32)'
        tc.lineWidth = 4
        for (let y = 0; y <= size; y += size / 5) { tc.beginPath(); tc.moveTo(0, y); tc.lineTo(size, y); tc.stroke() }
        tc.strokeStyle = 'rgba(255,255,255,0.07)'
        tc.lineWidth = 2
        for (let y = 5; y <= size; y += size / 5) { tc.beginPath(); tc.moveTo(0, y); tc.lineTo(size, y); tc.stroke() }
        // Vertical expansion joints
        tc.strokeStyle = 'rgba(0,0,0,0.16)'
        tc.lineWidth = 2
        for (let x = 0; x <= size; x += size / 3) { tc.beginPath(); tc.moveTo(x, 0); tc.lineTo(x, size); tc.stroke() }
        const t = new THREE.CanvasTexture(cv)
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(4, 5)
        return t
      }

      const mkWindowMap = () => {
        const size = 128
        const cv = document.createElement('canvas')
        cv.width = cv.height = size
        const tc = cv.getContext('2d')!
        tc.fillStyle = '#1a3a5a'
        tc.fillRect(0, 0, size, size)
        const g = tc.createLinearGradient(0, 0, size, size)
        g.addColorStop(0,   'rgba(120,180,255,0.25)')
        g.addColorStop(0.5, 'rgba(80,140,220,0.06)')
        g.addColorStop(1,   'rgba(0,20,60,0.30)')
        tc.fillStyle = g; tc.fillRect(0, 0, size, size)
        // Frame
        tc.strokeStyle = 'rgba(180,215,255,0.6)'
        tc.lineWidth = 6; tc.strokeRect(3, 3, size - 6, size - 6)
        // Pane dividers
        tc.strokeStyle = 'rgba(140,190,255,0.32)'
        tc.lineWidth = 3
        tc.beginPath(); tc.moveTo(size / 2, 3); tc.lineTo(size / 2, size - 3); tc.stroke()
        tc.beginPath(); tc.moveTo(3, size / 2); tc.lineTo(size - 3, size / 2); tc.stroke()
        return new THREE.CanvasTexture(cv)
      }

      const mkRoofMap = () => {
        const size = 256
        const cv = document.createElement('canvas')
        cv.width = cv.height = size
        const tc = cv.getContext('2d')!
        tc.fillStyle = '#28282e'
        tc.fillRect(0, 0, size, size)
        for (let i = 0; i < 500; i++) {
          const x = Math.random() * size, y = Math.random() * size, r = 1 + Math.random() * 2.5
          const v = 30 + Math.floor(Math.random() * 50)
          tc.fillStyle = `rgb(${v},${v},${v + 5})`
          tc.beginPath(); tc.arc(x, y, r, 0, Math.PI * 2); tc.fill()
        }
        const t = new THREE.CanvasTexture(cv)
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(3, 2)
        return t
      }

      const bldConcrete = new THREE.MeshLambertMaterial({ map: mkConcreteMap(), color: 0xffffff })
      const bldGlass    = new THREE.MeshLambertMaterial({ map: mkWindowMap(),   color: 0xffffff, emissive: 0x0a1f38 })
      const bldRoof     = new THREE.MeshLambertMaterial({ map: mkRoofMap(),     color: 0xffffff })
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
      bldWall(24,   8.7,  0,    0.3, 12.6, 1.4, false)  // door arch — above head height, no 2D collision

      // Roof
      const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 10), bldRoof)
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

      // ── Underground Subway ──────────────────────────────────────────
      const subCX  = -15       // tunnel center X
      const subHW  = 3.2       // half-width (tunnel spans X: subCX ± subHW)
      const subFY  = -7        // floor Y
      const subTH  = 6         // tunnel height

      const rampA  = Math.atan2(subTH, 10)
      const rampL  = Math.sqrt(100 + subTH * subTH)

      const subConc = new THREE.MeshLambertMaterial({ color: 0x888899 })
      const subFlrM = new THREE.MeshLambertMaterial({ color: 0x4a4a52 })
      const subLitM = new THREE.MeshBasicMaterial({ color: 0xfffde0 })
      const subYell = new THREE.MeshLambertMaterial({ color: 0xf5c518 })
      const subRmpM = new THREE.MeshLambertMaterial({ color: 0x666677 })
      const subEntM = new THREE.MeshLambertMaterial({ color: 0x777788 })
      const subSgnM = new THREE.MeshBasicMaterial({ color: 0xffcc00 })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subBox = (cx: number, cy: number, cz: number, w: number, h: number, d: number, mat: any) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
        m.position.set(cx, cy, cz)
        m.castShadow = true; m.receiveShadow = true
        scene.add(m)
      }

      // Floor plane
      const subFloorP = new THREE.Mesh(new THREE.PlaneGeometry(subHW * 2, 60), subFlrM)
      subFloorP.rotation.x = -Math.PI / 2
      subFloorP.position.set(subCX, subFY + 0.01, 0)
      subFloorP.receiveShadow = true
      scene.add(subFloorP)

      // East & west walls (run full length Z: -32 to 32)
      subBox(subCX + subHW, subFY + subTH / 2, 0, 0.3, subTH, 64, subConc)
      subBox(subCX - subHW, subFY + subTH / 2, 0, 0.3, subTH, 64, subConc)

      // Ceiling — middle section only (gap over stairwells Z: ±20 to ±30)
      subBox(subCX, subFY + subTH, 0,   subHW * 2, 0.3, 40, subConc)  // Z: -20 to 20
      subBox(subCX, subFY + subTH, -31, subHW * 2, 0.3,  2, subConc)  // north end cap
      subBox(subCX, subFY + subTH,  31, subHW * 2, 0.3,  2, subConc)  // south end cap

      // End cap walls
      subBox(subCX, subFY + subTH / 2, -32, subHW * 2, subTH, 0.3, subConc)
      subBox(subCX, subFY + subTH / 2,  32, subHW * 2, subTH, 0.3, subConc)

      // Yellow platform edge stripes
      subBox(subCX - subHW + 0.35, subFY + 0.04, 0, 0.25, 0.08, 40, subYell)
      subBox(subCX + subHW - 0.35, subFY + 0.04, 0, 0.25, 0.08, 40, subYell)

      // Support columns every 8 units
      for (let cz = -24; cz <= 24; cz += 8) {
        subBox(subCX - subHW + 0.3, subFY + subTH / 2, cz, 0.35, subTH, 0.35, subConc)
        subBox(subCX + subHW - 0.3, subFY + subTH / 2, cz, 0.35, subTH, 0.35, subConc)
      }

      // Overhead light strips + point lights
      for (let lz = -16; lz <= 16; lz += 8) {
        subBox(subCX, subFY + subTH - 0.25, lz, 0.28, 0.1, 2.5, subLitM)
        const subPL = new THREE.PointLight(0xfffde0, 0.9, 14)
        subPL.position.set(subCX, subFY + subTH - 0.5, lz)
        scene.add(subPL)
      }

      // North ramp: surface at Z=-20 (Y=0) → underground at Z=-30 (Y=subFY)
      const rampN = new THREE.Mesh(new THREE.BoxGeometry(subHW * 2, 0.25, rampL), subRmpM)
      rampN.rotation.x = -rampA
      rampN.position.set(subCX, subFY / 2, -25)
      rampN.castShadow = true; rampN.receiveShadow = true
      scene.add(rampN)

      // South ramp: surface at Z=20 (Y=0) → underground at Z=30 (Y=subFY)
      const rampS = new THREE.Mesh(new THREE.BoxGeometry(subHW * 2, 0.25, rampL), subRmpM)
      rampS.rotation.x = rampA
      rampS.position.set(subCX, subFY / 2, 25)
      rampS.castShadow = true; rampS.receiveShadow = true
      scene.add(rampS)

      // Entrance kiosks at each stairwell opening
      // ez = edge Z (top of ramp), dir = which way is "street" (away from hole)
      for (const [ez, dir] of [[-20, 1], [20, -1]] as [number, number][]) {
        subBox(subCX - subHW - 0.15, 1.5, ez, 0.3, 3.0, 0.5, subEntM)   // left pillar
        subBox(subCX + subHW + 0.15, 1.5, ez, 0.3, 3.0, 0.5, subEntM)   // right pillar
        subBox(subCX, 2.9, ez, subHW * 2 + 0.9, 0.4, 0.5, subEntM)       // header beam
        subBox(subCX, 3.1, ez + dir * 0.8, subHW * 2 + 1.4, 0.15, 2.0, subEntM) // canopy
        const sgn = new THREE.Mesh(new THREE.BoxGeometry(subHW * 2 + 0.2, 0.5, 0.12), subSgnM)
        sgn.position.set(subCX, 2.55, ez + dir * 0.07)
        scene.add(sgn)
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

      const mkShack = (bx: number, bz: number, rot: number) => {
        const w = 3 + Math.random() * 2.5
        const h = 3.2 + Math.random() * 2.5
        const d = 3 + Math.random() * 2.5
        const wt = 0.18
        const dw = Math.min(0.95, w * 0.32)
        const dh = Math.min(h - 0.3, 2.3)
        const fLW = (w - dw) / 2
        const wallM = shMats[Math.floor(Math.random() * shMats.length)]
        const roofM = Math.random() > 0.5 ? shTin1 : shTarp
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
        roofMesh.rotation.z = (Math.random() - 0.5) * 0.25
        roofMesh.position.y = h + 0.08; roofMesh.castShadow = true; g.add(roofMesh)

        if (Math.random() > 0.55) {
          const lw = 0.9 + Math.random() * 1.2
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
        mkShack(sx + (Math.random()-0.5)*2.5, sz + (Math.random()-0.5)*2.5, (Math.random()-0.5)*0.7)
      }
      for (const [bx,bz] of [[29,-14],[37,1],[32,16],[26,8],[41,-8],[44,12]] as [number,number][]) {
        mkBarrel(bx+(Math.random()-0.5), bz+(Math.random()-0.5))
      }

      // ── District 8 Arena Wall ────────────────────────────────────────
      const arenaR = 58          // half-size of square arena
      const wallH  = 22
      const wallT  = 2.2

      const arenaMat  = new THREE.MeshLambertMaterial({ color: 0x0d0d14 })
      const arenaGlow = new THREE.MeshBasicMaterial({ color: 0x3300ff, transparent: true, opacity: 0.55 })
      const arenaGlw2 = new THREE.MeshBasicMaterial({ color: 0x7700cc, transparent: true, opacity: 0.35 })
      const arenaPanel = new THREE.MeshLambertMaterial({ color: 0x111122 })

      const addArenaWall = (cx: number, cz: number, w: number, d: number) => {
        // Main body
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), arenaMat)
        m.position.set(cx, wallH / 2, cz)
        m.castShadow = true; m.receiveShadow = true
        scene.add(m)
        // Top glow strip
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.5, d + 0.1), arenaGlow)
        strip.position.set(cx, wallH + 0.25, cz)
        scene.add(strip)
        // Mid panel groove lines (every 6 units along the long axis)
        const isNS = w > d
        const segCount = Math.floor((isNS ? w : d) / 6)
        for (let s = 0; s < segCount; s++) {
          const off = -((isNS ? w : d) / 2) + s * 6 + 3
          const px2 = isNS ? cx + off : cx
          const pz2 = isNS ? cz : cz + off
          const gw = isNS ? 0.18 : w + 0.05
          const gd = isNS ? d + 0.05 : 0.18
          const groove = new THREE.Mesh(new THREE.BoxGeometry(gw, wallH * 0.85, gd), arenaPanel)
          groove.position.set(px2, wallH / 2, pz2)
          scene.add(groove)
          // Glowing rib at mid-height
          const rib = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.05, 0.22, gd + 0.05), arenaGlw2)
          rib.position.set(px2, wallH * 0.45, pz2)
          scene.add(rib)
        }
        // Collision
        wallBoxes.push(new THREE.Box3(
          new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
          new THREE.Vector3(cx + w / 2, wallH, cz + d / 2)
        ))
      }

      const wallLen = arenaR * 2 + wallT
      addArenaWall(0,        -arenaR, wallLen, wallT)   // north
      addArenaWall(0,         arenaR, wallLen, wallT)   // south
      addArenaWall(-arenaR,   0,      wallT,   wallLen) // west
      addArenaWall( arenaR,   0,      wallT,   wallLen) // east

      // Corner pylons
      const pyMat = new THREE.MeshLambertMaterial({ color: 0x080810 })
      const pyGlo = new THREE.MeshBasicMaterial({ color: 0x5500ff, transparent: true, opacity: 0.7 })
      for (const [cx2, cz2] of [[-arenaR,-arenaR],[arenaR,-arenaR],[-arenaR,arenaR],[arenaR,arenaR]]) {
        const py = new THREE.Mesh(new THREE.BoxGeometry(wallT + 1, wallH + 3, wallT + 1), pyMat)
        py.position.set(cx2, (wallH + 3) / 2, cz2)
        py.castShadow = true; scene.add(py)
        const pyTop = new THREE.Mesh(new THREE.BoxGeometry(wallT + 2, 0.6, wallT + 2), pyGlo)
        pyTop.position.set(cx2, wallH + 3.3, cz2)
        scene.add(pyTop)
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
          if (player.position.distanceTo(new THREE.Vector3(24, 0, 0)) < 5) {
            doorOpen = !doorOpen
            if (connected && ws) ws.send(JSON.stringify({ type: 'door' }))
          }
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
              doorOpen: boolean
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
                // Door
                doorOpen = p.doorOpen
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

        // ── Player Y — subway ramp transition ─────────────────
        {
          const inSubX = Math.abs(player.position.x - subCX) < subHW - 0.3
          const pz = player.position.z
          let tgtY = 0
          if (inSubX) {
            if (pz >= -20 && pz <= 20)     tgtY = subFY
            else if (pz < -20 && pz > -30) tgtY = ((-20 - pz) / 10) * subFY
            else if (pz >  20 && pz <  30) tgtY = ((pz - 20)  / 10) * subFY
          }
          player.position.y += (tgtY - player.position.y) * 0.15
        }

        // Door swing animation
        doorPivot.rotation.y += ((doorOpen ? Math.PI / 2 : 0) - doorPivot.rotation.y) * 0.12
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
        WASD · Mouse · Shift sprint · Click shoot · E door · M buy menu · ESC release
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
