import { createPersona, listPersonas, readJson, requireAdmin, sendJson } from '../_vercel-store.js';

export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    try {
      sendJson(res, 200, { personas: await listPersonas() });
    } catch (error: any) {
      sendJson(res, 500, { error: error?.message ?? '角色列表加载失败' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const payload = await readJson(req);
      const persona = await createPersona(payload);
      sendJson(res, 201, { persona });
    } catch (error: any) {
      sendJson(res, 400, { error: error?.message ?? '角色创建失败' });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method Not Allowed' });
}
