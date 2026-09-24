import { describe, it, expect, beforeEach } from 'vitest';
import {
  EVENT_CATEGORY_MAP,
  LOG_CATEGORIES,
  PLACEHOLDER_DETAIL,
  PLACEHOLDER_TITLE,
  categoryLabel,
  defaultLogFilter,
  filterEvents,
  kindLabel,
  normalizeEvent,
  normalizeEvents,
  relativeTime,
  sortViews,
  statusText,
  EventView
} from '../src/game/event-log';
import { GameEvent } from '../src/game/events';
import { showLog, resetLogFilter } from '../src/ui/panels';
import { GameSave, SAVE_KEY, emptyStats, loadGame, saveGame } from '../src/game/save';
// @ts-expect-error vite raw import of source text
import engineSrc from '../src/game/engine.ts?raw';

function ev(partial: Partial<GameEvent> & { kind: GameEvent['kind'] }): GameEvent {
  return { title: '标题', time: 0, detail: '详情', ...partial };
}

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    }
  } as Storage;
}

function baseSave(events: unknown[]): GameSave {
  return {
    version: 1,
    savedAt: 1,
    playTime: 120,
    seed: 's',
    body: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
    inventory: {},
    survival: {},
    environment: {},
    world: {},
    quests: {},
    events,
    stats: emptyStats(),
    route: 'fortify'
  };
}

describe('event log view model', () => {
  it('normalizes an empty log to zero views and zero filter hits', () => {
    const views = normalizeEvents([]);
    expect(views).toEqual([]);
    expect(filterEvents(views, defaultLogFilter())).toEqual([]);
  });

  it('keeps a single event fully intact through normalization', () => {
    const [v] = normalizeEvents([ev({ kind: 'raid', title: '据点遭袭', time: 42, detail: '夜行生物来袭', resolved: false })]);
    expect(v).toMatchObject({ kind: 'raid', title: '据点遭袭', time: 42, detail: '夜行生物来袭', status: 'unresolved', category: 'combat' });
  });

  it('sorts by time and keeps original array order for equal times', () => {
    const views = normalizeEvents([
      ev({ kind: 'raid', title: 'A', time: 10 }),
      ev({ kind: 'caravan', title: 'B', time: 5 }),
      ev({ kind: 'leak', title: 'C', time: 10 }),
      ev({ kind: 'collapse', title: 'D', time: 10 })
    ]);
    expect(sortViews(views).map((v) => v.title)).toEqual(['B', 'A', 'C', 'D']);
  });

  it('maps weather/raid/caravan/mechanism kinds to their categories', () => {
    expect(EVENT_CATEGORY_MAP.weather_shift).toBe('weather');
    expect(EVENT_CATEGORY_MAP.raid).toBe('combat');
    expect(EVENT_CATEGORY_MAP.caravan).toBe('explore');
    expect(EVENT_CATEGORY_MAP.mechanism).toBe('explore');
    expect(EVENT_CATEGORY_MAP.leak).toBe('system');
  });

  it('groups unknown kinds into system without dropping the record', () => {
    const [v] = normalizeEvents([{ kind: 'meteor_shower', title: '流星雨', time: 1, detail: '未知事件' }]);
    expect(v.category).toBe('system');
    expect(kindLabel(v)).toBe('未知事件');
    expect(categoryLabel(v)).toBe('系统');
  });

  it('matches keywords case-insensitively across title and detail', () => {
    const views = normalizeEvents([
      ev({ kind: 'raid', title: 'Raid Alpha', detail: 'nothing' }),
      ev({ kind: 'caravan', title: '商旅出现', detail: 'Trader CACHE nearby' })
    ]);
    const byTitle = filterEvents(views, { category: 'all', query: 'raid' });
    const byDetail = filterEvents(views, { category: 'all', query: 'CACHE' });
    expect(byTitle.map((v) => v.title)).toEqual(['Raid Alpha']);
    expect(byDetail.map((v) => v.title)).toEqual(['商旅出现']);
  });

  it('treats blank or whitespace-only queries as no search', () => {
    const views = normalizeEvents([ev({ kind: 'raid' }), ev({ kind: 'leak' })]);
    expect(filterEvents(views, { category: 'all', query: '   ' })).toHaveLength(2);
    expect(filterEvents(views, { category: 'all', query: '' })).toHaveLength(2);
  });

  it('shows safe placeholders for legacy events missing fields', () => {
    const v = normalizeEvent({ kind: 'weather_shift', time: 3 }, 0);
    expect(v.title).toBe(PLACEHOLDER_TITLE);
    expect(v.detail).toBe(PLACEHOLDER_DETAIL);
    expect(statusText(v)).toBe('已记录');
  });

  it('survives null entries and non-array input', () => {
    const views = normalizeEvents([null, undefined, 42]);
    expect(views).toHaveLength(3);
    expect(views[0].title).toBe(PLACEHOLDER_TITLE);
    expect(views[0].category).toBe('system');
    expect(normalizeEvents(null)).toEqual([]);
    expect(normalizeEvents(undefined)).toEqual([]);
  });

  it('derives status text from resolved flag and explicit status field', () => {
    expect(statusText(normalizeEvent({ resolved: true }, 0))).toBe('已解决');
    expect(statusText(normalizeEvent({ resolved: false }, 0))).toBe('未解决');
    expect(statusText(normalizeEvent({ status: 'resolved' }, 0))).toBe('已解决');
    expect(statusText(normalizeEvent({ status: 'unresolved' }, 0))).toBe('未解决');
    expect(statusText(normalizeEvent({}, 0))).toBe('已记录');
  });

  it('filters without mutating the source events array or views', () => {
    const raw = [ev({ kind: 'raid', title: 'B', time: 20 }), ev({ kind: 'weather_shift', title: 'A', time: 5 })];
    const views = normalizeEvents(raw);
    const before = views.map((v) => v.title);
    const result = filterEvents(views, { category: 'weather', query: '' });
    expect(result.map((v) => v.title)).toEqual(['A']);
    expect(views.map((v) => v.title)).toEqual(before);
    expect(raw.map((e) => e.title)).toEqual(['B', 'A']);
    expect(raw).toHaveLength(2);
  });

  it('formats relative time and tolerates non-finite input', () => {
    expect(relativeTime(100, 105)).toBe('刚刚');
    expect(relativeTime(100, 130)).toBe('30 秒前');
    expect(relativeTime(0, 600)).toBe('10 分钟前');
    expect(relativeTime(0, 5400)).toBe('1 小时 30 分钟前');
    expect(relativeTime(NaN, 5)).toBe('时间未知');
  });

  it('exposes the five filter categories in a single definition', () => {
    expect(LOG_CATEGORIES.map((c) => c.id)).toEqual(['all', 'weather', 'combat', 'explore', 'system']);
  });
});

describe('event log panel (page level)', () => {
  let root: HTMLElement;
  const events: GameEvent[] = [
    ev({ kind: 'weather_shift', title: '天气突变', time: 10, detail: '天气骤变为暴雨。' }),
    ev({ kind: 'raid', title: '据点遭袭', time: 20, detail: '夜行生物聚集。', resolved: false }),
    ev({ kind: 'caravan', title: '商旅出现', time: 30, detail: '游商藏了补给箱。', resolved: true })
  ];

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    resetLogFilter();
  });

  function open(list: GameEvent[] = events, now = 60) {
    showLog(root, list, () => undefined, now);
    return root.querySelector('#log-panel') as HTMLElement;
  }

  it('renders the full chain from events array to filtered J panel', () => {
    const panel = open();
    expect(panel.querySelectorAll('#log-list .ev')).toHaveLength(3);
    expect(panel.querySelector('#log-summary')?.textContent).toContain('共 3 条');
    const tabs = panel.querySelectorAll('#log-tabs button');
    expect(tabs).toHaveLength(5);
    (tabs[1] as HTMLButtonElement).click(); // 天气
    const rows = panel.querySelectorAll('#log-list .ev');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.ev-title')?.textContent).toBe('天气突变');
    expect(rows[0].querySelector('.ev-status')?.textContent).toBe('已记录');
    expect(panel.querySelector('#log-summary')?.textContent).toContain('命中 1 条');
  });

  it('searches by keyword and restores the category when cleared', () => {
    const panel = open();
    const tabs = panel.querySelectorAll('#log-tabs button');
    (tabs[2] as HTMLButtonElement).click(); // 战斗
    expect(panel.querySelectorAll('#log-list .ev')).toHaveLength(1);
    const search = panel.querySelector('#log-search') as HTMLInputElement;
    search.value = '不存在的关键词';
    search.dispatchEvent(new Event('input'));
    expect(panel.querySelectorAll('#log-list .ev')).toHaveLength(0);
    expect(panel.querySelector('#log-list')?.textContent).toContain('没有匹配');
    search.value = '';
    search.dispatchEvent(new Event('input'));
    expect(panel.querySelectorAll('#log-list .ev')).toHaveLength(1);
    expect(panel.querySelector('#log-list .ev-title')?.textContent).toBe('据点遭袭');
  });

  it('keeps the filter across close/reopen without duplicating records', () => {
    let panel = open();
    (panel.querySelectorAll('#log-tabs button')[3] as HTMLButtonElement).click(); // 探索
    expect(panel.querySelectorAll('#log-list .ev')).toHaveLength(1);
    panel.remove();
    panel = open();
    expect(panel.querySelectorAll('#log-list .ev')).toHaveLength(1);
    expect(panel.querySelector('#log-list .ev-title')?.textContent).toBe('商旅出现');
    expect(panel.querySelector('#log-list .ev-status')?.textContent).toBe('已解决');
    expect(events).toHaveLength(3);
  });

  it('shows empty state and zero counts for an empty log', () => {
    const panel = open([]);
    expect(panel.querySelectorAll('#log-list .ev')).toHaveLength(0);
    expect(panel.querySelector('#log-summary')?.textContent).toContain('共 0 条');
    expect(panel.querySelector('#log-list')?.textContent).toContain('尚未发生事件');
  });

  it('renders null entries and unknown kinds with readable placeholders', () => {
    const messy = [null, { kind: 'alien_event', time: 1 }] as unknown as GameEvent[];
    const panel = open(messy);
    const rows = panel.querySelectorAll('#log-list .ev');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.ev-title')?.textContent).toBe(PLACEHOLDER_TITLE);
    expect(rows[1].querySelector('.ev-kind')?.textContent).toBe('未知事件');
    const tabs = panel.querySelectorAll('#log-tabs button');
    (tabs[4] as HTMLButtonElement).click(); // 系统
    expect(panel.querySelectorAll('#log-list .ev')).toHaveLength(2);
  });

  it('does not mutate the events array when filtering in the UI', () => {
    const before = events.map((e) => ({ ...e }));
    const panel = open();
    (panel.querySelectorAll('#log-tabs button')[1] as HTMLButtonElement).click();
    const search = panel.querySelector('#log-search') as HTMLInputElement;
    search.value = '暴雨';
    search.dispatchEvent(new Event('input'));
    expect(events.map((e) => ({ ...e }))).toEqual(before);
  });
});

describe('event log persistence', () => {
  it('round-trips new status fields through saveGame/loadGame', () => {
    const storage = makeStorage();
    const events = [
      ev({ kind: 'raid', title: '据点遭袭', time: 5, detail: '来袭', status: 'unresolved' }),
      ev({ kind: 'caravan', title: '商旅出现', time: 9, detail: '补给', status: 'resolved' })
    ];
    expect(saveGame(baseSave(events), storage).ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const views = normalizeEvents(loaded.data.events);
    expect(views.map((v) => v.status)).toEqual(['unresolved', 'resolved']);
    expect(sortViews(views).map((v) => v.time)).toEqual([5, 9]);
  });

  it('loads legacy v1 saves without status or events fields safely', () => {
    const storage = makeStorage();
    const legacy = baseSave([{ kind: 'weather_shift', title: '天气突变', time: 3, detail: '暴雨' }]);
    delete (legacy as unknown as Record<string, unknown>).events;
    storage.setItem(SAVE_KEY, JSON.stringify(legacy));
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const views = normalizeEvents(loaded.data.events ?? []);
    expect(views).toEqual([]);
    storage.setItem(SAVE_KEY, JSON.stringify(baseSave([{ kind: 'raid', time: 7 }])));
    const loaded2 = loadGame(storage);
    expect(loaded2.ok).toBe(true);
    if (!loaded2.ok) return;
    const [v] = normalizeEvents(loaded2.data.events);
    expect(statusText(v)).toBe('已记录');
    expect(v.title).toBe(PLACEHOLDER_TITLE);
    expect(v.detail).toBe(PLACEHOLDER_DETAIL);
  });

  it('keeps unknown event kinds from breaking save loading or filtering', () => {
    const storage = makeStorage();
    expect(saveGame(baseSave([{ kind: 'future_kind', title: '新事件', time: 1, detail: 'x' }]), storage).ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const views = normalizeEvents(loaded.data.events);
    expect(views[0].category).toBe('system');
    expect(filterEvents(views, { category: 'system', query: '' })).toHaveLength(1);
    expect(filterEvents(views, { category: 'weather', query: '' })).toHaveLength(0);
  });

  it('restores identical log content and filter results after a refresh cycle', () => {
    const storage = makeStorage();
    const events = [
      ev({ kind: 'weather_shift', title: '天气突变', time: 10, detail: '暴雨' }),
      ev({ kind: 'raid', title: '据点遭袭', time: 10, detail: '来袭', resolved: false }),
      ev({ kind: 'mechanism', title: '遗迹机关启动', time: 30, detail: '机关柱' })
    ];
    saveGame(baseSave(events), storage);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const views = normalizeEvents(loaded.data.events);
    const combat = filterEvents(views, { category: 'combat', query: '' });
    expect(combat.map((v) => v.title)).toEqual(['据点遭袭']);
    expect(filterEvents(views, { category: 'all', query: '' }).map((v) => v.title)).toEqual([
      '天气突变',
      '据点遭袭',
      '遗迹机关启动'
    ]);
  });
});

describe('engine log lifecycle', () => {
  it('startNew resets the log to an empty array', () => {
    const src = engineSrc as string;
    const start = src.indexOf('startNew(seedInput');
    const startNewBody = src.slice(start, src.indexOf('continueSave()', start));
    expect(startNewBody).toContain('this.events = [];');
  });
});
