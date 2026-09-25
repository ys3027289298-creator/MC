// localStorage persistence with corruption handling.

import { HOTBAR_SIZE } from './inventory';
import { itemDef } from './items';

export const SAVE_KEY = 'wasteland-grids-save-v1';

export interface GameSave {
  version: number;
  savedAt: number;
  playTime: number;
  seed: string | number;
  body: { x: number; y: number; z: number; yaw: number; pitch: number };
  inventory: unknown;
  survival: unknown;
  environment: unknown;
  world: unknown;
  quests: unknown;
  events: unknown[];
  stats: GameStats;
  route: 'fortify' | 'salvage';
}

export interface GameStats {
  blocksMined: number;
  blocksPlaced: number;
  resourcesGathered: number;
  enemiesKilled: number;
  buildingsBuilt: number;
  damageDealt: number;
  damageTaken: number;
  crafts: number;
}

export function emptyStats(): GameStats {
  return {
    blocksMined: 0,
    blocksPlaced: 0,
    resourcesGathered: 0,
    enemiesKilled: 0,
    buildingsBuilt: 0,
    damageDealt: 0,
    damageTaken: 0,
    crafts: 0
  };
}

export function hasSave(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(data: GameSave, storage: Storage = localStorage): { ok: boolean; error?: string } {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function loadGame(storage: Storage = localStorage): { ok: true; data: GameSave } | { ok: false; error: string } {
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (e) {
    return { ok: false, error: `无法读取浏览器存档：${e instanceof Error ? e.message : String(e)}` };
  }
  if (!raw) return { ok: false, error: '没有找到存档。' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `存档已损坏，读取失败：${e instanceof Error ? e.message : String(e)}` };
  }
  return validateGameSave(parsed);
}

export function clearSave(storage: Storage = localStorage): void {
  storage.removeItem(SAVE_KEY);
}

// ---------- deep structural validation (runtime boundary, not a type cast) ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function corrupt(reason: string): { ok: false; error: string } {
  return { ok: false, error: `存档已损坏：${reason}` };
}

function isValidItemStack(v: unknown): boolean {
  if (!isRecord(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (!isFiniteNumber(v.count) || v.count <= 0) return false;
  if (v.durability !== undefined && !isFiniteNumber(v.durability)) return false;
  try {
    itemDef(v.id);
  } catch {
    return false;
  }
  return true;
}

function isStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

function isKeyNumberPairs(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every((e) => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && isFiniteNumber(e[1]))
  );
}

function validateBody(body: unknown): string | null {
  if (!isRecord(body)) return '缺少角色位置数据（body）';
  for (const k of ['x', 'y', 'z', 'yaw', 'pitch'] as const) {
    if (!isFiniteNumber(body[k])) return `角色坐标 ${k} 不是有限数值`;
  }
  return null;
}

function validateInventory(inv: unknown): string | null {
  if (!isRecord(inv)) return '缺少背包数据（inventory）';
  if (!Array.isArray(inv.slots)) return '背包槽位（inventory.slots）缺失或不是数组';
  for (const s of inv.slots) {
    if (s === null) continue;
    if (!isValidItemStack(s)) return '背包槽位中存在无效的物品堆叠';
  }
  if (inv.hotbarIndex !== undefined) {
    if (!Number.isInteger(inv.hotbarIndex) || (inv.hotbarIndex as number) < 0 || (inv.hotbarIndex as number) >= HOTBAR_SIZE) {
      return '快捷栏索引（hotbarIndex）越界';
    }
  }
  if (inv.armor !== undefined && inv.armor !== null && !isValidItemStack(inv.armor)) {
    return '装备栏（armor）结构错误';
  }
  if (inv.size !== undefined && (!Number.isInteger(inv.size) || (inv.size as number) <= 0)) {
    return '背包容量（size）不是正整数';
  }
  return null;
}

function validateWorld(world: unknown): string | null {
  if (!isRecord(world)) return '缺少世界数据（world）';
  if (typeof world.seed !== 'string' && typeof world.seed !== 'number') return '世界种子（world.seed）缺失';
  if (!isKeyNumberPairs(world.modifications)) return '世界修改记录（modifications）结构错误';
  if (world.doors !== undefined && !isStringArray(world.doors)) return '门状态记录（doors）类型错误';
  if (world.damage !== undefined && !isKeyNumberPairs(world.damage)) return '方块耐久记录（damage）类型错误';
  if (world.depleted !== undefined && !isStringArray(world.depleted)) return '资源枯竭记录（depleted）类型错误';
  if (world.containers !== undefined) {
    if (!Array.isArray(world.containers)) return '容器记录（containers）类型错误';
    for (const entry of world.containers) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) {
        return '容器槽位（containers）不是数组';
      }
      for (const s of entry[1]) {
        if (s === null) continue;
        if (!isValidItemStack(s)) return '容器中存在无效的物品堆叠';
      }
    }
  }
  if (world.drops !== undefined) {
    if (!Array.isArray(world.drops)) return '掉落物记录（drops）类型错误';
    for (const d of world.drops) {
      if (!isRecord(d)) return '掉落物（drops）结构错误';
      if (typeof d.id !== 'string' || d.id.length === 0) return '掉落物缺少物品 id';
      if (!isFiniteNumber(d.count) || d.count <= 0) return '掉落物数量无效';
      for (const k of ['x', 'y', 'z', 'vy', 'born'] as const) {
        if (!isFiniteNumber(d[k])) return `掉落物坐标 ${k} 不是有限数值`;
      }
      if (d.durability !== undefined && !isFiniteNumber(d.durability)) return '掉落物耐久无效';
      try {
        itemDef(d.id);
      } catch {
        return '掉落物包含未知物品';
      }
    }
  }
  return null;
}

const STAT_KEYS: (keyof GameStats)[] = [
  'blocksMined',
  'blocksPlaced',
  'resourcesGathered',
  'enemiesKilled',
  'buildingsBuilt',
  'damageDealt',
  'damageTaken',
  'crafts'
];

function validateStats(stats: unknown): string | null {
  if (!isRecord(stats)) return '缺少统计数据（stats）';
  for (const k of STAT_KEYS) {
    if (stats[k] !== undefined && !isFiniteNumber(stats[k])) return `统计数据 ${k} 不是有限数值`;
  }
  return null;
}

function validateSurvival(survival: unknown): string | null {
  if (!isRecord(survival)) return '缺少生存状态数据（survival）';
  const numeric = ['health', 'maxHealth', 'stamina', 'maxStamina', 'hunger', 'maxHunger', 'temperature', 'lightSafety'];
  for (const k of numeric) {
    if (survival[k] !== undefined && !isFiniteNumber(survival[k])) return `生存状态 ${k} 不是有限数值`;
  }
  if (survival.alive !== undefined && typeof survival.alive !== 'boolean') return '生存状态 alive 类型错误';
  if (survival.deathCause !== undefined && typeof survival.deathCause !== 'string') return '生存状态 deathCause 类型错误';
  return null;
}

function validateEnvironment(env: unknown): string | null {
  if (!isRecord(env)) return '缺少环境数据（environment）';
  for (const k of ['time', 'day', 'weatherTime'] as const) {
    if (env[k] !== undefined && !isFiniteNumber(env[k])) return `环境数据 ${k} 不是有限数值`;
  }
  if (env.weather !== undefined && !['clear', 'storm', 'sandstorm', 'frost'].includes(env.weather as string)) {
    return '环境天气（weather）取值无效';
  }
  return null;
}

function validateQuests(quests: unknown): string | null {
  if (!isRecord(quests)) return '缺少任务数据（quests）';
  if (quests.stage !== undefined && !isFiniteNumber(quests.stage)) return '任务阶段（stage）不是有限数值';
  if (quests.flags !== undefined && !isRecord(quests.flags)) return '任务标记（flags）结构错误';
  return null;
}

function validateEvents(events: unknown): string | null {
  if (!Array.isArray(events)) return '事件日志（events）不是数组';
  for (const ev of events) {
    if (!isRecord(ev)) return '事件日志中存在无效条目';
    if (typeof ev.kind !== 'string' || typeof ev.title !== 'string' || typeof ev.detail !== 'string') {
      return '事件日志条目结构错误';
    }
    if (!isFiniteNumber(ev.time)) return '事件日志时间不是有限数值';
  }
  return null;
}

// Validates a parsed JSON value against the v1 save shape. Returns the typed
// save on success, or a stable Chinese corruption message on failure. Never throws.
export function validateGameSave(parsed: unknown): { ok: true; data: GameSave } | { ok: false; error: string } {
  if (!isRecord(parsed)) return corrupt('存档内容不是有效的游戏存档');
  if (parsed.version !== 1) return corrupt('存档版本号不是 1');
  if (!isFiniteNumber(parsed.savedAt)) return corrupt('缺少保存时间（savedAt）');
  if (!isFiniteNumber(parsed.playTime)) return corrupt('游戏时长（playTime）不是有限数值');
  if (typeof parsed.seed !== 'string' && typeof parsed.seed !== 'number') return corrupt('缺少世界种子（seed）');
  if (parsed.route !== 'fortify' && parsed.route !== 'salvage') return corrupt('任务路线（route）取值无效');

  const checks: [unknown, (v: unknown) => string | null][] = [
    [parsed.body, validateBody],
    [parsed.inventory, validateInventory],
    [parsed.world, validateWorld],
    [parsed.survival, validateSurvival],
    [parsed.environment, validateEnvironment],
    [parsed.quests, validateQuests],
    [parsed.events, validateEvents],
    [parsed.stats, validateStats]
  ];
  for (const [value, check] of checks) {
    const problem = check(value);
    if (problem) return corrupt(problem);
  }
  return { ok: true, data: parsed as unknown as GameSave };
}
