import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context, type Next } from 'hono';
import { logger } from 'hono/logger';
import { adminRoutes } from './admin/routes.js';
import { personaRoutes } from './persona/routes.js';
import { proxyRoutes } from './proxy/routes.js';
import { DATA_DIR } from './storage/paths.js';
import { ensureRoleStore } from './storage/role-store.js';
import { isPostgresEnabled, readPostgresUpload } from './storage/postgres.js';

export interface CreateAppOptions {
  ensureStore?: boolean;
  requirePostgres?: boolean;
  serveStaticAssets?: boolean;
  mountApiUploads?: boolean;
}

async function servePostgresUpload(c: Context, next: Next) {
  if (!isPostgresEnabled()) {
    await next();
    return;
  }
  const filename = c.req.path.split('/').pop() ?? '';
  const upload = await readPostgresUpload(filename);
  if (!upload) return c.notFound();
  return new Response(new Uint8Array(upload.body), {
    headers: {
      'Content-Type': upload.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}

export function createApp(options: CreateAppOptions = {}) {
  const { ensureStore = false, requirePostgres = false, serveStaticAssets = true, mountApiUploads = false } = options;
  const app = new Hono();

  app.use(
    '*',
    logger((message) => {
      console.info(message);
    })
  );
  if (ensureStore) {
    app.use('*', async (c, next) => {
      if (requirePostgres && !isPostgresEnabled()) {
        return c.json({ error: 'Vercel 部署需要配置 DATABASE_URL 或 SOOTHSAY_PG_DSN 作为持久化存储' }, 500);
      }
      await ensureRoleStore();
      await next();
    });
  }

  app.route('/api/admin', adminRoutes);
  app.route('/api', proxyRoutes);
  app.route('/api', personaRoutes);
  if (mountApiUploads) {
    app.use('/api/uploads/*', servePostgresUpload);
  }
  app.use('/uploads/*', servePostgresUpload);
  app.use('/uploads/*', serveStatic({ root: DATA_DIR }));
  if (serveStaticAssets) {
    app.use('/*', serveStatic({ root: './dist' }));
    app.get('*', serveStatic({ path: './dist/index.html' }));
  }

  return app;
}
