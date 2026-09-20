import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/core/inventory';
import { World } from '../src/core/world';
import { BlockId, BLOCKS } from '../src/core/blocks';
import { createPlayer, blockOverlapsPlayer, PLAYER_HEIGHT_STAND } from '../src/core/player';

describe('背包堆叠/容量/拆分/丢弃', () => {
  it('相同物品堆叠到最大数量', () => {
    const inv = new Inventory(24);
    expect(inv.add('wood', 5)).toBe(0);
    expect(inv.countOf('wood')).toBe(5);
    expect(inv.usedSlots()).toBe(1);
    inv.add('wood', 100);
    expect(inv.countOf('wood')).toBe(105);
    expect(inv.usedSlots()).toBe(2);
  });
  it('不同物品不混合', () => {
    const inv = new Inventory(24);
    inv.add('wood', 3);
    inv.add('rock', 3);
    expect(inv.usedSlots()).toBe(2);
  });
  it('背包满时无法继续拾取', () => {
    const inv = new Inventory(2);
    inv.add('wood', 1);
    inv.add('rock', 1);
    const left = inv.add('sand', 5);
    expect(left).toBe(5);
  });
  it('工具不可堆叠且独立占格', () => {
    const inv = new Inventory(8);
    inv.add('hammer_t1', 1);
    inv.add('hammer_t1', 1);
    expect(inv.usedSlots()).toBe(2);
  });
  it('拆分一堆为一半到新格', () => {
    const inv = new Inventory(8);
    inv.add('wood', 10);
    const newIdx = inv.split(0);
    expect(newIdx).toBeGreaterThanOrEqual(0);
    expect(inv.slots[0]!.count).toBe(5);
    expect(inv.slots[newIdx]!.count).toBe(5);
  });
  it('拆分在背包满时失败', () => {
    const inv = new Inventory(1);
    inv.add('wood', 10);
    expect(inv.split(0)).toBe(-1);
  });
  it('丢弃（dropAll）清空槽位', () => {
    const inv = new Inventory(8);
    inv.add('wood', 4);
    const dropped = inv.dropAll(0);
    expect(dropped!.count).toBe(4);
    expect(inv.slots[0]).toBeNull();
  });
  it('材料检查与支付', () => {
    const inv = new Inventory(8);
    inv.add('wood', 2);
    expect(inv.hasMaterials({ wood: 3 })).toBe(false);
    expect(inv.pay({ wood: 3 })).toBe(false);
    inv.add('wood', 1);
    expect(inv.pay({ wood: 3 })).toBe(true);
    expect(inv.countOf('wood')).toBe(0);
  });
});

describe('方块放置与破坏（逻辑层）', () => {
  it('只能在空气位置放置，不能放进玩家身体', () => {
    const w = new World('place');
    const p = createPlayer(0.5, 31, 0.5);
    // 放置支撑
    w.setBlock(0, 30, 0, BlockId.Rock, false);
    expect(blockOverlapsPlayer(p, 0, 31, 0, PLAYER_HEIGHT_STAND)).toBe(true);
    w.setBlock(2, 30, 2, BlockId.Rock, false);
    expect(blockOverlapsPlayer(p, 2, 31, 2, PLAYER_HEIGHT_STAND)).toBe(false);
    w.setBlock(2, 31, 2, BlockId.Plank, true);
    expect(w.getBlock(2, 31, 2)).toBe(BlockId.Plank);
    expect(w.edits.has(World.blockKey(2, 31, 2))).toBe(true);
  });
  it('破坏方块后变为空气且编辑被记录', () => {
    const w = new World('break');
    w.getChunk(0, 0);
    const y = w.topSolidY(3, 3);
    const before = w.getBlock(3, y, 3);
    expect(before).not.toBe(BlockId.Air);
    w.setBlock(3, y, 3, BlockId.Air, true);
    expect(w.getBlock(3, y, 3)).toBe(BlockId.Air);
    expect(w.edits.get(World.blockKey(3, y, 3))).toBe(BlockId.Air);
  });
  it('方块掉落表包含对应资源', () => {
    expect(BLOCKS[BlockId.Wood].drop).toBe('wood');
    expect(BLOCKS[BlockId.OreDeep].drop).toBe('ore');
    expect(BLOCKS[BlockId.CrystalOre].drop).toBe('crystal');
  });
  it('不同方块硬度与工具需求不同', () => {
    expect(BLOCKS[BlockId.FiberPlant].hardness).toBeLessThan(BLOCKS[BlockId.OreDeep].hardness);
    expect(BLOCKS[BlockId.Wood].tool).toBe('axe');
    expect(BLOCKS[BlockId.OreDeep].tool).toBe('drill');
  });
});
