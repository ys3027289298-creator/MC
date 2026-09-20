// Item registry: tools, materials, food, armor, quest items, projectiles.

export type ItemKind = 'material' | 'tool' | 'food' | 'armor' | 'quest' | 'block' | 'projectile';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  maxStack: number;
  color: number;
  description: string;
  // tool
  toolType?: 'hammer' | 'axe' | 'drill' | 'light' | 'repair';
  power?: number; // mining power / damage
  damage?: number;
  durability?: number;
  // food
  hunger?: number;
  stamina?: number;
  health?: number;
  warmth?: number;
  // armor
  defense?: number;
  // block item
  blockId?: number;
}

function mat(id: string, name: string, color: number, description: string, maxStack = 99): ItemDef {
  return { id, name, kind: 'material', maxStack, color, description };
}

export const ITEMS: Record<string, ItemDef> = {
  // materials
  sod_clod: mat('sod_clod', '草甸土块', 0x6b7d4f, '一块草甸土，可垫脚。'),
  dirt_clod: mat('dirt_clod', '荒壤块', 0x7a5a3c, '干燥的土壤，可回填坑洞。'),
  gravel_bit: mat('gravel_bit', '碎石', 0x8d887d, '制作砖块与金属件的辅料。'),
  rock_bit: mat('rock_bit', '灰岩碎块', 0x70727a, '坚硬的石材。'),
  sand_pile: mat('sand_pile', '沙堆', 0xcbb37e, '烧制玻璃的原料。'),
  silt_clump: mat('silt_clump', '淤泥团', 0x4f5a55, '可以塑造成砖坯。'),
  shale_shard: mat('shale_shard', '页岩片', 0x3c3f49, '深层页岩碎片。'),
  iron_scrap: mat('iron_scrap', '铁屑', 0x9a6b52, '打造金属工具与板材。'),
  copper_scrap: mat('copper_scrap', '铜屑', 0x8e6a3f, '制作能源部件。'),
  raw_crystal: mat('raw_crystal', '原石晶', 0x5fd1c4, '地下晶洞出产的能量晶体原料。'),
  peat_lump: mat('peat_lump', '泥炭团', 0x2f3138, '火盆燃料，也可制作火把。'),
  deadwood_log: mat('deadwood_log', '枯原木', 0x6e4f33, '可切割成木板。'),
  driftwood_piece: mat('driftwood_piece', '流木料', 0x8a7155, '水边捡拾的木材。'),
  thorn_fiber: mat('thorn_fiber', '荆棘纤维', 0x4a5a38, '编织绑带与弓弦。'),
  ruin_stone_bit: mat('ruin_stone_bit', '残垣石块', 0x938b78, '旧文明加工过的石材。'),
  scoria_chunk: mat('scoria_chunk', '熔渣块', 0x5a4038, '能源塔附近的材料。'),
  timber_plank: { ...mat('timber_plank', '木板材', 0x9c7a52, '基础建筑方块。'), kind: 'block', blockId: 17 },
  glass_pane: { ...mat('glass_pane', '磨砂玻璃板', 0xa9c8cf, '透光窗户。'), kind: 'block', blockId: 18 },
  rivet_plate: { ...mat('rivet_plate', '铆接金属板', 0x8f97a3, '坚固墙板。'), kind: 'block', blockId: 19 },
  clay_brick: { ...mat('clay_brick', '烧造砖块', 0xa8573e, '结实砖墙。'), kind: 'block', blockId: 20 },
  glow_crystal: { ...mat('glow_crystal', '嵌壁光晶', 0x5fd1c4, '照明方块。'), kind: 'block', blockId: 21 },
  brazier: { ...mat('brazier', '泥炭火盆', 0xc0552f, '取暖照明，驱赶夜兽。'), kind: 'block', blockId: 22 },
  workbench: { ...mat('workbench', '组装工作台', 0x7d6140, '高级制作台。'), kind: 'block', blockId: 23 },
  strongbox: { ...mat('strongbox', '铆钉储物箱', 0x6a7079, '存放物品。'), kind: 'block', blockId: 24 },
  hatch_door: { ...mat('hatch_door', '防护门', 0x7a828f, '可开合的门。'), kind: 'block', blockId: 25 },
  energy_cell: { ...mat('energy_cell', '能源电池组', 0x4f8f7a, '供电设备。'), kind: 'block', blockId: 26 },
  relay_core: { ...mat('relay_core', '塔心中继器', 0x5d7fd6, '修复能源塔的部件。'), kind: 'block', blockId: 27 },
  frost_shard: { ...mat('frost_shard', '霜晶石', 0x8fc7e8, '寒冷区域的结晶。'), kind: 'block', blockId: 28 },
  energy_conduit: { ...mat('energy_conduit', '能源导管', 0x3fa98f, '连接设备。'), kind: 'block', blockId: 29 },
  ley_core: { ...mat('ley_core', '地脉核心座', 0xd6a94f, '任务核心。'), kind: 'block', blockId: 30 },

  // crafted materials
  stone_brick: mat('stone_brick', '石砌件', 0x8a8577, '石材加工件。'),
  iron_ingot: mat('iron_ingot', '锻铁锭', 0xb8b3a8, '精炼后的铁。'),
  copper_coil: mat('copper_coil', '铜线圈', 0xc08b4e, '绕制的铜线圈，能源部件。'),
  binding: mat('binding', '纤维绑带', 0x5a6a45, '工具绑定材料。'),
  glass_lens: mat('glass_lens', '玻璃透镜', 0xbfe0e8, '聚光透镜。'),
  energy_crystal: mat('energy_crystal', '能源晶体', 0x35e8d4, '晶洞中取得的能源晶体。', 20),
  repair_paste: mat('repair_paste', '修补膏', 0x9aa06a, '修复工具耐久。', 20),
  // food
  roasted_bulb: {
    id: 'roasted_bulb', name: '烤荒原球茎', kind: 'food', maxStack: 20, color: 0xc98f4a,
    description: '火盆烤制的球茎，恢复饱食与少量生命。', hunger: 35, health: 8, warmth: 6
  },
  cured_jerky: {
    id: 'cured_jerky', name: '风干兽肉干', kind: 'food', maxStack: 20, color: 0x8a4a38,
    description: '便于携带的肉干，恢复大量饱食。', hunger: 55, stamina: 15
  },
  thorn_brew: {
    id: 'thorn_brew', name: '荆棘热饮', kind: 'food', maxStack: 10, color: 0x7a8a4a,
    description: '温热的纤维饮，驱散寒冷。', hunger: 10, warmth: 30, stamina: 10
  },
  bulb_raw: mat('bulb_raw', '荒原球茎', 0x9aa06a, '可在火盆上烤制。', 30),
  beast_meat_raw: mat('beast_meat_raw', '生兽肉', 0x9a5a48, '需要烤熟再食用。', 20),
  // mob drops
  dusk_pelt: mat('dusk_pelt', '暮行兽皮', 0x4a4a66, '制作护具。'),
  razor_claw: mat('razor_claw', '裂脊蝎钳', 0xb0a080, '锋利材料。'),
  wraith_dust: mat('wraith_dust', '浮影尘', 0x7a6a9a, '罕见的能量粉尘。'),
  // projectiles
  thorn_dart: {
    id: 'thorn_dart', name: '荆棘飞镖', kind: 'projectile', maxStack: 40, color: 0x8aa05a,
    description: '远程投掷武器，造成 18 点伤害。', power: 18
  },
  // tools
  stone_hammer: tool('stone_hammer', '石质采集锤', 0x8a8577, 'hammer', 1.0, 60, 10, '基础采集锤，可挖石与土。'),
  iron_hammer: tool('iron_hammer', '锻铁重锤', 0xb8b3a8, 'hammer', 2.2, 120, 18, '高效采集锤，伤害更高。'),
  flint_axe: tool('flint_axe', '燧石切割斧', 0x9c7a52, 'axe', 1.4, 70, 12, '砍伐枯木、制作木板。'),
  iron_axe: tool('iron_axe', '锻铁阔斧', 0xc0b59a, 'axe', 2.6, 130, 22, '高级切割斧。'),
  hand_drill: tool('hand_drill', '手摇挖掘钻', 0xa08a6a, 'drill', 1.8, 90, 14, '可钻开深层矿脉。'),
  powered_drill: tool('powered_drill', '晶能动力钻', 0x5fd1c4, 'drill', 3.4, 160, 26, '最强采掘工具。'),
  glow_rod: tool('glow_rod', '手持照明棒', 0x35e0cf, 'light', 0, 100, 4, '提升黑暗中的照明安全值。'),
  repair_gun: tool('repair_gun', '喷补修理器', 0x9aa06a, 'repair', 0, 80, 6, '消耗修补膏，修理建筑与工具。'),
  // armor
  pelt_mantle: armor('pelt_mantle', '兽皮短氅', 0x4a4a66, 6, '简陋护具，减少伤害并略微保暖。'),
  plate_armor: armor('plate_armor', '铆片护甲', 0x8f97a3, 14, '金属护甲，大幅减伤。'),
  // quest
  observatory_chart: quest('observatory_chart', '地脉坐标图', 0xd6c84f, '在失落观测站找到的坐标图。'),
  ley_detector: quest('ley_detector', '地脉探测器', 0x4fd6a0, '指引地脉核心的位置。'),
  tower_fragment: quest('tower_fragment', '能源塔残片', 0x5d7fd6, '从废弃能源塔取得的残片。'),
  signal_lantern: quest('signal_lantern', '信号引灯', 0xffc84a, '最终传输时使用。'),
  relic_token: quest('relic_token', '遗迹铭牌', 0xb8a878, '解锁遗迹配方的凭证。'),
  // misc
  torch_stick: { ...mat('torch_stick', '泥炭照明棒', 0xc0552f, '放置在墙面提供短暂照明。'), kind: 'block', blockId: 21 }
};

function tool(
  id: string,
  name: string,
  color: number,
  toolType: ItemDef['toolType'],
  power: number,
  durability: number,
  damage: number,
  description: string
): ItemDef {
  return { id, name, kind: 'tool', maxStack: 1, color, description, toolType, power, durability, damage };
}

function armor(id: string, name: string, color: number, defense: number, description: string): ItemDef {
  return { id, name, kind: 'armor', maxStack: 1, color, description, defense };
}

function quest(id: string, name: string, color: number, description: string): ItemDef {
  return { id, name, kind: 'quest', maxStack: 1, color, description };
}

export function itemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`未知物品: ${id}`);
  return d;
}
