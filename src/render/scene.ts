import * as THREE from 'three';
import { World, Chunk, CHUNK_SIZE } from '../core/world';
import { buildChunkMesh, disposeChunkMesh, ChunkMesh } from './mesher';
import { daylight } from '../core/environment';
import { BlockId, blockLight } from '../core/blocks';

export class GameScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  blockGroup = new THREE.Group();
  entityGroup = new THREE.Group();
  chunkMeshes = new Map<string, ChunkMesh>();
  blockMaterial: THREE.MeshLambertMaterial;
  transMaterial: THREE.MeshLambertMaterial;
  highlight: THREE.LineSegments;
  private weatherOverlay: THREE.Points | null = null;
  private rainVel: Float32Array | null = null;
  fog: THREE.Fog;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
    this.blockMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.transMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });

    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.hemi = new THREE.HemisphereLight(0xbfd4e8, 0x6a5a44, 0.5);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const d = 40;
    this.sun.shadow.camera.left = -d; this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d; this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.far = 200;

    this.scene.add(this.ambient, this.hemi, this.sun, this.blockGroup, this.entityGroup);
    this.fog = new THREE.Fog(0x9fb4c8, 40, 120);
    this.scene.fog = this.fog;

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // 加载/卸载区块网格（每帧最多构建几个，避免卡顿）
  updateChunks(world: World, px: number, pz: number, radius: number, budget = 2): void {
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);
    // 删除过远网格
    for (const [key, mesh] of this.chunkMeshes) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > radius + 1) {
        this.blockGroup.remove(mesh.opaque, mesh.transparent);
        disposeChunkMesh(mesh);
        this.chunkMeshes.delete(key);
      }
    }
    // 需要的区块按距离排序
    const wanted: { key: string; cx: number; cz: number; dist: number }[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        const key = World.key(cx, cz);
        const existing = this.chunkMeshes.get(key);
        const chunk = world.hasChunk(cx, cz) ? world.getChunk(cx, cz) : null;
        if (existing && chunk && !chunk.dirty) continue;
        wanted.push({ key, cx, cz, dist: dx * dx + dz * dz });
      }
    }
    wanted.sort((a, b) => a.dist - b.dist);
    let built = 0;
    for (const w of wanted) {
      if (built >= budget) break;
      const chunk: Chunk = world.getChunk(w.cx, w.cz);
      const old = this.chunkMeshes.get(w.key);
      if (old) {
        this.blockGroup.remove(old.opaque, old.transparent);
        disposeChunkMesh(old);
      }
      const mesh = buildChunkMesh(world, chunk, this.blockMaterial, this.transMaterial);
      mesh.opaque.castShadow = false;
      mesh.opaque.receiveShadow = true;
      this.blockGroup.add(mesh.opaque, mesh.transparent);
      this.chunkMeshes.set(w.key, mesh);
      chunk.dirty = false;
      built++;
    }
  }

  refreshAllChunks(world: World): void {
    for (const [, chunk] of world.chunks) chunk.dirty = true;
  }

  showHighlight(x: number, y: number, z: number, valid: boolean): void {
    this.highlight.visible = true;
    this.highlight.position.set(x + 0.5, y + 0.5, z + 0.5);
    (this.highlight.material as THREE.LineBasicMaterial).color.setHex(valid ? 0x7dff9a : 0xff5a4a);
  }
  hideHighlight(): void {
    this.highlight.visible = false;
  }

  // 玩家附近发光方块对场景亮度贡献（取最近几个）
  private playerLight: THREE.PointLight | null = null;
  updatePlayerLight(pos: THREE.Vector3, intensity: number): void {
    if (!this.playerLight) {
      this.playerLight = new THREE.PointLight(0x80ffd8, 0, 14, 1.6);
      this.scene.add(this.playerLight);
    }
    this.playerLight.position.copy(pos);
    this.playerLight.intensity = intensity;
  }

  updateSky(env: { time: number; weather: string }, px: number, py: number, pz: number, world: World): void {
    const t = env.time;
    const sunAngle = ((t - 6) / 12) * Math.PI;
    this.sun.position.set(px + Math.cos(sunAngle) * 80, Math.sin(sunAngle) * 100 + 10, pz + 30);
    this.sun.target.position.set(px, py, pz);
    this.sun.target.updateMatrixWorld();
    const dl = daylight(t);
    this.sun.intensity = dl * 1.1;
    this.ambient.intensity = 0.22 + dl * 0.35;
    this.hemi.intensity = 0.2 + dl * 0.45;

    const dayTop = new THREE.Color(0x8fbfe0);
    const dusk = new THREE.Color(0xd08a5a);
    const night = new THREE.Color(0x0c1424);
    const sky = new THREE.Color();
    if (dl > 0.5) sky.copy(dayTop);
    else if (dl > 0.08) sky.copy(night).lerp(dayTop, (dl - 0.08) / 0.42 * 0.7).lerp(dusk, 0.35 * (1 - Math.abs(dl - 0.4)));
    else sky.copy(night);

    let vis = 130, fogColor = sky.clone();
    if (env.weather === 'storm') { vis = 42; fogColor.setHex(0x3a4650); }
    else if (env.weather === 'sandstorm') { vis = 26; fogColor.setHex(0xb09a6a); }
    else if (env.weather === 'cold') { vis = 55; fogColor.setHex(0x9fb4c4); }
    this.fog.far = vis;
    this.fog.color.copy(fogColor);
    this.scene.background = fogColor;
    this.updateWeatherParticles(env, px, py, pz);
    void world;
  }

  private particleCount = 0;
  private updateWeatherParticles(env: { weather: string }, px: number, py: number, pz: number): void {
    const need = env.weather === 'storm' ? 900 : env.weather === 'sandstorm' ? 1200 : env.weather === 'cold' ? 700 : 0;
    if (need === 0) {
      if (this.weatherOverlay) { this.scene.remove(this.weatherOverlay); this.weatherOverlay.geometry.dispose(); this.weatherOverlay = null; this.particleCount = 0; }
      return;
    }
    if (!this.weatherOverlay || this.particleCount !== need) {
      if (this.weatherOverlay) { this.scene.remove(this.weatherOverlay); this.weatherOverlay.geometry.dispose(); }
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(need * 3);
      this.rainVel = new Float32Array(need);
      for (let i = 0; i < need; i++) {
        arr[i * 3] = px + (Math.random() - 0.5) * 40;
        arr[i * 3 + 1] = py + Math.random() * 30;
        arr[i * 3 + 2] = pz + (Math.random() - 0.5) * 40;
        this.rainVel![i] = 18 + Math.random() * 10;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.PointsMaterial({
        color: env.weather === 'sandstorm' ? 0xd8c090 : env.weather === 'cold' ? 0xffffff : 0x9fc4e0,
        size: env.weather === 'cold' ? 0.18 : 0.12, transparent: true, opacity: 0.7,
      });
      this.weatherOverlay = new THREE.Points(geo, mat);
      this.scene.add(this.weatherOverlay);
      this.particleCount = need;
    }
    const pos = this.weatherOverlay.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < need; i++) {
      let y = arr[i * 3 + 1] - this.rainVel![i] * 0.016;
      let x = arr[i * 3];
      if (env.weather === 'sandstorm') x += 0.25;
      if (y < py - 5) { y = py + 25; x = px + (Math.random() - 0.5) * 40; arr[i * 3 + 2] = pz + (Math.random() - 0.5) * 40; }
      arr[i * 3] = x; arr[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

// 计算玩家所在位置光照等级（用于安全值）：天光 + 邻近发光方块
export function lightLevelAt(world: World, x: number, y: number, z: number, skyLight: number): number {
  let level = skyLight;
  for (let dx = -4; dx <= 4; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) {
    const l = blockLight(world.getBlock(x + dx, y + dy, z + dz));
    if (l > 0) {
      const d = Math.hypot(dx, dy, dz);
      level = Math.max(level, Math.max(0, l - d * 0.18));
    }
  }
  return Math.min(1, level);
}
