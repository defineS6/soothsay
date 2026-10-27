import { findCurrentLuckCycle } from '@/bazi/engine';
import { formatCivilDateTime } from '@/bazi/solar-time';
import type { BaziChart, FiveElement, PillarName } from '@/bazi/types';
import { yaoPositionLabel, type ProfessionalLiuyaoChart } from '@/liuyao/engine';
import type { MeihuaChart } from '@/meihua/engine';

const FIVE_ELEMENTS: FiveElement[] = ['木', '火', '土', '金', '水'];
const PILLAR_ORDER: PillarName[] = ['year', 'month', 'day', 'hour'];

/**
 * 把排盘结果转成纯文本，方便用户一键复制后粘贴到任意 AI 工具。
 * 说明：只做事实层转述，不参与任何推断，保证与页面展示的盘面完全一致。
 */

// 八字：把命盘事实层整理成 Markdown 文本，含基本信息、四柱、五行旺衰、关系、大运与当前流年
export function buildBaziChartText(chart: BaziChart, now = new Date()): string {
  const lines: string[] = [];
  const genderText = chart.input.gender === 'male' ? '男' : '女';
  const location = chart.input.location;
  const currentCycle = findCurrentLuckCycle(chart.luck.cycles, now);

  lines.push('# 八字命盘数据（Soothsay 排盘结果）', '');

  // 基本信息
  lines.push('## 基本信息');
  lines.push(`- 性别：${genderText}`);
  lines.push(
    `- 出生时间：${
      chart.solarDateTime ? formatCivilDateTime(chart.solarDateTime) : '未提供（直接四柱模式）'
    }${chart.trueSolarTime.enabled ? '（已按出生地经度校正真太阳时）' : '（钟表时间，未做真太阳时校正）'}`
  );
  if (chart.source === 'datetime' && chart.trueSolarTime.civilTime) {
    lines.push(`- 钟表时间：${formatCivilDateTime(chart.trueSolarTime.civilTime)}`);
    lines.push(
      `- 真太阳时校正量：${chart.trueSolarTime.totalCorrectionMinutes} 分钟（经度修正 ${chart.trueSolarTime.longitudeCorrectionMinutes} 分钟，均时差 ${chart.trueSolarTime.equationOfTimeMinutes} 分钟）`
    );
  }
  lines.push(`- 农历：${chart.lunarDateText}`);
  if (location) {
    lines.push(`- 出生地：${location.name ?? '未命名'}（东经 ${location.longitude}°）`);
  }
  lines.push(`- 子时规则：${chart.input.ziHourPolicy === 'lateZiSameDay' ? '晚子时不换日' : '晚子时换日'}`);
  lines.push(`- 起运基准：${chart.luck.timeBasis === 'trueSolar' ? '真太阳时' : '钟表时间'}`);
  if (chart.birthSolarTerm?.current) {
    lines.push(
      `- 出生所在节气：${chart.birthSolarTerm.current.name}（${chart.birthSolarTerm.current.dateTime}）${
        chart.birthSolarTerm.next ? `，下一节气 ${chart.birthSolarTerm.next.name}（${chart.birthSolarTerm.next.dateTime}）` : ''
      }`
    );
  }
  lines.push('');

  // 四柱
  lines.push('## 四柱', '');
  lines.push('| 柱位 | 干支 | 天干十神 | 藏干（十神） | 纳音 | 地势 | 旬空 | 神煞 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const name of PILLAR_ORDER) {
    const pillar = chart.pillars[name];
    const hidden = pillar.hiddenGan
      .map((gan, index) => `${gan}${pillar.hiddenGanTenGods[index] ? `（${pillar.hiddenGanTenGods[index]}）` : ''}`)
      .join('、');
    lines.push(
      `| ${pillar.label} | ${pillar.ganZhi} | ${pillar.tenGodOfGan} | ${hidden || '无'} | ${pillar.naYin} | ${pillar.diShi} | ${
        pillar.xunKong || '无'
      } | ${pillar.shenSha.length ? pillar.shenSha.join('、') : '无'} |`
    );
  }
  lines.push('');

  // 日主与五行
  lines.push('## 日主与五行');
  lines.push(`- 日主：${chart.dayMaster.gan}${chart.dayMaster.element}`);
  lines.push(`- 五行统计（含藏干）：${FIVE_ELEMENTS.map((element) => `${element}${chart.fiveElementStats[element]}`).join(' ')}`);
  if (chart.strength) {
    const strength = chart.strength;
    lines.push(`- 月令司令：${strength.monthCommand.stem}${strength.monthCommand.level}（来源 ${strength.monthCommand.source}）`);
    lines.push(
      `- 旺衰结论：${strength.dayMasterStrength.conclusion}（${strength.dayMasterStrength.score} 分，日主处于「${strength.dayMasterState}」）`
    );
    lines.push(`- 得令：${strength.dayMasterStrength.deLing.reason}`);
    lines.push(`- 得地：${strength.dayMasterStrength.deDi.reason}`);
    lines.push(`- 得势：${strength.dayMasterStrength.deShi.reason}`);
    lines.push(
      `- 五行占比：${FIVE_ELEMENTS.map(
        (element) => `${element} ${strength.percentages[element]}%（${strength.seasonalStates[element]}）`
      ).join(' ')}`
    );
  }
  lines.push('');

  // 命局关系
  lines.push('## 命局关系');
  const relations = chart.chartRelations;
  const relationRows = relations ? [...relations.stems, ...relations.branches] : [];
  if (relationRows.length) {
    for (const item of relationRows) {
      lines.push(`- ${item.type}·${item.name}（${item.ganZhi.join('、')}）：${item.description}`);
    }
  } else {
    lines.push('- 未见明显干支关系');
  }
  lines.push('');

  // 辅助四柱要素
  const factorRows: Array<[string, string | undefined]> = [
    ['胎元', chart.taiYuan?.value ?? chart.taiYuan?.note],
    ['胎息', chart.taiXi?.value ?? chart.taiXi?.note],
    ['命宫', chart.mingGong?.value ?? chart.mingGong?.note],
    ['身宫', chart.shenGong?.value ?? chart.shenGong?.note]
  ];
  const availableFactors = factorRows.filter(([, value]) => Boolean(value));
  if (availableFactors.length) {
    lines.push('## 命盘要素');
    for (const [label, value] of availableFactors) {
      lines.push(`- ${label}：${value}`);
    }
    lines.push('');
  }

  // 大运与流年
  lines.push('## 大运');
  lines.push(
    `- 起运：${chart.luck.startAgeText}${chart.luck.startSolarDate ? `（交运 ${chart.luck.startSolarDateTime || chart.luck.startSolarDate}）` : ''}，${
      chart.luck.direction === 'forward' ? '顺排' : '逆排'
    }`
  );
  if (chart.luck.cycles.length) {
    lines.push(
      `- 大运序列：${chart.luck.cycles
        .map((cycle) => `${cycle.ganZhi}（${cycle.startAge}-${cycle.endAge}岁 / ${cycle.startYear}-${cycle.endYear}）`)
        .join('；')}`
    );
    if (currentCycle) {
      lines.push(`- 当前大运：${currentCycle.ganZhi}（${currentCycle.startAge}-${currentCycle.endAge}岁）`);
      if (currentCycle.liuNian?.length) {
        lines.push(`- 当前大运流年：${currentCycle.liuNian.map((item) => `${item.year}${item.ganZhi}(${item.age}岁)`).join('、')}`);
      }
    }
  } else {
    lines.push(`- ${chart.luck.unavailableReason ?? '大运序列不可用'}`);
  }
  if (chart.luck.minorLuck?.length) {
    lines.push(`- 小运：${chart.luck.minorLuck.map((item) => `${item.year}${item.ganZhi}`).join('、')}`);
  }
  lines.push('');

  // 今日流日
  lines.push('## 今日流日');
  lines.push(`- 日期：${chart.daily.date}，日干支 ${chart.daily.ganZhi}，对日主关系：${chart.daily.relationToDayMaster}`);
  lines.push(
    `- 与原局关系：${chart.daily.relationsToNatal
      .map((item) => `${item.target}${item.targetGanZhi}（${item.dayStemRelation}${item.branchRelations.length ? `，${item.branchRelations.join('、')}` : ''}）`)
      .join('；')}`
  );
  lines.push('');

  // 排盘说明
  if (chart.notes.length) {
    lines.push('## 排盘说明');
    for (const note of chart.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  lines.push('## 请 AI 分析');
  lines.push('以上为程序算出的排盘事实层，请勿重新排盘、不要改动干支与五行数据。请基于以上数据：');
  lines.push('1. 判断命局格局、用神与喜忌；');
  lines.push('2. 分析事业方向与财运特征；');
  lines.push('3. 分析感情婚姻倾向；');
  lines.push('4. 给出健康与作息提醒；');
  lines.push('5. 结合当前大运与流年，说明近几年的重点与可执行建议。');
  lines.push('');

  return lines.join('\n');
}

export interface LiuyaoTextInput {
  question?: string;
  dateTime?: string;
}

// 六爻：把京房纳甲盘整理成 Markdown 文本，含卦象、四值、六爻装卦、伏神与解读请求
export function buildLiuyaoChartText(chart: ProfessionalLiuyaoChart, meta: LiuyaoTextInput = {}): string {
  const lines: string[] = [];
  const movingLines = chart.lines.filter((line) => line.moving);

  lines.push('# 六爻卦盘数据（Soothsay 排盘结果）', '');

  // 占问信息
  lines.push('## 占问');
  lines.push(`- 占问之事：${meta.question?.trim() || '未填写'}`);
  lines.push(`- 占问时间：${meta.dateTime ? meta.dateTime.replace('T', ' ') : '未填写'}`);
  lines.push(`- 月建：${chart.calendar.monthGanZhi}`);
  lines.push(`- 日辰：${chart.calendar.dayGanZhi}`);
  lines.push(`- 旬空：${chart.calendar.xunKong.join('')}`);
  lines.push('');

  // 卦象
  lines.push('## 卦象');
  lines.push(`- 本卦：${chart.primary}（${chart.palace}宫${chart.palaceElement} · ${chart.palaceStage}）`);
  lines.push(`- 变卦：${chart.transformed}（${movingLines.length ? `${movingLines.length} 爻动` : '六爻安静'}）`);
  lines.push('');

  // 六爻装卦
  lines.push('## 六爻装卦（上爻 → 初爻）', '');
  lines.push('| 爻位 | 六神 | 六亲 | 纳甲 | 阴阳 | 世应 | 变爻 | 状态 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const line of [...chart.lines].reverse()) {
    const status = [
      line.void ? '旬空' : '',
      line.monthBroken ? '月破' : '',
      line.dayClashed ? '日冲' : '',
      line.moving ? (line.yang ? '阳动' : '阴动') : ''
    ]
      .filter(Boolean)
      .join('、');
    const transformed = line.transformed
      ? `${line.transformed.relative} ${line.transformed.stem}${line.transformed.branch}${line.transformed.element}`
      : '—';
    lines.push(
      `| ${yaoPositionLabel(line.index)} | ${line.spirit} | ${line.relative} | ${line.stem}${line.branch}${line.element} | ${
        line.yang ? '阳爻' : '阴爻'
      } | ${line.shi ? '世' : line.ying ? '应' : '—'} | ${transformed} | ${status || '—'} |`
    );
  }
  lines.push('');

  // 伏神
  lines.push('## 伏神');
  if (chart.hidden.length) {
    for (const item of chart.hidden) {
      lines.push(
        `- ${item.relative} ${item.stem}${item.branch} 伏于${yaoPositionLabel(item.index)}（飞神 ${item.flyingBranch}）`
      );
    }
  } else {
    lines.push('- 六亲俱全，无伏神');
  }
  lines.push('');

  lines.push('## 排盘说明');
  lines.push(`- 规则版本：${chart.ruleVersion}（月建按节气月，空亡按日旬）`);
  lines.push('- 旺衰、用神取舍与应期判断由解读层结合占事给出。');
  lines.push('');

  lines.push('## 请 AI 分析');
  lines.push('以上为程序按京房纳甲算出的盘面事实层，请勿改动卦象、纳甲、四值与动爻。请基于以上盘面按传统六爻方法断卦：');
  lines.push('1. 结合占问之事取舍用神，并判断用神旺衰；');
  lines.push('2. 说明动爻、变爻对用神的作用；');
  lines.push('3. 分析世应关系与吉凶趋势；');
  lines.push('4. 给出应期判断与依据；');
  lines.push('5. 给出可落地的现实建议，并说明这是传统术数解释而非确定预测。');
  lines.push('');

  return lines.join('\n');
}

/** 梅花易数结构化卦盘导出：复述确定性盘面，供任意 AI 工具参考。 */
export function buildMeihuaChartText(chart: MeihuaChart, question = ''): string {
  const lines = [
    '# 梅花易数卦盘（Soothsay 排盘结果）',
    '',
    '## 占问',
    `- 问题：${question.trim() || '未填写'}`,
    `- 起卦方式：${chart.method === 'time' ? '年月日时（农历）' : '两数取卦'}`,
    `- 起卦时间：${chart.source.dateTime?.replace('T', ' ') || '不适用'}`,
    `- 农历：${chart.source.lunarText || '不适用'}`,
    `- 起卦数：上卦数 ${chart.source.upperNumber}，下卦数 ${chart.source.lowerNumber}`,
    `- 规则版本：${chart.ruleVersion}`,
    '',
    '## 本卦、互卦、变卦'
  ];
  for (const [label, hexagram] of [
    ['本卦', chart.primary], ['互卦', chart.mutual], ['变卦', chart.changed]
  ] as const) {
    lines.push(`- ${label}：${hexagram.name}（上${hexagram.upper.name}${hexagram.upper.element}、下${hexagram.lower.name}${hexagram.lower.element}）`);
    lines.push(`  爻象（上→初）：${[...hexagram.lines].reverse().map((value) => value ? '⚊' : '⚋').join(' ')}`);
  }
  lines.push(
    '',
    '## 动爻及体用',
    `- 动爻：第${chart.movingLine}爻（初爻为一）`,
    `- 体卦：${chart.body.name}${chart.body.element}（${chart.bodyPosition === 'upper' ? '上卦' : '下卦'}）`,
    `- 用卦：${chart.use.name}${chart.use.element}（${chart.usePosition === 'upper' ? '上卦' : '下卦'}）`,
    `- 本卦体用：${chart.relations.primary}`,
    `- 互卦上互与体：${chart.relations.mutualUpper}；下互与体：${chart.relations.mutualLower}`,
    `- 变卦变用：${chart.changedUse.name}${chart.changedUse.element}，${chart.relations.changed}`,
    '',
    '## 解卦要求',
    '请依据本卦、互卦、变卦及体用生克解释所问之事，先交代盘面依据再给出传统象数解读与现实建议；勿混用六爻纳甲法，亦勿将占卜解释视为确定预测。'
  );
  return lines.join('\n');
}

// 写入系统剪贴板；不支持 Clipboard API 的浏览器回退到隐藏 textarea + execCommand
export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('当前浏览器不支持自动复制，请手动选择文本');
}
