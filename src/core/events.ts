import { Rng } from './rng';
import { World } from './world';
import { BlockId } from './blocks';

export type EventKind =
  | 'depletion' | 'raid' | 'weather_shift' | 'cave_in' | 'energy_leak'
  | 'caravan' | 'ruin_trap' | 'migration';

export interface GameEvent {
  kind: EventKind;
  title: string;
  detail: string;
  time: number;
  timed: boolean;
  timeLeft?: number;
  resolved?: boolean;
}

export const EVENT_TITLE: Record<EventKind, string> = {
  depletion: '资源枯竭',
  raid: '据点遭袭',
  weather_shift: '天气突变',
  cave_in: '洞穴坍塌',
  energy_leak: '能源泄漏',
  caravan: '商旅出现',
  ruin_trap: '遗迹机关启动',
  migration: '敌人迁徙',
};

export interface EventEffect {
  spawnEnemies?: { kind: 'duststalker' | 'cavemaw' | 'ruinsentinel'; n: number; atBase: boolean }[];
  destroyBlocks?: { x: number; y: number; z: number; id: number }[];
  clearWeather?: boolean;
  message: string;
}

export function rollEvent(rng: Rng, day: number): EventKind {
  void day;
  const pool: EventKind[] = ['depletion', 'weather_shift', 'cave_in', 'energy_leak', 'caravan', 'ruin_trap', 'migration', 'raid'];
  return pool[rng.int(0, pool.length - 1)];
}

export function makeEvent(kind: EventKind, clock: number, detail: string, timed = false, timeLeft?: number): GameEvent {
  return { kind, title: EVENT_TITLE[kind], detail, time: clock, timed, timeLeft };
}

export function caveCollapse(world: World, rng: Rng, px: number, pz: number): EventEffect {
  const blocks: { x: number; y: number; z: number; id: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const x = Math.round(px + rng.range(-4, 4));
    const z = Math.round(pz + rng.range(-4, 4));
    const y = rng.int(5, 18);
    if (world.getBlock(x, y, z) === BlockId.Air) blocks.push({ x, y, z, id: BlockId.Rock });
  }
  blocks.forEach((b) => world.setBlock(b.x, b.y, b.z, b.id));
  return { destroyBlocks: blocks, message: '洞穴发生坍塌，部分通道被落石封死！' };
}

export function energyLeak(world: World, rng: Rng, px: number, pz: number): EventEffect {
  const blocks: { x: number; y: number; z: number; id: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const x = Math.round(px + rng.range(-5, 5));
    const z = Math.round(pz + rng.range(-5, 5));
    const y = rng.int(20, 40);
    const id = world.getBlock(x, y, z);
    if (id === BlockId.Crystal || id === BlockId.GlowLamp || id === BlockId.EnergyCell) {
      world.setBlock(x, y, z, BlockId.Air);
      blocks.push({ x, y, z, id: BlockId.Air });
    }
  }
  return { destroyBlocks: blocks, message: '能源泄漏！附近发光设备过载熄灭。' };
}

export function raidEffect(n: number): EventEffect {
  return { spawnEnemies: [{ kind: 'duststalker', n, atBase: true }], message: `一群尘行者正在逼近你的据点（${n} 只）！` };
}

export function migrationEffect(day: number): EventEffect {
  const kind = day >= 3 ? 'ruinsentinel' : 'duststalker';
  return { spawnEnemies: [{ kind, n: 3 + Math.min(4, day), atBase: false }], message: '侦测到大规模生物迁徙，野外敌人增多。' };
}
