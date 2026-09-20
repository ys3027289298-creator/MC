// Crafting validation & execution with workbench/token/quest gating.

import { Inventory } from './inventory';
import { ITEMS } from './items';
import { RECIPES, Recipe } from './recipes';

export interface CraftContext {
  nearWorkbench: boolean;
  hasToken: boolean;
  questStage: number;
}

export type CraftFailReason =
  | 'missing_materials'
  | 'needs_workbench'
  | 'needs_token'
  | 'quest_locked'
  | 'inventory_full';

export interface CraftResult {
  ok: boolean;
  reason?: CraftFailReason;
  message: string;
}

export function availableRecipes(ctx: CraftContext): Recipe[] {
  return RECIPES.filter((r) => {
    if (r.requiresWorkbench && !ctx.nearWorkbench) return false;
    if (r.requiresToken && !ctx.hasToken) return false;
    if (r.requiresQuest !== undefined && ctx.questStage < r.requiresQuest) return false;
    return true;
  });
}

export function canCraft(inv: Inventory, recipe: Recipe, ctx: CraftContext): CraftResult {
  if (recipe.requiresWorkbench && !ctx.nearWorkbench) {
    return { ok: false, reason: 'needs_workbench', message: '需要靠近工作台才能制作。' };
  }
  if (recipe.requiresToken && !ctx.hasToken) {
    return { ok: false, reason: 'needs_token', message: '需要遗迹铭牌解锁该配方。' };
  }
  if (recipe.requiresQuest !== undefined && ctx.questStage < recipe.requiresQuest) {
    return { ok: false, reason: 'quest_locked', message: '需要推进主线任务后解锁。' };
  }
  for (const input of recipe.inputs) {
    if (inv.countItem(input.item) < input.count) {
      const d = ITEMS[input.item];
      return {
        ok: false,
        reason: 'missing_materials',
        message: `材料不足：${d.name} 需要 ${input.count} 个（持有 ${inv.countItem(input.item)}）。`
      };
    }
  }
  if (!inv.canAdd(recipe.output, recipe.count)) {
    return { ok: false, reason: 'inventory_full', message: '背包空间不足。' };
  }
  return { ok: true, message: '可以制作。' };
}

export function craft(inv: Inventory, recipe: Recipe, ctx: CraftContext): CraftResult {
  const check = canCraft(inv, recipe, ctx);
  if (!check.ok) return check;
  if (!inv.consume(recipe.inputs)) {
    return { ok: false, reason: 'missing_materials', message: '材料不足。' };
  }
  inv.add(recipe.output, recipe.count);
  const d = ITEMS[recipe.output];
  return { ok: true, message: `制作成功：${d.name} ×${recipe.count}` };
}
