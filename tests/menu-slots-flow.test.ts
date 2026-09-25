// Page-level flow: main menu slot selection -> engine load, pause-menu save-as,
// overwrite confirm/cancel, legacy migration, slot deletion.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/render/renderer', () => ({
  GameRenderer: class {
    renderer = { shadowMap: { enabled: false } };
    camera = { position: { set: () => undefined }, rotation: {} };
    resize() {}
    render() {}
    syncChunks() {}
    syncEnemies() {}
    syncDrops() {}
    syncProjectiles() {}
    updateSky() {}
    showHighlight() {}
    hideHighlight() {}
  }
}));

import { GameEngine } from '../src/game/engine';
import {
  GameSave,
  emptyStats,
  SAVE_KEY,
  SLOTS_KEY,
  saveGame,
  saveToSlot,
  loadSlot,
  listSlots,
  getCurrentSlot
} from '../src/game/save';
import { World } from '../src/game/world';
import { Inventory } from '../src/game/inventory';

function makeSave(seed: string, playTime: number): GameSave {
  const world = new World(seed);
  const inv = new Inventory();
  inv.add('deadwood_log', 2);
  return {
    version: 1,
    savedAt: 1700000000000 + playTime * 1000,
    playTime,
    seed: world.seed,
    body: { x: 0.5, y: 40, z: 0.5, yaw: 0, pitch: 0 },
    inventory: inv.toJSON(),
    survival: { health: 90 },
    environment: { day: 2 },
    world: world.toSaveData(),
    quests: { stage: 1 },
    events: [],
    stats: emptyStats(),
    route: 'fortify'
  };
}

function boot(): GameEngine {
  document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui"></div>';
  return new GameEngine();
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', () => 0);
});

describe('main menu -> engine load chain', () => {
  it('loads the picked slot into the engine and marks it current', () => {
    saveToSlot('slot2', makeSave('FLOW-SEED', 66), localStorage);
    const engine = boot();
    const ui = document.getElementById('ui')!;
    expect(ui.textContent).toContain('FLOW-SEED');
    const btn = ui.querySelector('[data-slot="slot2"] .slot-load') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(engine.mode).toBe('playing');
    expect(engine.currentSlot).toBe('slot2');
    expect(engine.world.seed).toBe('FLOW-SEED');
    expect(engine.playTime).toBe(66);
    expect(getCurrentSlot(localStorage)).toBe('slot2');
  });

  it('keeps continue disabled and shows empty state when there are no saves', () => {
    boot();
    const ui = document.getElementById('ui')!;
    const cont = ui.querySelector('#btn-continue') as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
    expect(ui.textContent).toContain('空闲');
  });

  it('migrates a legacy single save into slot1 when continuing', () => {
    saveGame(makeSave('OLD-SEED', 33), localStorage);
    const engine = boot();
    const ui = document.getElementById('ui')!;
    expect(ui.textContent).toContain('旧版单存档');
    (ui.querySelector('#btn-continue') as HTMLButtonElement).click();
    expect(engine.mode).toBe('playing');
    expect(engine.currentSlot).toBe('slot1');
    expect(engine.world.seed).toBe('OLD-SEED');
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(loadSlot('slot1', localStorage).ok).toBe(true);
  });

  it('deletes one slot from the menu while the others stay loadable', () => {
    saveToSlot('slot1', makeSave('A', 1), localStorage);
    saveToSlot('slot2', makeSave('B', 2), localStorage);
    boot();
    const ui = document.getElementById('ui')!;
    (ui.querySelector('[data-slot="slot1"] .slot-delete') as HTMLButtonElement).click();
    (ui.querySelector('#confirm-box #cb-yes') as HTMLButtonElement).click();
    expect(loadSlot('slot1', localStorage).ok).toBe(false);
    expect(loadSlot('slot2', localStorage).ok).toBe(true);
    expect(ui.textContent).toContain('B');
  });
});

describe('pause menu save-as flow', () => {
  function playingEngine(): GameEngine {
    saveToSlot('slot1', makeSave('PAUSE-SEED', 10), localStorage);
    const engine = boot();
    const ui = document.getElementById('ui')!;
    (ui.querySelector('[data-slot="slot1"] .slot-load') as HTMLButtonElement).click();
    expect(engine.mode).toBe('playing');
    return engine;
  }

  it('saves into a chosen empty manual slot from the pause menu', () => {
    const engine = playingEngine();
    engine.playTime = 555;
    engine.pause();
    const ui = document.getElementById('ui')!;
    (ui.querySelector('#p-save') as HTMLButtonElement).click();
    const picker = ui.querySelector('#save-slots-panel');
    expect(picker).toBeTruthy();
    (picker!.querySelector('[data-slot="slot3"] .slot-pick') as HTMLButtonElement).click();
    const r = loadSlot('slot3', localStorage);
    expect(r.ok && r.data.playTime).toBe(555);
    expect(engine.currentSlot).toBe('slot3');
  });

  it('asks before overwriting and cancel leaves data untouched', () => {
    const engine = playingEngine();
    engine.playTime = 777;
    engine.pause();
    const ui = document.getElementById('ui')!;
    (ui.querySelector('#p-save') as HTMLButtonElement).click();
    const picker = ui.querySelector('#save-slots-panel')!;
    (picker.querySelector('[data-slot="slot1"] .slot-pick') as HTMLButtonElement).click();
    const confirm = ui.querySelector('#confirm-box');
    expect(confirm).toBeTruthy();
    (confirm!.querySelector('#cb-no') as HTMLButtonElement).click();
    // cancel: original playTime 10 preserved, picker still open
    const r = loadSlot('slot1', localStorage);
    expect(r.ok && r.data.playTime).toBe(10);
    expect(ui.querySelector('#save-slots-panel')).toBeTruthy();
    // confirm path overwrites
    (picker.querySelector('[data-slot="slot1"] .slot-pick') as HTMLButtonElement).click();
    (ui.querySelector('#confirm-box #cb-yes') as HTMLButtonElement).click();
    const r2 = loadSlot('slot1', localStorage);
    expect(r2.ok && r2.data.playTime).toBe(777);
  });

  it('does not offer the auto slot for manual overwrite', () => {
    const engine = playingEngine();
    engine.pause();
    const ui = document.getElementById('ui')!;
    (ui.querySelector('#p-save') as HTMLButtonElement).click();
    const picker = ui.querySelector('#save-slots-panel')!;
    expect(picker.querySelector('[data-slot="auto"]')).toBeNull();
    expect(picker.textContent).toContain('不能手动覆盖');
  });
});

describe('restart and persistence across reopen', () => {
  it('restart clears the current slot and its marker', () => {
    saveToSlot('slot1', makeSave('R', 1), localStorage);
    saveToSlot('slot2', makeSave('KEEP', 2), localStorage);
    const engine = boot();
    const ui = document.getElementById('ui')!;
    (ui.querySelector('[data-slot="slot1"] .slot-load') as HTMLButtonElement).click();
    engine.pause();
    (ui.querySelector('#p-restart') as HTMLButtonElement).click();
    (ui.querySelector('#confirm-restart #cr-yes') as HTMLButtonElement).click();
    expect(engine.currentSlot).toBeNull();
    expect(loadSlot('slot1', localStorage).ok).toBe(false);
    expect(loadSlot('slot2', localStorage).ok).toBe(true);
    expect(getCurrentSlot(localStorage)).toBeNull();
  });

  it('keeps the current slot consistent after a simulated page reopen', () => {
    saveToSlot('slot2', makeSave('PERSIST', 44), localStorage);
    const first = boot();
    (document.querySelector('[data-slot="slot2"] .slot-load') as HTMLButtonElement).click();
    expect(first.currentSlot).toBe('slot2');
    // simulate reload: fresh engine over the same localStorage
    const second = boot();
    expect(second.currentSlot).toBeNull();
    const ui = document.getElementById('ui')!;
    const row = ui.querySelector('[data-slot="slot2"]');
    expect(row?.textContent).toContain('当前进度');
    (ui.querySelector('#btn-continue') as HTMLButtonElement).click();
    expect(second.currentSlot).toBe('slot2');
    expect(second.playTime).toBe(44);
  });

  it('shows the slot list even when the envelope is fully corrupted', () => {
    localStorage.setItem(SLOTS_KEY, '{ broken');
    const engine = boot();
    const ui = document.getElementById('ui')!;
    expect(ui.textContent).toContain('存档列表读取失败');
    expect((ui.querySelector('#btn-continue') as HTMLButtonElement).disabled).toBe(true);
    expect(engine.mode).toBe('menu');
  });
});
