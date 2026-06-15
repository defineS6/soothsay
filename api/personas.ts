import {
  BUILTIN_ENGINE_DEFINITIONS,
  DEFAULT_PERSONAS,
  type PersonaEngine,
  type PersonaSkin
} from '../server/src/shared/persona';

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
