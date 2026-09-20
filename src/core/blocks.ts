// 方块类型定义：《荒原方格：失落地脉》原创方块
export enum BlockId {
  Air = 0,
  Turf = 1,          // 荒原草皮
  Dirt = 2,          // 黄土层
  Rock = 3,          // 灰岩
  Sand = 4,          // 流沙土
  Gravel = 5,        // 碎石堆
  Highland = 6,      // 高岭岩
  ShallowWater = 7,  // 浅水
  DeepWater = 8,     // 深水
  Wood = 9,          // 棘木
  Leaves = 10,       // 灰冠叶
  Plank = 11,        // 木板
  Brick = 12,        // 烧砖块
  Glass = 13,        // 砂光玻璃
  MetalPlate = 14,   // 合金板
  OreDeep = 15,      // 深脉矿
  Crystal = 16,      // 发光晶体
  EnergyCell = 17,   // 能源方块
  FiberPlant = 18,   // 韧须草
  Rubble = 19,       // 废墟残块
  RuinMetal = 20,    // 蚀化金属
  OreScrap = 21,     // 地表碎矿
  Workbench = 22,    // 工作台
  Brazier = 23,      // 火盆
  Chest = 24,        // 储物箱
  Door = 25,         // 防护门
  GlowLamp = 26,     // 晶能灯
  CoreBlock = 27,    // 地脉核心
  TowerPart = 28,    // 能源塔基座
  Observatory = 29,  // 观测站构件
  CrystalOre = 30,   // 晶洞矿
  SnowPeak = 31,     // 霜结高地
}

export type ToolKind = 'hammer' | 'axe' | 'drill' | 'none';

export interface BlockDef {
  id: BlockId;
  name: string;
  color: number;
  hardness: number;         // 采集所需基准秒数
  tool: ToolKind;           // 推荐/必需工具
  drop?: string;            // 掉落物品 id（item id）
  dropCount?: [number, number];
  solid?: boolean;
  transparent?: boolean;
  liquid?: boolean;
  light?: number;           // 自发光强度 0..1
  placeable?: boolean;      // 玩家可否放置
  building?: boolean;       // 玩家建筑（计入建筑数、可损坏）
  buildingHp?: number;
  heightMove?: number;      // 经过时移动速度倍率（非液体特殊地形）
  desc: string;
}

const def = (d: BlockDef): BlockDef => ({ placeable: false, solid: true, ...d });

export const BLOCKS: Record<number, BlockDef> = {
  [BlockId.Air]: def({ id: 0, name: '空气', color: 0x000000, hardness: 0, tool: 'none', solid: false, desc: '' }),
  [BlockId.Turf]: def({ id: 1, name: '荒原草皮', color: 0x7d8f55, hardness: 0.6, tool: 'drill', drop: 'turf', dropCount: [1, 1], desc: '荒原表层方块，混生韧须草。' }),
  [BlockId.Dirt]: def({ id: 2, name: '黄土层', color: 0x8a6f43, hardness: 0.5, tool: 'drill', drop: 'dirt', desc: '干燥的黄土，烧制后可成砖。' }),
  [BlockId.Rock]: def({ id: 3, name: '灰岩', color: 0x7d8089, hardness: 1.2, tool: 'hammer', drop: 'rock', desc: '常见石材，建筑基础材料。' }),
  [BlockId.Sand]: def({ id: 4, name: '流沙土', color: 0xcab978, hardness: 0.4, tool: 'drill', drop: 'sand', heightMove: 0.75, desc: '沙地区域松软，移动略慢。' }),
  [BlockId.Gravel]: def({ id: 5, name: '碎石堆', color: 0x8f8a80, hardness: 0.7, tool: 'none', drop: 'gravel', desc: '松散碎石，徒手可挖。' }),
  [BlockId.Highland]: def({ id: 6, name: '高岭岩', color: 0x9a8f7f, hardness: 1.8, tool: 'drill', drop: 'highland', desc: '高海拔岩层，气温更低。' }),
  [BlockId.ShallowWater]: def({ id: 7, name: '浅水', color: 0x3f7d8c, hardness: 0, tool: 'none', solid: false, transparent: true, liquid: true, heightMove: 0.65, desc: '没过小腿的冷水。' }),
  [BlockId.DeepWater]: def({ id: 8, name: '深水', color: 0x1f4658, hardness: 0, tool: 'none', solid: false, transparent: true, liquid: true, heightMove: 0.4, desc: '深水区，体温快速流失。' }),
  [BlockId.Wood]: def({ id: 9, name: '棘木', color: 0x6b4a2e, hardness: 1.0, tool: 'axe', drop: 'wood', desc: '棘刺乔木的主干。' }),
  [BlockId.Leaves]: def({ id: 10, name: '灰冠叶', color: 0x6a7a5a, hardness: 0.2, tool: 'none', drop: 'fiber', dropCount: [1, 2], transparent: true, desc: '可获得韧须纤维。' }),
  [BlockId.Plank]: def({ id: 11, name: '木板', color: 0xa07c4e, hardness: 0.9, tool: 'axe', drop: 'plank', placeable: true, building: true, buildingHp: 60, desc: '基础建筑材料。' }),
  [BlockId.Brick]: def({ id: 12, name: '烧砖块', color: 0x9c5a44, hardness: 1.6, tool: 'hammer', drop: 'brick', placeable: true, building: true, buildingHp: 120, desc: '坚固耐候的墙体。' }),
  [BlockId.Glass]: def({ id: 13, name: '砂光玻璃', color: 0x9fc4cc, hardness: 0.5, tool: 'none', drop: 'glass', placeable: true, building: true, buildingHp: 30, transparent: true, desc: '透光窗户。' }),
  [BlockId.MetalPlate]: def({ id: 14, name: '合金板', color: 0x8a94a2, hardness: 2.2, tool: 'drill', drop: 'metal', placeable: true, building: true, buildingHp: 200, desc: '高强度防御建材。' }),
  [BlockId.OreDeep]: def({ id: 15, name: '深脉矿', color: 0x565a66, hardness: 2.6, tool: 'drill', drop: 'ore', desc: '深层金属矿，需挖掘钻。' }),
  [BlockId.Crystal]: def({ id: 16, name: '发光晶体', color: 0x54e0c8, hardness: 1.4, tool: 'hammer', drop: 'crystal', light: 0.85, desc: '自发光的能量晶体。' }),
  [BlockId.EnergyCell]: def({ id: 17, name: '能源方块', color: 0x4ab0e0, hardness: 2.0, tool: 'drill', drop: 'energy_cell', light: 0.6, placeable: true, building: true, buildingHp: 100, desc: '储存能源，为设备供电。' }),
  [BlockId.FiberPlant]: def({ id: 18, name: '韧须草', color: 0x8aa05a, hardness: 0.15, tool: 'none', solid: false, drop: 'fiber', desc: '可直接采集的植物。' }),
  [BlockId.Rubble]: def({ id: 19, name: '废墟残块', color: 0x7a7468, hardness: 1.3, tool: 'hammer', drop: 'rubble', desc: '遗迹残块，可能藏有蚀化金属。' }),
  [BlockId.RuinMetal]: def({ id: 20, name: '蚀化金属', color: 0x6a7060, hardness: 2.0, tool: 'drill', drop: 'ruin_metal', desc: '旧时代蚀化金属构件。' }),
  [BlockId.OreScrap]: def({ id: 21, name: '地表碎矿', color: 0x707a80, hardness: 0.8, tool: 'hammer', drop: 'ore_scrap', desc: '地表可拾的碎矿。' }),
  [BlockId.Workbench]: def({ id: 22, name: '工作台', color: 0x9a7244, hardness: 0.9, tool: 'axe', drop: 'workbench', placeable: true, building: true, buildingHp: 80, desc: '靠近可制作高级配方。' }),
  [BlockId.Brazier]: def({ id: 23, name: '火盆', color: 0xd07030, hardness: 0.8, tool: 'hammer', drop: 'brazier', placeable: true, building: true, buildingHp: 60, light: 0.7, desc: '燃烧取暖，驱散黑夜寒意。' }),
  [BlockId.Chest]: def({ id: 24, name: '储物箱', color: 0x8a5e34, hardness: 1.0, tool: 'axe', drop: 'chest_item', placeable: true, building: true, buildingHp: 70, desc: '存放 18 格物品。' }),
  [BlockId.Door]: def({ id: 25, name: '防护门', color: 0x708090, hardness: 1.8, tool: 'drill', drop: 'door', placeable: true, building: true, buildingHp: 150, desc: '可开合，连接能源后自动锁闭。' }),
  [BlockId.GlowLamp]: def({ id: 26, name: '晶能灯', color: 0xbfe8e0, hardness: 0.6, tool: 'none', drop: 'lamp', placeable: true, building: true, buildingHp: 40, light: 1, desc: '明亮照明，提升安全值。' }),
  [BlockId.CoreBlock]: def({ id: 27, name: '地脉核心', color: 0xe0a040, hardness: 99, tool: 'drill', light: 1, desc: '任务终点：启动并保护它。' }),
  [BlockId.TowerPart]: def({ id: 28, name: '能源塔基座', color: 0x5a6a78, hardness: 99, tool: 'drill', desc: '废弃能源塔的残骸。' }),
  [BlockId.Observatory]: def({ id: 29, name: '观测站构件', color: 0x6a7a8a, hardness: 99, tool: 'drill', desc: '失落观测站，内藏地脉坐标。' }),
  [BlockId.CrystalOre]: def({ id: 30, name: '晶洞矿', color: 0x3aa090, hardness: 1.8, tool: 'hammer', drop: 'crystal', dropCount: [1, 3], light: 0.35, desc: '晶洞中富含能量晶体。' }),
  [BlockId.SnowPeak]: def({ id: 31, name: '霜结高地', color: 0xd8e4e8, hardness: 1.6, tool: 'drill', drop: 'highland', heightMove: 0.85, desc: '常年霜结，极度寒冷。' }),
};

export function isSolid(id: number): boolean {
  return BLOCKS[id]?.solid ?? false;
}
export function isLiquid(id: number): boolean {
  return !!BLOCKS[id]?.liquid;
}
export function blockLight(id: number): number {
  return BLOCKS[id]?.light ?? 0;
}
