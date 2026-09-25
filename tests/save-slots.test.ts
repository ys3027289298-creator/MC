import { describe, it, expect, beforeEach } from 'vitest';
import {
  GameSave,
  emptyStats,
  SAVE_KEY,
  SLOTS_KEY,
  ALL_SLOTS,
  MANUAL_SLOTS,
  AUTO_SLOT,
  saveGame,
  saveToSlot,
  loadSlot,
  deleteSlot,
  listSlots,
  summarizeSave,
  getCurrentSlot,
  setCurrentSlotMarker,
  hasLegacySave,
  migrateLegacySave,
  clearAllSaves
} from '../src/game/save';
import { slotSummaryHtml } from '../src/ui/ui';
import { World } from '../src/game/world';
import { Inventory } from '../src/game/inventory';

function memStorage(): { storage: Storage; map: Map<string, string> } {
  const map = new Map<string, string>();
  const storage = {
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
  return { storage, map };
}

function makeSave(seed: string, playTime: number, day = 2): GameSave {
  const world = new World(seed);
  const inv = new Inventory();
  inv.add('deadwood_log', 3);
  return {
    version: 1,
    savedAt: 1700000000000 + playTime * 1000,
    playTime,
    seed: world.seed,
    body: { x: 1, y: 40, z: 2, yaw: 0.5, pitch: 0 },
    inventory: inv.toJSON(),
    survival: { health: 80 },
    environment: { day },
    world: world.toSaveData(),
    quests: { stage: 1 },
    events: [],
    stats: emptyStats(),
    route: 'salvage'
  };
}

let storage: Storage;
let map: Map<string, string>;
beforeEach(() => {
  ({ storage, map } = memStorage());
});

describe('multi-slot save envelope', () => {
  it('keeps three manual slots fully independent', () => {
    expect(saveToSlot('slot1', makeSave('A', 10), storage).ok).toBe(true);
    expect(saveToSlot('slot2', makeSave('B', 20), storage).ok).toBe(true);
    expect(saveToSlot('slot3', makeSave('C', 30), storage).ok).toBe(true);
    for (const [id, t] of [['slot1', 10], ['slot2', 20], ['slot3', 30]] as const) {
      const r = loadSlot(id, storage);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.playTime).toBe(t);
    }
  });

  it('keeps the auto slot independent from manual slots', () => {
    saveToSlot('slot1', makeSave('M', 5), storage);
    saveToSlot(AUTO_SLOT, makeSave('AUTO', 99), storage, { allowAuto: true });
    const manual = loadSlot('slot1', storage);
    const auto = loadSlot(AUTO_SLOT, storage);
    expect(manual.ok && manual.data.playTime).toBe(5);
    expect(auto.ok && auto.data.playTime).toBe(99);
  });

  it('rejects manual writes to the auto slot', () => {
    const r = saveToSlot(AUTO_SLOT, makeSave('X', 1), storage);
    expect(r.ok).toBe(false);
    expect(listSlots(storage).slots.find((s) => s.id === AUTO_SLOT)?.state).toBe('empty');
  });

  it('reports an all-empty listing on empty storage without throwing', () => {
    const listing = listSlots(storage);
    expect(listing.slots.map((s) => s.id)).toEqual([...ALL_SLOTS]);
    expect(listing.slots.every((s) => s.state === 'empty')).toBe(true);
    expect(listing.currentSlot).toBeNull();
    expect(loadSlot('slot1', storage).ok).toBe(false);
  });

  it('isolates a single corrupted slot from the others', () => {
    saveToSlot('slot1', makeSave('OK', 7), storage);
    saveToSlot('slot2', makeSave('BAD', 8), storage);
    const env = JSON.parse(map.get(SLOTS_KEY)!);
    env.slots.slot2 = { summary: null, save: { version: 1 } };
    map.set(SLOTS_KEY, JSON.stringify(env));
    const listing = listSlots(storage);
    expect(listing.slots.find((s) => s.id === 'slot2')?.state).toBe('corrupt');
    expect(listing.slots.find((s) => s.id === 'slot1')?.state).toBe('ok');
    expect(loadSlot('slot1', storage).ok).toBe(true);
    expect(loadSlot('slot2', storage).ok).toBe(false);
  });

  it('survives a fully corrupted envelope with a clear error path', () => {
    map.set(SLOTS_KEY, '{ not json');
    const listing = listSlots(storage);
    expect(listing.envelopeError).toBeTruthy();
    expect(listing.slots.every((s) => s.state === 'empty')).toBe(true);
    const r = loadSlot('slot1', storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('损坏');
  });

  it('overwrites the same slot in place without duplicate keys', () => {
    saveToSlot('slot1', makeSave('A', 100), storage);
    saveToSlot('slot1', makeSave('A', 200), storage);
    saveToSlot('slot1', makeSave('A', 300), storage);
    expect(map.size).toBe(1);
    const env = JSON.parse(map.get(SLOTS_KEY)!);
    expect(Object.keys(env.slots)).toEqual(['slot1']);
    const r = loadSlot('slot1', storage);
    expect(r.ok && r.data.playTime).toBe(300);
  });

  it('deletes one slot while the others stay loadable', () => {
    saveToSlot('slot1', makeSave('A', 1), storage);
    saveToSlot('slot2', makeSave('B', 2), storage);
    expect(getCurrentSlot(storage)).toBe('slot2');
    expect(deleteSlot('slot2', storage).ok).toBe(true);
    expect(loadSlot('slot2', storage).ok).toBe(false);
    expect(loadSlot('slot1', storage).ok).toBe(true);
    expect(getCurrentSlot(storage)).toBeNull();
  });

  it('tracks the current slot marker across writes and resets', () => {
    saveToSlot('slot3', makeSave('A', 1), storage);
    expect(getCurrentSlot(storage)).toBe('slot3');
    setCurrentSlotMarker(null, storage);
    expect(getCurrentSlot(storage)).toBeNull();
    expect(loadSlot('slot3', storage).ok).toBe(true);
  });

  it('clearAllSaves removes both the envelope and the legacy key', () => {
    saveToSlot('slot1', makeSave('A', 1), storage);
    saveGame(makeSave('L', 2), storage);
    clearAllSaves(storage);
    expect(map.size).toBe(0);
    expect(listSlots(storage).slots.every((s) => s.state === 'empty')).toBe(true);
  });
});

describe('legacy v1 single-save compatibility', () => {
  it('migrates the legacy save into a definite manual slot on demand', () => {
    saveGame(makeSave('LEGACY', 42), storage);
    expect(hasLegacySave(storage)).toBe(true);
    const m = migrateLegacySave(storage);
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.slot).toBe('slot1');
    expect(map.has(SAVE_KEY)).toBe(false);
    const r = loadSlot('slot1', storage);
    expect(r.ok && r.data.playTime).toBe(42);
  });

  it('never silently drops the legacy save when all manual slots are full', () => {
    saveToSlot('slot1', makeSave('A', 1), storage);
    saveToSlot('slot2', makeSave('B', 2), storage);
    saveToSlot('slot3', makeSave('C', 3), storage);
    saveGame(makeSave('LEGACY', 9), storage);
    const m = migrateLegacySave(storage);
    expect(m.ok).toBe(false);
    expect(map.has(SAVE_KEY)).toBe(true);
  });

  it('builds a safe summary for legacy saves missing metadata', () => {
    const save = makeSave('LEGACY', 5) as unknown as Record<string, unknown>;
    delete save.savedAt;
    delete save.playTime;
    delete save.environment;
    delete save.route;
    saveGame(save as unknown as GameSave, storage);
    const m = migrateLegacySave(storage);
    expect(m.ok).toBe(true);
    const info = listSlots(storage).slots.find((s) => s.id === 'slot1');
    expect(info?.state).toBe('ok');
    expect(info?.summary?.savedAt).toBe(0);
    expect(info?.summary?.day).toBe(1);
    expect(info?.summary?.route).toBe('fortify');
  });

  it('summarizeSave sanitizes NaN and negative values', () => {
    const s = summarizeSave({ savedAt: NaN, playTime: -5, environment: { day: -3 } as never });
    expect(s.savedAt).toBe(0);
    expect(s.playTime).toBe(0);
    expect(s.day).toBe(1);
  });
});

describe('slot summary rendering', () => {
  it('renders corrupt and unknown-time summaries safely', () => {
    expect(slotSummaryHtml({ id: 'slot1', state: 'corrupt', error: 'x' })).toContain('损坏');
    const html = slotSummaryHtml({
      id: 'slot1',
      state: 'ok',
      summary: { seed: '<b>bad</b>', route: 'salvage', day: NaN, playTime: 61, savedAt: 0 }
    });
    expect(html).toContain('时间未知');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>bad</b>');
  });

  it('shows an explicit empty state', () => {
    expect(slotSummaryHtml({ id: 'slot2', state: 'empty' })).toContain('空闲');
  });
});
