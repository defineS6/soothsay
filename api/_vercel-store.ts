import { timingSafeEqual } from 'node:crypto';

type EngineId = string;
type FortuneCategory = 'bazi' | 'daily';

interface ToneSettings {
  directness: number;
  detail: number;
}

export interface PersonaSkin {
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

export interface PersonaEngine {
  id: EngineId;
  name: string;
  worldview: string;
  promptRules: string[];
  builtin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface RoleStoreSnapshot {
  roles: PersonaSkin[];
  engines: PersonaEngine[];
}

interface UploadedFile {
  name: string;
  type: string;
  data: Buffer;
}

export const BUILTIN_ENGINE_DEFINITIONS: Record<string, PersonaEngine> = {
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

export const DEFAULT_PERSONAS: PersonaSkin[] = [
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

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

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

async function requirePool() {
  const clientPool = await getPool();
  if (!clientPool) throw new Error('Vercel 部署需要配置 SOOTHSAY_PG_DSN 或 DATABASE_URL 才能保存后台数据');
  return clientPool;
}

async function ensurePostgresStore() {
  const clientPool = await getPool();
  if (!clientPool || ensured) return clientPool;
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS soothsay_uploads (
        filename text PRIMARY KEY,
        content_type text NOT NULL,
        body bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
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
  return clientPool;
}

async function readRoleStore(): Promise<RoleStoreSnapshot> {
  const clientPool = await ensurePostgresStore();
  if (!clientPool) return { roles: [], engines: [] };
  const [roles, engines] = await Promise.all([
    clientPool.query('SELECT payload FROM soothsay_roles ORDER BY updated_at ASC'),
    clientPool.query('SELECT payload FROM soothsay_engines ORDER BY updated_at ASC')
  ]);
  return {
    roles: (roles.rows as Array<{ payload: PersonaSkin }>).map((row) => row.payload),
    engines: (engines.rows as Array<{ payload: PersonaEngine }>).map((row) => row.payload)
  };
}

async function writeRoleStore(snapshot: RoleStoreSnapshot) {
  await ensurePostgresStore();
  const client = await (await requirePool()).connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM soothsay_roles');
    await client.query('DELETE FROM soothsay_engines');
    for (const role of snapshot.roles) {
      await client.query('INSERT INTO soothsay_roles (id, payload, updated_at) VALUES ($1, $2, now())', [
        role.id,
        JSON.stringify(role)
      ]);
    }
    for (const engine of snapshot.engines) {
      await client.query('INSERT INTO soothsay_engines (id, payload, updated_at) VALUES ($1, $2, now())', [
        engine.id,
        JSON.stringify(engine)
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function createId() {
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEngineId() {
  return `engine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(value);
}

function isBuiltinEngineId(value: unknown) {
  return value === 'daoist' || value === 'buddhist' || value === 'realist' || value === 'psychology';
}

function normalizeTone(tone: Partial<ToneSettings> | undefined): ToneSettings {
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

function normalizeCategories(value: unknown): FortuneCategory[] {
  if (!Array.isArray(value)) return ['bazi', 'daily'];
  const categories = value.filter((item): item is FortuneCategory => item === 'bazi' || item === 'daily');
  return categories.length > 0 ? [...new Set(categories)] : ['bazi', 'daily'];
}

function normalizeBackgroundIntensity(value: unknown, fallback = 100) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function readLimitedText(value: unknown, fallback: string, maxLength: number, label: string) {
  const text = String(value ?? fallback ?? '').trim();
  if (!text || text.length > maxLength) throw new Error(`${label}需为 1-${maxLength} 个字符`);
  return text;
}

function normalizePromptRules(value: unknown, existing: string[] = []) {
  const source = Array.isArray(value) ? value : existing;
  const rules = source
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, 8);
  if (rules.length === 0) throw new Error('体系提示规则至少需要 1 条');
  if (rules.some((rule) => rule.length > 260)) throw new Error('单条体系提示规则不能超过 260 个字符');
  return rules;
}

function sanitizeCustomEnginePayload(payload: any, existing?: PersonaEngine): PersonaEngine {
  const currentTime = new Date().toISOString();
  const id = String(payload?.id ?? existing?.id ?? createEngineId()).trim();
  if (!isEngineId(id) || isBuiltinEngineId(id)) throw new Error('自定义体系 ID 不合法');
  return {
    id,
    name: readLimitedText(payload?.name, existing?.name ?? '', 30, '体系名称'),
    worldview: readLimitedText(payload?.worldview, existing?.worldview ?? '', 500, '体系世界观'),
    promptRules: normalizePromptRules(payload?.promptRules, existing?.promptRules),
    builtin: false,
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime
  };
}

function builtinEngines(): PersonaEngine[] {
  return Object.values(BUILTIN_ENGINE_DEFINITIONS).map((engine) => ({ ...engine, builtin: true }));
}

function customEngines(snapshot: RoleStoreSnapshot) {
  return snapshot.engines.filter((engine) => isEngineId(engine.id) && !isBuiltinEngineId(engine.id));
}

function listEnginesFromSnapshot(snapshot: RoleStoreSnapshot): PersonaEngine[] {
  return [...builtinEngines(), ...customEngines(snapshot)];
}

function hasEngine(engines: PersonaEngine[], id: unknown) {
  return typeof id === 'string' && engines.some((engine) => engine.id === id);
}

function upsertPayloadEngine(snapshot: RoleStoreSnapshot, payload: any) {
  if (!payload?.engine) return;
  const index = snapshot.engines.findIndex((engine) => engine.id === payload.engine.id);
  const engine = sanitizeCustomEnginePayload(payload.engine, index >= 0 ? snapshot.engines[index] : undefined);
  if (index >= 0) {
    snapshot.engines[index] = engine;
  } else {
    snapshot.engines.push(engine);
  }
  payload.engineId = engine.id;
}

function sanitizeRolePayload(payload: any, existing: PersonaSkin | undefined, engines: PersonaEngine[]): PersonaSkin {
  const currentTime = new Date().toISOString();
  const name = String(payload?.name ?? existing?.name ?? '').trim();
  const opening = String(payload?.opening ?? existing?.opening ?? '').trim();
  const customPrompt = String(payload?.customPrompt ?? existing?.customPrompt ?? '').trim();
  const engineId = payload?.engineId ?? existing?.engineId;
  const backgroundUrl = String(payload?.backgroundUrl ?? existing?.backgroundUrl ?? '/defaults/custom-bg.svg').trim();
  if (!name || name.length > 40) throw new Error('角色名字需为 1-40 个字符');
  if (!isEngineId(engineId) || !hasEngine(engines, engineId)) throw new Error('体系类型不合法');
  if (!opening || opening.length > 300) throw new Error('开场白需为 1-300 个字符');
  if (customPrompt.length > 1200) throw new Error('自定义提示词不能超过 1200 个字符');

  return {
    id: existing?.id ?? createId(),
    name,
    engineId,
    avatarUrl: String(payload?.avatarUrl ?? existing?.avatarUrl ?? '/defaults/custom-avatar.svg').trim(),
    backgroundUrl,
    mobileBackgroundUrl: String(payload?.mobileBackgroundUrl ?? existing?.mobileBackgroundUrl ?? backgroundUrl).trim(),
    backgroundIntensity: normalizeBackgroundIntensity(payload?.backgroundIntensity, existing?.backgroundIntensity ?? 100),
    tone: normalizeTone(payload?.tone ?? existing?.tone),
    opening,
    customPrompt,
    categories: normalizeCategories(payload?.categories ?? existing?.categories),
    builtin: false,
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime
  };
}

function sanitizeBuiltinMediaPayload(payload: any, base: PersonaSkin, existing?: PersonaSkin): PersonaSkin {
  const currentTime = new Date().toISOString();
  const backgroundUrl = String(payload?.backgroundUrl ?? existing?.backgroundUrl ?? base.backgroundUrl).trim();
  return {
    ...base,
    avatarUrl: String(payload?.avatarUrl ?? existing?.avatarUrl ?? base.avatarUrl).trim(),
    backgroundUrl,
    mobileBackgroundUrl: String(payload?.mobileBackgroundUrl ?? existing?.mobileBackgroundUrl ?? base.mobileBackgroundUrl ?? backgroundUrl).trim(),
    backgroundIntensity: normalizeBackgroundIntensity(payload?.backgroundIntensity, existing?.backgroundIntensity ?? base.backgroundIntensity ?? 100),
    customPrompt: base.customPrompt,
    builtin: true,
    createdAt: existing?.createdAt ?? base.createdAt,
    updatedAt: currentTime
  };
}

function mergeBuiltinPersona(base: PersonaSkin, override?: PersonaSkin): PersonaSkin {
  if (!override) return base;
  return {
    ...base,
    avatarUrl: override.avatarUrl || base.avatarUrl,
    backgroundUrl: override.backgroundUrl || base.backgroundUrl,
    mobileBackgroundUrl: override.mobileBackgroundUrl || override.backgroundUrl || base.mobileBackgroundUrl || base.backgroundUrl,
    backgroundIntensity: normalizeBackgroundIntensity(override.backgroundIntensity, base.backgroundIntensity ?? 100),
    updatedAt: override.updatedAt ?? base.updatedAt
  };
}

function normalizeStoredPersona(role: PersonaSkin): PersonaSkin {
  const backgroundUrl = role.backgroundUrl || '/defaults/custom-bg.svg';
  return {
    ...role,
    backgroundUrl,
    mobileBackgroundUrl: role.mobileBackgroundUrl || backgroundUrl,
    backgroundIntensity: normalizeBackgroundIntensity(role.backgroundIntensity, 100),
    customPrompt: role.customPrompt ?? ''
  };
}

export async function listPersonas(): Promise<PersonaSkin[]> {
  const snapshot = await readRoleStore();
  const builtinIds = new Set(DEFAULT_PERSONAS.map((role) => role.id));
  const overrides = new Map(snapshot.roles.filter((role) => builtinIds.has(role.id)).map((role) => [role.id, role]));
  return [
    ...DEFAULT_PERSONAS.map((role) => mergeBuiltinPersona(role, overrides.get(role.id))),
    ...snapshot.roles.filter((role) => !builtinIds.has(role.id)).map(normalizeStoredPersona)
  ];
}

export async function createPersona(payload: unknown): Promise<PersonaSkin> {
  const snapshot = await readRoleStore();
  upsertPayloadEngine(snapshot, payload as any);
  const role = sanitizeRolePayload(payload, undefined, listEnginesFromSnapshot(snapshot));
  snapshot.roles.push(role);
  await writeRoleStore(snapshot);
  return role;
}

export async function updatePersona(id: string, payload: unknown): Promise<PersonaSkin> {
  const snapshot = await readRoleStore();
  const builtin = DEFAULT_PERSONAS.find((role) => role.id === id);
  if (builtin) {
    const index = snapshot.roles.findIndex((role) => role.id === id);
    const role = sanitizeBuiltinMediaPayload(payload, builtin, index >= 0 ? snapshot.roles[index] : undefined);
    if (index >= 0) {
      snapshot.roles[index] = role;
    } else {
      snapshot.roles.push(role);
    }
    await writeRoleStore(snapshot);
    return role;
  }

  const index = snapshot.roles.findIndex((role) => role.id === id);
  if (index < 0) throw new Error('角色不存在');
  upsertPayloadEngine(snapshot, payload as any);
  const role = sanitizeRolePayload(payload, snapshot.roles[index], listEnginesFromSnapshot(snapshot));
  snapshot.roles[index] = role;
  await writeRoleStore(snapshot);
  return role;
}

export async function deletePersona(id: string): Promise<void> {
  if (DEFAULT_PERSONAS.some((role) => role.id === id)) {
    throw new Error('内置角色不可删除');
  }
  const snapshot = await readRoleStore();
  const nextRoles = snapshot.roles.filter((role) => role.id !== id);
  if (nextRoles.length === snapshot.roles.length) throw new Error('角色不存在');
  await writeRoleStore({ roles: nextRoles, engines: snapshot.engines });
}

export function sendJson(res: any, status: number, data: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export function sendText(res: any, status: number, text: string, headers: Record<string, string> = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

async function readBodyBuffer(req: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: any) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
    return req.body;
  }
  const body = await readBodyBuffer(req);
  if (body.length === 0) return {};
  return JSON.parse(body.toString('utf8'));
}

function getExpectedCredentials() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseBasicAuth(header: string | undefined) {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

export function requireAdmin(req: any, res: any) {
  const expected = getExpectedCredentials();
  if (!expected) {
    sendJson(res, 503, { error: '管理后台凭据未配置，请通过环境变量 ADMIN_USERNAME 与 ADMIN_PASSWORD 注入。' });
    return false;
  }
  const credentials = parseBasicAuth(req.headers?.authorization);
  if (!credentials || !safeEqual(credentials.username, expected.username) || !safeEqual(credentials.password, expected.password)) {
    sendJson(res, 401, { error: '未授权，请使用有效 admin 凭据。' }, { 'WWW-Authenticate': 'Basic realm="Soothsay Admin"' });
    return false;
  }
  return true;
}

function parseContentDisposition(value: string) {
  const name = /(?:^|;\s*)name="([^"]*)"/i.exec(value)?.[1] ?? '';
  const filename = /(?:^|;\s*)filename="([^"]*)"/i.exec(value)?.[1] ?? '';
  return { name, filename };
}

export async function readMultipartFile(req: any): Promise<UploadedFile | null> {
  const contentType = String(req.headers?.['content-type'] ?? '');
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[1] ?? /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[2];
  if (!boundary) return null;

  const body = await readBodyBuffer(req);
  const delimiter = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from('\r\n\r\n');
  const nextDelimiterPrefix = Buffer.from(`\r\n--${boundary}`);
  let position = body.indexOf(delimiter);

  while (position >= 0 && position < body.length) {
    position += delimiter.length;
    if (body[position] === 45 && body[position + 1] === 45) break;
    if (body[position] === 13 && body[position + 1] === 10) position += 2;

    const headerEnd = body.indexOf(headerSeparator, position);
    if (headerEnd < 0) break;
    const headersText = body.subarray(position, headerEnd).toString('latin1');
    const bodyStart = headerEnd + headerSeparator.length;
    const bodyEnd = body.indexOf(nextDelimiterPrefix, bodyStart);
    if (bodyEnd < 0) break;

    const headers = new Map<string, string>();
    for (const line of headersText.split('\r\n')) {
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }

    const disposition = parseContentDisposition(headers.get('content-disposition') ?? '');
    if (disposition.name === 'file' && disposition.filename) {
      return {
        name: disposition.filename,
        type: headers.get('content-type') ?? 'application/octet-stream',
        data: body.subarray(bodyStart, bodyEnd)
      };
    }
    position = bodyEnd + 2;
  }

  return null;
}

function fileBaseName(fileName: string) {
  const cleanName = fileName.split(/[\\/]/).pop() || 'image';
  const dotIndex = cleanName.lastIndexOf('.');
  return dotIndex > 0 ? cleanName.slice(0, dotIndex) : cleanName;
}

async function savePostgresUpload(filename: string, contentType: string, body: Buffer) {
  await ensurePostgresStore();
  await (await requirePool()).query(
    `
      INSERT INTO soothsay_uploads (filename, content_type, body, created_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (filename) DO UPDATE SET
        content_type = EXCLUDED.content_type,
        body = EXCLUDED.body
    `,
    [filename, contentType, body]
  );
}

export async function saveUpload(file: UploadedFile) {
  const ext = MIME_TO_EXT[file.type];
  if (!ext) throw new Error('仅支持 png、jpg、webp、gif、svg 图片');
  if (file.data.length <= 0 || file.data.length > MAX_IMAGE_SIZE) {
    throw new Error('图片大小需大于 0 且不超过 4MB');
  }

  const basename = fileBaseName(file.name)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const filename = `${Date.now()}-${basename || 'image'}.${ext}`;
  await savePostgresUpload(filename, file.type, file.data);
  return `/uploads/${filename}`;
}

export function readQueryString(req: any, name: string) {
  const value = req.query?.[name];
  if (Array.isArray(value)) return String(value[0] ?? '');
  if (value !== undefined) return String(value ?? '');
  try {
    const url = new URL(String(req.url ?? ''), 'https://soothsay.local');
    return url.searchParams.get(name) ?? decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return '';
  }
}
