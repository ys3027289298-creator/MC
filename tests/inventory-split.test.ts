import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/game/inventory';
import { itemDef } from '../src/game/items';

// Deep, value-only snapshot of everything a failed op must never touch.
function snapshot(inv: Inventory) {
  return {
    json: JSON.parse(JSON.stringify(inv.toJSON())),
    slotsLength: inv.slots.length,
    slotKeys: Object.keys(inv.slots),
    hotbarIndex: inv.hotbarIndex,
    armor: inv.armor ? { ...inv.armor } : null
  };
}

function expectUnchanged(inv: Inventory, before: ReturnType<typeof snapshot>) {
  const after = snapshot(inv);
  expect(after.json).toEqual(before.json);
  expect(after.slotsLength).toBe(before.slotsLength);
  expect(after.slotKeys).toEqual(before.slotKeys);
  expect(after.hotbarIndex).toBe(before.hotbarIndex);
  expect(after.armor).toEqual(before.armor);
}

function withStack(id: string, count: number, slot = 0): Inventory {
  const inv = new Inventory();
  inv.slots[slot] = { id, count };
  return inv;
}

describe('Inventory.split default amounts', () => {
  it.each([
    [1, null, 1],
    [2, 1, 1],
    [3, 1, 2],
    [10, 5, 5]
  ] as const)('splits ceil-half of %i into an empty slot', (count, remain, moved) => {
    const inv = withStack('iron_scrap', count);
    expect(inv.split(0, 5)).toBe(true);
    expect(inv.slots[0]?.count ?? null).toBe(remain);
    expect(inv.slots[5]?.count).toBe(moved);
    expect(inv.slots[5]?.id).toBe('iron_scrap');
  });
});

describe('Inventory.split explicit amounts', () => {
  it.each([
    [1, 9, 1],
    [10, null, 10],
    [15, null, 10] // min semantics: never move more than the source holds
  ] as const)('amount %i from a stack of 10', (amount, remain, moved) => {
    const inv = withStack('iron_scrap', 10);
    expect(inv.split(0, 5, amount)).toBe(true);
    expect(inv.slots[0]?.count ?? null).toBe(remain);
    expect(inv.slots[5]?.count).toBe(moved);
  });

  it.each([0, -1, -99, 2.5, 0.1, NaN, Infinity, -Infinity])(
    'rejects invalid amount %s without side effects',
    (amount) => {
      const inv = withStack('iron_scrap', 10);
      inv.hotbarIndex = 3;
      const before = snapshot(inv);
      expect(inv.split(0, 5, amount)).toBe(false);
      expectUnchanged(inv, before);
    }
  );
});

describe('Inventory.split slot and state validation', () => {
  it('fails on an empty source slot', () => {
    const inv = new Inventory();
    const before = snapshot(inv);
    expect(inv.split(0, 5)).toBe(false);
    expectUnchanged(inv, before);
  });

  it('fails on an occupied target slot', () => {
    const inv = withStack('iron_scrap', 10);
    inv.slots[5] = { id: 'copper_scrap', count: 2 };
    const before = snapshot(inv);
    expect(inv.split(0, 5)).toBe(false);
    expect(inv.split(0, 5, 3)).toBe(false);
    expectUnchanged(inv, before);
  });

  it('fails when from and to are the same slot', () => {
    const inv = withStack('iron_scrap', 10);
    const before = snapshot(inv);
    expect(inv.split(0, 0)).toBe(false);
    expectUnchanged(inv, before);
  });

  it.each([-1, 1.5, 24, 100, NaN, Infinity])(
    'rejects invalid target index %s without extending slots',
    (to) => {
      const inv = withStack('iron_scrap', 10);
      const before = snapshot(inv);
      expect(inv.split(0, to)).toBe(false);
      expectUnchanged(inv, before);
      expect(inv.slots.length).toBe(24);
      expect(Object.keys(inv.slots)).toEqual(before.slotKeys); // no hidden array props
    }
  );

  it.each([-1, 1.5, 24, 100, NaN, Infinity])(
    'rejects invalid source index %s without side effects',
    (from) => {
      const inv = withStack('iron_scrap', 10);
      const before = snapshot(inv);
      expect(inv.split(from, 5)).toBe(false);
      expectUnchanged(inv, before);
    }
  );
});

describe('Inventory.split corrupted stacks', () => {
  it.each([0, -3, 2.5, NaN, Infinity, -Infinity])(
    'fails safely on corrupted count %s',
    (count) => {
      const inv = withStack('iron_scrap', count);
      const before = snapshot(inv);
      expect(inv.split(0, 5)).toBe(false);
      expect(inv.split(0, 5, 1)).toBe(false);
      expectUnchanged(inv, before); // corrupted stack is left exactly as-is
    }
  );

  it('fails safely when the id has no item definition', () => {
    const inv = withStack('ghost_item', 3);
    const before = snapshot(inv);
    expect(inv.split(0, 5)).toBe(false);
    expectUnchanged(inv, before);
  });
});

describe('Inventory.split invariants after success', () => {
  it('keeps counts positive integers within maxStack and never shares objects', () => {
    const inv = withStack('iron_scrap', 10);
    inv.hotbarIndex = 2;
    inv.armor = { id: 'pelt_mantle', count: 1 };
    expect(inv.split(0, 5, 4)).toBe(true);
    const src = inv.slots[0]!;
    const dst = inv.slots[5]!;
    expect(dst).not.toBe(src);
    for (const s of [src, dst]) {
      expect(Number.isInteger(s.count)).toBe(true);
      expect(s.count).toBeGreaterThan(0);
      expect(s.count).toBeLessThanOrEqual(itemDef(s.id).maxStack);
    }
    dst.count = 1;
    expect(src.count).toBe(6); // mutating the new stack must not touch the source
    expect(inv.hotbarIndex).toBe(2);
    expect(inv.armor?.id).toBe('pelt_mantle');
    expect(inv.slots.length).toBe(24);
  });
});

describe('Inventory.split / moveTo with maxStack 1 (regression)', () => {
  it('split moves a whole tool, preserving durability', () => {
    const inv = new Inventory();
    inv.add('stone_hammer', 1);
    const before = inv.slots[0]!;
    expect(inv.split(0, 5)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[5]).toBe(before);
    expect(inv.slots[5]?.durability).toBe(60);
  });

  it('split of a tool onto itself fails without side effects', () => {
    const inv = new Inventory();
    inv.add('stone_hammer', 1);
    const before = snapshot(inv);
    expect(inv.split(0, 0)).toBe(false);
    expectUnchanged(inv, before);
  });

  it('moveTo swaps two occupied slots', () => {
    const inv = new Inventory();
    inv.add('stone_hammer', 1);
    inv.add('pelt_mantle', 1);
    expect(inv.moveTo(0, 1)).toBe(true);
    expect(inv.slots[0]?.id).toBe('pelt_mantle');
    expect(inv.slots[1]?.id).toBe('stone_hammer');
  });

  it('moveTo moves into an empty slot and is a no-op on the same slot', () => {
    const inv = new Inventory();
    inv.add('stone_hammer', 1);
    expect(inv.moveTo(0, 0)).toBe(true);
    expect(inv.slots[0]?.id).toBe('stone_hammer');
    expect(inv.moveTo(0, 7)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[7]?.id).toBe('stone_hammer');
  });

  it.each([
    [-1, 0],
    [0, -1],
    [1.5, 0],
    [0, 1.5],
    [0, 24],
    [24, 0],
    [0, 100]
  ] as const)('moveTo(%s, %s) fails without extending slots or hidden props', (from, to) => {
    const inv = new Inventory();
    inv.add('stone_hammer', 1);
    const before = snapshot(inv);
    expect(inv.moveTo(from, to)).toBe(false);
    expectUnchanged(inv, before);
    expect(inv.slots.length).toBe(24);
    expect(Object.keys(inv.slots)).toEqual(before.slotKeys);
  });
});

describe('Inventory.split merge regression (moveTo stacking)', () => {
  it('moveTo still merges partial stacks of the same item', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: 'iron_scrap', count: 90 };
    inv.slots[1] = { id: 'iron_scrap', count: 20 };
    expect(inv.moveTo(0, 1)).toBe(true);
    expect(inv.slots[1]?.count).toBe(99);
    expect(inv.slots[0]?.count).toBe(11);
  });
});
