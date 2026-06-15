type EngineId = string;
type FortuneCategory = 'bazi' | 'daily';

interface ToneSettings {
  directness: number;
  detail: number;
}

interface PersonaSkin {
  id: string;
  name: string;
  engineId: EngineId;
  avatarUrl: string;
  backgroundUrl: string;
  mobileBackgroundUrl: string;
  backgroundIntensity: number;
  tone: ToneSettings;
  opening: string;
  customPrompt: string;
  categories: FortuneCategory[];
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PersonaEngine {
  id: EngineId;
  name: string;
  worldview: string;
  promptRules: string[];
  builtin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const BUILTIN_ENGINE_DEFINITIONS: Record<string, PersonaEngine> = {
  daoist: {
    id: 'daoist',
    name: '道家',
    worldview: '以阴阳消长、五行流转、顺势而为作为解读核心。强调命局气机、旺衰制化、趋吉避凶与修身调和。',
    promptRules: [
      '用道家命理视角解释结构化命盘，不把排盘事实重新计算或改写。',
      '先讲气势与格局，再落到事业、财运、姻缘、健康和当下行动。',
      '建议应体现顺势、守中、调候、取用与生活作息上的可执行调整。'
    ]
  },
  buddhist: {
    id: 'buddhist',
    name: '佛家',
    worldview: '以因缘、业力、慈悲、观照与修心作为解读核心。承认命盘趋势，但强调心行可以转化处境。',
    promptRules: [
      '用佛家观照与因缘语言解释命盘，不制造宿命恐吓。',
      '先指出习气与课题，再给出可实践的修心、沟通、取舍建议。',
      '结论要温和稳定，避免绝对化断语。'
    ]
  },
  realist: {
    id: 'realist',
    name: '现实派',
    worldview: '以现实决策、风险管理、资源配置与心理行为模式作为解读核心。把命盘当作性格和周期的结构化参考。',
    promptRules: [
      '用现实派顾问口吻解释命盘，把玄学结论转译为策略、边界和行动清单。',
      '直说优势、短板、风险点和下一步选择，不神化也不贬低命理。',
      '重点落在事业路径、金钱习惯、亲密关系沟通和健康管理。'
    ]
  },
  psychology: {
    id: 'psychology',
    name: '心理学派',
    worldview: '以人格模式、依恋关系、情绪调节、认知偏差与行为改变作为解读核心。把命盘视为自我观察和心理结构化访谈的入口。',
    promptRules: [
      '用心理学派视角解释命盘，把命理语言转译为情绪、关系、动机和行为模式。',
      '不做临床诊断，不贴病理标签；只提供自我觉察、沟通边界和可执行练习。',
      '回答要兼具温度与结构，先安顿情绪，再指出模式，最后给出具体行动。'
    ]
  }
};

const now = '2026-01-01T00:00:00.000Z';

const DEFAULT_PERSONAS: PersonaSkin[] = [
  {
    id: 'builtin-daoist',
    name: '云松道长',
    engineId: 'daoist',
    avatarUrl: '/defaults/daoist-avatar.svg',
    backgroundUrl: '/defaults/daoist-bg.svg',
    mobileBackgroundUrl: '/defaults/daoist-bg.svg',
    backgroundIntensity: 100,
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
    mobileBackgroundUrl: '/defaults/buddhist-bg.svg',
    backgroundIntensity: 100,
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
    mobileBackgroundUrl: '/defaults/realist-bg.svg',
    backgroundIntensity: 100,
    tone: { directness: 58, detail: 70 },
    opening: '我会先看你的模式和情绪卡点，再把命盘里的提醒翻译成能落地的心理练习。',
    customPrompt: '',
    categories: ['bazi', 'daily'],
    builtin: true,
    createdAt: now,
    updatedAt: now
  }
];

interface RoleStoreSnapshot {
  roles: PersonaSkin[];
  engines: PersonaEngine[];
}

let pool: any = null;
let ensured = false;

function getPostgresDsn() {
  return (
    process.env.SOOTHSAY_PG_DSN?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_DSN?.trim() ||
    ''
  );
}

function createSslConfig(dsn: string) {
  const sslMode = process.env.PGSSLMODE?.trim() || new URL(dsn).searchParams.get('sslmode') || '';
  if (!sslMode || sslMode === 'disable') return undefined;
  return { rejectUnauthorized: false };
}

async function getPool() {
  const dsn = getPostgresDsn();
  if (!dsn) return null;
  if (!pool) {
    const pgModule = await import('pg');
    const { Pool } = pgModule.default ?? pgModule;
    pool = new Pool({
      connectionString: dsn,
      max: Number(process.env.PG_POOL_MAX ?? 1),
      ssl: createSslConfig(dsn)
    });
  }
  return pool;
}

async function ensurePostgresStore() {
  const clientPool = await getPool();
  if (!clientPool || ensured) return;
  const client = await clientPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS soothsay_roles (
        id text PRIMARY KEY,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS soothsay_engines (
        id text PRIMARY KEY,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query('COMMIT');
    ensured = true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function builtinEngines(): PersonaEngine[] {
  return Object.values(BUILTIN_ENGINE_DEFINITIONS).map((engine) => ({ ...engine, builtin: true }));
}

function mergeBuiltinPersona(base: PersonaSkin, override?: PersonaSkin): PersonaSkin {
  if (!override) return base;
  return {
    ...base,
    avatarUrl: override.avatarUrl || base.avatarUrl,
    backgroundUrl: override.backgroundUrl || base.backgroundUrl,
    mobileBackgroundUrl: override.mobileBackgroundUrl || override.backgroundUrl || base.mobileBackgroundUrl || base.backgroundUrl,
    backgroundIntensity: Number.isFinite(Number(override.backgroundIntensity)) ? Number(override.backgroundIntensity) : base.backgroundIntensity,
    updatedAt: override.updatedAt ?? base.updatedAt
  };
}

function normalizeStoredPersona(role: PersonaSkin): PersonaSkin {
  const backgroundUrl = role.backgroundUrl || '/defaults/custom-bg.svg';
  return {
    ...role,
    backgroundUrl,
    mobileBackgroundUrl: role.mobileBackgroundUrl || backgroundUrl,
    backgroundIntensity: Number.isFinite(Number(role.backgroundIntensity)) ? Number(role.backgroundIntensity) : 100,
    customPrompt: role.customPrompt ?? ''
  };
}

function listPersonasFromSnapshot(snapshot: RoleStoreSnapshot) {
  const builtinIds = new Set(DEFAULT_PERSONAS.map((role) => role.id));
  const overrides = new Map(snapshot.roles.filter((role) => builtinIds.has(role.id)).map((role) => [role.id, role]));
  const personas = [
    ...DEFAULT_PERSONAS.map((role) => mergeBuiltinPersona(role, overrides.get(role.id))),
    ...snapshot.roles.filter((role) => !builtinIds.has(role.id)).map(normalizeStoredPersona)
  ];
  const customEngines = snapshot.engines.filter((engine) => engine.id && !Object.hasOwn(BUILTIN_ENGINE_DEFINITIONS, engine.id));
  return {
    engines: [...builtinEngines(), ...customEngines],
    personas
  };
}

async function readPostgresRoleStore(): Promise<RoleStoreSnapshot | null> {
  const clientPool = await getPool();
  if (!clientPool) return null;
  await ensurePostgresStore();
  const [roles, engines] = await Promise.all([
    clientPool.query('SELECT payload FROM soothsay_roles ORDER BY updated_at ASC'),
    clientPool.query('SELECT payload FROM soothsay_engines ORDER BY updated_at ASC')
  ]);
  return {
    roles: (roles.rows as Array<{ payload: PersonaSkin }>).map((row) => row.payload),
    engines: (engines.rows as Array<{ payload: PersonaEngine }>).map((row) => row.payload)
  };
}

function sendJson(res: any, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  try {
    const snapshot = await readPostgresRoleStore();
    sendJson(res, 200, listPersonasFromSnapshot(snapshot ?? { roles: [], engines: [] }));
  } catch (error) {
    console.error(error);
    sendJson(res, 200, listPersonasFromSnapshot({ roles: [], engines: [] }));
  }
}
