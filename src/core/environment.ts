import { Rng } from './rng';

export type Weather = 'clear' | 'storm' | 'sandstorm' | 'cold';

export interface EnvState {
  time: number;        // 0..24 小时
  day: number;
  weather: Weather;
  weatherTime: number; // 当前天气剩余秒数
  temperatureAmbient: number; // 环境温度
}

export const DAY_LENGTH = 420; // 一个昼夜 7 分钟

export function createEnv(): EnvState {
  return { time: 6.5, day: 1, weather: 'clear', weatherTime: 90, temperatureAmbient: 22 };
}

export function isNight(t: number): boolean {
  return t < 5.5 || t > 19.5;
}

// 日照强度 0..1
export function daylight(t: number): number {
  if (t >= 6 && t <= 18) return 1;
  if (t > 18 && t < 19.5) return Math.max(0, 1 - (t - 18) / 1.5);
  if (t >= 5.5 && t < 6) return (t - 5.5) / 0.5;
 return 0.05;
}

export function clockLabel(env: EnvState): string {
  const h = Math.floor(env.time);
  const m = Math.floor((env.time - h) * 60);
  return `第${env.day}天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const WEATHER_INFO: Record<Weather, { name: string; speedMul: number; tempDelta: number; visibility: number; danger: number }> = {
  clear: { name: '晴天', speedMul: 1, tempDelta: 0, visibility: 1, danger: 0 },
  storm: { name: '暴雨', speedMul: 0.82, tempDelta: -8, visibility: 0.55, danger: 0.5 },
  sandstorm: { name: '沙尘', speedMul: 0.7, tempDelta: -2, visibility: 0.3, danger: 0.3 },
  cold: { name: '极寒', speedMul: 0.9, tempDelta: -18, visibility: 0.75, danger: 0.7 },
};

export function updateEnvironment(env: EnvState, dt: number, rng: Rng, altitude: number): void {
  env.time += (24 / DAY_LENGTH) * dt;
  if (env.time >= 24) { env.time -= 24; env.day += 1; }
  env.weatherTime -= dt;
  if (env.weatherTime <= 0) {
    const roll = rng.next();
    if (roll < 0.5) env.weather = 'clear';
    else if (roll < 0.7) env.weather = 'storm';
    else if (roll < 0.86) env.weather = 'sandstorm';
    else env.weather = 'cold';
    env.weatherTime = rng.range(45, 100);
  }
  const dayBase = 26 - Math.abs(env.time - 13) * 1.6;
  env.temperatureAmbient = dayBase - altitude * 0.32 + WEATHER_INFO[env.weather].tempDelta;
}

export function setWeather(env: EnvState, w: Weather, duration: number): void {
  env.weather = w;
  env.weatherTime = duration;
}
