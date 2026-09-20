import { describe, it, expect } from 'vitest';
import { World, CHUNK_SIZE, WORLD_HEIGHT } from '../src/core/world';
import { BlockId } from '../src/core/blocks';
import { hashSeed, Rng, ValueNoise } from '../src/core/rng';

describe('种子随机数', () => {
  it('相同种子产生相同序列', () => {
    const a = new Rng('WASTELAND-7');
    const b = new Rng('WASTELAND-7');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('不同种子序列不同', () => {
    const a = new Rng('seed-a');
    const b = new Rng('seed-b');
    expect(a.next()).not.toBe(b.next());
  });
  it('字符串哈希为正整数', () => {
    expect(hashSeed('abc')).toBeGreaterThan(0);
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
  });
  it('噪声在 0..1 范围内且确定性一致', () => {
    const n1 = new ValueNoise(123);
    const n2 = new ValueNoise(123);
    for (let i = 0; i < 50; i++) {
      const v = n1.noise3(i * 0.3, i * 0.11, i * 0.7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBe(n2.noise3(i * 0.3, i * 0.11, i * 0.7));
    }
  });
});

describe('区块生成与加载', () => {
  it('固定种子生成一致的世界高度', () => {
    const w1 = new World('WASTELAND-7');
    const w2 = new World('WASTELAND-7');
    for (const [x, z] of [[0, 0], [15, -12], [40, 33], [-18, 77]] as const) {
      expect(w1.heightAt(x, z)).toBe(w2.heightAt(x, z));
    }
  });
  it('区块大小与高度正确', () => {
    const w = new World('s1');
    const c = w.getChunk(0, 0);
    expect(c.blocks.length).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  });
  it('基岩底层为岩石，顶层有空气', () => {
    const w = new World('s2');
    w.getChunk(0, 0);
    expect(w.getBlock(8, 0, 8)).toBe(BlockId.Rock);
    expect(w.getBlock(8, WORLD_HEIGHT - 1, 8)).toBe(BlockId.Air);
  });
  it('区块按需加载，远离后卸载', () => {
    const w = new World('s3');
    w.getChunk(0, 0);
    expect(w.hasChunk(0, 0)).toBe(true);
    w.getChunk(10, 10);
    const removed = w.unloadFar(10 * 16 + 8, 10 * 16 + 8, 2);
    expect(removed).toBeGreaterThan(0);
    expect(w.hasChunk(0, 0)).toBe(false);
  });
  it('卸载后重建结果一致（编辑保持）', () => {
    const w = new World('s4');
    w.getChunk(0, 0);
    const before = w.getBlock(3, 5, 3);
    w.setBlock(3, 30, 3, BlockId.MetalPlate);
    w.unloadFar(1000, 1000, 0);
    w.getChunk(0, 0);
    expect(w.getBlock(3, 5, 3)).toBe(before);
    expect(w.getBlock(3, 30, 3)).toBe(BlockId.MetalPlate);
  });
  it('生成三种以上特殊地点', () => {
    const w = new World('s5');
    const kinds = new Set(w.sites.map((s) => s.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
  it('晶洞包含空腔与晶体矿', () => {
    const w = new World('s6');
    const geo = w.sites.find((s) => s.kind === 'geode')!;
    const chunk = w.getChunk(geo.cx, geo.cz);
    let foundOre = false, foundAir = false;
    for (let y = 8; y < 16; y++) for (let x = 4; x < 12; x++) for (let z = 4; z < 12; z++) {
      const id = chunk.get(x, y, z);
      if (id === BlockId.CrystalOre) foundOre = true;
      if (id === BlockId.Air) foundAir = true;
    }
    expect(foundOre).toBe(true);
    expect(foundAir).toBe(true);
  });
});
