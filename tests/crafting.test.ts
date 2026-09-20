import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/game/inventory';
import { craft, canCraft, availableRecipes, CraftContext } from '../src/game/crafting';
import { RECIPES } from '../src/game/recipes';

const HAND: CraftContext = { nearWorkbench: false, hasToken: false, questStage: 0 };

describe('crafting recipes', () => {
  it('fails clearly when materials are missing', () => {
    const inv = new Inventory();
    const recipe = RECIPES.find((r) => r.id === 'stone_hammer')!;
    const r = canCraft(inv, recipe, HAND);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing_materials');
  });

  it('crafts a hammer with exact materials and consumes them', () => {
    const inv = new Inventory();
    inv.add('gravel_bit', 3);
    inv.add('deadwood_log', 2);
    inv.add('binding', 1);
    const recipe = RECIPES.find((r) => r.id === 'stone_hammer')!;
    const r = craft(inv, recipe, HAND);
    expect(r.ok).toBe(true);
    expect(inv.has('stone_hammer')).toBe(true);
    expect(inv.countItem('gravel_bit')).toBe(0);
  });

  it('blocks workbench recipes without a workbench', () => {
    const inv = new Inventory();
    inv.add('iron_scrap', 4);
    inv.add('timber_plank', 2);
    inv.add('copper_scrap', 1);
    const recipe = RECIPES.find((r) => r.id === 'hand_drill')!;
    expect(canCraft(inv, recipe, HAND).reason).toBe('needs_workbench');
    expect(canCraft(inv, recipe, { ...HAND, nearWorkbench: true }).ok).toBe(true);
  });

  it('gates relic recipes behind token and quest stage', () => {
    const inv = new Inventory();
    inv.add('iron_ingot', 2);
    inv.add('copper_coil', 1);
    inv.add('repair_paste', 2);
    const recipe = RECIPES.find((r) => r.id === 'repair_gun')!;
    expect(canCraft(inv, recipe, { nearWorkbench: true, hasToken: false, questStage: 9 }).reason).toBe(
      'needs_token'
    );
    expect(canCraft(inv, recipe, { nearWorkbench: true, hasToken: true, questStage: 9 }).ok).toBe(true);
    const relay = RECIPES.find((r) => r.id === 'relay_core')!;
    expect(canCraft(new Inventory(), relay, { nearWorkbench: true, hasToken: true, questStage: 2 }).reason).toBe(
      'quest_locked'
    );
  });

  it('lists only recipes unlocked by current context', () => {
    const list = availableRecipes(HAND);
    expect(list.some((r) => r.id === 'stone_hammer')).toBe(true);
    expect(list.some((r) => r.id === 'hand_drill')).toBe(false);
  });
});
