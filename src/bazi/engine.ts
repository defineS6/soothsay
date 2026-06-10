import { Lunar, LunarUtil, Solar } from './lunar';
import {
  BRANCH_ELEMENTS,
  HIDDEN_STEMS,
  STEM_ELEMENTS,
  createFiveElementStats,
  getBranchRelations,
  getElementRelation
} from './relations';
import {
  formatCivilDateTime,
  getTrueSolarCorrectionMinutes,
  normalizeCivilDateTime
} from './solar-time';
import type {
  BaziChart,
  BirthDateTimeInput,
  CivilDateTime,
  DailyFortuneBasis,
  FiveElement,
  Pillar,
  PillarName
} from './types';

const PILLAR_LABELS: Record<PillarName, string> = {
  year: '年柱',
  month: '月柱',
  day: '日柱',
  hour: '时柱'
};

const PILLAR_NAMES: PillarName[] = ['year', 'month', 'day', 'hour'];

function assertBirthInput(input: BirthDateTimeInput) {
  if (input.calendarType === 'bazi') return;
  if (input.year < 1 || input.month < 1 || input.month > 12 || input.day < 1 || input.day > 31) {
    throw new Error('出生日期超出可排盘范围');
  }
  if (input.hour < 0 || input.hour > 23 || input.minute < 0 || input.minute > 59) {
    throw new Error('出生时间必须落在 00:00 至 23:59');
  }
  if (input.location && (input.location.longitude < -180 || input.location.longitude > 180)) {
    throw new Error('出生地经度必须落在 -180 至 180 度之间');
  }
}

function toCivilFromInput(input: BirthDateTimeInput): CivilDateTime {
  if (input.calendarType === 'solar') {
    return {
      year: input.year,
      month: input.month,
      day: input.day,
      hour: input.hour,
      minute: input.minute,
      second: 0
    };
  }

  const month = input.isLeapMonth ? -input.month : input.month;
  const lunar = Lunar.fromYmdHms(input.year, month, input.day, input.hour, input.minute, 0);
  const solar = lunar.getSolar();
  return {
    year: solar.getYear(),
    month: solar.getMonth(),
    day: solar.getDay(),
    hour: solar.getHour(),
    minute: solar.getMinute(),
    second: solar.getSecond()
  };
}

function createSolar(parts: CivilDateTime) {
  return Solar.fromYmdHms(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
}

function splitGanZhi(ganZhi: string) {
  return {
    gan: ganZhi.slice(0, 1),
    zhi: ganZhi.slice(1, 2)
  };
}

function assertGanZhi(value: string, label: string) {
  const normalized = value.trim();
  if (normalized.length !== 2) {
    throw new Error(`${label}必须是两个汉字的干支，例如 甲子`);
  }
  const { gan, zhi } = splitGanZhi(normalized);
  if (!STEM_ELEMENTS[gan] || !BRANCH_ELEMENTS[zhi]) {
    throw new Error(`${label}干支不合法，请填写天干 + 地支，例如 甲子`);
  }
  return normalized;
}

function ensureArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPillar(name: PillarName, eightChar: any): Pillar {
  const methodKey = name === 'hour' ? 'Time' : name[0].toUpperCase() + name.slice(1);
  const ganZhi = String(eightChar[`get${methodKey}`]());
  const { gan, zhi } = splitGanZhi(ganZhi);
  return {
    name,
    label: PILLAR_LABELS[name],
    gan,
    zhi,
    ganZhi,
    hiddenGan: ensureArray(eightChar[`get${methodKey}HideGan`]?.() ?? HIDDEN_STEMS[zhi]),
    hiddenGanTenGods: ensureArray(eightChar[`get${methodKey}ShiShenZhi`]()),
    tenGodOfGan: String(eightChar[`get${methodKey}ShiShenGan`]()),
    naYin: String(eightChar[`get${methodKey}NaYin`]()),
    diShi: String(eightChar[`get${methodKey}DiShi`]()),
    ganElement: STEM_ELEMENTS[gan],
    zhiElement: BRANCH_ELEMENTS[zhi]
  };
}

function getDiShi(dayGan: string, zhi: string) {
  const offset = LunarUtil.CHANG_SHENG_OFFSET[dayGan];
  const dayGanIndex = LunarUtil.GAN.indexOf(dayGan) - 1;
  const zhiIndex = LunarUtil.ZHI.indexOf(zhi) - 1;
  let index = offset + (dayGanIndex % 2 === 0 ? zhiIndex : -zhiIndex);
  if (index >= 12) index -= 12;
  if (index < 0) index += 12;
  return LunarUtil.CHANG_SHENG[index];
}

function buildManualPillar(name: PillarName, ganZhi: string, dayGan: string): Pillar {
  const normalized = assertGanZhi(ganZhi, PILLAR_LABELS[name]);
  const { gan, zhi } = splitGanZhi(normalized);
  const hiddenGan = HIDDEN_STEMS[zhi] ?? [];
  return {
    name,
    label: PILLAR_LABELS[name],
    gan,
    zhi,
    ganZhi: normalized,
    hiddenGan,
    hiddenGanTenGods: hiddenGan.map((item) => LunarUtil.SHI_SHEN[dayGan + item]),
    tenGodOfGan: name === 'day' ? '日主' : LunarUtil.SHI_SHEN[dayGan + gan],
    naYin: LunarUtil.NAYIN[normalized],
    diShi: getDiShi(dayGan, zhi),
    ganElement: STEM_ELEMENTS[gan],
    zhiElement: BRANCH_ELEMENTS[zhi]
  };
}

function buildUnavailableLuck(): BaziChart['luck'] {
  return {
    startAgeText: '需出生时间计算',
    startYear: 0,
    startMonth: 0,
    startDay: 0,
    startSolarDate: '',
    direction: 'forward',
    cycles: []
  };
}

function applyZiHourPolicy(eightChar: any, parts: CivilDateTime, input: BirthDateTimeInput) {
  const policy = input.ziHourPolicy ?? 'lateZiNextDay';
  if (policy === 'lateZiNextDay' && parts.hour === 23 && typeof eightChar.setSect === 'function') {
    eightChar.setSect(1);
  }
}

function buildLuck(eightChar: any, input: BirthDateTimeInput) {
  const gender = input.gender === 'male' ? 1 : 0;
  const yun = eightChar.getYun(gender, 2);
  const cycles = yun
    .getDaYun(9)
    .map((cycle: any) => ({
      index: cycle.getIndex(),
      ganZhi: String(cycle.getGanZhi()),
      startYear: cycle.getStartYear(),
      endYear: cycle.getEndYear(),
      startAge: cycle.getStartAge(),
      endAge: cycle.getEndAge()
    }))
    .filter((cycle: { index: number }) => cycle.index > 0);

  return {
    startAgeText: `${yun.getStartYear()}岁${yun.getStartMonth()}个月${yun.getStartDay()}天`,
    startYear: yun.getStartYear(),
    startMonth: yun.getStartMonth(),
    startDay: yun.getStartDay(),
    startSolarDate: String(yun.getStartSolar().toYmd()),
    direction: yun.isForward() ? 'forward' : 'backward',
    cycles
  } as const;
}

function buildDailyBasis(dayMasterElement: FiveElement, pillars: Record<PillarName, Pillar>, now: Date): DailyFortuneBasis {
  const todaySolar = Solar.fromYmdHms(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds()
  );
  const todayLunar = todaySolar.getLunar();
  const ganZhi = String(todayLunar.getDayInGanZhiExact());
  const { gan, zhi } = splitGanZhi(ganZhi);
  const todayElement = STEM_ELEMENTS[gan];

  return {
    date: todaySolar.toYmd(),
    ganZhi,
    gan,
    zhi,
    relationToDayMaster: getElementRelation(dayMasterElement, todayElement),
    relationsToNatal: PILLAR_NAMES.map((name) => {
      const pillar = pillars[name];
      return {
        target: pillar.label,
        targetGanZhi: pillar.ganZhi,
        dayStemRelation: getElementRelation(pillar.ganElement, todayElement),
        branchRelations: getBranchRelations(zhi, pillar.zhi)
      };
    })
  };
}

export function createBaziChart(input: BirthDateTimeInput, now = new Date()): BaziChart {
  assertBirthInput(input);

  if (input.calendarType === 'bazi') {
    const directPillars = input.directPillars;
    if (!directPillars) {
      throw new Error('请填写四柱八字');
    }
    const dayGanZhi = assertGanZhi(directPillars.day, '日柱');
    const dayGan = splitGanZhi(dayGanZhi).gan;
    const pillarArray = PILLAR_NAMES.map((name) => buildManualPillar(name, directPillars[name], dayGan));
    const pillars = Object.fromEntries(pillarArray.map((pillar) => [pillar.name, pillar])) as Record<PillarName, Pillar>;
    const dayMaster = {
      gan: pillars.day.gan,
      element: STEM_ELEMENTS[pillars.day.gan]
    };
    const notes = ['已使用手动输入的四柱八字；因缺少出生日期时间，无法计算真太阳时、农历日期、起运岁数与大运序列。'];
    const chart: BaziChart = {
      input,
      source: 'manual-pillars',
      solarDateTime: null,
      lunarDateText: '手动输入四柱',
      trueSolarTime: {
        enabled: false,
        degraded: true,
        equationOfTimeMinutes: 0,
        longitudeCorrectionMinutes: 0,
        totalCorrectionMinutes: 0,
        civilTime: null,
        correctedTime: null,
        warning: '手动四柱模式不计算真太阳时'
      },
      pillars,
      dayMaster,
      fiveElementStats: createFiveElementStats(pillarArray),
      luck: buildUnavailableLuck(),
      daily: buildDailyBasis(dayMaster.element, pillars, now),
      notes,
      promptFacts: {}
    };

    chart.promptFacts = {
      source: 'manual-pillars',
      solarDateTime: null,
      lunarDateText: chart.lunarDateText,
      pillars: chart.pillars,
      dayMaster: chart.dayMaster,
      fiveElementStats: chart.fiveElementStats,
      luck: chart.luck,
      daily: chart.daily,
      notes: chart.notes
    };

    return chart;
  }

  const civilTime = toCivilFromInput(input);
  const correction = input.location
    ? getTrueSolarCorrectionMinutes(civilTime, input.location.longitude)
    : {
        equationOfTimeMinutes: 0,
        longitudeCorrectionMinutes: 0,
        totalCorrectionMinutes: 0
      };
  const correctedTime = input.location
    ? normalizeCivilDateTime(civilTime, correction.totalCorrectionMinutes)
    : civilTime;

  const solar = createSolar(correctedTime);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();
  applyZiHourPolicy(eightChar, correctedTime, input);

  const pillarArray = PILLAR_NAMES.map((name) => buildPillar(name, eightChar));
  const pillars = Object.fromEntries(pillarArray.map((pillar) => [pillar.name, pillar])) as Record<PillarName, Pillar>;
  const dayMaster = {
    gan: pillars.day.gan,
    element: STEM_ELEMENTS[pillars.day.gan]
  };
  const notes = input.location
    ? [`已按${input.location.name ?? '出生地'}经度 ${input.location.longitude}° 校正真太阳时。`]
    : ['未提供出生地经度，已使用钟表时间排盘；时柱可能因真太阳时未校正存在偏差。'];
  if ((input.ziHourPolicy ?? 'lateZiNextDay') === 'lateZiNextDay' && correctedTime.hour === 23) {
    notes.push('出生时间落在晚子时，日柱按子初换日规则处理。');
  }

  const chart: BaziChart = {
    input,
    source: 'datetime',
    solarDateTime: correctedTime,
    lunarDateText: String(lunar.toString()),
    trueSolarTime: {
      enabled: Boolean(input.location),
      degraded: !input.location,
      longitude: input.location?.longitude,
      equationOfTimeMinutes: Number(correction.equationOfTimeMinutes.toFixed(2)),
      longitudeCorrectionMinutes: Number(correction.longitudeCorrectionMinutes.toFixed(2)),
      totalCorrectionMinutes: Number(correction.totalCorrectionMinutes.toFixed(2)),
      civilTime,
      correctedTime,
      warning: input.location ? undefined : '未提供出生地，经度与均时差校正未启用'
    },
    pillars,
    dayMaster,
    fiveElementStats: createFiveElementStats(pillarArray),
    luck: buildLuck(eightChar, input),
    daily: buildDailyBasis(dayMaster.element, pillars, now),
    notes,
    promptFacts: {}
  };

  chart.promptFacts = {
    solarDateTime: formatCivilDateTime(correctedTime),
    lunarDateText: chart.lunarDateText,
    pillars: chart.pillars,
    dayMaster: chart.dayMaster,
    fiveElementStats: chart.fiveElementStats,
    luck: chart.luck,
    daily: chart.daily,
    notes: chart.notes
  };

  return chart;
}
