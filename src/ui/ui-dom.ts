// Larger overlay screens: main menu, settings, inventory panel, crafting, logs, pause, death, ending.

import { el, slotSummaryHtml, SLOT_LABELS } from './ui';
import { SlotId, SlotInfo } from '../game/save';

export function clearScreens(root: HTMLElement) {
  root.querySelectorAll('.screen, .panel-window').forEach((n) => n.remove());
}

export interface MenuCallbacks {
  start: (seed: string, route: 'fortify' | 'salvage') => void;
  continueGame: () => void;
  loadSlot: (id: SlotId) => void;
  deleteSlot: (id: SlotId) => void;
  settings: () => void;
}

export const RECOMMENDED_SEED = 'LEYLINE-2049';

export interface SaveMenuInfo {
  slots: SlotInfo[];
  currentSlot: SlotId | null;
  legacy: boolean;
  envelopeError?: string;
}

export function showMainMenu(root: HTMLElement, saveInfo: SaveMenuInfo, cb: MenuCallbacks) {
  clearScreens(root);
  const canContinue = saveInfo.legacy || saveInfo.slots.some((s) => s.state === 'ok');
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
        <button id="btn-continue" ${canContinue ? '' : 'disabled'}>继续游戏</button>
        <button id="btn-settings">设置</button>
      </div>
      <div class="save-slots-wrap">
        <h3>存档槽位</h3>
        ${saveInfo.envelopeError ? `<div class="error-box">存档列表读取失败：${saveInfo.envelopeError}（已按空槽位显示）</div>` : ''}
        ${saveInfo.legacy ? '<div class="legacy-notice">检测到旧版单存档：选择继续游戏或保存时会自动迁移到空闲手动槽位，不会被丢弃。</div>' : ''}
        <div class="save-slots" id="save-slots"></div>
      </div>
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

  const slotsEl = screen.querySelector('#save-slots') as HTMLElement;
  const stateText: Record<SlotInfo['state'], string> = {
    empty: '空闲',
    ok: saveInfo.currentSlot ? '' : '已有存档',
    corrupt: '已损坏'
  };
  for (const info of saveInfo.slots) {
    const tag =
      info.state === 'ok'
        ? info.id === saveInfo.currentSlot
          ? '当前进度'
          : '已有存档'
        : stateText[info.state];
    const row = el(`
      <div class="save-slot ${info.state}" data-slot="${info.id}">
        <div class="slot-head"><b>${SLOT_LABELS[info.id]}</b><span class="tag">${tag}</span></div>
        <div class="slot-meta">${slotSummaryHtml(info)}</div>
        <div class="slot-actions"></div>
      </div>
    `);
    const actions = row.querySelector('.slot-actions') as HTMLElement;
    if (info.state === 'ok') {
      const loadBtn = el(`<button class="slot-load">载入</button>`);
      loadBtn.addEventListener('click', () => cb.loadSlot(info.id));
      actions.appendChild(loadBtn);
      const delBtn = el(`<button class="slot-delete">删除</button>`);
      delBtn.addEventListener('click', () => {
        confirmBox(root, '删除槽位？', `将永久删除「${SLOT_LABELS[info.id]}」中的存档，其它槽位不受影响。`, () =>
          cb.deleteSlot(info.id)
        );
      });
      actions.appendChild(delBtn);
    }
    slotsEl.appendChild(row);
  }
}

export function confirmBox(
  root: HTMLElement,
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel: () => void = () => undefined
) {
  root.querySelector('#confirm-box')?.remove();
  const box = el(`
    <div class="screen" id="confirm-box">
      <h2>${title}</h2>
      <div class="error-box">${message}</div>
      <div class="menu-row">
        <button id="cb-yes">确认</button>
        <button id="cb-no">取消</button>
      </div>
    </div>
  `);
  root.appendChild(box);
  box.querySelector('#cb-yes')?.addEventListener('click', () => {
    box.remove();
    onConfirm();
  });
  box.querySelector('#cb-no')?.addEventListener('click', () => {
    box.remove();
    onCancel();
  });
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
        <button id="err-new">清除存档并重新开始</button>
      </div>
    </div>
  `);
  root.appendChild(screen);
  screen.querySelector('#err-back')?.addEventListener('click', onBack);
  screen.querySelector('#err-new')?.addEventListener('click', () => {
    if (onClear) onClear();
    else {
      localStorage.removeItem('wasteland-grids-save-v1');
      localStorage.removeItem('wasteland-grids-save-slots-v2');
      onBack();
    }
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
