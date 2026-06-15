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
    expect(chart.pillars.year.xunKong).toBe('午未');
    expect(chart.pillars.day.xunKong).toBe('申酉');
    expect(chart.taiYuan?.value).toBe('己卯');
    expect(chart.taiXi?.value).toBe('丙申');
    expect(chart.mingGong?.value).toBe('己丑');
    expect(chart.shenGong?.value).toBe('辛巳');
    expect(chart.birthSolarTerm?.current?.name).toBe('冬至');
    expect(chart.birthSolarTerm?.next?.name).toBe('小寒');
    expect(chart.luck.cycles[0].liuNian?.[0]).toMatchObject({ year: 2011, ganZhi: '辛卯' });
    expect(chart.luck.minorLuck?.[0]).toMatchObject({ year: 2005, ganZhi: '辛卯' });
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

  it('标注常用神煞命中柱位', () => {
    const chart = createBaziChart({
      calendarType: 'bazi',
      year: 0,
      month: 0,
      day: 0,
      hour: 0,
      minute: 0,
      gender: 'male',
      directPillars: {
        year: '甲子',
        month: '乙丑',
        day: '甲寅',
        hour: '丁酉'
      }
    });

    expect(chart.pillars.month.shenSha).toContain('天乙贵人');
    expect(chart.pillars.day.shenSha).toContain('驿马');
    expect(chart.pillars.hour.shenSha).toContain('桃花（咸池）');
  });

  it('输出加权五行旺衰与命局内部关系', () => {
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

    expect(chart.strength?.weightedEnergy).toMatchObject({
      木: 1.3,
      火: 1,
      土: 2.3,
      金: 2.2,
      水: 2.2
    });
    expect(chart.strength?.percentages.木).toBeGreaterThan(10);
    expect(chart.strength?.percentages.木).toBeLessThan(20);
    expect(['身强', '身弱', '均衡']).toContain(chart.strength?.dayMasterStrength.conclusion);
    expect(chart.chartRelations?.stems.some((item) => item.type === '相冲' && item.name === '乙辛冲')).toBe(true);
    expect(chart.chartRelations?.branches.some((item) => item.type === '六合' && item.name === '酉辰六合')).toBe(true);
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
    expect(chart.pillars.year.xunKong).toBe('戌亥');
    expect(chart.pillars.hour.shenSha).toContain('桃花（咸池）');
    expect(chart.chartRelations?.branches.some((item) => item.type === '六合' && item.name === '子丑六合')).toBe(true);
    expect(chart.strength?.monthCommand.source).toBe('月支本气');
    expect(chart.taiYuan?.note).toBe('需出生时间');
    expect(chart.birthSolarTerm?.note).toBe('需出生时间');
    expect(chart.luck.cycles).toEqual([]);
    expect(chart.luck.minorLuck).toEqual([]);
  });

  it('默认按钟表时间计算起运并对齐问真式大运标签', () => {
    const chart = createBaziChart({
      calendarType: 'lunar',
      year: 1997,
      month: 3,
      day: 22,
      hour: 5,
      minute: 31,
      gender: 'male',
      location: {
        name: '出生地',
        longitude: 115.94
      }
    });

    expect(chart.input.luckTimeBasis).toBe('clock');
    expect(chart.pillars).toMatchObject({
      year: { ganZhi: '丁丑' },
      month: { ganZhi: '甲辰' },
      day: { ganZhi: '庚子' },
      hour: { ganZhi: '己卯' }
    });
    expect(chart.luck).toMatchObject({
      startAgeText: '7岁8个月17天22时',
      startYear: 7,
      startMonth: 8,
      startDay: 17,
      startHour: 22,
      startSolarDate: '2005-01-15',
      startSolarDateTime: '2005-01-15 03:31',
      timeBasis: 'clock',
      direction: 'backward'
    });
    expect(chart.luck.cycles[0]).toMatchObject({
      ganZhi: '癸卯',
      startYear: 2005,
      endYear: 2014,
      startAge: 9,
      endAge: 18,
      startSolarDateTime: '2005-01-15 03:31',
      displayStartYear: 2004,
      displayEndYear: 2013,
      displayStartAge: 8,
      displayEndAge: 17
    });
  });

  it('起运基准选择真太阳时时会使用校正后的时间', () => {
    const chart = createBaziChart({
      calendarType: 'lunar',
      year: 1997,
      month: 3,
      day: 22,
      hour: 5,
      minute: 31,
      gender: 'male',
      luckTimeBasis: 'trueSolar',
      location: {
        name: '出生地',
        longitude: 115.94
      }
    });

    expect(chart.luck.timeBasis).toBe('trueSolar');
    expect(chart.luck.startAgeText).toBe('7岁8个月16天18时');
    expect(chart.luck.startSolarDateTime).toBe('2005-01-13 23:17');
    expect(chart.luck.startAgeText).not.toBe('7岁8个月17天22时');
  });
});
