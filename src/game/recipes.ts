// Crafting recipes. Some require a nearby workbench, a relic token, or quest progress.

import { ItemDef } from './items';

export interface Recipe {
  id: string;
  output: string;
  count: number;
  inputs: { item: string; count: number }[];
  requiresWorkbench?: boolean;
  requiresToken?: boolean; // relic discovery
  requiresQuest?: number; // quest index must be at least this stage unlocked
  repair?: boolean;
  name: string;
}

function r(
  id: string,
  output: string,
  count: number,
  inputs: [string, number][],
  opts: { requiresWorkbench?: boolean; requiresToken?: boolean; requiresQuest?: number } = {}
): Recipe {
  return {
    id,
    output,
    count,
    inputs: inputs.map(([item, c]) => ({ item, count: c })),
    name: output,
    ...opts
  };
}

export const RECIPES: Recipe[] = [
  // basic tools (hand)
  r('plank', 'timber_plank', 2, [['deadwood_log', 1]]),
  r('binding', 'binding', 2, [['thorn_fiber', 2]]),
  r('stone_brick', 'stone_brick', 2, [['rock_bit', 2], ['gravel_bit', 1]]),
  r('stone_hammer', 'stone_hammer', 1, [['gravel_bit', 3], ['deadwood_log', 2], ['binding', 1]]),
  r('flint_axe', 'flint_axe', 1, [['gravel_bit', 2], ['deadwood_log', 2], ['binding', 2]]),
  // workbench + advanced
  r('workbench', 'workbench', 1, [['timber_plank', 4], ['gravel_bit', 2]], {}),
  r('hand_drill', 'hand_drill', 1, [['iron_scrap', 4], ['timber_plank', 2], ['copper_scrap', 1]], { requiresWorkbench: true }),
  r('iron_ingot', 'iron_ingot', 1, [['iron_scrap', 3], ['peat_lump', 1]], { requiresWorkbench: true }),
  r('copper_coil', 'copper_coil', 1, [['copper_scrap', 3]], { requiresWorkbench: true }),
  r('iron_hammer', 'iron_hammer', 1, [['iron_ingot', 3], ['timber_plank', 2], ['binding', 2]], { requiresWorkbench: true }),
  r('iron_axe', 'iron_axe', 1, [['iron_ingot', 2], ['timber_plank', 2], ['binding', 2]], { requiresWorkbench: true }),
  // building
  r('clay_brick', 'clay_brick', 2, [['silt_clump', 2], ['peat_lump', 1]]),
  r('glass_pane', 'glass_pane', 2, [['sand_pile', 3], ['peat_lump', 1]], { requiresWorkbench: true }),
  r('rivet_plate', 'rivet_plate', 1, [['iron_ingot', 2]], { requiresWorkbench: true }),
  r('hatch_door', 'hatch_door', 1, [['iron_ingot', 2], ['timber_plank', 2]], { requiresWorkbench: true }),
  r('strongbox', 'strongbox', 1, [['rivet_plate', 1], ['timber_plank', 4]], { requiresWorkbench: true }),
  r('brazier', 'brazier', 1, [['rock_bit', 4], ['peat_lump', 2], ['iron_scrap', 1]]),
  r('glow_crystal', 'glow_crystal', 1, [['raw_crystal', 2], ['iron_scrap', 1]]),
  // food
  r('roasted_bulb', 'roasted_bulb', 1, [['bulb_raw', 1], ['peat_lump', 1]], { requiresWorkbench: false }),
  r('cured_jerky', 'cured_jerky', 1, [['beast_meat_raw', 1], ['thorn_fiber', 1]]),
  r('thorn_brew', 'thorn_brew', 1, [['thorn_fiber', 2], ['bulb_raw', 1]]),
  // combat / light
  r('thorn_dart', 'thorn_dart', 4, [['thorn_fiber', 2], ['gravel_bit', 1], ['deadwood_log', 1]]),
  r('glow_rod', 'glow_rod', 1, [['raw_crystal', 1], ['deadwood_log', 1], ['peat_lump', 1]]),
  r('pelt_mantle', 'pelt_mantle', 1, [['dusk_pelt', 3], ['binding', 2]], { requiresWorkbench: true }),
  // relic-locked / advanced
  r('repair_paste', 'repair_paste', 2, [['silt_clump', 1], ['raw_crystal', 1]], { requiresWorkbench: true }),
  r('repair_gun', 'repair_gun', 1, [['iron_ingot', 2], ['copper_coil', 1], ['repair_paste', 2]], { requiresWorkbench: true, requiresToken: true }),
  r('powered_drill', 'powered_drill', 1, [['iron_ingot', 3], ['copper_coil', 2], ['energy_crystal', 1]], { requiresWorkbench: true, requiresToken: true }),
  r('plate_armor', 'plate_armor', 1, [['rivet_plate', 3], ['binding', 2], ['wraith_dust', 1]], { requiresWorkbench: true, requiresToken: true }),
  // quest chain
  r('energy_cell', 'energy_cell', 1, [['iron_ingot', 2], ['copper_coil', 2], ['energy_crystal', 1]], { requiresWorkbench: true, requiresQuest: 4 }),
  r('relay_core', 'relay_core', 1, [['rivet_plate', 2], ['copper_coil', 2], ['energy_crystal', 2], ['tower_fragment', 1]], { requiresWorkbench: true, requiresQuest: 5 }),
  r('energy_conduit', 'energy_conduit', 2, [['copper_coil', 1], ['iron_ingot', 1]], { requiresWorkbench: true, requiresQuest: 5 }),
  r('ley_detector', 'ley_detector', 1, [['copper_coil', 2], ['raw_crystal', 2], ['observatory_chart', 1]], { requiresWorkbench: true, requiresQuest: 6 }),
  r('frost_shard_block', 'frost_shard', 1, [['raw_crystal', 2], ['silt_clump', 2]], { requiresWorkbench: true }),
  r('signal_lantern', 'signal_lantern', 1, [['glow_crystal', 1], ['copper_coil', 1], ['iron_ingot', 1]], { requiresWorkbench: true, requiresQuest: 8 })
];

export function recipeOutputName(r: Recipe, names: (id: string) => string): string {
  return names(r.output);
}

export type { ItemDef };
