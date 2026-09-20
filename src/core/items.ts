// 物品 / 工具 / 食物定义
export type ItemKind = 'material' | 'block' | 'tool' | 'food' | 'equip' | 'quest';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  color: number;
  maxStack: number;
  desc: string;
  blockId?: number;         // block 类物品对应方块
  toolType?: 'hammer' | 'axe' | 'drill' | 'repair' | 'light' | 'weapon';
  tier?: number;
  efficiency?: number;      // 采集速度倍率
  durability?: number;
  damage?: number;
  food?: number;             // 饱食回复
  heal?: number;
  warmth?: number;
  ranged?: boolean;
  armor?: number;            // 护具减伤比例
  quest?: boolean;
}

const mat = (id: string, name: string, color: number, desc: string, extra: Partial<ItemDef> = {}): ItemDef =>
  ({ id, name, kind: 'material', color, maxStack: 99, desc, ...extra });
const blk = (id: string, name: string, color: number, blockId: number, desc: string): ItemDef =>
  ({ id, name, kind: 'block', color, maxStack: 99, blockId, desc });

export const ITEMS: Record<string, ItemDef> = {
  // 材料
  turf: mat('turf', '草皮块', 0x7d8f55, '可回填或垫脚。'),
  dirt: mat('dirt', '黄土', 0x8a6f43, '烧制砖块的原料。'),
  rock: mat('rock', '灰岩块', 0x7d8089, '基础石材。'),
  sand: mat('sand', '流沙土', 0xcab978, '烧制玻璃的原料。'),
  gravel: mat('gravel', '碎石', 0x8f8a80, '可合成砾石地面。'),
  highland: mat('highland', '高岭岩块', 0x9a8f7f, '寒冷高地石材。'),
  wood: mat('wood', '棘木', 0x6b4a2e, '多用途木材。'),
  fiber: mat('fiber', '韧须纤维', 0x8aa05a, '制作护具与绷带。'),
  plank: mat('plank', '木板', 0xa07c4e, '基础建材。'),
  brick: mat('brick', '烧砖块', 0x9c5a44, '坚固建材。'),
  glass: mat('glass', '砂光玻璃', 0x9fc4cc, '窗户材料。'),
  metal: mat('metal', '合金锭', 0x8a94a2, '高级金属材料。'),
  ore: mat('ore', '深脉矿砂', 0x565a66, '在熔炉类配方中炼成合金。'),
  ore_scrap: mat('ore_scrap', '碎矿', 0x707a80, '低级金属来源。'),
  ruin_metal: mat('ruin_metal', '蚀化金属', 0x6a7060, '遗迹特产，修复能源塔的关键。'),
  rubble: mat('rubble', '残块碎料', 0x7a7468, '遗迹回收材料。'),
  crystal: mat('crystal', '能量晶体', 0x54e0c8, '发光能源，晶洞产出。'),
  energy_cell: mat('energy_cell', '能源电池', 0x4ab0e0, '为设备与最终防御供能。'),
  cactus_flesh: mat('cactus_flesh', '旱刺果肉', 0x9ab06a, '沙地里的应急食物。'),
  meat_raw: mat('meat_raw', '生骸肉', 0xa05a5a, '敌人掉落，需烹饪。'),
  meat_cooked: mat('meat_cooked', '炙烤骸肉', 0xc07a4a, '恢复大量饱食。', { kind: 'food', maxStack: 20, food: 45, heal: 8 }),
  ration_paste: mat('ration_paste', '遗迹补给膏', 0xb0a070, '商旅或遗迹获得的应急口粮。', { kind: 'food', maxStack: 10, food: 30, heal: 12 }),
  bandage: mat('bandage', '纤维绷带', 0xd8c8b0, '回复生命。', { kind: 'food', maxStack: 20, heal: 30 }),
  warm_drink: mat('warm_drink', '暖根热饮', 0xc08a50, '驱散寒意。', { kind: 'food', maxStack: 10, food: 10, heal: 5, warmth: 40 }),
  core_fragment: mat('core_fragment', '地脉碎核', 0xe0a040, '地脉核心的碎片。', { kind: 'quest', quest: true, maxStack: 5 }),
  ley_coords: mat('ley_coords', '地脉坐标盘', 0x80c8e0, '观测站中取得的坐标数据。', { kind: 'quest', quest: true, maxStack: 1 }),
  tower_kit: mat('tower_kit', '塔体修复件', 0x708090, '修复能源塔所需组件。', { kind: 'quest', quest: true, maxStack: 1 }),
  // 方块物品
  block_plank: blk('block_plank', '木板', 0xa07c4e, 11, '放置木板。'),
  block_brick: blk('block_brick', '烧砖块', 0x9c5a44, 12, '放置砖墙。'),
  block_glass: blk('block_glass', '玻璃', 0x9fc4cc, 13, '放置玻璃窗。'),
  block_metal: blk('block_metal', '合金板', 0x8a94a2, 14, '放置合金板。'),
  block_crystal: blk('block_crystal', '发光晶体', 0x54e0c8, 16, '放置发光晶体。'),
  block_energy: blk('block_energy', '能源方块', 0x4ab0e0, 17, '放置能源方块。'),
  block_turf: blk('block_turf', '草皮', 0x7d8f55, 1, '放置草皮。'),
  workbench: blk('workbench', '工作台', 0x9a7244, 22, '放置后可制作高级物品。'),
  brazier: blk('brazier', '火盆', 0xd07030, 23, '放置火盆取暖照明。'),
  chest_item: blk('chest_item', '储物箱', 0x8a5e34, 24, '放置储物箱。'),
  door: blk('door', '防护门', 0x708090, 25, '放置可开合的门。'),
  lamp: blk('lamp', '晶能灯', 0xbfe8e0, 26, '放置晶能灯。'),
  // 工具
  hammer_t1: { id: 'hammer_t1', name: '石质采集锤', kind: 'tool', color: 0x9a9a90, maxStack: 1, desc: '开采石头与晶体。', toolType: 'hammer', tier: 1, efficiency: 1.4, durability: 120, damage: 10 },
  hammer_t2: { id: 'hammer_t2', name: '合金粉碎锤', kind: 'tool', color: 0x8ab0c8, maxStack: 1, desc: '高效开采，战斗伤害更高。', toolType: 'hammer', tier: 2, efficiency: 2.6, durability: 260, damage: 22 },
  axe_t1: { id: 'axe_t1', name: '燧石切割斧', kind: 'tool', color: 0xb08a5a, maxStack: 1, desc: '砍伐棘木、破坏木质建筑。', toolType: 'axe', tier: 1, efficiency: 1.6, durability: 120, damage: 12 },
  axe_t2: { id: 'axe_t2', name: '合金斩斧', kind: 'tool', color: 0x9ac0b8, maxStack: 1, desc: '高级伐木与近战武器。', toolType: 'axe', tier: 2, efficiency: 3.0, durability: 260, damage: 26 },
  drill_t1: { id: 'drill_t1', name: '手摇挖掘钻', kind: 'tool', color: 0xc0a060, maxStack: 1, desc: '挖掘泥土、深层矿与金属。', toolType: 'drill', tier: 1, efficiency: 1.8, durability: 160, damage: 8 },
  drill_t2: { id: 'drill_t2', name: '晶能深掘钻', kind: 'tool', color: 0x60d0c0, maxStack: 1, desc: '极速挖掘，深层作业必备。', toolType: 'drill', tier: 2, efficiency: 3.4, durability: 320, damage: 16 },
  glow_stick: { id: 'glow_stick', name: '照明棒', kind: 'tool', color: 0x80f0d8, maxStack: 1, desc: '手持提升黑暗安全值，可插在墙上。', toolType: 'light', tier: 1, efficiency: 1, durability: 300, damage: 2 },
  repair_gun: { id: 'repair_gun', name: '修理器', kind: 'tool', color: 0x6ab0e0, maxStack: 1, desc: '对建筑按右键可修复耐久，修理自身工具。', toolType: 'repair', tier: 1, efficiency: 1, durability: 200, damage: 0 },
  scrap_blade: { id: 'scrap_blade', name: '废铁短刃', kind: 'tool', color: 0xaab0b8, maxStack: 1, desc: '早期近战武器。', toolType: 'weapon', tier: 1, efficiency: 1, durability: 100, damage: 14 },
  crystal_spike: { id: 'crystal_spike', name: '晶刺投矛', kind: 'tool', color: 0x60e0c0, maxStack: 30, desc: '远程投射物，命中造成高伤害。', toolType: 'weapon', tier: 2, efficiency: 1, durability: 1, damage: 30, ranged: true },
  // 护具
  fiber_armor: { id: 'fiber_armor', name: '韧须护服', kind: 'equip', color: 0x8aa05a, maxStack: 1, desc: '减少 15% 伤害，略微抗寒。', armor: 0.15, durability: 200 },
  metal_armor: { id: 'metal_armor', name: '合金护甲', kind: 'equip', color: 0x8a94a2, maxStack: 1, desc: '减少 35% 伤害。', armor: 0.35, durability: 400 },
  // 任务道具
  ley_detector: { id: 'ley_detector', name: '地脉探测器', kind: 'quest', color: 0xe0c060, maxStack: 1, desc: '指向地脉核心的探测器。', quest: true },
  signal_chip: { id: 'signal_chip', name: '信号传输芯片', kind: 'quest', color: 0x80e0c0, maxStack: 1, desc: '最终信号传输所需。', quest: true },
};

export function getItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}
