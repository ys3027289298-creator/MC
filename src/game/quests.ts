// Main quest line with branching routes and multiple endings.

export interface QuestStage {
  id: number;
  title: string;
  hint: string;
}

export const QUESTS: QuestStage[] = [
  { id: 0, title: '荒原落脚', hint: '采集 8 块枯木与 6 个碎石，在荒原上活过第一天。' },
  { id: 1, title: '打造工具', hint: '制作石质采集锤与燧石切割斧。' },
  { id: 2, title: '建立据点', hint: '放置工作台、储物箱与火盆，并用方块围出庇护所。' },
  { id: 3, title: '晶洞探索', hint: '前往地下晶洞，取得 2 个能源晶体。' },
  { id: 4, title: '修复能源塔', hint: '在废弃能源塔塔顶安装塔心中继器，并放置电池组。' },
  { id: 5, title: '观测站坐标', hint: '在失落观测站找到地脉坐标图。' },
  { id: 6, title: '地脉探测器', hint: '在工作台上制作地脉探测器。' },
  { id: 7, title: '深入禁区', hint: '携带装备进入地脉禁区，安放地脉核心座。' },
  { id: 8, title: '信号传输', hint: '在最终袭击中保护能源塔 90 秒，并用信号引灯完成传输。' },
  { id: 9, title: '荒原黎明', hint: '主线完成。' }
];

export interface QuestProgress {
  stage: number;
  flags: Record<string, boolean>;
  route: 'fortify' | 'salvage'; // two task routes
  routeChosen: boolean;
  finished: boolean;
  ending: string;
}

export function createQuestProgress(): QuestProgress {
  return { stage: 0, flags: {}, route: 'fortify', routeChosen: false, finished: false, ending: '' };
}

export interface QuestContext {
  hasItem: (id: string, n?: number) => boolean;
  placedBlocks: Set<number>;
  nearSite: (kind: string, radius?: number) => boolean;
  towerRepaired: boolean;
  corePlaced: boolean;
  finalDefended: boolean;
}

export function advanceQuest(p: QuestProgress, ctx: QuestContext): string[] {
  const updates: string[] = [];
  const setFlag = (f: string) => {
    if (!p.flags[f]) {
      p.flags[f] = true;
      updates.push(f);
    }
  };
  // auto-track achievements
  if (ctx.hasItem('deadwood_log', 8) && ctx.hasItem('gravel_bit', 6)) setFlag('gather0');
  if (ctx.hasItem('stone_hammer') && ctx.hasItem('flint_axe')) setFlag('tools1');
  if (
    ctx.placedBlocks.has(23) &&
    ctx.placedBlocks.has(24) &&
    ctx.placedBlocks.has(22)
  ) {
    setFlag('base2');
  }
  if (ctx.hasItem('energy_crystal', 2) || ctx.hasItem('raw_crystal', 4)) setFlag('geode3');
  if (ctx.towerRepaired) setFlag('tower4');
  if (ctx.hasItem('observatory_chart')) setFlag('obs5');
  if (ctx.hasItem('ley_detector')) setFlag('detector6');
  if (ctx.corePlaced) setFlag('core7');
  if (ctx.finalDefended) setFlag('final8');

  const required = ['gather0', 'tools1', 'base2', 'geode3', 'tower4', 'obs5', 'detector6', 'core7', 'final8'];
  while (p.stage < required.length && p.flags[required[p.stage]]) {
    p.stage++;
  }
  if (p.stage >= required.length && !p.finished) {
    p.finished = true;
    p.stage = 9;
  }
  return updates;
}

export interface EndingInput {
  finished: boolean;
  buildings: number;
  kills: number;
  daysSurvived: number;
  health: number;
  hasArmor: boolean;
  route: 'fortify' | 'salvage';
  towerIntact: boolean;
}

export function evaluateEnding(input: EndingInput): { id: string; title: string; text: string } {
  if (!input.finished) {
    return {
      id: 'lost',
      title: '荒原余烬',
      text: '你倒在了寻找地脉的路上，但荒原会记住每一束火光。'
    };
  }
  const score =
    input.buildings * 2 +
    input.kills +
    input.daysSurvived * 3 +
    (input.hasArmor ? 10 : 0) +
    (input.towerIntact ? 15 : 0) +
    (input.health > 50 ? 8 : 0);
  if (score >= 95) {
    return {
      id: 'golden',
      title: input.route === 'fortify' ? '结局：不熄灯塔' : '结局：拾荒者黎明',
      text:
        input.route === 'fortify'
          ? '能源塔在你的工事守护下完整运转，荒原第一次拥有了永不熄灭的灯塔。'
          : '你用旧文明的残片拼出了新的信号，拾荒者们循着光重聚于荒原。'
    };
  }
  if (score >= 55) {
    return {
      id: 'silver',
      title: '结局：断续信号',
      text: '信号勉强穿越风暴。地脉被唤醒，但荒原仍需要更多守望者。'
    };
  }
  return {
    id: 'bronze',
    title: '结局：惨胜黎明',
    text: '核心在最后一刻启动，代价惨重。黎明到来时，你几乎站不稳。'
  };
}
