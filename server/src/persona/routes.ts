import { Hono } from 'hono';
import { listEngines, listPersonas } from '../storage/role-store.js';

export const personaRoutes = new Hono();

personaRoutes.get('/personas', async (c) => {
  return c.json({
    engines: await listEngines(),
    personas: await listPersonas()
  });
});
