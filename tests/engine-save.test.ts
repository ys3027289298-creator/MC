// Controller-chain tests: corrupted saves must surface the error screen
// instead of a white screen, and must never pollute live engine state.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/render/renderer', () => {
  class GameRenderer {
    renderer = { shadowMap: { enabled: false } };
    camera = { position: { set: () => undefined }, rotation: { order: '', y: 0, x: 0 } };
    constructor(public canvas: HTMLCanvasElement) {}
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
import { SAVE_KEY, clearSave, loadGame } from '../src/game/save';

function setupDom() {
  document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui"></div>';
  localStorage.clear();
}

function makeEngine(): GameEngine {
  return new GameEngine();
}

describe('engine save/load chain', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    setupDom();
  });

  it('shows the error screen instead of a blank page for a corrupted save', () => {
    localStorage.setItem(SAVE_KEY, '{"version":1,"body":');
    const engine = makeEngine();
    engine.continueSave();
    const box = document.getElementById('ui')!.querySelector('.error-box');
    expect(box).toBeTruthy();
    expect(box!.textContent).toContain('存档已损坏');
    expect(engine.mode).toBe('menu');
    // the raw save is left untouched for the user to decide
    expect(localStorage.getItem(SAVE_KEY)).toBe('{"version":1,"body":');
  });

  it('routes the main-menu continue button to the error screen', () => {
    localStorage.setItem(SAVE_KEY, '[1,2,3]');
    makeEngine();
    const ui = document.getElementById('ui')!;
    const btn = ui.querySelector<HTMLButtonElement>('#btn-continue');
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(false);
    btn!.click();
    expect(ui.querySelector('.error-box')).toBeTruthy();
    // back to menu keeps working after the error
    ui.querySelector<HTMLButtonElement>('#err-back')!.click();
    expect(ui.querySelector('#btn-start')).toBeTruthy();
  });

  it('keeps live world/body/inventory untouched when the load fails mid-game', () => {
    const engine = makeEngine();
    engine.startNew('alpha', 'fortify');
    expect(engine.mode).toBe('playing');
    const worldRef = engine.world;
    const inventoryRef = engine.inventory;
    const survivalRef = engine.survival;
    const environmentRef = engine.environment;
    const questRef = engine.quest;
    const eventsRef = engine.events;
    const pos = { x: engine.body.x, y: engine.body.y, z: engine.body.z };
    const slotsSnapshot = JSON.stringify(engine.inventory.slots);

    localStorage.setItem(SAVE_KEY, '{"version":1,"body":{"x":"Infinity"}}');
    engine.continueSave();

    expect(engine.world).toBe(worldRef);
    expect(engine.inventory).toBe(inventoryRef);
    expect(engine.survival).toBe(survivalRef);
    expect(engine.environment).toBe(environmentRef);
    expect(engine.quest).toBe(questRef);
    expect(engine.events).toBe(eventsRef);
    expect({ x: engine.body.x, y: engine.body.y, z: engine.body.z }).toEqual(pos);
    expect(JSON.stringify(engine.inventory.slots)).toBe(slotsSnapshot);
    expect(engine.mode).toBe('playing');
    expect(document.getElementById('ui')!.querySelector('.error-box')).toBeTruthy();
  });

  it('restores a valid save written by the engine itself', () => {
    const engine = makeEngine();
    engine.startNew('alpha', 'fortify');
    engine.body.x = 12.5;
    engine.playTime = 88;
    expect(engine.writeSave()).toBe(true);

    engine.startNew('beta', 'salvage');
    expect(engine.world.seed).toBe('beta');

    engine.continueSave();
    expect(engine.mode).toBe('playing');
    expect(engine.world.seed).toBe('alpha');
    expect(engine.body.x).toBe(12.5);
    expect(engine.playTime).toBe(88);
    expect(engine.quest.route).toBe('fortify');
    expect(document.getElementById('ui')!.querySelector('.error-box')).toBeNull();
  });

  it('clearSave disables the menu continue path again', () => {
    const engine = makeEngine();
    engine.startNew('alpha', 'fortify');
    engine.writeSave();
    clearSave();
    expect(loadGame().ok).toBe(false);
    engine.showMenu();
    const btn = document.getElementById('ui')!.querySelector<HTMLButtonElement>('#btn-continue');
    expect(btn!.disabled).toBe(true);
  });
});
