// DOM UI: menus, HUD, inventory drag/drop, crafting, logs, death/ending.

import './ui-dom';
import { Inventory, ItemStack, HOTBAR_SIZE } from '../game/inventory';
import { ITEMS, itemDef } from '../game/items';
import { RECIPES } from '../game/recipes';
import { QUESTS } from '../game/quests';
import { GameEvent } from '../game/events';
import { GameStats, SlotId, SlotInfo } from '../game/save';

export function hexColor(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export interface HudRefs {
  root: HTMLElement;
  stats: Record<string, { bar: HTMLElement; label: HTMLElement }>;
  topInfo: HTMLElement;
  quest: HTMLElement;
  hotbar: HTMLElement[];
  miningBar: HTMLElement;
  eventBanner: HTMLElement;
  damageVignette: HTMLElement;
  coldVignette: HTMLElement;
}

export function buildHud(root: HTMLElement): HudRefs {
  root.innerHTML = `
    <div id="crosshair"></div>
    <div id="damage-vignette"></div>
    <div id="cold-vignette"></div>
    <div id="stats">
      <div class="stat" id="stat-hp"><label>生命</label><div class="bar"><div class="hp"></div></div></div>
      <div class="stat" id="stat-st"><label>体力</label><div class="bar"><div class="st"></div></div></div>
      <div class="stat" id="stat-hg"><label>饱食</label><div class="bar"><div class="hg"></div></div></div>
      <div class="stat" id="stat-tp"><label>体温</label><div class="bar"><div class="tp"></div></div></div>
      <div class="stat" id="stat-lt"><label>安全光</label><div class="bar"><div class="lt"></div></div></div>
    </div>
    <div id="topinfo"></div>
    <div id="quest-hud"></div>
    <div id="event-banner" style="display:none"></div>
    <div id="mining-bar"><div></div></div>
    <div id="hotbar"></div>
  `;
  const mk = (id: string, cls: string) => ({
    bar: root.querySelector(`#${id} .${cls}`) as HTMLElement,
    label: root.querySelector(`#${id} label`) as HTMLElement
  });
  const hotbarEl = root.querySelector('#hotbar') as HTMLElement;
  const slots: HTMLElement[] = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const s = el(`<div class="hslot"><span class="num">${i + 1}</span></div>`);
    hotbarEl.appendChild(s);
    slots.push(s);
  }
  return {
    root,
    stats: {
      hp: mk('stat-hp', 'hp'),
      st: mk('stat-st', 'st'),
      hg: mk('stat-hg', 'hg'),
      tp: mk('stat-tp', 'tp'),
      lt: mk('stat-lt', 'lt')
    },
    topInfo: root.querySelector('#topinfo') as HTMLElement,
    quest: root.querySelector('#quest-hud') as HTMLElement,
    hotbar: slots,
    miningBar: root.querySelector('#mining-bar > div') as HTMLElement,
    eventBanner: root.querySelector('#event-banner') as HTMLElement,
    damageVignette: root.querySelector('#damage-vignette') as HTMLElement,
    coldVignette: root.querySelector('#cold-vignette') as HTMLElement
  };
}

export function stackHtml(stack: ItemStack | null): string {
  if (!stack) return '';
  const d = itemDef(stack.id);
  let dur = '';
  if (stack.durability !== undefined && d.durability) {
    const pct = Math.max(0, (stack.durability / d.durability) * 100);
    dur = `<div class="dur"><div style="width:${pct}%"></div></div>`;
  }
  const count = stack.count > 1 ? `<span class="cnt">${stack.count}</span>` : '';
  return `<div class="item-icon" style="background:${hexColor(d.color)}"></div>${count}${dur}`;
}

export function tooltipHtml(stack: ItemStack): string {
  const d = itemDef(stack.id);
  const lines = [`<b>${d.name}</b>`, d.description];
  if (d.kind === 'tool' && stack.durability !== undefined && d.durability) {
    lines.push(`耐久 ${stack.durability}/${d.durability}`);
    if (d.power) lines.push(`采掘力 ${d.power}`);
    if (d.damage) lines.push(`伤害 ${d.damage}`);
  }
  if (d.kind === 'food') {
    lines.push(`饱食 +${d.hunger ?? 0}${d.warmth ? '，温暖 +' + d.warmth : ''}`);
  }
  if (d.kind === 'armor' && d.defense) lines.push(`防护 ${d.defense}`);
  lines.push(`数量 ${stack.count}`);
  return `<div class="item-tip">${lines.join('<br>')}</div>`;
}

export function renderHotbar(refs: HudRefs, inv: Inventory) {
  refs.hotbar.forEach((slotEl, i) => {
    slotEl.classList.toggle('active', i === inv.hotbarIndex);
    const stack = inv.slots[i];
    slotEl.innerHTML = `<span class="num">${i + 1}</span>${stackHtml(stack)}`;
    slotEl.title = stack ? itemDef(stack.id).name : '';
  });
}

export function renderStats(
  refs: HudRefs,
  s: {
    health: number;
    maxHealth: number;
    stamina: number;
    maxStamina: number;
    hunger: number;
    maxHunger: number;
    temperature: number;
    lightSafety: number;
  }
) {
  const set = (k: string, v: number, max: number, warnLow?: number, warnHigh?: number) => {
    refs.stats[k].bar.style.width = `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    const wrap = refs.stats[k].bar.closest('.stat') as HTMLElement;
    wrap.classList.toggle('warn', (warnLow !== undefined && v < warnLow) || (warnHigh !== undefined && v > warnHigh));
  };
  set('hp', s.health, s.maxHealth, 30);
  set('st', s.stamina, s.maxStamina, 15);
  set('hg', s.hunger, s.maxHunger, 20);
  // temperature shown on 20..50 scale
  refs.stats.tp.bar.style.width = `${Math.max(0, Math.min(100, ((s.temperature - 20) / 30) * 100))}%`;
  refs.stats.tp.label.closest('.stat')?.classList.toggle('warn', s.temperature < 30 || s.temperature > 43);
  refs.stats.lt.bar.style.width = `${s.lightSafety}%`;
  refs.stats.lt.label.closest('.stat')?.classList.toggle('warn', s.lightSafety < 25);
  refs.coldVignette.style.boxShadow =
    s.temperature < 30
      ? `inset 0 0 140px rgba(80,150,220,${Math.min(0.6, (30 - s.temperature) / 20)})`
      : 'inset 0 0 140px rgba(80,150,220,0)';
}

export function renderTopInfo(
  refs: HudRefs,
  data: { day: number; timeLabel: string; weather: string; pos: string; site: string }
) {
  refs.topInfo.innerHTML = `第 ${data.day} 天 · ${data.timeLabel}<br>${data.weather}<br>${data.pos}<br>${data.site}`;
}

export function renderQuest(refs: HudRefs, stage: number, route: string) {
  const q = QUESTS[Math.min(stage, QUESTS.length - 1)];
  refs.quest.innerHTML = `<h3>任务 ${stage}/9 · ${q.title}</h3>${q.hint}<br><span class="tag">路线：${
    route === 'fortify' ? '固守工事' : '拾荒奇兵'
  }</span>`;
}

export function showEventBanner(refs: HudRefs, ev: GameEvent | null) {
  if (!ev) {
    refs.eventBanner.style.display = 'none';
    return;
  }
  refs.eventBanner.style.display = 'block';
  refs.eventBanner.innerHTML = `<h4>${ev.title}</h4>${ev.detail}`;
}

export function flashDamage(refs: HudRefs, intensity = 0.5) {
  refs.damageVignette.style.boxShadow = `inset 0 0 120px rgba(200,30,30,${intensity})`;
  setTimeout(() => {
    refs.damageVignette.style.boxShadow = 'inset 0 0 120px rgba(200,30,30,0)';
  }, 180);
}

let toastTimer: number | undefined;
export function toast(root: HTMLElement, text: string, kind: '' | 'warn' | 'bad' = '') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el(`<div class="toast ${kind}">${text}</div>`);
  root.appendChild(t);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), 2600);
}

export function timeLabel(time: number): string {
  const h = Math.floor((time / 240) * 24 + 6) % 24;
  const mm = Math.floor((((time / 240) * 24 + 6) % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}分${String(s).padStart(2, '0')}秒`;
}

export const SLOT_LABELS: Record<SlotId, string> = {
  slot1: '槽位 1',
  slot2: '槽位 2',
  slot3: '槽位 3',
  auto: '自动保存'
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function formatSavedAt(savedAt: number): string {
  if (!Number.isFinite(savedAt) || savedAt <= 0) return '时间未知';
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return '时间未知';
  return d.toLocaleString();
}

// One-line safe summary for a slot; never throws on malformed metadata.
export function slotSummaryHtml(info: SlotInfo): string {
  if (info.state === 'corrupt') {
    return `<span class="slot-corrupt">存档损坏，无法读取${info.error ? '：' + escapeHtml(info.error) : ''}</span>`;
  }
  if (info.state === 'empty' || !info.summary) {
    return '<span class="slot-empty">空闲 — 可在暂停菜单保存到这里</span>';
  }
  const s = info.summary;
  const route = s.route === 'fortify' ? '固守工事' : '拾荒奇兵';
  const day = Number.isFinite(s.day) && s.day >= 1 ? Math.floor(s.day) : 1;
  return (
    `种子 ${escapeHtml(s.seed || '未知种子')} · ${route} · 第 ${day} 天` +
    ` · 游玩 ${formatTime(Math.max(0, s.playTime || 0))} · 保存于 ${formatSavedAt(s.savedAt)}`
  );
}

export function endingStatsHtml(stats: GameStats, playTime: number): string {
  return `<div class="ending-stats">
    <div>生存时间：${formatTime(playTime)}</div>
    <div>建造方块：${stats.buildingsBuilt}</div>
    <div>采集资源：${stats.resourcesGathered}</div>
    <div>挖掘方块：${stats.blocksMined}</div>
    <div>击败敌人：${stats.enemiesKilled}</div>
    <div>制作次数：${stats.crafts}</div>
  </div>`;
}

export { ITEMS, RECIPES };
