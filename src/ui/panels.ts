// In-game overlay panels: inventory drag&split, crafting, event log, storage, pause, death, ending.

import { el, stackHtml, tooltipHtml } from './ui';
import { Inventory, ItemStack } from '../game/inventory';
import { itemDef } from '../game/items';
import { RECIPES } from '../game/recipes';
import { GameEvent } from '../game/events';
import { endingStatsHtml } from './ui';
import { GameStats } from '../game/save';
import {
  LogFilter,
  LOG_CATEGORIES,
  categoryLabel,
  defaultLogFilter,
  filterEvents,
  kindLabel,
  normalizeEvents,
  relativeTime,
  statusText
} from '../game/event-log';

export function showPause(
  root: HTMLElement,
  cb: { resume: () => void; restart: () => void; menu: () => void; save: () => void; settings: () => void }
) {
  const existed = root.querySelector('#pause-panel');
  if (existed) return;
  const panel = el(`
    <div class="screen" id="pause-panel">
      <h2>已暂停</h2>
      <div class="menu-row"><button id="p-resume">继续游戏</button><button id="p-save">保存进度</button></div>
      <div class="menu-row"><button id="p-settings">设置</button><button id="p-restart">重新开始</button><button id="p-menu">返回主菜单</button></div>
      <div class="controls-help">进度会在关闭面板时自动保存。鼠标已解除锁定。</div>
    </div>
  `);
  root.appendChild(panel);
  panel.querySelector('#p-resume')?.addEventListener('click', cb.resume);
  panel.querySelector('#p-save')?.addEventListener('click', cb.save);
  panel.querySelector('#p-restart')?.addEventListener('click', cb.restart);
  panel.querySelector('#p-menu')?.addEventListener('click', cb.menu);
  panel.querySelector('#p-settings')?.addEventListener('click', cb.settings);
}

export function hidePause(root: HTMLElement) {
  root.querySelector('#pause-panel')?.remove();
}

export function showDeath(
  root: HTMLElement,
  cause: string,
  dropped: ItemStack[],
  cb: { respawn: () => void; menu: () => void }
) {
  const panel = el(`
    <div class="screen">
      <h2>你倒在了荒原上</h2>
      <div class="error-box">死亡原因：${cause}</div>
      <div style="max-width:520px">
        <h3 style="color:#ffd98a;margin-bottom:6px">遗落物品</h3>
        <div class="death-list">${
          dropped.length
            ? dropped.map((d) => `${itemDef(d.id).name} ×${d.count}`).join('<br>')
            : '没有物品掉落（已保留快捷栏）。'
        }</div>
      </div>
      <div class="menu-row"><button id="d-respawn">就地重生（返回据点）</button><button id="d-menu">返回主菜单</button></div>
    </div>
  `);
  root.appendChild(panel);
  panel.querySelector('#d-respawn')?.addEventListener('click', cb.respawn);
  panel.querySelector('#d-menu')?.addEventListener('click', cb.menu);
}

export function showEnding(
  root: HTMLElement,
  ending: { title: string; text: string },
  stats: GameStats,
  playTime: number,
  cb: { menu: () => void; continuePlay: () => void }
) {
  const panel = el(`
    <div class="screen">
      <h1 style="font-size:34px">${ending.title}</h1>
      <div class="sub" style="max-width:560px;text-align:center">${ending.text}</div>
      ${endingStatsHtml(stats, playTime)}
      <div class="menu-row"><button id="e-continue">继续自由游玩</button><button id="e-menu">返回主菜单</button></div>
    </div>
  `);
  root.appendChild(panel);
  panel.querySelector('#e-menu')?.addEventListener('click', cb.menu);
  panel.querySelector('#e-continue')?.addEventListener('click', cb.continuePlay);
}

// Panel-session filter state: kept across close/reopen within the session, but
// only ever affects the view — engine.events is never mutated here.
let logFilter: LogFilter = defaultLogFilter();

export function resetLogFilter(): void {
  logFilter = defaultLogFilter();
}

export function showLog(root: HTMLElement, events: GameEvent[], onClose: () => void, now = 0) {
  root.querySelector('#log-panel')?.remove();
  const panel = el(`
    <div class="panel-window" id="log-panel">
      <div class="panel-head"><h3>荒原事件日志</h3><button id="log-close">关闭 (J)</button></div>
      <div class="panel-tabs" id="log-tabs"></div>
      <input type="text" id="log-search" placeholder="搜索标题或详情…" autocomplete="off" />
      <div class="sub" id="log-summary"></div>
      <div class="event-log" id="log-list"></div>
    </div>
  `);
  root.appendChild(panel);
  const views = normalizeEvents(events);
  const tabs = panel.querySelector('#log-tabs') as HTMLElement;
  const search = panel.querySelector('#log-search') as HTMLInputElement;
  const summary = panel.querySelector('#log-summary') as HTMLElement;
  const list = panel.querySelector('#log-list') as HTMLElement;
  search.value = logFilter.query;

  const renderList = () => {
    const matched = filterEvents(views, logFilter);
    summary.textContent = views.length
      ? `共 ${views.length} 条事件 · 当前筛选命中 ${matched.length} 条`
      : '共 0 条事件';
    list.innerHTML = '';
    if (!views.length) {
      list.appendChild(el(`<div class="sub">荒原一片平静，尚未发生事件。</div>`));
      return;
    }
    if (!matched.length) {
      list.appendChild(el(`<div class="sub">当前筛选条件下没有匹配的事件。</div>`));
      return;
    }
    for (const view of matched) {
      const row = el(`
        <div class="ev">
          <div class="ev-head"><b class="ev-title"></b><span class="ev-time"></span></div>
          <div class="ev-detail"></div>
          <div class="ev-meta">
            <span class="tag ev-cat"></span>
            <span class="tag ev-kind"></span>
            <span class="tag ev-status"></span>
          </div>
        </div>
      `);
      (row.querySelector('.ev-title') as HTMLElement).textContent = view.title;
      (row.querySelector('.ev-time') as HTMLElement).textContent = relativeTime(view.time, now);
      (row.querySelector('.ev-detail') as HTMLElement).textContent = view.detail;
      (row.querySelector('.ev-cat') as HTMLElement).textContent = categoryLabel(view);
      (row.querySelector('.ev-kind') as HTMLElement).textContent = kindLabel(view);
      (row.querySelector('.ev-status') as HTMLElement).textContent = statusText(view);
      list.appendChild(row);
    }
  };

  const tabButtons: HTMLButtonElement[] = [];
  for (const cat of LOG_CATEGORIES) {
    const btn = el(`<button type="button" data-cat="${cat.id}">${cat.label}</button>`) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      logFilter = { ...logFilter, category: cat.id };
      tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.cat === cat.id));
      renderList();
    });
    tabButtons.push(btn);
    tabs.appendChild(btn);
  }
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.cat === logFilter.category));
  search.addEventListener('input', () => {
    logFilter = { ...logFilter, query: search.value };
    renderList();
  });
  renderList();
  panel.querySelector('#log-close')?.addEventListener('click', onClose);
}

export interface PanelActions {
  onClose: () => void;
  onUse: (slot: number) => void;
  onDrop: (slot: number) => void;
  onEquip: (slot: number) => void;
  onChange: () => void;
}

// Inventory with click-drag, right-click split, drop and equip.
export function showInventory(root: HTMLElement, inv: Inventory, actions: PanelActions) {
  root.querySelector('#inventory-panel')?.remove();
  const panel = el(`
    <div class="panel-window" id="inventory-panel">
      <div class="panel-head">
        <h3>背包（${inv.size} 格）</h3>
        <div class="menu-row">
          <button id="inv-armor">${inv.armor ? '已装备：' + itemDef(inv.armor.id).name : '未装备护具'}</button>
          <button id="inv-close">关闭 (Tab)</button>
        </div>
      </div>
      <div class="sub" style="font-size:12px;margin-bottom:8px">左键拖拽移动物品；拖到空格按右键可拆分一半；按 Q 丢弃选中格；点击食物食用、护具装备。</div>
      <div class="slot-grid" id="inv-grid"></div>
    </div>
  `);
  root.appendChild(panel);
  const grid = panel.querySelector('#inv-grid') as HTMLElement;
  const renderSlots = () => {
    grid.innerHTML = '';
    inv.slots.forEach((stack, i) => {
      const slotEl = el(`<div class="slot" data-slot="${i}">${stackHtml(stack)}</div>`);
      slotEl.addEventListener('mouseenter', (ev) => {
        if (stack) showTooltip(ev as MouseEvent, stack);
      });
      slotEl.addEventListener('mouseleave', hideTooltip);
      slotEl.addEventListener('click', () => actions.onUse(i));
      slotEl.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        actions.onDrop(i);
        refresh();
      });
      slotEl.addEventListener('dragstart', (ev) => {
        (ev as DragEvent).dataTransfer?.setData('text/slot', String(i));
      });
      slotEl.setAttribute('draggable', stack ? 'true' : 'false');
      slotEl.addEventListener('dragover', (ev) => ev.preventDefault());
      slotEl.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const from = Number((ev as DragEvent).dataTransfer?.getData('text/slot'));
        if (!Number.isNaN(from)) {
          if (ev.shiftKey) inv.split(from, i);
          else inv.moveTo(from, i);
          actions.onChange();
          refresh();
        }
      });
      grid.appendChild(slotEl);
    });
  };
  const refresh = () => {
    renderSlots();
    actions.onChange();
  };
  renderSlots();
  panel.querySelector('#inv-close')?.addEventListener('click', actions.onClose);
  panel.querySelector('#inv-armor')?.addEventListener('click', () => {
    if (inv.selected()) actions.onEquip(inv.hotbarIndex);
    refresh();
  });
}

let tipEl: HTMLElement | null = null;
function showTooltip(ev: MouseEvent, stack: ItemStack) {
  hideTooltip();
  tipEl = el(tooltipHtml(stack));
  tipEl.style.left = `${ev.clientX + 14}px`;
  tipEl.style.top = `${ev.clientY + 14}px`;
  document.body.appendChild(tipEl);
}
function hideTooltip() {
  tipEl?.remove();
  tipEl = null;
}

export function showCrafting(
  root: HTMLElement,
  inv: Inventory,
  ctx: { nearWorkbench: boolean; hasToken: boolean; questStage: number },
  cb: { craft: (recipeId: string) => string; close: () => void }
) {
  root.querySelector('#craft-panel')?.remove();
  const panel = el(`
    <div class="panel-window" id="craft-panel">
      <div class="panel-head">
        <h3>制作 ${ctx.nearWorkbench ? '<span class="tag">工作台已连接</span>' : '<span class="tag">徒手制作</span>'}</h3>
        <button id="craft-close">关闭 (C)</button>
      </div>
      <div class="recipe-list" id="recipe-list"></div>
    </div>
  `);
  root.appendChild(panel);
  const list = panel.querySelector('#recipe-list') as HTMLElement;
  const render = () => {
    list.innerHTML = '';
    for (const recipe of RECIPES) {
      const out = itemDef(recipe.output);
      let locked = '';
      let lockReason = '';
      if (recipe.requiresWorkbench && !ctx.nearWorkbench) {
        locked = 'locked';
        lockReason = '需要工作台';
      } else if (recipe.requiresToken && !ctx.hasToken) {
        locked = 'locked';
        lockReason = '需要遗迹铭牌';
      } else if (recipe.requiresQuest !== undefined && ctx.questStage < recipe.requiresQuest) {
        locked = 'locked';
        lockReason = `主线阶段 ${recipe.requiresQuest} 解锁`;
      }
      const inputsHtml = recipe.inputs
        .map((inp) => {
          const have = inv.countItem(inp.item);
          const lack = have < inp.count ? 'lack' : '';
          return `<span class="${lack}">${itemDef(inp.item).name} ${have}/${inp.count}</span>`;
        })
        .join(' · ');
      const card = el(`
        <div class="recipe ${locked}">
          <div class="rname">${out.name} ×${recipe.count}</div>
          <div class="rinput">${inputsHtml}</div>
          <div class="rmeta">${lockReason || out.description}</div>
          <button ${locked ? 'disabled' : ''}>制作</button>
        </div>
      `);
      card.querySelector('button')?.addEventListener('click', () => {
        const msg = cb.craft(recipe.id);
        render();
        if (msg) {
          const t = el(`<div class="toast ${msg.startsWith('制作成功') ? '' : 'bad'}">${msg}</div>`);
          root.appendChild(t);
          setTimeout(() => t.remove(), 2000);
        }
      });
      list.appendChild(card);
    }
  };
  render();
  panel.querySelector('#craft-close')?.addEventListener('click', cb.close);
}

export function showContainer(
  root: HTMLElement,
  title: string,
  container: (ItemStack | null)[],
  inv: Inventory,
  cb: { close: () => void; change: () => void }
) {
  root.querySelector('#container-panel')?.remove();
  const panel = el(`
    <div class="panel-window" id="container-panel">
      <div class="panel-head"><h3>${title}</h3><button id="box-close">关闭 (E)</button></div>
      <div class="slot-grid" id="box-grid" style="grid-template-columns:repeat(8,1fr);margin-bottom:12px"></div>
      <h3 style="color:#8fe8d4;margin-bottom:6px">背包</h3>
      <div class="slot-grid" id="box-inv"></div>
    </div>
  `);
  root.appendChild(panel);
  const boxGrid = panel.querySelector('#box-grid') as HTMLElement;
  const invGrid = panel.querySelector('#box-inv') as HTMLElement;
  const drawGrid = (target: HTMLElement, slots: (ItemStack | null)[], isBox: boolean) => {
    target.innerHTML = '';
    slots.forEach((stack, i) => {
      const s = el(`<div class="slot">${stackHtml(stack)}</div>`);
      s.addEventListener('click', () => {
        if (isBox) {
          if (stack && inv.canAdd(stack.id, stack.count)) {
            inv.add(stack.id, stack.count, stack.durability);
            slots[i] = null;
          }
        } else if (stack) {
          let placed = false;
          for (let j = 0; j < slots.length && !placed; j++) {
            const t2 = slots[j];
            if (!t2) {
              slots[j] = stack;
              inv.slots[i] = null;
              placed = true;
            } else if (t2.id === stack.id && itemDef(stack.id).maxStack > 1) {
              const space = itemDef(stack.id).maxStack - t2.count;
              const moved = Math.min(space, stack.count);
              t2.count += moved;
              stack.count -= moved;
              if (stack.count <= 0) inv.slots[i] = null;
              placed = true;
            }
          }
        }
        cb.change();
        renderAll();
      });
      target.appendChild(s);
    });
  };
  const renderAll = () => {
    drawGrid(boxGrid, container, true);
    drawGrid(invGrid, inv.slots, false);
  };
  renderAll();
  panel.querySelector('#box-close')?.addEventListener('click', cb.close);
}
