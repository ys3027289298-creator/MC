// Hostile creatures with patrol / detect / chase / attack / de-aggro states.

import { World } from './world';
import { Rng } from './rng';

export type EnemyKind = 'prowler' | 'scorpion' | 'wraith';
export type AiState = 'patrol' | 'chase' | 'attack' | 'flee' | 'dead';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackInterval: number;
  sight: number;
  color: number;
  nightOnly: boolean;
  underground: boolean;
  drops: { id: string; chance: number; count: number }[];
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  prowler: {
    kind: 'prowler',
    name: '暮行兽',
    maxHp: 45,
    speed: 3.1,
    damage: 10,
    attackRange: 1.4,
    attackInterval: 1.1,
    sight: 16,
    color: 0x4a4a66,
    nightOnly: true,
    underground: false,
    drops: [
      { id: 'dusk_pelt', chance: 0.85, count: 1 },
      { id: 'beast_meat_raw', chance: 0.6, count: 1 }
    ]
  },
  scorpion: {
    kind: 'scorpion',
    name: '裂脊蝎',
    maxHp: 32,
    speed: 2.4,
    damage: 8,
    attackRange: 1.3,
    attackInterval: 1.4,
    sight: 11,
    color: 0x9a6a4a,
    nightOnly: false,
    underground: true,
    drops: [
      { id: 'razor_claw', chance: 0.5, count: 1 },
      { id: 'beast_meat_raw', chance: 0.4, count: 1 }
    ]
  },
  wraith: {
    kind: 'wraith',
    name: '浮影',
    maxHp: 28,
    speed: 3.8,
    damage: 13,
    attackRange: 1.5,
    attackInterval: 0.9,
    sight: 18,
    color: 0x7a6a9a,
    nightOnly: true,
    underground: false,
    drops: [{ id: 'wraith_dust', chance: 0.7, count: 1 }]
  }
};

export interface Enemy {
  uid: number;
  kind: EnemyKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hp: number;
  state: AiState;
  cooldown: number;
  hitFlash: number;
  targetX: number;
  targetZ: number;
  repath: number;
  lostSight: number;
  width: number;
  height: number;
}

let UID = 1;

export function spawnEnemy(kind: EnemyKind, x: number, y: number, z: number): Enemy {
  const d = ENEMY_DEFS[kind];
  return {
    uid: UID++,
    kind,
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    hp: d.maxHp,
    state: 'patrol',
    cooldown: 0,
    hitFlash: 0,
    targetX: x,
    targetZ: z,
    repath: 0,
    lostSight: 0,
    width: kind === 'scorpion' ? 0.9 : 0.7,
    height: kind === 'wraith' ? 1.4 : 1.1
  };
}

export interface EnemyUpdateResult {
  damageToPlayer: number;
  killed: Enemy[];
}

function solidFor(world: World, e: Enemy, x: number, y: number, z: number): boolean {
  const r = e.width / 2;
  for (let bx = Math.floor(x - r); bx <= Math.floor(x + r); bx++) {
    for (let by = Math.floor(y); by <= Math.floor(y + e.height - 0.05); by++) {
      for (let bz = Math.floor(z - r); bz <= Math.floor(z + r); bz++) {
        if (world.isSolidAt(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

// Line sampling: enemies stop chasing when walls block sight.
export function hasLineOfSight(
  world: World,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  const steps = Math.ceil(dist / 0.5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (world.isSolidAt(Math.floor(ax + dx * t), Math.floor(ay + dy * t), Math.floor(az + dz * t))) {
      return false;
    }
  }
  return true;
}

function tryMove(world: World, e: Enemy, dx: number, dz: number, dt: number) {
  const nx = e.x + dx * dt;
  if (!solidFor(world, e, nx, e.y, e.z)) {
    e.x = nx;
  } else if (!solidFor(world, e, nx, e.y + 1, e.z) && world.isSolidAt(Math.floor(nx), Math.floor(e.y - 0.2), Math.floor(e.z))) {
    e.y += 1;
    if (!solidFor(world, e, nx, e.y, e.z)) e.x = nx;
  }
  const nz = e.z + dz * dt;
  if (!solidFor(world, e, e.x, e.y, nz)) {
    e.z = nz;
  } else if (!solidFor(world, e, e.x, e.y + 1, nz) && world.isSolidAt(Math.floor(e.x), Math.floor(e.y - 0.2), Math.floor(nz))) {
    e.y += 1;
    if (!solidFor(world, e, e.x, e.y, nz)) e.z = nz;
  }
  if (!solidFor(world, e, e.x, e.y - 0.1, e.z)) {
    e.y -= 14 * dt;
  }
}

export function updateEnemy(
  world: World,
  e: Enemy,
  player: { x: number; y: number; z: number; inShelter: boolean },
  ctx: { night: boolean; weatherDanger: number; dt: number; rng: Rng },
  result: EnemyUpdateResult
) {
  if (e.state === 'dead') return;
  const def = ENEMY_DEFS[e.kind];
  e.cooldown = Math.max(0, e.cooldown - ctx.dt);
  e.hitFlash = Math.max(0, e.hitFlash - ctx.dt);
  const dist = Math.hypot(player.x - e.x, player.z - e.z);
  const los = hasLineOfSight(world, e.x, e.y + e.height * 0.7, e.z, player.x, player.y + 1.2, player.z);

  if (e.state === 'patrol' && dist < def.sight && los) {
    if (!(player.inShelter && dist > 6)) e.state = 'chase';
  }
  if (e.state === 'chase' || e.state === 'attack') {
    e.lostSight = los ? 0 : e.lostSight + ctx.dt;
    if (e.lostSight > 4) {
      e.state = 'flee';
      e.lostSight = 0;
    }
  }
  if (e.state === 'chase' && dist <= def.attackRange && los) e.state = 'attack';
  else if (e.state === 'attack' && (dist > def.attackRange + 0.5 || !los)) e.state = 'chase';

  if (e.state === 'attack') {
    if (e.cooldown <= 0 && los && dist <= def.attackRange + 0.4) {
      result.damageToPlayer += def.damage;
      e.cooldown = def.attackInterval;
    }
  } else if (e.state === 'chase') {
    const ang = Math.atan2(player.x - e.x, player.z - e.z);
    const speed = def.speed * (1 + ctx.weatherDanger * 0.15);
    tryMove(world, e, Math.sin(ang) * speed, Math.cos(ang) * speed, ctx.dt);
  } else {
    e.repath -= ctx.dt;
    if (e.repath <= 0) {
      e.repath = 3 + ctx.rng.next() * 3;
      if (e.state === 'flee') e.state = 'patrol';
      e.targetX = e.x + ctx.rng.range(-6, 6);
      e.targetZ = e.z + ctx.rng.range(-6, 6);
    }
    const ang = Math.atan2(e.targetX - e.x, e.targetZ - e.z);
    tryMove(world, e, Math.sin(ang) * def.speed * 0.4, Math.cos(ang) * def.speed * 0.4, ctx.dt);
  }
}

export function damageEnemy(
  world: World,
  e: Enemy,
  amount: number,
  rng: Rng,
  result: EnemyUpdateResult,
  now: number
): boolean {
  if (e.state === 'dead') return false;
  e.hp -= amount;
  e.hitFlash = 0.2;
  if (e.hp <= 0) {
    e.state = 'dead';
    result.killed.push(e);
    for (const d of ENEMY_DEFS[e.kind].drops) {
      if (rng.chance(d.chance)) world.spawnDrop(d.id, d.count, e.x, e.y + 0.5, e.z, undefined, now);
    }
    return true;
  }
  e.state = 'chase';
  e.lostSight = 0;
  return false;
}

export function spawnTick(
  world: World,
  enemies: Enemy[],
  px: number,
  py: number,
  pz: number,
  night: boolean,
  rng: Rng,
  maxMobs: number
): Enemy[] {
  const spawned: Enemy[] = [];
  if (enemies.length >= maxMobs) return spawned;
  const underground = py < 20;
  for (let i = 0; i < 2; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(14, 26);
    const x = Math.floor(px + Math.cos(ang) * dist);
    const z = Math.floor(pz + Math.sin(ang) * dist);
    const h = world.surfaceHeight(x, z);
    let kind: EnemyKind | null = null;
    let y = h + 1;
    if (underground && rng.chance(0.6)) {
      kind = 'scorpion';
      y = Math.max(4, Math.floor(py) + rng.int(-3, 3));
    } else if (night) {
      kind = rng.chance(0.55) ? 'prowler' : 'wraith';
    }
    if (!kind) continue;
    if (world.isSolidAt(x, y, z) || world.isSolidAt(x, y + 1, z)) continue;
    if (!world.isSolidAt(x, y - 1, z) && kind !== 'wraith') continue;
    const e = spawnEnemy(kind, x + 0.5, y, z + 0.5);
    enemies.push(e);
    spawned.push(e);
  }
  return spawned;
}
