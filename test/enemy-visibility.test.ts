import { describe, it, expect } from 'vitest';
import { spawnEnemy, updateEnemy, hasLineOfSight, ENEMY_DEFS, EnemyKind } from '../src/core/enemies';
import { World } from '../src/core/world';
import { BlockId } from '../src/core/blocks';
import { createPlayer, PlayerState } from '../src/core/player';

// 平整竞技场：y=30 为地面，实体站在 y=31.02，视线高度采样在 y=32
function arena(): World {
  const w = new World('enemy-arena');
  for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) w.setBlock(x, 30, z, BlockId.Rock, false);
  return w;
}

function wallAt(w: World, x: number, z: number, id: BlockId = BlockId.Brick): void {
  w.setBlock(x, 31, z, id, false);
  w.setBlock(x, 32, z, id, false);
}

function closePair(): { w: World; p: PlayerState; e: ReturnType<typeof spawnEnemy> } {
  const w = arena();
  const p = createPlayer(1.9, 31.02, 0.5);
  const e = spawnEnemy('duststalker', 0.5, 31.02, 0.5);
  return { w, p, e };
}

function run(e: ReturnType<typeof spawnEnemy>, w: World, p: PlayerState, frames: number, dt = 0.05): number {
  let dmg = 0;
  for (let i = 0; i < frames; i++) dmg += updateEnemy(e, w, p, dt, false, 0).damageToPlayer;
  return dmg;
}

describe('可见性是攻击前提', () => {
  it('初始巡逻，获得视线后进入追击', () => {
    const w = arena();
    const p = createPlayer(5.5, 31.02, 0.5);
    const e = spawnEnemy('duststalker', 0.5, 31.02, 0.5);
    expect(e.state).toBe('patrol');
    updateEnemy(e, w, p, 0.05, false, 0);
    expect(e.state).toBe('chase');
  });

  it('近距离进入攻击并造成伤害', () => {
    const { w, p, e } = closePair();
    const r = updateEnemy(e, w, p, 0.05, false, 0);
    expect(e.state).toBe('attack');
    expect(r.damageToPlayer).toBe(ENEMY_DEFS.duststalker.damage);
  });

  it('攻击中关闭门：伤害立即停止并退出攻击状态', () => {
    const { w, p, e } = closePair();
    wallAt(w, 1, 0, BlockId.Door);
    const key1 = World.blockKey(1, 31, 0), key2 = World.blockKey(1, 32, 0);
    w.doorOpen.add(key1); w.doorOpen.add(key2); // 门打开：可通行可视线
    expect(run(e, w, p, 1)).toBeGreaterThan(0);
    expect(e.state).toBe('attack');
    w.doorOpen.delete(key1); w.doorOpen.delete(key2); // 玩家当面关门
    const r = updateEnemy(e, w, p, 0.05, false, 0);
    expect(r.damageToPlayer).toBe(0);
    expect(e.state).not.toBe('attack');
    // 冷却结束后关门状态下依然不能结算伤害
    expect(run(e, w, p, 40)).toBe(0);
  });

  it('攻击中放置砖墙：视线被截断，不能再命中', () => {
    const { w, p, e } = closePair();
    expect(run(e, w, p, 1)).toBeGreaterThan(0);
    wallAt(w, 1, 0, BlockId.Brick);
    e.attackCd = 0; // 即使冷却已就绪
    const r = updateEnemy(e, w, p, 0.05, false, 0);
    expect(r.damageToPlayer).toBe(0);
    expect(e.state).toBe('chase'); // 距离仍近：转为追击而非锁定旧状态
    expect(run(e, w, p, 40)).toBe(0);
  });

  it('玩家绕到墙后：敌人丢失目标且不造成任何伤害', () => {
    const w = arena();
    for (let y = 31; y <= 34; y++) for (let dz = -3; dz <= 3; dz++) w.setBlock(0, y, dz, BlockId.Brick, false);
    const p = createPlayer(2.5, 31.02, 0.5);
    const e = spawnEnemy('duststalker', -2.5, 31.02, 0.5);
    e.state = 'attack'; // 残留的 attack 状态也必须被纠正
    expect(run(e, w, p, 60)).toBe(0);
    expect(e.state).not.toBe('attack');
    expect(e.x).toBeLessThan(-0.3); // 没有穿墙
  });

  it('重新打开门后恢复追击与攻击（冷却仍生效）', () => {
    const { w, p, e } = closePair();
    wallAt(w, 1, 0, BlockId.Door);
    const key1 = World.blockKey(1, 31, 0), key2 = World.blockKey(1, 32, 0);
    expect(run(e, w, p, 30)).toBe(0); // 门关着：无伤害
    w.doorOpen.add(key1); w.doorOpen.add(key2);
    expect(run(e, w, p, 30)).toBeGreaterThan(0); // 开门后重新获得目标
    expect(['chase', 'attack']).toContain(e.state);
  });

  it('玩家瞬移到远处：敌人脱离攻击并返回，不再结算伤害', () => {
    const { w, p, e } = closePair();
    run(e, w, p, 1);
    expect(e.state).toBe('attack');
    p.x = 60; p.z = 60;
    const r = updateEnemy(e, w, p, 0.05, false, 0);
    expect(r.damageToPlayer).toBe(0);
    run(e, w, p, 80);
    expect(['return', 'patrol']).toContain(e.state);
  });

  it('玩家死亡：攻击意图立即失效；复活后可重新被锁定', () => {
    const { w, p, e } = closePair();
    run(e, w, p, 1);
    expect(e.state).toBe('attack');
    p.alive = false;
    const r = updateEnemy(e, w, p, 0.05, false, 0);
    expect(r.damageToPlayer).toBe(0);
    expect(['return', 'patrol']).toContain(e.state); // 敌人出生在 home 附近，可能直接回到巡逻
    expect(run(e, w, p, 30)).toBe(0);
    p.alive = true; // 复活（仍在原地）
    run(e, w, p, 5);
    expect(['chase', 'attack']).toContain(e.state);
  });

  it('攻击冷却边界：跨过冷却只结算一次', () => {
    const { w, p, e } = closePair();
    let hits = 0;
    for (let i = 0; i < 30; i++) { // 1.5s，冷却 1.2s，应恰好命中 2 次
      if (updateEnemy(e, w, p, 0.05, false, 0).damageToPlayer > 0) hits++;
    }
    expect(hits).toBe(2);
  });

  it('dt 为 0 时不重复结算伤害', () => {
    const { w, p, e } = closePair();
    expect(updateEnemy(e, w, p, 0, false, 0).damageToPlayer).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) {
      expect(updateEnemy(e, w, p, 0, false, 0).damageToPlayer).toBe(0);
    }
    expect(e.attackCd).toBeGreaterThan(0);
  });

  it('三种敌人都遵守可见性契约', () => {
    const kinds: EnemyKind[] = ['duststalker', 'cavemaw', 'ruinsentinel'];
    for (const kind of kinds) {
      const w = arena();
      const p = createPlayer(1.9, 31.02, 0.5);
      const e = spawnEnemy(kind, 0.5, 31.02, 0.5);
      const r = updateEnemy(e, w, p, 0.05, true, 0);
      expect(r.damageToPlayer).toBe(ENEMY_DEFS[kind].damage); // 数值未变
      wallAt(w, 1, 0, BlockId.Brick);
      e.attackCd = 0;
      const blocked = updateEnemy(e, w, p, 0.05, true, 0);
      expect(blocked.damageToPlayer).toBe(0);
      expect(e.state).not.toBe('attack');
    }
  });

  it('透明材质语义回归：水/植物/树叶不阻挡，玻璃与关闭的门阻挡', () => {
    const w = arena();
    const p = createPlayer(3.5, 31.02, 0.5);
    const e = spawnEnemy('duststalker', -3.5, 31.02, 0.5);
    const seeThrough = [BlockId.ShallowWater, BlockId.DeepWater, BlockId.FiberPlant, BlockId.Leaves];
    for (const id of seeThrough) {
      w.setBlock(0, 32, 0, id, false);
      expect(hasLineOfSight(w, e, p)).toBe(true);
    }
    for (const id of [BlockId.Glass, BlockId.Brick, BlockId.Door]) {
      w.setBlock(0, 32, 0, id, false);
      expect(hasLineOfSight(w, e, p)).toBe(false);
    }
    w.setBlock(0, 32, 0, BlockId.Door, false);
    w.doorOpen.add(World.blockKey(0, 32, 0));
    expect(hasLineOfSight(w, e, p)).toBe(true); // 打开的门可穿透视线
  });
});
