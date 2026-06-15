import fs from 'node:fs/promises';
import {
  BUILTIN_ENGINE_DEFINITIONS,
  DEFAULT_PERSONAS,
  isBuiltinEngineId,
  isEngineId,
  normalizeCategories,
  normalizeTone,
  type PersonaEngine,
  type PersonaSkin
} from '../shared/persona.js';
import {
  ensurePostgresStore,
  isPostgresEnabled,
  readPostgresRoleStore,
  writePostgresRoleStore
} from './postgres.js';
import { DATA_DIR, ROLE_FILE, UPLOAD_DIR } from './paths.js';

interface RoleFile {
  roles: PersonaSkin[];
  engines: PersonaEngine[];
}

function createId() {
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEngineId() {
  return `engine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readFileRoleStore(): Promise<RoleFile> {
  try {
    const raw = await fs.readFile(ROLE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RoleFile>;
    return {
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
      engines: Array.isArray(parsed.engines) ? parsed.engines : []
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return { roles: [], engines: [] };
    throw error;
  }
}

async function writeFileRoleStore(file: RoleFile) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ROLE_FILE, JSON.stringify(file, null, 2), 'utf8');
}

async function readRoleStore(): Promise<RoleFile> {
  return isPostgresEnabled() ? readPostgresRoleStore() : readFileRoleStore();
}

async function writeRoleStore(file: RoleFile) {
  if (isPostgresEnabled()) {
    await writePostgresRoleStore(file);
    return;
  }
  await writeFileRoleStore(file);
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

function normalizeBackgroundIntensity(value: unknown, fallback = 100) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function sanitizeCustomEnginePayload(payload: any, existing?: PersonaEngine): PersonaEngine {
  const now = new Date().toISOString();
  const id = String(payload?.id ?? existing?.id ?? createEngineId()).trim();
  if (!isEngineId(id) || isBuiltinEngineId(id)) throw new Error('自定义体系 ID 不合法');
  return {
    id,
    name: readLimitedText(payload?.name, existing?.name ?? '', 30, '体系名称'),
    worldview: readLimitedText(payload?.worldview, existing?.worldview ?? '', 500, '体系世界观'),
    promptRules: normalizePromptRules(payload?.promptRules, existing?.promptRules),
    builtin: false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

function builtinEngines(): PersonaEngine[] {
  return Object.values(BUILTIN_ENGINE_DEFINITIONS).map((engine) => ({ ...engine, builtin: true }));
}

function customEngines(file: RoleFile) {
  return file.engines.filter((engine) => isEngineId(engine.id) && !isBuiltinEngineId(engine.id));
}

function listEnginesFromFile(file: RoleFile): PersonaEngine[] {
  return [...builtinEngines(), ...customEngines(file)];
}

function hasEngine(engines: PersonaEngine[], id: unknown) {
  return typeof id === 'string' && engines.some((engine) => engine.id === id);
}

function upsertPayloadEngine(file: RoleFile, payload: any) {
  if (!payload?.engine) return;
  const index = file.engines.findIndex((engine) => engine.id === payload.engine.id);
  const engine = sanitizeCustomEnginePayload(payload.engine, index >= 0 ? file.engines[index] : undefined);
  if (index >= 0) {
    file.engines[index] = engine;
  } else {
    file.engines.push(engine);
  }
  payload.engineId = engine.id;
}

function sanitizeRolePayload(payload: any, existing: PersonaSkin | undefined, engines: PersonaEngine[]): PersonaSkin {
  const now = new Date().toISOString();
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
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

function sanitizeBuiltinMediaPayload(payload: any, base: PersonaSkin, existing?: PersonaSkin): PersonaSkin {
  const now = new Date().toISOString();
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
    updatedAt: now
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

export async function ensureRoleStore() {
  if (isPostgresEnabled()) {
    await ensurePostgresStore();
    const pgSnapshot = await readPostgresRoleStore();
    if (pgSnapshot.roles.length === 0 && pgSnapshot.engines.length === 0) {
      const fileSnapshot = await readFileRoleStore();
      if (fileSnapshot.roles.length > 0 || fileSnapshot.engines.length > 0) {
        await writePostgresRoleStore(fileSnapshot);
      }
    }
    return;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await readFileRoleStore();
}

export async function listPersonas(): Promise<PersonaSkin[]> {
  const file = await readRoleStore();
  const builtinIds = new Set(DEFAULT_PERSONAS.map((role) => role.id));
  const overrides = new Map(file.roles.filter((role) => builtinIds.has(role.id)).map((role) => [role.id, role]));
  const builtins = DEFAULT_PERSONAS.map((role) => mergeBuiltinPersona(role, overrides.get(role.id)));
  const customs = file.roles.filter((role) => !builtinIds.has(role.id)).map(normalizeStoredPersona);
  return [...builtins, ...customs];
}

export async function listEngines(): Promise<PersonaEngine[]> {
  return listEnginesFromFile(await readRoleStore());
}

export async function createPersona(payload: unknown): Promise<PersonaSkin> {
  const file = await readRoleStore();
  upsertPayloadEngine(file, payload as any);
  const role = sanitizeRolePayload(payload, undefined, listEnginesFromFile(file));
  file.roles.push(role);
  await writeRoleStore(file);
  return role;
}

export async function updatePersona(id: string, payload: unknown): Promise<PersonaSkin> {
  const file = await readRoleStore();
  const builtin = DEFAULT_PERSONAS.find((role) => role.id === id);
  if (builtin) {
    const index = file.roles.findIndex((role) => role.id === id);
    const role = sanitizeBuiltinMediaPayload(payload, builtin, index >= 0 ? file.roles[index] : undefined);
    if (index >= 0) {
      file.roles[index] = role;
    } else {
      file.roles.push(role);
    }
    await writeRoleStore(file);
    return role;
  }

  const index = file.roles.findIndex((role) => role.id === id);
  if (index < 0) throw new Error('角色不存在');
  upsertPayloadEngine(file, payload as any);
  const role = sanitizeRolePayload(payload, file.roles[index], listEnginesFromFile(file));
  file.roles[index] = role;
  await writeRoleStore(file);
  return role;
}

export async function deletePersona(id: string): Promise<void> {
  if (DEFAULT_PERSONAS.some((role) => role.id === id)) {
    throw new Error('内置角色不可删除');
  }
  const file = await readRoleStore();
  const nextRoles = file.roles.filter((role) => role.id !== id);
  if (nextRoles.length === file.roles.length) throw new Error('角色不存在');
  await writeRoleStore({ roles: nextRoles, engines: file.engines });
}
