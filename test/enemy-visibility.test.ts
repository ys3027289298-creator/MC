import { describe, it, expect } from 'vitest';
import { spawnEnemy, updateEnemy, hasLineOfSight, blocksSight, EnemyKind } from '../src/core/enemies';
import { World } from '../src/core/world';
import { BlockId } from '../src/core/blocks';
import { createPlayer, PlayerState } from '../src/core/player';

function arena(): World {
  const w = new World('vis-arena');
  for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) w.setBlock(x, 30, z, BlockId.Rock, false);
  return w;
}

function pair(kind: EnemyKind = 'duststalker', dist = 1.0) {
  const w = arena();
  const p = createPlayer(0.5 + dist, 31.02, 0.5);
  const e = spawnEnemy(kind, 0.5, 31.02, 0.5);
  return { w, p, e };
}

function wallBetween(w: World, x: number, id: BlockId = BlockId.Brick): void {
  for (let y = 31; y <= 34; y++) for (let dz = -2; dz <= 2; dz++) w.setBlock(x, y, dz, id, false);
}

function totalDamage(w: World, e: ReturnType<typeof spawnEnemy>, p: PlayerState, frames: number, dt = 0.05): number {
  let sum = 0;
  for (let i = 0; i < frames; i++) sum += updateEnemy(e, w, p, dt, false, 0).damageToPlayer;
  return sum;
}

describe('可见性是攻击前提（核心状态机）', () => {
  it('初始有视线时从巡逻进入追击', () => {
    const { w, p, e } = pair('duststalker', 5);
    expect(e.state).toBe('patrol');
    updateEnemy(e, w, p, 0.05, false, 0);
    expect(e.state).toBe('chase');
  });

  it('近距离有视线时进入攻击并造成伤害', () => {
    const { w, p, e } = pair('duststalker', 1.0);
    const r = updateEnemy(e, w, p, 0.05, false, 0);
    expect(e.state).toBe('attack');
    expect(r.damageToPlayer).toBe(e.damage);
  });

  it('攻击中玩家关门：视线被截断，立即停止伤害并退出攻击', () => {
    const { w, p, e } = pair('duststalker', 1.0);
    // 在两者之间放一扇打开的门，确认可攻击
    w.setBlock(1, 31, 0, BlockId.Door, false);
    w.setBlock(1, 32, 0, BlockId.Door, false);
    w.doorOpen.add(World.blockKey(1, 31, 0));
    w.doorOpen.add(World.blockKey(1, 32, 0));
    expect(hasLineOfSight(w, e, p)).toBe(true);
    expect(updateEnemy(e, w, p, 0.05, false, 0).damageToPlayer).toBeGreaterThan(0);
    // 关门
    w.doorOpen.delete(World.blockKey(1, 31, 0));
    w.doorOpen.delete(World.blockKey(1, 32, 0));
    expect(hasLineOfSight(w, e, p)).toBe(false);
    const r = updateEnemy(e, w, p, 0.05, false, 0);
    expect(r.damageToPlayer).toBe(0);
    expect(e.state).not.toBe('attack');
    expect(totalDamage(w, e, p, 40)).toBe(0);
  });

  it('攻击中放置砖墙：下一次更新不再结算伤害', () => {
    const { w, p, e } = pair('duststalker', 1.0);
    expect(updateEnemy(e, w, p, 0.05, false, 0).damageToPlayer).toBeGreaterThan(0);
    wallBetween(w, 1);
    const r = updateEnemy(e, w, p, 0.05, false, 0);
    expect(r.damageToPlayer).toBe(0);
    expect(e.state).not.toBe('attack');
  });

  it('玩家绕到砖墙后：敌人失去视线，不再造成伤害', () => {
    const w = arena();
    wallBetween(w, 0);
    const p = createPlayer(2.5, 31.02, 0.5);
    const e = spawnEnemy('duststalker', -2.5, 31.02, 0.5);
    // 先无墙追击
    const p2 = createPlayer(-1.0, 31.02, 0.5);
    updateEnemy(e, w, p2, 0.05, false, 0);
    expect(e.state).not.toBe('patrol');
    // 玩家绕到墙后
    const dmg = totalDamage(w, e, p, 60);
    expect(dmg).toBe(0);
    expect(e.state).not.toBe('attack');
  });

  it('重新打开门后重新获得视线，按冷却恢复攻击', () => {
    const { w, p, e } = pair('duststalker', 1.0);
    w.setBlock(1, 31, 0, BlockId.Door, false);
    w.setBlock(1, 32, 0, BlockId.Door, false);
    // 关门状态：无伤害
    expect(totalDamage(w, e, p, 10)).toBe(0);
    // 开门：恢复追击与攻击
    w.doorOpen.add(World.blockKey(1, 31, 0));
    w.doorOpen.add(World.blockKey(1, 32, 0));
    const dmg = totalDamage(w, e, p, 60);
    expect(dmg).toBeGreaterThan(0);
  });

  it('玩家瞬移到远处：敌人放弃目标返回，最终回到巡逻', () => {
    const { w, p, e } = pair('duststalker', 3);
    for (let i = 0; i < 5; i++) updateEnemy(e, w, p, 0.05, false, 0);
    expect(e.state).toBe('chase');
    p.x = 80; p.z = 80;
    for (let i = 0; i < 200; i++) updateEnemy(e, w, p, 0.05, false, 0);
    expect(['return', 'patrol']).toContain(e.state);
  });

  it('玩家死亡后不再受伤且敌人退出攻击，复活后可重新被追击', () => {
    const { w, p, e } = pair('duststalker', 1.0);
    updateEnemy(e, w, p, 0.05, false, 0);
    expect(e.state).toBe('attack');
    p.alive = false;
    const r = updateEnemy(e, w, p, 0.05, false, 0);
    expect(r.damageToPlayer).toBe(0);
    expect(e.state).not.toBe('attack');
    expect(totalDamage(w, e, p, 20)).toBe(0);
    // 复活
    p.alive = true;
    p.hp = 80;
    e.attackCd = 0;
    const dmg = totalDamage(w, e, p, 10);
    expect(dmg).toBeGreaterThan(0);
  });

  it('攻击冷却边界：一次跨过冷却只结算一次', () => {
    const { w, p, e } = pair('duststalker', 1.0);
    updateEnemy(e, w, p, 0.05, false, 0); // 进入攻击并首次结算
    e.attackCd = 0.05;
    const r1 = updateEnemy(e, w, p, 0.1, false, 0); // 跨过冷却边界
    expect(r1.damageToPlayer).toBe(e.damage);
    for (let i = 0; i < 12; i++) expect(updateEnemy(e, w, p, 0.1, false, 0).damageToPlayer).toBe(0);
    expect(updateEnemy(e, w, p, 0.1, false, 0).damageToPlayer).toBe(e.damage);
  });

  it('dt 为 0 时不重复结算伤害', () => {
    const { w, p, e } = pair('duststalker', 1.0);
    const r1 = updateEnemy(e, w, p, 0, false, 0);
    expect(r1.damageToPlayer).toBe(e.damage);
    for (let i = 0; i < 10; i++) {
      expect(updateEnemy(e, w, p, 0, false, 0).damageToPlayer).toBe(0);
    }
  });

  it('三种敌人都遵守“可见才可攻击”规则', () => {
    const kinds: EnemyKind[] = ['duststalker', 'cavemaw', 'ruinsentinel'];
    for (const kind of kinds) {
      const { w, p, e } = pair(kind, 1.0);
      // 有视线：可以攻击
      expect(updateEnemy(e, w, p, 0.05, false, 0).damageToPlayer).toBe(e.damage);
      // 被墙挡住：立即不能攻击
      wallBetween(w, 1);
      e.attackCd = 0;
      e.state = 'attack';
      const r = updateEnemy(e, w, p, 0.05, false, 0);
      expect(r.damageToPlayer).toBe(0);
      expect(e.state).not.toBe('attack');
    }
  });

  it('失去视线后记忆耗尽即返回，不会永远锁定玩家', () => {
    const w = arena();
    wallBetween(w, 0);
    const p = createPlayer(2.5, 31.02, 0.5);
    const e = spawnEnemy('duststalker', -2.5, 31.02, 0.5);
    e.state = 'chase';
    e.memory = 0.2;
    for (let i = 0; i < 40; i++) updateEnemy(e, w, p, 0.05, false, 0);
    expect(['return', 'patrol']).toContain(e.state);
  });
});

describe('视线检测与材质语义', () => {
  it('透明/非实心材质不遮挡视线（回归）', () => {
    for (const id of [BlockId.Glass, BlockId.Leaves, BlockId.ShallowWater, BlockId.DeepWater, BlockId.FiberPlant]) {
      expect(blocksSight(id)).toBe(false);
      const { w, p, e } = pair('duststalker', 4);
      wallBetween(w, 2, id);
      expect(hasLineOfSight(w, e, p)).toBe(true);
    }
  });

  it('实体方块遮挡视线，打开的门视为可通过', () => {
    for (const id of [BlockId.Brick, BlockId.Rock, BlockId.Plank, BlockId.MetalPlate]) {
      expect(blocksSight(id)).toBe(true);
      const { w, p, e } = pair('duststalker', 4);
      wallBetween(w, 2, id);
      expect(hasLineOfSight(w, e, p)).toBe(false);
    }
    // 门：关闭遮挡，打开不遮挡
    const { w, p, e } = pair('duststalker', 4);
    wallBetween(w, 2, BlockId.Door);
    expect(hasLineOfSight(w, e, p)).toBe(false);
    for (let y = 31; y <= 34; y++) for (let dz = -2; dz <= 2; dz++) w.doorOpen.add(World.blockKey(2, y, dz));
    expect(hasLineOfSight(w, e, p)).toBe(true);
  });
});
