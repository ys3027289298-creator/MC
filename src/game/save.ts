// localStorage persistence with corruption handling.

import { HOTBAR_SIZE } from './inventory';

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

export type LoadResult = { ok: true; data: GameSave } | { ok: false; error: string };

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

// ---------- deep structural validation (v1 format, runtime boundary) ----------

const CORRUPT_PREFIX = '存档已损坏，读取失败：';

function corrupt(reason: string): { ok: false; error: string } {
  return { ok: false, error: `${CORRUPT_PREFIX}${reason}` };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isItemStack(v: unknown): boolean {
  if (!isRecord(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (!isFiniteNum(v.count) || v.count <= 0) return false;
  if (v.durability !== undefined && !isFiniteNum(v.durability)) return false;
  return true;
}

function isStackOrNull(v: unknown): boolean {
  return v === null || isItemStack(v);
}

function validateBody(v: unknown): string | null {
  if (!isRecord(v)) return '缺少玩家位置数据（body）';
  for (const key of ['x', 'y', 'z', 'yaw', 'pitch'] as const) {
    if (!isFiniteNum(v[key])) return `玩家坐标或视角（body.${key}）不是有限数值`;
  }
  return null;
}

function validateInventory(v: unknown): string | null {
  if (!isRecord(v)) return '背包数据（inventory）缺失或结构错误';
  if (!Array.isArray(v.slots)) return '背包槽位（inventory.slots）缺失或不是数组';
  for (const s of v.slots) {
    if (!isStackOrNull(s)) return '背包中存在非法的物品堆叠';
  }
  if (v.hotbarIndex !== undefined) {
    const i = v.hotbarIndex;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= HOTBAR_SIZE) {
      return '快捷栏索引（hotbarIndex）越界';
    }
  }
  if (v.armor !== undefined && v.armor !== null && !isItemStack(v.armor)) return '护具栏（armor）结构错误';
  if (v.size !== undefined) {
    const s = v.size;
    if (typeof s !== 'number' || !Number.isInteger(s) || s <= 0) return '背包容量（size）非法';
  }
  return null;
}

function validateSurvival(v: unknown): string | null {
  if (!isRecord(v)) return '生存状态（survival）缺失或结构错误';
  const numericKeys = ['health', 'maxHealth', 'stamina', 'maxStamina', 'hunger', 'maxHunger', 'temperature', 'lightSafety'];
  for (const key of numericKeys) {
    if (v[key] !== undefined && !isFiniteNum(v[key])) return `生存状态（survival.${key}）不是有限数值`;
  }
  if (v.alive !== undefined && typeof v.alive !== 'boolean') return '生存状态（survival.alive）类型错误';
  if (v.deathCause !== undefined && typeof v.deathCause !== 'string') return '生存状态（survival.deathCause）类型错误';
  return null;
}

function validateEnvironment(v: unknown): string | null {
  if (!isRecord(v)) return '环境状态（environment）缺失或结构错误';
  for (const key of ['time', 'day', 'weatherTime'] as const) {
    if (v[key] !== undefined && !isFiniteNum(v[key])) return `环境状态（environment.${key}）不是有限数值`;
  }
  if (v.weather !== undefined && !['clear', 'storm', 'sandstorm', 'frost'].includes(v.weather as string)) {
    return '环境天气（environment.weather）非法';
  }
  return null;
}

function validateQuests(v: unknown): string | null {
  if (!isRecord(v)) return '任务进度（quests）缺失或结构错误';
  if (v.stage !== undefined && !isFiniteNum(v.stage)) return '任务阶段（quests.stage）不是有限数值';
  if (v.flags !== undefined && !isRecord(v.flags)) return '任务标记（quests.flags）结构错误';
  if (v.route !== undefined && v.route !== 'fortify' && v.route !== 'salvage') return '任务路线（quests.route）非法';
  if (v.routeChosen !== undefined && typeof v.routeChosen !== 'boolean') return '任务进度（quests.routeChosen）类型错误';
  if (v.finished !== undefined && typeof v.finished !== 'boolean') return '任务进度（quests.finished）类型错误';
  if (v.ending !== undefined && typeof v.ending !== 'string') return '任务进度（quests.ending）类型错误';
  return null;
}

function validateWorld(v: unknown): string | null {
  if (!isRecord(v)) return '世界数据（world）缺失或结构错误';
  if (typeof v.seed !== 'string' && typeof v.seed !== 'number') return '世界种子（world.seed）缺失';
  const pairFields: [string, unknown][] = [
    ['modifications', v.modifications],
    ['damage', v.damage]
  ];
  for (const [name, arr] of pairFields) {
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) return `世界记录（world.${name}）不是数组`;
    for (const entry of arr) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !isFiniteNum(entry[1])) {
        return `世界记录（world.${name}）条目结构错误`;
      }
    }
  }
  const stringFields: [string, unknown][] = [
    ['doors', v.doors],
    ['depleted', v.depleted]
  ];
  for (const [name, arr] of stringFields) {
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) return `世界记录（world.${name}）不是数组`;
    for (const entry of arr) {
      if (typeof entry !== 'string') return `世界记录（world.${name}）条目类型错误`;
    }
  }
  if (v.containers !== undefined) {
    if (!Array.isArray(v.containers)) return '储物箱（world.containers）不是数组';
    for (const entry of v.containers) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) {
        return '储物箱（world.containers）槽位不是数组';
      }
      for (const s of entry[1]) {
        if (!isStackOrNull(s)) return '储物箱（world.containers）中存在非法物品堆叠';
      }
    }
  }
  if (v.drops !== undefined) {
    if (!Array.isArray(v.drops)) return '掉落物（world.drops）不是数组';
    for (const d of v.drops) {
      if (!isRecord(d) || typeof d.id !== 'string') return '掉落物（world.drops）条目结构错误';
      for (const key of ['count', 'x', 'y', 'z', 'vy', 'born'] as const) {
        if (!isFiniteNum(d[key])) return '掉落物（world.drops）条目数值非法';
      }
      if (d.durability !== undefined && !isFiniteNum(d.durability)) return '掉落物（world.drops）条目数值非法';
    }
  }
  return null;
}

function validateEvents(v: unknown): string | null {
  if (!Array.isArray(v)) return '事件记录（events）缺失或不是数组';
  for (const ev of v) {
    if (!isRecord(ev)) return '事件记录（events）条目结构错误';
    if (typeof ev.kind !== 'string' || typeof ev.title !== 'string' || typeof ev.detail !== 'string') {
      return '事件记录（events）条目结构错误';
    }
    if (!isFiniteNum(ev.time)) return '事件记录（events）条目时间非法';
  }
  return null;
}

function validateStats(v: unknown): string | null {
  if (!isRecord(v)) return '统计数据（stats）缺失或结构错误';
  for (const key of Object.keys(emptyStats())) {
    if (v[key] !== undefined && !isFiniteNum(v[key])) return `统计数据（stats.${key}）不是有限数值`;
  }
  return null;
}

// Validate a parsed JSON value against the v1 save shape. Returns the same
// value typed as GameSave on success; never throws, never mutates the input.
export function validateGameSave(parsed: unknown): LoadResult {
  if (!isRecord(parsed)) return corrupt('存档顶层结构不是对象');
  if (parsed.version !== 1) return corrupt('存档版本不兼容（需要 v1）');
  if (!isFiniteNum(parsed.savedAt)) return corrupt('存档时间（savedAt）非法');
  if (!isFiniteNum(parsed.playTime)) return corrupt('游戏时长（playTime）非法');
  if (typeof parsed.seed !== 'string' && typeof parsed.seed !== 'number') return corrupt('世界种子（seed）缺失');
  const checks: [unknown, (v: unknown) => string | null][] = [
    [parsed.body, validateBody],
    [parsed.inventory, validateInventory],
    [parsed.survival, validateSurvival],
    [parsed.environment, validateEnvironment],
    [parsed.world, validateWorld],
    [parsed.quests, validateQuests],
    [parsed.events, validateEvents],
    [parsed.stats, validateStats]
  ];
  for (const [value, check] of checks) {
    const reason = check(value);
    if (reason) return corrupt(reason);
  }
  if (parsed.route !== 'fortify' && parsed.route !== 'salvage') return corrupt('任务路线（route）非法');
  return { ok: true, data: parsed as unknown as GameSave };
}

export function loadGame(storage: Storage = localStorage): LoadResult {
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
    return corrupt(e instanceof Error ? e.message : String(e));
  }
  // Validation is a pure function, but keep a final boundary so loadGame
  // never throws at callers regardless of input.
  try {
    return validateGameSave(parsed);
  } catch (e) {
    return corrupt(e instanceof Error ? e.message : String(e));
  }
}

export function clearSave(storage: Storage = localStorage): void {
  storage.removeItem(SAVE_KEY);
}
