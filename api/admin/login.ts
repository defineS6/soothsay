import { requireAdmin, sendJson } from '../_vercel-store.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;
  sendJson(res, 200, { ok: true });
}
