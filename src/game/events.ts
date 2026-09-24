// Eight dynamic events that really alter the world/state.

import { B } from './blocks';
import { World, keyOf } from './world';
import { Rng } from './rng';
import { Inventory } from './inventory';
import { SurvivalState } from './survival';

export type EventKind =
  | 'depletion'
  | 'raid'
  | 'weather_shift'
  | 'collapse'
  | 'leak'
  | 'caravan'
  | 'mechanism'
  | 'migration';

export interface GameEvent {
  kind: EventKind;
  title: string;
  time: number;
  detail: string;
  timeLimit?: number;
  resolved?: boolean;
  // Optional display status for the log panel. Absent on legacy v1 saves;
  // the log view falls back to "已记录" without touching event semantics.
  status?: 'unresolved' | 'resolved';
}

export const EVENT_TITLES: Record<EventKind, string> = {
  depletion: '资源枯竭',
  raid: '据点遭袭',
  weather_shift: '天气突变',
  collapse: '洞穴坍塌',
  leak: '能源泄漏',
  caravan: '商旅出现',
  mechanism: '遗迹机关启动',
  migration: '敌人迁徙'
};

export interface EventWorld {
  world: World;
  rng: Rng;
  px: number;
  py: number;
  pz: number;
  inventory: Inventory;
  survival: SurvivalState;
  forceWeather: (w: 'storm' | 'sandstorm' | 'frost' | 'clear') => void;
  spawnRaid: (strength: number) => void;
  setLeak: (on: boolean) => void;
  unlockRecipe: (id: string) => void;
  migrationActive: number;
}

export function triggerEvent(kind: EventKind, ctx: EventWorld, now: number): GameEvent {
  const { world, rng } = ctx;
  let detail = '';
  let timeLimit: number | undefined;
  switch (kind) {
    case 'depletion': {
      // Turn nearby natural resource blocks (brambles/driftwood/ore) to depleted rock.
      let n = 0;
      for (const [k, id] of world.modifications) {
        void id;
        void k;
      }
      for (let dx = -12; dx <= 12; dx++) {
        for (let dz = -12; dz <= 12; dz++) {
          const x = Math.floor(ctx.px) + dx;
          const z = Math.floor(ctx.pz) + dz;
          const h = world.surfaceHeight(x, z);
          const top = world.getBlock(x, h + 1, z);
          if ((top === B.ThornBramble || top === B.Driftwood) && rng.chance(0.5)) {
            world.setBlock(x, h + 1, z, B.Gravel);
            world.depleted.add(keyOf(x, h + 1, z));
            n++;
          }
        }
      }
      detail = `附近 ${n} 处荆棘与流木因旱季枯萎，化作碎石。`;
      break;
    }
    case 'raid': {
      ctx.spawnRaid(rng.int(2, 4));
      detail = '夜行生物朝你的据点聚集，关门并点燃火盆！';
      timeLimit = 75;
      break;
    }
    case 'weather_shift': {
      const w = rng.pick(['storm', 'sandstorm', 'frost'] as const);
      ctx.forceWeather(w);
      detail = `天气骤变为${w === 'storm' ? '暴雨' : w === 'sandstorm' ? '沙尘' : '极寒'}，能见度与体温迅速变化。`;
      break;
    }
    case 'collapse': {
      let n = 0;
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(ctx.px) + rng.int(-6, 6);
        const y = Math.floor(ctx.py) + rng.int(-4, 1);
        const z = Math.floor(ctx.pz) + rng.int(-6, 6);
        if (world.getBlock(x, y, z) === B.Air && world.getBlock(x, y + 1, z) !== B.Air) {
          world.setBlock(x, y, z, B.DeepShale);
          n++;
        }
      }
      detail = `洞穴发生局部坍塌，${n} 块页岩封住了通道，需要重新挖开。`;
      break;
    }
    case 'leak': {
      ctx.setLeak(true);
      detail = '能源装置泄漏：靠近泄漏点会持续损耗生命，修理或拆除可解除。';
      timeLimit = 60;
      break;
    }
    case 'caravan': {
      // A wandering trader cache appears near the player.
      const ang = rng.range(0, Math.PI * 2);
      const x = Math.floor(ctx.px + Math.cos(ang) * 10);
      const z = Math.floor(ctx.pz + Math.sin(ang) * 10);
      const y = world.surfaceHeight(x, z) + 1;
      world.setBlock(x, y, z, B.Strongbox);
      world.containers.set(keyOf(x, y, z), [
        { id: 'iron_ingot', count: 2 },
        { id: 'repair_paste', count: 2 },
        { id: 'cured_jerky', count: 3 }
      ]);
      detail = '游商把补给箱藏在附近的荒原上（地图 10 格内），快去寻找。';
      break;
    }
    case 'mechanism': {
      ctx.unlockRecipe('repair_gun');
      const x = Math.floor(ctx.px);
      const z = Math.floor(ctx.pz);
      const h = world.surfaceHeight(x, z);
      world.setBlock(x + 2, h + 1, z + 2, B.RuinStone);
      world.setBlock(x + 2, h + 2, z + 2, B.GlowCrystal);
      if (ctx.inventory.canAdd('relic_token', 1)) ctx.inventory.add('relic_token', 1);
      detail = '遗迹机关启动：解锁喷补修理器配方，附近出现带光晶的机关柱。';
      break;
    }
    case 'migration': {
      ctx.migrationActive = 90;
      detail = '大批夜行生物正在迁徙，90 秒内野外遭遇频率显著提高。';
      timeLimit = 90;
      break;
    }
  }
  return { kind, title: EVENT_TITLES[kind], time: now, detail, timeLimit };
}

// Timed scheduler: events happen every 60-110s, raids only at night.
export function scheduleNext(rng: Rng, night: boolean): number {
  const kinds: EventKind[] = night
    ? ['raid', 'weather_shift', 'leak', 'migration', 'mechanism']
    : ['depletion', 'weather_shift', 'collapse', 'caravan', 'mechanism'];
  void kinds;
  return 55 + rng.next() * 55;
}

export function pickEvent(rng: Rng, night: boolean): EventKind {
  const day: EventKind[] = ['depletion', 'weather_shift', 'collapse', 'caravan', 'mechanism'];
  const nightKinds: EventKind[] = ['raid', 'weather_shift', 'leak', 'migration', 'mechanism'];
  return rng.pick(night ? nightKinds : day);
}
