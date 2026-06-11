import type {
  ChartBranchRelation,
  ChartRelations,
  ChartStemRelation,
  FiveElement,
  HiddenStemLevel,
  Pillar,
  PillarName,
  WeightedHiddenStem
} from './types';

export const STEM_ELEMENTS: Record<string, FiveElement> = {
  甲: '木',
  乙: '木',
  丙: '火',
  丁: '火',
  戊: '土',
  己: '土',
  庚: '金',
  辛: '金',
  壬: '水',
  癸: '水'
};

export const BRANCH_ELEMENTS: Record<string, FiveElement> = {
  子: '水',
  丑: '土',
  寅: '木',
  卯: '木',
  辰: '土',
  巳: '火',
  午: '火',
  未: '土',
  申: '金',
  酉: '金',
  戌: '土',
  亥: '水'
};

export const HIDDEN_STEMS: Record<string, string[]> = {
  子: ['癸'],
  丑: ['己', '癸', '辛'],
  寅: ['甲', '丙', '戊'],
  卯: ['乙'],
  辰: ['戊', '乙', '癸'],
  巳: ['丙', '戊', '庚'],
  午: ['丁', '己'],
  未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'],
  酉: ['辛'],
  戌: ['戊', '辛', '丁'],
  亥: ['壬', '甲']
};

export const HIDDEN_STEM_LEVEL_WEIGHTS: Record<HiddenStemLevel, number> = {
  本气: 1,
  中气: 0.3,
  余气: 0.2
};

export const GENERATES: Record<FiveElement, FiveElement> = {
  木: '火',
  火: '土',
  土: '金',
  金: '水',
  水: '木'
};

export const CONTROLS: Record<FiveElement, FiveElement> = {
  木: '土',
  土: '水',
  水: '火',
  火: '金',
  金: '木'
};

export const BRANCH_PAIRS: Record<string, string[]> = {
  冲: ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'],
  合: ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'],
  害: ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'],
  刑: ['子卯', '寅巳', '巳申', '丑戌', '戌未', '丑未', '辰辰', '午午', '酉酉', '亥亥'],
  半合: ['申子', '子辰', '寅午', '午戌', '巳酉', '酉丑', '亥卯', '卯未']
};

export const STEM_COMBINATIONS: Array<{ pair: string; name: string; element: FiveElement }> = [
  { pair: '甲己', name: '甲己合土', element: '土' },
  { pair: '乙庚', name: '乙庚合金', element: '金' },
  { pair: '丙辛', name: '丙辛合水', element: '水' },
  { pair: '丁壬', name: '丁壬合木', element: '木' },
  { pair: '戊癸', name: '戊癸合火', element: '火' }
];

export const STEM_CLASHES: Array<{ pair: string; name: string }> = [
  { pair: '甲庚', name: '甲庚冲' },
  { pair: '乙辛', name: '乙辛冲' },
  { pair: '丙壬', name: '丙壬冲' },
  { pair: '丁癸', name: '丁癸冲' }
];

export const SAN_HE_GROUPS: Array<{ branches: string[]; name: string; element: FiveElement }> = [
  { branches: ['申', '子', '辰'], name: '申子辰三合水局', element: '水' },
  { branches: ['寅', '午', '戌'], name: '寅午戌三合火局', element: '火' },
  { branches: ['巳', '酉', '丑'], name: '巳酉丑三合金局', element: '金' },
  { branches: ['亥', '卯', '未'], name: '亥卯未三合木局', element: '木' }
];

export const SAN_HUI_GROUPS: Array<{ branches: string[]; name: string; element: FiveElement }> = [
  { branches: ['寅', '卯', '辰'], name: '寅卯辰三会木局', element: '木' },
  { branches: ['巳', '午', '未'], name: '巳午未三会火局', element: '火' },
  { branches: ['申', '酉', '戌'], name: '申酉戌三会金局', element: '金' },
  { branches: ['亥', '子', '丑'], name: '亥子丑三会水局', element: '水' }
];

const PILLAR_NAMES: PillarName[] = ['year', 'month', 'day', 'hour'];
const HIDDEN_STEM_LEVELS: HiddenStemLevel[] = ['本气', '中气', '余气'];

const BRANCH_RELATION_LABELS: Record<string, ChartBranchRelation['type']> = {
  冲: '六冲',
  合: '六合',
  害: '相害',
  刑: '相刑',
  半合: '半合'
};

function hasPair(pairs: string[], a: string, b: string) {
  const normalized = `${a}${b}`;
  const reversed = `${b}${a}`;
  return pairs.includes(normalized) || pairs.includes(reversed);
}

function hasAllBranches(group: string[], branches: string[]) {
  return group.every((branch) => branches.includes(branch));
}

function firstPillarByBranch(pillars: Record<PillarName, Pillar>, branch: string) {
  return PILLAR_NAMES.find((name) => pillars[name].zhi === branch);
}

function buildStemRelation(
  type: ChartStemRelation['type'],
  name: string,
  left: Pillar,
  right: Pillar,
  element?: FiveElement
): ChartStemRelation {
  return {
    type,
    name,
    pillars: [left.name, right.name],
    stems: [left.gan, right.gan],
    ganZhi: [left.ganZhi, right.ganZhi],
    description: `${left.label}${left.gan} 与 ${right.label}${right.gan} ${name}`,
    element
  };
}

function buildBranchRelation(
  type: ChartBranchRelation['type'],
  name: string,
  pillars: Pillar[],
  branches: string[],
  element?: FiveElement
): ChartBranchRelation {
  return {
    type,
    name,
    pillars: pillars.map((pillar) => pillar.name),
    branches,
    ganZhi: pillars.map((pillar) => pillar.ganZhi),
    description: `${pillars.map((pillar) => `${pillar.label}${pillar.zhi}`).join('、')} ${name}`,
    element
  };
}

export function getWeightedHiddenStems(branch: string): WeightedHiddenStem[] {
  return (HIDDEN_STEMS[branch] ?? []).map((stem, index) => {
    const level = HIDDEN_STEM_LEVELS[index] ?? '余气';
    return {
      stem,
      element: STEM_ELEMENTS[stem],
      level,
      weight: HIDDEN_STEM_LEVEL_WEIGHTS[level]
    };
  });
}

export function getSanHeGroupByBranch(branch: string) {
  return SAN_HE_GROUPS.find((group) => group.branches.includes(branch));
}

export function getElementRelation(self: FiveElement, other: FiveElement): string {
  if (self === other) return '同气';
  if (GENERATES[self] === other) return '我生';
  if (GENERATES[other] === self) return '生我';
  if (CONTROLS[self] === other) return '我克';
  if (CONTROLS[other] === self) return '克我';
  return '无明显生克';
}

export function getBranchRelations(source: string, target: string): string[] {
  return Object.entries(BRANCH_PAIRS)
    .filter(([, pairs]) => hasPair(pairs, source, target))
    .map(([name]) => name);
}

export function getChartRelations(pillars: Record<PillarName, Pillar>): ChartRelations {
  const stems: ChartStemRelation[] = [];
  const branches: ChartBranchRelation[] = [];
  const pillarList = PILLAR_NAMES.map((name) => pillars[name]);

  for (let i = 0; i < pillarList.length; i += 1) {
    for (let j = i + 1; j < pillarList.length; j += 1) {
      const left = pillarList[i];
      const right = pillarList[j];
      const stemPair = `${left.gan}${right.gan}`;
      const reversedStemPair = `${right.gan}${left.gan}`;

      for (const item of STEM_COMBINATIONS) {
        if (item.pair === stemPair || item.pair === reversedStemPair) {
          stems.push(buildStemRelation('五合', item.name, left, right, item.element));
        }
      }

      for (const item of STEM_CLASHES) {
        if (item.pair === stemPair || item.pair === reversedStemPair) {
          stems.push(buildStemRelation('相冲', item.name, left, right));
        }
      }

      for (const [key, pairs] of Object.entries(BRANCH_PAIRS)) {
        if (!hasPair(pairs, left.zhi, right.zhi)) continue;
        const type = left.zhi === right.zhi && key === '刑' ? '自刑' : BRANCH_RELATION_LABELS[key];
        if (!type) continue;
        branches.push(buildBranchRelation(type, `${left.zhi}${right.zhi}${type}`, [left, right], [left.zhi, right.zhi]));
      }
    }
  }

  const branchList = pillarList.map((pillar) => pillar.zhi);
  for (const group of SAN_HE_GROUPS) {
    if (!hasAllBranches(group.branches, branchList)) continue;
    const matchedNames = group.branches.map((branch) => firstPillarByBranch(pillars, branch)).filter(Boolean) as PillarName[];
    branches.push(
      buildBranchRelation(
        '三合局',
        group.name,
        matchedNames.map((name) => pillars[name]),
        group.branches,
        group.element
      )
    );
  }

  for (const group of SAN_HUI_GROUPS) {
    if (!hasAllBranches(group.branches, branchList)) continue;
    const matchedNames = group.branches.map((branch) => firstPillarByBranch(pillars, branch)).filter(Boolean) as PillarName[];
    branches.push(
      buildBranchRelation(
        '三会局',
        group.name,
        matchedNames.map((name) => pillars[name]),
        group.branches,
        group.element
      )
    );
  }

  return { stems, branches };
}

export function createFiveElementStats(pillars: Pillar[]): Record<FiveElement, number> {
  const stats: Record<FiveElement, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const pillar of pillars) {
    stats[pillar.ganElement] += 1;
    stats[pillar.zhiElement] += 1;
    for (const hiddenGan of pillar.hiddenGan) {
      stats[STEM_ELEMENTS[hiddenGan]] += 0.5;
    }
  }
  return stats;
}
