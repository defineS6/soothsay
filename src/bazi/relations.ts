import type { FiveElement, Pillar } from './types';

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

const GENERATES: Record<FiveElement, FiveElement> = {
  木: '火',
  火: '土',
  土: '金',
  金: '水',
  水: '木'
};

const CONTROLS: Record<FiveElement, FiveElement> = {
  木: '土',
  土: '水',
  水: '火',
  火: '金',
  金: '木'
};

const BRANCH_PAIRS: Record<string, string[]> = {
  冲: ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'],
  合: ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'],
  害: ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'],
  刑: ['子卯', '寅巳', '巳申', '丑戌', '戌未', '丑未', '辰辰', '午午', '酉酉', '亥亥']
};

export function getElementRelation(self: FiveElement, other: FiveElement): string {
  if (self === other) return '同气';
  if (GENERATES[self] === other) return '我生';
  if (GENERATES[other] === self) return '生我';
  if (CONTROLS[self] === other) return '我克';
  if (CONTROLS[other] === self) return '克我';
  return '无明显生克';
}

export function getBranchRelations(source: string, target: string): string[] {
  const normalized = `${source}${target}`;
  const reversed = `${target}${source}`;
  return Object.entries(BRANCH_PAIRS)
    .filter(([, pairs]) => pairs.includes(normalized) || pairs.includes(reversed))
    .map(([name]) => name);
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
