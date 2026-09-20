// Chunked voxel world: deterministic terrain, caves, ores, structures.

import { B } from './blocks';
import { ItemStack } from './inventory';
import { Rng, ValueNoise } from './rng';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const SEA_LEVEL = 26;
export const RENDER_RADIUS = 4;

export interface SiteInfo {
  kind: 'observatory' | 'geode' | 'tower' | 'ley';
  x: number;
  z: number;
  name: string;
}

export const SITES: SiteInfo[] = [
  { kind: 'observatory', x: 56, z: 8, name: '失落观测站' },
  { kind: 'geode', x: 38, z: -40, name: '地下晶洞' },
  { kind: 'tower', x: -52, z: 28, name: '废弃能源塔' },
  { kind: 'ley', x: 4, z: 96, name: '地脉禁区' }
];

export function keyOf(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class Chunk {
  blocks: Uint8Array;
  dirty = true;

  constructor(public cx: number, public cz: number) {
    this.blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  }

  index(lx: number, y: number, lz: number): number {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  get(lx: number, y: number, lz: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return B.Air;
    return this.blocks[this.index(lx, y, lz)];
  }

  set(lx: number, y: number, lz: number, id: number) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[this.index(lx, y, lz)] = id;
    this.dirty = true;
  }

  clear() {
    this.blocks.fill(0);
    this.dirty = true;
  }
}

export interface DroppedStack {
  id: string;
  count: number;
  durability?: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  born: number;
}

export interface WorldSaveData {
  seed: string | number;
  modifications: [string, number][];
  doors: string[];
  damage: [string, number][];
  containers: [string, (ItemStack | null)[]][];
  drops: DroppedStack[];
  depleted: string[];
}

export class World {
  chunks = new Map<string, Chunk>();
  modifications = new Map<string, number>();
  doorOpen = new Set<string>();
  blockHp = new Map<string, number>();
  containers = new Map<string, (ItemStack | null)[]>();
  depleted = new Set<string>();
  drops: DroppedStack[] = [];
  heightCache = new Map<string, number>();
  noise: ValueNoise;
  noiseB: ValueNoise;
  rng: Rng;

  constructor(public seed: string | number) {
    const numeric = typeof seed === 'number' ? seed : 0;
    this.noise = new ValueNoise(typeof seed === 'string' ? seed + ':terrain' : numeric + 101);
    this.noiseB = new ValueNoise(typeof seed === 'string' ? seed + ':cave' : numeric + 202);
    this.rng = new Rng(typeof seed === 'string' ? seed + ':rng' : numeric + 303);
  }

  static chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  surfaceHeight(x: number, z: number): number {
    const k = `${x},${z}`;
    const cached = this.heightCache.get(k);
    if (cached !== undefined) return cached;
    const continent = this.noise.fbm2(x / 90, z / 90, 3);
    const hills = this.noise.fbm2(x / 28, z / 28, 4);
    let h = Math.floor(20 + continent * 16 + hills * 10);
    const td = Math.hypot(x - SITES[2].x, z - SITES[2].z);
    if (td < 14) h += Math.floor((14 - td) * 0.8);
    const ld = Math.hypot(x - SITES[3].x, z - SITES[3].z);
    if (ld < 18) {
      h += Math.floor((18 - ld) * 0.5);
      if (this.noiseB.noise2(x / 4, z / 4) > 0.6) h += 3;
    }
    h = Math.max(8, Math.min(WORLD_HEIGHT - 12, h));
    this.heightCache.set(k, h);
    return h;
  }

  biomeAt(x: number, z: number, h: number): 'grass' | 'sand' | 'rock' | 'water' | 'highland' {
    if (h <= SEA_LEVEL - 2) return 'water';
    const wet = this.noise.noise2(x / 40 + 100, z / 40 - 100);
    if (h <= SEA_LEVEL + 1 || wet < 0.32) return 'sand';
    if (h >= 38) return 'highland';
    if (h >= 32 || wet > 0.66) return 'rock';
    return 'grass';
  }

  private caveAir(x: number, y: number, z: number): boolean {
    if (y < 4 || y > SEA_LEVEL - 2) return false;
    const a = this.noiseB.fbm2(x / 11 + y * 0.18, z / 11 - y * 0.12, 3);
    const b = this.noiseB.fbm2(x / 9 - z * 0.05, y / 9 + z * 0.07, 2);
    return a > 0.68 || b > 0.8;
  }

  ensureChunk(cx: number, cz: number): Chunk {
    const key = World.chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.generateChunk(chunk);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  updateLoadedChunks(px: number, pz: number): { loaded: string[]; unloaded: string[] } {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const keep = new Set<string>();
    const loaded: string[] = [];
    for (let dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) {
      for (let dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++) {
        if (dx * dx + dz * dz > (RENDER_RADIUS + 0.5) ** 2) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const k = World.chunkKey(cx, cz);
        keep.add(k);
        if (!this.chunks.has(k)) {
          this.ensureChunk(cx, cz);
          loaded.push(k);
        }
      }
    }
    const unloaded: string[] = [];
    for (const k of [...this.chunks.keys()]) {
      if (!keep.has(k)) {
        this.chunks.delete(k);
        unloaded.push(k);
      }
    }
    return { loaded, unloaded };
  }

  private generateChunk(chunk: Chunk) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const x = baseX + lx;
        const z = baseZ + lz;
        const h = this.surfaceHeight(x, z);
        const biome = this.biomeAt(x, z, h);
        for (let y = 0; y <= Math.max(h, SEA_LEVEL + 1); y++) {
          let id: number = B.Air;
          if (y === 0) {
            id = B.DeepShale;
          } else if (y < h - 5) {
            id = this.oreAt(x, y, z) ?? B.DeepShale;
          } else if (y < h) {
            id = this.subsurface(biome, x, y, z);
          } else if (y === h) {
            id = this.surfaceBlock(biome, x, z);
          }
          if (id !== B.Air && y < h && y > 2 && this.caveAir(x, y, z)) {
            const ore = this.oreAt(x, y, z);
            id = ore !== null && this.noiseB.noise2(x / 5 + y, z / 5 - y) > 0.55 ? ore : B.Air;
          }
          if (id !== B.Air) chunk.set(lx, y, lz, id);
        }
      }
    }
    this.decorate(chunk);
    this.stampSites(chunk);
    for (const [k, id] of this.modifications) {
      const [x, y, z] = k.split(',').map(Number);
      if (Math.floor(x / CHUNK_SIZE) === chunk.cx && Math.floor(z / CHUNK_SIZE) === chunk.cz) {
        chunk.set(x - chunk.cx * CHUNK_SIZE, y, z - chunk.cz * CHUNK_SIZE, id);
      }
    }
    chunk.dirty = true;
  }

  private oreAt(x: number, y: number, z: number): number | null {
    const n = this.noiseB.noise2(x / 6 + y * 3.1, z / 6 - y * 1.7);
    if (y < 16 && n > 0.86) return B.CrystalLode;
    if (y < 30 && n > 0.82) return B.IronLode;
    const m = this.noiseB.noise2(x / 5 - y * 2.3, z / 5 + y * 1.1);
    if (y < 26 && m > 0.83) return B.CopperLode;
    if (y < 28 && this.noise.noise2(x / 7 + y, z / 7) > 0.84) return B.CoalLode;
    return null;
  }

  private subsurface(biome: string, x: number, y: number, z: number): number {
    if (y < 12) return B.DeepShale;
    const n = this.noise.noise2(x / 8, y / 8 + z);
    switch (biome) {
      case 'sand':
        return y < SEA_LEVEL - 3 ? B.Rock : B.Sand;
      case 'highland':
        return B.Rock;
      default:
        return n > 0.55 ? B.Rock : B.Dirt;
    }
  }

  private surfaceBlock(biome: string, x: number, z: number): number {
    switch (biome) {
      case 'water':
        return B.Silt;
      case 'sand':
        return B.Sand;
      case 'rock':
        return B.Gravel;
      case 'highland': {
        const td = Math.hypot(x - SITES[2].x, z - SITES[2].z);
        return td < 12 ? B.Scoria : B.Rock;
      }
      default:
        return B.Sod;
    }
  }

  private decorate(chunk: Chunk) {
    const rng = new Rng(this.chunkSeed(chunk.cx, chunk.cz));
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const x = baseX + lx;
        const z = baseZ + lz;
        if (Math.hypot(x, z) < 26) continue;
        const h = this.surfaceHeight(x, z);
        if (h <= SEA_LEVEL) continue;
        const biome = this.biomeAt(x, z, h);
        const roll = rng.next();
        if (biome === 'grass' && roll < 0.06) this.placeTree(chunk, lx, h + 1, lz, rng);
        else if (biome === 'grass' && roll < 0.11) chunk.set(lx, h + 1, lz, B.ThornBramble);
        else if (biome === 'sand' && roll < 0.04) chunk.set(lx, h + 1, lz, B.Driftwood);
        else if ((biome === 'rock' || biome === 'highland') && roll < 0.05)
          chunk.set(lx, h + 1, lz, B.Gravel);
        else if (roll > 0.985) this.placeRuin(chunk, lx, h + 1, lz, rng);
      }
    }
  }

  private chunkSeed(cx: number, cz: number): number {
    const base = typeof this.seed === 'string' ? this.seed : String(this.seed);
    return Math.floor(new Rng(base + `:${cx}:${cz}`).next() * 1e9);
  }

  private placeTree(chunk: Chunk, lx: number, y: number, lz: number, rng: Rng) {
    const trunk = 3 + rng.int(0, 2);
    for (let i = 0; i < trunk; i++) chunk.set(lx, y + i, lz, B.DeadwoodLog);
  }

  private placeRuin(chunk: Chunk, lx: number, y: number, lz: number, rng: Rng) {
    const h = 1 + rng.int(0, 2);
    for (let i = 0; i < h; i++) chunk.set(lx, y + i, lz, B.RuinStone);
  }

  // Carve/build the three explorable sites plus the final ley arena.
  private stampSites(chunk: Chunk) {
    for (const site of SITES) {
      const scx = Math.floor(site.x / CHUNK_SIZE);
      const scz = Math.floor(site.z / CHUNK_SIZE);
      if (scx !== chunk.cx || scz !== chunk.cz) continue;
      const lx0 = site.x - scx * CHUNK_SIZE;
      const lz0 = site.z - scz * CHUNK_SIZE;
      if (site.kind === 'observatory') this.stampObservatory(chunk, lx0, lz0);
      else if (site.kind === 'geode') this.stampGeode(chunk, lx0, lz0);
      else if (site.kind === 'tower') this.stampTower(chunk, lx0, lz0);
      else this.stampLey(chunk, lx0, lz0);
    }
  }

  private stampObservatory(chunk: Chunk, lx: number, lz: number) {
    const h = this.surfaceHeight(chunk.cx * CHUNK_SIZE + lx, chunk.cz * CHUNK_SIZE + lz);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 1; dy <= 3; dy++) {
          const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (edge && dy < 3) chunk.set(lx + dx, h + dy, lz + dz, B.RuinStone);
          else if (edge && dy === 3 && (dx + dz) % 2 === 0) chunk.set(lx + dx, h + dy, lz + dz, B.GlassPane);
        }
      }
    }
    chunk.set(lx, h + 1, lz, B.Strongbox);
    const ck = keyOf(chunk.cx * CHUNK_SIZE + lx, h + 1, chunk.cz * CHUNK_SIZE + lz);
    if (!this.containers.has(ck)) {
      this.containers.set(ck, [
        { id: 'observatory_chart', count: 1 },
        { id: 'relic_token', count: 1 },
        { id: 'copper_scrap', count: 3 }
      ]);
    }
  }

  private stampGeode(chunk: Chunk, lx: number, lz: number) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dy = -6; dy <= -1; dy++) {
          const dist = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.7);
          if (dist < 2.6) chunk.set(lx + dx, SEA_LEVEL + dy, lz + dz, B.Air);
          else if (dist < 3.4) chunk.set(lx + dx, SEA_LEVEL + dy, lz + dz, B.CrystalLode);
        }
      }
    }
    // entrance shaft
    for (let dy = -5; dy <= 1; dy++) {
      chunk.set(lx + 4, SEA_LEVEL + dy, lz + 4, B.Air);
      chunk.set(lx + 5, SEA_LEVEL + dy, lz + 4, B.Air);
    }
    // reward strongbox deep in the geode
    const gy = SEA_LEVEL - 6;
    chunk.set(lx, gy + 1, lz, B.Strongbox);
    const ck = keyOf(chunk.cx * CHUNK_SIZE + lx, gy + 1, chunk.cz * CHUNK_SIZE + lz);
    if (!this.containers.has(ck)) {
      this.containers.set(ck, [
        { id: 'energy_crystal', count: 3 },
        { id: 'raw_crystal', count: 4 },
        { id: 'wraith_dust', count: 1 }
      ]);
    }
  }

  private stampTower(chunk: Chunk, lx: number, lz: number) {
    const h = this.surfaceHeight(chunk.cx * CHUNK_SIZE + lx, chunk.cz * CHUNK_SIZE + lz);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 7; dy++) {
          const edge = Math.max(Math.abs(dx), Math.abs(dz)) === 2;
          if (edge && dy % 3 !== 0) chunk.set(lx + dx, h + dy, lz + dz, B.RivetPlate);
        }
      }
    }
    // relay socket on top and a fragment box at base
    chunk.set(lx, h + 8, lz, B.RelayCore);
    chunk.set(lx + 1, h + 1, lz, B.Strongbox);
    const ck = keyOf(chunk.cx * CHUNK_SIZE + lx + 1, h + 1, chunk.cz * CHUNK_SIZE + lz);
    if (!this.containers.has(ck)) {
      this.containers.set(ck, [{ id: 'tower_fragment', count: 1 }, { id: 'iron_scrap', count: 4 }]);
    }
  }

  private stampLey(chunk: Chunk, lx: number, lz: number) {
    const h = this.surfaceHeight(chunk.cx * CHUNK_SIZE + lx, chunk.cz * CHUNK_SIZE + lz);
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (Math.hypot(dx, dz) < 3.4) {
          chunk.set(lx + dx, h + 1, lz + dz, B.RivetPlate);
        }
      }
    }
    chunk.set(lx, h + 2, lz, B.LeyCore);
    // conduits ring
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2;
      chunk.set(lx + Math.round(Math.cos(ang) * 2), h + 2, lz + Math.round(Math.sin(ang) * 2), B.EnergyConduit);
    }
  }

  // ---- block access / edits ----
  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return B.Air;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(World.chunkKey(cx, cz));
    if (!chunk) return this.getBlockUnloaded(x, y, z);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return chunk.get(lx, y, lz);
  }

  // Used for collision before a chunk is generated: falls back to terrain math.
  private getBlockUnloaded(x: number, y: number, z: number): number {
    const mod = this.modifications.get(keyOf(x, y, z));
    if (mod !== undefined) return mod;
    const h = this.surfaceHeight(x, z);
    if (y > h || y > SEA_LEVEL) return B.Air;
    if (y === h) {
      const id = this.surfaceBlock(this.biomeAt(x, z, h), x, z);
      return id;
    }
    if (y < h - 5) return this.oreAt(x, y, z) ?? B.DeepShale;
    return this.subsurface(this.biomeAt(x, z, h), x, y, z);
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    const id = this.getBlock(x, y, z);
    if (id === B.Air) return false;
    if (id === B.HatchDoor && this.doorOpen.has(keyOf(x, y, z))) return false;
    return true;
  }

  isWaterAt(x: number, y: number, z: number): boolean {
    const h = this.surfaceHeight(x, z);
    return y <= SEA_LEVEL && y > h && this.getBlock(x, y, z) === B.Air;
  }

  setBlock(x: number, y: number, z: number, id: number, opts: { record?: boolean; hp?: number } = {}) {
    if (y < 1 || y >= WORLD_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    chunk.set(lx, y, lz, id);
    if (opts.record !== false) {
      const k = keyOf(x, y, z);
      if (id === B.Air) this.modifications.delete(k);
      else this.modifications.set(k, id);
      if (id !== B.Air) {
        const defHp = opts.hp;
        if (defHp !== undefined) this.blockHp.set(k, defHp);
      } else {
        this.blockHp.delete(k);
      }
    }
    this.markNeighborDirty(x, y, z);
    return true;
  }

  private markNeighborDirty(x: number, y: number, z: number) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const here = this.chunks.get(World.chunkKey(cx, cz));
    if (here) here.dirty = true;
    if (lx === 0) this.chunks.get(World.chunkKey(cx - 1, cz)) && ((this.chunks.get(World.chunkKey(cx - 1, cz)) as Chunk).dirty = true);
    if (lx === CHUNK_SIZE - 1) this.chunks.get(World.chunkKey(cx + 1, cz)) && ((this.chunks.get(World.chunkKey(cx + 1, cz)) as Chunk).dirty = true);
    if (lz === 0) this.chunks.get(World.chunkKey(cx, cz - 1)) && ((this.chunks.get(World.chunkKey(cx, cz - 1)) as Chunk).dirty = true);
    if (lz === CHUNK_SIZE - 1) this.chunks.get(World.chunkKey(cx, cz + 1)) && ((this.chunks.get(World.chunkKey(cx, cz + 1)) as Chunk).dirty = true);
  }

  damageBlock(x: number, y: number, z: number, amount: number): boolean {
    const k = keyOf(x, y, z);
    const hp = this.blockHp.get(k);
    if (hp === undefined) return false;
    const next = hp - amount;
    if (next <= 0) {
      this.setBlock(x, y, z, B.Air);
      return true;
    }
    this.blockHp.set(k, next);
    return false;
  }

  toggleDoor(x: number, y: number, z: number): boolean {
    if (this.getBlock(x, y, z) !== B.HatchDoor) return false;
    const k = keyOf(x, y, z);
    if (this.doorOpen.has(k)) this.doorOpen.delete(k);
    else this.doorOpen.add(k);
    this.markNeighborDirty(x, y, z);
    return true;
  }

  spawnDrop(id: string, count: number, x: number, y: number, z: number, durability?: number, now = 0) {
    this.drops.push({ id, count, x, y: y + 0.4, z, vy: 2, born: now, durability });
  }

  toSaveData(): WorldSaveData {
    return {
      seed: this.seed,
      modifications: [...this.modifications.entries()],
      doors: [...this.doorOpen],
      damage: [...this.blockHp.entries()],
      containers: [...this.containers.entries()],
      drops: this.drops,
      depleted: [...this.depleted]
    };
  }

  static fromSaveData(data: WorldSaveData): World {
    const world = new World(data.seed);
    world.modifications = new Map(data.modifications);
    world.doorOpen = new Set(data.doors ?? []);
    world.blockHp = new Map(data.damage ?? []);
    world.containers = new Map((data.containers ?? []).map(([k, slots]) => [k, slots.map((s) => (s ? { ...s } : null))]));
    world.drops = data.drops ?? [];
    world.depleted = new Set(data.depleted ?? []);
    return world;
  }
}
