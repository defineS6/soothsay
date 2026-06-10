import type { BaziChart } from '@/bazi/types';
import {
  ENGINE_DEFINITIONS,
  type FortuneCategory,
  type PersonaEngine,
  type PersonaSkin,
  type ToneSettings
} from '@server-shared/persona';
import type { ChatMessage, SharedProfile } from '@/storage/types';

export type FortuneTask = 'bazi_full' | 'daily' | 'daily_lot' | 'follow_up';

export interface PromptBuildInput {
  persona: PersonaSkin;
  engine?: PersonaEngine;
  chart: BaziChart;
  task: FortuneTask;
  sharedProfile?: SharedProfile | null;
  roleHistory?: ChatMessage[];
  question?: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PersonaGenerationDraft {
  engine: Pick<PersonaEngine, 'name' | 'worldview' | 'promptRules'>;
  persona: {
    name: string;
    opening: string;
    customPrompt: string;
    tone: ToneSettings;
    categories: FortuneCategory[];
  };
}

export function toneToPromptRules(tone: ToneSettings): string[] {
  const directness =
    tone.directness >= 70
      ? '表达要直截了当，先说关键判断，再解释原因。'
      : tone.directness <= 35
        ? '表达要多鼓励与安顿情绪，尖锐判断需包裹在建设性建议中。'
        : '表达在坦诚与照顾感受之间保持平衡。';
  const detail =
    tone.detail >= 70
      ? '解读要详尽，给出结构、依据与分步骤建议。'
      : tone.detail <= 35
        ? '解读要简洁，避免铺陈，只保留最重要的判断和行动。'
        : '解读要适中，重点部分展开，次要部分点到为止。';
  return [directness, detail];
}

export function createChartFactLayer(chart: BaziChart): string {
  return JSON.stringify(chart.promptFacts, null, 2);
}

function createTaskLayer(task: FortuneTask): string {
  if (task === 'daily') {
    return '任务：生成每日运势。必须基于命盘中的今日流日关系，输出今日总体节奏、事业财运、关系沟通、健康作息和一个具体行动建议。';
  }
  if (task === 'daily_lot') {
    return [
      '任务：生成今日抽签。必须基于命盘中的今日流日关系和当前角色体系，给出一支今日灵签。',
      '输出必须使用 Markdown，结构依次为：',
      '### 今日灵签：第X签 · 吉/中/凶',
      '**签诗**',
      '> 四句短签诗',
      '**解签**',
      '**今日宜**',
      '**今日忌**',
      '**一句行动**',
      '签位和签诗可以有仪式感，但不得随机编造事实层之外的出生信息，不可改写命盘事实。'
    ].join('\n');
  }
  if (task === 'follow_up') {
    return '任务：回答用户追问。允许开放式角色扮演聊天，但必须保持算命大师底色，并与本角色既有结论一致。';
  }
  return '任务：生成八字全解。必须覆盖事业、财运、姻缘、健康四个维度，先给总论，再分维度说明依据与建议。';
}

function createDefaultQuestion(task: FortuneTask): string {
  if (task === 'daily') return '请看我今天的运势。';
  if (task === 'daily_lot') return '请为我抽一支今日签。';
  return '请为我做八字全解。';
}

export function buildPersonaGenerationMessages(direction: string, engines: PersonaEngine[]): LlmMessage[] {
  const engineSummary = engines
    .map((engine) => `- ${engine.name}（id: ${engine.id}）：${engine.worldview}`)
    .join('\n');
  return [
    {
      role: 'system',
      content: [
        '你是占卜产品的角色与体系设计师，擅长把一个创意方向设计成可运营的大师角色。',
        '请只返回一个 JSON 对象，不要 Markdown，不要解释，不要代码围栏。',
        'JSON 结构必须完全符合：',
        '{"engine":{"name":"体系名称","worldview":"体系世界观","promptRules":["体系提示规则1","体系提示规则2","体系提示规则3"]},"persona":{"name":"大师名字","opening":"开场白","customPrompt":"角色自定义提示词","tone":{"directness":50,"detail":70},"categories":["bazi","daily"]}}',
        '字段要求：name 不超过 40 字；opening 不超过 120 字；customPrompt 不超过 800 字；engine.name 不超过 30 字；worldview 不超过 300 字；promptRules 3-5 条，每条不超过 120 字。',
        'customPrompt 要写给模型执行，包含口吻、人设边界、表达禁忌、解读侧重点和与用户互动方式。',
        'tone.directness 与 tone.detail 为 0-100 的整数；categories 只能从 bazi、daily 中选择，通常两者都要包含。',
        '必须生成一个与角色匹配的新体系，不要复用已有体系名称；可以参考已有体系避免重复。',
        `已有体系：\n${engineSummary || '暂无'}`
      ].join('\n')
    },
    {
      role: 'user',
      content: `创意方向：${direction.trim()}`
    }
  ];
}

function createMemoryLayer(sharedProfile?: SharedProfile | null, roleHistory: ChatMessage[] = []) {
  return JSON.stringify(
    {
      sharedProfile: sharedProfile
        ? {
            facts: sharedProfile.facts,
            updatedAt: sharedProfile.updatedAt
          }
        : null,
      recentRoleHistory: roleHistory.slice(-8)
    },
    null,
    2
  );
}

export function buildFortuneMessages(input: PromptBuildInput): LlmMessage[] {
  const engine =
    input.engine ??
    ENGINE_DEFINITIONS[input.persona.engineId] ??
    ENGINE_DEFINITIONS.realist ??
    Object.values(ENGINE_DEFINITIONS)[0];
  const customPrompt = input.persona.customPrompt?.trim();
  const roleLayer = [
    `你是${input.persona.name}，绑定体系：${engine.name}。`,
    `世界观：${engine.worldview}`,
    `角色开场白：${input.persona.opening}`,
    ...engine.promptRules,
    ...(customPrompt ? [`角色自定义提示词：\n${customPrompt}`] : []),
    ...toneToPromptRules(input.persona.tone),
    '不可重新排盘，不可改写命理事实层；如需要引用命盘，只能引用事实层中的结构化数据。',
    '可以给出不同视角与侧重，但不得声称自己掌握事实层之外的出生信息。'
  ].join('\n');

  return [
    {
      role: 'system',
      content: `【角色层】\n${roleLayer}\n\n【命理事实层】\n${createChartFactLayer(input.chart)}\n\n【任务层】\n${createTaskLayer(input.task)}\n\n【记忆层】\n${createMemoryLayer(input.sharedProfile, input.roleHistory)}`
    },
    {
      role: 'user',
      content: input.question?.trim() || createDefaultQuestion(input.task)
    }
  ];
}
