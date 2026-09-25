import { describe, it, expect, beforeEach, vi } from 'vitest';

// The real renderer needs WebGL; stub it so the engine can run under jsdom.
vi.mock('../src/render/renderer', () => {
  class GameRenderer {
    renderer = { shadowMap: { enabled: false } };
    camera = { position: { set: () => undefined }, rotation: {} as Record<string, unknown> };
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
  return { GameRenderer };
});

import { GameEngine } from '../src/game/engine';
import { SAVE_KEY } from '../src/game/save';

function corruptSave(mutate: (save: Record<string, unknown>) => void) {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) throw new Error('expected a save to exist');
  const save = JSON.parse(raw) as Record<string, unknown>;
  mutate(save);
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

describe('GameEngine continueSave with a corrupted save', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
  });

  it('shows the error screen and leaves the running state untouched', () => {
    const engine = new GameEngine();
    engine.startNew('chain-seed', 'fortify');
    engine.body.x = 12.5;
    engine.body.z = -4.5;
    engine.inventory.add('stone_hammer', 1);
    expect(engine.writeSave()).toBe(true);

    const oldWorld = engine.world;
    const oldBody = engine.body;
    const oldInventory = engine.inventory;
    const oldSurvival = engine.survival;
    const oldEnvironment = engine.environment;
    const oldQuest = engine.quest;
    const oldEvents = engine.events;

    // corruption: inventory.slots missing entirely
    corruptSave((s) => {
      s.inventory = {};
    });

    expect(() => engine.continueSave()).not.toThrow();

    // live state must not be partially replaced
    expect(engine.world).toBe(oldWorld);
    expect(engine.body).toBe(oldBody);
    expect(engine.body.x).toBe(12.5);
    expect(engine.body.z).toBe(-4.5);
    expect(engine.inventory).toBe(oldInventory);
    expect(engine.inventory.has('stone_hammer')).toBe(true);
    expect(engine.survival).toBe(oldSurvival);
    expect(engine.environment).toBe(oldEnvironment);
    expect(engine.quest).toBe(oldQuest);
    expect(engine.events).toBe(oldEvents);

    // the error UI is shown instead of a white screen
    const errBox = document.querySelector('#ui .error-box');
    expect(errBox).toBeTruthy();
    expect(errBox!.textContent).toContain('存档已损坏');

    // the corrupted save is NOT auto-deleted
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
  });

  it('main menu "continue" routes to the error screen for a corrupted save', () => {
    const engine = new GameEngine();
    engine.startNew('menu-seed', 'salvage');
    expect(engine.writeSave()).toBe(true);
    corruptSave((s) => {
      s.events = null;
    });

    engine.showMenu();
    const btn = document.querySelector<HTMLButtonElement>('#ui #btn-continue');
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(false);
    btn!.click();

    expect(document.querySelector('#ui .error-box')).toBeTruthy();
    expect(document.querySelector('#ui h2')?.textContent).toContain('读取失败');
  });

  it('loads a valid save again after a failure', () => {
    const engine = new GameEngine();
    engine.startNew('recover-seed', 'fortify');
    engine.body.x = 7.5;
    expect(engine.writeSave()).toBe(true);

    corruptSave((s) => {
      s.body = { x: 'NaN' };
    });
    engine.continueSave();
    expect(document.querySelector('#ui .error-box')).toBeTruthy();

    // repair the slot with a valid save and continue successfully
    expect(engine.writeSave()).toBe(true);
    const worldBefore = engine.world;
    engine.continueSave();
    expect(document.querySelector('#ui .error-box')).toBeNull();
    expect(engine.mode).toBe('playing');
    expect(engine.world).not.toBe(worldBefore);
    expect(engine.body.x).toBe(7.5);
  });
});
