import { handle } from '@hono/node-server/vercel';
import { createApp } from '../server/src/app';

export const config = {
  runtime: 'nodejs'
};

const app = createApp({
  ensureStore: true,
  requirePostgres: true,
  serveStaticAssets: false,
  mountApiUploads: true
});

export default handle(app);
