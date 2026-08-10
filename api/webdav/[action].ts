import { readQueryString, sendJson } from '../_vercel-store.js';
import {
  consumeWebdavRateLimit,
  getWebdavClientKey,
  MAX_WEBDAV_PROXY_BODY_BYTES,
  validateWebdavProxyRequest,
  WebdavRequestTooLargeError
} from '../../server/src/shared/webdav-access.js';
import {
  readWebdavFile,
  testWebdavConnection,
  validateWebdavPayload,
  writeWebdavFile,
  type WebdavPayload,
  type WebdavResult
} from '../../server/src/shared/webdav.js';

/**
 * Vercel 部署下的 WebDAV 代理入口。
 * 三个动作合并到同一个动态路由，避免占用 Hobby 套餐有限的 Serverless 函数额度。
 */
const ACTIONS: Record<string, { requireContent: boolean; run: (payload: WebdavPayload) => Promise<WebdavResult> }> = {
  test: { requireContent: false, run: testWebdavConnection },
  download: { requireContent: false, run: readWebdavFile },
  upload: { requireContent: true, run: writeWebdavFile }
};

function header(req: any, name: string): string | undefined {
  const value = req.headers?.[name.toLowerCase()] ?? req.headers?.[name];
  return Array.isArray(value) ? value[0] : value === undefined ? undefined : String(value);
}

async function readJsonLimited(req: any): Promise<unknown> {
  const contentLength = Number(header(req, 'content-length') ?? '');
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBDAV_PROXY_BODY_BYTES) {
    throw new WebdavRequestTooLargeError();
  }

  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_WEBDAV_PROXY_BODY_BYTES) throw new WebdavRequestTooLargeError();
      return req.body ? JSON.parse(req.body) : {};
    }
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > MAX_WEBDAV_PROXY_BODY_BYTES) throw new WebdavRequestTooLargeError();
      return req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
    }
    const serialized = JSON.stringify(req.body);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_WEBDAV_PROXY_BODY_BYTES) throw new WebdavRequestTooLargeError();
    return req.body;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_WEBDAV_PROXY_BODY_BYTES) throw new WebdavRequestTooLargeError();
    chunks.push(buffer);
  }
  if (!total) return {};
  return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const action = ACTIONS[readQueryString(req, 'action')];
  if (!action) {
    sendJson(res, 404, { error: '未知的 WebDAV 操作。' });
    return;
  }

  const meta = {
    origin: header(req, 'origin'),
    host: header(req, 'host'),
    forwardedHost: header(req, 'x-forwarded-host'),
    secFetchSite: header(req, 'sec-fetch-site'),
    clientHeader: header(req, 'x-soothsay-webdav'),
    forwardedFor: header(req, 'x-forwarded-for'),
    realIp: header(req, 'x-real-ip'),
    cfConnectingIp: header(req, 'cf-connecting-ip')
  };
  const accessError = validateWebdavProxyRequest(meta);
  if (accessError) {
    sendJson(res, 403, { error: accessError });
    return;
  }

  const rate = consumeWebdavRateLimit(getWebdavClientKey(meta));
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    sendJson(res, 429, { error: 'WebDAV 操作过于频繁，请稍后再试。' });
    return;
  }

  let payload: WebdavPayload;
  try {
    payload = (await readJsonLimited(req)) as WebdavPayload;
  } catch (error) {
    if (error instanceof WebdavRequestTooLargeError) {
      sendJson(res, 413, { error: error.message });
      return;
    }
    sendJson(res, 400, { error: '请求体必须是 JSON。' });
    return;
  }

  const validationError = validateWebdavPayload(payload, action.requireContent);
  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }

  const result = await action.run(payload);
  sendJson(res, result.status, result.body);
}
