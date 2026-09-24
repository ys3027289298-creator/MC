import { describe, it, expect } from 'vitest';
import { Inventory, ItemStack } from '../src/game/inventory';

const SIZE = 24;

function invWith(slot: number, stack: ItemStack | null): Inventory {
  const inv = new Inventory();
  inv.slots[slot] = stack;
  return inv;
}

function snapshot(inv: Inventory) {
  return structuredClone(inv.toJSON());
}

function expectUnchanged(inv: Inventory, before: ReturnType<typeof snapshot>) {
  expect(inv.toJSON()).toEqual(before);
  expect(inv.slots.length).toBe(SIZE);
  expect(Object.keys(inv.slots)).toEqual(Array.from({ length: SIZE }, (_, i) => String(i)));
  expect(inv.hotbarIndex).toBe(before.hotbarIndex);
  expect(inv.armor).toEqual(before.armor);
}

describe('inventory.split default amounts', () => {
  it.each([
    [1, 0, 1],
    [2, 1, 1],
    [3, 1, 2],
    [10, 5, 5]
  ])('splits ceil-half of %i into an empty slot', (count, remain, moved) => {
    const inv = invWith(0, { id: 'iron_scrap', count });
    expect(inv.split(0, 3)).toBe(true);
    expect(inv.slots[0]?.count ?? 0).toBe(remain);
    expect(inv.slots[3]?.count).toBe(moved);
    if (remain === 0) expect(inv.slots[0]).toBeNull();
  });
});

describe('inventory.split explicit amount', () => {
  it.each([
    [1, 9, 1],
    [10, 0, 10],
    [15, 0, 10]
  ])('amount %i against 10 moves the clamped amount', (amount, remain, moved) => {
    const inv = invWith(0, { id: 'iron_scrap', count: 10 });
    expect(inv.split(0, 3, amount)).toBe(true);
    expect(inv.slots[0]?.count ?? 0).toBe(remain);
    expect(inv.slots[3]?.count).toBe(moved);
    if (remain === 0) expect(inv.slots[0]).toBeNull();
  });

  it.each([0, -1, -99, 2.5, NaN, Infinity, -Infinity])('rejects invalid amount %s without side effects', (amount) => {
    const inv = invWith(0, { id: 'iron_scrap', count: 10 });
    const src = inv.slots[0];
    const before = snapshot(inv);
    expect(inv.split(0, 3, amount)).toBe(false);
    expectUnchanged(inv, before);
    expect(inv.slots[0]).toBe(src);
    expect(inv.slots[3]).toBeNull();
  });
});

describe('inventory.split slot and state boundaries', () => {
  it('fails on empty source, occupied target and same slot', () => {
    const inv = invWith(0, { id: 'iron_scrap', count: 10 });
    inv.slots[4] = { id: 'copper_scrap', count: 2 };
    const before = snapshot(inv);
    expect(inv.split(5, 6)).toBe(false);
    expect(inv.split(0, 4)).toBe(false);
    expect(inv.split(0, 0)).toBe(false);
    expectUnchanged(inv, before);
  });

  it.each([-1, 1.5, 24, 100, NaN])('rejects out-of-range source index %s', (from) => {
    const inv = invWith(0, { id: 'iron_scrap', count: 10 });
    const before = snapshot(inv);
    expect(inv.split(from, 3)).toBe(false);
    expectUnchanged(inv, before);
  });

  it.each([-1, 2.5, 24, 100, NaN])('rejects out-of-range target index %s', (to) => {
    const inv = invWith(0, { id: 'iron_scrap', count: 10 });
    const before = snapshot(inv);
    expect(inv.split(0, to)).toBe(false);
    expectUnchanged(inv, before);
  });

  it.each([
    [{ id: 'iron_scrap', count: 0 }, 'zero count'],
    [{ id: 'iron_scrap', count: -3 }, 'negative count'],
    [{ id: 'iron_scrap', count: 1.5 }, 'fractional count'],
    [{ id: 'iron_scrap', count: NaN }, 'NaN count'],
    [{ id: 'iron_scrap', count: Infinity }, 'infinite count'],
    [{ id: 'iron_scrap', count: 500 }, 'count above maxStack'],
    [{ id: 'ghost_item', count: 5 }, 'unknown item id']
  ])('fails safely on corrupted stack (%s)', (stack) => {
    const inv = invWith(0, stack as ItemStack);
    const src = inv.slots[0];
    const before = snapshot(inv);
    expect(inv.split(0, 3)).toBe(false);
    expect(inv.split(0, 3, 2)).toBe(false);
    expectUnchanged(inv, before);
    expect(inv.slots[0]).toBe(src);
  });

  it('never creates hidden array properties on failure', () => {
    const inv = invWith(0, { id: 'iron_scrap', count: 10 });
    inv.split(0, 30);
    inv.split(-2, 3);
    inv.split(0.7, 1.2);
    expect(inv.slots.length).toBe(SIZE);
    expect(Object.keys(inv.slots)).toEqual(Array.from({ length: SIZE }, (_, i) => String(i)));
  });

  it('creates an independent target stack and keeps source fields intact', () => {
    const inv = invWith(0, { id: 'iron_scrap', count: 10, durability: 7 });
    const src = inv.slots[0]!;
    expect(inv.split(0, 3, 4)).toBe(true);
    const target = inv.slots[3]!;
    expect(target).not.toBe(src);
    expect(target).toEqual({ id: 'iron_scrap', count: 4 });
    expect(inv.slots[0]).toBe(src);
    expect(src.count).toBe(6);
    expect(src.id).toBe('iron_scrap');
    expect(src.durability).toBe(7);
  });
});

describe('inventory.split maxStack 1 semantics', () => {
  it('moves a whole tool stack into an empty slot', () => {
    const inv = invWith(0, { id: 'stone_hammer', count: 1, durability: 60 });
    expect(inv.split(0, 3)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[3]).toEqual({ id: 'stone_hammer', count: 1, durability: 60 });
  });

  it('fails for tools on the same occupied slot, while moveTo allows it', () => {
    const inv = invWith(0, { id: 'stone_hammer', count: 1, durability: 60 });
    const before = snapshot(inv);
    expect(inv.split(0, 0)).toBe(false);
    expect(inv.moveTo(0, 0)).toBe(true);
    expectUnchanged(inv, before);
  });

  it('fails for tools when the target is occupied or amount is invalid', () => {
    const inv = invWith(0, { id: 'stone_hammer', count: 1, durability: 60 });
    inv.slots[3] = { id: 'iron_scrap', count: 2 };
    const before = snapshot(inv);
    expect(inv.split(0, 3)).toBe(false);
    expect(inv.split(0, 5, 0)).toBe(false);
    expectUnchanged(inv, before);
  });
});

describe('inventory.moveTo regression', () => {
  it('keeps same-slot, empty-slot, swap and merge behavior', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: 'iron_scrap', count: 10 };
    inv.slots[1] = { id: 'copper_scrap', count: 3 };
    inv.slots[2] = { id: 'iron_scrap', count: 95 };
    expect(inv.moveTo(0, 0)).toBe(true);
    expect(inv.slots[0]?.count).toBe(10);
    expect(inv.moveTo(0, 5)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[5]?.count).toBe(10);
    expect(inv.moveTo(1, 5)).toBe(true);
    expect(inv.slots[1]?.id).toBe('iron_scrap');
    expect(inv.slots[5]?.id).toBe('copper_scrap');
    expect(inv.moveTo(1, 2)).toBe(true);
    expect(inv.slots[2]?.count).toBe(99);
    expect(inv.slots[1]?.count).toBe(6);
  });

  it.each([-1, 0.5, 24, 1000, NaN])('rejects invalid index %s without writes', (bad) => {
    const inv = invWith(0, { id: 'iron_scrap', count: 10 });
    const before = snapshot(inv);
    expect(inv.moveTo(bad, 3)).toBe(false);
    expect(inv.moveTo(0, bad)).toBe(false);
    expectUnchanged(inv, before);
  });
});
