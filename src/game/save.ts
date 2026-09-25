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

// ---------- multi-slot envelope (v2) ----------
// Slots live under a single versioned key; each write replaces the whole JSON
// document atomically so a failed write can never leave half a slot behind.

export const SLOTS_KEY = 'wasteland-grids-save-slots-v2';
export const SLOTS_VERSION = 2;

export type ManualSlotId = 'slot1' | 'slot2' | 'slot3';
export type SlotId = ManualSlotId | 'auto';
export const MANUAL_SLOTS: readonly ManualSlotId[] = ['slot1', 'slot2', 'slot3'];
export const AUTO_SLOT = 'auto' as const;
export const ALL_SLOTS: readonly SlotId[] = [...MANUAL_SLOTS, AUTO_SLOT];

export interface SlotSummary {
  seed: string;
  route: 'fortify' | 'salvage';
  day: number;
  playTime: number;
  savedAt: number;
}

export interface SlotEntry {
  summary: SlotSummary;
  save: GameSave;
}

export interface SlotsEnvelope {
  version: number;
  currentSlot: SlotId | null;
  slots: Partial<Record<SlotId, SlotEntry>>;
}

export type SlotState = 'empty' | 'ok' | 'corrupt';

export interface SlotInfo {
  id: SlotId;
  state: SlotState;
  summary?: SlotSummary;
  error?: string;
}

export interface SlotListing {
  slots: SlotInfo[];
  currentSlot: SlotId | null;
  envelopeError?: string;
}

function emptyEnvelope(): SlotsEnvelope {
  return { version: SLOTS_VERSION, currentSlot: null, slots: {} };
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

function isValidSlotEntry(entry: unknown): entry is SlotEntry {
  const e = entry as SlotEntry;
  return typeof e === 'object' && e !== null && isValidGameSave(e.save);
}

// Safe summary: tolerates legacy saves with missing or malformed metadata.
export function summarizeSave(save: Partial<GameSave>): SlotSummary {
  const env = (save.environment ?? {}) as { day?: unknown };
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    seed: save.seed === undefined || save.seed === null ? '未知种子' : String(save.seed),
    route: save.route === 'salvage' ? 'salvage' : 'fortify',
    day: Math.max(1, Math.floor(num(env.day, 1))),
    playTime: Math.max(0, num(save.playTime, 0)),
    savedAt: Math.max(0, Math.floor(num(save.savedAt, 0)))
  };
}

function isValidSummary(s: unknown): s is SlotSummary {
  const m = s as SlotSummary;
  return (
    typeof m === 'object' &&
    m !== null &&
    typeof m.seed === 'string' &&
    (m.route === 'fortify' || m.route === 'salvage') &&
    typeof m.day === 'number' &&
    typeof m.playTime === 'number' &&
    typeof m.savedAt === 'number'
  );
}

export function readEnvelope(storage: Storage = localStorage): { envelope: SlotsEnvelope; error?: string } {
  let raw: string | null;
  try {
    raw = storage.getItem(SLOTS_KEY);
  } catch (e) {
    return { envelope: emptyEnvelope(), error: `无法读取存档列表：${e instanceof Error ? e.message : String(e)}` };
  }
  if (!raw) return { envelope: emptyEnvelope() };
  try {
    const parsed = JSON.parse(raw) as SlotsEnvelope;
    if (typeof parsed !== 'object' || parsed === null || parsed.version !== SLOTS_VERSION || typeof parsed.slots !== 'object' || parsed.slots === null) {
      throw new Error('存档列表版本或结构不符');
    }
    return {
      envelope: {
        version: SLOTS_VERSION,
        currentSlot: parsed.currentSlot ?? null,
        slots: parsed.slots
      }
    };
  } catch (e) {
    return { envelope: emptyEnvelope(), error: `存档列表已损坏：${e instanceof Error ? e.message : String(e)}` };
  }
}

function writeEnvelope(envelope: SlotsEnvelope, storage: Storage): { ok: boolean; error?: string } {
  try {
    storage.setItem(SLOTS_KEY, JSON.stringify(envelope));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Stable order: slot1..slot3, then auto. Corrupt entries never throw and never
// affect their neighbours.
export function listSlots(storage: Storage = localStorage): SlotListing {
  const { envelope, error } = readEnvelope(storage);
  const slots: SlotInfo[] = ALL_SLOTS.map((id) => {
    const entry = envelope.slots[id];
    if (entry === undefined || entry === null) return { id, state: 'empty' as const };
    if (!isValidSlotEntry(entry)) return { id, state: 'corrupt' as const, error: '槽位数据损坏或字段缺失' };
    const summary = isValidSummary(entry.summary) ? entry.summary : summarizeSave(entry.save);
    return { id, state: 'ok' as const, summary };
  });
  return { slots, currentSlot: envelope.currentSlot, envelopeError: error };
}

export function saveToSlot(
  id: SlotId,
  save: GameSave,
  storage: Storage = localStorage,
  opts: { allowAuto?: boolean } = {}
): { ok: boolean; error?: string } {
  if (!ALL_SLOTS.includes(id)) return { ok: false, error: `未知槽位：${id}` };
  if (id === AUTO_SLOT && !opts.allowAuto) return { ok: false, error: '自动保存槽位不能手动覆盖。' };
  const { envelope } = readEnvelope(storage);
  envelope.slots[id] = { summary: summarizeSave(save), save };
  envelope.currentSlot = id;
  return writeEnvelope(envelope, storage);
}

export function loadSlot(
  id: SlotId,
  storage: Storage = localStorage
): { ok: true; data: GameSave } | { ok: false; error: string } {
  const { envelope, error } = readEnvelope(storage);
  if (error) return { ok: false, error };
  const entry = envelope.slots[id];
  if (entry === undefined || entry === null) return { ok: false, error: '该槽位是空的。' };
  if (!isValidSlotEntry(entry)) return { ok: false, error: '该槽位的存档已损坏，无法读取。' };
  return { ok: true, data: entry.save };
}

export function deleteSlot(id: SlotId, storage: Storage = localStorage): { ok: boolean; error?: string } {
  const { envelope, error } = readEnvelope(storage);
  if (error) return { ok: false, error };
  delete envelope.slots[id];
  if (envelope.currentSlot === id) envelope.currentSlot = null;
  return writeEnvelope(envelope, storage);
}

export function getCurrentSlot(storage: Storage = localStorage): SlotId | null {
  return readEnvelope(storage).envelope.currentSlot;
}

export function setCurrentSlotMarker(id: SlotId | null, storage: Storage = localStorage): void {
  const { envelope } = readEnvelope(storage);
  envelope.currentSlot = id;
  writeEnvelope(envelope, storage);
}

export function clearAllSaves(storage: Storage = localStorage): void {
  try {
    storage.removeItem(SLOTS_KEY);
    storage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- legacy v1 single-save compatibility ----------
export function hasLegacySave(storage: Storage = localStorage): boolean {
  return hasSave(storage);
}

// Maps the old single save into a definite manual slot. Never silently drops
// data: if every manual slot is occupied the legacy save is left untouched.
export function migrateLegacySave(
  storage: Storage = localStorage,
  target?: ManualSlotId
): { ok: true; slot: ManualSlotId } | { ok: false; error: string } {
  const loaded = loadGame(storage);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  let slot = target;
  if (!slot) {
    const listing = listSlots(storage);
    const free = listing.slots.find((s) => MANUAL_SLOTS.includes(s.id as ManualSlotId) && s.state === 'empty');
    if (!free) return { ok: false, error: '没有空闲的手动槽位可迁移旧存档。' };
    slot = free.id as ManualSlotId;
  }
  const written = saveToSlot(slot, loaded.data, storage);
  if (!written.ok) return { ok: false, error: written.error ?? '迁移写入失败' };
  clearSave(storage);
  return { ok: true, slot };
}
