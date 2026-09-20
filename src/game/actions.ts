// Placement rules, mining time resolution, dropped-item pickup and projectiles.

import { B, blockDef, BlockDef } from './blocks';
import { Inventory } from './inventory';
import { itemDef } from './items';
import { PlayerBody, blockIntersectsPlayer } from './physics';
import { World, WORLD_HEIGHT, keyOf } from './world';

export const REACH = 5.5;

export type PlaceFail = 'out_of_range' | 'occupied' | 'inside_player' | 'no_support' | 'not_empty';

export function canPlaceAt(
  world: World,
  body: PlayerBody,
  x: number,
  y: number,
  z: number
): { ok: true } | { ok: false; reason: PlaceFail } {
  if (y < 1 || y >= WORLD_HEIGHT) return { ok: false, reason: 'occupied' };
  const current = world.getBlock(x, y, z);
  if (current !== B.Air) return { ok: false, reason: 'not_empty' };
  if (blockIntersectsPlayer(body, x, y, z)) return { ok: false, reason: 'inside_player' };
  // Require at least one solid neighbor or a solid block below (no floating blocks).
  const supported =
    world.isSolidAt(x, y - 1, z) ||
    world.isSolidAt(x + 1, y, z) ||
    world.isSolidAt(x - 1, y, z) ||
    world.isSolidAt(x, y + 1, z) ||
    world.isSolidAt(x, y, z + 1) ||
    world.isSolidAt(x, y, z - 1);
  if (!supported) return { ok: false, reason: 'no_support' };
  return { ok: true };
}

export function placeBlock(
  world: World,
  body: PlayerBody,
  inv: Inventory,
  slot: number,
  x: number,
  y: number,
  z: number
): { ok: boolean; reason?: PlaceFail; blockId?: number } {
  const stack = inv.slots[slot];
  if (!stack) return { ok: false, reason: 'occupied' };
  const item = itemDef(stack.id);
  if (item.kind !== 'block' || item.blockId === undefined) return { ok: false, reason: 'occupied' };
  const check = canPlaceAt(world, body, x, y, z);
  if (!check.ok) return check;
  const blockId = item.blockId;
  const def = blockDef(blockId);
  world.setBlock(x, y, z, blockId, { hp: def.hp });
  inv.remove(stack.id, 1);
  return { ok: true, blockId };
}

// Mining: effective seconds based on tool suitability + survival scale.
export function miningTime(def: BlockDef, toolId: string | null, survivalScale: number): number {
  let t = def.hardness;
  if (def.tool !== 'none' && toolId) {
    const d = itemDef(toolId);
    if (d.toolType === def.tool && d.power) t /= 1 + d.power;
    else t *= 1.5;
  } else if (def.tool !== 'none') {
    t *= 2.2; // wrong/no tool penalty, still mineable
  }
  return Math.max(0.12, t / Math.max(0.2, survivalScale));
}

export function canMineWithTool(def: BlockDef, toolId: string | null): boolean {
  if (def.tool === 'none') return true;
  if (!toolId) return false;
  return itemDef(toolId).toolType === def.tool;
}

export function breakBlock(
  world: World,
  inv: Inventory,
  x: number,
  y: number,
  z: number,
  now: number
): { drops: { id: string; count: number }[]; blockId: number } {
  const id = world.getBlock(x, y, z);
  const def = blockDef(id);
  world.setBlock(x, y, z, B.Air);
  const drops: { id: string; count: number }[] = [];
  if (def.drop && def.dropCount) {
    const [min, max] = def.dropCount;
    const count = min + Math.floor(Math.random() * (max - min + 1));
    if (count > 0 && inv.canAdd(def.drop, count)) {
      inv.add(def.drop, count);
      drops.push({ id: def.drop, count });
    } else if (count > 0) {
      world.spawnDrop(def.drop, count, x + 0.5, y + 0.5, z + 0.5, undefined, now);
      drops.push({ id: def.drop, count });
    }
  }
  return { drops, blockId: id };
}

// Spawn the drop into the world instead of inventory (e.g. on death or manual drop).
export function dropFromInventory(world: World, inv: Inventory, slot: number, amount: number | undefined, now: number) {
  const stack = inv.drop(slot, amount);
  if (!stack) return null;
  world.spawnDrop(stack.id, stack.count, 0, 0, 0, stack.durability, now);
  return stack;
}

export function updateDrops(world: World, dt: number, now: number) {
  for (const d of world.drops) {
    d.vy -= 18 * dt;
    d.y += d.vy * dt;
    const gy = Math.floor(d.y);
    if (world.isSolidAt(Math.floor(d.x), gy, Math.floor(d.z))) {
      d.y = gy + 1;
      d.vy = 0;
    }
    void now;
  }
  world.drops = world.drops.filter((d) => now - d.born < 300000);
}

export function collectDrops(world: World, inv: Inventory, x: number, y: number, z: number): number {
  let collected = 0;
  const rest = world.drops.filter((d) => {
    const dist = Math.hypot(d.x - x, d.y - (y + 0.8), d.z - z);
    if (dist < 1.4) {
      const left = inv.add(d.id, d.count, d.durability);
      if (left > 0) {
        d.count = left;
        return true;
      }
      collected++;
      return false;
    }
    return true;
  });
  world.drops = rest;
  return collected;
}

// ---- projectiles (thorn darts) ----
export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  life: number;
}

export function createProjectile(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  damage: number
): Projectile {
  const speed = 22;
  return { x: ox, y: oy, z: oz, vx: dx * speed, vy: dy * speed, vz: dz * speed, damage, life: 2.5 };
}

export interface ProjectileHitEnemy {
  uid: number;
}

export function updateProjectile(
  world: World,
  p: Projectile,
  dt: number,
  enemies: { x: number; y: number; z: number; width: number; height: number; uid: number }[]
): ProjectileHitEnemy | 'wall' | null {
  p.life -= dt;
  if (p.life <= 0) return 'wall';
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  p.vy -= 6 * dt;
  if (world.isSolidAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) return 'wall';
  for (const e of enemies) {
    if (
      p.x > e.x - e.width / 2 &&
      p.x < e.x + e.width / 2 &&
      p.y > e.y &&
      p.y < e.y + e.height &&
      p.z > e.z - e.width / 2 &&
      p.z < e.z + e.width / 2
    ) {
      return { uid: e.uid };
    }
  }
  return null;
}
