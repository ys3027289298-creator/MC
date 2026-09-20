import { Rng } from './rng';
import { World } from './world';
import { PlayerState, collides } from './player';

export type EnemyKind = 'duststalker' | 'cavemaw' | 'ruinsentinel';
export type EnemyStateName = 'patrol' | 'chase' | 'attack' | 'return' | 'dead';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  hp: number; maxHp: number;
  damage: number;
  speed: number;
  state: EnemyStateName;
  homeX: number; homeZ: number;
  target: number;
  attackCd: number;
  hurtFlash: number;
  onGround: boolean;
  nightOnly: boolean;
  drop: { id: string; count: number }[];
  exp?: number;
}

export const ENEMY_DEFS: Record<EnemyKind, { name: string; hp: number; damage: number; speed: number; sight: number; attackRange: number; nightOnly: boolean; drops: { id: string; count: number }[]; color: number }> = {
  duststalker: { name: '尘行者', hp: 26, damage: 8, speed: 3.0, sight: 14, attackRange: 1.6, nightOnly: false, drops: [{ id: 'meat_raw', count: 1 }, { id: 'fiber', count: 1 }], color: 0x9a7a5a },
  cavemaw: { name: '洞穴噬兽', hp: 44, damage: 14, speed: 2.4, sight: 10, attackRange: 1.8, nightOnly: false, drops: [{ id: 'meat_raw', count: 2 }], color: 0x6a4a5a },
  ruinsentinel: { name: '遗迹哨卫', hp: 70, damage: 18, speed: 2.0, sight: 16, attackRange: 2.0, nightOnly: true, drops: [{ id: 'ruin_metal', count: 1 }, { id: 'ore_scrap', count: 2 }], color: 0x708090 },
};

let nextId = 1;

export function spawnEnemy(kind: EnemyKind, x: number, y: number, z: number): Enemy {
  const d = ENEMY_DEFS[kind];
  return {
    id: nextId++, kind, x, y, z, vx: 0, vy: 0, vz: 0,
    hp: d.hp, maxHp: d.hp, damage: d.damage, speed: d.speed,
    state: 'patrol', homeX: x, homeZ: z, target: 0, attackCd: 0, hurtFlash: 0, onGround: false,
    nightOnly: d.nightOnly, drop: d.drops,
  };
}

export function dist2D(e: Enemy, p: PlayerState): number {
  return Math.hypot(e.x - p.x, e.z - p.z);
}

// 视线检测：视线中点高度上不能有实心方块
export function hasLineOfSight(world: World, e: Enemy, p: PlayerState, eyeY = 1.5): boolean {
  const steps = Math.ceil(Math.hypot(p.x - e.x, p.z - e.z) * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = e.x + (p.x - e.x) * t;
    const z = e.z + (p.z - e.z) * t;
    const y = (e.y + eyeY) + (p.y + eyeY - (e.y + eyeY)) * t;
    const id = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    if (id !== 0 && !(id === 7 || id === 8 || id === 18 || id === 10)) {
      const solid = require_solid(id);
      if (solid) return false;
    }
  }
  return true;
}
function require_solid(id: number): boolean {
  // 内联避免循环依赖：非空气/液体/植物即阻挡
  return id !== 7 && id !== 8 && id !== 18 && id !== 10;
}

export interface EnemyUpdateResult {
  damageToPlayer: number;
  killed: Enemy[];
}

export function updateEnemy(e: Enemy, world: World, p: PlayerState, dt: number, night: boolean, weatherDanger: number): EnemyUpdateResult {
  const result: EnemyUpdateResult = { damageToPlayer: 0, killed: [] };
  if (e.state === 'dead') return result;
  if (e.hurtFlash > 0) e.hurtFlash -= dt;
  if (e.attackCd > 0) e.attackCd -= dt;
  const def = ENEMY_DEFS[e.kind];
  const d = dist2D(e, p);
  const sees = p.alive && d < def.sight * (night ? 1.35 : 1) * (1 + weatherDanger * 0.2) && hasLineOfSight(world, e, p);

  // 状态机
  if (e.state === 'patrol' && sees) e.state = 'chase';
  else if (e.state === 'chase' && !sees && d > def.sight * 1.4) e.state = 'return';
  else if (e.state === 'return' && Math.hypot(e.x - e.homeX, e.z - e.homeZ) < 2) e.state = 'patrol';
  if (e.state === 'chase' && d < def.attackRange) e.state = 'attack';
  if (e.state === 'attack' && d > def.attackRange + 0.6) e.state = 'chase';

  let tx = 0, tz = 0;
  if (e.state === 'patrol') {
    e.target += dt;
    if (e.target > 3) { e.target = 0; }
    const ang = Math.sin(e.target * 2 + e.id) + e.id;
    tx = Math.cos(ang) * 0.4; tz = Math.sin(ang) * 0.4;
  } else if (e.state === 'chase' || e.state === 'attack') {
    const a = Math.atan2(p.x - e.x, p.z - e.z);
    tx = Math.sin(a); tz = Math.cos(a);
    if (e.state === 'attack' && d < def.attackRange && e.attackCd <= 0) {
      result.damageToPlayer = e.damage;
      e.attackCd = 1.2;
    }
  } else if (e.state === 'return') {
    const a = Math.atan2(e.homeX - e.x, e.homeZ - e.z);
    tx = Math.sin(a) * 0.8; tz = Math.cos(a) * 0.8;
  }

  const sp = e.state === 'chase' ? e.speed : e.speed * 0.5;
  e.vx = tx * sp;
  e.vz = tz * sp;
  e.vy -= 24 * dt;

  const h = 1.5;
  let nx = e.x + e.vx * dt;
  if (!collides(world, nx, e.y, e.z, h)) e.x = nx;
  else {
    // 尝试跳过障碍
    if (!collides(world, nx, e.y + 1.02, e.z, h) && e.onGround) e.vy = 7;
    e.vx = 0;
  }
  let nz = e.z + e.vz * dt;
  if (!collides(world, e.x, e.y, nz, h)) e.z = nz;
  else {
    if (!collides(world, e.x, e.y + 1.02, nz, h) && e.onGround) e.vy = 7;
    e.vz = 0;
  }
  const ny = e.y + e.vy * dt;
  if (!collides(world, e.x, ny, e.z, h)) { e.y = ny; e.onGround = false; }
  else { if (e.vy < 0) e.onGround = true; e.vy = 0; }
  if (e.y < -2) { e.state = 'dead'; result.killed.push(e); }
  return result;
}

export function damageEnemy(e: Enemy, dmg: number): boolean {
  e.hp -= dmg;
  e.hurtFlash = 0.25;
  if (e.hp <= 0) { e.state = 'dead'; return true; }
  e.state = 'chase';
  return false;
}

// 夜晚在远离玩家的地点生成敌人；白天不生成夜行种
export function pickSpawnPosition(world: World, rng: Rng, px: number, pz: number, underground: boolean): { x: number; y: number; z: number } | null {
  for (let i = 0; i < 8; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(16, 28);
    const x = Math.round(px + Math.cos(ang) * dist);
    const z = Math.round(pz + Math.sin(ang) * dist);
    if (underground) {
      const y = rng.int(6, 18);
      if (world.getBlock(x, y, z) === 0 && world.getBlock(x, y - 1, z) !== 0) return { x: x + 0.5, y, z: z + 0.5 };
    } else {
      const y = world.topSolidY(x, z) + 1;
      if (world.getBlock(x, y, z) === 0 && world.getBlock(x, y + 1, z) === 0) return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  return null;
}
