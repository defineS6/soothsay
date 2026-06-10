import pg from 'pg';
import type { PersonaEngine, PersonaSkin } from '../shared/persona.js';

const { Pool } = pg;

export interface RoleStoreSnapshot {
  roles: PersonaSkin[];
  engines: PersonaEngine[];
}

export interface UploadRecord {
  filename: string;
  contentType: string;
  body: Buffer;
}

let pool: pg.Pool | null = null;
let ensured = false;

export function getPostgresDsn() {
  return (
    process.env.SOOTHSAY_PG_DSN?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_DSN?.trim() ||
    ''
  );
}

export function isPostgresEnabled() {
  return Boolean(getPostgresDsn());
}

function createSslConfig(dsn: string) {
  const sslMode = process.env.PGSSLMODE?.trim() || new URL(dsn).searchParams.get('sslmode') || '';
  if (!sslMode || sslMode === 'disable') return undefined;
  return { rejectUnauthorized: false };
}

function getPool() {
  const dsn = getPostgresDsn();
  if (!dsn) throw new Error('未配置 PostgreSQL DSN');
  if (!pool) {
    pool = new Pool({
      connectionString: dsn,
      max: Number(process.env.PG_POOL_MAX ?? 5),
      ssl: createSslConfig(dsn)
    });
  }
  return pool;
}

export async function ensurePostgresStore() {
  if (ensured) return;
  const client = await getPool().connect();
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
}

export async function readPostgresRoleStore(): Promise<RoleStoreSnapshot> {
  await ensurePostgresStore();
  const [roles, engines] = await Promise.all([
    getPool().query<{ payload: PersonaSkin }>('SELECT payload FROM soothsay_roles ORDER BY updated_at ASC'),
    getPool().query<{ payload: PersonaEngine }>('SELECT payload FROM soothsay_engines ORDER BY updated_at ASC')
  ]);
  return {
    roles: roles.rows.map((row) => row.payload),
    engines: engines.rows.map((row) => row.payload)
  };
}

export async function writePostgresRoleStore(snapshot: RoleStoreSnapshot) {
  await ensurePostgresStore();
  const client = await getPool().connect();
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

export async function savePostgresUpload(filename: string, contentType: string, body: Buffer) {
  await ensurePostgresStore();
  await getPool().query(
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

export async function readPostgresUpload(filename: string): Promise<UploadRecord | null> {
  await ensurePostgresStore();
  const result = await getPool().query<{
    filename: string;
    content_type: string;
    body: Buffer;
  }>('SELECT filename, content_type, body FROM soothsay_uploads WHERE filename = $1', [filename]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    filename: row.filename,
    contentType: row.content_type,
    body: row.body
  };
}
