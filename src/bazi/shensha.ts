import { BRANCH_ELEMENTS, STEM_ELEMENTS, getSanHeGroupByBranch } from './relations';
import type { Pillar } from './types';

export interface ShenShaContext {
  yearBranch: string;
  monthBranch: string;
  dayStem: string;
  dayBranch: string;
}

const TIAN_YI: Record<string, string[]> = {
  甲: ['丑', '未'],
  戊: ['丑', '未'],
  庚: ['丑', '未'],
  乙: ['子', '申'],
  己: ['子', '申'],
  丙: ['亥', '酉'],
  丁: ['亥', '酉'],
  壬: ['卯', '巳'],
  癸: ['卯', '巳'],
  辛: ['寅', '午']
};

const WEN_CHANG: Record<string, string> = {
  甲: '巳',
  乙: '午',
  丙: '申',
  丁: '酉',
  戊: '申',
  己: '酉',
  庚: '亥',
  辛: '子',
  壬: '寅',
  癸: '卯'
};

const LU_SHEN: Record<string, string> = {
  甲: '寅',
  乙: '卯',
  丙: '巳',
  丁: '午',
  戊: '巳',
  己: '午',
  庚: '申',
  辛: '酉',
  壬: '亥',
  癸: '子'
};

const YANG_REN: Record<string, string> = {
  甲: '卯',
  乙: '寅',
  丙: '午',
  丁: '巳',
  戊: '午',
  己: '巳',
  庚: '酉',
  辛: '申',
  壬: '子',
  癸: '亥'
};

const JIN_YU: Record<string, string> = {
  甲: '辰',
  乙: '巳',
  丙: '未',
  丁: '申',
  戊: '未',
  己: '申',
  庚: '戌',
  辛: '亥',
  壬: '丑',
  癸: '寅'
};

const SAN_HE_TARGETS: Record<string, Record<string, string>> = {
  '桃花（咸池）': { 水: '酉', 火: '卯', 金: '午', 木: '子' },
  驿马: { 水: '寅', 火: '申', 金: '亥', 木: '巳' },
  华盖: { 水: '辰', 火: '戌', 金: '丑', 木: '未' },
  将星: { 水: '子', 火: '午', 金: '酉', 木: '卯' }
};

const GU_CHEN_GUA_SU: Array<{ branches: string[]; guChen: string; guaSu: string }> = [
  { branches: ['亥', '子', '丑'], guChen: '寅', guaSu: '戌' },
  { branches: ['寅', '卯', '辰'], guChen: '巳', guaSu: '丑' },
  { branches: ['巳', '午', '未'], guChen: '申', guaSu: '辰' },
  { branches: ['申', '酉', '戌'], guChen: '亥', guaSu: '未' }
];

// 天德按月支取目标，目标可能落在天干或地支；月德按三合月局取天干。
const TIAN_DE: Record<string, string> = {
  寅: '丁',
  卯: '申',
  辰: '壬',
  巳: '辛',
  午: '亥',
  未: '甲',
  申: '癸',
  酉: '寅',
  戌: '丙',
  亥: '乙',
  子: '巳',
  丑: '庚'
};

const YUE_DE: Record<string, string> = {
  寅: '丙',
  午: '丙',
  戌: '丙',
  申: '壬',
  子: '壬',
  辰: '壬',
  亥: '甲',
  卯: '甲',
  未: '甲',
  巳: '庚',
  酉: '庚',
  丑: '庚'
};

function addIfBranchMatched(result: Set<string>, name: string, target: string | string[] | undefined, branch: string) {
  if (!target) return;
  const targets = Array.isArray(target) ? target : [target];
  if (targets.includes(branch)) {
    result.add(name);
  }
}

function addIfGanZhiMatched(result: Set<string>, name: string, target: string | undefined, pillar: Pillar) {
  if (!target) return;
  if (STEM_ELEMENTS[target] && pillar.gan === target) {
    result.add(name);
  }
  if (BRANCH_ELEMENTS[target] && pillar.zhi === target) {
    result.add(name);
  }
}

function addSanHeBasedShenSha(result: Set<string>, pillar: Pillar, baseBranch: string) {
  const group = getSanHeGroupByBranch(baseBranch);
  if (!group) return;
  for (const [name, targets] of Object.entries(SAN_HE_TARGETS)) {
    addIfBranchMatched(result, name, targets[group.element], pillar.zhi);
  }
}

export function getShenSha(pillar: Pillar, ctx: ShenShaContext): string[] {
  const result = new Set<string>();

  addIfBranchMatched(result, '天乙贵人', TIAN_YI[ctx.dayStem], pillar.zhi);
  addIfBranchMatched(result, '文昌贵人', WEN_CHANG[ctx.dayStem], pillar.zhi);
  addIfBranchMatched(result, '禄神', LU_SHEN[ctx.dayStem], pillar.zhi);
  addIfBranchMatched(result, '羊刃', YANG_REN[ctx.dayStem], pillar.zhi);
  addIfBranchMatched(result, '金舆', JIN_YU[ctx.dayStem], pillar.zhi);

  addSanHeBasedShenSha(result, pillar, ctx.yearBranch);
  addSanHeBasedShenSha(result, pillar, ctx.dayBranch);

  const gua = GU_CHEN_GUA_SU.find((item) => item.branches.includes(ctx.yearBranch));
  addIfBranchMatched(result, '孤辰', gua?.guChen, pillar.zhi);
  addIfBranchMatched(result, '寡宿', gua?.guaSu, pillar.zhi);

  addIfGanZhiMatched(result, '天德贵人', TIAN_DE[ctx.monthBranch], pillar);
  addIfGanZhiMatched(result, '月德贵人', YUE_DE[ctx.monthBranch], pillar);

  return Array.from(result);
}
