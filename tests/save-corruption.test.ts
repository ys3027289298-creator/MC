import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../src/game/world';
import { B } from '../src/game/blocks';
import { Inventory } from '../src/game/inventory';
import { createSurvival, createEnvironment } from '../src/game/survival';
import { createQuestProgress } from '../src/game/quests';
import {
  GameSave,
  SAVE_KEY,
  saveGame,
  loadGame,
  clearSave,
  emptyStats,
  validateGameSave
} from '../src/game/save';

function memStorage(): { storage: Storage; map: Map<string, string> } {
  const map = new Map<string, string>();
  const storage = {
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
  return { storage, map };
}

// A complete v1 save exactly as the current writer produces it.
function validSave(): GameSave {
  const world = new World('corrupt-seed');
  world.ensureChunk(0, 0);
  world.setBlock(8, 40, 8, B.Brazier);
  const inv = new Inventory();
  inv.add('stone_hammer', 1);
  inv.add('deadwood_log', 3);
  return {
    version: 1,
    savedAt: Date.now(),
    playTime: 42,
    seed: world.seed,
    body: { x: 1.5, y: 40, z: 2.5, yaw: 0.5, pitch: -0.1 },
    inventory: inv.toJSON(),
    survival: { ...createSurvival(), health: 77 },
    environment: { ...createEnvironment(), day: 3 },
    world: world.toSaveData(),
    quests: { ...createQuestProgress(), stage: 2 },
    events: [{ kind: 'caravan', title: '商队', time: 12, detail: '商队到访。' }],
    stats: { ...emptyStats(), blocksMined: 9 },
    route: 'salvage'
  };
}

// Mutate a valid save, serialize and return the raw string.
function rawOf(mutate: (save: Record<string, unknown>) => void): string {
  const save = validSave() as unknown as Record<string, unknown>;
  mutate(save);
  return JSON.stringify(save);
}

describe('save corruption boundary', () => {
  let storage: Storage;
  let map: Map<string, string>;
  beforeEach(() => {
    ({ storage, map } = memStorage());
  });

  it('round-trips a complete v1 save unchanged', () => {
    const save = validSave();
    expect(saveGame(save, storage).ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.data.playTime).toBe(42);
    expect(loaded.data.body).toEqual({ x: 1.5, y: 40, z: 2.5, yaw: 0.5, pitch: -0.1 });
    expect(loaded.data.route).toBe('salvage');
    expect(loaded.data.stats.blocksMined).toBe(9);
    const world = World.fromSaveData(loaded.data.world as never);
    world.ensureChunk(0, 0);
    expect(world.getBlock(8, 40, 8)).toBe(B.Brazier);
    const inv = Inventory.fromJSON(loaded.data.inventory as never);
    expect(inv.has('stone_hammer', 1)).toBe(true);
    expect(inv.has('deadwood_log', 3)).toBe(true);
  });

  it('round-trips containers, drops and optional world arrays', () => {
    const save = validSave();
    const world = save.world as ReturnType<World['toSaveData']>;
    world.containers = [['1,30,1', [{ id: 'gravel_bit', count: 4 }, null]]];
    world.drops = [{ id: 'deadwood_log', count: 2, x: 1, y: 30, z: 1, vy: 0, born: 5 }];
    world.doors = ['2,30,2'];
    world.depleted = ['3,30,3'];
    world.damage = [['4,30,4', 12]];
    expect(saveGame(save, storage).ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const restored = World.fromSaveData(loaded.data.world as never);
    expect(restored.containers.get('1,30,1')?.[0]).toEqual({ id: 'gravel_bit', count: 4 });
    expect(restored.drops).toHaveLength(1);
    expect(restored.doorOpen.has('2,30,2')).toBe(true);
    expect(restored.depleted.has('3,30,3')).toBe(true);
    expect(restored.blockHp.get('4,30,4')).toBe(12);
  });

  it('reports an empty slot and an empty string as "no save"', () => {
    const missing = loadGame(storage);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('没有找到存档');
    storage.setItem(SAVE_KEY, '');
    const empty = loadGame(storage);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain('没有找到存档');
  });

  it('rejects truncated JSON with a corruption message', () => {
    const raw = JSON.stringify(validSave());
    storage.setItem(SAVE_KEY, raw.slice(0, 40));
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('存档已损坏');
  });

  it('rejects a top-level array and other non-object roots', () => {
    storage.setItem(SAVE_KEY, '[]');
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(SAVE_KEY, '123');
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(SAVE_KEY, '"save"');
    expect(loadGame(storage).ok).toBe(false);
  });

  it('rejects a non-v1 version', () => {
    storage.setItem(SAVE_KEY, rawOf((s) => (s.version = 2)));
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('版本');
  });

  it('rejects a missing body and non-finite body values', () => {
    storage.setItem(SAVE_KEY, rawOf((s) => delete s.body));
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(
      SAVE_KEY,
      rawOf((s) => ((s.body as Record<string, unknown>).yaw = 'Infinity'))
    );
    expect(loadGame(storage).ok).toBe(false);
    // NaN serializes to null; the finite-number check must still reject it.
    storage.setItem(
      SAVE_KEY,
      rawOf((s) => ((s.body as Record<string, unknown>).pitch = Number.NaN))
    );
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('body.pitch');
  });

  it('rejects missing or non-array inventory.slots and negative stacks', () => {
    storage.setItem(SAVE_KEY, rawOf((s) => (s.inventory = { hotbarIndex: 0 })));
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(SAVE_KEY, rawOf((s) => (s.inventory = { slots: 'full' })));
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(
      SAVE_KEY,
      rawOf((s) => ((s.inventory as Record<string, unknown>).slots = [{ id: 'deadwood_log', count: -2 }]))
    );
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('堆叠');
  });

  it('rejects an out-of-range hotbarIndex and malformed armor', () => {
    storage.setItem(
      SAVE_KEY,
      rawOf((s) => ((s.inventory as Record<string, unknown>).hotbarIndex = 99))
    );
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('hotbarIndex');
    storage.setItem(
      SAVE_KEY,
      rawOf((s) => ((s.inventory as Record<string, unknown>).armor = { id: 7, count: 'one' }))
    );
    expect(loadGame(storage).ok).toBe(false);
  });

  it('rejects a missing world.seed and malformed world arrays', () => {
    storage.setItem(SAVE_KEY, rawOf((s) => delete (s.world as Record<string, unknown>).seed));
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(SAVE_KEY, rawOf((s) => ((s.world as Record<string, unknown>).modifications = {})));
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(SAVE_KEY, rawOf((s) => ((s.world as Record<string, unknown>).doors = [42])));
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(SAVE_KEY, rawOf((s) => ((s.world as Record<string, unknown>).damage = [['k', 'hp']])));
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(SAVE_KEY, rawOf((s) => ((s.world as Record<string, unknown>).depleted = 'none')));
    expect(loadGame(storage).ok).toBe(false);
  });

  it('rejects a container whose slots are not an array', () => {
    storage.setItem(
      SAVE_KEY,
      rawOf((s) => ((s.world as Record<string, unknown>).containers = [['1,30,1', 'full']]))
    );
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('槽位');
  });

  it('rejects malformed drops', () => {
    storage.setItem(
      SAVE_KEY,
      rawOf((s) => ((s.world as Record<string, unknown>).drops = [{ id: 'deadwood_log', count: 1 }]))
    );
    expect(loadGame(storage).ok).toBe(false);
    storage.setItem(SAVE_KEY, rawOf((s) => ((s.world as Record<string, unknown>).drops = 'many')));
    expect(loadGame(storage).ok).toBe(false);
  });

  it('rejects null events and malformed event entries', () => {
    storage.setItem(SAVE_KEY, rawOf((s) => (s.events = null as unknown as unknown[])));
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('events');
    storage.setItem(SAVE_KEY, rawOf((s) => (s.events = [{ kind: 'raid' }] as unknown as unknown[])));
    expect(loadGame(storage).ok).toBe(false);
  });

  it('rejects non-finite stats values', () => {
    storage.setItem(
      SAVE_KEY,
      rawOf((s) => ((s.stats as Record<string, unknown>).blocksMined = Number.POSITIVE_INFINITY))
    );
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('stats');
  });

  it('rejects an unknown route', () => {
    storage.setItem(SAVE_KEY, rawOf((s) => (s.route = 'wander' as never)));
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('route');
  });

  it('never throws on hostile storage and never deletes the raw save', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      }
    } as unknown as Storage;
    expect(() => loadGame(throwing)).not.toThrow();
    const denied = loadGame(throwing);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toContain('无法读取');

    storage.setItem(SAVE_KEY, '{ not json');
    const before = map.get(SAVE_KEY);
    expect(loadGame(storage).ok).toBe(false);
    expect(map.get(SAVE_KEY)).toBe(before);
  });

  it('validateGameSave is a pure function of its input', () => {
    const good = JSON.parse(JSON.stringify(validSave()));
    expect(validateGameSave(good).ok).toBe(true);
    expect(() => validateGameSave(undefined)).not.toThrow();
    expect(validateGameSave(undefined).ok).toBe(false);
    expect(validateGameSave(null).ok).toBe(false);
  });

  it('loads a valid save again after a corrupted attempt', () => {
    storage.setItem(SAVE_KEY, '{ broken');
    expect(loadGame(storage).ok).toBe(false);
    expect(saveGame(validSave(), storage).ok).toBe(true);
    const r = loadGame(storage);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.playTime).toBe(42);
  });

  it('clearSave still removes the slot', () => {
    saveGame(validSave(), storage);
    clearSave(storage);
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('没有找到存档');
  });
});
