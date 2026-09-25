// Top-level game controller: ties world, physics, survival, combat, UI and save together.

import * as THREE from 'three';
import { World, SITES, keyOf, SEA_LEVEL } from './world';
import { B, blockDef } from './blocks';
import { Rng, hashSeed } from './rng';
import { createBody, movePlayer, raycastVoxel, RayHit, PlayerBody } from './physics';
import { Inventory, HOTBAR_SIZE } from './inventory';
import { itemDef } from './items';
import {
  createSurvival,
  createEnvironment,
  updateSurvival,
  updateEnvironment,
  isNight,
  WEATHER_INFO,
  applyDamage,
  eatFood,
  movementScale,
  miningScale,
  SurvivalState,
  EnvironmentState
} from './survival';
import { Enemy, EnemyUpdateResult, damageEnemy, spawnTick, spawnEnemy, updateEnemy } from './enemies';
import {
  canPlaceAt,
  placeBlock,
  miningTime,
  breakBlock,
  updateDrops,
  collectDrops,
  createProjectile,
  updateProjectile,
  Projectile,
  REACH
} from './actions';
import { craft, CraftContext } from './crafting';
import { RECIPES } from './recipes';
import { createQuestProgress, QuestProgress, advanceQuest, evaluateEnding } from './quests';
import { GameEvent, triggerEvent, pickEvent } from './events';
import {
  GameSave,
  GameStats,
  emptyStats,
  hasSave,
  listSlots,
  SlotId,
  AUTO_SLOT_ID,
  saveToSlot,
  loadSlot,
  deleteSlot,
  firstEmptyManualSlot,
  migrateLegacySave,
  clearAllSaves,
  clearSave,
  readCurrentSlot,
  writeCurrentSlot,
  slotLabel
} from './save';
import { GameRenderer } from '../render/renderer';
import {
  buildHud,
  HudRefs,
  renderHotbar,
  renderStats,
  renderTopInfo,
  renderQuest,
  showEventBanner,
  flashDamage,
  toast,
  timeLabel
} from '../ui/ui';
import {
  showMainMenu,
  showSettings,
  showError,
  confirmRestart,
  showSaveSlotPicker,
  RECOMMENDED_SEED,
  Settings
} from '../ui/ui-dom';
import {
  showPause,
  hidePause,
  showDeath,
  showEnding,
  showLog,
  showInventory,
  showCrafting,
  showContainer
} from '../ui/panels';

type Mode = 'menu' | 'playing' | 'paused' | 'dead' | 'ended';

const DEFAULT_SETTINGS: Settings = {
  renderDistance: 4,
  shadows: true,
  keepItemsOnDeath: true,
  mouseSensitivity: 1
};

export class GameEngine {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  renderer: GameRenderer;
  hud!: HudRefs;
  world!: World;
  body!: PlayerBody;
  inventory = new Inventory();
  survival: SurvivalState = createSurvival();
  environment: EnvironmentState = createEnvironment();
  quest: QuestProgress = createQuestProgress();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  events: GameEvent[] = [];
  stats: GameStats = emptyStats();
  rng = new Rng(Date.now());
  mode: Mode = 'menu';
  yaw = 0;
  pitch = 0;
  keys = new Set<string>();
  mouseDown: Record<number, boolean> = {};
  playTime = 0;
  eventTimer = 75;
  leakActive = false;
  migrationActive = 0;
  finalRaid = false;
  finalTimer = 0;
  corePlaced = false;
  towerRepaired = false;
  settings: Settings = { ...DEFAULT_SETTINGS };
  placedBlockIds = new Set<number>();
  mining: { hit: RayHit; progress: number; total: number } | null = null;
  leftCooldown = 0;
  rightCooldown = 0;
  interactCooldown = 0;
  activeContainer: { key: string; slots: (import('./inventory').ItemStack | null)[] } | null = null;
  autosaveTimer = 0;
  lastChunkCheck = 0;
  spawnPoint = { x: 0.5, y: 40, z: 0.5 };
  damageFlashQueue = 0;
  currentSlot: SlotId | null = null;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.uiRoot = document.getElementById('ui') as HTMLElement;
    this.renderer = new GameRenderer(this.canvas);
    this.currentSlot = readCurrentSlot();
    this.loadSettings();
    this.bindEvents();
    this.hud = buildHud(this.uiRoot);
    this.showMenu();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem('wasteland-grids-settings');
      if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    this.renderer.renderer.shadowMap.enabled = this.settings.shadows;
  }

  saveSettings() {
    localStorage.setItem('wasteland-grids-settings', JSON.stringify(this.settings));
  }

  // ---------- menu / lifecycle ----------
  showMenu() {
    this.mode = 'menu';
    document.exitPointerLock?.();
    showMainMenu(this.uiRoot, {
      slots: listSlots(),
      legacy: hasSave(),
      currentSlot: this.currentSlot
    }, {
      start: (seed, route) => this.startNew(seed, route),
      continueGame: () => this.continueSave(),
      settings: () =>
        showSettings(this.uiRoot, this.settings, (s) => {
          this.settings = s;
          this.saveSettings();
        }, () => this.showMenu()),
      loadSlot: (id) => this.loadFromSlot(id),
      deleteSlot: (id) => {
        deleteSlot(id);
        if (this.currentSlot === id) this.setCurrentSlot(null);
        this.showMenu();
      },
      continueLegacy: () => this.continueLegacy()
    });
  }

  setCurrentSlot(id: SlotId | null) {
    this.currentSlot = id;
    writeCurrentSlot(id);
  }

  // ---------- main update ----------
  update(dt: number) {
    if (this.mode !== 'playing' || !this.body) return;
    this.playTime += dt;

    // movement
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const info = WEATHER_INFO[this.environment.weather];
    const speedScale = movementScale(this.survival, info.speedScale);
    const move = movePlayer(
      this.world,
      this.body,
      {
        forward,
        strafe,
        yaw: this.yaw,
        jump: this.keys.has('Space'),
        sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
        crouch: this.keys.has('ControlLeft') || this.keys.has('ControlRight')
      },
      dt,
      speedScale
    );
    this.survival.stamina = Math.max(0, this.survival.stamina - move.staminaCost);

    // projectiles (right button throws when dart selected; also allow left for darts)
    if (this.mouseDown[0]) {
      const sel = this.inventory.selected();
      if (sel && itemDef(sel.id).kind === 'projectile') this.throwDart();
    }
    for (const p of [...this.projectiles]) {
      const r = updateProjectile(this.world, p, dt, this.enemies);
      if (r) {
        if (r !== 'wall') {
          const e = this.enemies.find((x) => x.uid === r.uid);
          if (e) {
            const res: EnemyUpdateResult = { damageToPlayer: 0, killed: [] };
            damageEnemy(this.world, e, p.damage, this.rng, res, performance.now());
            this.stats.damageDealt += p.damage;
            if (e.state === 'dead') this.stats.enemiesKilled++;
          }
        }
        this.projectiles = this.projectiles.filter((x) => x !== p);
      }
    }

    // mouse actions
    this.handleMouseActions(dt);

    // enemies
    const night = isNight(this.environment);
    const shelter = this.inShelter();
    const enemyResult: EnemyUpdateResult = { damageToPlayer: 0, killed: [] };
    for (const e of this.enemies) {
      updateEnemy(
        this.world,
        e,
        { x: this.body.x, y: this.body.y, z: this.body.z, inShelter: shelter },
        { night, weatherDanger: info.danger, dt, rng: this.rng },
        enemyResult
      );
    }
    this.enemies = this.enemies.filter((e) => e.state !== 'dead');
    if (enemyResult.damageToPlayer > 0) {
      const defense = this.inventory.armor ? itemDef(this.inventory.armor.id).defense ?? 0 : 0;
      const taken = applyDamage(this.survival, enemyResult.damageToPlayer, defense, '被敌对生物击倒');
      this.stats.damageTaken += taken;
      this.damageFlashQueue = 1;
    }

    // spawning
    this.spawnAcc = (this.spawnAcc ?? 0) + dt;
    if (this.spawnAcc > 4) {
      this.spawnAcc = 0;
      const cap = night ? 10 : 5;
      spawnTick(this.world, this.enemies, this.body.x, this.body.y, this.body.z, night, this.rng, cap + (this.migrationActive > 0 ? 4 : 0));
    }

    // drops
    updateDrops(this.world, dt, performance.now());
    const dropsBefore = this.world.drops.length;
    const picked = collectDrops(this.world, this.inventory, this.body.x, this.body.y, this.body.z);
    if (picked > 0) this.stats.resourcesGathered += dropsBefore - this.world.drops.length;

    // environment + survival
    const changedWeather = updateEnvironment(this.environment, dt, () => this.rng.next());
    if (changedWeather) {
      this.events.push({
        kind: 'weather_shift',
        title: '天气变化',
        time: this.playTime,
        detail: `天气转为${WEATHER_INFO[changedWeather as keyof typeof WEATHER_INFO]?.name ?? changedWeather}。`
      });
    }
    const light = this.nearLight();
    const sel = this.inventory.selected();
    const hasRod = !!sel && itemDef(sel.id).toolType === 'light';
    const up = updateSurvival(
      this.survival,
      this.environment,
      {
        altitude: Math.floor(this.body.y),
        underground: this.body.y < SEA_LEVEL - 2 && !this.canSeeSky(),
        nearBrazier: light.brazier,
        nearGlow: light.glow,
        hasLightRod: hasRod,
        inShelter: shelter,
        exertion: move.staminaCost
      },
      dt
    );
    if (up.messages.length && !this.survival.alive) this.onDeath();

    // energy leak damage
    if (this.leakActive && this.nearBlock(B.EnergyCell, 5)) {
      applyDamage(this.survival, 3 * dt, 0, '被能源泄漏灼伤');
    }

    // events
    this.eventTimer -= dt;
    this.migrationActive = Math.max(0, this.migrationActive - dt);
    if (this.eventTimer <= 0) {
      this.fireEvent();
      this.eventTimer = 65 + this.rng.next() * 50;
    }

    // final event
    if (this.finalRaid) {
      this.finalTimer -= dt;
      const nearTower = Math.hypot(this.body.x - SITES[2].x, this.body.z - SITES[2].z) < 30;
      if (!nearTower) {
        // players must defend near the tower; core resets slowly if away
        this.finalTimer -= dt * 0.5;
      }
      if (this.finalTimer <= 0) {
        this.finalRaid = false;
        this.inventory.remove('signal_lantern', 1);
        showEventBanner(this.hud, null);
        this.quest.flags['final8'] = true;
        toast(this.uiRoot, '信号传输完成！地脉苏醒了。');
      }
    }

    // quests
    const newly = advanceQuest(this.quest, {
      hasItem: (id, n = 1) => this.inventory.has(id, n),
      placedBlocks: new Set<number>([
        ...this.placedBlockIds,
        ...(this.baseNearby.workbench ? [B.Workbench] : []),
        ...(this.baseNearby.strongbox ? [B.Strongbox] : []),
        ...(this.baseNearby.brazier ? [B.Brazier] : [])
      ]),
      nearSite: (kind, radius = 8) => {
        const s = SITES.find((x) => x.kind === kind);
        return !!s && Math.hypot(this.body.x - s.x, this.body.z - s.z) < radius;
      },
      towerRepaired: this.towerRepaired,
      corePlaced: this.corePlaced && !this.finalRaid,
      finalDefended: !!this.quest.flags['final8']
    });
    if (newly.length) {
      toast(this.uiRoot, `任务推进：${QUESTS_TITLE[this.quest.stage] ?? '新的阶段'}`);
    }
    if (this.quest.finished && this.mode === 'playing') this.finishGame();

    // chunk streaming
    this.lastChunkCheck += dt;
    if (this.lastChunkCheck > 0.4) {
      this.lastChunkCheck = 0;
      this.world.updateLoadedChunks(this.body.x, this.body.z);
    }
    this.refreshBaseNearby();

    // damage vignette
    if (this.damageFlashQueue > 0) {
      flashDamage(this.hud, 0.55);
      this.damageFlashQueue = 0;
    }

    // autosave every 30s
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 30) {
      this.autosaveTimer = 0;
      this.writeSave();
    }

    this.syncHud();
  }

  spawnAcc = 0;

  canSeeSky(): boolean {
    const x = Math.floor(this.body.x);
    const z = Math.floor(this.body.z);
    for (let y = Math.floor(this.body.y) + 2; y < 64; y++) {
      if (this.world.isSolidAt(x, y, z)) return false;
    }
    return true;
  }

  nearestSiteName(): string {
    let best = '';
    let bestD = 12;
    for (const s of SITES) {
      const d = Math.hypot(this.body.x - s.x, this.body.z - s.z);
      if (d < bestD) {
        bestD = d;
        best = s.name;
      }
    }
    return best ? `靠近：${best}` : '';
  }

  syncHud() {
    renderStats(this.hud, this.survival);
    renderTopInfo(this.hud, {
      day: this.environment.day,
      timeLabel: timeLabel(this.environment.time),
      weather: WEATHER_INFO[this.environment.weather].name + (isNight(this.environment) ? ' · 夜晚' : ' · 白天'),
      pos: `${Math.floor(this.body.x)}, ${Math.floor(this.body.y)}, ${Math.floor(this.body.z)}`,
      site: this.nearestSiteName()
    });
    renderQuest(this.hud, this.quest.stage, this.quest.route);
    renderHotbar(this.hud, this.inventory);
  }

  // ---------- render loop ----------
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clockDelta());
    if (this.mode === 'playing' && this.world) {
      this.update(dt);
      // camera
      const [, ey] = [0, this.body.y + this.body.eyeHeight];
      this.renderer.camera.position.set(this.body.x, ey, this.body.z);
      this.renderer.camera.rotation.order = 'YXZ';
      this.renderer.camera.rotation.y = this.yaw;
      this.renderer.camera.rotation.x = this.pitch;
      this.renderer.syncChunks(this.world);
      this.renderer.syncEnemies(this.enemies);
      this.renderer.syncDrops(this.world.drops);
      this.renderer.syncProjectiles(this.projectiles);
      this.renderer.updateSky(this.environment, this.body.x, this.body.y, this.body.z, dt);
    }
    this.renderer.render();
  }

  private lastT = performance.now();
  clockDelta(): number {
    const now = performance.now();
    const dt = (now - this.lastT) / 1000;
    this.lastT = now;
    return dt;
  }

  startNew(seedInput: string, route: 'fortify' | 'salvage') {
    this.setCurrentSlot(null);
    const seed = seedInput || RECOMMENDED_SEED;
    this.world = new World(seed);
    this.rng = new Rng(hashSeed(seed));
    const h = this.world.surfaceHeight(0, 0);
    this.spawnPoint = { x: 0.5, y: h + 2, z: 0.5 };
    this.body = createBody(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
    this.inventory = new Inventory();
    this.survival = createSurvival();
    this.environment = createEnvironment();
    this.quest = createQuestProgress();
    this.quest.route = route;
    this.quest.routeChosen = true;
    this.enemies = [];
    this.projectiles = [];
    this.events = [];
    this.stats = emptyStats();
    this.playTime = 0;
    this.eventTimer = 70;
    this.leakActive = false;
    this.migrationActive = 0;
    this.finalRaid = false;
    this.corePlaced = false;
    this.towerRepaired = false;
    this.placedBlockIds.clear();
    // starting kit: a few basics so the demo flow begins fast
    this.inventory.add('deadwood_log', 2);
    this.inventory.add('bulb_raw', 2);
    this.world.updateLoadedChunks(this.body.x, this.body.z);
    this.enterPlay();
    toast(this.uiRoot, '找到荒原中的临时落脚点，按提示开始采集。');
  }

  continueSave() {
    const slots = listSlots();
    const usable = slots.filter((s) => s.state === 'ok' && s.summary);
    const preferred = usable.find((s) => s.id === this.currentSlot);
    const latest = [...usable].sort((a, b) => (b.summary?.savedAt ?? 0) - (a.summary?.savedAt ?? 0))[0];
    const target = preferred ?? latest;
    if (target) {
      this.loadFromSlot(target.id);
    } else if (hasSave()) {
      this.continueLegacy();
    } else {
      this.showMenu();
    }
  }

  continueLegacy() {
    const target = firstEmptyManualSlot();
    if (!target) {
      showError(this.uiRoot, '检测到旧版存档，但三个手动槽位都已占用。请先删除一个槽位再迁移。', () => this.showMenu(), () => {
        clearAllSaves();
        this.setCurrentSlot(null);
      });
      return;
    }
    const migrated = migrateLegacySave(target);
    if (!migrated.ok) {
      showError(this.uiRoot, migrated.error, () => this.showMenu(), () => {
        clearAllSaves();
        this.setCurrentSlot(null);
      });
      return;
    }
    toast(this.uiRoot, `旧版存档已迁移到${slotLabel(target)}。`);
    this.loadFromSlot(target);
  }

  loadFromSlot(id: SlotId) {
    const result = loadSlot(id);
    if (!result.ok) {
      showError(this.uiRoot, result.error, () => this.showMenu(), () => {
        clearAllSaves();
        this.setCurrentSlot(null);
      });
      return;
    }
    // only touch running state after the slot parsed cleanly
    this.applySave(result.data);
    this.setCurrentSlot(id);
    this.enterPlay();
    toast(this.uiRoot, `已读取${slotLabel(id)}，荒原等你归来。`);
  }

  applySave(d: GameSave) {
    this.world = World.fromSaveData(d.world as never);
    this.rng = new Rng(hashSeed(String(d.seed) + this.playTime));
    this.body = createBody(d.body.x, d.body.y, d.body.z);
    this.yaw = d.body.yaw;
    this.pitch = d.body.pitch;
    this.inventory = Inventory.fromJSON(d.inventory as never);
    this.survival = Object.assign(createSurvival(), d.survival);
    this.environment = Object.assign(createEnvironment(), d.environment);
    this.quest = Object.assign(createQuestProgress(), d.quests);
    this.events = (d.events ?? []) as GameEvent[];
    this.stats = { ...emptyStats(), ...d.stats };
    this.playTime = d.playTime ?? 0;
    this.enemies = [];
    this.projectiles = [];
    this.world.updateLoadedChunks(this.body.x, this.body.z);
  }

  enterPlay() {
    this.uiRoot.querySelectorAll('.screen').forEach((n) => n.remove());
    this.mode = 'playing';
    this.hud.root.style.display = 'block';
    renderHotbar(this.hud, this.inventory);
    this.canvas.requestPointerLock?.();
  }

  restartPrompt() {
    confirmRestart(
      this.uiRoot,
      () => {
        if (this.currentSlot) deleteSlot(this.currentSlot);
        clearSave();
        this.setCurrentSlot(null);
        this.showMenu();
      },
      () => {
        if (this.mode === 'playing') this.canvas.requestPointerLock?.();
      }
    );
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    document.exitPointerLock?.();
    this.showPausePanel();
  }

  showPausePanel() {
    showPause(this.uiRoot, {
      resume: () => this.resume(),
      restart: () => this.restartPrompt(),
      menu: () => {
        this.writeSave();
        this.showMenu();
      },
      save: () => this.openSaveSlotPicker(),
      settings: () =>
        showSettings(
          this.uiRoot,
          this.settings,
          (s) => {
            this.settings = s;
            this.saveSettings();
          },
          () => this.showPausePanel()
        )
    });
  }

  openSaveSlotPicker() {
    hidePause(this.uiRoot);
    showSaveSlotPicker(this.uiRoot, listSlots(), {
      save: (id) => {
        const r = this.saveToManualSlot(id);
        if (r.ok) {
          toast(this.uiRoot, `进度已保存到${slotLabel(id)}。`);
        } else {
          toast(this.uiRoot, '保存失败：' + (r.error ?? '未知错误'), 'bad');
        }
        this.showPausePanel();
      },
      cancel: () => this.showPausePanel()
    });
  }

  resume() {
    hidePause(this.uiRoot);
    this.uiRoot.querySelectorAll('.panel-window').forEach((n) => n.remove());
    this.activeContainer = null;
    this.mode = 'playing';
    this.canvas.requestPointerLock?.();
  }

  buildSaveData(): GameSave {
    return {
      version: 1,
      savedAt: Date.now(),
      playTime: this.playTime,
      seed: this.world.seed,
      body: { x: this.body.x, y: this.body.y, z: this.body.z, yaw: this.yaw, pitch: this.pitch },
      inventory: this.inventory.toJSON(),
      survival: this.survival,
      environment: this.environment,
      world: this.world.toSaveData(),
      quests: this.quest,
      events: this.events,
      stats: this.stats,
      route: this.quest.route
    };
  }

  // autosave / beforeunload / menu-exit all write only the auto slot
  writeSave(): boolean {
    const r = saveToSlot(AUTO_SLOT_ID, this.buildSaveData(), localStorage, 'auto');
    if (!r.ok) toast(this.uiRoot, '保存失败：' + r.error, 'bad');
    return r.ok;
  }

  saveToManualSlot(id: SlotId): { ok: boolean; error?: string } {
    const r = saveToSlot(id, this.buildSaveData(), localStorage, 'manual');
    if (r.ok) this.setCurrentSlot(id);
    return r;
  }

  // ---------- input ----------
  bindEvents() {
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mousedown', (e) => {
      if (this.mode === 'playing' && document.pointerLockElement === this.canvas) {
        this.mouseDown[e.button] = true;
      }
    });
    document.addEventListener('mouseup', (e) => {
      this.mouseDown[e.button] = false;
      if (e.button === 0) this.mining = null;
    });
    document.addEventListener('wheel', (e) => {
      if (this.mode !== 'playing') return;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.inventory.hotbarIndex = (this.inventory.hotbarIndex + dir + HOTBAR_SIZE) % HOTBAR_SIZE;
      renderHotbar(this.hud, this.inventory);
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.mode === 'playing') {
        this.pause();
      }
    });
    window.addEventListener('beforeunload', () => {
      if (this.mode === 'playing') this.writeSave();
    });
  }

  onKey(e: KeyboardEvent, down: boolean) {
    if (down) {
      if (e.code === 'Escape') {
        if (this.mode === 'playing') this.pause();
        return;
      }
      if (this.mode !== 'playing') return;
      this.keys.add(e.code);
      if (e.code >= 'Digit1' && e.code <= 'Digit8') {
        this.inventory.selectHotbar(Number(e.code.slice(5)) - 1);
        renderHotbar(this.hud, this.inventory);
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        this.openInventory();
      }
      if (e.code === 'KeyC') this.openCrafting();
      if (e.code === 'KeyJ') this.toggleLog();
      if (e.code === 'KeyQ') this.dropSelected();
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF') this.repairAction();
    } else {
      this.keys.delete(e.code);
    }
  }

  onMouseMove(e: MouseEvent) {
    if (this.mode !== 'playing' || document.pointerLockElement !== this.canvas) return;
    const sens = 0.0022 * this.settings.mouseSensitivity;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
  }

  eyePosition(): [number, number, number] {
    return [this.body.x, this.body.y + this.body.eyeHeight, this.body.z];
  }

  lookVector(): [number, number, number] {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  targetHit(): RayHit | null {
    const [ox, oy, oz] = this.eyePosition();
    const [dx, dy, dz] = this.lookVector();
    return raycastVoxel(this.world, ox, oy, oz, dx, dy, dz, REACH);
  }

  // ---------- panels ----------
  openInventory() {
    document.exitPointerLock?.();
    showInventory(this.uiRoot, this.inventory, {
      onClose: () => {
        this.uiRoot.querySelector('#inventory-panel')?.remove();
        if (this.mode === 'playing') this.canvas.requestPointerLock?.();
        renderHotbar(this.hud, this.inventory);
      },
      onUse: (slot) => {
        const stack = this.inventory.slots[slot];
        if (!stack) return;
        const d = itemDef(stack.id);
        if (d.kind === 'food') {
          eatFood(this.survival, d);
          this.inventory.remove(stack.id, 1);
          toast(this.uiRoot, `食用了 ${d.name}`);
        } else if (d.kind === 'armor') {
          this.inventory.equip(slot);
        }
        renderHotbar(this.hud, this.inventory);
      },
      onDrop: (slot) => {
        const stack = this.inventory.slots[slot];
        if (!stack) return;
        const dropped = this.inventory.drop(slot, 1);
        if (dropped) {
          this.world.spawnDrop(dropped.id, dropped.count, this.body.x, this.body.y + 1, this.body.z, dropped.durability, performance.now());
        }
      },
      onEquip: (slot) => this.inventory.equip(slot),
      onChange: () => renderHotbar(this.hud, this.inventory)
    });
  }

  openCrafting() {
    document.exitPointerLock?.();
    const ctx: CraftContext = {
      nearWorkbench: this.nearBlock(B.Workbench, 4),
      hasToken: this.inventory.has('relic_token'),
      questStage: this.quest.stage
    };
    showCrafting(this.uiRoot, this.inventory, ctx, {
      craft: (id) => {
        const recipe = RECIPES.find((r) => r.id === id);
        if (!recipe) return '未知配方';
        const result = craft(this.inventory, recipe, ctx);
        if (result.ok) {
          this.stats.crafts++;
          renderHotbar(this.hud, this.inventory);
        }
        return result.message;
      },
      close: () => {
        this.uiRoot.querySelector('#craft-panel')?.remove();
        if (this.mode === 'playing') this.canvas.requestPointerLock?.();
      }
    });
  }

  toggleLog() {
    if (this.uiRoot.querySelector('#log-panel')) {
      this.uiRoot.querySelector('#log-panel')?.remove();
      this.canvas.requestPointerLock?.();
      return;
    }
    document.exitPointerLock?.();
    showLog(this.uiRoot, this.events, () => {
      this.uiRoot.querySelector('#log-panel')?.remove();
      this.canvas.requestPointerLock?.();
    });
  }

  nearBlock(id: number, radius: number): boolean {
    const bx = Math.floor(this.body.x);
    const by = Math.floor(this.body.y);
    const bz = Math.floor(this.body.z);
    for (let x = bx - radius; x <= bx + radius; x++) {
      for (let y = by - radius; y <= by + radius; y++) {
        for (let z = bz - radius; z <= bz + radius; z++) {
          if (this.world.getBlock(x, y, z) === id) return true;
        }
      }
    }
    return false;
  }

  nearLight(): { brazier: boolean; glow: boolean } {
    let brazier = false;
    let glow = false;
    const bx = Math.floor(this.body.x);
    const by = Math.floor(this.body.y);
    const bz = Math.floor(this.body.z);
    for (let x = bx - 6; x <= bx + 6; x++) {
      for (let y = by - 4; y <= by + 4; y++) {
        for (let z = bz - 6; z <= bz + 6; z++) {
          const id = this.world.getBlock(x, y, z);
          if (id === B.Brazier) brazier = true;
          if (id === B.GlowCrystal || id === B.EnergyCell) glow = true;
        }
      }
    }
    return { brazier, glow };
  }

  inShelter(): boolean {
    // A shelter = solid blocks in at least 3 of 4 horizontal neighbors within 3 blocks, plus roof above.
    const bx = Math.floor(this.body.x);
    const by = Math.floor(this.body.y);
    const bz = Math.floor(this.body.z);
    let sides = 0;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dz] of dirs) {
      for (let d = 1; d <= 3; d++) {
        if (this.world.isSolidAt(bx + dx * d, by + 1, bz + dz * d)) {
          sides++;
          break;
        }
      }
    }
    let roof = false;
    for (let y = by + 2; y <= by + 5; y++) if (this.world.isSolidAt(bx, y, bz)) roof = true;
    return sides >= 3 && roof;
  }

  dropSelected() {
    const stack = this.inventory.selected();
    if (!stack) return;
    const dropped = this.inventory.drop(this.inventory.hotbarIndex, 1);
    if (dropped) {
      const [dx, , dz] = this.lookVector();
      this.world.spawnDrop(
        dropped.id,
        dropped.count,
        this.body.x + dx * 0.6,
        this.body.y + 1,
        this.body.z + dz * 0.6,
        dropped.durability,
        performance.now()
      );
      renderHotbar(this.hud, this.inventory);
    }
  }

  interact() {
    if (this.interactCooldown > 0) return;
    this.interactCooldown = 0.25;
    const hit = this.targetHit();
    if (!hit) return;
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    if (id === B.HatchDoor) {
      this.world.toggleDoor(hit.x, hit.y, hit.z);
      return;
    }
    if (id === B.Strongbox) {
      const key = keyOf(hit.x, hit.y, hit.z);
      let slots = this.world.containers.get(key);
      if (!slots) {
        slots = new Array(16).fill(null);
        this.world.containers.set(key, slots);
      }
      this.activeContainer = { key, slots };
      document.exitPointerLock?.();
      showContainer(this.uiRoot, '铆钉储物箱', slots, this.inventory, {
        close: () => {
          this.uiRoot.querySelector('#container-panel')?.remove();
          this.activeContainer = null;
          if (this.mode === 'playing') this.canvas.requestPointerLock?.();
        },
        change: () => {
          this.world.containers.set(key, slots!);
          renderHotbar(this.hud, this.inventory);
        }
      });
      return;
    }
    if (id === B.RelayCore) {
      this.tryRepairTower(hit);
      return;
    }
    if (id === B.LeyCore) {
      this.tryActivateCore(hit);
      return;
    }
  }

  tryRepairTower(hit: RayHit) {
    if (this.towerRepaired) {
      toast(this.uiRoot, '能源塔已修复。');
      return;
    }
    if (this.quest.stage < 3) {
      toast(this.uiRoot, '需要先取得能源晶体并推进任务。', 'warn');
      return;
    }
    if (!this.inventory.has('relay_core', 1)) {
      toast(this.uiRoot, '需要在工作台制作并携带塔心中继器。', 'warn');
      return;
    }
    if (!this.nearBlock(B.EnergyCell, 6)) {
      toast(this.uiRoot, '能源塔附近需要放置一个能源电池组。', 'warn');
      return;
    }
    this.inventory.remove('relay_core', 1);
    // place a conduit to visually connect the tower
    this.world.setBlock(hit.x, hit.y - 1, hit.z, B.EnergyConduit);
    this.towerRepaired = true;
    toast(this.uiRoot, '废弃能源塔重新轰鸣——修复成功！');
    this.eventTimer = Math.min(this.eventTimer, 20);
  }

  tryActivateCore(hit: RayHit) {
    if (this.corePlaced) return;
    if (this.quest.stage < 7) {
      toast(this.uiRoot, '需要地脉探测器才能安全启动核心。', 'warn');
      return;
    }
    if (!this.inventory.has('signal_lantern', 1)) {
      toast(this.uiRoot, '最终传输需要信号引灯。', 'warn');
      return;
    }
    this.corePlaced = true;
    this.finalRaid = true;
      this.finalTimer = 90;
    showEventBanner(this.hud, {
      kind: 'raid',
      title: '最终事件：保护能源塔',
      time: performance.now(),
      detail: '在 90 秒内守住能源塔！信号引灯已开始校准。',
      timeLimit: 90
    });
    window.setTimeout(() => {
      if (this.hud.eventBanner.querySelector('h4')?.textContent?.includes('最终事件')) showEventBanner(this.hud, null);
    }, 6000);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const e = spawnEnemy(
        i % 2 ? 'wraith' : 'prowler',
        hit.x + Math.cos(ang) * 14,
        this.world.surfaceHeight(Math.floor(hit.x + Math.cos(ang) * 14), Math.floor(hit.z + Math.sin(ang) * 14)) + 1,
        hit.z + Math.sin(ang) * 14
      );
      this.enemies.push(e);
    }
  }

  repairAction() {
    if (!this.inventory.selected()) return;
    const stack = this.inventory.selected()!;
    const d = itemDef(stack.id);
    if (d.toolType === 'repair' && this.inventory.has('repair_paste', 1)) {
      // repair targeted built block or selected tool in slot 0
      const hit = this.targetHit();
      if (hit) {
        const k = keyOf(hit.x, hit.y, hit.z);
        const def = blockDef(this.world.getBlock(hit.x, hit.y, hit.z));
        if (def.hp) {
          this.world.blockHp.set(k, def.hp);
          this.inventory.remove('repair_paste', 1);
          toast(this.uiRoot, `已修复 ${def.name} 的结构耐久。`);
          return;
        }
      }
    }
    // otherwise repair the tool in hotbar slot 1 if paste available
    const target = this.inventory.slots[0];
    if (target && itemDef(target.id).kind === 'tool' && this.inventory.has('repair_paste', 1)) {
      this.inventory.remove('repair_paste', 1);
      const td = itemDef(target.id);
      target.durability = td.durability;
      toast(this.uiRoot, `已完全修复 ${td.name}。`);
      renderHotbar(this.hud, this.inventory);
    } else {
      toast(this.uiRoot, '需要修理器与修补膏，且对准受损建筑。', 'warn');
    }
  }

  // ---------- per-frame actions ----------
  handleMouseActions(dt: number) {
    this.leftCooldown = Math.max(0, this.leftCooldown - dt);
    this.rightCooldown = Math.max(0, this.rightCooldown - dt);
    this.interactCooldown = Math.max(0, this.interactCooldown - dt);
    const hit = this.targetHit();
    if (!hit) {
      this.renderer.hideHighlight();
      (this.uiRoot.querySelector('#mining-bar') as HTMLElement).style.display = 'none';
      this.mining = null;
      return;
    }
    // highlight / placement preview
    const placeX = hit.x + hit.nx;
    const placeY = hit.y + hit.ny;
    const placeZ = hit.z + hit.nz;
    const placeCheck = canPlaceAt(this.world, this.body, placeX, placeY, placeZ);
    const selected = this.inventory.selected();
    const selectedDef = selected ? itemDef(selected.id) : null;
    if (this.mouseDown[2] && selectedDef?.kind === 'block') {
      this.renderer.showHighlight(placeX, placeY, placeZ, placeCheck.ok);
    } else {
      this.renderer.showHighlight(hit.x, hit.y, hit.z, true);
    }

    // right click: place or eat/use
    if (this.mouseDown[2] && this.rightCooldown <= 0) {
      this.rightCooldown = 0.22;
      if (selectedDef?.kind === 'block') {
        const r = placeBlock(this.world, this.body, this.inventory, this.inventory.hotbarIndex, placeX, placeY, placeZ);
        if (r.ok && r.blockId !== undefined) {
          this.placedBlockIds.add(r.blockId);
          this.stats.blocksPlaced++;
          if (r.blockId >= 17) this.stats.buildingsBuilt++;
          renderHotbar(this.hud, this.inventory);
        } else if (!r.ok) {
          const reasons: Record<string, string> = {
            inside_player: '不能把方块放在自己身体里。',
            no_support: '方块必须依附在其它方块上，不能浮空。',
            not_empty: '该位置已有方块。'
          };
          toast(this.uiRoot, reasons[r.reason ?? ''] ?? '无法放置。', 'warn');
        }
      } else if (selectedDef?.kind === 'food') {
        eatFood(this.survival, selectedDef);
        this.inventory.remove(selectedDef.id, 1);
        renderHotbar(this.hud, this.inventory);
      } else if (selectedDef?.toolType === 'light') {
        // light rod raises safety while held (handled in survival ctx)
      }
    }

    // left click: mining or attacking
    if (this.mouseDown[0]) {
      if (selectedDef?.kind === 'projectile') return;
      // melee takes priority if an enemy is very close along view
      const attacked = this.tryMelee(dt);
      if (!attacked) this.handleMining(hit, dt);
    } else {
      this.mining = null;
      (this.uiRoot.querySelector('#mining-bar') as HTMLElement).style.display = 'none';
    }
  }

  private baseNearby: { workbench: boolean; strongbox: boolean; brazier: boolean } = {
    workbench: false,
    strongbox: false,
    brazier: false
  };

  refreshBaseNearby() {
    const bx = Math.floor(this.body.x);
    const by = Math.floor(this.body.y);
    const bz = Math.floor(this.body.z);
    const found = { workbench: false, strongbox: false, brazier: false };
    for (let x = bx - 8; x <= bx + 8; x++) {
      for (let y = by - 5; y <= by + 5; y++) {
        for (let z = bz - 8; z <= bz + 8; z++) {
          const id = this.world.getBlock(x, y, z);
          if (id === B.Workbench) found.workbench = true;
          if (id === B.Strongbox) found.strongbox = true;
          if (id === B.Brazier) found.brazier = true;
        }
      }
    }
    this.baseNearby = found;
  }

  tryMelee(_dt: number): boolean {
    if (this.leftCooldown > 0) return false;
    const [ox, oy, oz] = this.eyePosition();
    const [dx, dy, dz] = this.lookVector();
    let best: Enemy | null = null;
    let bestDist = 2.4;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const ex = e.x - ox;
      const ey = e.y + e.height * 0.6 - oy;
      const ez = e.z - oz;
      const dist = Math.hypot(ex, ey, ez);
      if (dist > bestDist) continue;
      const dot = (ex * dx + ey * dy + ez * dz) / (dist || 1);
      if (dot > 0.6) {
        best = e;
        bestDist = dist;
      }
    }
    if (best) {
      const stack = this.inventory.selected();
      const d = stack ? itemDef(stack.id) : null;
      const damage = d?.damage ?? 4;
      const res: EnemyUpdateResult = { damageToPlayer: 0, killed: [] };
      damageEnemy(this.world, best, damage, this.rng, res, performance.now());
      this.stats.damageDealt += damage;
      this.leftCooldown = 0.5;
      if (best.state === 'dead') this.stats.enemiesKilled++;
      if (stack && d?.kind === 'tool') this.inventory.damageSelectedTool(1);
      this.enemies = this.enemies.filter((x) => x.state !== 'dead');
      return true;
    }
    return false;
  }

  handleMining(hit: RayHit, dt: number) {
    const def = blockDef(hit.id);
    const stack = this.inventory.selected();
    const toolId = stack ? stack.id : null;
    if (!this.mining || this.mining.hit.x !== hit.x || this.mining.hit.y !== hit.y || this.mining.hit.z !== hit.z) {
      this.mining = {
        hit,
        progress: 0,
        total: miningTime(def, toolId, miningScale(this.survival))
      };
    }
    if (def.tool !== 'none' && (!toolId || itemDef(toolId).toolType !== def.tool)) {
      // slow mining still allowed; show warning occasionally via bar color
    }
    if (this.survival.stamina >= 1) {
      this.mining.progress += dt;
      this.survival.stamina = Math.max(0, this.survival.stamina - dt * 3);
    } else {
      this.mining.progress += dt * 0.3;
    }
    const bar = this.uiRoot.querySelector('#mining-bar') as HTMLElement;
    bar.style.display = 'block';
    (bar.firstElementChild as HTMLElement).style.width = `${Math.min(100, (this.mining.progress / this.mining.total) * 100)}%`;
    if (this.mining.progress >= this.mining.total) {
      this.finishBreak(hit);
      this.mining = null;
      bar.style.display = 'none';
    }
  }

  finishBreak(hit: RayHit) {
    const { drops } = breakBlock(this.world, this.inventory, hit.x, hit.y, hit.z, performance.now());
    this.stats.blocksMined++;
    this.stats.resourcesGathered += drops.reduce((a, d) => a + d.count, 0);
    const stack = this.inventory.selected();
    if (stack && itemDef(stack.id).kind === 'tool') this.inventory.damageSelectedTool(1);
    renderHotbar(this.hud, this.inventory);
  }

  throwDart() {
    const sel = this.inventory.selected();
    if (!sel || itemDef(sel.id).kind !== 'projectile') return;
    if (this.leftCooldown > 0) return;
    const [ox, oy, oz] = this.eyePosition();
    const [dx, dy, dz] = this.lookVector();
    this.projectiles.push(createProjectile(ox, oy, oz, dx, dy, dz, itemDef(sel.id).power ?? 18));
    this.inventory.remove(sel.id, 1);
    this.leftCooldown = 0.7;
    renderHotbar(this.hud, this.inventory);
  }

  // ---------- events ----------
  fireEvent(kind?: import('./events').EventKind) {
    const ev = triggerEvent(
      kind ?? pickEvent(this.rng, isNight(this.environment)),
      {
        world: this.world,
        rng: this.rng,
        px: this.body.x,
        py: this.body.y,
        pz: this.body.z,
        inventory: this.inventory,
        survival: this.survival,
        forceWeather: (w) => {
          this.environment.weather = w;
          this.environment.weatherTime = 40;
        },
        spawnRaid: (strength) => {
          for (let i = 0; i < strength + 1; i++) {
            const ang = (i / (strength + 1)) * Math.PI * 2;
            const x = Math.floor(this.body.x + Math.cos(ang) * 16);
            const z = Math.floor(this.body.z + Math.sin(ang) * 16);
            const y = this.world.surfaceHeight(x, z) + 1;
            this.enemies.push(spawnEnemy(i % 2 ? 'wraith' : 'prowler', x + 0.5, y, z + 0.5));
          }
        },
        setLeak: (on) => {
          this.leakActive = on;
        },
        unlockRecipe: () => {
          if (this.inventory.canAdd('relic_token', 1)) this.inventory.add('relic_token', 1);
        },
        migrationActive: this.migrationActive
      },
      this.playTime
    );
    this.events.push(ev);
    showEventBanner(this.hud, ev);
    if (ev.kind !== 'raid' || ev.timeLimit === undefined) {
      window.setTimeout(() => showEventBanner(this.hud, null), 6500);
    }
  }

  // ---------- death / ending ----------
  onDeath() {
    this.mode = 'dead';
    document.exitPointerLock?.();
    const dropped: import('./inventory').ItemStack[] = [];
    if (this.settings.keepItemsOnDeath) {
      for (let i = HOTBAR_SIZE; i < this.inventory.size; i++) {
        const s = this.inventory.drop(i);
        if (s) dropped.push(s);
      }
    } else {
      for (let i = 0; i < this.inventory.size; i++) {
        const s = this.inventory.drop(i);
        if (s) dropped.push(s);
      }
    }
    for (const d of dropped) {
      this.world.spawnDrop(d.id, d.count, this.body.x, this.body.y + 1, this.body.z, d.durability, performance.now());
    }
    showDeath(this.uiRoot, this.survival.deathCause, dropped, {
      respawn: () => {
        this.survival = createSurvival();
        this.body.x = this.spawnPoint.x;
        this.body.y = this.spawnPoint.y;
        this.body.z = this.spawnPoint.z;
        this.body.vx = this.body.vy = this.body.vz = 0;
        this.enemies = this.enemies.filter((e) => Math.hypot(e.x - this.body.x, e.z - this.body.z) > 30);
        this.uiRoot.querySelectorAll('.screen').forEach((n) => n.remove());
        this.mode = 'playing';
        this.canvas.requestPointerLock?.();
      },
      menu: () => {
        this.writeSave();
        this.showMenu();
      }
    });
  }

  finishGame() {
    if (this.mode === 'ended') return;
    this.mode = 'ended';
    document.exitPointerLock?.();
    const ending = evaluateEnding({
      finished: true,
      buildings: this.stats.buildingsBuilt,
      kills: this.stats.enemiesKilled,
      daysSurvived: this.environment.day,
      health: this.survival.health,
      hasArmor: !!this.inventory.armor,
      route: this.quest.route,
      towerIntact: this.towerRepaired
    });
    this.quest.ending = ending.id;
    this.writeSave();
    showEnding(this.uiRoot, ending, this.stats, this.playTime, {
      menu: () => this.showMenu(),
      continuePlay: () => {
        this.uiRoot.querySelectorAll('.screen').forEach((n) => n.remove());
        this.mode = 'playing';
        this.canvas.requestPointerLock?.();
      }
    });
  }
}

const QUESTS_TITLE: Record<number, string> = {
  1: '打造工具',
  2: '建立据点',
  3: '晶洞探索',
  4: '修复能源塔',
  5: '观测站坐标',
  6: '地脉探测器',
  7: '深入禁区',
  8: '信号传输',
  9: '荒原黎明'
};
