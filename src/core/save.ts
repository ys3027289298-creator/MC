import { Inventory } from './inventory';
import { QuestState } from './quests';
import { GameEvent } from './events';
import { Enemy } from './enemies';
import { SpecialSite } from './world';

export interface ChestData {
  key: string;
  slots: ({ id: string; count: number; durability?: number } | null)[];
}

export interface GameSave {
  version: number;
  seed: string;
  player: {
    x: number; y: number; z: number; yaw: number; pitch: number;
    hp: number; stamina: number; food: number; temperature: number; safety: number;
    spawnX: number; spawnY: number; spawnZ: number;
  };
  inventory: ReturnType<Inventory['serialize']>;
  env: { time: number; day: number; weather: string; weatherTime: number };
  edits: [string, number][];
  buildingHp: [string, number][];
  doors: string[];
  sites: SpecialSite[];
  quest: QuestState;
  events: GameEvent[];
  enemies: Enemy[];
  chests: ChestData[];
  stats: { buildings: number; mined: number; kills: number; playTime: number };
  settings: { deathDrop: string; sensitivity: number; renderDistance: number };
  finalWave: number;
  savedAt: number;
}

const SAVE_KEY = 'wasteland-leyline-save-v1';
const SETTINGS_KEY = 'wasteland-leyline-settings';

export function saveGame(data: GameSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('保存失败', e);
    throw new Error('存档写入失败：浏览器存储空间不足或被禁用。');
  }
}

export function hasSave(): boolean {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function loadGame(): GameSave {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) throw new Error('没有可读取的存档。');
  let data: GameSave;
  try {
    data = JSON.parse(raw);
  } catch {
    localStorage.removeItem(SAVE_KEY);
    throw new Error('存档已损坏，无法解析。已自动清除坏档。');
  }
  if (!data || typeof data !== 'object' || !data.seed || !data.player || !data.inventory || data.version !== 1) {
    throw new Error('存档版本不兼容或内容缺失。');
  }
  return data;
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function saveSettings(s: { deathDrop: string; sensitivity: number; renderDistance: number }): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
export function loadSettings(): { deathDrop: string; sensitivity: number; renderDistance: number } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { deathDrop: 'half', sensitivity: 1, renderDistance: 4, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { deathDrop: 'half', sensitivity: 1, renderDistance: 4 };
}

export { SAVE_KEY };
