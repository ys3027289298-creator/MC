import * as THREE from 'three';
import { World, WORLD_HEIGHT, DroppedItemEntity, SpecialSite } from './core/world';
import { BlockId, BLOCKS } from './core/blocks';
import { Rng } from './core/rng';
import {
  createPlayer, updatePlayerPhysics, PlayerState, MoveInput, raycastVoxel,
  blockOverlapsPlayer, eyeHeight, terrainSpeedMul,
} from './core/player';
import { Inventory } from './core/inventory';
import { getItem } from './core/items';
import { Recipe, craft } from './core/recipes';
import {
  createEnv, updateEnvironment, isNight, EnvState, setWeather, Weather, WEATHER_INFO,
} from './core/environment';
import {
  Enemy, spawnEnemy, updateEnemy, damageEnemy, ENEMY_DEFS, pickSpawnPosition, EnemyKind,
} from './core/enemies';
import { createQuestState, QuestState, QUESTS, setStage, hasFlag, advance, endingRank } from './core/quests';
import { GameEvent, rollEvent, makeEvent, caveCollapse, energyLeak, raidEffect, migrationEffect } from './core/events';
import { updateSurvival, actionSpeedMul, eat, damagePlayer } from './core/survival';
import { GameSave, saveGame, loadGame, hasSave, clearSave, ChestData } from './core/save';
import { GameScene, lightLevelAt } from './render/scene';
import { EntityRenderer, ProjectileRenderer } from './render/entities';
import { UI } from './ui';

interface Projectile { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }

export interface GameSettings { deathDrop: string; sensitivity: number; renderDistance: number }

const REACH = 6;
const $ = (id: string): HTMLElement => document.getElementById(id)!;

export class Game {
  world: World;
  player: PlayerState;
  inventory = new Inventory(24);
  env: EnvState;
  quest: QuestState;
  enemies: Enemy[] = [];
  dropped: DroppedItemEntity[] = [];
  events: GameEvent[] = [];
  chests = new Map<string, ChestData>();
  projectiles: Projectile[] = [];
  stats = { buildings: 0, mined: 0, kills: 0, playTime: 0 };

  scene: GameScene;
  entities: EntityRenderer;
  projs: ProjectileRenderer;
  ui = new UI();
  rng: Rng;
  settings: GameSettings;

  private input: MoveInput = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, crouch: false };
  private activeHotbar = 0;
  private mouseDown: Record<number, boolean> = {};
  private breaking: { x: number; y: number; z: number; progress: number } | null = null;
  private last = performance.now();
  private raf = 0;
  private paused = true;
  mode: 'menu' | 'play' = 'menu';
  private eventTimer = 50;
  private enemyTimer = 12;
  private finalWave = 0;
  private finalWaveTimer = 0;
  private finalActive = false;
  private attackCd = 0;
  private currentChestKey: string | null = null;
  private containerOpen = false;
  private ended = false;
  private seed = '';
  private projId = 1;
  private cursorTarget: { x: number; y: number; z: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, settings: GameSettings) {
    this.settings = settings;
    this.world = new World('__init__');
    this.player = createPlayer(0, 40, 0);
    this.env = createEnv();
    this.quest = createQuestState();
    this.rng = new Rng(1);
    this.scene = new GameScene(canvas);
    this.entities = new EntityRenderer(this.scene.scene);
    this.projs = new ProjectileRenderer(this.scene.scene);
    this.bindInput();
    this.bindUI();
  }

  newGame(seed: string): void {
    this.seed = seed || ('RAND-' + Math.floor(Math.random() * 1e9).toString(36));
    this.world = new World(this.seed);
    this.rng = new Rng(this.seed + '#game');
    const spawn = this.findSpawn();
    this.player = createPlayer(spawn.x, spawn.y, spawn.z);
    this.inventory = new Inventory(24);
    this.env = createEnv();
    this.quest = createQuestState();
    this.enemies = [];
    this.dropped = [];
    this.events = [];
    this.chests.clear();
    this.projectiles = [];
    this.stats = { buildings: 0, mined: 0, kills: 0, playTime: 0 };
    this.finalWave = 0; this.finalActive = false; this.ended = false;
    this.inventory.add('fiber', 4);
    this.buildShelterHint();
    this.enterPlay();
    this.ui.toast('欢迎来到荒原。先采集棘木与碎石！', 'quest', 5000);
  }

  private findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 60; r++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(4, 30);
      const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
      const y = this.world.topSolidY(x, z);
      const h = this.world.heightAt(x, z);
      const biome = this.world.biomeAt(x, z, h);
      if ((biome === 'grass' || biome === 'rock') && y > 22 && y < 30) return { x: x + 0.5, y: y + 1.01, z: z + 0.5 };
    }
    const y = this.world.topSolidY(0, 0);
    return { x: 0.5, y: y + 1.01, z: 0.5 };
  }

  private buildShelterHint(): void {
    const px = Math.floor(this.player.x), pz = Math.floor(this.player.z);
    const y = this.world.topSolidY(px + 2, pz);
    if (this.world.getBlock(px + 2, y + 1, pz) === BlockId.Air) {
      this.world.setBlock(px + 2, y + 1, pz, BlockId.Brazier, false);
      this.world.buildingHp.set(World.blockKey(px + 2, y + 1, pz), BLOCKS[BlockId.Brazier].buildingHp!);
    }
  }

  continueGame(): boolean {
    if (!hasSave()) return false;
    let data: GameSave;
    try { data = loadGame(); } catch (e) {
      this.ui.toast((e as Error).message, 'warn', 5000);
      return false;
    }
    this.seed = data.seed;
    this.world = new World(this.seed);
    this.rng = new Rng(this.seed + '#game');
    for (const [k, id] of data.edits) this.world.edits.set(k, id);
    for (const [k, hp] of data.buildingHp) this.world.buildingHp.set(k, hp);
    for (const d of data.doors) this.world.doorOpen.add(d);
    this.world.sites = data.sites;
    this.player = createPlayer(data.player.x, data.player.y, data.player.z);
    Object.assign(this.player, data.player);
    this.inventory = Inventory.load(data.inventory);
    this.env = createEnv();
    this.env.time = data.env.time; this.env.day = data.env.day;
    this.env.weather = data.env.weather as Weather; this.env.weatherTime = data.env.weatherTime;
    this.quest = data.quest;
    this.events = data.events ?? [];
    this.enemies = data.enemies ?? [];
    this.chests = new Map((data.chests ?? []).map((c) => [c.key, c]));
    this.stats = data.stats;
    this.finalWave = data.finalWave ?? 0;
    this.settings = data.settings;
    this.enterPlay();
    this.ui.toast('已读取最近一次进度。', 'good');
    return true;
  }

  private enterPlay(): void {
    this.mode = 'play';
    this.paused = true;
    this.ui.hide('main-menu'); this.ui.hide('settings-menu');
    this.ui.show('hud');
    this.ui.show('intro');
    const stage = this.quest.stage;
    $('intro-text').innerHTML =
      `目标：${QUESTS[stage].text}<br>${QUESTS[stage].hint}<br><br>` +
      `WASD 移动｜鼠标视角｜左键按住挖掘｜右键放置/交互｜E 背包制作｜J 任务日志｜滚轮/数字键切换｜Esc 暂停<br>` +
      `推荐种子：<b>WASTELAND-7</b>（固定世界，便于录制演示）`;
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.loop();
  }

  startAfterIntro(): void {
    this.ui.hide('intro');
    this.requestLock();
  }

  private requestLock(): void {
    if (!this.ended) this.canvas.requestPointerLock();
  }

  private onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    if (locked) {
      this.paused = false;
      this.ui.hide('pause-menu');
      if (this.containerOpen) this.closeContainers();
    } else if (this.mode === 'play' && !this.ended && !this.ui.visible('intro') && !this.containerOpen) {
      this.paused = true;
      this.ui.show('pause-menu');
    }
  };

  resume(): void {
    this.ui.hide('pause-menu');
    this.requestLock();
  }

  pauseGame(): void {
    this.paused = true;
    document.exitPointerLock?.();
  }

  backToMenu(save = true): void {
    if (save && this.mode === 'play' && !this.ended) {
      try { this.doSave(); } catch (e) { this.ui.toast((e as Error).message, 'warn'); }
    }
    this.mode = 'menu';
    this.paused = true;
    this.ended = false;
    document.exitPointerLock?.();
    ['hud', 'pause-menu', 'death-screen', 'ending-screen', 'inventory-screen', 'chest-screen', 'journal-screen', 'intro']
      .forEach((id) => this.ui.hide(id));
    this.closeContainers();
    this.ui.show('main-menu');
    document.getElementById('btn-continue')!.toggleAttribute('disabled', !hasSave());
  }

  restart(): void {
    if (!confirm('重新开始将清除当前存档，确定吗？')) return;
    clearSave();
    this.backToMenu(false);
  }

  doSave(): void {
    const data: GameSave = {
      version: 1, seed: this.seed,
      player: {
        x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch,
        hp: this.player.hp, stamina: this.player.stamina, food: this.player.food,
        temperature: this.player.temperature, safety: this.player.safety,
        spawnX: this.player.spawnX, spawnY: this.player.spawnY, spawnZ: this.player.spawnZ,
      },
      inventory: this.inventory.serialize(),
      env: { time: this.env.time, day: this.env.day, weather: this.env.weather, weatherTime: this.env.weatherTime },
      edits: [...this.world.edits.entries()],
      buildingHp: [...this.world.buildingHp.entries()],
      doors: [...this.world.doorOpen],
      sites: this.world.sites,
      quest: this.quest,
      events: this.events,
      enemies: this.enemies.filter((e) => e.state !== 'dead'),
      chests: [...this.chests.values()],
      stats: this.stats,
      settings: this.settings,
      finalWave: this.finalWave,
      savedAt: Date.now(),
    };
    saveGame(data);
  }

  // ---------- 输入 ----------
  private bindInput(): void {
    document.addEventListener('keydown', (e) => this.onKey(e, true));
    document.addEventListener('keyup', (e) => this.onKey(e, false));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => {
      if (this.paused || this.mode !== 'play') return;
      this.activeHotbar = (this.activeHotbar + (e.deltaY > 0 ? 1 : -1) + 8) % 8;
      this.refreshHotbar();
    });
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.mode !== 'play') return;
    switch (e.code) {
      case 'KeyW': this.input.forward = down; break;
      case 'KeyS': this.input.back = down; break;
      case 'KeyA': this.input.left = down; break;
      case 'KeyD': this.input.right = down; break;
      case 'Space': this.input.jump = down; break;
      case 'ShiftLeft': case 'ShiftRight': this.input.sprint = down; break;
      case 'ControlLeft': case 'KeyC': this.input.crouch = down; break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8':
        if (down) { this.activeHotbar = Number(e.code.slice(5)) - 1; this.refreshHotbar(); }
        break;
      case 'KeyE': if (down) this.toggleInventory(); break;
      case 'KeyJ': if (down) this.toggleJournal(); break;
      case 'Escape': if (down && !this.paused) this.pauseGame(); break;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (document.pointerLockElement !== this.canvas || this.paused) return;
    const s = 0.0022 * this.settings.sensitivity;
    this.player.yaw -= e.movementX * s;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch - e.movementY * s));
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.paused || this.mode !== 'play' || document.pointerLockElement !== this.canvas) return;
    this.mouseDown[e.button] = true;
    if (e.button === 0) this.tryAttackOrBreak(true);
    if (e.button === 2) this.useItemOrInteract();
  }
  private onMouseUp(e: MouseEvent): void {
    this.mouseDown[e.button] = false;
    if (e.button === 0) { this.breaking = null; this.ui.setBreakProgress(null); }
  }

  // ---------- 界面切换 ----------
  toggleInventory(): void {
    if (this.containerOpen || this.ui.visible('death-screen') || this.ended) return;
    if (this.ui.visible('inventory-screen')) {
      this.closeContainers();
      this.requestLock();
    } else {
      this.openInventory();
    }
  }

  private openInventory(): void {
    document.exitPointerLock?.();
    this.containerOpen = true;
    this.ui.show('inventory-screen');
    this.ui.renderInventory(this.inventory, this.nearWorkbench(), this.quest.stage);
  }

  toggleJournal(): void {
    if (this.ui.visible('journal-screen')) {
      this.closeContainers();
      this.requestLock();
    } else {
      document.exitPointerLock?.();
      this.containerOpen = true;
      this.ui.show('journal-screen');
      this.ui.renderJournal(this.quest, this.events);
    }
  }

  closeContainers(): void {
    this.containerOpen = false;
    this.currentChestKey = null;
    this.ui.hide('inventory-screen');
    this.ui.hide('chest-screen');
    this.ui.hide('journal-screen');
  }

  private bindUI(): void {
    this.ui.selectHotbar = (i) => { this.activeHotbar = i; this.refreshHotbar(); };
    this.ui.onCraft = (r) => this.doCraft(r);
    this.ui.onChestSlot = (which, i) => this.transferChest(which, i);
    $('btn-split').addEventListener('click', () => {
      if (this.ui.selectedInv < 0) return;
      this.inventory.split(this.ui.selectedInv);
      this.ui.renderInventory(this.inventory, this.nearWorkbench(), this.quest.stage);
      this.refreshHotbar();
    });
    $('btn-drop').addEventListener('click', () => {
      if (this.ui.selectedInv < 0) return;
      const stack = this.inventory.slots[this.ui.selectedInv];
      if (stack) {
        this.dropItem(stack.id, stack.count, stack.durability);
        this.inventory.dropAll(this.ui.selectedInv);
      }
      this.ui.selectedInv = -1;
      this.ui.renderInventory(this.inventory, this.nearWorkbench(), this.quest.stage);
      this.refreshHotbar();
    });
    $('btn-close-inv').addEventListener('click', () => this.toggleInventory());
    $('btn-close-chest').addEventListener('click', () => { this.closeContainers(); this.requestLock(); });
    $('btn-close-journal').addEventListener('click', () => this.toggleJournal());
  }

  private doCraft(r: Recipe): void {
    const result = craft(r, this.inventory, this.nearWorkbench(), this.quest.stage);
    if (result === 'ok') {
      this.ui.toast(`制作成功：${r.name}`, 'good');
      this.ui.renderInventory(this.inventory, this.nearWorkbench(), this.quest.stage);
      this.refreshHotbar();
      this.checkQuestProgress();
    } else {
      const msg = result === 'no_materials' ? '材料不足或背包已满' : result === 'no_station' ? '需要靠近工作台' : '需要先推进任务';
      this.ui.toast(msg, 'warn');
    }
  }

  private nearWorkbench(): boolean {
    return this.nearBlock(BlockId.Workbench, 3.5);
  }
  private nearBlock(id: number, radius = 4): boolean {
    const p = this.player;
    for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -Math.ceil(radius); dz <= Math.ceil(radius); dz++) {
          if (this.world.getBlock(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz) === id) return true;
        }
    return false;
  }
  private countNearby(id: number, radius: number): number {
    const p = this.player;
    let count = 0;
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -radius; dz <= radius; dz++) {
      if (this.world.getBlock(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz) === id) count++;
    }
    return count;
  }
  private nearBlockPosition(id: number): { x: number; y: number; z: number } | null {
    const p = this.player;
    for (let dx = -4; dx <= 4; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -4; dz <= 4; dz++) {
      const x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy, z = Math.floor(p.z) + dz;
      if (this.world.getBlock(x, y, z) === id) return { x, y, z };
    }
    return null;
  }

  refreshHotbar(): void {
    this.ui.renderHotbar(this.inventory, this.activeHotbar);
    const s = this.inventory.hotbarSlot(this.activeHotbar);
    this.ui.setHeldName(s ? getItem(s.id)!.name : '');
  }

  // ---------- 视线 ----------
  private eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.player.x, this.player.y + eyeHeight(this.player), this.player.z);
  }
  private lookVector(): THREE.Vector3 {
    const cp = Math.cos(this.player.pitch);
    return new THREE.Vector3(
      -Math.sin(this.player.yaw) * cp,
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * cp
    );
  }

  private held(): { stackIndex: number; def: ReturnType<typeof getItem> } | null {
    const idx = this.inventory.hotbarIndex(this.activeHotbar);
    const stack = this.inventory.slots[idx];
    if (!stack) return null;
    return { stackIndex: idx, def: getItem(stack.id) };
  }

  // 持续挖掘（在 update 中调用）
  private handleMining(dt: number): void {
    if (!this.mouseDown[0] || this.paused) return;
    const eye = this.eyePosition();
    const dir = this.lookVector();
    const hit = raycastVoxel(this.world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
    if (!hit) { this.breaking = null; this.ui.setBreakProgress(null); this.cursorTarget = null; this.scene.hideHighlight(); return; }
    this.cursorTarget = { x: hit.x, y: hit.y, z: hit.z };
    const def = BLOCKS[hit.id];
    if (!def || def.hardness >= 90) {
      // 任务方块不能直接挖
      if (hit.id === BlockId.CoreBlock || hit.id === BlockId.TowerPart || hit.id === BlockId.Observatory) {
        this.scene.showHighlight(hit.x, hit.y, hit.z, false);
      }
      return;
    }
    const held = this.held();
    let speed = 1;
    let canMine = true;
    if (def.tool !== 'none') {
      if (!held || held.def?.toolType !== def.tool) canMine = false;
      else speed = held.def.efficiency ?? 1;
    }
    // 高级工具兼容低级用途：drill 也能敲 wood（但慢），锤可碎石
    if (!canMine && held && held.def?.toolType) {
      if ((def.tool === 'hammer' && held.def.toolType === 'drill') || (def.tool === 'drill' && held.def.toolType === 'hammer')) {
        canMine = true; speed = 0.5;
      }
    }
    if (!canMine) {
      this.ui.setBreakProgress(null);
      if (Math.floor(performance.now() / 600) % 2 === 0) this.ui.toast(`需要${def.tool === 'axe' ? '切割斧' : def.tool === 'drill' ? '挖掘钻' : '采集锤'}才能开采`, 'warn', 900);
      return;
    }
    speed *= actionSpeedMul(this.player, this.env);
    if (!this.breaking || this.breaking.x !== hit.x || this.breaking.y !== hit.y || this.breaking.z !== hit.z) {
      this.breaking = { x: hit.x, y: hit.y, z: hit.z, progress: 0 };
    }
    this.breaking.progress += (dt * speed) / def.hardness;
    this.ui.setBreakProgress(Math.min(1, this.breaking.progress));
    this.player.stamina = Math.max(0, this.player.stamina - dt * 2);
    if (this.breaking.progress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z, hit.id, held?.stackIndex ?? -1);
      this.breaking = null;
      this.ui.setBreakProgress(null);
    }
  }

  private breakBlock(x: number, y: number, z: number, id: number, toolIndex: number): void {
    const def = BLOCKS[id];
    this.world.setBlock(x, y, z, BlockId.Air);
    this.stats.mined++;
    if (toolIndex >= 0 && def.tool !== 'none') this.inventory.wear(toolIndex, 1);
    // 掉落
    if (def.drop) {
      let dropId = def.drop;
      let count = 1;
      if (def.dropCount) count = this.rng.int(def.dropCount[0], def.dropCount[1]);
      if (id === BlockId.FiberPlant) {
        // 沙地旱刺掉果肉，草地掉纤维
        const below = this.world.getBlock(x, y - 1, z);
        if (below === BlockId.Sand) dropId = 'cactus_flesh';
      }
      if (id === BlockId.Rubble && this.rng.chance(0.35)) dropId = 'ruin_metal';
      this.spawnDrop(dropId, count, x + 0.5, y + 0.3, z + 0.5);
    }
    // 建筑损坏记录清除
    this.world.buildingHp.delete(World.blockKey(x, y, z));
    this.checkQuestProgress();
  }

  private spawnDrop(id: string, count: number, x: number, y: number, z: number): void {
    const leftover = this.inventory.add(id, count);
    if (leftover > 0) {
      this.dropped.push({ id, count: leftover, x, y, z, born: performance.now() });
    }
  }
  private dropItem(id: string, count: number, durability?: number): void {
    const p = this.player;
    this.dropped.push({ id, count, x: p.x, y: p.y + 1, z: p.z, born: performance.now(), });
    void durability;
  }

  private pickupDrops(dt: number): void {
    const p = this.player;
    for (let i = this.dropped.length - 1; i >= 0; i--) {
      const d = this.dropped[i];
      const dist = Math.hypot(d.x - p.x, d.y - (p.y + 0.8), d.z - p.z);
      if (dist < 2.2) {
        // 吸附
        d.x += (p.x - d.x) * Math.min(1, dt * 6);
        d.y += ((p.y + 0.8) - d.y) * Math.min(1, dt * 6);
        d.z += (p.z - d.z) * Math.min(1, dt * 6);
      }
      if (dist < 0.8) {
        const left = this.inventory.add(d.id, d.count);
        if (left <= 0) {
          this.dropped.splice(i, 1);
          this.ui.toast(`拾取 ${getItem(d.id)!.name}`, '', 900);
        } else {
          d.count = left;
          this.ui.toast('背包已满，无法拾取', 'warn', 1200);
        }
      }
    }
  }

  // 右键：放置 / 交互
  private useItemOrInteract(): void {
    const eye = this.eyePosition();
    const dir = this.lookVector();
    const hit = raycastVoxel(this.world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
    if (hit) {
      // 特殊交互优先
      if (this.tryInteract(hit.x, hit.y, hit.z, hit.id)) return;
    }
    const held = this.held();
    if (!held) return;
    const def = held.def!;
    // 食用
    if (def.kind === 'food') {
      const idx = held.stackIndex;
      eat(this.player, def.food ?? 0, def.heal ?? 0, def.warmth ?? 0);
      this.inventory.removeSlot(idx, 1);
      this.ui.toast(`使用 ${def.name}`, 'good', 1000);
      this.refreshHotbar();
      return;
    }
    // 修理器：右键修复看向的建筑
    if (def.toolType === 'repair' && hit) {
      const key = World.blockKey(hit.x, hit.y, hit.z);
      const maxHp = BLOCKS[hit.id]?.buildingHp;
      if (maxHp) {
        const cur = this.world.buildingHp.get(key) ?? maxHp;
        this.world.buildingHp.set(key, Math.min(maxHp, cur + 30));
        this.inventory.wear(held.stackIndex, 1);
        this.ui.toast('修复建筑 +30 耐久', 'good');
        return;
      }
    }
    // 照明棒：插在墙面（放置 GlowLamp 的轻量替代——这里给安全值且消耗耐久，不放置方块）
    if (def.toolType === 'light') {
      this.player.safety = Math.min(100, this.player.safety + 25);
      this.inventory.wear(held.stackIndex, 1);
      this.ui.toast('照明棒点亮了周围', 'good', 1200);
      return;
    }
    // 远程武器
    if (def.ranged) {
      this.fireProjectile(held.stackIndex, def.damage ?? 20);
      return;
    }
    // 近战武器/工具：攻击在左键处理
    if (def.kind === 'block' && def.blockId !== undefined && hit) {
      this.placeBlock(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz, def.blockId, held.stackIndex, def.id);
    }
  }

  private placeBlock(x: number, y: number, z: number, blockId: number, stackIndex: number, itemId: string): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    if (this.world.getBlock(x, y, z) !== BlockId.Air) {
      this.ui.toast('该位置已有方块', 'warn', 900); return;
    }
    // 浮空检查：必须依附实体方块
    const support = [
      this.world.getBlock(x + 1, y, z), this.world.getBlock(x - 1, y, z),
      this.world.getBlock(x, y + 1, z), this.world.getBlock(x, y - 1, z),
      this.world.getBlock(x, y, z + 1), this.world.getBlock(x, y, z - 1),
    ].some((id) => BLOCKS[id]?.solid);
    if (!support) { this.ui.toast('建筑不能悬空放置', 'warn', 1100); return; }
    // 不能放进玩家身体
    const height = this.player.crouching ? 1.4 : 1.8;
    if (blockOverlapsPlayer(this.player, x, y, z, height)) {
      this.ui.toast('不能把方块放在自己身体内', 'warn', 1100); return;
    }
    this.world.setBlock(x, y, z, blockId);
    this.inventory.removeSlot(stackIndex, 1);
    const bp = BLOCKS[blockId];
    if (bp.buildingHp) this.world.buildingHp.set(World.blockKey(x, y, z), bp.buildingHp);
    this.stats.buildings++;
    this.refreshHotbar();
    this.checkQuestProgress();
    void itemId;
  }

  private fireProjectile(stackIndex: number, damage: number): void {
    const eye = this.eyePosition();
    const dir = this.lookVector();
    this.projectiles.push({
      id: this.projId++, x: eye.x, y: eye.y, z: eye.z,
      vx: dir.x * 22, vy: dir.y * 22, vz: dir.z * 22, life: 2.5,
    });
    this.inventory.removeSlot(stackIndex, 1);
    this.refreshHotbar();
    void damage;
  }

  private tryAttackOrBreak(_initial: boolean): void {
    if (this.attackCd > 0) return;
    const held = this.held();
    if (!held || held.def?.ranged) { this.handleMining(0.016); return; }
    // 近战：攻击视锥内最近敌人
    const dmg = held.def?.damage ?? 4;
    const eye = this.eyePosition();
    const dir = this.lookVector();
    let best: Enemy | null = null; let bestDot = 0.9;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const v = new THREE.Vector3(e.x - eye.x, (e.y + 1) - eye.y, e.z - eye.z);
      const dist = v.length();
      if (dist > 3) continue;
      v.normalize();
      const dot = v.dot(dir);
      if (dot > bestDot) { bestDot = dot; best = e; }
    }
    if (best) {
      this.attackCd = 0.45;
      const killed = damageEnemy(best, dmg);
      this.player.stamina = Math.max(0, this.player.stamina - 4);
      if (held.def?.toolType || held.def?.kind === 'tool') this.inventory.wear(held.stackIndex, 1);
      if (killed) this.onEnemyKilled(best);
    } else {
      this.handleMining(0.016);
    }
  }

  private onEnemyKilled(e: Enemy): void {
    this.stats.kills++;
    for (const drop of e.drop) this.spawnDrop(drop.id, drop.count, e.x, e.y + 0.5, e.z);
    this.ui.toast(`击败 ${ENEMY_DEFS[e.kind].name}`, 'good', 1200);
  }

  // ---------- 交互对象（门、箱、工作台提示、遗迹、塔、核心） ----------
  private tryInteract(x: number, y: number, z: number, id: number): boolean {
    const key = World.blockKey(x, y, z);
    if (id === BlockId.Door) {
      if (this.world.doorOpen.has(key)) this.world.doorOpen.delete(key);
      else this.world.doorOpen.add(key);
      this.world.getChunk(Math.floor(x / 16), Math.floor(z / 16)).dirty = true;
      this.ui.toast(this.world.doorOpen.has(key) ? '门已打开' : '门已关闭', '', 900);
      return true;
    }
    if (id === BlockId.Chest) {
      this.openChest(key);
      return true;
    }
    if (id === BlockId.Workbench) {
      this.openInventory();
      return true;
    }
    if (id === BlockId.TowerPart || id === BlockId.EnergyCell) {
      this.tryRepairTower();
      return true;
    }
    if (id === BlockId.Observatory || id === BlockId.RuinMetal) {
      this.trySearchObservatory(x, y, z);
      return true;
    }
    if (id === BlockId.CoreBlock) {
      this.tryActivateCore();
      return true;
    }
    return false;
  }

  private openChest(key: string): void {
    document.exitPointerLock?.();
    this.containerOpen = true;
    this.currentChestKey = key;
    if (!this.chests.has(key)) {
      this.chests.set(key, { key, slots: new Array(18).fill(null) });
      // 观测站宝箱初始含坐标盘（仅一次）
      const pos = key.split('|').map(Number);
      const obs = this.world.findSite('observatory');
      if (obs && Math.abs(pos[0] - (obs.x - 1)) <= 2 && Math.abs(pos[2] - obs.z) <= 3) {
        const chest = this.chests.get(key)!;
        chest.slots[0] = { id: 'ley_coords', count: 1 };
        chest.slots[1] = { id: 'ration_paste', count: 2 };
      }
    }
    this.ui.show('chest-screen');
    this.ui.renderChest(this.chests.get(key)!.slots, this.inventory);
    // 频繁使用储物箱回收物资 → 机动回收路线（第二条路线：较少建筑、更依赖搜刮）
    if (this.quest.stage <= 2) {
      this.quest.route = 'salvage';
      this.quest.preparationScore += 1;
    }
  }

  private transferChest(which: 'chest' | 'inv', index: number): void {
    const key = this.currentChestKey;
    if (!key) return;
    const chest = this.chests.get(key)!;
    if (which === 'chest') {
      const s = chest.slots[index];
      if (s) {
        const left = this.inventory.add(s.id, s.count, s.durability);
        if (left <= 0) chest.slots[index] = null;
        else s.count = left;
      }
    } else {
      const s = this.inventory.slots[index];
      if (!s) return;
      const empty = chest.slots.findIndex((x) => x === null);
      if (empty < 0) { this.ui.toast('储物箱已满', 'warn'); return; }
      chest.slots[empty] = { id: s.id, count: s.count, durability: s.durability };
      this.inventory.dropAll(index);
    }
    this.ui.renderChest(chest.slots, this.inventory);
    this.refreshHotbar();
  }

  private tryRepairTower(): void {
    if (this.quest.stage < 3) { this.ui.toast('先取得能源晶体，再来修复能源塔。', 'warn'); return; }
    const tower = this.world.findSite('tower')!;
    if (tower.repaired) { this.ui.toast('能源塔已经修复。', ''); return; }
    if (this.inventory.countOf('tower_kit') < 1) {
      this.ui.toast('需要在工作台制作「塔体修复件」。', 'warn'); return;
    }
    this.inventory.remove('tower_kit', 1);
    tower.repaired = true;
    setStage(this.quest, 4);
    this.quest.preparationScore += 4;
    // 在塔顶点亮能源方块
    const topY = this.world.topSolidY(tower.x, tower.z) + 1;
    this.world.setBlock(tower.x, topY + 5, tower.z, BlockId.EnergyCell);
    this.logEvent('energy_tower', '废弃能源塔被成功修复并重新点亮。');
    this.ui.toast('任务完成：废弃能源塔已修复！', 'quest', 4000);
    this.checkQuestProgress();
  }

  private trySearchObservatory(x: number, y: number, z: number): void {
    const obs = this.world.findSite('observatory')!;
    const near = Math.hypot(x - obs.x, z - obs.z) < 5;
    if (!near) { this.ui.toast('一块锈蚀的旧时代构件。', ''); return; }
    if (this.quest.stage < 4) { this.ui.toast('观测站大门紧锁——先修复能源塔恢复电力。', 'warn'); return; }
    if (hasFlag(this.quest, 'obs')) { this.ui.toast('观测站数据已经取走。', ''); return; }
    if (this.inventory.countOf('ley_coords') > 0 || this.chestHasCoords()) {
      advance(this.quest, 'obs');
      setStage(this.quest, 5);
      this.ui.toast('取得地脉坐标盘！下一步制作地脉探测器。', 'quest', 4200);
      this.checkQuestProgress();
    } else {
      this.ui.toast('观测站内有一个储物箱，里面似乎存放着坐标盘。', 'warn', 2500);
    }
    void y;
  }

  private chestHasCoords(): boolean {
    for (const c of this.chests.values()) if (c.slots.some((s) => s?.id === 'ley_coords')) return true;
    return false;
  }

  private tryActivateCore(): void {
    if (this.quest.stage < 6) { this.ui.toast('需要先制作地脉探测器才能安全启动核心。', 'warn'); return; }
    const core = this.world.findSite('core')!;
    if (core.active) { this.ui.toast('核心已经启动，坚守能源塔！', 'warn'); return; }
    if (this.inventory.countOf('signal_chip') < 1) { this.ui.toast('需要携带信号传输芯片才能开始传输。', 'warn'); return; }
    core.active = true;
    this.finalActive = true;
    this.finalWave = 0;
    this.finalWaveTimer = 2;
    setStage(this.quest, 7);
    this.ui.toast('地脉核心启动！最终防御战开始——保护能源塔！', 'quest', 5000);
    this.logEvent('final', '地脉核心启动，信号传输开始，能量波动引来了敌人。');
  }

  private logEvent(kind: string, detail: string): void {
    this.events.push({ kind: kind as GameEvent['kind'], title: detail, detail, time: this.stats.playTime, timed: false });
  }

  // ---------- 任务推进检测 ----------
  private checkQuestProgress(): void {
    const q = this.quest;
    const has = (id: string) => this.inventory.countOf(id) > 0 || [...this.chests.values()].some((c) => c.slots.some((s) => s?.id === id));
    if (q.stage === 0 && this.stats.mined >= 3) {
      setStage(q, 1);
      this.ui.toast('任务：制作基础采集工具（按 E）', 'quest', 4000);
    }
    if (q.stage === 1 && has('axe_t1') && has('hammer_t1')) {
      setStage(q, 2);
      this.player.spawnX = this.player.x; this.player.spawnY = this.player.y; this.player.spawnZ = this.player.z;
      this.ui.toast('任务：建立据点（工作台+火盆+储物箱）', 'quest', 4000);
    }
    if (q.stage === 2) {
      const placed = (id: number) => this.countNearby(id, 12) > 0;
      if (placed(BlockId.Workbench) && placed(BlockId.Brazier) && placed(BlockId.Chest)) {
        setStage(q, 3);
        q.preparationScore += 3;
        this.ui.toast('据点建立完成！向下挖掘，寻找地下晶洞。', 'quest', 4200);
      }
    }
    if (q.stage === 3 && has('crystal')) {
      setStage(q, 4);
      this.ui.toast('取得能源晶体！制作塔体修复件并修复能源塔。', 'quest', 4200);
    }
    if (q.stage === 5 && has('ley_coords')) {
      setStage(q, 6);
      this.ui.toast('坐标数据已解析！在工作台制作地脉探测器。', 'quest', 4200);
    }
    if (q.stage === 6 && has('ley_detector')) {
      setStage(q, 7);
      this.ui.toast('探测器就绪：跟随指引前往地脉核心（边缘方向的能量场）。', 'quest', 4200);
    }
    this.ui.setObjective(q.stage);
  }

  private updateFinalWave(dt: number): void {
    if (!this.finalActive) return;
    this.finalWaveTimer -= dt;
    const tower = this.world.findSite('tower')!;
    if (this.finalWaveTimer <= 0 && this.finalWave < 3) {
      this.finalWave++;
      this.finalWaveTimer = 35;
      const kinds: EnemyKind[] = ['duststalker', 'cavemaw', 'ruinsentinel'];
      const n = 2 + this.finalWave * 2;
      for (let i = 0; i < n; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const x = tower.x + Math.cos(a) * 14;
        const z = tower.z + Math.sin(a) * 14;
        const y = this.world.topSolidY(Math.round(x), Math.round(z)) + 1;
        this.enemies.push(spawnEnemy(kinds[this.finalWave - 1], x, y, z));
      }
      this.ui.toast(`第 ${this.finalWave}/3 波敌人来袭！`, 'warn', 4000);
    }
    // 判定完成：3 波清完且在塔附近
    if (this.finalWave >= 3 && !this.enemies.some((e) => e.state !== 'dead')) {
      const dist = Math.hypot(this.player.x - tower.x, this.player.z - tower.z);
      if (dist < 12) this.finishGame(true);
    }
    // 塔被判定失守（玩家长时间远离且敌人贴近塔基）
    if (this.stats.playTime > 0 && this.enemies.some((e) => e.state !== 'dead' && Math.hypot(e.x - tower.x, e.z - tower.z) < 2)) {
      if (!tower.repaired) this.finishGame(false);
    }
  }

  // 测试/调试：跳至最终战胜利
  debugForceFinalVictory(): void {
    this.finalActive = true;
    this.finalWave = 3;
    this.finalWaveTimer = 999;
    this.enemies = [];
    const tower = this.world.findSite('tower')!;
    this.player.x = tower.x + 2; this.player.z = tower.z + 2;
    this.player.y = this.world.topSolidY(tower.x + 2, tower.z + 2) + 1;
    this.updateFinalWave(0.1);
  }

  private finishGame(success: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.finalActive = false;
    document.exitPointerLock?.();
    const rank = endingRank(this.quest, { buildings: this.stats.buildings, kills: this.stats.kills, daysSurvived: this.env.day });
    if (success) {
      setStage(this.quest, 8);
      this.ui.show('ending-screen');
      document.getElementById('ending-title')!.textContent = `${rank.title}（评级 ${rank.rank}）`;
      document.getElementById('ending-text')!.textContent = rank.text;
    } else {
      document.getElementById('ending-title')!.textContent = '能源塔失守';
      document.getElementById('ending-text')!.textContent = '敌人摧毁了尚未稳固的能源塔，信号中断了。但荒原仍有机会——带着经验重新开始吧。';
    }
    document.getElementById('ending-stats')!.innerHTML = `
      <div>生存时间：第 ${this.env.day} 天（${Math.round(this.stats.playTime / 60)} 分钟）</div>
      <div>建造方块：${this.stats.buildings}</div>
      <div>采集资源：${this.stats.mined}</div>
      <div>击败敌人：${this.stats.kills}</div>
      <div>任务阶段：${success ? '全部完成' : this.quest.stage + '/9'}</div>
      <div>路线：${this.quest.route === 'fortify' ? '重防据守' : '机动回收'}</div>`;
    try { this.doSave(); } catch { /* ignore */ }
  }

  // ---------- 动态事件 ----------
  private maybeRollEvent(dt: number): void {
    this.eventTimer -= dt;
    if (this.eventTimer > 0) return;
    this.eventTimer = this.rng.range(55, 90);
    const kind = rollEvent(this.rng, this.env.day);
    const p = this.player;
    switch (kind) {
      case 'depletion': {
        // 资源枯竭：把附近若干地表资源点标记为空气（真实移除）
        let removed = 0;
        for (let i = 0; i < 8; i++) {
          const x = Math.round(p.x + this.rng.range(-12, 12));
          const z = Math.round(p.z + this.rng.range(-12, 12));
          const y = this.world.topSolidY(x, z) + 1;
          const id = this.world.getBlock(x, y, z);
          if (id === BlockId.FiberPlant || id === BlockId.Gravel || id === BlockId.OreScrap) {
            this.world.setBlock(x, y, z, BlockId.Air); removed++;
          }
        }
        this.events.push(makeEvent(kind, this.stats.playTime, `附近 ${removed} 处资源点因过度开采而枯竭。`));
        this.ui.toast('事件：资源枯竭——附近采集点减少', 'warn');
        break;
      }
      case 'weather_shift': {
        const w: Weather[] = ['storm', 'sandstorm', 'cold'];
        const pick = w[this.rng.int(0, 2)];
        setWeather(this.env, pick, this.rng.range(40, 70));
        this.events.push(makeEvent(kind, this.stats.playTime, `天气突变为「${WEATHER_INFO[pick].name}」。`));
        this.ui.toast(`事件：天气突变——${WEATHER_INFO[pick].name}`, 'warn');
        break;
      }
      case 'cave_in': {
        if (p.y < 24) {
          const eff = caveCollapse(this.world, this.rng, p.x, p.z);
          this.events.push(makeEvent(kind, this.stats.playTime, eff.message, true, 20));
          this.ui.toast('事件：' + eff.message, 'warn');
        } else this.eventTimer = 20;
        break;
      }
      case 'energy_leak': {
        const eff = energyLeak(this.world, this.rng, p.x, p.z);
        this.events.push(makeEvent(kind, this.stats.playTime, eff.message, true, 15));
        this.ui.toast('事件：' + eff.message, 'warn');
        break;
      }
      case 'caravan': {
        // 商旅：直接在玩家附近掉落补给箱式物品
        const goods = ['ration_paste', 'warm_drink', 'metal', 'ruin_metal'];
        const g = goods[this.rng.int(0, goods.length - 1)];
        const n = this.rng.int(1, 3);
        const left = this.inventory.add(g, n);
        if (left > 0) this.dropped.push({ id: g, count: left, x: p.x + 2, y: p.y + 1, z: p.z + 2, born: performance.now() });
        this.events.push(makeEvent(kind, this.stats.playTime, `游荡商旅留下了 ${n} 个${getItem(g)!.name}。`));
        this.ui.toast('事件：商旅出现，留下了补给！', 'good');
        break;
      }
      case 'ruin_trap': {
        // 遗迹机关：附近生成哨卫
        if (this.nearBlock(BlockId.Rubble) || this.nearBlock(BlockId.Observatory) || this.nearBlock(BlockId.TowerPart)) {
          const pos = pickSpawnPosition(this.world, this.rng, p.x, p.z, p.y < 24);
          if (pos) this.enemies.push(spawnEnemy('ruinsentinel', pos.x, pos.y, pos.z));
          this.events.push(makeEvent(kind, this.stats.playTime, '旧时代机关启动，一名遗迹哨卫被唤醒！', true, 30));
          this.ui.toast('事件：遗迹机关启动！', 'warn');
        } else this.eventTimer = 25;
        break;
      }
      case 'migration': {
        const eff = migrationEffect(this.env.day);
        for (const sp of eff.spawnEnemies!) {
          for (let i = 0; i < sp.n; i++) {
            const pos = pickSpawnPosition(this.world, this.rng, p.x, p.z, false);
            if (pos) this.enemies.push(spawnEnemy(sp.kind, pos.x, pos.y, pos.z));
          }
        }
        this.events.push(makeEvent(kind, this.stats.playTime, eff.message));
        this.ui.toast('事件：敌人迁徙，野外变得危险', 'warn');
        break;
      }
      case 'raid': {
        if (this.quest.stage >= 2) {
          const n = 2 + Math.min(4, this.env.day);
          const eff = raidEffect(n);
          const base = { x: this.player.spawnX, z: this.player.spawnZ };
          for (let i = 0; i < n; i++) {
            const a = this.rng.range(0, Math.PI * 2);
            const x = base.x + Math.cos(a) * 16, z = base.z + Math.sin(a) * 16;
            const y = this.world.topSolidY(Math.round(x), Math.round(z)) + 1;
            this.enemies.push(spawnEnemy('duststalker', x, y, z));
          }
          this.events.push(makeEvent(kind, this.stats.playTime, eff.message, true, 60));
          this.ui.toast('事件：据点遭袭！', 'warn', 4000);
        } else this.eventTimer = 30;
        break;
      }
    }
  }

  // ---------- 敌人生成 ----------
  private updateSpawning(dt: number): void {
    this.enemyTimer -= dt;
    if (this.enemyTimer > 0) return;
    this.enemyTimer = isNight(this.env.time) ? this.rng.range(6, 12) : this.rng.range(14, 22);
    const alive = this.enemies.filter((e) => e.state !== 'dead').length;
    const cap = isNight(this.env.time) ? 10 : 5;
    if (alive >= cap) return;
    const night = isNight(this.env.time);
    const underground = this.player.y < 20;
    const pos = pickSpawnPosition(this.world, this.rng, this.player.x, this.player.z, underground);
    if (!pos) return;
    let kind: EnemyKind;
    const r = this.rng.next();
    if (underground) kind = r < 0.7 ? 'cavemaw' : 'duststalker';
    else if (night) kind = r < 0.4 ? 'ruinsentinel' : r < 0.7 ? 'duststalker' : 'cavemaw';
    else kind = r < 0.85 ? 'duststalker' : 'cavemaw';
    const def = ENEMY_DEFS[kind];
    if (def.nightOnly && !night && !underground) return;
    // 高难度随天数提升
    this.enemies.push(spawnEnemy(kind, pos.x, pos.y, pos.z));
  }

  private updateEnemies(dt: number): void {
    const night = isNight(this.env.time);
    const wInfo = WEATHER_INFO[this.env.weather];
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.state === 'dead') {
        // 死亡后短暂由渲染淡出，下一帧移除（掉落已在 onEnemyKilled 产生）
        if (e.hurtFlash < -0.3) this.enemies.splice(i, 1);
        continue;
      }
      const res = updateEnemy(e, this.world, this.player, dt, night, wInfo.danger);
      if (res.damageToPlayer > 0) {
        const armor = this.equippedArmor();
        const r = damagePlayer(this.player, res.damageToPlayer, armor, `被${ENEMY_DEFS[e.kind].name}击倒`);
        this.ui.flashHurt();
        if (r.died) this.onDeath(r.cause);
      }
      // 找不到玩家（玩家躲在封闭建筑内）时攻击附近建筑
      this.enemyDamageBuildings(e, dt);
      // 距离过远则回收
      if (Math.hypot(e.x - this.player.x, e.z - this.player.z) > 90) this.enemies.splice(i, 1);
    }
  }

  private enemyDamageBuildings(e: Enemy, dt: number): void {
    if (e.state === 'patrol' || e.state === 'return') return;
    if (Math.floor(performance.now() / 800 + e.id) !== Math.floor((performance.now() - dt * 1000) / 800 + e.id)) {
      const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) for (let dz = -1; dz <= 1; dz++) {
        const x = bx + dx, y = by + dy, z = bz + dz;
        const id = this.world.getBlock(x, y, z);
        const def = BLOCKS[id];
        if (!def.building) continue;
        const key = World.blockKey(x, y, z);
        const hp = (this.world.buildingHp.get(key) ?? def.buildingHp ?? 60) - 12;
        if (hp <= 0) {
          this.world.setBlock(x, y, z, BlockId.Air);
          this.world.buildingHp.delete(key);
          this.stats.buildings = Math.max(0, this.stats.buildings - 1);
          if (Math.hypot(x - this.player.x, z - this.player.z) < 16) this.ui.toast(`你的${def.name}被敌人摧毁了！`, 'warn');
        } else {
          this.world.buildingHp.set(key, hp);
        }
        return;
      }
    }
  }

  private equippedArmor(): number {
    for (const s of this.inventory.slots) {
      if (!s) continue;
      const d = getItem(s.id);
      if (d?.kind === 'equip') return d.armor ?? 0;
    }
    return 0;
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= 9.8 * dt;
      p.life -= dt;
      let hitSomething = false;
      if (BLOCKS[this.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))]?.solid) hitSomething = true;
      for (const e of this.enemies) {
        if (e.state === 'dead') continue;
        if (Math.hypot(e.x - p.x, (e.y + 0.8) - p.y, e.z - p.z) < 0.9) {
          const killed = damageEnemy(e, 30);
          if (killed) this.onEnemyKilled(e);
          hitSomething = true;
          break;
        }
      }
      if (hitSomething || p.life <= 0 || p.y < 0) this.projectiles.splice(i, 1);
    }
  }

  private onDeath(cause: string): void {
    this.player.alive = false;
    this.paused = true;
    document.exitPointerLock?.();
    // 掉落规则
    let lossText = '你保留了所有物品。';
    const drops: string[] = [];
    if (this.settings.deathDrop !== 'none') {
      const stacks: { idx: number; stack: NonNullable<Inventory['slots'][number]> }[] = [];
      this.inventory.slots.forEach((s, idx) => { if (s) stacks.push({ idx, stack: s }); });
      const shouldDrop = this.settings.deathDrop === 'all' ? () => true : () => this.rng.chance(0.5);
      for (const entry of stacks) {
        if (shouldDrop()) {
          drops.push(`${getItem(entry.stack.id)!.name} x${entry.stack.count}`);
          this.dropped.push({ id: entry.stack.id, count: entry.stack.count, x: this.player.x, y: this.player.y + 0.5, z: this.player.z, born: performance.now() });
          this.inventory.dropAll(entry.idx);
        }
      }
      lossText = drops.length ? '散落物品：' + drops.join('、') : '幸运的是你没有散落物品。';
    }
    this.ui.showDeath(cause, lossText);
  }

  respawn(): void {
    this.ui.hide('death-screen');
    this.player.alive = true;
    this.player.hp = 80; this.player.stamina = 60; this.player.food = Math.max(40, this.player.food);
    this.player.temperature = 36; this.player.safety = 60;
    this.player.x = this.player.spawnX; this.player.y = this.player.spawnY + 0.2; this.player.z = this.player.spawnZ;
    this.player.vx = 0; this.player.vy = 0; this.player.vz = 0;
    this.enemies = this.enemies.filter((e) => Math.hypot(e.x - this.player.x, e.z - this.player.z) > 30);
    this.requestLock();
  }

  // ---------- 主循环 ----------
  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.05);

    if (this.mode === 'play' && !this.paused && !this.ended) {
      this.tick(dt);
    }
    this.renderFrame();
  }

  private tick(dt: number): void {
    this.stats.playTime += dt;
    const altitude = this.player.y;
    updateEnvironment(this.env, dt, this.rng, altitude);

    // 玩家移动
    const speedMulTerrain = terrainSpeedMul(this.world, this.player) * WEATHER_INFO[this.env.weather].speedMul;
    let exhaustion = 0;
    if (this.player.alive) {
      const r = updatePlayerPhysics(this.player, this.world, this.input, dt, speedMulTerrain);
      exhaustion = r.exhaustion;
      if (this.mouseDown[0]) this.handleMining(dt);
    }
    this.attackCd = Math.max(0, this.attackCd - dt);

    // 环境检测
    const nearBrazier = this.nearBlock(BlockId.Brazier, 6);
    const nearLamp = this.nearBlock(BlockId.GlowLamp, 7) || this.nearBlock(BlockId.Crystal, 5) || this.nearBlock(BlockId.EnergyCell, 6);
    const indoors = this.isIndoors();
    const sky = this.player.y > this.world.heightAt(Math.floor(this.player.x), Math.floor(this.player.z)) - 2 ? 1 : 0.2;
    const day = this.env.time >= 6 && this.env.time <= 18 ? 1 : 0.08;
    const light = lightLevelAt(this.world, Math.floor(this.player.x), Math.floor(this.player.y + 1), Math.floor(this.player.z), sky * day);

    // 手持照明
    const held = this.held();
    const handLight = held?.def?.toolType === 'light' ? 0.8 : 0;
    this.scene.updatePlayerLight(this.eyePosition(), handLight * 2);

    const surv = updateSurvival(this.player, this.env, this.world, dt, {
      exhaustion,
      nearBrazier, nearLamp, indoors,
      armorWarmth: this.inventory.findItem('fiber_armor') >= 0 ? 2 : this.inventory.findItem('metal_armor') >= 0 ? 0 : 0,
      lightLevel: Math.max(light, handLight),
    });
    if (surv.died) this.onDeath(surv.cause);

    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateSpawning(dt);
    this.pickupDrops(dt);
    this.maybeRollEvent(dt);
    this.updateFinalWave(dt);
    this.checkQuestProgress();

    // 区块流式加载
    const radius = this.settings.renderDistance;
    const pcx = Math.floor(this.player.x / 16), pcz = Math.floor(this.player.z / 16);
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      this.world.getChunk(pcx + dx, pcz + dz);
    }
    this.world.unloadFar(this.player.x, this.player.z, radius + 1);
    this.scene.updateChunks(this.world, this.player.x, this.player.z, radius, 2);

    // 相机
    const eye = this.eyePosition();
    this.scene.camera.position.copy(eye);
    const dir = this.lookVector();
    this.scene.camera.lookAt(eye.x + dir.x, eye.y + dir.y, eye.z + dir.z);

    // HUD
    this.ui.setBars(this.player);
    const h = this.world.heightAt(Math.floor(this.player.x), Math.floor(this.player.z));
    const biome = this.world.biomeAt(Math.floor(this.player.x), Math.floor(this.player.z), h);
    const biomeNames: Record<string, string> = { grass: '荒原草地', rock: '灰岩地带', sand: '流沙荒漠', highland: '高岭高地', water: '水域', peak: '霜结峰顶' };
    this.ui.setEnv(this.env, biomeNames[biome] + this.detectorGuide());

    // 高亮目标方块
    const hit = raycastVoxel(this.world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
    if (hit && !this.mouseDown[0]) {
      const bp = BLOCKS[hit.id];
      const placeable = held?.def?.kind === 'block';
      this.scene.showHighlight(hit.x, hit.y, hit.z, placeable || bp?.hardness < 90);
    } else if (!hit) {
      this.scene.hideHighlight();
    }

    this.entities.syncEnemies(this.enemies);
    this.entities.syncItems(this.dropped, performance.now());
    this.projs.sync(this.projectiles.map((p) => ({ x: p.x, y: p.y, z: p.z, id: p.id })));

    // 自动保存（每 60 秒）
    if (Math.floor(this.stats.playTime / 60) !== Math.floor((this.stats.playTime - dt) / 60)) {
      try { this.doSave(); } catch { /* ignore */ }
    }
  }

  private isIndoors(): boolean {
    const x = Math.floor(this.player.x), y = Math.floor(this.player.y), z = Math.floor(this.player.z);
    let walls = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (BLOCKS[this.world.getBlock(x + dx, y, z + dz)]?.solid) walls++;
    }
    const above = this.world.getBlock(x, y + 2, z);
    return walls >= 2 || BLOCKS[above]?.building === true;
  }

  private detectorGuide(): string {
    if (this.quest.stage < 3) return '';
    let target: SpecialSite | undefined;
    if (this.quest.stage === 3) target = this.world.findSite('geode');
    else if (this.quest.stage === 4) target = this.world.findSite('tower');
    else if (this.quest.stage === 5 || this.quest.stage === 6) target = this.world.findSite('observatory');
    else if (this.quest.stage === 7) target = this.world.findSite('core');
    else if (this.finalActive) target = this.world.findSite('tower');
    if (!target) return '';
    const d = Math.hypot(target.x - this.player.x, target.z - this.player.z);
    const ang = Math.atan2(target.x - this.player.x, target.z - this.player.z);
    let rel = ang - this.player.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const idx = Math.round(((rel + Math.PI) / (Math.PI * 2)) * 8) % 8;
    const name = target.kind === 'geode' ? '晶洞' : target.kind === 'tower' ? '能源塔' : target.kind === 'observatory' ? '观测站' : '地脉核心';
    return `｜${this.inventory.countOf('ley_detector') > 0 || this.quest.stage <= 4 ? '◈' : '◈'} ${name} ${dirs[(idx + 2) % 8]} ${Math.round(d)}m`;
  }

  private renderFrame(): void {
    this.scene.updateSky(this.env, this.player.x, this.player.y, this.player.z, this.world);
    this.scene.render();
  }
}
