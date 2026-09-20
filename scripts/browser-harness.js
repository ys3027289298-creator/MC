// 在浏览器页面上下文执行的冒烟动作（通过 page.evaluate 注入）
globalThis.__smoke = {
  state: () => {
    const g = globalThis.__game;
    return {
      mode: g.mode, paused: g.paused, hp: g.player.hp,
      pos: [g.player.x, g.player.y, g.player.z].map((n) => Math.round(n * 10) / 10),
      mined: g.stats.mined, buildings: g.stats.buildings, kills: g.stats.kills,
      stage: g.quest.stage, invUsed: g.inventory.usedSlots(),
      wood: g.inventory.countOf('wood'), enemies: g.enemies.length, time: g.env.time,
    };
  },
  move: () => {
    const g = globalThis.__game;
    g.paused = false;
    g.input.forward = true;
    for (let i = 0; i < 120; i++) g.tick(0.05);
    g.input.forward = false;
  },
  gather: () => {
    const g = globalThis.__game;
    const B = globalThis.__test.BlockId;
    const p = g.player;
    const bx = Math.floor(p.x) + 3, bz = Math.floor(p.z);
    const y = g.world.topSolidY(bx, bz);
    for (let i = 0; i < 5; i++) g.world.setBlock(bx, y + 1 + i, bz, B.Wood, false);
    for (let i = 0; i < 5; i++) g.breakBlock(bx, y + 1 + i, bz, B.Wood, -1);
    for (let i = 0; i < 6; i++) {
      const x = bx + 1, z = bz;
      const yy = g.world.topSolidY(x, z) + 1;
      g.world.setBlock(x, yy, z, B.Gravel, false);
      g.breakBlock(x, yy, z, B.Gravel, -1);
    }
    for (let i = 0; i < 10; i++) g.pickupDrops(0.1);
    return { wood: g.inventory.countOf('wood'), gravel: g.inventory.countOf('gravel'), fiber: g.inventory.countOf('fiber'), mined: g.stats.mined };
  },
  craftAll: () => {
    const g = globalThis.__game;
    const T = globalThis.__test;
    g.inventory.add('rock', 60);
    g.inventory.add('wood', 60);
    g.inventory.add('plank', 40);
    g.inventory.add('ore_scrap', 20);
    g.inventory.add('dirt', 20);
    g.inventory.add('fiber', 30);
    g.inventory.add('sand', 20);
    const out = {};
    for (const id of ['axe1', 'hammer1', 'workbench', 'brazier', 'chest', 'door', 'brick']) {
      const r = T.RECIPES.find((x) => x.id === id);
      out[id] = T.craft(r, g.inventory, true, g.quest.stage);
    }
    g.checkQuestProgress();
    return { out, stage: g.quest.stage, axe: g.inventory.countOf('axe_t1'), hammer: g.inventory.countOf('hammer_t1') };
  },
  build: () => {
    const g = globalThis.__game;
    const B = globalThis.__test.BlockId;
    const p = g.player;
    const placed = [];
    const items = [['workbench', B.Workbench], ['brazier', B.Brazier], ['chest_item', B.Chest], ['door', B.Door]];
    const offsets = [[2, 0], [-2, 0], [2, 2], [-2, -2]];
    items.forEach((pair, slot) => {
      const itemId = pair[0], blockId = pair[1];
      const dx = offsets[slot][0], dz = offsets[slot][1];
      const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
      const y = g.world.topSolidY(x, z) + 1;
      if (g.world.getBlock(x, y, z) !== 0) g.world.setBlock(x, y, z, 0, false);
      g.world.setBlock(x, y - 1, z, B.Brick, false);
      const idx = g.inventory.findItem(itemId);
      if (idx >= 0) {
        g.placeBlock(x, y, z, blockId, idx, itemId);
        if (g.world.getBlock(x, y, z) === blockId) placed.push(itemId);
      }
    });
    g.checkQuestProgress();
    return { placed, stage: g.quest.stage, buildings: g.stats.buildings };
  },
  combat: () => {
    const g = globalThis.__game;
    const T = globalThis.__test;
    const e = T.spawnEnemy('duststalker', g.player.x + 1.5, g.player.y, g.player.z);
    g.enemies.push(e);
    let killed = false;
    for (let i = 0; i < 10; i++) { killed = T.damageEnemy(e, 10); if (killed) { g.onEnemyKilled(e); break; } }
    for (let i = 0; i < 5; i++) g.pickupDrops(0.1);
    return { killed, kills: g.stats.kills };
  },
  events: () => {
    const g = globalThis.__game;
    const before = g.events.length;
    for (let i = 0; i < 20; i++) { g.eventTimer = 0; g.maybeRollEvent(0.05); }
    return { before, after: g.events.length };
  },
  save: () => {
    globalThis.__game.doSave();
    return !!localStorage.getItem('wasteland-leyline-save-v1');
  },
  continueGame: () => {
    const ok = globalThis.__game.continueGame();
    return { ok, seed: globalThis.__game.seed, buildings: globalThis.__game.stats.buildings, stage: globalThis.__game.quest.stage };
  },
  corruptSave: () => {
    localStorage.setItem('wasteland-leyline-save-v1', '{损坏的存档');
  },
  continueCorrupt: () => {
    const before = !!localStorage.getItem('wasteland-leyline-save-v1');
    const ok = globalThis.__game.continueGame();
    return { before, ok, after: !!localStorage.getItem('wasteland-leyline-save-v1') };
  },
  death: () => {
    const g = globalThis.__game;
    g.settings.deathDrop = 'all';
    g.onDeath('测试性死亡');
    return { hp: g.player.hp, alive: g.player.alive, screenShown: !document.getElementById('death-screen').classList.contains('hidden') };
  },
  ending: () => {
    const g = globalThis.__game;
    g.player.alive = true; g.paused = false;
    g.quest.stage = 3;
    g.inventory.add('crystal', 2); g.checkQuestProgress();
    const tower = g.world.findSite('tower');
    tower.repaired = true; g.quest.stage = 4;
    g.quest.flags.obs = true; g.quest.stage = 6;
    g.inventory.add('ley_detector', 1); g.checkQuestProgress();
    g.inventory.add('signal_chip', 1);
    const core = g.world.findSite('core');
    g.player.x = core.x + 0.5; g.player.y = g.world.topSolidY(core.x, core.z) + 2; g.player.z = core.z + 0.5;
    g.tryActivateCore();
    g.debugForceFinalVictory();
    return { ended: g.ended, endingShown: !document.getElementById('ending-screen').classList.contains('hidden'), title: document.getElementById('ending-title').textContent };
  },
};
