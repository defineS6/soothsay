import { Hono } from 'hono';
import {
  readWebdavFile,
  testWebdavConnection,
  validateWebdavPayload,
  writeWebdavFile,
  type WebdavPayload,
  type WebdavResult
} from '../shared/webdav.js';

export const webdavRoutes = new Hono();

/** 统一读取 JSON 请求体并做基础校验，避免三个路由重复相同的样板代码 */
async function withPayload(
  c: any,
  requireContent: boolean,
  handler: (payload: WebdavPayload) => Promise<WebdavResult>
) {
  let payload: WebdavPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: '请求体必须是 JSON。' }, 400);
  }
  const validationError = validateWebdavPayload(payload, requireContent);
  if (validationError) return c.json({ error: validationError }, 400);

  const result = await handler(payload);
  return c.json(result.body, result.status as any);
}

webdavRoutes.post('/webdav/test', (c) => withPayload(c, false, testWebdavConnection));
webdavRoutes.post('/webdav/download', (c) => withPayload(c, false, readWebdavFile));
webdavRoutes.post('/webdav/upload', (c) => withPayload(c, true, writeWebdavFile));
