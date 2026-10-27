import { describe, expect, it } from 'vitest';
import { createBaziChart } from '@/bazi/engine';
import { buildBaziChartText, buildLiuyaoChartText, buildMeihuaChartText } from '@/export/chart-text';
import { makeMeihuaByNumbers } from '@/meihua/engine';
import { enrichLiuyao, makeLiuyao, type YaoValue } from '@/liuyao/engine';

describe('盘面文本导出', () => {
  it('八字文本包含四柱、五行旺衰、大运与 AI 提问引导', () => {
    const chart = createBaziChart(
      {
        calendarType: 'solar',
        year: 1995,
        month: 12,
        day: 18,
        hour: 10,
        minute: 28,
        gender: 'female',
        location: { name: '成都', longitude: 104.0668 }
      },
      new Date(2026, 0, 1, 8, 0, 0)
    );
    const text = buildBaziChartText(chart, new Date(2026, 0, 1, 8, 0, 0));

    expect(text).toContain('# 八字命盘数据');
    expect(text).toContain('## 四柱');
    expect(text).toContain(chart.pillars.day.ganZhi);
    expect(text).toContain(`- 日主：${chart.dayMaster.gan}${chart.dayMaster.element}`);
    expect(text).toContain('## 大运');
    expect(text).toContain('当前大运');
    expect(text).toContain('## 请 AI 分析');
    // 不允许把内部空值直接暴露给外部 AI 工具
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
  });

  it('直接四柱模式缺失大运时给出可读说明', () => {
    const chart = createBaziChart(
      {
        calendarType: 'bazi',
        year: 1995,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        gender: 'male',
        directPillars: { year: '甲子', month: '乙丑', day: '丙寅', hour: '丁卯' }
      },
      new Date(2026, 0, 1, 8, 0, 0)
    );
    const text = buildBaziChartText(chart, new Date(2026, 0, 1, 8, 0, 0));

    expect(text).toContain('未提供（直接四柱模式）');
    expect(text).toContain('## 大运');
    expect(text).not.toContain('undefined');
  });

  it('梅花文本包括本互变、动爻、体用和解读说明', () => {
    const chart = makeMeihuaByNumbers(3, 6);
    const text = buildMeihuaChartText(chart, '项目能否顺利开展');
    expect(text).toContain('项目能否顺利开展');
    expect(text).toContain('本卦：火水未济');
    expect(text).toContain('互卦：');
    expect(text).toContain('变卦：');
    expect(text).toContain('动爻：第3爻');
    expect(text).toContain('用克体');
    expect(text).not.toContain('undefined');
  });

  it('六爻文本包含本卦变卦、四值、六爻装卦与动爻标记', () => {
    const values: YaoValue[] = [9, 7, 8, 6, 7, 8];
    const calendar = { monthGanZhi: '戊戌', dayGanZhi: '癸酉' };
    const chart = enrichLiuyao(makeLiuyao(values, calendar.dayGanZhi[0]), calendar);
    const text = buildLiuyaoChartText(chart, { question: '合作是否顺利', dateTime: '2026-10-26T10:45' });

    expect(text).toContain('# 六爻卦盘数据');
    expect(text).toContain(`- 本卦：${chart.primary}`);
    expect(text).toContain(`- 变卦：${chart.transformed}`);
    expect(text).toContain('| 上爻 |');
    expect(text).toContain('| 初爻 |');
    expect(text).toContain('世');
    expect(text).toContain('应');
    expect(text).toContain('## 请 AI 分析');
    expect(text).not.toContain('undefined');
  });
});
