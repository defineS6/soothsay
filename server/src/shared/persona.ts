export type BuiltinEngineId = 'daoist' | 'buddhist' | 'realist' | 'psychology';
export type EngineId = string;
export type FortuneCategory = 'bazi' | 'daily';

export interface ToneSettings {
  directness: number;
  detail: number;
}

export interface PersonaSkin {
  id: string;
  name: string;
  engineId: EngineId;
  avatarUrl: string;
  backgroundUrl: string;
  tone: ToneSettings;
  opening: string;
  customPrompt: string;
  categories: FortuneCategory[];
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaEngine {
  id: EngineId;
  name: string;
  worldview: string;
  promptRules: string[];
  builtin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const BUILTIN_ENGINE_DEFINITIONS: Record<BuiltinEngineId, PersonaEngine> = {
  daoist: {
    id: 'daoist',
    name: '道家',
    worldview:
      '以阴阳消长、五行流转、顺势而为作为解读核心。强调命局气机、旺衰制化、趋吉避凶与修身调和。',
    promptRules: [
      '用道家命理视角解释结构化命盘，不把排盘事实重新计算或改写。',
      '先讲气势与格局，再落到事业、财运、姻缘、健康和当下行动。',
      '建议应体现顺势、守中、调候、取用与生活作息上的可执行调整。'
    ]
  },
  buddhist: {
    id: 'buddhist',
    name: '佛家',
    worldview:
      '以因缘、业力、慈悲、观照与修心作为解读核心。承认命盘趋势，但强调心行可以转化处境。',
    promptRules: [
      '用佛家观照与因缘语言解释命盘，不制造宿命恐吓。',
      '先指出习气与课题，再给出可实践的修心、沟通、取舍建议。',
      '结论要温和稳定，避免绝对化断语。'
    ]
  },
  realist: {
    id: 'realist',
    name: '现实派',
    worldview:
      '以现实决策、风险管理、资源配置与心理行为模式作为解读核心。把命盘当作性格和周期的结构化参考。',
    promptRules: [
      '用现实派顾问口吻解释命盘，把玄学结论转译为策略、边界和行动清单。',
      '直说优势、短板、风险点和下一步选择，不神化也不贬低命理。',
      '重点落在事业路径、金钱习惯、亲密关系沟通和健康管理。'
    ]
  },
  psychology: {
    id: 'psychology',
    name: '心理学派',
    worldview:
      '以人格模式、依恋关系、情绪调节、认知偏差与行为改变作为解读核心。把命盘视为自我观察和心理结构化访谈的入口。',
    promptRules: [
      '用心理学派视角解释命盘，把命理语言转译为情绪、关系、动机和行为模式。',
      '不做临床诊断，不贴病理标签；只提供自我觉察、沟通边界和可执行练习。',
      '回答要兼具温度与结构，先安顿情绪，再指出模式，最后给出具体行动。'
    ]
  }
};

export const ENGINE_DEFINITIONS: Record<string, PersonaEngine> = BUILTIN_ENGINE_DEFINITIONS;

const now = '2026-01-01T00:00:00.000Z';

export const DEFAULT_PERSONAS: PersonaSkin[] = [
  {
    id: 'builtin-daoist',
    name: '云松道长',
    engineId: 'daoist',
    avatarUrl: '/defaults/daoist-avatar.svg',
    backgroundUrl: '/defaults/daoist-bg.svg',
    tone: { directness: 42, detail: 72 },
    opening: '贫道先看你命局的气从何处来，再看今日该顺哪一阵风。',
    customPrompt: '',
    categories: ['bazi', 'daily'],
    builtin: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'builtin-buddhist',
    name: '明澈法师',
    engineId: 'buddhist',
    avatarUrl: '/defaults/buddhist-avatar.svg',
    backgroundUrl: '/defaults/buddhist-bg.svg',
    tone: { directness: 25, detail: 66 },
    opening: '命盘如镜，照见因缘；我们慢慢看，哪些是业风，哪些可由心转。',
    customPrompt: '',
    categories: ['bazi', 'daily'],
    builtin: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'builtin-realist',
    name: '玄璃姐',
    engineId: 'psychology',
    avatarUrl: '/defaults/realist-avatar.svg',
    backgroundUrl: '/defaults/realist-bg.svg',
    tone: { directness: 58, detail: 70 },
    opening: '我会先看你的模式和情绪卡点，再把命盘里的提醒翻译成能落地的心理练习。',
    customPrompt: '',
    categories: ['bazi', 'daily'],
    builtin: true,
    createdAt: now,
    updatedAt: now
  }
];

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(value);
}

export function isBuiltinEngineId(value: unknown): value is BuiltinEngineId {
  return value === 'daoist' || value === 'buddhist' || value === 'realist' || value === 'psychology';
}

export function normalizeTone(tone: Partial<ToneSettings> | undefined): ToneSettings {
  const clamp = (value: unknown, fallback: number) => {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.min(100, Math.max(0, Math.round(numberValue)));
  };
  return {
    directness: clamp(tone?.directness, 50),
    detail: clamp(tone?.detail, 60)
  };
}

export function normalizeCategories(value: unknown): FortuneCategory[] {
  if (!Array.isArray(value)) return ['bazi', 'daily'];
  const categories = value.filter((item): item is FortuneCategory => item === 'bazi' || item === 'daily');
  return categories.length > 0 ? [...new Set(categories)] : ['bazi', 'daily'];
}
