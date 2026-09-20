import { PlayerState } from './player';
import { EnvState, WEATHER_INFO, isNight } from './environment';
import { World } from './world';

export interface SurvivalResult {
  died: boolean;
  cause: string;
}

// 根据环境与装备更新生命/体力/饱食/体温/安全
export function updateSurvival(
  p: PlayerState,
  env: EnvState,
  world: World,
  dt: number,
  opts: { exhaustion: number; nearBrazier: boolean; nearLamp: boolean; indoors: boolean; armorWarmth: number; lightLevel: number }
): SurvivalResult {
  const result: SurvivalResult = { died: false, cause: '' };
  // 饱食
  p.food = Math.max(0, p.food - dt * 0.35);
  // 体力恢复
  const staminaRegen = opts.exhaustion > 0 ? 0 : 9;
  p.stamina = Math.max(0, Math.min(100, p.stamina + staminaRegen * dt - opts.exhaustion));
  // 体温目标
  const head = world.getBlock(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
  const altitude = p.y;
  let targetTemp = env.temperatureAmbient;
  if (opts.nearBrazier) targetTemp += 14;
  if (opts.indoors) targetTemp += 3;
  if (head === 7) targetTemp -= 4;
  if (head === 8) targetTemp -= 10;
  targetTemp += opts.armorWarmth;
  p.temperature += (targetTemp - p.temperature) * Math.min(1, dt * 0.4);
  // 安全值（黑暗/夜晚/地下降低，照明/室内提升）
  let safetyTarget = 60 + opts.lightLevel * 40;
  if (isNight(env.time)) safetyTarget -= 25;
  if (p.y < 18) safetyTarget -= 20;
  if (opts.nearLamp) safetyTarget += 20;
  if (opts.indoors) safetyTarget += 15;
  safetyTarget = Math.max(0, Math.min(100, safetyTarget));
  p.safety += (safetyTarget - p.safety) * Math.min(1, dt * 0.5);

  // 伤害结算
  if (p.food <= 0) {
    p.hp -= dt * 2;
    if (p.hp <= 0) { result.died = true; result.cause = '饥饿耗尽了你的体力'; }
  } else if (p.food > 60 && p.hp < 100) {
    p.hp = Math.min(100, p.hp + dt * 1.2);
  }
  if (p.temperature < 0) {
    p.hp -= dt * 3;
    if (p.hp <= 0) { result.died = true; result.cause = '失温：荒原寒夜夺走了体温'; }
  } else if (p.temperature > 45) {
    p.hp -= dt * 1.5;
    if (p.hp <= 0) { result.died = true; result.cause = '中暑：极端高温'; }
  }
  if (p.safety < 8) {
    p.hp -= dt * 1.0;
    if (p.hp <= 0 && !result.died) { result.died = true; result.cause = '在彻底的黑暗与恐惧中崩溃'; }
  }
  p.hp = Math.max(0, Math.min(100, p.hp));
  if (p.hp <= 0 && p.alive) { p.alive = false; result.died = true; if (!result.cause) result.cause = '伤重不治'; }
  return result;
}

// 采集速度受状态影响
export function actionSpeedMul(p: PlayerState, env: EnvState): number {
  let m = 1;
  if (p.stamina < 15) m *= 0.7;
  if (p.food < 20) m *= 0.8;
  if (p.temperature < 5) m *= 0.75;
  if (WEATHER_INFO[env.weather].name === '沙尘') m *= 0.9;
  return m;
}

export function eat(p: PlayerState, food: number, heal: number, warmth: number): void {
  p.food = Math.min(100, p.food + food);
  p.hp = Math.min(100, p.hp + heal);
  if (warmth > 0) p.temperature = Math.min(42, p.temperature + warmth / 4);
}

export function damagePlayer(p: PlayerState, raw: number, armor: number, cause: string): SurvivalResult {
  const dmg = raw * (1 - armor);
  p.hp = Math.max(0, p.hp - dmg);
  if (p.hp <= 0) { p.alive = false; return { died: true, cause }; }
  return { died: false, cause: '' };
}
