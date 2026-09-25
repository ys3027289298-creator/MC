import { describe, it, expect, vi, beforeAll } from 'vitest';

// Game 依赖 WebGL 与 DOM，这里用桩替换渲染与 UI 层，专注验证核心结算逻辑
vi.mock('../src/render/scene', () => ({
  GameScene: class {
    scene = {};
    camera = { position: { copy() { /* stub */ } }, lookAt() { /* stub */ }, aspect: 1, updateProjectionMatrix() { /* stub */ } };
    updatePlayerLight() { /* stub */ }
    updateChunks() { /* stub */ }
    showHighlight() { /* stub */ }
    hideHighlight() { /* stub */ }
    updateSky() { /* stub */ }
    render() { /* stub */ }
  },
  lightLevelAt: () => 1,
}));
vi.mock('../src/render/entities', () => ({
  EntityRenderer: class { syncEnemies() { /* stub */ } syncItems() { /* stub */ } },
  ProjectileRenderer: class { sync() { /* stub */ } },
}));
vi.mock('../src/ui', () => ({
  UI: class {
    selectedInv = -1;
    selectHotbar?: (i: number) => void;
    onCraft?: () => void;
    onChestSlot?: () => void;
    show() { /* stub */ } hide() { /* stub */ } visible() { return false; }
    toast() { /* stub */ } setBars() { /* stub */ } setEnv() { /* stub */ }
    flashHurt() { /* stub */ } showDeath() { /* stub */ } setHeldName() { /* stub */ }
    setObjective() { /* stub */ } setBreakProgress() { /* stub */ }
    renderHotbar() { /* stub */ } renderInventory() { /* stub */ }
    renderJournal() { /* stub */ } renderChest() { /* stub */ }
  },
}));

import { Game } from '../src/game';
import { World } from '../src/core/world';
import { BlockId } from '../src/core/blocks';
import { createPlayer } from '../src/core/player';
import { spawnEnemy, ENEMY_DEFS } from '../src/core/enemies';

beforeAll(() => {
  for (const id of ['btn-split', 'btn-drop', 'btn-close-inv', 'btn-close-chest', 'btn-close-journal']) {
    const el = document.createElement('button');
    el.id = id;
    document.body.appendChild(el);
  }
});

function arenaWorld(withWall: boolean): World {
  const w = new World('enemy-arena');
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) w.setBlock(x, 30, z, BlockId.Rock, false);
  if (withWall) {
    w.setBlock(1, 31, 0, BlockId.Brick, false);
    w.setBlock(1, 32, 0, BlockId.Brick, false);
  }
  return w;
}

function makeGame(withWall: boolean): Game {
  const canvas = document.createElement('canvas');
  const game = new Game(canvas, { deathDrop: 'none', sensitivity: 1, renderDistance: 0 });
  game.world = arenaWorld(withWall);
  game.player = createPlayer(1.9, 31.02, 0.5);
  game.enemies = [spawnEnemy('duststalker', 0.5, 31.02, 0.5)];
  game.mode = 'play';
  (game as unknown as { paused: boolean }).paused = false;
  return game;
}

describe('Game.update 敌人伤害集成', () => {
  it('集成：实体墙遮挡期间 Game.update 不扣玩家生命', () => {
    const game = makeGame(true);
    const hp0 = game.player.hp;
    for (let i = 0; i < 40; i++) game.update(0.05);
    expect(game.player.hp).toBe(hp0);
    expect(game.enemies[0].state).not.toBe('attack');
  });

  it('无遮挡时 Game 层按敌人伤害精确扣血一次（不二次扣血）', () => {
    const game = makeGame(false);
    for (let i = 0; i < 10; i++) game.update(0.05); // 0.5s，冷却 1.2s 内只命中一次
    // 生存系统有少量回血，关键是只结算了一次 8 点伤害而非两次
    expect(game.player.hp).toBeGreaterThan(100 - ENEMY_DEFS.duststalker.damage - 0.5);
    expect(game.player.hp).toBeLessThan(100 - ENEMY_DEFS.duststalker.damage + 1.5);
  });

  it('多个敌人同一帧逐个结算', () => {
    const game = makeGame(false);
    game.enemies.push(spawnEnemy('duststalker', 0.5, 31.02, 0.5));
    game.update(0.05);
    expect(game.player.hp).toBeCloseTo(100 - ENEMY_DEFS.duststalker.damage * 2, 0);
  });

  it('玩家死亡后后续敌人不再触发新的伤害与死亡副作用', () => {
    const game = makeGame(false);
    game.enemies.push(spawnEnemy('cavemaw', 0.5, 31.02, 0.5));
    game.player.hp = ENEMY_DEFS.duststalker.damage; // 第一个敌人恰好击倒
    game.update(0.05);
    expect(game.player.alive).toBe(false);
    expect(game.player.hp).toBe(0); // 第二个敌人的伤害没有继续结算
  });

  it('暂停时 update 不产生任何伤害', () => {
    const game = makeGame(false);
    (game as unknown as { paused: boolean }).paused = true;
    for (let i = 0; i < 20; i++) game.update(0.05);
    expect(game.player.hp).toBe(100);
  });

  it('对局结束后 update 不产生任何伤害', () => {
    const game = makeGame(false);
    (game as unknown as { ended: boolean }).ended = true;
    for (let i = 0; i < 20; i++) game.update(0.05);
    expect(game.player.hp).toBe(100);
  });
});
