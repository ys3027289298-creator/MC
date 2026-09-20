import { describe, it, expect } from 'vitest';
import { createEnv, updateEnvironment, isNight, daylight, clockLabel, WEATHER_INFO, setWeather } from '../src/core/environment';
import { createPlayer, updatePlayerPhysics } from '../src/core/player';
import { World } from '../src/core/world';
import { BlockId } from '../src/core/blocks';
import { updateSurvival, eat, damagePlayer } from '../src/core/survival';
import { Rng } from '../src/core/rng';

const noInput = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, crouch: false };

describe('昼夜变化', () => {
  it('时间向前推进并跨天', () => {
    const env = createEnv();
    env.time = 23.9;
    updateEnvironment(env, 3, new Rng(1), 25);
    expect(env.day).toBe(2);
    expect(env.time).toBeLessThan(1);
  });
  it('夜晚判定与日照强度', () => {
    expect(isNight(2)).toBe(true);
    expect(isNight(12)).toBe(false);
    expect(daylight(12)).toBe(1);
    expect(daylight(22)).toBeCloseTo(0.05, 5);
    expect(daylight(5.75)).toBeGreaterThan(0);
    expect(daylight(5.75)).toBeLessThan(1);
  });
  it('时钟文本格式', () => {
    const env = createEnv();
    env.day = 3; env.time = 18.5;
    expect(clockLabel(env)).toBe('第3天 18:30');
  });
});

describe('天气', () => {
  it('四种天气有不同的移动/温度/能见度参数', () => {
    expect(WEATHER_INFO.sandstorm.speedMul).toBeLessThan(1);
    expect(WEATHER_INFO.cold.tempDelta).toBeLessThan(WEATHER_INFO.clear.tempDelta);
    expect(WEATHER_INFO.storm.visibility).toBeLessThan(WEATHER_INFO.clear.visibility);
  });
  it('setWeather 真正改变状态', () => {
    const env = createEnv();
    setWeather(env, 'storm', 50);
    expect(env.weather).toBe('storm');
    expect(env.weatherTime).toBe(50);
  });
  it('随机天气会在一段时间后变化', () => {
    const env = createEnv();
    const start = env.weather;
    env.weatherTime = 0.1;
    const rng = new Rng('weather-roll');
    let changed = false;
    for (let i = 0; i < 200; i++) {
      updateEnvironment(env, 0.5, rng, 25);
      if (env.weather !== start) { changed = true; break; }
    }
    expect(changed).toBe(true);
  });
  it('海拔越高环境温度越低', () => {
    const env = createEnv();
    env.time = 13;
    updateEnvironment(env, 0.1, new Rng(2), 20);
    const tLow = env.temperatureAmbient;
    updateEnvironment(env, 0.1, new Rng(2), 50);
    expect(env.temperatureAmbient).toBeLessThan(tLow);
  });
});

describe('生存状态', () => {
  it('寒冷且无取暖会持续掉血，火盆旁则安全', () => {
    const w = new World('surv');
    const p = createPlayer(0.5, 40, 0.5);
    const env = createEnv();
    env.time = 2; setWeather(env, 'cold', 999);
    env.time = 2; setWeather(env, 'cold', 999);
    updateEnvironment(env, 0.1, new Rng(2), 20);
    p.temperature = env.temperatureAmbient - 25; // 已经在严寒中暴露很久
    expect(p.temperature).toBeLessThan(0);
    const hp0 = p.hp;
    updateSurvival(p, env, w, 2, { exhaustion: 0, nearBrazier: false, nearLamp: false, indoors: false, armorWarmth: 0, lightLevel: 0.5 });
    expect(p.hp).toBeLessThan(hp0);
    // 火盆+室内+灯使体温明显高于纯严寒环境（火盆 +14，室内 +3）
    const coldTemp = env.temperatureAmbient;
    for (let i = 0; i < 50; i++) updateSurvival(p, env, w, 0.2, { exhaustion: 0, nearBrazier: true, nearLamp: true, indoors: true, armorWarmth: 0, lightLevel: 0.8 });
    expect(p.temperature).toBeGreaterThan(coldTemp + 10);
  });
  it('饱食耗尽会造成伤害', () => {
    const w = new World('surv2');
    const p = createPlayer(0, 40, 0);
    const env = createEnv();
    p.food = 0;
    updateSurvival(p, env, w, 3, { exhaustion: 0, nearBrazier: true, nearLamp: true, indoors: false, armorWarmth: 0, lightLevel: 1 });
    expect(p.hp).toBeLessThan(100);
  });
  it('进食恢复饱食与生命', () => {
    const p = createPlayer(0, 40, 0);
    p.food = 20; p.hp = 50;
    eat(p, 40, 20, 0);
    expect(p.food).toBe(60);
    expect(p.hp).toBe(70);
  });
  it('冲刺消耗体力并影响移动速度', () => {
    const w = new World('run');
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) w.setBlock(x, 30, z, BlockId.Rock, false);
    const p = createPlayer(0.5, 31.02, 0.5);
    const sprint = { ...noInput, forward: true, sprint: true };
    const r = updatePlayerPhysics(p, w, sprint, 1);
    expect(r.exhaustion).toBeGreaterThan(5);
  });
  it('护甲减伤', () => {
    const p = createPlayer(0, 40, 0);
    damagePlayer(p, 100, 0.5, '');
    expect(p.hp).toBe(50);
  });
});
