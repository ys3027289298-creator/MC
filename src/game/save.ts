// localStorage persistence with corruption handling.

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
  try {
    const parsed = JSON.parse(raw) as GameSave;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      parsed.version !== 1 ||
      !parsed.body ||
      !parsed.inventory ||
      !parsed.world ||
      !parsed.survival
    ) {
      throw new Error('字段缺失');
    }
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: `存档已损坏，读取失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

export function clearSave(storage: Storage = localStorage): void {
  storage.removeItem(SAVE_KEY);
}
