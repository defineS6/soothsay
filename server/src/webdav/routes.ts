import { Hono } from 'hono';
import {
  consumeWebdavRateLimit,
  getWebdavClientKey,
  readWebdavJsonRequest,
  validateWebdavProxyRequest,
  WebdavRequestTooLargeError
} from '../shared/webdav-access.js';
import {
  readWebdavFile,
  testWebdavConnection,
  validateWebdavPayload,
  writeWebdavFile,
  type WebdavPayload,
  type WebdavResult
} from '../shared/webdav.js';

export const webdavRoutes = new Hono();

function requestMeta(c: any) {
  return {
    origin: c.req.header('Origin'),
    host: c.req.header('Host') ?? new URL(c.req.url).host,
    forwardedHost: c.req.header('X-Forwarded-Host'),
    secFetchSite: c.req.header('Sec-Fetch-Site'),
    clientHeader: c.req.header('X-Soothsay-WebDAV'),
    forwardedFor: c.req.header('X-Forwarded-For'),
    realIp: c.req.header('X-Real-IP'),
    cfConnectingIp: c.req.header('CF-Connecting-IP')
  };
}

/** 统一做同源门槛、限流、请求体上限与业务载荷校验。 */
async function withPayload(
  c: any,
  requireContent: boolean,
  handler: (payload: WebdavPayload) => Promise<WebdavResult>
) {
  const meta = requestMeta(c);
  const accessError = validateWebdavProxyRequest(meta);
  if (accessError) return c.json({ error: accessError }, 403);

  const rate = consumeWebdavRateLimit(getWebdavClientKey(meta));
  if (!rate.allowed) {
    c.header('Retry-After', String(rate.retryAfterSeconds));
    return c.json({ error: 'WebDAV 操作过于频繁，请稍后再试。' }, 429);
  }

  let payload: WebdavPayload;
  try {
    payload = (await readWebdavJsonRequest(c.req.raw)) as WebdavPayload;
  } catch (error) {
    if (error instanceof WebdavRequestTooLargeError) {
      return c.json({ error: error.message }, 413);
    }
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
