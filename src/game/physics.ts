// AABB voxel collision, movement, and a voxel raycast (DDA).

import { World } from './world';

export interface PlayerBody {
  x: number;
  y: number; // feet position
  z: number;
  vx: number;
  vy: number;
  vz: number;
  width: number;
  height: number;
  eyeHeight: number;
  onGround: boolean;
  inWater: boolean;
  crouching: boolean;
}

export function createBody(x: number, y: number, z: number): PlayerBody {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    width: 0.6,
    height: 1.8,
    eyeHeight: 1.62,
    onGround: false,
    inWater: false,
    crouching: false
  };
}

const GRAVITY = 26;

function overlapsSolid(world: World, body: PlayerBody, x: number, y: number, z: number): boolean {
  const r = body.width / 2;
  const h = body.crouching ? body.height - 0.3 : body.height;
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r);
  const y0 = Math.floor(y + 0.001);
  const y1 = Math.floor(y + h - 0.001);
  const z0 = Math.floor(z - r);
  const z1 = Math.floor(z + r);
  for (let bx = x0; bx <= x1; bx++) {
    for (let by = y0; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        if (world.isSolidAt(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

export interface MoveInput {
  forward: number; // -1..1
  strafe: number;
  yaw: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
}

export function movePlayer(
  world: World,
  body: PlayerBody,
  input: MoveInput,
  dt: number,
  speedScale = 1
): { staminaCost: number; distance: number } {
  body.crouching = input.crouch;
  body.inWater = world.isWaterAt(Math.floor(body.x), Math.floor(body.y + 0.9), Math.floor(body.z));
  let speed = (input.crouch ? 2.2 : input.sprint ? 7.2 : 4.4) * speedScale;
  if (body.inWater) speed *= 0.6;
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  // forward is -Z when yaw=0
  let mx = -sin * input.forward + cos * input.strafe;
  let mz = -cos * input.forward - sin * input.strafe;
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len;
    mz /= len;
  }
  body.vx = mx * speed;
  body.vz = mz * speed;

  if (body.inWater) {
    body.vy -= GRAVITY * 0.18 * dt;
    body.vy = Math.max(body.vy, -3);
    if (input.jump) body.vy = 3.2;
  } else {
    body.vy -= GRAVITY * dt;
    if (input.jump && body.onGround) {
      body.vy = 8.6;
      body.onGround = false;
    }
  }

  // integrate axis by axis with swept resolution
  const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
  const step = dt / steps;
  let distance = 0;
  for (let i = 0; i < steps; i++) {
    const dx = body.vx * step;
    if (!overlapsSolid(world, body, body.x + dx, body.y, body.z)) {
      body.x += dx;
      distance += Math.abs(dx);
    } else {
      body.vx = 0;
    }
    const dz = body.vz * step;
    if (!overlapsSolid(world, body, body.x, body.y, body.z + dz)) {
      body.z += dz;
      distance += Math.abs(dz);
    } else {
      body.vz = 0;
    }
    const dy = body.vy * step;
    if (!overlapsSolid(world, body, body.x, body.y + dy, body.z)) {
      body.y += dy;
      body.onGround = false;
    } else {
      if (dy < 0) body.onGround = true;
      body.vy = 0;
    }
  }
  // Ground check even when vertical velocity is zero (resting / jump edge case).
  if (!body.onGround && overlapsSolid(world, body, body.x, body.y - 0.05, body.z)) {
    body.onGround = true;
  }
  if (body.y < 1) {
    body.y = 1;
    body.vy = 0;
    body.onGround = true;
  }
  const moving = len > 0;
  const staminaCost = moving && input.sprint && body.onGround ? dt * 5 : moving ? dt * 0.6 : 0;
  return { staminaCost: input.jump && body.onGround ? staminaCost + 2 : staminaCost, distance };
}

export interface RayHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  id: number;
}

// Amanatides & Woo voxel traversal.
export function raycastVoxel(
  world: World,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number
): RayHit | null {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  const distToBoundary = (o: number, s: number) => (s > 0 ? Math.ceil(o) - o : o - Math.floor(o));
  let tMaxX = dx !== 0 ? distToBoundary(ox, stepX) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? distToBoundary(oy, stepY) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? distToBoundary(oz, stepZ) * tDeltaZ : Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;
  // If the ray starts already inside a solid cell, report the face pointing against travel.
  const startId = world.getBlock(x, y, z);
  if (startId !== 0) {
    return {
      x,
      y,
      z,
      nx: dx < 0 ? 1 : dx > 0 ? -1 : 0,
      ny: dy < 0 ? 1 : dy > 0 ? -1 : 0,
      nz: dz < 0 ? 1 : dz > 0 ? -1 : 0,
      id: startId
    };
  }
  while (t <= maxDist) {
    const id = world.getBlock(x, y, z);
    if (id !== 0) {
      return { x, y, z, nx, ny, nz, id };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }
  return null;
}

// Check whether a player AABB would occupy the given block cell.
export function blockIntersectsPlayer(
  body: PlayerBody,
  x: number,
  y: number,
  z: number
): boolean {
  const r = body.width / 2;
  const h = body.crouching ? body.height - 0.3 : body.height;
  return (
    x + 1 > body.x - r &&
    x < body.x + r &&
    z + 1 > body.z - r &&
    z < body.z + r &&
    y + 1 > body.y &&
    y < body.y + h
  );
}
