import { deletePersona, readJson, readQueryString, requireAdmin, sendJson, updatePersona } from '../../_vercel-store.js';

export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;

  const id = readQueryString(req, 'id');
  if (!id) {
    sendJson(res, 400, { error: '缺少角色 ID' });
    return;
  }

  if (req.method === 'PUT') {
    try {
      const payload = await readJson(req);
      const persona = await updatePersona(id, payload);
      sendJson(res, 200, { persona });
    } catch (error: any) {
      sendJson(res, 400, { error: error?.message ?? '角色更新失败' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      await deletePersona(id);
      sendJson(res, 200, { ok: true });
    } catch (error: any) {
      sendJson(res, 400, { error: error?.message ?? '角色删除失败' });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method Not Allowed' });
}
