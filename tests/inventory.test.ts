import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/game/inventory';

describe('inventory', () => {
  it('stacks identical items up to max stack', () => {
    const inv = new Inventory();
    inv.add('iron_scrap', 5);
    inv.add('iron_scrap', 10);
    expect(inv.countItem('iron_scrap')).toBe(15);
    expect(inv.slots.filter((s) => s?.id === 'iron_scrap').length).toBe(1);
  });

  it('never mixes different item types', () => {
    const inv = new Inventory();
    inv.add('iron_scrap', 3);
    inv.add('copper_scrap', 3);
    expect(inv.slots[0]?.id).toBe('iron_scrap');
    expect(inv.slots[1]?.id).toBe('copper_scrap');
  });

  it('respects capacity and reports overflow', () => {
    const inv = new Inventory(4);
    for (const id of ['rock_bit', 'sand_pile', 'silt_clump', 'peat_lump']) inv.add(id, 1);
    inv.add('rock_bit', 1);
    inv.add('sand_pile', 1);
    inv.add('silt_clump', 1);
    inv.add('peat_lump', 1);
    const overflow = inv.add('iron_scrap', 5);
    expect(overflow).toBe(5);
    expect(inv.canAdd('iron_scrap', 5)).toBe(false);
  });

  it('splits stacks between slots', () => {
    const inv = new Inventory();
    inv.add('iron_scrap', 10);
    expect(inv.split(0, 3)).toBe(true);
    expect(inv.slots[0]?.count).toBe(5);
    expect(inv.slots[3]?.count).toBe(5);
  });

  it('drops partial amounts and clears the slot at zero', () => {
    const inv = new Inventory();
    inv.add('iron_scrap', 3);
    const dropped = inv.drop(0, 2);
    expect(dropped?.count).toBe(2);
    expect(inv.slots[0]?.count).toBe(1);
    expect(inv.drop(0)?.count).toBe(1);
    expect(inv.slots[0]).toBeNull();
  });

  it('tracks tool durability and breaks tools at zero', () => {
    const inv = new Inventory();
    inv.add('stone_hammer', 1);
    expect(inv.selected()?.durability).toBe(60);
    for (let i = 0; i < 59; i++) inv.damageSelectedTool(1);
    expect(inv.selected()).not.toBeNull();
    inv.damageSelectedTool(1);
    expect(inv.selected()).toBeNull();
  });

  it('supports hotbar selection and equipment swap', () => {
    const inv = new Inventory();
    inv.add('stone_hammer', 1);
    inv.selectHotbar(3);
    expect(inv.hotbarIndex).toBe(3);
    inv.add('pelt_mantle', 1);
    const slot = inv.slots.findIndex((s) => s?.id === 'pelt_mantle');
    expect(inv.equip(slot)).toBe(true);
    expect(inv.armor?.id).toBe('pelt_mantle');
  });
});
