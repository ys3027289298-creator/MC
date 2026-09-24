// Page-level test: from the engine events array to the J panel's filtered rendering.
import { describe, it, expect, beforeEach } from 'vitest';
import { showLog, resetLogPanelState } from '../src/ui/panels';
import type { GameEvent } from '../src/game/events';

function sampleEvents(): GameEvent[] {
  return [
    { kind: 'weather_shift', title: '天气突变', time: 100, detail: '天气骤变为暴雨。' },
    { kind: 'raid', title: '据点遭袭', time: 200, detail: '夜行生物聚集。', resolved: false },
    { kind: 'caravan', title: '商旅出现', time: 300, detail: '游商把补给箱藏在附近。', resolved: true },
    { kind: 'mechanism', title: '遗迹机关启动', time: 400, detail: '解锁修理配方。' },
    { kind: 'mystery_kind' as never, title: '异象', time: 500, detail: '无法解释的现象。' }
  ];
}

function openPanel(events: GameEvent[], now = 1000) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  let closed = 0;
  showLog(root, events, () => {
    closed++;
    root.querySelector('#log-panel')?.remove();
  }, now);
  return { root, wasClosed: () => closed };
}

function titles(root: HTMLElement): string[] {
  return [...root.querySelectorAll('#log-list .ev b')].map((n) => n.textContent ?? '');
}

function tab(root: HTMLElement, filter: string): HTMLButtonElement {
  return root.querySelector(`#log-tabs button[data-filter="${filter}"]`) as HTMLButtonElement;
}

function search(root: HTMLElement, value: string) {
  const input = root.querySelector('#log-search') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetLogPanelState();
});

describe('J event log panel', () => {
  it('renders every event with category and status, and shows total counts', () => {
    const { root } = openPanel(sampleEvents());
    expect(root.querySelectorAll('#log-list .ev')).toHaveLength(5);
    expect(root.querySelector('#log-stats')?.textContent).toContain('共 5 条事件');
    expect(root.querySelector('#log-stats')?.textContent).toContain('命中 5 条');
    const text = root.querySelector('#log-list')?.textContent ?? '';
    expect(text).toContain('天气');
    expect(text).toContain('战斗');
    expect(text).toContain('探索');
    expect(text).toContain('系统');
    expect(text).toContain('未解决');
    expect(text).toContain('已解决');
    expect(text).toContain('已记录');
  });

  it('shows relative time for each entry', () => {
    const { root } = openPanel(sampleEvents(), 1000);
    const times = [...root.querySelectorAll('.ev-time')].map((n) => n.textContent);
    expect(times[0]).toBe('15 分钟前');
    expect(times[4]).toBe('8 分钟前');
  });

  it('filters by category tabs and updates hit counts', () => {
    const { root } = openPanel(sampleEvents());
    tab(root, 'weather').click();
    expect(titles(root)).toEqual(['天气突变']);
    expect(root.querySelector('#log-stats')?.textContent).toContain('命中 1 条');
    tab(root, 'combat').click();
    expect(titles(root)).toEqual(['据点遭袭']);
    tab(root, 'explore').click();
    expect(titles(root)).toEqual(['商旅出现', '遗迹机关启动']);
    tab(root, 'system').click();
    expect(titles(root)).toEqual(['异象']);
    tab(root, 'all').click();
    expect(root.querySelectorAll('#log-list .ev')).toHaveLength(5);
  });

  it('searches case-insensitively and restores the category when cleared', () => {
    const events = sampleEvents();
    events.push({ kind: 'raid', title: 'Alpha 警报', time: 600, detail: '第二次袭击。' });
    const { root } = openPanel(events);
    search(root, 'ALPHA');
    expect(titles(root)).toEqual(['Alpha 警报']);
    search(root, '补给');
    expect(titles(root)).toEqual(['商旅出现']);
    search(root, '   ');
    expect(root.querySelectorAll('#log-list .ev')).toHaveLength(6);
    tab(root, 'combat').click();
    search(root, 'alpha');
    expect(titles(root)).toEqual(['Alpha 警报']);
    search(root, '');
    expect(titles(root)).toEqual(['据点遭袭', 'Alpha 警报']);
  });

  it('shows empty states for empty log and for filters with no hits', () => {
    const empty = openPanel([]);
    expect(empty.root.querySelector('#log-list')?.textContent).toContain('尚未发生事件');
    expect(empty.root.querySelector('#log-stats')?.textContent).toContain('共 0 条事件');
    const { root } = openPanel(sampleEvents());
    search(root, '不存在的关键词');
    expect(root.querySelector('#log-list')?.textContent).toContain('没有匹配的事件');
    expect(root.querySelector('#log-stats')?.textContent).toContain('命中 0 条');
  });

  it('renders legacy events with missing fields and null entries as placeholders', () => {
    const events = [
      null,
      { kind: 'raid', time: 10 },
      { time: 20, detail: '只有详情。' }
    ] as unknown as GameEvent[];
    const { root } = openPanel(events);
    expect(root.querySelectorAll('#log-list .ev')).toHaveLength(3);
    const text = root.querySelector('#log-list')?.textContent ?? '';
    expect(text).toContain('未命名事件');
    expect(text).toContain('（没有留下详细记录）');
    expect(text).toContain('已记录');
  });

  it('keeps filter state across reopen without duplicating records', () => {
    const events = sampleEvents();
    const first = openPanel(events);
    tab(first.root, 'combat').click();
    expect(titles(first.root)).toEqual(['据点遭袭']);
    first.root.querySelector<HTMLButtonElement>('#log-close')?.click();
    expect(first.wasClosed()).toBe(1);
    const second = openPanel(events);
    expect(titles(second.root)).toEqual(['据点遭袭']);
    expect(second.root.querySelectorAll('#log-list .ev')).toHaveLength(1);
    expect(events).toHaveLength(5);
  });

  it('never mutates the engine events array while filtering or searching', () => {
    const events = sampleEvents();
    const snapshot = JSON.parse(JSON.stringify(events));
    const { root } = openPanel(events);
    tab(root, 'weather').click();
    search(root, '暴雨');
    tab(root, 'all').click();
    search(root, '');
    expect(events).toEqual(snapshot);
  });

  it('close button triggers the onClose callback', () => {
    const { root, wasClosed } = openPanel(sampleEvents());
    root.querySelector<HTMLButtonElement>('#log-close')?.click();
    expect(wasClosed()).toBe(1);
  });
});
