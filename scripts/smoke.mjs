// 真实浏览器冒烟脚本：移动→采集→制作→建造→战斗→事件→存档→死亡→通关结局
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const harness = readFileSync(join(here, 'browser-harness.js'), 'utf8');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluateOnNewDocument((h) => { /* harness injected later */ void h; }, harness);
await page.waitForSelector('#btn-new');
await page.evaluate(() => { document.getElementById('seed-input').value = 'WASTELAND-7'; });
await page.click('#btn-new');
await page.waitForSelector('#intro:not(.hidden)');
await page.evaluate(harness);
await page.click('#btn-intro-ok');
await sleep(1200);

const call = (fn) => page.evaluate((name) => globalThis.__smoke[name](), fn);

console.log('进入游戏:', await call('state'));
await call('move');
console.log('移动后:', await call('state'));
console.log('采集结果:', await call('gather'));
const crafted = await call('craftAll');
console.log('制作结果:', crafted);
if (crafted.axe !== 1 || crafted.hammer !== 1) throw new Error('基础工具制作失败');
const built = await call('build');
console.log('建造结果:', built);
if (built.placed.length < 4) throw new Error('建筑放置不完整: ' + JSON.stringify(built.placed));
if (built.stage < 3) throw new Error('据点任务未推进 stage=' + built.stage);
const combat = await call('combat');
console.log('战斗结果:', combat);
if (!combat.killed || combat.kills < 1) throw new Error('战斗击杀流程失败');
const ev = await call('events');
console.log('事件:', ev);
if (ev.after <= ev.before) throw new Error('动态事件未写入日志');
console.log('存档:', await call('save'));
// 存档读取一致性：再读取一次
const continued = await call('continueGame');
console.log('继续游戏:', continued);
if (!continued.ok || continued.buildings < 4) throw new Error('存档读取后建筑数据丢失');
// 坏档保护
await page.evaluate(() => globalThis.__smoke.corruptSave());
const corrupt = await call('continueCorrupt');
console.log('坏档保护:', corrupt);
if (corrupt.ok || corrupt.after) throw new Error('损坏存档未被正确拒绝与清除');
const death = await call('death');
console.log('死亡流程:', death);
if (death.alive || !death.screenShown) throw new Error('死亡流程失败');
await page.evaluate(() => globalThis.__game.respawn());
const ending = await call('ending');
console.log('结局流程:', ending);
if (!ending.ended || !ending.endingShown) throw new Error('任务成功结局流程失败');

console.log('\n页面错误数:', errors.length);
errors.slice(0, 10).forEach((e) => console.log(' -', e));
await browser.close();
if (errors.some((e) => e.includes('PAGEERROR'))) throw new Error('页面存在未捕获错误');
console.log('\n✅ 浏览器冒烟测试全部通过');
