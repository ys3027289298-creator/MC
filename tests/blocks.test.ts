import { describe, it, expect } from 'vitest';
import { World } from '../src/game/world';
import { B, blockDef } from '../src/game/blocks';
import { Inventory } from '../src/game/inventory';
import { canPlaceAt, placeBlock, breakBlock, miningTime } from '../src/game/actions';
import { createBody } from '../src/game/physics';

function setup() {
  const w = new World('blocks-test');
  const c = w.ensureChunk(0, 0);
  c.clear();
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y <= 30; y++) c.set(x, y, z, B.Rock);
    }
  }
  const body = createBody(8, 32, 8);
  return { w, body };
}

describe('block placement rules', () => {
  it('requires support and rejects floating blocks', () => {
    const { w, body } = setup();
    expect(canPlaceAt(w, body, 4, 40, 4).ok).toBe(false);
    expect(canPlaceAt(w, body, 8, 32, 8).ok).toBe(false); // inside player
  });

  it('places supported blocks but never inside the player', () => {
    const { w, body } = setup();
    const inv = new Inventory();
    inv.add('timber_plank', 5);
    const far = placeBlock(w, body, inv, 0, 2, 31, 2);
    expect(far.ok).toBe(true);
    expect(w.getBlock(2, 31, 2)).toBe(B.TimberPlank);
    const inside = placeBlock(w, body, inv, 0, 8, 32, 8);
    expect(inside.ok).toBe(false);
  });

  it('consumes the stack when placing', () => {
    const { w, body } = setup();
    const inv = new Inventory();
    inv.add('rivet_plate', 2);
    placeBlock(w, body, inv, 0, 3, 31, 3);
    expect(inv.countItem('rivet_plate')).toBe(1);
  });
});

describe('block breaking and drops', () => {
  it('drops defined resources and counts them', () => {
    const { w } = setup();
    w.setBlock(3, 31, 3, B.DeadwoodLog);
    const inv = new Inventory();
    const r = breakBlock(w, inv, 3, 31, 3, 0);
    expect(w.getBlock(3, 31, 3)).toBe(B.Air);
    expect(r.drops.length).toBeGreaterThan(0);
    expect(inv.countItem('deadwood_log')).toBeGreaterThan(0);
  });

  it('mining time increases dramatically without the correct tool', () => {
    const def = blockDef(B.IronLode);
    const withDrill = miningTime(def, 'hand_drill', 1);
    const bare = miningTime(def, null, 1);
    expect(bare).toBeGreaterThan(withDrill * 1.5);
  });

  it('placed structural blocks carry HP and can be damaged to destruction', () => {
    const { w } = setup();
    w.setBlock(5, 31, 5, B.ClayBrick, { hp: blockDef(B.ClayBrick).hp });
    let destroyed = false;
    for (let i = 0; i < 10 && !destroyed; i++) destroyed = w.damageBlock(5, 31, 5, 20);
    expect(destroyed).toBe(true);
    expect(w.getBlock(5, 31, 5)).toBe(B.Air);
  });

  it('doors open and close, changing collision', () => {
    const { w } = setup();
    w.setBlock(6, 31, 6, B.HatchDoor);
    expect(w.isSolidAt(6, 31, 6)).toBe(true);
    w.toggleDoor(6, 31, 6);
    expect(w.isSolidAt(6, 31, 6)).toBe(false);
    w.toggleDoor(6, 31, 6);
    expect(w.isSolidAt(6, 31, 6)).toBe(true);
  });
});
