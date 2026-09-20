// Larger overlay screens: main menu, settings, inventory panel, crafting, logs, pause, death, ending.

import { el } from './ui';

export function clearScreens(root: HTMLElement) {
  root.querySelectorAll('.screen, .panel-window').forEach((n) => n.remove());
}

export interface MenuCallbacks {
  start: (seed: string, route: 'fortify' | 'salvage') => void;
  continueGame: () => void;
  settings: () => void;
}

export const RECOMMENDED_SEED = 'LEYLINE-2049';

export function showMainMenu(root: HTMLElement, hasSave: boolean, cb: MenuCallbacks) {
  clearScreens(root);
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
        <button id="btn-continue" ${hasSave ? '' : 'disabled'}>继续游戏</button>
        <button id="btn-settings">设置</button>
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

export function showError(root: HTMLElement, message: string, onBack: () => void) {
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
    localStorage.removeItem('wasteland-grids-save-v1');
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
