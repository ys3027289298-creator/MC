import { describe, it, expect } from 'vitest';
import {
  createSurvival,
  createEnvironment,
  updateSurvival,
  updateEnvironment,
  isNight,
  daylightFactor,
  WEATHER_INFO,
  applyDamage,
  movementScale
} from '../src/game/survival';
import { Rng } from '../src/game/rng';

describe('day/night & weather', () => {
  it('cycles from day to night and back across a day', () => {
    const env = createEnvironment();
    expect(isNight(env)).toBe(false);
    env.time = 240 * 0.7;
    expect(isNight(env)).toBe(true);
    expect(daylightFactor(env)).toBeLessThan(0.2);
  });

  it('advances days and can change weather', () => {
    const env = createEnvironment();
    const rng = new Rng(1);
    let changed: string | null = null;
    for (let i = 0; i < 500; i++) {
      const c = updateEnvironment(env, 1, () => rng.next());
      if (c) changed = c;
    }
    expect(env.day).toBeGreaterThan(1);
    expect(['clear', 'storm', 'sandstorm', 'frost']).toContain(env.weather);
    if (changed) expect(WEATHER_INFO[changed as keyof typeof WEATHER_INFO]).toBeDefined();
  });

  it('weather modifiers affect speed/vision/temperature', () => {
    expect(WEATHER_INFO.sandstorm.speedScale).toBeLessThan(1);
    expect(WEATHER_INFO.frost.tempDelta).toBeLessThan(0);
    expect(WEATHER_INFO.storm.vision).toBeLessThan(1);
  });
});

describe('survival stats', () => {
  it('drains hunger and damages health when starving', () => {
    const s = createSurvival();
    s.hunger = 0;
    const env = createEnvironment();
    for (let i = 0; i < 60; i++) {
      updateSurvival(
        s,
        env,
        { altitude: 30, underground: false, nearBrazier: false, nearGlow: false, hasLightRod: false, inShelter: false, exertion: 0 },
        1
      );
    }
    expect(s.health).toBeLessThan(100);
  });

  it('freezes in cold weather underground without warmth', () => {
    const s = createSurvival();
    const env = createEnvironment();
    env.weather = 'frost';
    env.time = 240 * 0.7;
    for (let i = 0; i < 120; i++) {
      updateSurvival(
        s,
        env,
        { altitude: 45, underground: false, nearBrazier: false, nearGlow: false, hasLightRod: false, inShelter: false, exertion: 0 },
        1
      );
    }
    expect(s.temperature).toBeLessThan(32);
  });

  it('a brazier and shelter keep the player warm and safe', () => {
    const s = createSurvival();
    const env = createEnvironment();
    env.weather = 'frost';
    for (let i = 0; i < 120; i++) {
      updateSurvival(
        s,
        env,
        { altitude: 30, underground: false, nearBrazier: true, nearGlow: true, hasLightRod: true, inShelter: true, exertion: 0 },
        1
      );
    }
    expect(s.temperature).toBeGreaterThan(30);
    expect(s.health).toBe(100);
  });

  it('reduces movement speed when starving or injured', () => {
    const s = createSurvival();
    expect(movementScale(s, 1)).toBe(1);
    s.hunger = 5;
    expect(movementScale(s, 1)).toBeLessThan(1);
  });

  it('applies damage with defense and records death cause', () => {
    const s = createSurvival();
    const taken = applyDamage(s, 50, 10, '被测试生物击倒');
    expect(taken).toBeGreaterThan(30);
    expect(taken).toBeLessThan(50);
    applyDamage(s, 1000, 0, '被测试生物击倒');
    expect(s.alive).toBe(false);
    expect(s.deathCause).toContain('击倒');
  });
});
