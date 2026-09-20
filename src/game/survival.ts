// Survival stats, day/night cycle and weather simulation (pure logic).

export interface SurvivalState {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  hunger: number;
  maxHunger: number;
  temperature: number; // ideal 37, safe 30..42
  lightSafety: number; // 0..100
  alive: boolean;
  deathCause: string;
}

export function createSurvival(): SurvivalState {
  return {
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    hunger: 100,
    maxHunger: 100,
    temperature: 37,
    lightSafety: 80,
    alive: true,
    deathCause: ''
  };
}

export const DAY_LENGTH = 240; // seconds per full day

export interface EnvironmentState {
  time: number; // 0..DAY_LENGTH
  day: number;
  weather: Weather;
  weatherTime: number; // seconds remaining in current weather
}

export type Weather = 'clear' | 'storm' | 'sandstorm' | 'frost';
export const WEATHER_INFO: Record<Weather, { name: string; speedScale: number; tempDelta: number; vision: number; danger: number }> = {
  clear: { name: '晴天', speedScale: 1, tempDelta: 0, vision: 1, danger: 0 },
  storm: { name: '暴雨', speedScale: 0.85, tempDelta: -4, vision: 0.55, danger: 0.25 },
  sandstorm: { name: '沙尘', speedScale: 0.75, tempDelta: 2, vision: 0.35, danger: 0.35 },
  frost: { name: '极寒', speedScale: 0.9, tempDelta: -12, vision: 0.6, danger: 0.3 }
};

export function createEnvironment(): EnvironmentState {
  return { time: DAY_LENGTH * 0.18, day: 1, weather: 'clear', weatherTime: 90 };
}

export function isNight(env: EnvironmentState): boolean {
  const t = env.time / DAY_LENGTH;
  return t > 0.55 || t < 0.08;
}

// 0..1 daylight factor for renderer/lighting.
export function daylightFactor(env: EnvironmentState): number {
  const t = env.time / DAY_LENGTH;
  if (t < 0.08 || t > 0.92) return 0.08;
  if (t < 0.2) return (t - 0.08) / 0.12;
  if (t < 0.5) return 1;
  if (t < 0.62) return 1 - (t - 0.5) / 0.12;
  return 0.12;
}

export function updateEnvironment(env: EnvironmentState, dt: number, rng: () => number): Weather | null {
  env.time += dt;
  let changed: Weather | null = null;
  if (env.time >= DAY_LENGTH) {
    env.time -= DAY_LENGTH;
    env.day++;
  }
  env.weatherTime -= dt;
  if (env.weatherTime <= 0) {
    const roll = rng();
    const options: Weather[] = ['clear', 'clear', 'storm', 'sandstorm', 'frost'];
    const next = options[Math.floor(roll * options.length)] ?? 'clear';
    if (next !== env.weather) changed = next;
    env.weather = next;
    env.weatherTime = 50 + rng() * 70;
  }
  return changed;
}

export interface SurvivalContext {
  altitude: number; // block y
  underground: boolean;
  nearBrazier: boolean;
  nearGlow: boolean;
  hasLightRod: boolean;
  inShelter: boolean;
  exertion: number; // stamina drain already applied externally; here hunger
}

export interface SurvivalUpdateResult {
  staminaCost: number;
  healthDelta: number;
  messages: string[];
}

export function updateSurvival(
  s: SurvivalState,
  env: EnvironmentState,
  ctx: SurvivalContext,
  dt: number
): SurvivalUpdateResult {
  if (!s.alive) return { staminaCost: 0, healthDelta: 0, messages: [] };
  const messages: string[] = [];
  const info = WEATHER_INFO[env.weather];
  const night = isNight(env);

  // stamina regen
  if (ctx.exertion <= 0.05) {
    s.stamina = Math.min(s.maxStamina, s.stamina + dt * (s.hunger > 20 ? 9 : 3));
  }
  s.hunger = Math.max(0, s.hunger - dt * 0.45);

  // temperature
  let target = 37 + info.tempDelta;
  if (ctx.altitude > 40) target -= 5;
  if (ctx.underground) target -= 3;
  if (night) target -= 3;
  if (ctx.nearBrazier) target += 10;
  if (ctx.nearGlow) target += 2;
  if (ctx.inShelter && night) target += 3;
  s.temperature += (target - s.temperature) * dt * 0.25;

  // light safety
  let lightTarget = 60;
  if (night) lightTarget = ctx.inShelter ? 55 : 15;
  if (ctx.underground) lightTarget = 20;
  if (ctx.nearGlow || ctx.nearBrazier) lightTarget += 45;
  if (ctx.hasLightRod) lightTarget += 30;
  lightTarget = Math.max(0, Math.min(100, lightTarget));
  s.lightSafety += (lightTarget - s.lightSafety) * dt * 0.3;

  let dmg = 0;
  if (s.temperature < 28) dmg += ((28 - s.temperature) * 0.18 + 0.5) * dt;
  if (s.temperature > 45) dmg += ((s.temperature - 45) * 0.2 + 0.5) * dt;
  if (s.lightSafety < 25 && (night || ctx.underground)) dmg += 1.2 * dt;
  if (s.hunger <= 0) dmg += 2 * dt;
  else if (s.hunger > 60 && s.health < s.maxHealth && dmg === 0) s.health = Math.min(s.maxHealth, s.health + dt * 1.2);

  s.health = Math.max(0, Math.min(s.maxHealth, s.health - dmg));
  if (s.health <= 0) {
    s.alive = false;
    s.deathCause =
      s.temperature < 28
        ? '在荒原的寒夜里冻毙'
        : s.temperature > 45
          ? '因极端高温倒下'
          : s.hunger <= 0
            ? '因饥饿力竭而亡'
            : '被黑暗中的恐惧吞噬';
    messages.push(s.deathCause);
  }
  return { staminaCost: 0, healthDelta: -dmg, messages };
}

export function applyDamage(s: SurvivalState, amount: number, defense: number, cause: string) {
  const final = Math.max(1, amount * (1 - Math.min(0.7, defense / 40)));
  s.health = Math.max(0, s.health - final);
  if (s.health <= 0 && s.alive) {
    s.alive = false;
    s.deathCause = cause;
  }
  return final;
}

export function eatFood(
  s: SurvivalState,
  food: { hunger?: number; stamina?: number; health?: number; warmth?: number }
): void {
  s.hunger = Math.min(s.maxHunger, s.hunger + (food.hunger ?? 0));
  s.stamina = Math.min(s.maxStamina, s.stamina + (food.stamina ?? 0));
  s.health = Math.min(s.maxHealth, s.health + (food.health ?? 0));
  if (food.warmth) s.temperature = Math.min(44, s.temperature + food.warmth * 0.08);
}

// Survival effects feed back into the player: slower when starving/cold/injured.
export function movementScale(s: SurvivalState, weatherSpeed: number): number {
  let scale = weatherSpeed;
  if (s.hunger < 20) scale *= 0.8;
  if (s.stamina <= 0) scale *= 0.7;
  if (s.health < 30) scale *= 0.85;
  if (s.temperature < 30) scale *= 0.85;
  return scale;
}

export function miningScale(s: SurvivalState): number {
  let scale = 1;
  if (s.stamina < 15) scale *= 0.7;
  if (s.health < 30) scale *= 0.8;
  return scale;
}
