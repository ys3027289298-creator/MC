import { describe, it, expect } from 'vitest';
import { World } from '../src/game/world';
import { B } from '../src/game/blocks';
import { createBody, movePlayer, raycastVoxel, blockIntersectsPlayer } from '../src/game/physics';

function flatWorld(): World {
  const w = new World('flat');
  const c = w.ensureChunk(0, 0);
  c.clear();
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y <= 30; y++) c.set(x, y, z, B.Rock);
    }
  }
  return w;
}

describe('player movement & collision', () => {
  it('falls and lands on ground without passing through', () => {
    const w = flatWorld();
    const body = createBody(8, 40, 8);
    for (let i = 0; i < 120; i++) {
      movePlayer(
        w,
        body,
        { forward: 0, strafe: 0, yaw: 0, jump: false, sprint: false, crouch: false },
        0.05
      );
    }
    expect(body.onGround).toBe(true);
    expect(body.y).toBeGreaterThanOrEqual(31);
    expect(body.y).toBeLessThan(33);
  });

  it('moves with WASD direction and cannot walk through a wall', () => {
    const w = flatWorld();
    // carve corridor then add wall at x=10
    for (let y = 31; y < 35; y++) {
      for (let z = 6; z < 11; z++) w.setBlock(10, y, z, B.RivetPlate);
    }
    const body = createBody(8, 31, 8);
    body.onGround = true;
    for (let i = 0; i < 200; i++) {
      movePlayer(
        w,
        body,
        { forward: 1, strafe: 0, yaw: Math.PI / 2, jump: false, sprint: false, crouch: false },
        0.05
      );
    }
    expect(body.x).toBeLessThan(9.8);
  });

  it('jumps and comes back down', () => {
    const w = flatWorld();
    const body = createBody(8, 31, 8);
    body.onGround = true;
    const startY = body.y;
    movePlayer(w, body, { forward: 0, strafe: 0, yaw: 0, jump: true, sprint: false, crouch: false }, 0.05);
    for (let i = 0; i < 5; i++) {
      movePlayer(w, body, { forward: 0, strafe: 0, yaw: 0, jump: true, sprint: false, crouch: false }, 0.05);
    }
    expect(body.y).toBeGreaterThan(startY);
  });

  it('raycast hits the targeted block and returns face normal', () => {
    const w = flatWorld();
    const hit = raycastVoxel(w, 8.5, 33, 8.5, 0, -1, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit!.y).toBe(30);
    expect(hit!.ny).toBe(1);
  });

  it('detects when a block intersects the player body', () => {
    const body = createBody(8, 31, 8);
    expect(blockIntersectsPlayer(body, 8, 31, 8)).toBe(true);
    expect(blockIntersectsPlayer(body, 12, 31, 8)).toBe(false);
  });
});
