import { Solar } from 'lunar-javascript';
import { getHexagramName } from '@/liuyao/engine';

export type Element = '木' | '火' | '土' | '金' | '水';
export type Yao = 0 | 1;
export type Position = 'upper' | 'lower';
export type MeihuaMethod = 'time' | 'numbers';

export interface Trigram {
  number: number;
  name: string;
  image: string;
  symbol: string;
  element: Element;
  lines: readonly [Yao, Yao, Yao]; // 初爻在前
}

export interface Hexagram {
  name: string;
  upper: Trigram;
  lower: Trigram;
  lines: Yao[]; // 初爻至上爻
}

export interface MeihuaChart {
  ruleVersion: 'meihua-xiantian-v1';
  method: MeihuaMethod;
  source: {
    dateTime?: string;
    lunarText?: string;
    yearBranch?: string;
    hourBranch?: string;
    yearNumber?: number;
    monthNumber?: number;
    dayNumber?: number;
    hourNumber?: number;
    upperNumber: number;
    lowerNumber: number;
  };
  primary: Hexagram;
  mutual: Hexagram;
  changed: Hexagram;
  movingLine: number;
  bodyPosition: Position;
  usePosition: Position;
  body: Trigram;
  use: Trigram;
  changedUse: Trigram;
  relations: {
    primary: string;
    mutualUpper: string;
    mutualLower: string;
    changed: string;
  };
}

// 先天八卦数：乾一兑二离三震四巽五坎六艮七坤八。
export const TRIGRAMS: readonly Trigram[] = [
  { number: 1, name: '乾', image: '天', symbol: '☰', element: '金', lines: [1, 1, 1] },
  { number: 2, name: '兑', image: '泽', symbol: '☱', element: '金', lines: [1, 1, 0] },
  { number: 3, name: '离', image: '火', symbol: '☲', element: '火', lines: [1, 0, 1] },
  { number: 4, name: '震', image: '雷', symbol: '☳', element: '木', lines: [1, 0, 0] },
  { number: 5, name: '巽', image: '风', symbol: '☴', element: '木', lines: [0, 1, 1] },
  { number: 6, name: '坎', image: '水', symbol: '☵', element: '水', lines: [0, 1, 0] },
  { number: 7, name: '艮', image: '山', symbol: '☶', element: '土', lines: [0, 0, 1] },
  { number: 8, name: '坤', image: '地', symbol: '☷', element: '土', lines: [0, 0, 0] }
];

const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const PRODUCES: Record<Element, Element> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLS: Record<Element, Element> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

function positiveRemainder(value: number, divisor: number) {
  return ((value - 1) % divisor) + 1;
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label}必须是大于零的安全整数`);
  }
}

function trigramFromNumber(value: number): Trigram {
  return TRIGRAMS[positiveRemainder(value, 8) - 1];
}

function trigramFromLines(lines: readonly Yao[]): Trigram {
  const found = TRIGRAMS.find((item) => item.lines.every((line, index) => line === lines[index]));
  if (!found) throw new Error('无效的三爻卦');
  return found;
}

function hexagramFromLines(lines: Yao[]): Hexagram {
  const lower = trigramFromLines(lines.slice(0, 3));
  const upper = trigramFromLines(lines.slice(3, 6));
  return { name: getHexagramName(upper.name, lower.name), upper, lower, lines: [...lines] };
}

export function elementRelation(body: Element, other: Element): string {
  if (body === other) return '体用比和';
  if (PRODUCES[other] === body) return '用生体';
  if (PRODUCES[body] === other) return '体生用';
  if (CONTROLS[body] === other) return '体克用';
  return '用克体';
}

function buildChart(
  upperNumber: number,
  lowerNumber: number,
  movingNumber: number,
  method: MeihuaMethod,
  source: MeihuaChart['source']
): MeihuaChart {
  positiveInteger(upperNumber, '上卦数');
  positiveInteger(lowerNumber, '下卦数');
  positiveInteger(movingNumber, '动爻总数');
  const upper = trigramFromNumber(upperNumber);
  const lower = trigramFromNumber(lowerNumber);
  const primary = hexagramFromLines([...lower.lines, ...upper.lines]);
  const movingLine = positiveRemainder(movingNumber, 6);
  const changedLines = [...primary.lines];
  changedLines[movingLine - 1] = changedLines[movingLine - 1] === 1 ? 0 : 1;
  const changed = hexagramFromLines(changedLines);
  // 下互取二三四爻，上互取三四五爻。
  const mutual = hexagramFromLines([
    primary.lines[1], primary.lines[2], primary.lines[3],
    primary.lines[2], primary.lines[3], primary.lines[4]
  ]);
  // 动爻所在经卦为用，未动的一卦为体。
  const bodyPosition: Position = movingLine <= 3 ? 'upper' : 'lower';
  const usePosition: Position = bodyPosition === 'upper' ? 'lower' : 'upper';
  const body = primary[bodyPosition];
  const use = primary[usePosition];
  const changedUse = changed[usePosition];

  return {
    ruleVersion: 'meihua-xiantian-v1',
    method,
    source,
    primary,
    mutual,
    changed,
    movingLine,
    bodyPosition,
    usePosition,
    body,
    use,
    changedUse,
    relations: {
      primary: elementRelation(body.element, use.element),
      mutualUpper: elementRelation(body.element, mutual.upper.element),
      mutualLower: elementRelation(body.element, mutual.lower.element),
      changed: elementRelation(body.element, changedUse.element)
    }
  };
}

/** 两数起卦：第一数为上卦、第二数为下卦，两数之和定动爻。 */
export function makeMeihuaByNumbers(first: number, second: number): MeihuaChart {
  positiveInteger(first, '第一数');
  positiveInteger(second, '第二数');
  const sum = first + second;
  positiveInteger(sum, '两数之和');
  return buildChart(first, second, sum, 'numbers', { upperNumber: first, lowerNumber: second });
}

/** 年月日时起卦：农历年月日与时支数，子为 1、亥为 12；闰月按同月序数。 */
export function makeMeihuaByTime(dateTime: string): MeihuaChart {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTime);
  if (!match) throw new Error('请选择有效的起卦日期和时间');
  const [, y, m, d, h, minute] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const hour = Number(h), min = Number(minute);
  const civil = new Date(year, month - 1, day, hour, min);
  if (civil.getFullYear() !== year || civil.getMonth() !== month - 1 ||
      civil.getDate() !== day || civil.getHours() !== hour || civil.getMinutes() !== min) {
    throw new Error('起卦日期或时间无效');
  }
  const lunar = Solar.fromYmdHms(year, month, day, hour, min, 0).getLunar();
  const yearBranch = String(lunar.getYearZhi());
  const hourBranch = String(lunar.getTimeZhi());
  const yearNumber = BRANCHES.indexOf(yearBranch) + 1;
  const hourNumber = BRANCHES.indexOf(hourBranch) + 1;
  if (!yearNumber || !hourNumber) throw new Error('无法取得农历干支');
  const lunarMonth = Number(lunar.getMonth());
  const monthNumber = Math.abs(lunarMonth);
  const dayNumber = Number(lunar.getDay());
  const upperNumber = yearNumber + monthNumber + dayNumber;
  const lowerNumber = upperNumber + hourNumber;
  return buildChart(upperNumber, lowerNumber, lowerNumber, 'time', {
    dateTime,
    lunarText: `${lunar.getYearInChinese()}年${lunarMonth < 0 ? '闰' : ''}${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    yearBranch,
    hourBranch,
    yearNumber,
    monthNumber,
    dayNumber,
    hourNumber,
    upperNumber,
    lowerNumber
  });
}
