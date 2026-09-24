// Pure, testable view-model logic for the event log panel (J).
// Normalization, categorization, stable sorting and filtering live here so the
// UI layer never duplicates filter conditions. Nothing in this module mutates
// the engine's events array or the raw event objects.

import { EVENT_TITLES } from './events';

export type LogCategory = 'all' | 'weather' | 'combat' | 'explore' | 'system';
export type LogGroup = Exclude<LogCategory, 'all'>;
export type EventStatus = 'unresolved' | 'resolved';

// Backward-compatible view model for one log entry. Raw GameEvent objects (or
// legacy/partial records from old v1 saves) are normalized into this shape;
// missing fields fall back to safe defaults without changing event semantics.
export interface EventView {
  index: number; // original array position, used as stable sort tiebreaker
  time: number; // event time in seconds of play time (NaN-safe)
  kind: string; // raw kind, may be unknown to this build
  title: string;
  detail: string;
  status: EventStatus | null; // null = legacy record without status info
  category: LogGroup;
}

// Central kind -> category mapping. Unknown kinds fall back to 'system'.
export const EVENT_CATEGORY_MAP: Record<string, LogGroup> = {
  weather_shift: 'weather',
  raid: 'combat',
  migration: 'combat',
  depletion: 'explore',
  collapse: 'explore',
  caravan: 'explore',
  mechanism: 'explore',
  leak: 'system'
};

export const LOG_CATEGORIES: { id: LogCategory; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'weather', label: '天气' },
  { id: 'combat', label: '战斗' },
  { id: 'explore', label: '探索' },
  { id: 'system', label: '系统' }
];

const GROUP_LABELS: Record<LogGroup, string> = {
  weather: '天气',
  combat: '战斗',
  explore: '探索',
  system: '系统'
};

export const PLACEHOLDER_TITLE = '（无标题事件）';
export const PLACEHOLDER_DETAIL = '（暂无详细记录）';

export interface LogFilter {
  category: LogCategory;
  query: string;
}

export function defaultLogFilter(): LogFilter {
  return { category: 'all', query: '' };
}

function asText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? value : fallback;
}

function asTime(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asStatus(raw: Record<string, unknown>): EventStatus | null {
  if (raw.status === 'resolved' || raw.status === 'unresolved') return raw.status;
  if (raw.resolved === true) return 'resolved';
  if (raw.resolved === false) return 'unresolved';
  return null;
}

export function normalizeEvent(raw: unknown, index: number): EventView {
  const rec = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const kind = typeof rec.kind === 'string' && rec.kind ? rec.kind : 'unknown';
  return {
    index,
    time: asTime(rec.time),
    kind,
    title: asText(rec.title, PLACEHOLDER_TITLE),
    detail: asText(rec.detail, PLACEHOLDER_DETAIL),
    status: asStatus(rec),
    category: EVENT_CATEGORY_MAP[kind] ?? 'system'
  };
}

export function normalizeEvents(events: unknown): EventView[] {
  if (!Array.isArray(events)) return [];
  return events.map((e, i) => normalizeEvent(e, i));
}

// Stable sort by time; entries with equal time keep their original array order.
export function sortViews(views: EventView[]): EventView[] {
  return views
    .slice()
    .sort((a, b) => (a.time - b.time) || (a.index - b.index));
}

// View-only filter: returns a new sorted array, never mutates the input.
export function filterEvents(views: EventView[], filter: LogFilter): EventView[] {
  const query = filter.query.trim().toLowerCase();
  const matched = views.filter((v) => {
    if (filter.category !== 'all' && v.category !== filter.category) return false;
    if (!query) return true;
    return v.title.toLowerCase().includes(query) || v.detail.toLowerCase().includes(query);
  });
  return sortViews(matched);
}

export function statusText(view: EventView): string {
  if (view.status === 'resolved') return '已解决';
  if (view.status === 'unresolved') return '未解决';
  return '已记录';
}

export function categoryLabel(view: EventView): string {
  return GROUP_LABELS[view.category];
}

export function kindLabel(view: EventView): string {
  return (EVENT_TITLES as Record<string, string>)[view.kind] ?? '未知事件';
}

export function relativeTime(time: number, now: number): string {
  if (!Number.isFinite(time) || !Number.isFinite(now)) return '时间未知';
  const diff = Math.max(0, Math.floor(now - time));
  if (diff < 10) return '刚刚';
  if (diff < 60) return `${diff} 秒前`;
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟前` : `${hours} 小时前`;
}
