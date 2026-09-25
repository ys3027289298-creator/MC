import { describe, it, expect, beforeEach } from 'vitest';
import { GameSave, saveGame, loadGame, clearSave, emptyStats, validateGameSave, SAVE_KEY } from '../src/game/save';
import { World } from '../src/game/world';
import { B } from '../src/game/blocks';
import { Inventory } from '../src/game/inventory';

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
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
}

function validSave(): GameSave {
  const world = new World('validate-seed');
  world.setBlock(8, 40, 8, B.Brazier);
  const inv = new Inventory();
  inv.add('stone_hammer', 1);
  inv.add('deadwood_log', 3);
  return {
    version: 1,
    savedAt: Date.now(),
    playTime: 42,
    seed: world.seed,
    body: { x: 1.5, y: 40, z: -2.5, yaw: 0.5, pitch: -0.2 },
    inventory: inv.toJSON(),
    survival: { health: 80 },
    environment: { day: 2 },
    world: world.toSaveData(),
    quests: { stage: 1 },
    events: [],
    stats: emptyStats(),
    route: 'fortify'
  };
}

// Store a mutated copy of the valid save as raw JSON and return loadGame result.
function loadMutated(storage: Storage, mutate: (save: Record<string, unknown>) => void) {
  const save = JSON.parse(JSON.stringify(validSave())) as Record<string, unknown>;
  mutate(save);
  storage.setItem(SAVE_KEY, JSON.stringify(save));
  return loadGame(storage);
}

describe('save corruption boundary', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeStorage();
  });

  it('round-trips a complete v1 save written by the current version', () => {
    const save = validSave();
    expect(saveGame(save, storage).ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.body.x).toBe(1.5);
      expect(loaded.data.route).toBe('fortify');
      const world = World.fromSaveData(loaded.data.world as never);
      world.ensureChunk(0, 0);
      expect(world.getBlock(8, 40, 8)).toBe(B.Brazier);
      const inv = Inventory.fromJSON(loaded.data.inventory as never);
      expect(inv.has('stone_hammer')).toBe(true);
    }
  });

  it('accepts a valid save with optional world arrays present', () => {
    const save = validSave();
    (save.world as { drops: unknown[] }).drops = [
      { id: 'deadwood_log', count: 2, x: 1, y: 40, z: 1, vy: 0, born: 5 }
    ];
    expect(saveGame(save, storage).ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
  });

  it('rejects an empty slot as "no save" without throwing', () => {
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('没有找到存档');
  });

  it('rejects truncated JSON with a corruption message', () => {
    storage.setItem(SAVE_KEY, '{"version":1,"body":{');
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('存档已损坏');
  });

  it('rejects a top-level array', () => {
    storage.setItem(SAVE_KEY, '[1,2,3]');
    const r = loadGame(storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('存档已损坏');
  });

  it('rejects a non-1 version', () => {
    const r = loadMutated(storage, (s) => {
      s.version = 2;
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a missing body', () => {
    const r = loadMutated(storage, (s) => {
      delete s.body;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('body');
  });

  it('rejects non-finite yaw/pitch given as strings', () => {
    for (const bad of ['NaN', 'Infinity', '-Infinity']) {
      const r = loadMutated(storage, (s) => {
        (s.body as Record<string, unknown>).yaw = bad;
      });
      expect(r.ok).toBe(false);
    }
    const r2 = loadMutated(storage, (s) => {
      (s.body as Record<string, unknown>).pitch = 'Infinity';
    });
    expect(r2.ok).toBe(false);
  });

  it('rejects missing or non-array inventory.slots', () => {
    const missing = loadMutated(storage, (s) => {
      s.inventory = {};
    });
    expect(missing.ok).toBe(false);
    const notArray = loadMutated(storage, (s) => {
      s.inventory = { slots: 'nope' };
    });
    expect(notArray.ok).toBe(false);
  });

  it('rejects negative stack counts and unknown item ids', () => {
    const negative = loadMutated(storage, (s) => {
      (s.inventory as Record<string, unknown>).slots = [{ id: 'deadwood_log', count: -3 }];
    });
    expect(negative.ok).toBe(false);
    const unknown = loadMutated(storage, (s) => {
      (s.inventory as Record<string, unknown>).slots = [{ id: 'cheat_item', count: 1 }];
    });
    expect(unknown.ok).toBe(false);
  });

  it('rejects out-of-range hotbarIndex', () => {
    const high = loadMutated(storage, (s) => {
      (s.inventory as Record<string, unknown>).hotbarIndex = 99;
    });
    expect(high.ok).toBe(false);
    const low = loadMutated(storage, (s) => {
      (s.inventory as Record<string, unknown>).hotbarIndex = -1;
    });
    expect(low.ok).toBe(false);
  });

  it('rejects a malformed armor entry', () => {
    const r = loadMutated(storage, (s) => {
      (s.inventory as Record<string, unknown>).armor = { id: 42, count: 'one' };
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a missing world seed', () => {
    const r = loadMutated(storage, (s) => {
      delete (s.world as Record<string, unknown>).seed;
    });
    expect(r.ok).toBe(false);
  });

  it('rejects wrong-typed world arrays', () => {
    for (const key of ['modifications', 'doors', 'damage', 'containers', 'drops', 'depleted']) {
      const r = loadMutated(storage, (s) => {
        (s.world as Record<string, unknown>)[key] = key === 'modifications' ? 'broken' : 123;
      });
      expect(r.ok).toBe(false);
    }
  });

  it('rejects a container whose slots are not an array', () => {
    const r = loadMutated(storage, (s) => {
      (s.world as Record<string, unknown>).containers = [['1,40,1', 'not-an-array']];
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a malformed drop entry', () => {
    const r = loadMutated(storage, (s) => {
      (s.world as Record<string, unknown>).drops = [{ id: 'deadwood_log', count: 1, x: 'NaN', y: 40, z: 1, vy: 0, born: 0 }];
    });
    expect(r.ok).toBe(false);
  });

  it('rejects null events and malformed event entries', () => {
    const nullEvents = loadMutated(storage, (s) => {
      s.events = null;
    });
    expect(nullEvents.ok).toBe(false);
    const badEntry = loadMutated(storage, (s) => {
      s.events = [{ kind: 'raid' }];
    });
    expect(badEntry.ok).toBe(false);
  });

  it('rejects non-finite stats values', () => {
    const viaString = loadMutated(storage, (s) => {
      (s.stats as Record<string, unknown>).enemiesKilled = 'Infinity';
    });
    expect(viaString.ok).toBe(false);
    const direct = validateGameSave({ ...validSave(), stats: { ...emptyStats(), damageDealt: NaN } });
    expect(direct.ok).toBe(false);
  });

  it('rejects an unknown route', () => {
    const r = loadMutated(storage, (s) => {
      s.route = 'speedrun';
    });
    expect(r.ok).toBe(false);
  });

  it('never throws on hostile storage and keeps the raw save untouched', () => {
    const hostile = {
      getItem: () => {
        throw new Error('quota');
      }
    } as unknown as Storage;
    expect(() => loadGame(hostile)).not.toThrow();
    expect(loadGame(hostile).ok).toBe(false);

    storage.setItem(SAVE_KEY, '{"version":1,"body":{');
    const before = storage.getItem(SAVE_KEY);
    expect(loadGame(storage).ok).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(before);
  });

  it('reads a valid save again after a corrupted one failed', () => {
    storage.setItem(SAVE_KEY, '{ not json');
    expect(loadGame(storage).ok).toBe(false);
    expect(saveGame(validSave(), storage).ok).toBe(true);
    const r = loadGame(storage);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.playTime).toBe(42);
  });

  it('clearSave still removes the slot', () => {
    saveGame(validSave(), storage);
    clearSave(storage);
    expect(loadGame(storage).ok).toBe(false);
  });
});
