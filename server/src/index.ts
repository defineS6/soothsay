import { serve } from '@hono/node-server';
import { loadEnvFile } from 'node:process';
import { createApp } from './app.js';
import { ensureRoleStore } from './storage/role-store.js';

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const port = Number(process.env.PORT ?? 8787);

await ensureRoleStore();
const app = createApp();

serve({ fetch: app.fetch, port });

console.info(`Soothsay 服务已启动：http://localhost:${port}`);
