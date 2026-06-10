export type CalendarType = 'solar' | 'lunar' | 'bazi';
export type Gender = 'male' | 'female';
export type ZiHourPolicy = 'lateZiNextDay' | 'lateZiSameDay';
export type PillarName = 'year' | 'month' | 'day' | 'hour';
export type FiveElement = '木' | '火' | '土' | '金' | '水';

export interface BirthDateTimeInput {
  calendarType: CalendarType;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  gender: Gender;
  isLeapMonth?: boolean;
  location?: {
    name?: string;
    longitude: number;
  };
  ziHourPolicy?: ZiHourPolicy;
  directPillars?: Record<PillarName, string>;
}

export interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface Pillar {
  name: PillarName;
  label: string;
  gan: string;
  zhi: string;
  ganZhi: string;
  hiddenGan: string[];
  hiddenGanTenGods: string[];
  tenGodOfGan: string;
  naYin: string;
  diShi: string;
  ganElement: FiveElement;
  zhiElement: FiveElement;
}

export interface LuckCycle {
  index: number;
  ganZhi: string;
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
}

export interface TrueSolarTimeResult {
  enabled: boolean;
  degraded: boolean;
  longitude?: number;
  equationOfTimeMinutes: number;
  longitudeCorrectionMinutes: number;
  totalCorrectionMinutes: number;
  civilTime: CivilDateTime | null;
  correctedTime: CivilDateTime | null;
  warning?: string;
}

export interface DayRelation {
  target: string;
  targetGanZhi: string;
  dayStemRelation: string;
  branchRelations: string[];
}

export interface DailyFortuneBasis {
  date: string;
  ganZhi: string;
  gan: string;
  zhi: string;
  relationToDayMaster: string;
  relationsToNatal: DayRelation[];
}

export interface BaziChart {
  input: BirthDateTimeInput;
  source: 'datetime' | 'manual-pillars';
  solarDateTime: CivilDateTime | null;
  lunarDateText: string;
  trueSolarTime: TrueSolarTimeResult;
  pillars: Record<PillarName, Pillar>;
  dayMaster: {
    gan: string;
    element: FiveElement;
  };
  fiveElementStats: Record<FiveElement, number>;
  luck: {
    startAgeText: string;
    startYear: number;
    startMonth: number;
    startDay: number;
    startSolarDate: string;
    direction: 'forward' | 'backward';
    cycles: LuckCycle[];
  };
  daily: DailyFortuneBasis;
  notes: string[];
  promptFacts: Record<string, unknown>;
}
