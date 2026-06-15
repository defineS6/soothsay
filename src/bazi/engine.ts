import { Lunar, LunarUtil, Solar } from './lunar';
import {
  BRANCH_ELEMENTS,
  HIDDEN_STEMS,
  STEM_ELEMENTS,
  createFiveElementStats,
  getBranchRelations,
  getChartRelations,
  getElementRelation
} from './relations';
import { getShenSha } from './shensha';
import {
  formatCivilDateTime,
  getTrueSolarCorrectionMinutes,
  normalizeCivilDateTime
} from './solar-time';
import { createBaziStrength } from './strength';
import type {
  BaziChart,
  BirthDateTimeInput,
  BirthSolarTerm,
  ChartFactor,
  CivilDateTime,
  DailyFortuneBasis,
  FiveElement,
  LuckTimeBasis,
  LuckCycle,
  LiuNian,
  MinorLuck,
  Pillar,
  PillarName,
  SolarTermInfo
} from './types';

const PILLAR_LABELS: Record<PillarName, string> = {
  year: '年柱',
  month: '月柱',
  day: '日柱',
  hour: '时柱'
};

const PILLAR_NAMES: PillarName[] = ['year', 'month', 'day', 'hour'];
const DAY_MS = 24 * 60 * 60 * 1000;

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

function callFunction<T>(source: any, methodName: string, ...args: unknown[]): T | null {
  const fn = source?.[methodName];
  if (typeof fn !== 'function') return null;
  try {
    return fn.apply(source, args) as T;
  } catch {
    return null;
  }
}

function callString(source: any, methodName: string) {
  const value = callFunction<unknown>(source, methodName);
  if (value == null) return null;
  return String(value);
}

function ensureArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getXunKongByGanZhi(ganZhi: string) {
  const index = LunarUtil.JIA_ZI.indexOf(ganZhi);
  if (index < 0) return '';
  return LunarUtil.XUN_KONG[Math.floor(index / 10)] ?? '';
}

function buildPillar(name: PillarName, eightChar: any): Pillar {
  const methodKey = name === 'hour' ? 'Time' : name[0].toUpperCase() + name.slice(1);
  const ganZhi = String(callFunction(eightChar, `get${methodKey}`) ?? '');
  const { gan, zhi } = splitGanZhi(ganZhi);
  return {
    name,
    label: PILLAR_LABELS[name],
    gan,
    zhi,
    ganZhi,
    hiddenGan: ensureArray(callFunction(eightChar, `get${methodKey}HideGan`) ?? HIDDEN_STEMS[zhi]),
    hiddenGanTenGods: ensureArray(callFunction(eightChar, `get${methodKey}ShiShenZhi`)),
    tenGodOfGan: callString(eightChar, `get${methodKey}ShiShenGan`) ?? '',
    naYin: callString(eightChar, `get${methodKey}NaYin`) ?? '',
    diShi: callString(eightChar, `get${methodKey}DiShi`) ?? '',
    ganElement: STEM_ELEMENTS[gan],
    zhiElement: BRANCH_ELEMENTS[zhi],
    shenSha: [],
    xunKong: callString(eightChar, `get${methodKey}XunKong`) ?? getXunKongByGanZhi(ganZhi)
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
    zhiElement: BRANCH_ELEMENTS[zhi],
    shenSha: [],
    xunKong: getXunKongByGanZhi(normalized)
  };
}

function applyShenSha(pillars: Record<PillarName, Pillar>) {
  const ctx = {
    yearBranch: pillars.year.zhi,
    monthBranch: pillars.month.zhi,
    dayStem: pillars.day.gan,
    dayBranch: pillars.day.zhi
  };
  for (const name of PILLAR_NAMES) {
    pillars[name].shenSha = getShenSha(pillars[name], ctx);
  }
}

function buildUnavailableLuck(reason = '需出生时间计算', timeBasis: LuckTimeBasis = 'clock'): BaziChart['luck'] {
  return {
    startAgeText: reason,
    startYear: 0,
    startMonth: 0,
    startDay: 0,
    startHour: 0,
    startSolarDate: '',
    startSolarDateTime: '',
    timeBasis,
    direction: 'forward',
    cycles: [],
    minorLuck: [],
    unavailableReason: reason
  };
}

function mapLiuNian(items: any[] | null): LiuNian[] {
  return (items ?? []).map((item) => ({
    year: Number(callFunction(item, 'getYear') ?? 0),
    age: Number(callFunction(item, 'getAge') ?? 0),
    index: Number(callFunction(item, 'getIndex') ?? 0),
    ganZhi: callString(item, 'getGanZhi') ?? ''
  }));
}

function mapMinorLuck(items: any[] | null): MinorLuck[] {
  return (items ?? []).map((item) => ({
    year: Number(callFunction(item, 'getYear') ?? 0),
    age: Number(callFunction(item, 'getAge') ?? 0),
    index: Number(callFunction(item, 'getIndex') ?? 0),
    ganZhi: callString(item, 'getGanZhi') ?? ''
  }));
}

function formatSolarYmdHm(solar: any) {
  const dateTime = callString(solar, 'toYmdHms');
  if (dateTime) return dateTime.slice(0, 16);
  return callString(solar, 'toYmd') ?? '';
}

function getCycleStartSolarDateTime(startSolar: any, cycleIndex: number) {
  if (!startSolar || cycleIndex < 1) return '';
  const cycleStartSolar = callFunction<any>(startSolar, 'nextYear', (cycleIndex - 1) * 10) ?? startSolar;
  return formatSolarYmdHm(cycleStartSolar);
}

function buildLuck(eightChar: any, input: BirthDateTimeInput, timeBasis: LuckTimeBasis): BaziChart['luck'] {
  const gender = input.gender === 'male' ? 1 : 0;
  const yun = callFunction<any>(eightChar, 'getYun', gender, 2);
  if (!yun) return buildUnavailableLuck('当前历法库无法计算起运、大运、流年与小运', timeBasis);

  const rawCycles = callFunction<any[]>(yun, 'getDaYun', 9) ?? [];
  const minorSource = rawCycles.find((cycle) => Number(callFunction(cycle, 'getIndex') ?? -1) === 0);
  const startSolar = callFunction<any>(yun, 'getStartSolar');
  const cycles = rawCycles
    .map((cycle) => {
      const index = Number(callFunction(cycle, 'getIndex') ?? 0);
      const startYear = Number(callFunction(cycle, 'getStartYear') ?? 0);
      const endYear = Number(callFunction(cycle, 'getEndYear') ?? 0);
      const startAge = Number(callFunction(cycle, 'getStartAge') ?? 0);
      const endAge = Number(callFunction(cycle, 'getEndAge') ?? 0);
      return {
        index,
        ganZhi: callString(cycle, 'getGanZhi') ?? '',
        startYear,
        endYear,
        startAge,
        endAge,
        startSolarDateTime: getCycleStartSolarDateTime(startSolar, index),
        displayStartYear: startYear ? startYear - 1 : 0,
        displayEndYear: endYear ? endYear - 1 : 0,
        displayStartAge: startAge ? Math.max(0, startAge - 1) : 0,
        displayEndAge: endAge ? Math.max(0, endAge - 1) : 0,
        liuNian: mapLiuNian(callFunction<any[]>(cycle, 'getLiuNian'))
      };
    })
    .filter((cycle) => cycle.index > 0);

  const startYear = Number(callFunction(yun, 'getStartYear') ?? 0);
  const startMonth = Number(callFunction(yun, 'getStartMonth') ?? 0);
  const startDay = Number(callFunction(yun, 'getStartDay') ?? 0);
  const startHour = Number(callFunction(yun, 'getStartHour') ?? 0);

  return {
    startAgeText: `${startYear}岁${startMonth}个月${startDay}天${startHour}时`,
    startYear,
    startMonth,
    startDay,
    startHour,
    startSolarDate: startSolar && typeof startSolar.toYmd === 'function' ? String(startSolar.toYmd()) : '',
    startSolarDateTime: formatSolarYmdHm(startSolar),
    timeBasis,
    direction: callFunction<boolean>(yun, 'isForward') ? 'forward' : 'backward',
    cycles,
    minorLuck: mapMinorLuck(callFunction<any[]>(minorSource, 'getXiaoYun'))
  };
}

function applyZiHourPolicy(eightChar: any, parts: CivilDateTime, input: BirthDateTimeInput) {
  const policy = input.ziHourPolicy ?? 'lateZiNextDay';
  if (policy === 'lateZiNextDay' && parts.hour === 23 && typeof eightChar.setSect === 'function') {
    eightChar.setSect(1);
  }
}

function civilToDate(value: CivilDateTime) {
  return new Date(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
}

function solarToCivil(solar: any): CivilDateTime | null {
  if (!solar) return null;
  const year = callFunction<number>(solar, 'getYear');
  const month = callFunction<number>(solar, 'getMonth');
  const day = callFunction<number>(solar, 'getDay');
  if (year == null || month == null || day == null) return null;
  return {
    year,
    month,
    day,
    hour: Number(callFunction(solar, 'getHour') ?? 0),
    minute: Number(callFunction(solar, 'getMinute') ?? 0),
    second: Number(callFunction(solar, 'getSecond') ?? 0)
  };
}

function buildSolarTermInfo(term: any, birthTime: CivilDateTime, direction: 'since' | 'until'): SolarTermInfo | null {
  const name = callString(term, 'getName');
  const solar = callFunction<any>(term, 'getSolar');
  const civil = solarToCivil(solar);
  if (!name || !civil) return null;
  const diffMs =
    direction === 'since'
      ? civilToDate(birthTime).getTime() - civilToDate(civil).getTime()
      : civilToDate(civil).getTime() - civilToDate(birthTime).getTime();
  const dateTime = solar && typeof solar.toYmdHms === 'function' ? String(solar.toYmdHms()) : formatCivilDateTime(civil);
  return {
    name,
    dateTime,
    daysFromBirth: Math.max(0, Math.round((diffMs / DAY_MS) * 10) / 10)
  };
}

function buildBirthSolarTerm(lunar: any, birthTime: CivilDateTime): BirthSolarTerm {
  const previous = buildSolarTermInfo(callFunction(lunar, 'getPrevJieQi'), birthTime, 'since');
  const current = buildSolarTermInfo(callFunction(lunar, 'getCurrentJieQi'), birthTime, 'since') ?? previous;
  const next = buildSolarTermInfo(callFunction(lunar, 'getNextJieQi'), birthTime, 'until');
  return {
    current,
    previous,
    next,
    note: previous && next ? '出生所在节气按上一节气推定' : '当前历法库未返回完整节气信息'
  };
}

function buildChartFactor(value: string | null, missingNote: string): ChartFactor {
  return value ? { value } : { value: null, note: missingNote };
}

function buildDatetimeFactors(eightChar: any, lunar: any, birthTime: CivilDateTime) {
  const missingNote = '当前历法库未返回该命盘要素';
  return {
    taiYuan: buildChartFactor(callString(eightChar, 'getTaiYuan'), missingNote),
    taiXi: buildChartFactor(callString(eightChar, 'getTaiXi'), missingNote),
    mingGong: buildChartFactor(callString(eightChar, 'getMingGong'), missingNote),
    shenGong: buildChartFactor(callString(eightChar, 'getShenGong'), missingNote),
    birthSolarTerm: buildBirthSolarTerm(lunar, birthTime)
  };
}

function buildManualFactors() {
  const factor = { value: null, note: '需出生时间' };
  return {
    taiYuan: factor,
    taiXi: factor,
    mingGong: factor,
    shenGong: factor,
    birthSolarTerm: {
      current: null,
      next: null,
      previous: null,
      note: '需出生时间'
    } satisfies BirthSolarTerm
  };
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

function parseLuckDateTime(value: string | undefined, fallbackYear: number) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return new Date(fallbackYear, 0, 1);
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0)
  );
}

function findCurrentLuckCycle(cycles: LuckCycle[], now: Date) {
  const ordered = [...cycles].sort((a, b) => a.index - b.index);
  const precise = ordered.find((cycle, index) => {
    const start = parseLuckDateTime(cycle.startSolarDateTime, cycle.startYear);
    const next = ordered[index + 1] ? parseLuckDateTime(ordered[index + 1].startSolarDateTime, ordered[index + 1].startYear) : null;
    return now >= start && (!next || now < next);
  });
  if (precise) return precise;
  const year = now.getFullYear();
  return ordered.find((cycle) => year >= cycle.startYear && year <= cycle.endYear);
}

function buildPromptLuck(luck: BaziChart['luck'], now: Date) {
  const current = findCurrentLuckCycle(luck.cycles, now);
  return {
    ...luck,
    cycles: luck.cycles.map((cycle) => {
      const { liuNian, ...base } = cycle;
      if (current && current.index === cycle.index) {
        return { ...base, liuNian: liuNian ?? [] };
      }
      const first = liuNian?.[0];
      const last = liuNian?.[liuNian.length - 1];
      return {
        ...base,
        liuNianSummary: first && last ? `${first.year}-${last.year}（${liuNian?.length ?? 0}年）` : '未生成流年明细'
      };
    })
  };
}

function buildPromptFacts(chart: BaziChart, now: Date, solarDateTime: string | null) {
  return {
    source: chart.source,
    solarDateTime,
    lunarDateText: chart.lunarDateText,
    pillars: chart.pillars,
    dayMaster: chart.dayMaster,
    fiveElementStats: chart.fiveElementStats,
    taiYuan: chart.taiYuan,
    taiXi: chart.taiXi,
    mingGong: chart.mingGong,
    shenGong: chart.shenGong,
    birthSolarTerm: chart.birthSolarTerm,
    strength: chart.strength,
    chartRelations: chart.chartRelations,
    luck: buildPromptLuck(chart.luck, now),
    daily: chart.daily,
    notes: chart.notes
  };
}

export function createBaziChart(input: BirthDateTimeInput, now = new Date()): BaziChart {
  assertBirthInput(input);
  const normalizedInput: BirthDateTimeInput = {
    ...input,
    luckTimeBasis: input.luckTimeBasis ?? 'clock'
  };

  if (normalizedInput.calendarType === 'bazi') {
    const directPillars = normalizedInput.directPillars;
    if (!directPillars) {
      throw new Error('请填写四柱八字');
    }
    const dayGanZhi = assertGanZhi(directPillars.day, '日柱');
    const dayGan = splitGanZhi(dayGanZhi).gan;
    const pillarArray = PILLAR_NAMES.map((name) => buildManualPillar(name, directPillars[name], dayGan));
    const pillars = Object.fromEntries(pillarArray.map((pillar) => [pillar.name, pillar])) as Record<PillarName, Pillar>;
    applyShenSha(pillars);
    const dayMaster = {
      gan: pillars.day.gan,
      element: STEM_ELEMENTS[pillars.day.gan]
    };
    const manualFactors = buildManualFactors();
    const notes = [
      '已使用手动输入的四柱八字；因缺少出生日期时间，无法计算真太阳时、农历日期、起运岁数与大运序列。',
      '胎元、胎息、命宫、身宫、节气、流年与小运需出生时间计算。'
    ];
    const chart: BaziChart = {
      input: normalizedInput,
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
      luck: buildUnavailableLuck('需出生时间计算', normalizedInput.luckTimeBasis ?? 'clock'),
      ...manualFactors,
      strength: createBaziStrength(pillars, {
        source: 'manual-pillars',
        birthTime: null
      }),
      chartRelations: getChartRelations(pillars),
      daily: buildDailyBasis(dayMaster.element, pillars, now),
      notes,
      promptFacts: {}
    };

    chart.promptFacts = buildPromptFacts(chart, now, null);

    return chart;
  }

  const civilTime = toCivilFromInput(normalizedInput);
  const correction = normalizedInput.location
    ? getTrueSolarCorrectionMinutes(civilTime, normalizedInput.location.longitude)
    : {
        equationOfTimeMinutes: 0,
        longitudeCorrectionMinutes: 0,
        totalCorrectionMinutes: 0
      };
  const correctedTime = normalizedInput.location
    ? normalizeCivilDateTime(civilTime, correction.totalCorrectionMinutes)
    : civilTime;

  const solar = createSolar(correctedTime);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();
  applyZiHourPolicy(eightChar, correctedTime, normalizedInput);
  const luckTimeBasis = normalizedInput.luckTimeBasis ?? 'clock';
  const luckTime = luckTimeBasis === 'trueSolar' ? correctedTime : civilTime;
  const luckSolar = luckTimeBasis === 'trueSolar' ? solar : createSolar(luckTime);
  const luckEightChar = luckTimeBasis === 'trueSolar' ? eightChar : luckSolar.getLunar().getEightChar();
  if (luckTimeBasis === 'clock') {
    applyZiHourPolicy(luckEightChar, luckTime, normalizedInput);
  }

  const pillarArray = PILLAR_NAMES.map((name) => buildPillar(name, eightChar));
  const pillars = Object.fromEntries(pillarArray.map((pillar) => [pillar.name, pillar])) as Record<PillarName, Pillar>;
  applyShenSha(pillars);
  const dayMaster = {
    gan: pillars.day.gan,
    element: STEM_ELEMENTS[pillars.day.gan]
  };
  const factors = buildDatetimeFactors(eightChar, lunar, correctedTime);
  const notes = normalizedInput.location
    ? [`已按${normalizedInput.location.name ?? '出生地'}经度 ${normalizedInput.location.longitude}° 校正真太阳时。`]
    : ['未提供出生地经度，已使用钟表时间排盘；时柱可能因真太阳时未校正存在偏差。'];
  notes.push(luckTimeBasis === 'clock' ? '起运按原始钟表时间计算。' : '起运按真太阳时校正后的时间计算。');
  if ((normalizedInput.ziHourPolicy ?? 'lateZiNextDay') === 'lateZiNextDay' && correctedTime.hour === 23) {
    notes.push('出生时间落在晚子时，日柱按子初换日规则处理。');
  }

  const chart: BaziChart = {
    input: normalizedInput,
    source: 'datetime',
    solarDateTime: correctedTime,
    lunarDateText: String(lunar.toString()),
    trueSolarTime: {
      enabled: Boolean(normalizedInput.location),
      degraded: !normalizedInput.location,
      longitude: normalizedInput.location?.longitude,
      equationOfTimeMinutes: Number(correction.equationOfTimeMinutes.toFixed(2)),
      longitudeCorrectionMinutes: Number(correction.longitudeCorrectionMinutes.toFixed(2)),
      totalCorrectionMinutes: Number(correction.totalCorrectionMinutes.toFixed(2)),
      civilTime,
      correctedTime,
      warning: normalizedInput.location ? undefined : '未提供出生地，经度与均时差校正未启用'
    },
    pillars,
    dayMaster,
    fiveElementStats: createFiveElementStats(pillarArray),
    luck: buildLuck(luckEightChar, normalizedInput, luckTimeBasis),
    ...factors,
    strength: createBaziStrength(pillars, {
      source: 'datetime',
      birthTime: correctedTime,
      daysFromPreviousTerm: factors.birthSolarTerm.previous?.daysFromBirth
    }),
    chartRelations: getChartRelations(pillars),
    daily: buildDailyBasis(dayMaster.element, pillars, now),
    notes,
    promptFacts: {}
  };

  chart.promptFacts = buildPromptFacts(chart, now, formatCivilDateTime(correctedTime));

  return chart;
}
