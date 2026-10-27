import { describe, expect, it } from 'vitest';
import { elementRelation, makeMeihuaByNumbers, makeMeihuaByTime } from '../src/meihua/engine';

describe('梅花易数先天数排卦', () => {
  it('先天卦序余零取八、动爻余零取六', () => {
    const chart = makeMeihuaByNumbers(8, 16);
    expect(chart.primary.name).toBe('坤为地');
    expect(chart.movingLine).toBe(6);
    expect(chart.changed.name).toBe('山地剥');
    expect(chart.bodyPosition).toBe('lower');
    expect(chart.usePosition).toBe('upper');
    expect(chart.primary.lines).toEqual([0, 0, 0, 0, 0, 0]);
    expect(chart.changed.lines).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('本卦、互卦、变卦均有完整六爻，动爻只变一根', () => {
    for (let first = 1; first <= 8; first++) {
      for (let second = 1; second <= 8; second++) {
        const chart = makeMeihuaByNumbers(first, second);
        expect(chart.primary.lines).toHaveLength(6);
        expect(chart.mutual.lines).toHaveLength(6);
        expect(chart.changed.lines).toHaveLength(6);
        expect(chart.changed.lines.filter((line, index) => line !== chart.primary.lines[index])).toHaveLength(1);
        expect(chart.primary.name).not.toMatch(/^[乾兑离震巽坎艮坤]{2}$/);
        expect(chart.mutual.name).not.toMatch(/^[乾兑离震巽坎艮坤]{2}$/);
        expect(chart.changed.name).not.toMatch(/^[乾兑离震巽坎艮坤]{2}$/);
      }
    }
  });

  it('乾为天二爻动：体乾用乾，互卦仍为乾，之卦天火同人', () => {
    const chart = makeMeihuaByNumbers(1, 1 + 48); // 下卦乾，动爻 50 % 6 = 2
    expect(chart.primary.name).toBe('乾为天');
    expect(chart.movingLine).toBe(2);
    expect(chart.mutual.name).toBe('乾为天');
    expect(chart.changed.name).toBe('天火同人');
    expect(chart.body.name).toBe('乾');
    expect(chart.use.name).toBe('乾');
    expect(chart.relations.primary).toBe('体用比和');
  });

  it('互卦取本卦二三四爻、三四五爻，体用由动爻定位', () => {
    const chart = makeMeihuaByNumbers(3, 6);
    expect(chart.primary.name).toBe('火水未济');
    expect(chart.mutual.lines.slice(0, 3)).toEqual(chart.primary.lines.slice(1, 4));
    expect(chart.mutual.lines.slice(3, 6)).toEqual(chart.primary.lines.slice(2, 5));
    expect(chart.movingLine).toBe(3);
    expect(chart.bodyPosition).toBe('upper');
    expect(chart.body.element).toBe('火');
    expect(chart.use.element).toBe('水');
    expect(chart.relations.primary).toBe('用克体');
  });

  it('体用五行五种关系完整', () => {
    expect(elementRelation('金', '金')).toBe('体用比和');
    expect(elementRelation('金', '土')).toBe('用生体');
    expect(elementRelation('金', '水')).toBe('体生用');
    expect(elementRelation('木', '土')).toBe('体克用');
    expect(elementRelation('金', '火')).toBe('用克体');
  });

  it('公历转农历起卦，春节之后按新年地支取数', () => {
    // 2024-02-10 = 农历甲辰年正月初一，子时为 1，辰年为 5
    const chart = makeMeihuaByTime('2024-02-10T00:30');
    expect(chart.method).toBe('time');
    expect(chart.source.yearBranch).toBe('辰');
    expect(chart.source.monthNumber).toBe(1);
    expect(chart.source.dayNumber).toBe(1);
    expect(chart.source.hourNumber).toBe(1);
    expect(chart.source.upperNumber).toBe(7);
    expect(chart.source.lowerNumber).toBe(8);
    expect(chart.primary.name).toBe('山地剥');
    expect(chart.movingLine).toBe(2);
  });

  it('23 点属于子时，农历闰月按原月数处理', () => {
    const late = makeMeihuaByTime('2024-02-10T23:30');
    expect(late.source.hourNumber).toBe(1);
    const leap = makeMeihuaByTime('2023-03-22T12:00'); // 2023 癸卯年闰二月初一
    expect(leap.source.monthNumber).toBe(2);
    expect(leap.source.lunarText).toContain('闰');
  });

  it('拒绝无效数值与日期，不做静默取整', () => {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, NaN, Infinity]) {
      expect(() => makeMeihuaByNumbers(value, 3)).toThrow();
    }
    expect(() => makeMeihuaByNumbers(Number.MAX_SAFE_INTEGER, 1)).toThrow();
    expect(() => makeMeihuaByTime('2024-02-30T12:00')).toThrow();
    expect(() => makeMeihuaByTime('2024-01-01T25:00')).toThrow();
    expect(() => makeMeihuaByTime('')).toThrow();
  });
});
