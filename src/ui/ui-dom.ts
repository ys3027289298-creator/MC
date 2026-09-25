// Larger overlay screens: main menu, settings, inventory panel, crafting, logs, pause, death, ending.

import { el } from './ui';
import {
  SlotInfo,
  SlotId,
  MANUAL_SLOT_IDS,
  formatPlayTime,
  formatSavedAt,
  routeLabel
} from '../game/save';

export function clearScreens(root: HTMLElement) {
  root.querySelectorAll('.screen, .panel-window').forEach((n) => n.remove());
}

export interface MenuSaveView {
  slots: SlotInfo[];
  legacy: boolean;
  currentSlot: SlotId | null;
}

export interface MenuCallbacks {
  start: (seed: string, route: 'fortify' | 'salvage') => void;
  continueGame: () => void;
  settings: () => void;
  loadSlot: (id: SlotId) => void;
  deleteSlot: (id: SlotId) => void;
  continueLegacy: () => void;
}

export const RECOMMENDED_SEED = 'LEYLINE-2049';

function slotSummaryHtml(slot: SlotInfo): string {
  if (slot.state === 'empty') return '<span class="slot-empty">空闲</span>';
  if (slot.state === 'corrupt' || !slot.summary) {
    return `<span class="slot-corrupt">数据损坏${slot.error ? `：${slot.error}` : ''}</span>`;
  }
  const s = slot.summary;
  return [
    `种子 ${s.seed}`,
    routeLabel(s.route),
    `第 ${s.day} 天`,
    `游玩 ${formatPlayTime(s.playTime)}`,
    `保存于 ${formatSavedAt(s.savedAt)}`
  ].join(' · ');
}

function slotRowHtml(slot: SlotInfo, currentSlot: SlotId | null, deletable: boolean): string {
  const current = currentSlot === slot.id ? '<span class="tag">当前</span>' : '';
  const loadBtn =
    slot.state === 'ok' ? `<button data-load-slot="${slot.id}">读取</button>` : '';
  const delBtn =
    deletable && slot.state !== 'empty' ? `<button data-delete-slot="${slot.id}">删除</button>` : '';
  return `
    <div class="slot-row ${slot.state}">
      <div class="slot-head"><b>${slot.label}</b>${current}<span class="slot-btns">${loadBtn}${delBtn}</span></div>
      <div class="slot-meta">${slotSummaryHtml(slot)}</div>
    </div>
  `;
}

export function showMainMenu(root: HTMLElement, saveView: MenuSaveView, cb: MenuCallbacks) {
  clearScreens(root);
  const anySave = saveView.slots.some((s) => s.state === 'ok') || saveView.legacy;
  const slotsHtml = saveView.slots.map((s) => slotRowHtml(s, saveView.currentSlot, true)).join('');
  const legacyHtml = saveView.legacy
    ? `<div class="slot-row legacy">
        <div class="slot-head"><b>旧版存档</b><span class="slot-btns"><button id="btn-legacy">继续旧存档</button></span></div>
        <div class="slot-meta">检测到旧版单存档（v1）。继续时会把它迁移到一个空闲的手动槽位，不会丢失。</div>
      </div>`
    : '';
  const screen = el(`
    <div class="screen">
      <h1>荒原方格</h1>
      <div class="sub">失落地脉 · Wasteland Grids</div>
      <div class="menu-row">
        <label>世界种子</label>
        <input type="text" id="seed-input" value="${RECOMMENDED_SEED}" maxlength="24" style="width:200px" />
        <button id="random-seed">随机</button>
      </div>
      <div class="menu-row">
        <label>任务路线</label>
        <select id="route-select">
          <option value="fortify">固守工事（建造防御）</option>
          <option value="salvage">拾荒奇兵（探索遗迹）</option>
        </select>
      </div>
      <div class="menu-row">
        <button id="btn-start" style="font-size:17px;padding:12px 30px">开始游戏</button>
        <button id="btn-continue" ${anySave ? '' : 'disabled'}>继续游戏</button>
        <button id="btn-settings">设置</button>
      </div>
      <div class="slot-list" id="slot-list">${slotsHtml}${legacyHtml}</div>
      <div class="controls-help">
        <b>WASD</b> 移动 · <b>鼠标</b> 视角 · <b>Shift</b> 冲刺 · <b>Ctrl</b> 蹲下 · <b>空格</b> 跳跃<br>
        <b>左键</b> 破坏方块/攻击 · <b>右键</b> 放置/使用 · <b>E</b> 开门/交互 · <b>Q</b> 丢弃 · <b>F</b> 修理<br>
        <b>1-8</b> 快捷栏 · <b>Tab</b> 背包（拖拽/拆分/装备） · <b>C</b> 制作 · <b>J</b> 日志 · <b>Esc</b> 暂停<br>
        推荐种子 <b>${RECOMMENDED_SEED}</b> 适合 10–15 分钟完整演示：先采木石做工具，再建据点、下晶洞、修能源塔。
      </div>
    </div>
  `);
  root.appendChild(screen);
  const seedInput = screen.querySelector('#seed-input') as HTMLInputElement;
  screen.querySelector('#random-seed')?.addEventListener('click', () => {
    seedInput.value = Math.random().toString(36).slice(2, 10).toUpperCase();
  });
  screen.querySelector('#btn-start')?.addEventListener('click', () => {
    const seed = seedInput.value.trim() || RECOMMENDED_SEED;
    const route = (screen.querySelector('#route-select') as HTMLSelectElement).value as 'fortify' | 'salvage';
    cb.start(seed, route);
  });
  screen.querySelector('#btn-continue')?.addEventListener('click', cb.continueGame);
  screen.querySelector('#btn-settings')?.addEventListener('click', () => cb.settings());
  screen.querySelector('#btn-legacy')?.addEventListener('click', cb.continueLegacy);
  screen.querySelectorAll('[data-load-slot]').forEach((btn) => {
    btn.addEventListener('click', () => cb.loadSlot((btn as HTMLElement).dataset.loadSlot as SlotId));
  });
  screen.querySelectorAll('[data-delete-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.deleteSlot as SlotId;
      confirmDialog(root, '删除槽位？', '该槽位的进度将被永久删除，且无法恢复。', () => cb.deleteSlot(id));
    });
  });
}

// Generic confirm dialog used for overwrite / delete confirmations.
export function confirmDialog(root: HTMLElement, title: string, message: string, onConfirm: () => void, onCancel?: () => void) {
  root.querySelector('#confirm-dialog')?.remove();
  const box = el(`
    <div class="screen" id="confirm-dialog">
      <h2>${title}</h2>
      <div class="error-box">${message}</div>
      <div class="menu-row">
        <button id="cd-yes">确认</button>
        <button id="cd-no">取消</button>
      </div>
    </div>
  `);
  root.appendChild(box);
  box.querySelector('#cd-yes')?.addEventListener('click', () => {
    box.remove();
    onConfirm();
  });
  box.querySelector('#cd-no')?.addEventListener('click', () => {
    box.remove();
    onCancel?.();
  });
}

export interface SaveSlotPickerCallbacks {
  save: (id: SlotId) => void;
  cancel: () => void;
}

// Pause-menu "save as" picker: manual slots only, overwrite asks for confirmation.
export function showSaveSlotPicker(root: HTMLElement, slots: SlotInfo[], cb: SaveSlotPickerCallbacks) {
  clearScreens(root);
  const rows = MANUAL_SLOT_IDS.map((id) => {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return '';
    return `
      <div class="slot-row ${slot.state}">
        <div class="slot-head"><b>${slot.label}</b><span class="slot-btns"><button data-pick-slot="${slot.id}">保存到这里</button></span></div>
        <div class="slot-meta">${slotSummaryHtml(slot)}</div>
      </div>
    `;
  }).join('');
  const auto = slots.find((s) => s.kind === 'auto');
  const screen = el(`
    <div class="screen" id="save-slot-picker">
      <h2>保存到槽位</h2>
      <div class="slot-list">${rows}</div>
      <div class="slot-row disabled">
        <div class="slot-head"><b>${auto?.label ?? '自动保存'}</b></div>
        <div class="slot-meta">自动槽位由系统每 30 秒写入，不能手动覆盖。${auto ? slotSummaryHtml(auto) : ''}</div>
      </div>
      <div class="menu-row" style="margin-top:14px"><button id="picker-cancel">返回</button></div>
    </div>
  `);
  root.appendChild(screen);
  screen.querySelectorAll('[data-pick-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.pickSlot as SlotId;
      const slot = slots.find((s) => s.id === id);
      if (slot && slot.state === 'ok') {
        confirmDialog(
          root,
          '覆盖已有存档？',
          `${slot.label}已有进度（${slotSummaryHtml(slot)}），覆盖后无法恢复。`,
          () => cb.save(id),
          () => showSaveSlotPicker(root, slots, cb)
        );
      } else {
        cb.save(id);
      }
    });
  });
  screen.querySelector('#picker-cancel')?.addEventListener('click', cb.cancel);
}

export interface Settings {
  renderDistance: number;
  shadows: boolean;
  keepItemsOnDeath: boolean;
  mouseSensitivity: number;
}

export function showSettings(
  root: HTMLElement,
  current: Settings,
  onSave: (s: Settings) => void,
  onBack: () => void
) {
  clearScreens(root);
  const screen = el(`
    <div class="screen">
      <h2>设置</h2>
      <div class="settings-row"><label style="width:150px">渲染距离（区块）</label>
        <select id="set-rd">
          ${[2, 3, 4, 5].map((n) => `<option value="${n}" ${n === current.renderDistance ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="settings-row"><label style="width:150px">阴影</label>
        <select id="set-sh"><option value="1" ${current.shadows ? 'selected' : ''}>开启</option><option value="0" ${!current.shadows ? 'selected' : ''}>关闭</option></select>
      </div>
      <div class="settings-row"><label style="width:150px">死亡保留物品</label>
        <select id="set-keep"><option value="1" ${current.keepItemsOnDeath ? 'selected' : ''}>保留快捷栏</option><option value="0" ${!current.keepItemsOnDeath ? 'selected' : ''}>全部掉落</option></select>
      </div>
      <div class="settings-row"><label style="width:150px">鼠标灵敏度</label>
        <input type="range" id="set-sens" min="0.4" max="2" step="0.1" value="${current.mouseSensitivity}" />
      </div>
      <div class="menu-row" style="margin-top:14px">
        <button id="set-save">保存</button>
        <button id="set-back">返回</button>
      </div>
    </div>
  `);
  root.appendChild(screen);
  screen.querySelector('#set-save')?.addEventListener('click', () => {
    onSave({
      renderDistance: Number((screen.querySelector('#set-rd') as HTMLSelectElement).value),
      shadows: (screen.querySelector('#set-sh') as HTMLSelectElement).value === '1',
      keepItemsOnDeath: (screen.querySelector('#set-keep') as HTMLSelectElement).value === '1',
      mouseSensitivity: Number((screen.querySelector('#set-sens') as HTMLInputElement).value)
    });
    onBack();
  });
  screen.querySelector('#set-back')?.addEventListener('click', onBack);
}

export function showError(root: HTMLElement, message: string, onBack: () => void, onClear?: () => void) {
  clearScreens(root);
  const screen = el(`
    <div class="screen">
      <h2>读取失败</h2>
      <div class="error-box">${message}</div>
      <div class="menu-row">
        <button id="err-back">返回主菜单</button>
        <button id="err-new">清除全部存档并重新开始</button>
      </div>
    </div>
  `);
  root.appendChild(screen);
  screen.querySelector('#err-back')?.addEventListener('click', onBack);
  screen.querySelector('#err-new')?.addEventListener('click', () => {
    if (onClear) onClear();
    else localStorage.removeItem('wasteland-grids-save-v1');
    onBack();
  });
}

export function confirmRestart(root: HTMLElement, onConfirm: () => void, onCancel: () => void) {
  const existing = root.querySelector('#confirm-restart');
  if (existing) existing.remove();
  const box = el(`
    <div class="screen" id="confirm-restart">
      <h2>重新开始？</h2>
      <div class="error-box">这将清除当前世界的全部进度，且无法恢复。</div>
      <div class="menu-row">
        <button id="cr-yes">确认清除并重新开始</button>
        <button id="cr-no">取消</button>
      </div>
    </div>
  `);
  root.appendChild(box);
  box.querySelector('#cr-yes')?.addEventListener('click', onConfirm);
  box.querySelector('#cr-no')?.addEventListener('click', () => {
    box.remove();
    onCancel();
  });
}
