import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { adminRoutes } from './admin/routes.js';
import { personaRoutes } from './persona/routes.js';
import { proxyRoutes } from './proxy/routes.js';
import { DATA_DIR } from './storage/paths.js';
import { isPostgresEnabled, readPostgresUpload } from './storage/postgres.js';

export function createApp() {
  const app = new Hono();

  app.use(
    '*',
    logger((message) => {
      console.info(message);
    })
  );

  app.route('/api/admin', adminRoutes);
  app.route('/api', proxyRoutes);
  app.route('/api', personaRoutes);
  app.use('/uploads/*', async (c, next) => {
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
  });
  app.use('/uploads/*', serveStatic({ root: DATA_DIR }));
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));

  return app;
}
