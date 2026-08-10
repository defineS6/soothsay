export const WEBDAV_CLIENT_HEADER_NAME = 'x-soothsay-webdav';
export const WEBDAV_CLIENT_HEADER_VALUE = '1';
export const MAX_WEBDAV_PROXY_BODY_BYTES = 4 * 1024 * 1024;
export const WEBDAV_RATE_LIMIT = 20;
export const WEBDAV_RATE_WINDOW_MS = 60_000;

export interface WebdavRequestMeta {
  origin?: string;
  host?: string;
  forwardedHost?: string;
  secFetchSite?: string;
  clientHeader?: string;
  forwardedFor?: string;
  realIp?: string;
  cfConnectingIp?: string;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

type RateGlobal = typeof globalThis & {
  __soothsayWebdavRateBuckets?: Map<string, RateBucket>;
};

const rateGlobal = globalThis as RateGlobal;
const rateBuckets = rateGlobal.__soothsayWebdavRateBuckets ?? new Map<string, RateBucket>();
rateGlobal.__soothsayWebdavRateBuckets = rateBuckets;

function normalizeHeaderValue(value: string | undefined): string {
  return value?.split(',')[0]?.trim() ?? '';
}

function normalizeHost(value: string | undefined): string {
  return normalizeHeaderValue(value).toLowerCase();
}

/**
 * WebDAV 代理只接受本站前端发起的请求。
 * 这是匿名应用下的同源防滥用门槛，不等价于用户身份认证；脚本客户端仍可伪造这些头。
 */
export function validateWebdavProxyRequest(meta: WebdavRequestMeta): string | null {
  if (meta.clientHeader !== WEBDAV_CLIENT_HEADER_VALUE) {
    return 'WebDAV 代理请求缺少客户端标识。';
  }
  if (meta.secFetchSite && meta.secFetchSite !== 'same-origin') {
    return 'WebDAV 代理只接受同源请求。';
  }
  if (!meta.origin) return 'WebDAV 代理请求缺少 Origin。';

  let origin: URL;
  try {
    origin = new URL(meta.origin);
  } catch {
    return 'WebDAV 代理请求 Origin 不正确。';
  }
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    return 'WebDAV 代理请求 Origin 不正确。';
  }

  const expectedHosts = new Set([
    normalizeHost(meta.host),
    normalizeHost(meta.forwardedHost)
  ].filter(Boolean));
  if (!expectedHosts.size) return 'WebDAV 代理无法确认本站 Host。';
  if (!expectedHosts.has(origin.host.toLowerCase())) {
    return 'WebDAV 代理只接受本站同源请求。';
  }
  return null;
}

/** 按代理提供的客户端地址生成限流键；没有地址时退化到 Origin。 */
export function getWebdavClientKey(meta: WebdavRequestMeta): string {
  const clientIp = normalizeHeaderValue(meta.cfConnectingIp)
    || normalizeHeaderValue(meta.forwardedFor)
    || normalizeHeaderValue(meta.realIp)
    || 'unknown';
  const origin = meta.origin?.trim().toLowerCase() || 'no-origin';
  return `${clientIp}|${origin}`;
}

/**
 * 单实例滑动窗口限流。Vercel Serverless 各实例不共享内存，因此这是 best-effort 防滥用，
 * 不能替代平台级 WAF/Rate Limit 或真实登录态。
 */
export function consumeWebdavRateLimit(key: string, now = Date.now()): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  if (rateBuckets.size > 500) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }

  const bucketKey = rateBuckets.size >= 2_000 && !rateBuckets.has(key) ? '__overflow__' : key;
  const existing = rateBuckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + WEBDAV_RATE_WINDOW_MS });
    return { allowed: true, remaining: WEBDAV_RATE_LIMIT - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= WEBDAV_RATE_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: WEBDAV_RATE_LIMIT - existing.count,
    retryAfterSeconds: 0
  };
}

export class WebdavRequestTooLargeError extends Error {
  constructor() {
    super('WebDAV 代理请求体超过 4MB 上限。');
    this.name = 'WebdavRequestTooLargeError';
  }
}

/** 对 Hono 的 Web Request 流式读取 JSON，在解析前先执行 4MB 硬上限。 */
export async function readWebdavJsonRequest(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBDAV_PROXY_BODY_BYTES) {
    throw new WebdavRequestTooLargeError();
  }
  if (!request.body) return {};

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_WEBDAV_PROXY_BODY_BYTES) {
      await reader.cancel();
      throw new WebdavRequestTooLargeError();
    }
    chunks.push(value);
  }

  if (!total) return {};
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(merged));
}
