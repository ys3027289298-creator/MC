// Event log view model: categorization, normalization, stable sorting and filtering.
// Pure functions only — the UI layer never mutates engine.events.

import { GameEvent } from './events';

export type EventCategory = 'weather' | 'combat' | 'explore' | 'system';
export type EventFilter = 'all' | EventCategory;

// Central kind -> category mapping. Unknown kinds fall back to 'system'.
export const EVENT_CATEGORY_MAP: Record<string, EventCategory> = {
  weather_shift: 'weather',
  raid: 'combat',
  migration: 'combat',
  depletion: 'explore',
  collapse: 'explore',
  caravan: 'explore',
  mechanism: 'explore',
  leak: 'system'
};

export const EVENT_FILTERS: EventFilter[] = ['all', 'weather', 'combat', 'explore', 'system'];

export const FILTER_LABELS: Record<EventFilter, string> = {
  all: '全部',
  weather: '天气',
  combat: '战斗',
  explore: '探索',
  system: '系统'
};

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  weather: '天气',
  combat: '战斗',
  explore: '探索',
  system: '系统'
};

export type EventStatus = 'resolved' | 'unresolved' | 'recorded';

export const STATUS_LABELS: Record<EventStatus, string> = {
  resolved: '已解决',
  unresolved: '未解决',
  recorded: '已记录'
};

export const PLACEHOLDER_TITLE = '未命名事件';
export const PLACEHOLDER_DETAIL = '（没有留下详细记录）';
export const EMPTY_LOG_TEXT = '荒原一片平静，尚未发生事件。';
export const EMPTY_FILTER_TEXT = '当前筛选条件下没有匹配的事件。';

// Backward-compatible view model. Old saves may miss any field; raw events are never mutated.
export interface EventView {
  index: number;
  time: number;
  kind: string;
  title: string;
  detail: string;
  category: EventCategory;
  status: EventStatus;
}

export function categoryOf(kind: unknown): EventCategory {
  if (typeof kind !== 'string') return 'system';
  return EVENT_CATEGORY_MAP[kind] ?? 'system';
}

export function normalizeEvent(raw: unknown, index: number): EventView {
  const e = (raw ?? {}) as Partial<GameEvent>;
  const title = typeof e.title === 'string' && e.title.trim() ? e.title : PLACEHOLDER_TITLE;
  const detail = typeof e.detail === 'string' && e.detail.trim() ? e.detail : PLACEHOLDER_DETAIL;
  const time = typeof e.time === 'number' && Number.isFinite(e.time) ? e.time : 0;
  const kind = typeof e.kind === 'string' && e.kind ? e.kind : 'unknown';
  const status: EventStatus = e.resolved === true ? 'resolved' : e.resolved === false ? 'unresolved' : 'recorded';
  return { index, time, kind, title, detail, category: categoryOf(kind), status };
}

export function normalizeEvents(raw: unknown): EventView[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((e, i) => normalizeEvent(e, i));
}

// Stable sort by time; equal times keep the original array order (index tiebreak).
export function sortEvents(views: EventView[]): EventView[] {
  return [...views].sort((a, b) => a.time - b.time || a.index - b.index);
}

// View-only filter: returns a new array, never touches the input.
export function filterEvents(views: EventView[], filter: EventFilter, keyword: string): EventView[] {
  const kw = keyword.trim().toLowerCase();
  return views.filter((v) => {
    if (filter !== 'all' && v.category !== filter) return false;
    if (!kw) return true;
    return v.title.toLowerCase().includes(kw) || v.detail.toLowerCase().includes(kw);
  });
}

export function formatRelativeTime(time: number, now: number): string {
  const diff = Math.max(0, now - time);
  if (diff < 10) return '刚刚';
  if (diff < 60) return `${Math.floor(diff)} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  return `${Math.floor(diff / 3600)} 小时前`;
}
