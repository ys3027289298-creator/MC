// Block registry. ids >= BLOCK_USER_PLACED_BASE are placeable construction blocks.

export const enum B {
  Air = 0,
  Sod = 1,
  Dirt = 2,
  Gravel = 3,
  Rock = 4,
  Sand = 5,
  Silt = 6,
  DeepShale = 7,
  IronLode = 8,
  CopperLode = 9,
  CrystalLode = 10,
  CoalLode = 11,
  DeadwoodLog = 12,
  Driftwood = 13,
  ThornBramble = 14,
  RuinStone = 15,
  Scoria = 16,
  // placeable
  TimberPlank = 17,
  GlassPane = 18,
  RivetPlate = 19,
  ClayBrick = 20,
  GlowCrystal = 21,
  Brazier = 22,
  Workbench = 23,
  Strongbox = 24,
  HatchDoor = 25,
  EnergyCell = 26,
  RelayCore = 27,
  Frostshard = 28,
  EnergyConduit = 29,
  LeyCore = 30
}

export type ToolKind = 'hammer' | 'axe' | 'drill' | 'none';

export interface BlockDef {
  id: number;
  name: string;
  color: number;
  hardness: number; // seconds of base mining time
  tool: ToolKind;
  solid: boolean;
  transparent?: boolean;
  emissive?: number;
  placeable?: boolean;
  drop?: string; // item id
  dropCount?: [number, number];
  hp?: number; // structural integrity for built blocks
  description: string;
}

function def(
  id: number,
  name: string,
  color: number,
  hardness: number,
  tool: ToolKind,
  description: string,
  extra: Partial<BlockDef> = {}
): BlockDef {
  return {
    id,
    name,
    color,
    hardness,
    tool,
    solid: true,
    description,
    ...extra
  };
}

export const BLOCKS: Record<number, BlockDef> = {
  [B.Air]: def(B.Air, '空气', 0x000000, 0, 'none', '', { solid: false }),
  [B.Sod]: def(B.Sod, '荒原草甸', 0x6b7d4f, 0.7, 'hammer', '表层草甸土，荒原上最常见的地块。', { drop: 'sod_clod', dropCount: [1, 1] }),
  [B.Dirt]: def(B.Dirt, '荒壤', 0x7a5a3c, 0.6, 'hammer', '干燥的荒原土壤。', { drop: 'dirt_clod', dropCount: [1, 1] }),
  [B.Gravel]: def(B.Gravel, '碎石坡', 0x8d887d, 0.9, 'hammer', '松散碎石，偶尔嵌有矿石碎块。', { drop: 'gravel_bit', dropCount: [1, 2] }),
  [B.Rock]: def(B.Rock, '灰岩', 0x70727a, 1.6, 'hammer', '坚固的岩石，需要采集锤。', { drop: 'rock_bit', dropCount: [1, 1] }),
  [B.Sand]: def(B.Sand, '流沙', 0xcbb37e, 0.5, 'none', '沙地，挖掘无需工具。', { drop: 'sand_pile', dropCount: [1, 2] }),
  [B.Silt]: def(B.Silt, '水底淤泥', 0x4f5a55, 0.8, 'none', '浅水之下的淤泥。', { drop: 'silt_clump', dropCount: [1, 1] }),
  [B.DeepShale]: def(B.DeepShale, '深层页岩', 0x3c3f49, 2.6, 'drill', '洞穴深处的坚硬页岩。', { drop: 'shale_shard', dropCount: [1, 1] }),
  [B.IronLode]: def(B.IronLode, '赤铁矿脉', 0x9a6b52, 2.2, 'drill', '含有铁屑的矿脉。', { drop: 'iron_scrap', dropCount: [1, 3] }),
  [B.CopperLode]: def(B.CopperLode, '斑铜矿脉', 0x8e6a3f, 2.0, 'drill', '含有铜屑的矿脉。', { drop: 'copper_scrap', dropCount: [1, 3] }),
  [B.CrystalLode]: def(B.CrystalLode, '晶簇矿脉', 0x5fd1c4, 2.8, 'drill', '生长在地下晶洞的发光晶体。', { emissive: 0x1fd1c0, drop: 'raw_crystal', dropCount: [1, 2] }),
  [B.CoalLode]: def(B.CoalLode, '泥炭脉', 0x2f3138, 1.8, 'drill', '可燃烧的泥炭层。', { drop: 'peat_lump', dropCount: [1, 2] }),
  [B.DeadwoodLog]: def(B.DeadwoodLog, '枯木', 0x6e4f33, 1.0, 'axe', '荒原枯树的树干，制作木材。', { drop: 'deadwood_log', dropCount: [1, 2] }),
  [B.Driftwood]: def(B.Driftwood, '流木', 0x8a7155, 0.8, 'axe', '水边堆积的流木。', { drop: 'driftwood_piece', dropCount: [1, 2] }),
  [B.ThornBramble]: def(B.ThornBramble, '荆棘丛', 0x4a5a38, 0.4, 'none', '坚韧的荆棘，可编成绳索。', { drop: 'thorn_fiber', dropCount: [1, 2] }),
  [B.RuinStone]: def(B.RuinStone, '残垣石', 0x938b78, 1.8, 'hammer', '旧文明遗迹的加工石材。', { drop: 'ruin_stone_bit', dropCount: [1, 2] }),
  [B.Scoria]: def(B.Scoria, '熔渣块', 0x5a4038, 2.4, 'drill', '能源塔附近的高温熔渣。', { drop: 'scoria_chunk', dropCount: [1, 2] }),

  [B.TimberPlank]: def(B.TimberPlank, '木板材', 0x9c7a52, 1.1, 'axe', '加工后的木板，基础建筑材料。', { placeable: true, drop: 'timber_plank', dropCount: [1, 1], hp: 60 }),
  [B.GlassPane]: def(B.GlassPane, '磨砂玻璃板', 0xa9c8cf, 0.6, 'none', '透光的玻璃窗。', { placeable: true, transparent: true, drop: 'glass_pane', dropCount: [1, 1], hp: 30 }),
  [B.RivetPlate]: def(B.RivetPlate, '铆接金属板', 0x8f97a3, 2.4, 'drill', '坚固的金属墙板。', { placeable: true, drop: 'rivet_plate', dropCount: [1, 1], hp: 120 }),
  [B.ClayBrick]: def(B.ClayBrick, '烧造砖块', 0xa8573e, 1.8, 'hammer', '结实的砖墙。', { placeable: true, drop: 'clay_brick', dropCount: [1, 1], hp: 90 }),
  [B.GlowCrystal]: def(B.GlowCrystal, '嵌壁光晶', 0x5fd1c4, 1.2, 'drill', '照亮据点的发光晶体。', { placeable: true, emissive: 0x35e0cf, drop: 'glow_crystal', dropCount: [1, 1], hp: 40 }),
  [B.Brazier]: def(B.Brazier, '泥炭火盆', 0xc0552f, 1.4, 'hammer', '燃烧泥炭取暖、驱赶夜行生物。', { placeable: true, emissive: 0xff7a33, drop: 'brazier', dropCount: [1, 1], hp: 50 }),
  [B.Workbench]: def(B.Workbench, '组装工作台', 0x7d6140, 1.6, 'axe', '解锁高级配方的工作台。', { placeable: true, drop: 'workbench', dropCount: [1, 1], hp: 70 }),
  [B.Strongbox]: def(B.Strongbox, '铆钉储物箱', 0x6a7079, 1.8, 'hammer', '可存放物品的储物箱（40 格）。', { placeable: true, drop: 'strongbox', dropCount: [1, 1], hp: 80 }),
  [B.HatchDoor]: def(B.HatchDoor, '防护门', 0x7a828f, 2.0, 'drill', '可开合的门，关闭时阻挡敌人。', { placeable: true, drop: 'hatch_door', dropCount: [1, 1], hp: 100 }),
  [B.EnergyCell]: def(B.EnergyCell, '能源电池组', 0x4f8f7a, 2.0, 'drill', '为设备供电的电池组。', { placeable: true, emissive: 0x2fa98f, drop: 'energy_cell', dropCount: [1, 1], hp: 70 }),
  [B.RelayCore]: def(B.RelayCore, '塔心中继器', 0x5d7fd6, 2.2, 'drill', '修复废弃能源塔的关键部件。', { placeable: true, emissive: 0x4d6fe0, drop: 'relay_core', dropCount: [1, 1], hp: 80 }),
  [B.Frostshard]: def(B.Frostshard, '霜晶石', 0x8fc7e8, 1.6, 'drill', '摸起来冰冷的霜晶石，降温区域产物。', { placeable: true, emissive: 0x6fb6e0, drop: 'frost_shard', dropCount: [1, 1], hp: 50 }),
  [B.EnergyConduit]: def(B.EnergyConduit, '能源导管', 0x3fa98f, 1.8, 'drill', '连接能源装置的导管。', { placeable: true, emissive: 0x1f8f78, drop: 'energy_conduit', dropCount: [1, 1], hp: 60 }),
  [B.LeyCore]: def(B.LeyCore, '地脉核心座', 0xd6a94f, 3.0, 'drill', '任务终点：启动地脉核心。', { placeable: true, emissive: 0xffc84a, drop: undefined, hp: 200 })
};

export function blockDef(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[B.Air];
}

export function isSolid(id: number): boolean {
  if (id === B.HatchDoor) return true; // open/close tracked separately in world
  return blockDef(id).solid;
}
