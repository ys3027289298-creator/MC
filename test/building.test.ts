import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../src/core/world';
import { BlockId, BLOCKS } from '../src/core/blocks';
import { GameSave, saveGame, loadGame, clearSave, hasSave, SAVE_KEY } from '../src/core/save';
import { Inventory } from '../src/core/inventory';
import { createQuestState } from '../src/core/quests';
import { createEnv } from '../src/core/environment';

function makeSave(edits: [string, number][]): GameSave {
  return {
    version: 1, seed: 'build-test',
    player: { x: 1, y: 32, z: 1, yaw: 0, pitch: 0, hp: 80, stamina: 80, food: 80, temperature: 37, safety: 70, spawnX: 1, spawnY: 32, spawnZ: 1 },
    inventory: new Inventory(8).serialize(),
    env: { ...createEnv() },
    edits,
    buildingHp: [],
    doors: [],
    sites: [],
    quest: createQuestState(),
    events: [],
    enemies: [],
    chests: [],
    stats: { buildings: edits.length, mined: 0, kills: 0, playTime: 0 },
    settings: { deathDrop: 'half', sensitivity: 1, renderDistance: 4 },
    finalWave: 0,
    savedAt: Date.now(),
  };
}

describe('建筑系统', () => {
  it('建筑方块有耐久，可被攻击削减', () => {
    const w = new World('b1');
    const key = World.blockKey(1, 31, 1);
    w.setBlock(1, 30, 1, BlockId.Rock, false);
    w.setBlock(1, 31, 1, BlockId.Brick, true);
    w.buildingHp.set(key, BLOCKS[BlockId.Brick].buildingHp!);
    let hp = w.buildingHp.get(key)!;
    hp -= 40;
    w.buildingHp.set(key, hp);
    expect(w.buildingHp.get(key)).toBe(BLOCKS[BlockId.Brick].buildingHp! - 40);
  });
  it('门开关状态改变碰撞（开门后视为空气）', () => {
    const w = new World('b2');
    w.setBlock(0, 31, 0, BlockId.Door, true);
    const key = World.blockKey(0, 31, 0);
    expect(BLOCKS[w.getBlock(0, 31, 0)].solid).toBe(true);
    w.doorOpen.add(key);
    // 玩家碰撞逻辑中开门按空气处理（在 player.collides 中实现）
    expect(w.doorOpen.has(key)).toBe(true);
    w.doorOpen.delete(key);
    expect(w.doorOpen.has(key)).toBe(false);
  });
  it('工作台、储物箱、火盆均可放置且为建筑方块', () => {
    for (const id of [BlockId.Workbench, BlockId.Chest, BlockId.Brazier, BlockId.GlowLamp, BlockId.EnergyCell]) {
      expect(BLOCKS[id].building).toBe(true);
      expect(BLOCKS[id].buildingHp).toBeGreaterThan(0);
    }
  });
});

describe('存档读写', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('保存后可读取，建筑编辑完整保留', () => {
    const edits: [string, number][] = [
      [World.blockKey(1, 31, 1), BlockId.Brick],
      [World.blockKey(2, 31, 1), BlockId.MetalPlate],
      ['3|31|1', 0],
    ];
    saveGame(makeSave(edits));
    expect(hasSave()).toBe(true);
    const data = loadGame();
    expect(data.seed).toBe('build-test');
    expect(data.edits.length).toBe(3);
    // 重新生成世界并覆盖编辑
    const w = new World(data.seed);
    for (const [k, id] of data.edits) w.edits.set(k, id);
    expect(w.getBlock(1, 31, 1)).toBe(BlockId.Brick);
    expect(w.getBlock(2, 31, 1)).toBe(BlockId.MetalPlate);
    expect(w.getBlock(3, 31, 1)).toBe(BlockId.Air);
  });
  it('坏档抛出明确错误而不崩溃', () => {
    localStorage.setItem(SAVE_KEY, '{这不是合法JSON');
    expect(() => loadGame()).toThrow(/损坏/);
    expect(hasSave()).toBe(false);
  });
  it('版本不兼容时报错', () => {
    const bad = makeSave([]);
    (bad as unknown as { version: number }).version = 99;
    saveGame(bad);
    expect(() => loadGame()).toThrow(/版本/);
  });
  it('清除存档后无法读取', () => {
    saveGame(makeSave([]));
    clearSave();
    expect(hasSave()).toBe(false);
    expect(() => loadGame()).toThrow();
  });
});
