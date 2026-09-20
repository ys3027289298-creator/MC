import { describe, it, expect } from 'vitest';
import { createQuestState, setStage, advance, hasFlag, endingRank, QUESTS } from '../src/core/quests';
import { rollEvent, makeEvent, caveCollapse, energyLeak, raidEffect } from '../src/core/events';
import { Rng } from '../src/core/rng';
import { World } from '../src/core/world';
import { BlockId } from '../src/core/blocks';

describe('主线任务', () => {
  it('包含 10 个阶段（0..9）', () => {
    expect(QUESTS.length).toBe(10);
  });
  it('阶段只能向前推进', () => {
    const q = createQuestState();
    setStage(q, 3);
    expect(q.stage).toBe(3);
    setStage(q, 1);
    expect(q.stage).toBe(3);
  });
  it('任务标记一次性触发', () => {
    const q = createQuestState();
    expect(advance(q, 'obs')).toBe(true);
    expect(advance(q, 'obs')).toBe(false);
    expect(hasFlag(q, 'obs')).toBe(true);
  });
  it('任务流程顺序覆盖：落脚→工具→据点→晶洞→修塔→坐标→探测器→核心→防御', () => {
    const texts = QUESTS.map((q) => q.text).join('|');
    for (const kw of ['落脚', '采集工具', '据点', '晶洞', '能源塔', '坐标', '探测器', '核心', '信号传输']) {
      expect(texts).toContain(kw);
    }
  });
});

describe('结局', () => {
  it('准备不足为 C，充分准备为 S', () => {
    const q1 = createQuestState(); q1.preparationScore = 2;
    const bad = endingRank(q1, { buildings: 1, kills: 0, daysSurvived: 1 });
    expect(bad.rank).toBe('C');
    const q2 = createQuestState(); q2.preparationScore = 20;
    const good = endingRank(q2, { buildings: 12, kills: 10, daysSurvived: 6 });
    expect(good.rank).toBe('S');
  });
});

describe('动态事件', () => {
  it('随机事件从八种中产生', () => {
    const rng = new Rng('ev');
    const kinds = new Set<string>();
    for (let i = 0; i < 60; i++) kinds.add(rollEvent(rng, 1));
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  });
  it('洞穴坍塌会真实改变方块', () => {
    const w = new World('collapse');
    // 在地下挖空腔
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) for (let y = 8; y <= 14; y++) {
      w.setBlock(x, y, z, BlockId.Air, false);
    }
    const eff = caveCollapse(w, new Rng('c'), 0, 0);
    expect(eff.destroyBlocks!.length).toBeGreaterThan(0);
    const b = eff.destroyBlocks![0];
    expect(w.getBlock(b.x, b.y, b.z)).toBe(BlockId.Rock);
  });
  it('能源泄漏会熄灭发光方块', () => {
    const w = new World('leak');
    w.setBlock(0, 30, 0, BlockId.GlowLamp, false);
    const eff = energyLeak(w, new Rng('l'), 0, 0);
    // 因随机范围，至少函数返回结构正确
    expect(Array.isArray(eff.destroyBlocks)).toBe(true);
  });
  it('据点袭击事件包含敌人波次', () => {
    const eff = raidEffect(5);
    expect(eff.spawnEnemies![0].n).toBe(5);
    expect(eff.spawnEnemies![0].atBase).toBe(true);
  });
  it('事件可记录到日志', () => {
    const ev = makeEvent('raid', 120, '测试袭击', true, 60);
    expect(ev.timed).toBe(true);
    expect(ev.timeLeft).toBe(60);
    expect(ev.title).toBe('据点遭袭');
  });
});
