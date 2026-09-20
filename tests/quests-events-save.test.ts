import { describe, it, expect, beforeEach } from 'vitest';
import {
  createQuestProgress,
  advanceQuest,
  evaluateEnding,
  QuestContext
} from '../src/game/quests';
import { World } from '../src/game/world';
import { B } from '../src/game/blocks';
import { Inventory } from '../src/game/inventory';
import { Rng } from '../src/game/rng';
import { triggerEvent } from '../src/game/events';
import { GameSave, saveGame, loadGame, clearSave, emptyStats } from '../src/game/save';
import { createBody } from '../src/game/physics';
import { isSolid } from '../src/game/blocks';

function fullCtx(overrides: Partial<QuestContext> = {}): QuestContext {
  const inv = new Inventory();
  // give everything needed for flags
  inv.add('deadwood_log', 8);
  inv.add('gravel_bit', 6);
  inv.add('stone_hammer', 1);
  inv.add('flint_axe', 1);
  inv.add('energy_crystal', 2);
  inv.add('observatory_chart', 1);
  inv.add('ley_detector', 1);
  return {
    hasItem: (id: string, n = 1) => inv.has(id, n),
    placedBlocks: new Set<number>([B.Workbench, B.Strongbox, B.Brazier]),
    nearSite: () => true,
    towerRepaired: true,
    corePlaced: true,
    finalDefended: true,
    ...overrides
  };
}

describe('main quest line', () => {
  it('advances through all stages when objectives are met', () => {
    const p = createQuestProgress();
    advanceQuest(p, {
      ...fullCtx(),
      towerRepaired: false,
      corePlaced: false,
      finalDefended: false
    });
    expect(p.stage).toBe(4);
    advanceQuest(p, fullCtx());
    expect(p.stage).toBe(9);
    expect(p.finished).toBe(true);
  });

  it('blocks at incomplete objectives', () => {
    const p = createQuestProgress();
    advanceQuest(p, fullCtx({ hasItem: () => false }));
    expect(p.stage).toBe(0);
  });

  it('evaluates distinct endings from preparation level', () => {
    const strong = evaluateEnding({
      finished: true,
      buildings: 40,
      kills: 20,
      daysSurvived: 5,
      health: 90,
      hasArmor: true,
      route: 'fortify',
      towerIntact: true
    });
    const weak = evaluateEnding({
      finished: true,
      buildings: 3,
      kills: 1,
      daysSurvived: 2,
      health: 10,
      hasArmor: false,
      route: 'salvage',
      towerIntact: false
    });
    const lost = evaluateEnding({
      finished: false,
      buildings: 0,
      kills: 0,
      daysSurvived: 1,
      health: 0,
      hasArmor: false,
      route: 'fortify',
      towerIntact: false
    });
    expect(strong.id).toBe('golden');
    expect(weak.id).not.toBe('golden');
    expect(lost.id).toBe('lost');
    // two route titles
    const salvage = evaluateEnding({
      finished: true,
      buildings: 50,
      kills: 30,
      daysSurvived: 6,
      health: 80,
      hasArmor: true,
      route: 'salvage',
      towerIntact: true
    });
    expect(salvage.title).toContain('拾荒');
  });
});

describe('dynamic events alter the world/state', () => {
  function setup() {
    const world = new World('events');
    const inv = new Inventory();
    const survival = { health: 100 } as never;
    return {
      world,
      inv,
      ctx: {
        world,
        rng: new Rng(11),
        px: 0,
        py: 35,
        pz: 0,
        inventory: inv,
        survival,
        forceWeather: () => undefined,
        spawnRaid: () => undefined,
        setLeak: () => undefined,
        unlockRecipe: () => undefined,
        migrationActive: 0
      }
    };
  }

  it('collapse actually fills air blocks', () => {
    const { world, ctx } = setup();
    const c = world.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.set(x, 30, z, B.Rock);
    const ev = triggerEvent('collapse', ctx, 0);
    expect(ev.detail).toContain('坍塌');
    let shale = 0;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (world.getBlock(x, 31, z) === B.DeepShale) shale++;
    expect(shale).toBeGreaterThan(0);
  });

  it('caravan places a reachable strongbox with supplies', () => {
    const { world, ctx } = setup();
    world.ensureChunk(0, 0);
    triggerEvent('caravan', ctx, 0);
    expect(world.containers.size).toBeGreaterThan(0);
  });

  it('mechanism grants a relic token', () => {
    const { ctx, inv } = setup();
    triggerEvent('mechanism', ctx, 0);
    expect(inv.has('relic_token')).toBe(true);
  });
});

describe('building save/load & collision', () => {
  let storage: Storage;
  beforeEach(() => {
    const map = new Map<string, string>();
    storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: () => null,
      get length() {
        return map.size;
      }
    } as unknown as Storage;
  });

  it('placed blocks persist and remain solid after reload', () => {
    const world = new World('save-1');
    world.ensureChunk(0, 0);
    world.setBlock(8, 40, 8, B.TimberPlank, { hp: 60 });
    const data = world.toSaveData();
    const restored = World.fromSaveData(data);
    restored.ensureChunk(0, 0);
    expect(restored.getBlock(8, 40, 8)).toBe(B.TimberPlank);
    expect(isSolid(restored.getBlock(8, 40, 8))).toBe(true);
  });

  it('saves and restores a full game state', () => {
    const world = new World('save-2');
    world.setBlock(8, 40, 8, B.Brazier);
    const inv = new Inventory();
    inv.add('stone_hammer', 1);
    const body = createBody(3, 40, 4);
    const save: GameSave = {
      version: 1,
      savedAt: Date.now(),
      playTime: 123,
      seed: world.seed,
      body: { x: body.x, y: body.y, z: body.z, yaw: 1, pitch: 0.2 },
      inventory: inv.toJSON(),
      survival: { health: 77 },
      environment: { day: 3 },
      world: world.toSaveData(),
      quests: { stage: 2 },
      events: [],
      stats: emptyStats(),
      route: 'salvage'
    };
    expect(saveGame(save, storage).ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.playTime).toBe(123);
      const restoredWorld = World.fromSaveData(loaded.data.world as never);
      restoredWorld.ensureChunk(0, 0);
      expect(restoredWorld.getBlock(8, 40, 8)).toBe(B.Brazier);
    }
  });

  it('reports corruption instead of crashing', () => {
    storage.setItem('wasteland-grids-save-v1', '{ not json');
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
  });

  it('clearSave removes the slot', () => {
    clearSave(storage);
    expect(loadGame(storage).ok).toBe(false);
  });
});
