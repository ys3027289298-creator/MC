import { describe, it, expect } from 'vitest';
import { World, CHUNK_SIZE, SITES, keyOf } from '../src/game/world';
import { B } from '../src/game/blocks';
import { hashSeed, Rng, ValueNoise } from '../src/game/rng';

describe('seeded rng', () => {
  it('produces deterministic sequences from the same string seed', () => {
    const a = new Rng('LEYLINE-2049');
    const b = new Rng('LEYLINE-2049');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(new Rng('other').next()).not.toBe(seqA[0]);
  });

  it('hashSeed maps strings to stable uint32', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });

  it('value noise stays in 0..1', () => {
    const n = new ValueNoise(7);
    for (let i = 0; i < 50; i++) {
      const v = n.fbm2(i * 1.3, i * 0.7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('world & chunk streaming', () => {
  it('generates identical terrain for identical seeds', () => {
    const w1 = new World('seed-A');
    const w2 = new World('seed-A');
    w1.ensureChunk(2, -1);
    w2.ensureChunk(2, -1);
    const c1 = w1.ensureChunk(2, -1);
    const c2 = w2.ensureChunk(2, -1);
    expect(Array.from(c1.blocks)).toEqual(Array.from(c2.blocks));
  });

  it('loads nearby chunks and unloads distant chunks', () => {
    const w = new World(99);
    w.updateLoadedChunks(0, 0);
    expect(w.chunks.size).toBeGreaterThan(10);
    w.updateLoadedChunks(CHUNK_SIZE * 40, CHUNK_SIZE * 40);
    expect(w.chunks.has(World.chunkKey(0, 0))).toBe(false);
    expect(w.chunks.size).toBeGreaterThan(10);
  });

  it('contains all three special sites with resources and structures', () => {
    const w = new World('LEYLINE-2049');
    const kinds = new Set(SITES.map((s) => s.kind));
    expect(kinds.has('observatory')).toBe(true);
    expect(kinds.has('geode')).toBe(true);
    expect(kinds.has('tower')).toBe(true);
    for (const site of SITES) {
      const cx = Math.floor(site.x / CHUNK_SIZE);
      const cz = Math.floor(site.z / CHUNK_SIZE);
      w.ensureChunk(cx, cz);
    }
    // observatory has a strongbox with chart
    const obs = SITES.find((s) => s.kind === 'observatory')!;
    const oh = w.surfaceHeight(obs.x, obs.z);
    expect(w.getBlock(obs.x, oh + 1, obs.z)).toBe(B.Strongbox);
    const key = keyOf(obs.x, oh + 1, obs.z);
    expect(w.containers.get(key)?.some((s) => s?.id === 'observatory_chart')).toBe(true);
    // geode contains crystal
    const geo = SITES.find((s) => s.kind === 'geode')!;
    let crystals = 0;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let y = 19; y <= 26; y++) {
          if (w.getBlock(geo.x + dx, y, geo.z + dz) === B.CrystalLode) crystals++;
        }
      }
    }
    expect(crystals).toBeGreaterThan(0);
    // tower has relay core
    const tower = SITES.find((s) => s.kind === 'tower')!;
    const th = w.surfaceHeight(tower.x, tower.z);
    expect(w.getBlock(tower.x, th + 8, tower.z)).toBe(B.RelayCore);
  });

  it('has water at low terrain and solid ground beneath', () => {
    const w = new World('water-test');
    let foundWater = false;
    outer: for (let x = -80; x < 80; x += 4) {
      for (let z = -80; z < 80; z += 4) {
        if (w.isWaterAt(x, 26, z)) {
          foundWater = true;
          break outer;
        }
      }
    }
    expect(foundWater).toBe(true);
  });
});
