import {
  CONTROLS,
  GENERATES,
  getWeightedHiddenStems
} from './relations';
import type {
  ChartStrength,
  CivilDateTime,
  FiveElement,
  HiddenStemLevel,
  MonthCommand,
  Pillar,
  PillarName,
  SeasonalState
} from './types';

interface StrengthOptions {
  source: 'datetime' | 'manual-pillars';
  birthTime: CivilDateTime | null;
  daysFromPreviousTerm?: number;
}

const ELEMENTS: FiveElement[] = ['木', '火', '土', '金', '水'];

function createEmptyEnergy(): Record<FiveElement, number> {
  return { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
}

function round(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function getSupportingElement(dayMaster: FiveElement) {
  return ELEMENTS.find((element) => GENERATES[element] === dayMaster)!;
}

function chooseCommandStem(monthPillar: Pillar, options: StrengthOptions): MonthCommand {
  const weighted = getWeightedHiddenStems(monthPillar.zhi);
  const main = weighted[0];
  if (!main) {
    return {
      branch: monthPillar.zhi,
      stem: monthPillar.gan,
      element: monthPillar.ganElement,
      level: '本气',
      source: '降级'
    };
  }

  if (options.source === 'manual-pillars' || options.daysFromPreviousTerm == null) {
    return {
      branch: monthPillar.zhi,
      stem: main.stem,
      element: main.element,
      level: main.level,
      source: '月支本气'
    };
  }

  const byLevel = new Map<HiddenStemLevel, typeof main>();
  for (const item of weighted) {
    byLevel.set(item.level, item);
  }
  const days = Math.max(0, options.daysFromPreviousTerm);
  const selected =
    (days <= 7 && byLevel.get('余气')) ||
    (days <= 14 && byLevel.get('中气')) ||
    byLevel.get('本气') ||
    main;

  return {
    branch: monthPillar.zhi,
    stem: selected.stem,
    element: selected.element,
    level: selected.level,
    source: '节气推算',
    daysFromPreviousTerm: days
  };
}

function getSeasonalState(element: FiveElement, monthElement: FiveElement): SeasonalState {
  if (element === monthElement) return '旺';
  if (GENERATES[monthElement] === element) return '相';
  if (GENERATES[element] === monthElement) return '休';
  if (CONTROLS[element] === monthElement) return '囚';
  return '死';
}

function getSeasonalStates(monthElement: FiveElement): Record<FiveElement, SeasonalState> {
  return {
    木: getSeasonalState('木', monthElement),
    火: getSeasonalState('火', monthElement),
    土: getSeasonalState('土', monthElement),
    金: getSeasonalState('金', monthElement),
    水: getSeasonalState('水', monthElement)
  };
}

function calculateEnergy(pillars: Pillar[]) {
  const energy = createEmptyEnergy();
  for (const pillar of pillars) {
    energy[pillar.ganElement] += 1;
    for (const hidden of getWeightedHiddenStems(pillar.zhi)) {
      energy[hidden.element] += hidden.weight;
    }
  }
  for (const element of ELEMENTS) {
    energy[element] = round(energy[element]);
  }
  return energy;
}

function toPercentages(energy: Record<FiveElement, number>) {
  const total = ELEMENTS.reduce((sum, element) => sum + energy[element], 0);
  const percentages = createEmptyEnergy();
  if (!total) return percentages;
  for (const element of ELEMENTS) {
    percentages[element] = round((energy[element] / total) * 100, 1);
  }
  return percentages;
}

function scoreDeLing(state: SeasonalState) {
  if (state === '旺') return 2;
  if (state === '相') return 1.5;
  if (state === '休') return 0.75;
  return 0.25;
}

function scoreDeDi(pillars: Pillar[], dayMaster: FiveElement) {
  let rootScore = 0;
  const rootedAt: string[] = [];
  for (const pillar of pillars) {
    for (const hidden of getWeightedHiddenStems(pillar.zhi)) {
      if (hidden.element !== dayMaster) continue;
      rootScore += hidden.level === '本气' ? 1 : hidden.level === '中气' ? 0.5 : 0.3;
      rootedAt.push(`${pillar.label}${hidden.stem}${hidden.level}`);
    }
  }
  return {
    matched: rootScore > 0,
    score: Math.min(2, round(rootScore)),
    reason: rootedAt.length ? `通根于${rootedAt.join('、')}` : '地支藏干未见同气根'
  };
}

export function createBaziStrength(pillars: Record<PillarName, Pillar>, options: StrengthOptions): ChartStrength {
  const pillarList = Object.values(pillars);
  const dayMaster = pillars.day.ganElement;
  const monthCommand = chooseCommandStem(pillars.month, options);
  const weightedEnergy = calculateEnergy(pillarList);
  const percentages = toPercentages(weightedEnergy);
  const seasonalStates = getSeasonalStates(monthCommand.element);
  const dayMasterState = seasonalStates[dayMaster];
  const supportingElement = getSupportingElement(dayMaster);
  const supportivePercent = percentages[dayMaster] + percentages[supportingElement];
  const deLingScore = scoreDeLing(dayMasterState);
  const deDi = scoreDeDi(pillarList, dayMaster);
  const deShiScore = supportivePercent >= 45 ? 2 : supportivePercent >= 35 ? 1.25 : supportivePercent >= 25 ? 0.75 : 0.25;
  const score = round(deLingScore + deDi.score + deShiScore);
  const conclusion = score >= 4.2 ? '身强' : score <= 2 ? '身弱' : '均衡';

  return {
    weightedEnergy,
    percentages,
    monthCommand,
    seasonalStates,
    dayMasterState,
    dayMasterStrength: {
      conclusion,
      score,
      deLing: {
        matched: dayMasterState === '旺' || dayMasterState === '相',
        score: deLingScore,
        reason: `日主${dayMaster}在${monthCommand.stem}${monthCommand.level}司令下为${dayMasterState}`
      },
      deDi,
      deShi: {
        matched: supportivePercent >= 35,
        score: deShiScore,
        reason: `同气${dayMaster}${percentages[dayMaster]}%，生扶${supportingElement}${percentages[supportingElement]}%，合计${round(supportivePercent, 1)}%`
      }
    }
  };
}
