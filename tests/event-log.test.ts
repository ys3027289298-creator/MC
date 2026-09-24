import { describe, it, expect } from 'vitest';
import {
  categoryOf,
  filterEvents,
  formatRelativeTime,
  normalizeEvent,
  normalizeEvents,
  sortEvents,
  EventView
} from '../src/game/event-log';
import { GameSave, saveGame, loadGame, emptyStats, SAVE_KEY } from '../src/game/save';
import type { GameEvent } from '../src/game/events';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    }
  } as unknown as Storage;
}

function ev(partial: Partial<GameEvent> & { kind?: string }): GameEvent {
  return {
    kind: 'weather_shift',
    title: '天气突变',
    time: 10,
    detail: '天气骤变为暴雨。',
    ...partial
  } as GameEvent;
}

describe('event log view model', () => {
  it('handles an empty log without crashing', () => {
    expect(normalizeEvents([])).toEqual([]);
    expect(filterEvents([], 'all', '')).toEqual([]);
  });

  it('normalizes a legacy event with missing fields into safe defaults', () => {
    const view = normalizeEvent({ time: 5, detail: '旧记录' }, 0);
    expect(view.time).toBe(5);
    expect(view.title).toBe('未命名事件');
    expect(view.detail).toBe('旧记录');
    expect(view.status).toBe('recorded');
  });

  it('maps kinds into categories, unknown kinds fall into system', () => {
    expect(categoryOf('weather_shift')).toBe('weather');
    expect(categoryOf('raid')).toBe('combat');
    expect(categoryOf('migration')).toBe('combat');
    expect(categoryOf('caravan')).toBe('explore');
    expect(categoryOf('mechanism')).toBe('explore');
    expect(categoryOf('collapse')).toBe('explore');
    expect(categoryOf('leak')).toBe('system');
    expect(categoryOf('not_a_real_kind')).toBe('system');
    expect(categoryOf(null)).toBe('system');
  });

  it('keeps a stable sort by time, preserving original order on ties', () => {
    const views = normalizeEvents([
      ev({ time: 30, title: '晚' }),
      ev({ time: 10, title: '早A' }),
      ev({ time: 10, title: '早B' }),
      ev({ time: 10, title: '早C' })
    ]);
    const sorted = sortEvents(views);
    expect(sorted.map((v) => v.title)).toEqual(['早A', '早B', '早C', '晚']);
    expect(sorted.slice(0, 3).map((v) => v.index)).toEqual([1, 2, 3]);
  });

  it('filters by category without touching the source array', () => {
    const views = normalizeEvents([
      ev({ kind: 'weather_shift', title: '暴雨' }),
      ev({ kind: 'raid', title: '袭击' }),
      ev({ kind: 'caravan', title: '商旅' })
    ]);
    const combat = filterEvents(views, 'combat', '');
    expect(combat).toHaveLength(1);
    expect(combat[0].title).toBe('袭击');
    expect(views).toHaveLength(3);
  });

  it('matches keyword case-insensitively against title and detail', () => {
    const views = normalizeEvents([
      ev({ title: 'Alpha 风暴', detail: '风很大' }),
      ev({ title: '平静', detail: 'Beta 出现' })
    ]);
    expect(filterEvents(views, 'all', 'ALPHA')).toHaveLength(1);
    expect(filterEvents(views, 'all', 'beta')).toHaveLength(1);
    expect(filterEvents(views, 'all', 'gamma')).toHaveLength(0);
  });

  it('treats blank keyword as no-op and combines with category filter', () => {
    const views = normalizeEvents([ev({ title: 'A' }), ev({ kind: 'raid', title: 'B' })]);
    expect(filterEvents(views, 'all', '   ')).toHaveLength(2);
    expect(filterEvents(views, 'combat', '')).toHaveLength(1);
    expect(filterEvents(views, 'system', '')).toHaveLength(0);
  });

  it('renders unknown kinds under system category with readable placeholders', () => {
    const view = normalizeEvent({ kind: 'mystery_thing', title: '', detail: undefined }, 0);
    expect(view.category).toBe('system');
    expect(view.title).toBe('未命名事件');
    expect(view.detail).toBe('（没有留下详细记录）');
  });

  it('handles null and malformed entries gracefully', () => {
    const views = normalizeEvents([null, undefined, 42, 'x'] as unknown as GameEvent[]);
    expect(views).toHaveLength(4);
    views.forEach((v) => {
      expect(v.title.length).toBeGreaterThan(0);
      expect(v.detail.length).toBeGreaterThan(0);
      expect(v.status).toBe('recorded');
      expect(v.category).toBe('system');
    });
  });

  it('keeps event semantics intact: does not mutate the original event object', () => {
    const original: GameEvent = { kind: 'raid', title: '据点遭袭', time: 12, detail: '敌人来了' };
    const copy = { ...original };
    normalizeEvent(original, 0);
    expect(original).toEqual(copy);
  });

  it('shows resolved/unresolved/recorded status safely', () => {
    expect(normalizeEvent({ resolved: true }, 0).status).toBe('resolved');
    expect(normalizeEvent({ resolved: false }, 0).status).toBe('unresolved');
    expect(normalizeEvent({}, 0).status).toBe('recorded');
  });

  it('sorts stably by time then original index', () => {
    const views: EventView[] = [
      { index: 0, time: 5, kind: 'a', title: 'A', detail: '', category: 'system', status: 'recorded' },
      { index: 1, time: 5, kind: 'b', title: 'B', detail: '', category: 'system', status: 'recorded' },
      { index: 2, time: 1, kind: 'c', title: 'C', detail: '', category: 'system', status: 'recorded' }
    ];
    const sorted = sortEvents(views);
    expect(sorted.map((v) => v.title)).toEqual(['C', 'A', 'B']);
  });

  it('reports relative time safely', () => {
    expect(formatRelativeTime(0, 30)).toBe('30 秒前');
    expect(formatRelativeTime(0, 120)).toBe('2 分钟前');
    expect(formatRelativeTime(0, 7200)).toBe('2 小时前');
    expect(formatRelativeTime(100, 100)).toBe('刚刚');
  });

  it('round-trips new fields through saveGame/loadGame without breaking old saves', () => {
    const storage = makeStorage();
    const save: GameSave = {
      version: 1,
      savedAt: Date.now(),
      playTime: 100,
      seed: 's',
      body: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
      inventory: {},
      survival: {},
      environment: {},
      world: {},
      quests: {},
      events: [
        { kind: 'raid', title: '袭击', time: 1, detail: 'd', resolved: true, timeLimit: 75 },
        { kind: 'weather_shift', title: '旧事件', time: 2, detail: '旧详情' }
      ],
      stats: emptyStats(),
      route: 'fortify'
    };
    expect(saveGame(save, storage).ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const events = loaded.data.events as GameEvent[];
      expect(events[0].timeLimit).toBe(75);
      expect(events[0].resolved).toBe(true);
      expect(events[1].timeLimit).toBeUndefined();
      expect(events[1].resolved).toBeUndefined();
    }
  });

  it('loads legacy v1 saves that predate the new fields', () => {
    const storage = makeStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        playTime: 50,
        seed: 's',
        body: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
        inventory: {},
        survival: {},
        environment: {},
        world: {},
        quests: {},
        events: [{ kind: 'collapse', title: '坍塌', time: 3, detail: '旧记录' }],
        stats: emptyStats(),
        route: 'salvage'
      })
    );
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const views = normalizeEvents(loaded.data.events);
      expect(views[0].status).toBe('recorded');
      expect(views[0].category).toBe('explore');
    }
  });

  it('does not duplicate events when re-normalizing or re-filtering', () => {
    const raw = [ev({ title: 'A' }), ev({ title: 'B' })];
    expect(normalizeEvents(raw)).toHaveLength(2);
    expect(normalizeEvents(raw)).toHaveLength(2);
    expect(filterEvents(normalizeEvents(raw), 'all', '')).toHaveLength(2);
  });
});
