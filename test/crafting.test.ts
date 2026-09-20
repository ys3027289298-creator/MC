import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/core/inventory';
import { RECIPES, canCraft, craft } from '../src/core/recipes';
import { getItem } from '../src/core/items';

describe('工具耐久', () => {
  it('使用消耗耐久，归零后物品消失', () => {
    const inv = new Inventory(8);
    inv.add('axe_t1', 1);
    const idx = inv.findItem('axe_t1');
    const max = getItem('axe_t1')!.durability!;
    expect(inv.slots[idx]!.durability).toBe(max!);
    inv.wear(idx, max - 1);
    expect(inv.slots[idx]).not.toBeNull();
    inv.wear(idx, 1);
    expect(inv.slots[idx]).toBeNull();
  });
  it('修理恢复耐久且不超过上限', () => {
    const inv = new Inventory(8);
    inv.add('hammer_t1', 1);
    const idx = inv.findItem('hammer_t1');
    inv.wear(idx, 50);
    inv.repair(idx, 30);
    expect(inv.slots[idx]!.durability).toBe(getItem('hammer_t1')!.durability! - 20);
    inv.repair(idx, 999);
    expect(inv.slots[idx]!.durability).toBe(getItem('hammer_t1')!.durability);
  });
});

describe('制作配方', () => {
  it('材料不足时无法制作', () => {
    const inv = new Inventory(12);
    const r = RECIPES.find((x) => x.id === 'axe1')!;
    expect(canCraft(r, inv, false, 0)).toBe('no_materials');
  });
  it('材料齐全即可制作并扣除材料', () => {
    const inv = new Inventory(12);
    inv.add('wood', 5); inv.add('gravel', 4); inv.add('fiber', 2);
    const r = RECIPES.find((x) => x.id === 'axe1')!;
    expect(craft(r, inv, false, 0)).toBe('ok');
    expect(inv.countOf('axe_t1')).toBe(1);
    expect(inv.countOf('wood')).toBe(3);
  });
  it('需要工作台的配方在无工作台时失败', () => {
    const inv = new Inventory(12);
    inv.add('plank', 4); inv.add('fiber', 2);
    const r = RECIPES.find((x) => x.id === 'chest')!;
    expect(canCraft(r, inv, false, 0)).toBe('no_station');
    expect(canCraft(r, inv, true, 0)).toBe('ok');
  });
  it('任务道具在任务阶段不足时锁定', () => {
    const inv = new Inventory(12);
    Object.entries({ ruin_metal: 10, metal: 10, crystal: 10 }).forEach(([id, n]) => inv.add(id, n));
    const r = RECIPES.find((x) => x.id === 'towerkit')!;
    expect(canCraft(r, inv, true, 0)).toBe('locked');
    expect(canCraft(r, inv, true, 5)).toBe('ok');
  });
  it('低级到高级工具链存在', () => {
    expect(RECIPES.some((r) => r.output === 'hammer_t1')).toBe(true);
    expect(RECIPES.some((r) => r.output === 'hammer_t2')).toBe(true);
    const t2 = RECIPES.find((r) => r.output === 'drill_t2')!;
    expect(t2.needsWorkbench).toBe(true);
  });
});
