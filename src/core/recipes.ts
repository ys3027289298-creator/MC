import { Inventory } from './inventory';

export interface Recipe {
  id: string;
  name: string;
  output: string;
  count: number;
  cost: Record<string, number>;
  needsWorkbench?: boolean;
  unlockQuest?: number; // 到达某任务阶段后解锁
  desc: string;
}

export const RECIPES: Recipe[] = [
  { id: 'plank', name: '木板 x4', output: 'block_plank', count: 4, cost: { wood: 1 }, desc: '基础建材。' },
  { id: 'axe1', name: '燧石切割斧', output: 'axe_t1', count: 1, cost: { wood: 2, gravel: 2, fiber: 1 }, desc: '砍树与近战。' },
  { id: 'hammer1', name: '石质采集锤', output: 'hammer_t1', count: 1, cost: { wood: 2, rock: 3, fiber: 1 }, desc: '开采石头。' },
  { id: 'drill1', name: '手摇挖掘钻', output: 'drill_t1', count: 1, cost: { wood: 3, ore_scrap: 4, fiber: 2 }, desc: '挖土与深层矿。' },
  { id: 'glowstick', name: '照明棒', output: 'glow_stick', count: 1, cost: { fiber: 2, gravel: 1 }, desc: '黑暗中提升安全值。' },
  { id: 'scrapblade', name: '废铁短刃', output: 'scrap_blade', count: 1, cost: { ore_scrap: 3, wood: 1 }, desc: '早期武器。' },
  { id: 'workbench', name: '工作台', output: 'workbench', count: 1, cost: { wood: 6, rock: 4 }, desc: '高级配方所需。' },
  { id: 'brazier', name: '火盆', output: 'brazier', count: 1, cost: { rock: 6, wood: 2 }, desc: '取暖照明。' },
  { id: 'chest', name: '储物箱', output: 'chest_item', count: 1, cost: { plank: 4, fiber: 2 }, needsWorkbench: true, desc: '存放物品。' },
  { id: 'door', name: '防护门', output: 'door', count: 1, cost: { plank: 3, ore_scrap: 2 }, needsWorkbench: true, desc: '可开合的门。' },
  { id: 'brick', name: '烧砖块 x4', output: 'block_brick', count: 4, cost: { dirt: 2, rock: 1, wood: 1 }, needsWorkbench: true, desc: '坚固墙体。' },
  { id: 'glass', name: '砂光玻璃 x2', output: 'block_glass', count: 2, cost: { sand: 3, wood: 1 }, needsWorkbench: true, desc: '窗户。' },
  { id: 'lamp', name: '晶能灯', output: 'lamp', count: 1, cost: { crystal: 1, metal: 1, glass: 1 }, needsWorkbench: true, desc: '明亮照明。' },
  { id: 'metal', name: '合金锭 x2', output: 'metal', count: 2, cost: { ore: 2, wood: 2 }, needsWorkbench: true, desc: '高级材料。' },
  { id: 'metalblock', name: '合金板', output: 'block_metal', count: 1, cost: { metal: 3 }, needsWorkbench: true, desc: '高防御建材。' },
  { id: 'energycell', name: '能源方块', output: 'block_energy', count: 1, cost: { metal: 2, crystal: 2 }, needsWorkbench: true, desc: '供能设备。' },
  { id: 'hammer2', name: '合金粉碎锤', output: 'hammer_t2', count: 1, cost: { metal: 4, wood: 2, crystal: 1 }, needsWorkbench: true, desc: '高级采集锤。' },
  { id: 'axe2', name: '合金斩斧', output: 'axe_t2', count: 1, cost: { metal: 4, wood: 2 }, needsWorkbench: true, desc: '高级斧与武器。' },
  { id: 'drill2', name: '晶能深掘钻', output: 'drill_t2', count: 1, cost: { metal: 5, crystal: 2 }, needsWorkbench: true, desc: '高级挖掘钻。' },
  { id: 'repairgun', name: '修理器', output: 'repair_gun', count: 1, cost: { metal: 3, ore_scrap: 4 }, needsWorkbench: true, desc: '修复建筑与工具。' },
  { id: 'spike', name: '晶刺投矛 x4', output: 'crystal_spike', count: 4, cost: { crystal: 1, wood: 1, metal: 1 }, needsWorkbench: true, desc: '远程攻击。' },
  { id: 'fiberarmor', name: '韧须护服', output: 'fiber_armor', count: 1, cost: { fiber: 8 }, desc: '基础护具。' },
  { id: 'metalarmor', name: '合金护甲', output: 'metal_armor', count: 1, cost: { metal: 6, fiber: 4 }, needsWorkbench: true, desc: '高级护具。' },
  { id: 'meatcook', name: '炙烤骸肉', output: 'meat_cooked', count: 1, cost: { meat_raw: 1, wood: 1 }, desc: '烹饪食物。' },
  { id: 'warmdrink', name: '暖根热饮', output: 'warm_drink', count: 1, cost: { cactus_flesh: 1, fiber: 1 }, desc: '抗寒饮品。' },
  { id: 'bandage', name: '纤维绷带', output: 'bandage', count: 2, cost: { fiber: 3 }, desc: '治疗。' },
  { id: 'towerkit', name: '塔体修复件', output: 'tower_kit', count: 1, cost: { ruin_metal: 4, metal: 3, crystal: 2 }, needsWorkbench: true, unlockQuest: 5, desc: '修复废弃能源塔。' },
  { id: 'detector', name: '地脉探测器', output: 'ley_detector', count: 1, cost: { ley_coords: 1, crystal: 3, metal: 4, energy_cell: 1 }, needsWorkbench: true, unlockQuest: 6, desc: '定位地脉核心。' },
  { id: 'signalchip', name: '信号传输芯片', output: 'signal_chip', count: 1, cost: { crystal: 4, ruin_metal: 2, energy_cell: 2 }, needsWorkbench: true, unlockQuest: 7, desc: '最终信号传输。' },
];

export type CraftResult = 'ok' | 'no_materials' | 'no_station' | 'locked';

export function canCraft(recipe: Recipe, inv: Inventory, nearWorkbench: boolean, questStage: number): CraftResult {
  if (recipe.unlockQuest !== undefined && questStage < recipe.unlockQuest) return 'locked';
  if (recipe.needsWorkbench && !nearWorkbench) return 'no_station';
  if (!inv.hasMaterials(recipe.cost)) return 'no_materials';
  return 'ok';
}

export function craft(recipe: Recipe, inv: Inventory, nearWorkbench: boolean, questStage: number): CraftResult {
  const ok = canCraft(recipe, inv, nearWorkbench, questStage);
  if (ok !== 'ok') return ok;
  inv.pay(recipe.cost);
  const leftover = inv.add(recipe.output, recipe.count);
  return leftover > 0 ? 'no_materials' : 'ok';
}
