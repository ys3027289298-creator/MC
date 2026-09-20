import { describe, it, expect } from 'vitest';
import { spawnEnemy, updateEnemy, damageEnemy, dist2D, hasLineOfSight, ENEMY_DEFS } from '../src/core/enemies';
import { World } from '../src/core/world';
import { BlockId } from '../src/core/blocks';
import { createPlayer } from '../src/core/player';

function arena(withWall = false): World {
  const w = new World('enemy-arena');
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) w.setBlock(x, 30, z, BlockId.Rock, false);
  if (withWall) {
    for (let y = 31; y <= 34; y++) for (let dz = -3; dz <= 3; dz++) w.setBlock(0, y, dz, BlockId.Brick, false);
  }
  return w;
}

describe('敌人状态机', () => {
  it('初始为巡逻，进入视野后追击并攻击', () => {
    const w = arena();
    const p = createPlayer(5.5, 31.02, 0.5);
    const e = spawnEnemy('duststalker', 0.5, 31.02, 0.5);
    expect(e.state).toBe('patrol');
    let totalDamage = 0;
    for (let i = 0; i < 300; i++) {
      const r = updateEnemy(e, w, p, 0.05, false, 0);
      totalDamage += r.damageToPlayer;
      if (e.state === 'attack') break;
    }
    expect(['chase', 'attack']).toContain(e.state);
    expect(totalDamage).toBeGreaterThan(0);
  });

  it('墙壁阻挡视线，敌人不进入追击', () => {
    const w = arena(true);
    const p = createPlayer(5.5, 31.5, 0.5);
    const e = spawnEnemy('duststalker', -5.5, 31.5, 0.5);
    expect(hasLineOfSight(w, e, p)).toBe(false);
    for (let i = 0; i < 40; i++) updateEnemy(e, w, p, 0.05, false, 0);
    expect(e.state).not.toBe('chase');
  });

  it('脱离视野过远后返回出生点', () => {
    const w = arena();
    const p = createPlayer(5.5, 31.02, 0.5);
    const e = spawnEnemy('duststalker', 0.5, 31.02, 0.5);
    for (let i = 0; i < 10; i++) updateEnemy(e, w, p, 0.05, false, 0);
    expect(e.state).toBe('chase');
    // 把玩家瞬移到远处，敌人应丢失目标
    p.x = 60; p.z = 60;
    for (let i = 0; i < 60; i++) updateEnemy(e, w, p, 0.05, false, 0);
    expect(['return', 'patrol']).toContain(e.state);
  });

  it('敌人不能穿过实体墙', () => {
    const w = arena(true);
    const p = createPlayer(5.5, 31.02, 0.5);
    const e = spawnEnemy('duststalker', -2, 31.02, 0.5);
    e.state = 'chase';
    for (let i = 0; i < 120; i++) updateEnemy(e, w, p, 0.05, false, 0);
    expect(e.x).toBeLessThan(-0.3);
  });
});

describe('敌人受伤与死亡', () => {
  it('受伤有反馈（闪白），伤害足够时死亡并掉落', () => {
    const e = spawnEnemy('cavemaw', 0, 31, 0);
    const hp0 = e.hp;
    const dead = damageEnemy(e, 5);
    expect(e.hp).toBe(hp0 - 5);
    expect(e.hurtFlash).toBeGreaterThan(0);
    expect(dead).toBe(false);
    expect(e.state).toBe('chase');
    const killed = damageEnemy(e, 999);
    expect(killed).toBe(true);
    expect(e.state).toBe('dead');
    expect(e.drop.length).toBeGreaterThan(0);
  });
  it('三种敌人数值不同，夜行种存在', () => {
    expect(ENEMY_DEFS.duststalker.hp).not.toBe(ENEMY_DEFS.ruinsentinel.hp);
    expect(ENEMY_DEFS.ruinsentinel.nightOnly).toBe(true);
    expect(ENEMY_DEFS.duststalker.nightOnly).toBe(false);
  });
  it('攻击有冷却，不会每帧造成伤害', () => {
    const w = arena();
    const p = createPlayer(1.2, 31.02, 0.5);
    const e = spawnEnemy('duststalker', 0.5, 31.02, 0.5);
    const r1 = updateEnemy(e, w, p, 0.01, false, 0);
    const r2 = updateEnemy(e, w, p, 0.01, false, 0);
    expect(r1.damageToPlayer).toBeGreaterThan(0);
    expect(r2.damageToPlayer).toBe(0);
  });
  void dist2D;
});
