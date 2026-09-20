import { Inventory, ItemStack } from './core/inventory';
import { getItem } from './core/items';
import { RECIPES, Recipe, canCraft } from './core/recipes';
import { QUESTS, QuestState } from './core/quests';
import { GameEvent } from './core/events';
import { clockLabel, EnvState, WEATHER_INFO } from './core/environment';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}
function colorHex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export class UI {
  selectedInv = -1;
  onCraft?: (r: Recipe) => void;
  onChestSlot?: (which: 'chest' | 'inv', index: number) => void;

  show(id: string): void { $(id).classList.remove('hidden'); }
  hide(id: string): void { $(id).classList.add('hidden'); }
  visible(id: string): boolean { return !$(id).classList.contains('hidden'); }

  toast(msg: string, kind: '' | 'warn' | 'good' | 'quest' = '', duration = 3200): void {
    const layer = $('toast-layer');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    layer.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .5s'; }, duration - 500);
    setTimeout(() => el.remove(), duration);
  }

  setBars(p: { hp: number; stamina: number; food: number; temperature: number; safety: number }): void {
    $('bar-hp').style.width = p.hp + '%';
    $('bar-st').style.width = p.stamina + '%';
    $('bar-food').style.width = p.food + '%';
    const tempNorm = Math.max(0, Math.min(100, (p.temperature + 10) / 55 * 100));
    $('bar-temp').style.width = tempNorm + '%';
    $('bar-safe').style.width = p.safety + '%';
  }

  setEnv(env: EnvState, biome: string): void {
    $('clock').textContent = clockLabel(env);
    $('weather-name').textContent = WEATHER_INFO[env.weather].name;
    $('biome-name').textContent = biome;
  }

  setObjective(stage: number): void {
    $('objective-text').textContent = QUESTS[Math.min(stage, QUESTS.length - 1)].text;
  }

  setBreakProgress(p: number | null): void {
    const el = $('break-progress');
    if (p === null) { el.classList.add('hidden'); }
    else { el.classList.remove('hidden'); $('break-fill').style.width = Math.round(p * 100) + '%'; }
  }

  renderHotbar(inv: Inventory, active: number): void {
    const bar = $('hotbar');
    bar.innerHTML = '';
    for (let i = 0; i < inv.hotbarSize; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === active ? ' active' : '');
      const stack: ItemStack | null = inv.hotbarSlot(i);
      slot.innerHTML = `<span class="key">${i + 1}</span>`;
      if (stack) {
        const def = getItem(stack.id)!;
        const sw = document.createElement('div');
        sw.className = 'swatch';
        sw.style.background = colorHex(def.color);
        slot.appendChild(sw);
        if (stack.count > 1) {
          const c = document.createElement('span');
          c.className = 'count';
          c.textContent = String(stack.count);
          slot.appendChild(c);
        }
        if (stack.durability !== undefined && def.durability) {
          const d = document.createElement('div');
          d.className = 'dur';
          d.innerHTML = `<i style="width:${Math.max(0, stack.durability / def.durability * 100)}%"></i>`;
          slot.appendChild(d);
        }
      }
      slot.addEventListener('click', () => { this.selectHotbar?.(i); });
      bar.appendChild(slot);
    }
  }
  selectHotbar?: (i: number) => void;

  setHeldName(name: string): void { $('held-name').textContent = name; }

  renderInventory(inv: Inventory, nearWorkbench: boolean, questStage: number): void {
    $('inv-count').textContent = `${inv.usedSlots()}/${inv.size}`;
    const grid = $('inv-grid');
    grid.innerHTML = '';
    for (let i = 0; i < inv.size; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot' + (i === this.selectedInv ? ' selected' : '');
      const stack = inv.slots[i];
      if (stack) {
        const def = getItem(stack.id)!;
        slot.innerHTML = `<div class="swatch" style="background:${colorHex(def.color)}"></div>`;
        if (stack.count > 1) slot.innerHTML += `<span class="count">${stack.count}</span>`;
        if (stack.durability !== undefined && def.durability) slot.innerHTML += `<div class="dur"><i style="width:${Math.max(0, stack.durability / def.durability * 100)}%"></i></div>`;
      }
      slot.addEventListener('click', () => {
        this.selectedInv = i;
        this.renderInventory(inv, nearWorkbench, questStage);
      });
      grid.appendChild(slot);
    }
    const sel = this.selectedInv >= 0 ? inv.slots[this.selectedInv] : null;
    if (sel) {
      const d = getItem(sel.id)!;
      $('item-detail').textContent = `${d.name}${sel.durability !== undefined ? '（耐久 ' + Math.max(0, Math.round(sel.durability)) + '）' : ''}：${d.desc}`;
    } else {
      $('item-detail').textContent = '点击选择物品后可拆分或丢弃。';
    }
    // 配方
    $('craft-station').textContent = nearWorkbench ? '（已连接工作台）' : '（需要靠近工作台）';
    const list = $('recipe-list');
    list.innerHTML = '';
    for (const r of RECIPES) {
      const out = getItem(r.output)!;
      const status = canCraft(r, inv, nearWorkbench, questStage);
      const row = document.createElement('div');
      row.className = 'recipe';
      const costText = Object.entries(r.cost).map(([id, n]) => {
        const have = inv.countOf(id);
        const ok = have >= n;
        return `<span style="color:${ok ? '#b0d8a0' : '#e09080'}">${getItem(id)?.name} ${have}/${n}</span>`;
      }).join('，');
      row.innerHTML = `
        <div class="swatch" style="background:${colorHex(out.color)}"></div>
        <div class="rinfo"><b>${r.name}</b><small>${r.desc}</small><small>${costText}</small></div>`;
      const btn = document.createElement('button');
      btn.textContent = '制作';
      btn.disabled = status !== 'ok';
      btn.title = status === 'no_materials' ? '材料不足' : status === 'no_station' ? '需要靠近工作台' : status === 'locked' ? '需要推进任务解锁' : '制作';
      btn.addEventListener('click', () => this.onCraft?.(r));
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  renderJournal(quest: QuestState, events: GameEvent[]): void {
    const ql = $('quest-list');
    ql.innerHTML = '';
    for (const q of QUESTS) {
      const div = document.createElement('div');
      div.className = 'quest-item ' + (q.id < quest.stage ? 'done' : q.id === quest.stage ? 'active' : '');
      div.textContent = q.text;
      if (q.id === quest.stage) div.textContent += '  — ' + q.hint;
      ql.appendChild(div);
    }
    const el = $('event-log');
    el.innerHTML = '';
    const recent = events.slice(-30).reverse();
    for (const ev of recent) {
      const d = document.createElement('div');
      d.className = 'ev';
      const mins = Math.floor(ev.time / 60);
      d.textContent = `[${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m] ${ev.title}：${ev.detail}`;
      el.appendChild(d);
    }
  }

  renderChest(chestSlots: ({ id: string; count: number; durability?: number } | null)[], inv: Inventory): void {
    const fill = (elId: string, slots: any[], which: 'chest' | 'inv') => {
      const grid = $(elId);
      grid.innerHTML = '';
      slots.forEach((stack, i) => {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        if (stack) {
          const d = getItem(stack.id)!;
          slot.innerHTML = `<div class="swatch" style="background:${colorHex(d.color)}"></div>`;
          if (stack.count > 1) slot.innerHTML += `<span class="count">${stack.count}</span>`;
        }
        slot.addEventListener('click', () => this.onChestSlot?.(which, i));
        grid.appendChild(slot);
      });
    };
    fill('chest-grid', chestSlots, 'chest');
    fill('chest-inv-grid', inv.slots, 'inv');
  }

  flashHurt(): void {
    const app = $('app');
    app.classList.remove('flash-hurt');
    void app.offsetWidth;
    app.classList.add('flash-hurt');
  }

  showDeath(cause: string, lossText: string): void {
    $('death-cause').textContent = '死因：' + cause;
    $('death-loss').textContent = lossText;
    this.show('death-screen');
  }
}
