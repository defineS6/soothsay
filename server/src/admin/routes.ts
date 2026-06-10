import { Hono } from 'hono';
import { requireAdmin } from './auth.js';
import { saveUpload } from './uploads.js';
import { createPersona, deletePersona, listPersonas, updatePersona } from '../storage/role-store.js';

export const adminRoutes = new Hono();

adminRoutes.get('/login', requireAdmin, (c) => c.json({ ok: true }));

adminRoutes.get('/personas', requireAdmin, async (c) => {
  return c.json({ personas: await listPersonas() });
});

adminRoutes.post('/personas', requireAdmin, async (c) => {
  try {
    const payload = await c.req.json();
    const role = await createPersona(payload);
    return c.json({ persona: role }, 201);
  } catch (error: any) {
    return c.json({ error: error?.message ?? '角色创建失败' }, 400);
  }
});

adminRoutes.put('/personas/:id', requireAdmin, async (c) => {
  try {
    const payload = await c.req.json();
    const role = await updatePersona(c.req.param('id'), payload);
    return c.json({ persona: role });
  } catch (error: any) {
    return c.json({ error: error?.message ?? '角色更新失败' }, 400);
  }
});

adminRoutes.delete('/personas/:id', requireAdmin, async (c) => {
  try {
    await deletePersona(c.req.param('id'));
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? '角色删除失败' }, 400);
  }
});

adminRoutes.post('/uploads', requireAdmin, async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: '请上传图片文件' }, 400);
    }
    const url = await saveUpload(file);
    return c.json({ url }, 201);
  } catch (error: any) {
    return c.json({ error: error?.message ?? '图片上传失败' }, 400);
  }
});
