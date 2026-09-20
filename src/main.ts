import './style.css';
import { Game } from './game';
import { hasSave, loadSettings, saveSettings } from './core/save';

const $ = (id: string) => document.getElementById(id)!;

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const settings = loadSettings();

// 应用设置控件
($('set-drop') as HTMLSelectElement).value = settings.deathDrop;
($('set-sens') as HTMLInputElement).value = String(settings.sensitivity);
($('set-render') as HTMLSelectElement).value = String(settings.renderDistance);

const game = new Game(canvas, settings);
// 开发/自动化测试钩子
import { BlockId as _BlockId } from './core/blocks';
import { RECIPES as _RECIPES, craft as _craft } from './core/recipes';
import { spawnEnemy as _spawnEnemy, damageEnemy as _damageEnemy } from './core/enemies';
(window as unknown as { __game: typeof game; __test: unknown }).__game = game;
(window as unknown as { __test: unknown }).__test = {
  BlockId: _BlockId, RECIPES: _RECIPES, craft: _craft, spawnEnemy: _spawnEnemy, damageEnemy: _damageEnemy,
};

// 主菜单
$('btn-continue').toggleAttribute('disabled', !hasSave());
$('menu-hint').textContent = hasSave() ? '检测到本地存档，可继续上次旅程。' : '未发现存档，开始新的荒原之旅。';
($('seed-input') as HTMLInputElement).placeholder = '留空随机，推荐：WASTELAND-7';

$('btn-new').addEventListener('click', () => {
  const seed = ($('seed-input') as HTMLInputElement).value.trim();
  game.settings = readSettings();
  game.newGame(seed);
});
$('btn-continue').addEventListener('click', () => {
  game.continueGame();
});
$('btn-settings').addEventListener('click', () => {
  game.ui.hide('main-menu');
  game.ui.show('settings-menu');
});
$('btn-settings-back').addEventListener('click', () => {
  persistSettings();
  game.ui.hide('settings-menu');
  game.ui.show('main-menu');
});
$('btn-intro-ok').addEventListener('click', () => game.startAfterIntro());

// 暂停菜单
$('btn-resume').addEventListener('click', () => game.resume());
$('btn-save').addEventListener('click', () => {
  try { game.doSave(); game.ui.toast('进度已保存', 'good'); } catch (e) { game.ui.toast((e as Error).message, 'warn'); }
});
$('btn-journal').addEventListener('click', () => game.toggleJournal());
$('btn-quick-menu').addEventListener('click', () => game.backToMenu(true));
$('btn-restart').addEventListener('click', () => game.restart());

// 死亡 / 结局
$('btn-respawn').addEventListener('click', () => game.respawn());
$('btn-death-menu').addEventListener('click', () => game.backToMenu(false));
$('btn-ending-menu').addEventListener('click', () => game.backToMenu(false));

// 点击画面锁定鼠标
canvas.addEventListener('click', () => {
  if (game.mode === 'play' as string) { /* via game internal */ }
});

function readSettings() {
  return {
    deathDrop: ($('set-drop') as HTMLSelectElement).value,
    sensitivity: parseFloat(($('set-sens') as HTMLInputElement).value),
    renderDistance: parseInt(($('set-render') as HTMLSelectElement).value, 10),
  };
}
function persistSettings() {
  const s = readSettings();
  saveSettings(s);
  game.settings = s;
}

// 设置实时生效
['set-drop', 'set-sens', 'set-render'].forEach((id) => $(id).addEventListener('change', persistSettings));

// 全局错误保护：存档损坏等不再导致白屏
window.addEventListener('error', (e) => {
  console.error(e.error);
});
