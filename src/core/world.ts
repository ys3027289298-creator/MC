import { BlockId } from './blocks';
import { Rng, ValueNoise, hashSeed } from './rng';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const SEA_LEVEL = 20;

export type Biome = 'grass' | 'rock' | 'sand' | 'highland' | 'water' | 'peak';

export interface SpecialSite {
  kind: 'observatory' | 'geode' | 'tower' | 'core';
  cx: number; cz: number;
  x: number; y: number; z: number;
  looted: boolean;
  repaired?: boolean;
  active?: boolean;
}

export interface DroppedItemEntity {
  id: string; count: number; x: number; y: number; z: number; born: number;
}

export function defaultSites(seedStr: string): SpecialSite[] {
  const rng = new Rng(hashSeed(seedStr) ^ 0x517e5);
  const ring = (dist: number) => {
    const ang = rng.range(0, Math.PI * 2);
    return { cx: Math.round(Math.cos(ang) * dist), cz: Math.round(Math.sin(ang) * dist) };
  };
  const tower = ring(5), geo = ring(8), obs = ring(11), core = ring(14);
  return [
    { kind: 'tower', cx: tower.cx, cz: tower.cz, x: tower.cx * 16 + 8, y: 0, z: tower.cz * 16 + 8, looted: false },
    { kind: 'geode', cx: geo.cx, cz: geo.cz, x: geo.cx * 16 + 8, y: 12, z: geo.cz * 16 + 8, looted: false },
    { kind: 'observatory', cx: obs.cx, cz: obs.cz, x: obs.cx * 16 + 8, y: 0, z: obs.cz * 16 + 8, looted: false },
    { kind: 'core', cx: core.cx, cz: core.cz, x: core.cx * 16 + 8, y: 0, z: core.cz * 16 + 8, looted: false },
  ];
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
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
    return this.blocks[this.index(lx, y, lz)];
  }
  set(lx: number, y: number, lz: number, id: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[this.index(lx, y, lz)] = id;
    this.dirty = true;
  }
}

export class World {
  chunks = new Map<string, Chunk>();
  noise: ValueNoise;
  caveNoise: ValueNoise;
  oreNoise: ValueNoise;
  rng: Rng;
  sites: SpecialSite[];
  edits = new Map<string, number>();
  buildingHp = new Map<string, number>();
  doorOpen = new Set<string>();
  depleted = new Set<string>();

  constructor(public seed: string) {
    const h = hashSeed(seed);
    this.noise = new ValueNoise(h);
    this.caveNoise = new ValueNoise(h ^ 0x9e3779b9);
    this.oreNoise = new ValueNoise(h ^ 0x85ebca6b);
    this.rng = new Rng(h ^ 0xdeadbeef);
    this.sites = defaultSites(seed);
  }

  static key(cx: number, cz: number): string { return cx + ',' + cz; }
  static blockKey(x: number, y: number, z: number): string { return x + '|' + y + '|' + z; }

  heightAt(wx: number, wz: number): number {
    const continent = this.noise.fbm3(wx * 0.008, 0, wz * 0.008, 3);
    const hills = this.noise.fbm3(wx * 0.035, 10, wz * 0.035, 4);
    const ridge = this.noise.fbm3(wx * 0.012, 20, wz * 0.012, 3);
    let h = SEA_LEVEL + 2 + (continent - 0.5) * 26 + (hills - 0.5) * 12;
    if (ridge > 0.66) h += (ridge - 0.66) * 70;
    return Math.max(3, Math.min(WORLD_HEIGHT - 8, Math.round(h)));
  }

  biomeAt(wx: number, wz: number, h: number): Biome {
    const moist = this.noise.fbm3(wx * 0.01 + 100, 0, wz * 0.01 + 100, 2);
    if (h >= 38) return 'peak';
    if (h >= 30) return 'highland';
    if (h < SEA_LEVEL - 2) return 'water';
    if (moist < 0.4) return 'sand';
    if (moist > 0.62) return 'rock';
    return 'grass';
  }

  getChunk(cx: number, cz: number): Chunk {
    const key = World.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.generate(chunk);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(World.key(cx, cz));
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return BlockId.Air;
    const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
    const lx = wx - cx * CHUNK_SIZE, lz = wz - cz * CHUNK_SIZE;
    return this.getChunk(cx, cz).get(lx, wy, lz);
  }

  setBlock(wx: number, wy: number, wz: number, id: number, trackEdit = true): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
    const lx = wx - cx * CHUNK_SIZE, lz = wz - cz * CHUNK_SIZE;
    this.getChunk(cx, cz).set(lx, wy, lz, id);
    if (trackEdit) this.edits.set(World.blockKey(wx, wy, wz), id);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number): void {
    const c = this.chunks.get(World.key(cx, cz));
    if (c) c.dirty = true;
  }

  private setGen(chunk: Chunk, lx: number, y: number, lz: number, id: number): void {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    chunk.blocks[chunk.index(lx, y, lz)] = id;
  }

  private generate(chunk: Chunk): void {
    const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx, wz = baseZ + lz;
        const h = this.heightAt(wx, wz);
        const biome = this.biomeAt(wx, wz, h);
        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          let id: number = BlockId.Air;
          if (y <= h) {
            if (y === 0) id = BlockId.Rock;
            else if (biome === 'peak') id = y > h - 3 ? BlockId.SnowPeak : BlockId.Highland;
            else if (biome === 'highland') id = y > h - 3 ? BlockId.Highland : BlockId.Rock;
            else if (y > h - 4) id = biome === 'sand' ? BlockId.Sand : biome === 'rock' ? BlockId.Rock : y === h ? BlockId.Turf : BlockId.Dirt;
            else id = BlockId.Rock;
            const oreN = this.oreNoise.noise3(wx * 0.12, y * 0.12, wz * 0.12);
            if (y < h - 4 && oreN > 0.82 && y < 24) id = BlockId.OreDeep;
            else if (y < h - 3 && oreN > 0.80 && y >= 24) id = BlockId.OreScrap;
            const cave = this.caveNoise.fbm3(wx * 0.09, y * 0.11, wz * 0.09, 3);
            if (y < h - 2 && y > 3 && cave > 0.68) id = BlockId.Air;
          } else if (y <= SEA_LEVEL) {
            id = h < SEA_LEVEL - 2 ? BlockId.DeepWater : BlockId.ShallowWater;
          }
          if (id !== BlockId.Air) this.setGen(chunk, lx, y, lz, id);
        }
      }
    }
    this.populate(chunk);
    this.applySites(chunk);
    this.applyEdits(chunk);
    chunk.dirty = true;
  }

  private populate(chunk: Chunk): void {
    const rng = new Rng(hashSeed(this.seed + ':' + chunk.cx + ':' + chunk.cz));
    for (let i = 0; i < 14; i++) {
      const lx = rng.int(1, 14), lz = rng.int(1, 14);
      const wx = chunk.cx * CHUNK_SIZE + lx, wz = chunk.cz * CHUNK_SIZE + lz;
      const h = this.surfaceY(chunk, lx, lz);
      if (h < 0) continue;
      const biome = this.biomeAt(wx, wz, h);
      const r = rng.next();
      if (biome === 'grass' && r < 0.3) {
        const trunk = rng.int(3, 5);
        for (let t = 1; t <= trunk; t++) this.setGen(chunk, lx, h + t, lz, BlockId.Wood);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = trunk; dy <= trunk + 2; dy++) {
          if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - trunk - 1) > 3) continue;
          const x = lx + dx, z = lz + dz, y = h + dy;
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && chunk.get(x, y, z) === BlockId.Air) this.setGen(chunk, x, y, z, BlockId.Leaves);
        }
      } else if (biome === 'grass' && r < 0.5) {
        this.setGen(chunk, lx, h + 1, lz, BlockId.FiberPlant);
      } else if ((biome === 'rock' || biome === 'highland') && r < 0.4) {
        this.setGen(chunk, lx, h + 1, lz, BlockId.Gravel);
      } else if (biome === 'sand' && r < 0.18) {
        this.setGen(chunk, lx, h + 1, lz, BlockId.FiberPlant);
      } else if (r < 0.1) {
        this.setGen(chunk, lx, h + 1, lz, BlockId.Rubble);
        if (lx + 1 < 15 && rng.chance(0.5)) this.setGen(chunk, lx + 1, h + 1, lz, BlockId.RuinMetal);
      }
    }
  }

  surfaceYInChunk(chunk: Chunk, lx: number, lz: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = chunk.get(lx, y, lz);
      if (id !== BlockId.Air && id !== BlockId.ShallowWater && id !== BlockId.DeepWater && id !== BlockId.Leaves) return y;
    }
    return -1;
  }
  private surfaceY(chunk: Chunk, lx: number, lz: number): number {
    return this.surfaceYInChunk(chunk, lx, lz);
  }

  topSolidY(wx: number, wz: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(wx, y, wz);
      if (id !== BlockId.Air && id !== BlockId.ShallowWater && id !== BlockId.DeepWater && id !== BlockId.FiberPlant && id !== BlockId.Leaves) return y;
    }
    return 0;
  }

  private applySites(chunk: Chunk): void {
    for (const site of this.sites) {
      if (site.cx !== chunk.cx || site.cz !== chunk.cz) continue;
      const lx = site.x - chunk.cx * CHUNK_SIZE, lz = site.z - chunk.cz * CHUNK_SIZE;
      if (site.kind === 'geode') {
        for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const x = lx + dx, y = site.y + dy, z = lz + dz;
          if (x < 0 || x >= 16 || z < 0 || z >= 16 || y < 1 || y >= WORLD_HEIGHT) continue;
          if (d < 2.2) this.setGen(chunk, x, y, z, BlockId.Air);
          else if (d < 3.2) this.setGen(chunk, x, y, z, BlockId.CrystalOre);
        }
        this.setGen(chunk, lx, site.y, lz, BlockId.Crystal);
      } else {
        const h = Math.max(0, this.surfaceY(chunk, Math.min(15, Math.max(0, lx)), Math.min(15, Math.max(0, lz))));
        const mat = site.kind === 'tower' ? BlockId.TowerPart : site.kind === 'observatory' ? BlockId.Observatory : BlockId.CoreBlock;
        if (site.kind === 'tower') {
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.setGen(chunk, lx + dx, h + 1, lz + dz, mat);
          for (let dy = 2; dy <= 5; dy++) { this.setGen(chunk, lx, h + dy, lz, mat); this.setGen(chunk, lx + 1, h + dy, lz, mat); }
          this.setGen(chunk, lx, h + 6, lz, BlockId.EnergyCell);
        } else if (site.kind === 'observatory') {
          for (let dy = 0; dy <= 2; dy++) this.setGen(chunk, lx, h + 1 + dy, lz, mat);
          this.setGen(chunk, lx + 1, h + 1, lz, BlockId.Glass);
          this.setGen(chunk, lx, h + 3, lz, BlockId.RuinMetal);
          this.setGen(chunk, lx - 1, h + 1, lz, BlockId.Chest);
        } else {
          for (let dy = 0; dy <= 1; dy++) this.setGen(chunk, lx, h + 1 + dy, lz, mat);
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) === 2 || Math.abs(dz) === 2) this.setGen(chunk, lx + dx, h + 1, lz + dz, BlockId.MetalPlate);
          }
        }
      }
    }
  }

  private applyEdits(chunk: Chunk): void {
    if (this.edits.size === 0) return;
    const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
    for (const [key, id] of this.edits) {
      const parts = key.split('|');
      const x = Number(parts[0]), y = Number(parts[1]), z = Number(parts[2]);
      if (x >= baseX && x < baseX + CHUNK_SIZE && z >= baseZ && z < baseZ + CHUNK_SIZE) {
        chunk.blocks[chunk.index(x - baseX, y, z - baseZ)] = id;
      }
    }
  }

  // 卸载远离玩家的区块（保留 edits/buildingHp，数据可重建）
  unloadFar(px: number, pz: number, radius: number): number {
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);
    let removed = 0;
    for (const [key, chunk] of this.chunks) {
      if (Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz)) > radius) {
        this.chunks.delete(key);
        removed++;
      }
    }
    return removed;
  }

  loadedChunks(): Chunk[] {
    return [...this.chunks.values()];
  }

  findSite(kind: SpecialSite['kind']): SpecialSite | undefined {
    return this.sites.find((s) => s.kind === kind);
  }
}
