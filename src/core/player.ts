import { BlockId, BLOCKS, isLiquid, isSolid } from './blocks';
import { World, WORLD_HEIGHT } from './world';

export interface PlayerState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number;
  onGround: boolean;
  sprinting: boolean;
  crouching: boolean;
  hp: number; stamina: number; food: number; temperature: number; safety: number;
  alive: boolean;
  deathCause: string;
  spawnX: number; spawnY: number; spawnZ: number;
  inWater: boolean;
}

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT_STAND = 1.8;
export const PLAYER_HEIGHT_CROUCH = 1.4;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.22;

export interface MoveInput {
  forward: boolean; back: boolean; left: boolean; right: boolean;
  jump: boolean; sprint: boolean; crouch: boolean;
}

export function createPlayer(x: number, y: number, z: number): PlayerState {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
    onGround: false, sprinting: false, crouching: false,
    hp: 100, stamina: 100, food: 100, temperature: 37, safety: 100,
    alive: true, deathCause: '', spawnX: x, spawnY: y, spawnZ: z, inWater: false,
  };
}

// AABB 与体素碰撞：逐轴解算
export function collides(world: World, x: number, y: number, z: number, height: number): boolean {
  const hw = PLAYER_WIDTH / 2;
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
  const y0 = Math.floor(y), y1 = Math.floor(y + height - 0.001);
  const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
  for (let bx = x0; bx <= x1; bx++) for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) {
    let id = world.getBlock(bx, by, bz);
    if (id === BlockId.Door && world.doorOpen.has(World.blockKey(bx, by, bz))) id = BlockId.Air;
    if (isSolid(id)) return true;
  }
  return false;
}

export function liquidAt(world: World, x: number, y: number, z: number, height: number): boolean {
  return isLiquid(world.getBlock(Math.floor(x), Math.floor(y + height * 0.5), Math.floor(z)));
}

// 尝试放置位置是否被玩家占据（用于放置限制）
export function blockOverlapsPlayer(p: PlayerState, bx: number, by: number, bz: number, height: number): boolean {
  const hw = PLAYER_WIDTH / 2 + 1;
  return bx + 1 > p.x - hw && bx < p.x + hw && bz + 1 > p.z - hw && bz < p.z + hw &&
    by + 1 > p.y && by < p.y + height;
}

export interface MoveResult {
  moved: number;
  exhaustion: number;
}

export function updatePlayerPhysics(p: PlayerState, world: World, input: MoveInput, dt: number, speedMul = 1): MoveResult {
  const height = input.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT_STAND;
  p.crouching = input.crouch;
  p.sprinting = input.sprint && input.forward && p.stamina > 1 && !input.crouch;

  const baseSpeed = (input.crouch ? 2.6 : p.sprinting ? 6.4 : 4.3) * speedMul;
  let ix = 0, iz = 0;
  if (input.forward) iz -= 1;
  if (input.back) iz += 1;
  if (input.left) ix -= 1;
  if (input.right) ix += 1;
  const len = Math.hypot(ix, iz);
  if (len > 0) { ix /= len; iz /= len; }
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  const wx = ix * cos - iz * sin;
  const wz = ix * sin + iz * cos;

  p.inWater = liquidAt(world, p.x, p.y, p.z, height);
  const accel = p.onGround ? 12 : 4;
  const waterFactor = p.inWater ? 0.45 : 1;
  p.vx += (wx * baseSpeed * waterFactor - p.vx) * Math.min(1, accel * dt);
  p.vz += (wz * baseSpeed * waterFactor - p.vz) * Math.min(1, accel * dt);

  // 重力 / 跳跃 / 游泳
  const gravity = p.inWater ? 8 : 24;
  p.vy -= gravity * dt;
  if (p.inWater) {
    p.vy = Math.max(p.vy, -2.5);
    if (input.jump) p.vy = 3.2;
  } else if (input.jump && p.onGround) {
    p.vy = 8.2;
    p.onGround = false;
  }
  p.vy = Math.max(p.vy, -40);

  const moved = moveWithCollision(p, world, dt, height);

  let exhaustion = 0;
  if (len > 0 && p.onGround) exhaustion += p.sprinting ? 9 * dt : 2.5 * dt;
  if (input.jump && p.onGround) exhaustion += 0.6;
  if (!p.inWater && p.vy < 0) exhaustion += 0;
  return { moved, exhaustion };
}

function moveWithCollision(p: PlayerState, world: World, dt: number, height: number): number {
  let total = 0;
  // X
  let nx = p.x + p.vx * dt;
  if (!collides(world, nx, p.y, p.z, height)) { total += Math.abs(p.vx * dt); p.x = nx; } else p.vx = 0;
  // Z
  let nz = p.z + p.vz * dt;
  if (!collides(world, p.x, p.y, nz, height)) { total += Math.abs(p.vz * dt); p.z = nz; } else p.vz = 0;
  // Y
  const ny = p.y + p.vy * dt;
  if (!collides(world, p.x, ny, p.z, height)) {
    p.y = ny;
    p.onGround = false;
  } else {
    if (p.vy < 0) p.onGround = true;
    p.vy = 0;
  }
  if (p.y < -4) { p.hp = 0; p.alive = false; p.deathCause = '坠入世界裂隙'; }
  return total;
}

// 视线所在地面移动速度修正（沙/水/高地等）
export function terrainSpeedMul(world: World, p: PlayerState): number {
  const id = world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
  const below = world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
  let mul = 1;
  const b1 = BLOCKS[id], b2 = BLOCKS[below];
  if (b1?.heightMove) mul *= b1.heightMove;
  if (b2?.heightMove) mul *= b2.heightMove;
  return mul;
}

export function eyeHeight(p: PlayerState): number {
  return (p.crouching ? EYE_CROUCH : EYE_STAND);
}

// 体素射线选取（DDA），返回方块坐标与法线
export interface RayHit {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  id: number;
  distance: number;
}
export function raycastVoxel(world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / (dx || 1e-9)), tDeltaY = Math.abs(1 / (dy || 1e-9)), tDeltaZ = Math.abs(1 / (dz || 1e-9));
  const boundX = x + (stepX > 0 ? 1 : 0), boundY = y + (stepY > 0 ? 1 : 0), boundZ = z + (stepZ > 0 ? 1 : 0);
  let tMaxX = (boundX - ox) / (dx || 1e-9 * stepX), tMaxY = (boundY - oy) / (dy || 1e-9 * stepY), tMaxZ = (boundZ - oz) / (dz || 1e-9 * stepZ);
  if (!isFinite(tMaxX)) tMaxX = Infinity;
  if (!isFinite(tMaxY)) tMaxY = Infinity;
  if (!isFinite(tMaxZ)) tMaxZ = Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 200; i++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDist) return null;
    const id = world.getBlock(x, y, z);
    if (isSolid(id) || (id !== BlockId.Air && !BLOCKS[id]?.liquid)) {
      if (id === BlockId.Door && world.doorOpen.has(World.blockKey(x, y, z))) continue;
      return { x, y, z, nx, ny, nz, id, distance: t };
    }
  }
  return null;
}

export { WORLD_HEIGHT };
