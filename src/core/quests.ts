// 主线任务（0..9），以及两条路线差异
export interface QuestDef {
  id: number;
  text: string;
  hint: string;
}

export const QUESTS: QuestDef[] = [
  { id: 0, text: '找到荒原中的临时落脚点', hint: '在荒原上采集棘木与碎石，保持移动寻找安全空地。' },
  { id: 1, text: '制作基础采集工具（斧与锤）', hint: '按 E 打开制作界面，制作燧石切割斧与石质采集锤。' },
  { id: 2, text: '建立据点：放置工作台、火盆与储物箱', hint: '制作并放置三种据点设施。' },
  { id: 3, text: '探索地下晶洞并取得能源晶体', hint: '向下挖掘进入洞穴，找到发光的晶洞（地图深处的空腔）。' },
  { id: 4, text: '修复废弃能源塔', hint: '用蚀化金属、合金与晶体制作塔体修复件，前往能源塔互动。' },
  { id: 5, text: '在失落观测站取得地脉坐标', hint: '打开观测站内的储物箱，获得地脉坐标盘。' },
  { id: 6, text: '制作地脉探测器', hint: '在工作台旁合成地脉探测器。' },
  { id: 7, text: '进入危险区域启动地脉核心', hint: '跟随探测器找到地脉核心并互动启动。' },
  { id: 8, text: '在最终事件中保护能源塔并完成信号传输', hint: '坚守能源塔，击退三波敌人，同时持有信号传输芯片。' },
  { id: 9, text: '信号传输完成', hint: '' },
];

export interface QuestState {
  stage: number;
  flags: Record<string, boolean>;
  route: 'fortify' | 'salvage'; // 两条路线：重防据守 / 机动回收
  preparationScore: number;
}

export function createQuestState(): QuestState {
  return { stage: 0, flags: {}, route: 'fortify', preparationScore: 0 };
}

export function advance(q: QuestState, flag: string): boolean {
  if (q.flags[flag]) return false;
  q.flags[flag] = true;
  return true;
}

export function hasFlag(q: QuestState, flag: string): boolean {
  return !!q.flags[flag];
}

export function setStage(q: QuestState, n: number): void {
  q.stage = Math.max(q.stage, n);
}

// 结局评级依据准备程度
export function endingRank(q: QuestState, stats: { buildings: number; kills: number; daysSurvived: number }): { rank: string; title: string; text: string } {
  const score = q.preparationScore + Math.min(10, stats.buildings) + Math.min(8, stats.kills) + Math.min(6, stats.daysSurvived);
  if (score >= 28) return { rank: 'S', title: '地脉启明', text: '凭借完备的据点、装备与补给，你在最终冲击中几乎毫发无损。失落地脉的信号穿透荒原，幸存者们循着光芒归来——你成为新据点的奠基者。' };
  if (score >= 18) return { rank: 'A', title: '微弱回响', text: '信号成功发出，但能源塔在最后冲击中受损严重。远方或许已经收到了坐标，而代价是你几近耗尽的补给与残破的护具。' };
  return { rank: 'C', title: '孤注一掷', text: '你勉强完成了传输。核心之光在风暴中明灭不定，没有人知道信号是否被接收。荒原依旧辽阔，而你必须继续活下去。' };
}
