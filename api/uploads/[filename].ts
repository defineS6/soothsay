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

async function ensureUploadTable() {
  const clientPool = await getPool();
  if (!clientPool || ensured) return clientPool;
  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS soothsay_uploads (
      filename text PRIMARY KEY,
      content_type text NOT NULL,
      body bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  ensured = true;
  return clientPool;
}

function sendText(res: any, status: number, text: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

function readUploadFilename(req: any) {
  const queryFilename = req.query?.filename;
  const rawFromQuery = Array.isArray(queryFilename) ? queryFilename[0] : queryFilename;
  if (rawFromQuery) {
    return decodeURIComponent(String(rawFromQuery).split('/').pop() ?? '');
  }

  try {
    const url = new URL(String(req.url ?? ''), 'https://soothsay.local');
    return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return '';
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  const filename = readUploadFilename(req);
  if (!filename) {
    sendText(res, 404, 'Not Found');
    return;
  }

  try {
    const clientPool = await ensureUploadTable();
    if (!clientPool) {
      sendText(res, 404, 'Not Found');
      return;
    }
    const result = await clientPool.query('SELECT content_type, body FROM soothsay_uploads WHERE filename = $1', [filename]);
    const row = result.rows[0] as { content_type: string; body: Buffer } | undefined;
    if (!row) {
      sendText(res, 404, 'Not Found');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', row.content_type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(req.method === 'HEAD' ? undefined : row.body);
  } catch (error) {
    console.error(error);
    sendText(res, 404, 'Not Found');
  }
}
