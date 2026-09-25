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

function isValidGameSave(parsed: unknown): parsed is GameSave {
  const p = parsed as GameSave;
  return (
    typeof p === 'object' &&
    p !== null &&
    p.version === 1 &&
    !!p.body &&
    !!p.inventory &&
    !!p.world &&
    !!p.survival
  );
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
    if (!isValidGameSave(parsed)) {
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

// ---------- multi-slot saves (v2 envelope) ----------

export const SLOT_VERSION = 2;
export const MANUAL_SLOT_IDS = ['manual-1', 'manual-2', 'manual-3'] as const;
export const AUTO_SLOT_ID = 'auto';
export const SLOT_IDS = [...MANUAL_SLOT_IDS, AUTO_SLOT_ID] as const;
export type ManualSlotId = (typeof MANUAL_SLOT_IDS)[number];
export type SlotId = (typeof SLOT_IDS)[number];
export const CURRENT_SLOT_KEY = 'wasteland-grids-current-slot';

const SLOT_LABELS: Record<SlotId, string> = {
  'manual-1': '槽位 1',
  'manual-2': '槽位 2',
  'manual-3': '槽位 3',
  auto: '自动保存'
};

export function isSlotId(value: unknown): value is SlotId {
  return typeof value === 'string' && (SLOT_IDS as readonly string[]).includes(value);
}

export function slotKey(id: SlotId): string {
  return `wasteland-grids-slot-v2-${id}`;
}

export function slotLabel(id: SlotId): string {
  return SLOT_LABELS[id];
}

export function slotKind(id: SlotId): 'manual' | 'auto' {
  return id === AUTO_SLOT_ID ? 'auto' : 'manual';
}

export interface SlotSummary {
  seed: string;
  route: 'fortify' | 'salvage';
  day: number;
  playTime: number;
  savedAt: number;
}

export interface SlotEnvelope {
  version: number;
  slotId: SlotId;
  summary: SlotSummary;
  data: GameSave;
}

export type SlotState = 'empty' | 'ok' | 'corrupt';

export interface SlotInfo {
  id: SlotId;
  kind: 'manual' | 'auto';
  label: string;
  state: SlotState;
  summary: SlotSummary | null;
  error?: string;
}

function safeNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

// Build a display summary from any (possibly legacy / partial) save without throwing.
export function buildSummary(data: GameSave, now: number = Date.now()): SlotSummary {
  const env = (data?.environment ?? undefined) as { day?: unknown } | undefined;
  const dayRaw = env && typeof env.day === 'number' && Number.isFinite(env.day) ? Math.floor(env.day) : 1;
  return {
    seed: data?.seed === undefined || data?.seed === null ? '未知种子' : String(data.seed),
    route: data?.route === 'salvage' ? 'salvage' : 'fortify',
    day: dayRaw >= 1 ? dayRaw : 1,
    playTime: safeNonNegative(data?.playTime, 0),
    savedAt: safeNonNegative(data?.savedAt, now)
  };
}

export function saveToSlot(
  id: SlotId,
  data: GameSave,
  storage: Storage = localStorage,
  source: 'manual' | 'auto' = 'manual'
): { ok: boolean; error?: string } {
  if (!isSlotId(id)) return { ok: false, error: `未知槽位：${String(id)}` };
  if (source === 'manual' && slotKind(id) === 'auto') {
    return { ok: false, error: '自动保存槽位不能手动覆盖。' };
  }
  const envelope: SlotEnvelope = {
    version: SLOT_VERSION,
    slotId: id,
    summary: buildSummary(data),
    data
  };
  try {
    // single atomic JSON replace: one key per slot, no partial writes
    storage.setItem(slotKey(id), JSON.stringify(envelope));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function parseEnvelope(raw: string, id: SlotId): SlotEnvelope {
  const parsed = JSON.parse(raw) as SlotEnvelope;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    parsed.version !== SLOT_VERSION ||
    parsed.slotId !== id ||
    !parsed.summary ||
    !isValidGameSave(parsed.data)
  ) {
    throw new Error('槽位数据不完整或版本不符');
  }
  return parsed;
}

export function loadSlot(
  id: SlotId,
  storage: Storage = localStorage
): { ok: true; data: GameSave; summary: SlotSummary } | { ok: false; error: string } {
  if (!isSlotId(id)) return { ok: false, error: `未知槽位：${String(id)}` };
  let raw: string | null;
  try {
    raw = storage.getItem(slotKey(id));
  } catch (e) {
    return { ok: false, error: `无法读取浏览器存档：${e instanceof Error ? e.message : String(e)}` };
  }
  if (!raw) return { ok: false, error: `${slotLabel(id)}是空的，没有可读取的进度。` };
  try {
    const envelope = parseEnvelope(raw, id);
    return { ok: true, data: envelope.data, summary: envelope.summary };
  } catch (e) {
    return { ok: false, error: `${slotLabel(id)}已损坏，读取失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

// Stable ordered view of all slots; a corrupt slot never breaks the others.
export function listSlots(storage: Storage = localStorage): SlotInfo[] {
  return SLOT_IDS.map((id) => {
    const base: SlotInfo = { id, kind: slotKind(id), label: slotLabel(id), state: 'empty', summary: null };
    let raw: string | null;
    try {
      raw = storage.getItem(slotKey(id));
    } catch (e) {
      return { ...base, state: 'corrupt', error: e instanceof Error ? e.message : String(e) };
    }
    if (!raw) return base;
    try {
      const envelope = parseEnvelope(raw, id);
      return { ...base, state: 'ok', summary: envelope.summary };
    } catch (e) {
      return { ...base, state: 'corrupt', error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export function deleteSlot(id: SlotId, storage: Storage = localStorage): void {
  if (!isSlotId(id)) return;
  try {
    storage.removeItem(slotKey(id));
  } catch {
    /* ignore */
  }
}

export function hasAnySlotSave(storage: Storage = localStorage): boolean {
  return listSlots(storage).some((s) => s.state === 'ok');
}

// ---------- current slot marker ----------

export function readCurrentSlot(storage: Storage = localStorage): SlotId | null {
  try {
    const raw = storage.getItem(CURRENT_SLOT_KEY);
    return isSlotId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeCurrentSlot(id: SlotId | null, storage: Storage = localStorage): void {
  try {
    if (id === null) storage.removeItem(CURRENT_SLOT_KEY);
    else storage.setItem(CURRENT_SLOT_KEY, id);
  } catch {
    /* ignore */
  }
}

// ---------- legacy v1 single-save migration ----------

// Map the old single save into an explicit slot. Only called on a user action
// (continue / save); the legacy key is removed only after the slot write succeeds.
export function migrateLegacySave(
  targetSlot: ManualSlotId,
  storage: Storage = localStorage
): { ok: true; slot: ManualSlotId } | { ok: false; error: string } {
  const legacy = loadGame(storage);
  if (!legacy.ok) return { ok: false, error: legacy.error };
  const existing = loadSlot(targetSlot, storage);
  if (existing.ok) return { ok: false, error: `${slotLabel(targetSlot)}已有进度，不能覆盖。` };
  const written = saveToSlot(targetSlot, legacy.data, storage, 'manual');
  if (!written.ok) return { ok: false, error: written.error ?? '写入槽位失败。' };
  clearSave(storage);
  return { ok: true, slot: targetSlot };
}

export function firstEmptyManualSlot(storage: Storage = localStorage): ManualSlotId | null {
  const slots = listSlots(storage);
  for (const id of MANUAL_SLOT_IDS) {
    const info = slots.find((s) => s.id === id);
    if (info && info.state === 'empty') return id;
  }
  return null;
}

export function clearAllSaves(storage: Storage = localStorage): void {
  for (const id of SLOT_IDS) deleteSlot(id, storage);
  clearSave(storage);
  writeCurrentSlot(null, storage);
}

// ---------- safe display formatting ----------

export function formatPlayTime(seconds: unknown): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '时长未知';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export function formatSavedAt(timestamp: unknown): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return '时间未知';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '时间未知';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function routeLabel(route: unknown): string {
  return route === 'salvage' ? '拾荒奇兵' : '固守工事';
}
