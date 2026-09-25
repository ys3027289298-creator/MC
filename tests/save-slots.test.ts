import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GameSave,
  emptyStats,
  saveGame,
  loadGame,
  hasSave,
  SAVE_KEY,
  SLOT_IDS,
  MANUAL_SLOT_IDS,
  AUTO_SLOT_ID,
  slotKey,
  saveToSlot,
  loadSlot,
  listSlots,
  deleteSlot,
  buildSummary,
  migrateLegacySave,
  firstEmptyManualSlot,
  clearAllSaves,
  readCurrentSlot,
  writeCurrentSlot,
  formatPlayTime,
  formatSavedAt,
  CURRENT_SLOT_KEY
} from '../src/game/save';
import { World } from '../src/game/world';
import { Inventory } from '../src/game/inventory';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    }
  } as Storage;
}

function makeSave(seed: string, playTime = 10): GameSave {
  const world = new World(seed);
  const inv = new Inventory();
  inv.add('deadwood_log', 3);
  return {
    version: 1,
    savedAt: Date.now(),
    playTime,
    seed,
    body: { x: 1, y: 40, z: 2, yaw: 0.5, pitch: 0 },
    inventory: inv.toJSON(),
    survival: { health: 80 },
    environment: { day: 2 },
    world: world.toSaveData(),
    quests: { stage: 1, route: 'fortify' },
    events: [],
    stats: emptyStats(),
    route: 'fortify'
  };
}

describe('multi-slot saves', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeStorage();
  });

  it('keeps three manual slots independent from each other', () => {
    expect(saveToSlot('manual-1', makeSave('ALPHA'), storage).ok).toBe(true);
    expect(saveToSlot('manual-2', makeSave('BRAVO'), storage).ok).toBe(true);
    expect(saveToSlot('manual-3', makeSave('CHARLIE'), storage).ok).toBe(true);
    const a = loadSlot('manual-1', storage);
    const b = loadSlot('manual-2', storage);
    const c = loadSlot('manual-3', storage);
    expect(a.ok && a.data.seed).toBe('ALPHA');
    expect(b.ok && b.data.seed).toBe('BRAVO');
    expect(c.ok && c.data.seed).toBe('CHARLIE');
  });

  it('lists slots in stable order with the auto slot last', () => {
    saveToSlot(AUTO_SLOT_ID, makeSave('AUTO'), storage, 'auto');
    saveToSlot('manual-2', makeSave('MID'), storage);
    const slots = listSlots(storage);
    expect(slots.map((s) => s.id)).toEqual([...SLOT_IDS]);
    expect(slots[1].state).toBe('ok');
    expect(slots[1].summary?.seed).toBe('MID');
    expect(slots[3].kind).toBe('auto');
    expect(slots[3].summary?.seed).toBe('AUTO');
    expect(slots[0].state).toBe('empty');
  });

  it('rejects manual writes to the auto slot', () => {
    const r = saveToSlot(AUTO_SLOT_ID, makeSave('X'), storage, 'manual');
    expect(r.ok).toBe(false);
    expect(loadSlot(AUTO_SLOT_ID, storage).ok).toBe(false);
  });

  it('overwrites the same slot without duplicating keys on repeated saves', () => {
    saveToSlot('manual-1', makeSave('FIRST', 5), storage);
    saveToSlot('manual-1', makeSave('SECOND', 9), storage);
    saveToSlot('manual-1', makeSave('SECOND', 12), storage);
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i)!);
    expect(keys.filter((k) => k === slotKey('manual-1'))).toHaveLength(1);
    const loaded = loadSlot('manual-1', storage);
    expect(loaded.ok && loaded.data.seed).toBe('SECOND');
    expect(loaded.ok && loaded.data.playTime).toBe(12);
  });

  it('deletes one slot while the others stay loadable', () => {
    saveToSlot('manual-1', makeSave('KEEP-1'), storage);
    saveToSlot('manual-2', makeSave('DROP'), storage);
    saveToSlot('manual-3', makeSave('KEEP-3'), storage);
    deleteSlot('manual-2', storage);
    expect(loadSlot('manual-2', storage).ok).toBe(false);
    const a = loadSlot('manual-1', storage);
    const c = loadSlot('manual-3', storage);
    expect(a.ok && a.data.seed).toBe('KEEP-1');
    expect(c.ok && c.data.seed).toBe('KEEP-3');
  });

  it('reports an empty slot without throwing', () => {
    const r = loadSlot('manual-3', storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('空');
    expect(listSlots(storage).every((s) => s.state === 'empty')).toBe(true);
  });

  it('isolates a single corrupted slot from the others', () => {
    saveToSlot('manual-1', makeSave('GOOD'), storage);
    saveToSlot('manual-2', makeSave('BAD'), storage);
    storage.setItem(slotKey('manual-2'), '{"version":2,"slotId":"manual-2","summ');
    const slots = listSlots(storage);
    expect(slots.find((s) => s.id === 'manual-2')?.state).toBe('corrupt');
    expect(slots.find((s) => s.id === 'manual-1')?.state).toBe('ok');
    const good = loadSlot('manual-1', storage);
    expect(good.ok && good.data.seed).toBe('GOOD');
    expect(loadSlot('manual-2', storage).ok).toBe(false);
  });

  it('survives every slot being corrupted', () => {
    for (const id of SLOT_IDS) storage.setItem(slotKey(id), '{ not json');
    const slots = listSlots(storage);
    expect(slots).toHaveLength(4);
    expect(slots.every((s) => s.state === 'corrupt')).toBe(true);
    expect(slots.every((s) => typeof s.error === 'string' && s.error.length > 0)).toBe(true);
  });

  it('rejects an envelope whose inner game save is invalid', () => {
    storage.setItem(
      slotKey('manual-1'),
      JSON.stringify({ version: 2, slotId: 'manual-1', summary: {}, data: { version: 1 } })
    );
    expect(listSlots(storage)[0].state).toBe('corrupt');
    expect(loadSlot('manual-1', storage).ok).toBe(false);
  });

  it('migrates a legacy v1 save into an explicit slot on demand', () => {
    const legacy = makeSave('LEGACY', 42);
    // legacy saves may miss slot-era metadata like environment.day
    (legacy.environment as Record<string, unknown>) = {};
    saveGame(legacy, storage);
    expect(hasSave(storage)).toBe(true);
    const target = firstEmptyManualSlot(storage);
    expect(target).toBe('manual-1');
    const migrated = migrateLegacySave('manual-1', storage);
    expect(migrated.ok).toBe(true);
    expect(hasSave(storage)).toBe(false);
    const loaded = loadSlot('manual-1', storage);
    expect(loaded.ok && loaded.data.seed).toBe('LEGACY');
    expect(loaded.ok && loaded.summary.day).toBe(1);
    expect(loaded.ok && loaded.summary.playTime).toBe(42);
  });

  it('keeps the legacy save when migration cannot complete', () => {
    saveGame(makeSave('LEGACY'), storage);
    saveToSlot('manual-1', makeSave('OCCUPIED'), storage);
    const r = migrateLegacySave('manual-1', storage);
    expect(r.ok).toBe(false);
    expect(hasSave(storage)).toBe(true);
    storage.setItem(SAVE_KEY, '{ broken');
    const r2 = migrateLegacySave('manual-2', storage);
    expect(r2.ok).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe('{ broken');
  });

  it('refuses to migrate onto an occupied slot', () => {
    saveGame(makeSave('LEGACY'), storage);
    saveToSlot('manual-2', makeSave('BUSY'), storage);
    expect(firstEmptyManualSlot(storage)).toBe('manual-1');
    expect(migrateLegacySave('manual-2', storage).ok).toBe(false);
    const busy = loadSlot('manual-2', storage);
    expect(busy.ok && busy.data.seed).toBe('BUSY');
  });

  it('generates safe summaries and display strings for bad metadata', () => {
    const save = makeSave('WEIRD');
    save.playTime = Number.NaN;
    save.savedAt = -5 as number;
    (save as { route: unknown }).route = 'unknown-route';
    const summary = buildSummary(save, 1000);
    expect(summary.playTime).toBe(0);
    expect(summary.savedAt).toBe(1000);
    expect(summary.route).toBe('fortify');
    expect(formatPlayTime(Number.NaN)).toBe('时长未知');
    expect(formatPlayTime(75)).toBe('1分15秒');
    expect(formatSavedAt(Number.NaN)).toBe('时间未知');
    expect(formatSavedAt(0)).toBe('时间未知');
    expect(formatSavedAt(Date.now())).not.toBe('时间未知');
  });

  it('tracks the current slot marker across reads and clears safely', () => {
    expect(readCurrentSlot(storage)).toBe(null);
    writeCurrentSlot('manual-2', storage);
    expect(readCurrentSlot(storage)).toBe('manual-2');
    writeCurrentSlot(null, storage);
    expect(readCurrentSlot(storage)).toBe(null);
    storage.setItem(CURRENT_SLOT_KEY, 'not-a-slot');
    expect(readCurrentSlot(storage)).toBe(null);
  });

  it('clearAllSaves wipes slots, legacy save and the current marker', () => {
    saveToSlot('manual-1', makeSave('A'), storage);
    saveToSlot(AUTO_SLOT_ID, makeSave('B'), storage, 'auto');
    saveGame(makeSave('C'), storage);
    writeCurrentSlot('manual-1', storage);
    clearAllSaves(storage);
    expect(listSlots(storage).every((s) => s.state === 'empty')).toBe(true);
    expect(hasSave(storage)).toBe(false);
    expect(readCurrentSlot(storage)).toBe(null);
  });

  it('restores a full game state from a slot (world + inventory + quests)', () => {
    const save = makeSave('ROUNDTRIP', 88);
    saveToSlot('manual-3', save, storage);
    const loaded = loadSlot('manual-3', storage);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.playTime).toBe(88);
      const world = World.fromSaveData(loaded.data.world as never);
      expect(world.seed).toBe('ROUNDTRIP');
      const inv = Inventory.fromJSON(loaded.data.inventory as never);
      expect(inv.has('deadwood_log', 3)).toBe(true);
      expect((loaded.data.quests as { stage: number }).stage).toBe(1);
    }
  });
});

describe('legacy single save compatibility', () => {
  it('still reads the old v1 key directly', () => {
    const storage = makeStorage();
    saveGame(makeSave('OLD'), storage);
    const r = loadGame(storage);
    expect(r.ok && r.data.seed).toBe('OLD');
  });
});

describe('page flow: main menu slot -> engine load', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
  });

  it('loads the picked slot into a fresh engine and persists the current slot', async () => {
    vi.resetModules();
    vi.doMock('../src/render/renderer', () => ({
      GameRenderer: class {
        renderer = { shadowMap: { enabled: false } };
        camera = { position: { set() {} }, rotation: {} };
        resize() {}
        render() {}
      }
    }));
    const { GameEngine } = await import('../src/game/engine');
    const { readCurrentSlot: readMarker } = await import('../src/game/save');

    const engine = new GameEngine();
    // empty storage: continue disabled, all slots shown empty
    const continueBtn = document.querySelector('#btn-continue') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
    expect(document.querySelectorAll('#slot-list .slot-row.empty')).toHaveLength(4);

    engine.startNew('PAGESEED', 'salvage');
    engine.playTime = 66;
    expect(engine.saveToManualSlot('manual-2').ok).toBe(true);
    expect(engine.currentSlot).toBe('manual-2');

    // simulate a full page reopen: new engine, same localStorage
    document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui"></div>';
    const engine2 = new GameEngine();
    expect(engine2.currentSlot).toBe('manual-2');
    const row = document.querySelector('[data-load-slot="manual-2"]')?.closest('.slot-row');
    expect(row?.textContent).toContain('PAGESEED');
    expect(row?.textContent).toContain('当前');
    expect((document.querySelector('#btn-continue') as HTMLButtonElement).disabled).toBe(false);

    (document.querySelector('[data-load-slot="manual-2"]') as HTMLButtonElement).click();
    expect(engine2.mode).toBe('playing');
    expect(engine2.currentSlot).toBe('manual-2');
    expect(engine2.playTime).toBe(66);
    expect(engine2.world.seed).toBe('PAGESEED');
    expect(engine2.quest.route).toBe('salvage');
    expect(readMarker()).toBe('manual-2');
  });

  it('pause-menu picker requires confirmation before overwriting and cancel keeps data', async () => {
    vi.resetModules();
    vi.doMock('../src/render/renderer', () => ({
      GameRenderer: class {
        renderer = { shadowMap: { enabled: false } };
        camera = { position: { set() {} }, rotation: {} };
        resize() {}
        render() {}
      }
    }));
    const { GameEngine } = await import('../src/game/engine');
    const { loadSlot: load } = await import('../src/game/save');

    const engine = new GameEngine();
    engine.startNew('PICKER', 'fortify');
    engine.playTime = 1;
    engine.saveToManualSlot('manual-1');
    engine.playTime = 999;

    engine.openSaveSlotPicker();
    (document.querySelector('[data-pick-slot="manual-1"]') as HTMLButtonElement).click();
    // overwrite confirmation appears; cancel leaves the old save untouched
    expect(document.querySelector('#confirm-dialog')).not.toBeNull();
    (document.querySelector('#cd-no') as HTMLButtonElement).click();
    let loaded = load('manual-1');
    expect(loaded.ok && loaded.data.playTime).toBe(1);

    // picking again and confirming overwrites
    (document.querySelector('[data-pick-slot="manual-1"]') as HTMLButtonElement).click();
    (document.querySelector('#cd-yes') as HTMLButtonElement).click();
    loaded = load('manual-1');
    expect(loaded.ok && loaded.data.playTime).toBe(999);
    expect(engine.currentSlot).toBe('manual-1');
    // picker never offers a manual save button for the auto slot
    expect(document.querySelector('[data-pick-slot="auto"]')).toBeNull();
  });
});
