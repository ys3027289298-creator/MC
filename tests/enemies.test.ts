import { describe, it, expect } from 'vitest';
import { World } from '../src/game/world';
import { B } from '../src/game/blocks';
import { Rng } from '../src/game/rng';
import {
  spawnEnemy,
  updateEnemy,
  damageEnemy,
  hasLineOfSight,
  EnemyUpdateResult,
  ENEMY_DEFS
} from '../src/game/enemies';

function worldWithFloor(): World {
  const w = new World('combat');
  const c = w.ensureChunk(0, 0);
  c.clear();
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      c.set(x, 30, z, B.Rock);
    }
  }
  return w;
}

describe('enemy AI', () => {
  it('patrols, detects, chases and attacks visible player', () => {
    const w = worldWithFloor();
    const e = spawnEnemy('prowler', 2, 31, 2);
    const player = { x: 6, y: 31, z: 2, inShelter: false };
    const rng = new Rng(3);
    const res: EnemyUpdateResult = { damageToPlayer: 0, killed: [] };
    expect(e.state).toBe('patrol');
    for (let i = 0; i < 80; i++) {
      updateEnemy(w, e, player, { night: true, weatherDanger: 0, dt: 0.1, rng }, res);
    }
    expect(['chase', 'attack']).toContain(e.state);
    expect(Math.hypot(e.x - player.x, e.z - player.z)).toBeLessThan(3);
  });

  it('loses aggro when a wall blocks line of sight', () => {
    const w = worldWithFloor();
    for (let y = 31; y < 34; y++) {
      for (let z = 1; z < 4; z++) w.setBlock(5, y, z, B.RivetPlate);
    }
    expect(hasLineOfSight(w, 2, 32, 2, 9, 32, 2)).toBe(false);
    expect(hasLineOfSight(w, 2, 32, 6, 4, 32, 6)).toBe(true);
    const e = spawnEnemy('prowler', 2, 31, 2);
    e.state = 'chase';
    const rng = new Rng(4);
    const res: EnemyUpdateResult = { damageToPlayer: 0, killed: [] };
    for (let i = 0; i < 60; i++) {
      updateEnemy(w, e, { x: 9, y: 31, z: 2, inShelter: false }, { night: true, weatherDanger: 0, dt: 0.1, rng }, res);
    }
    expect(e.x).toBeLessThan(5);
  });

  it('cannot move through solid walls', () => {
    const w = worldWithFloor();
    for (let z = 1; z < 4; z++) {
      w.setBlock(5, 31, z, B.RivetPlate);
      w.setBlock(5, 32, z, B.RivetPlate);
    }
    const e = spawnEnemy('prowler', 2, 31, 2);
    e.state = 'chase';
    const rng = new Rng(5);
    const res: EnemyUpdateResult = { damageToPlayer: 0, killed: [] };
    for (let i = 0; i < 100; i++) {
      updateEnemy(w, e, { x: 10, y: 31, z: 2, inShelter: false }, { night: true, weatherDanger: 0, dt: 0.05, rng }, res);
    }
    expect(e.x).toBeLessThan(5);
  });

  it('takes damage with hit reaction, dies and drops loot', () => {
    const w = worldWithFloor();
    const e = spawnEnemy('scorpion', 8, 31, 8);
    const rng = new Rng(6);
    const res: EnemyUpdateResult = { damageToPlayer: 0, killed: [] };
    damageEnemy(w, e, 10, rng, res, 0);
    expect(e.hitFlash).toBeGreaterThan(0);
    expect(e.state).toBe('chase');
    damageEnemy(w, e, ENEMY_DEFS.scorpion.maxHp, rng, res, 0);
    expect(e.state).toBe('dead');
    expect(res.killed).toContain(e);
    expect(w.drops.length).toBeGreaterThan(0);
  });

  it('respects attack interval', () => {
    const w = worldWithFloor();
    const e = spawnEnemy('prowler', 8, 31, 8);
    e.state = 'attack';
    const rng = new Rng(7);
    const res: EnemyUpdateResult = { damageToPlayer: 0, killed: [] };
    updateEnemy(w, e, { x: 8.6, y: 31, z: 8, inShelter: false }, { night: true, weatherDanger: 0, dt: 0.1, rng }, res);
    expect(res.damageToPlayer).toBe(ENEMY_DEFS.prowler.damage);
    res.damageToPlayer = 0;
    updateEnemy(w, e, { x: 8.6, y: 31, z: 8, inShelter: false }, { night: true, weatherDanger: 0, dt: 0.1, rng }, res);
    expect(res.damageToPlayer).toBe(0);
  });
});
