export type CalendarType = 'solar' | 'lunar' | 'bazi';
export type Gender = 'male' | 'female';
export type ZiHourPolicy = 'lateZiNextDay' | 'lateZiSameDay';
export type LuckTimeBasis = 'clock' | 'trueSolar';
export type PillarName = 'year' | 'month' | 'day' | 'hour';
export type FiveElement = '木' | '火' | '土' | '金' | '水';
export type HiddenStemLevel = '本气' | '中气' | '余气';
export type SeasonalState = '旺' | '相' | '休' | '囚' | '死';
export type StrengthConclusion = '身强' | '身弱' | '均衡';

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
  luckTimeBasis?: LuckTimeBasis;
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
  shenSha: string[];
  xunKong: string;
}

export interface WeightedHiddenStem {
  stem: string;
  element: FiveElement;
  level: HiddenStemLevel;
  weight: number;
}

export interface LiuNian {
  year: number;
  age: number;
  index: number;
  ganZhi: string;
}

export interface MinorLuck {
  year: number;
  age: number;
  index: number;
  ganZhi: string;
}

export interface LuckCycle {
  index: number;
  ganZhi: string;
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
  startSolarDateTime: string;
  displayStartYear: number;
  displayEndYear: number;
  displayStartAge: number;
  displayEndAge: number;
  liuNian?: LiuNian[];
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

export interface ChartFactor {
  value: string | null;
  note?: string;
}

export interface SolarTermInfo {
  name: string;
  dateTime: string;
  daysFromBirth?: number;
}

export interface BirthSolarTerm {
  current: SolarTermInfo | null;
  next: SolarTermInfo | null;
  previous?: SolarTermInfo | null;
  note?: string;
}

export interface MonthCommand {
  branch: string;
  stem: string;
  element: FiveElement;
  level: HiddenStemLevel;
  source: '节气推算' | '月支本气' | '降级';
  daysFromPreviousTerm?: number;
}

export interface StrengthDimension {
  matched: boolean;
  score: number;
  reason: string;
}

export interface DayMasterStrength {
  conclusion: StrengthConclusion;
  score: number;
  deLing: StrengthDimension;
  deDi: StrengthDimension;
  deShi: StrengthDimension;
}

export interface ChartStrength {
  weightedEnergy: Record<FiveElement, number>;
  percentages: Record<FiveElement, number>;
  monthCommand: MonthCommand;
  seasonalStates: Record<FiveElement, SeasonalState>;
  dayMasterState: SeasonalState;
  dayMasterStrength: DayMasterStrength;
}

export interface ChartStemRelation {
  type: '五合' | '相冲';
  name: string;
  pillars: PillarName[];
  stems: string[];
  ganZhi: string[];
  description: string;
  element?: FiveElement;
}

export interface ChartBranchRelation {
  type: '六合' | '六冲' | '相刑' | '相害' | '半合' | '自刑' | '三合局' | '三会局';
  name: string;
  pillars: PillarName[];
  branches: string[];
  ganZhi: string[];
  description: string;
  element?: FiveElement;
}

export interface ChartRelations {
  stems: ChartStemRelation[];
  branches: ChartBranchRelation[];
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
    startHour: number;
    startSolarDate: string;
    startSolarDateTime: string;
    timeBasis: LuckTimeBasis;
    direction: 'forward' | 'backward';
    cycles: LuckCycle[];
    minorLuck?: MinorLuck[];
    unavailableReason?: string;
  };
  taiYuan?: ChartFactor;
  taiXi?: ChartFactor;
  mingGong?: ChartFactor;
  shenGong?: ChartFactor;
  birthSolarTerm?: BirthSolarTerm;
  strength?: ChartStrength;
  chartRelations?: ChartRelations;
  daily: DailyFortuneBasis;
  notes: string[];
  promptFacts: Record<string, unknown>;
}
