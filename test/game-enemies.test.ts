import { describe, it, expect } from 'vitest';
import { Game } from '../src/game';
import { World } from '../src/core/world';
import { BlockId } from '../src/core/blocks';
import { createPlayer } from '../src/core/player';
import { createEnv } from '../src/core/environment';
import { createQuestState } from '../src/core/quests';
import { Inventory } from '../src/core/inventory';
import { Rng } from '../src/core/rng';
import { spawnEnemy } from '../src/core/enemies';

// 不构造真实渲染器/DOM，直接装配 Game 运行 tick 所需的最小字段
function makeGame() {
  const g = Object.create(Game.prototype) as any;
  g.world = new World('game-enemy-it');
  for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) g.world.setBlock(x, 30, z, BlockId.Rock, false);
  g.player = createPlayer(2.5, 31.02, 0.5);
  g.player.food = 50; // 关闭饱食回血，便于精确断言
  g.env = createEnv();
  g.quest = createQuestState();
  g.rng = new Rng(1);
  g.inventory = new Inventory(24);
  g.enemies = [];
  g.dropped = [];
  g.events = [];
  g.chests = new Map();
  g.projectiles = [];
  g.stats = { buildings: 0, mined: 0, kills: 0, playTime: 0 };
  g.settings = { deathDrop: 'none', sensitivity: 1, renderDistance: 0 };
  g.input = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, crouch: false };
  g.mouseDown = {};
  g.activeHotbar = 0;
  g.attackCd = 0;
  g.breaking = null;
  g.mode = 'play';
  g.paused = false;
  g.ended = false;
  g.finalWave = 0;
  g.finalWaveTimer = 0;
  g.finalActive = false;
  g.eventTimer = 9999;
  g.enemyTimer = 9999;
  g.containerOpen = false;
  g.buildingHitTimers = new Map();
  g.scene = {
    updatePlayerLight() {}, updateChunks() {}, showHighlight() {}, hideHighlight() {},
    camera: { position: { copy() {} }, lookAt() {} },
  };
  g.ui = {
    setBars() {}, setEnv() {}, setObjective() {}, toast() {},
    flashHurt() {}, showDeath() {}, show() {}, hide() {},
  };
  g.entities = { syncEnemies() {}, syncItems() {} };
  g.projs = { sync() {} };
  return g as Game;
}

function rockWall(g: Game, x: number): void {
  for (let y = 31; y <= 34; y++) for (let dz = -2; dz <= 2; dz++) g.world.setBlock(x, y, dz, BlockId.Rock, false);
}

describe('Game 层集成：可见性契约', () => {
  it('Game.update：遮挡期间玩家生命值保持不变', () => {
    const g = makeGame();
    rockWall(g, 1); // 敌人与玩家之间的实体墙
    g.enemies.push(spawnEnemy('duststalker', -0.5, 31.02, 0.5));
    const hp0 = g.player.hp;
    for (let i = 0; i < 80; i++) g.update(0.05);
    expect(g.player.hp).toBe(hp0);
    expect(g.player.alive).toBe(true);
    // 拆除墙体后敌人应能恢复攻击
    for (let y = 31; y <= 34; y++) for (let dz = -2; dz <= 2; dz++) g.world.setBlock(1, y, dz, BlockId.Air, false);
    for (let i = 0; i < 80; i++) g.update(0.05);
    expect(g.player.hp).toBeLessThan(hp0);
  });

  it('Game 层不会二次扣血：同一帧每个敌人只结算一次', () => {
    const g = makeGame();
    g.enemies.push(spawnEnemy('duststalker', 1.5, 31.02, 0.5));
    g.update(0.05);
    expect(g.player.hp).toBe(100 - 8);
    // 再加一个敌人，同一帧各自结算一次
    g.enemies.push(spawnEnemy('cavemaw', 1.5, 31.02, 0.5));
    g.update(0.05);
    expect(g.player.hp).toBe(100 - 8 - 14);
  });

  it('玩家死亡后，后续敌人不再触发新的死亡副作用', () => {
    const g = makeGame();
    let deaths = 0;
    (g.ui as any).showDeath = () => { deaths++; };
    g.player.hp = 5;
    g.enemies.push(spawnEnemy('duststalker', 1.5, 31.02, 0.5));
    g.enemies.push(spawnEnemy('cavemaw', 1.5, 31.02, 0.5));
    g.update(0.05);
    expect(g.player.alive).toBe(false);
    expect(deaths).toBe(1);
    const hpAfter = g.player.hp;
    for (let i = 0; i < 10; i++) g.update(0.05);
    expect(deaths).toBe(1);
    expect(g.player.hp).toBe(hpAfter);
  });

  it('暂停时 update 不产生任何伤害结算', () => {
    const g = makeGame();
    g.enemies.push(spawnEnemy('duststalker', 1.5, 31.02, 0.5));
    (g as any).paused = true;
    for (let i = 0; i < 20; i++) g.update(0.05);
    expect(g.player.hp).toBe(100);
  });

  it('对局结束后 update 不产生任何伤害结算', () => {
    const g = makeGame();
    g.enemies.push(spawnEnemy('duststalker', 1.5, 31.02, 0.5));
    (g as any).ended = true;
    for (let i = 0; i < 20; i++) g.update(0.05);
    expect(g.player.hp).toBe(100);
  });

  it('敌人被移出 enemies 数组后不再造成伤害', () => {
    const g = makeGame();
    g.enemies.push(spawnEnemy('duststalker', 1.5, 31.02, 0.5));
    g.update(0.05);
    expect(g.player.hp).toBe(92);
    g.enemies.length = 0;
    for (let i = 0; i < 40; i++) g.update(0.05);
    expect(g.player.hp).toBe(92);
  });
});
