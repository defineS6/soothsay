import { describe, expect, it } from 'vitest';
import { createBaziChart } from '@/bazi/engine';

describe('bazi-engine', () => {
  it('将公历生辰排出四柱', () => {
    const chart = createBaziChart(
      {
        calendarType: 'solar',
        year: 2005,
        month: 12,
        day: 23,
        hour: 8,
        minute: 37,
        gender: 'male',
        ziHourPolicy: 'lateZiSameDay'
      },
      new Date(2026, 0, 1, 8, 0, 0)
    );

    expect(chart.pillars.year.ganZhi).toBe('乙酉');
    expect(chart.pillars.month.ganZhi).toBe('戊子');
    expect(chart.pillars.day.ganZhi).toBe('辛巳');
    expect(chart.pillars.hour.ganZhi).toBe('壬辰');
    expect(chart.pillars.hour.hiddenGan).toEqual(['戊', '乙', '癸']);
    expect(chart.dayMaster.gan).toBe('辛');
  });

  it('将农历闰月换算为公历再排盘', () => {
    const chart = createBaziChart({
      calendarType: 'lunar',
      year: 2020,
      month: 4,
      day: 2,
      isLeapMonth: true,
      hour: 13,
      minute: 0,
      gender: 'female'
    });

    expect(chart.solarDateTime!.year).toBe(2020);
    expect(chart.solarDateTime!.month).toBe(5);
    expect(chart.solarDateTime!.day).toBe(24);
    expect(chart.lunarDateText).toContain('闰四月初二');
  });

  it('支持晚子时换日规则', () => {
    const chart = createBaziChart({
      calendarType: 'solar',
      year: 1988,
      month: 2,
      day: 15,
      hour: 23,
      minute: 30,
      gender: 'male',
      ziHourPolicy: 'lateZiNextDay'
    });

    expect(chart.pillars.day.ganZhi).toBe('辛丑');
    expect(chart.pillars.hour.ganZhi).toBe('戊子');
  });

  it('未提供出生地时降级并提示', () => {
    const chart = createBaziChart({
      calendarType: 'solar',
      year: 1995,
      month: 12,
      day: 18,
      hour: 10,
      minute: 28,
      gender: 'female'
    });

    expect(chart.trueSolarTime.degraded).toBe(true);
    expect(chart.notes.join('')).toContain('未提供出生地');
  });

  it('提供经度时执行真太阳时校正', () => {
    const chart = createBaziChart({
      calendarType: 'solar',
      year: 1995,
      month: 12,
      day: 18,
      hour: 10,
      minute: 28,
      gender: 'female',
      location: {
        name: '成都',
        longitude: 104.0668
      }
    });

    expect(chart.trueSolarTime.enabled).toBe(true);
    expect(chart.trueSolarTime.totalCorrectionMinutes).toBeLessThan(0);
    expect(chart.trueSolarTime.correctedTime!.hour).toBeLessThanOrEqual(10);
  });

  it('支持直接输入四柱八字生成结构化命盘', () => {
    const chart = createBaziChart(
      {
        calendarType: 'bazi',
        year: 0,
        month: 0,
        day: 0,
        hour: 0,
        minute: 0,
        gender: 'female',
        directPillars: {
          year: '甲子',
          month: '乙丑',
          day: '丙寅',
          hour: '丁卯'
        }
      },
      new Date(2026, 0, 1, 8, 0, 0)
    );

    expect(chart.source).toBe('manual-pillars');
    expect(chart.pillars.year.ganZhi).toBe('甲子');
    expect(chart.dayMaster.gan).toBe('丙');
    expect(chart.pillars.month.tenGodOfGan).toBe('正印');
    expect(chart.pillars.day.hiddenGan).toEqual(['甲', '丙', '戊']);
    expect(chart.luck.startAgeText).toBe('需出生时间计算');
    expect(chart.notes.join('')).toContain('手动输入');
    expect(chart.daily.ganZhi).toHaveLength(2);
  });
});
