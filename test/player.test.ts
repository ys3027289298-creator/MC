import { describe, it, expect } from 'vitest';
import { World } from '../src/core/world';
import { BlockId } from '../src/core/blocks';
import {
  createPlayer, updatePlayerPhysics, collides, raycastVoxel, blockOverlapsPlayer,
  PLAYER_HEIGHT_STAND, MoveInput,
} from '../src/core/player';

function flatWorld(): World {
  const w = new World('phys');
  // 手工在高空铺设一个清空的 10x10 石质平台在 y=58
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
    for (let y = 58; y <= 63; y++) w.setBlock(x, y, z, BlockId.Air, false);
    w.setBlock(x, 58, z, BlockId.Rock, false);
  }
  return w;
}
const noInput = (): MoveInput => ({ forward: false, back: false, left: false, right: false, jump: false, sprint: false, crouch: false });

describe('玩家移动与碰撞', () => {
  it('重力使玩家落到地面且不穿过方块', () => {
    const w = flatWorld();
    const p = createPlayer(0.5, 62, 0.5);
    for (let i = 0; i < 200; i++) updatePlayerPhysics(p, w, noInput(), 0.05);
    expect(p.onGround).toBe(true);
    expect(p.y).toBeGreaterThanOrEqual(58.9);
    expect(p.y).toBeLessThan(59.2);
  });

  it('W 键推动玩家前进', () => {
    const w = flatWorld();
    const p = createPlayer(0.5, 59.02, 0.5);
    p.yaw = 0;
    const input = noInput(); input.forward = true;
    for (let i = 0; i < 60; i++) updatePlayerPhysics(p, w, input, 0.05);
    expect(Math.hypot(p.x - 0.5, p.z - 0.5)).toBeGreaterThan(2);
  });

  it('跳跃使玩家短暂离地并落回', () => {
    const w = flatWorld();
    const p = createPlayer(0.5, 59.02, 0.5);
    for (let i = 0; i < 5; i++) updatePlayerPhysics(p, w, noInput(), 0.05);
    const y0 = p.y;
    const input = noInput(); input.jump = true;
    let maxUp = y0;
    for (let i = 0; i < 80; i++) {
      updatePlayerPhysics(p, w, i < 2 ? input : noInput(), 0.05);
      maxUp = Math.max(maxUp, p.y);
    }
    expect(maxUp).toBeGreaterThan(y0 + 0.3);
    expect(p.onGround).toBe(true);
  });

  it('玩家无法穿过墙壁', () => {
    const w = flatWorld();
    for (let y = 59; y <= 61; y++) w.setBlock(0, y, -2, BlockId.Brick, false);
    const p = createPlayer(0.5, 59.02, 0.5);
    p.yaw = 0;
    const input = noInput(); input.forward = true;
    for (let i = 0; i < 120; i++) updatePlayerPhysics(p, w, input, 0.05);
    expect(p.z).toBeGreaterThan(-2 + 0.35);
  });

  it('方块与玩家体积重叠检测有效', () => {
    const w = flatWorld();
    const p = createPlayer(0.5, 59.02, 0.5);
    expect(blockOverlapsPlayer(p, 0, 59, 0, PLAYER_HEIGHT_STAND)).toBe(true);
    expect(blockOverlapsPlayer(p, 5, 59, 5, PLAYER_HEIGHT_STAND)).toBe(false);
  });
});

describe('方块射线选取', () => {
  it('射线命中正前方方块并返回法线', () => {
    const w = new World('ray');
    for (let x = 0; x <= 5; x++) for (let y = 19; y <= 22; y++) {
      w.setBlock(x, y, 0, BlockId.Air, false);
      w.setBlock(x, y, -1, BlockId.Air, false);
      w.setBlock(x, y, 1, BlockId.Air, false);
    }
    w.setBlock(5, 20, 0, BlockId.Rock, false);
    const hit = raycastVoxel(w, 0.5, 20.5, 0.5, 1, 0, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBe(5);
    expect(hit!.nx).toBe(-1);
  });
  it('超出距离返回 null', () => {
    const w = new World('ray2');
    w.setBlock(20, 20, 0, BlockId.Rock, false);
    expect(raycastVoxel(w, 0, 20, 0, 1, 0, 0, 5)).toBeNull();
  });
  it('collides 对实心方块为 true', () => {
    const w = new World('col');
    for (let x = 0; x <= 8; x++) for (let z = 0; z <= 8; z++) for (let y = 38; y <= 44; y++) w.setBlock(x, y, z, BlockId.Air, false);
    w.setBlock(2, 40, 2, BlockId.MetalPlate, false);
    expect(collides(w, 2.5, 40, 2.5, 1.8)).toBe(true);
    expect(collides(w, 6.5, 40, 6.5, 1.8)).toBe(false);
  });
});
