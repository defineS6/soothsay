import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { MAX_WEBDAV_PROXY_BODY_BYTES } from './webdav-access.js';

/**
 * WebDAV 同步的服务端核心逻辑。
 *
 * 浏览器受同源策略限制，无法直接向第三方网盘发起 PROPFIND / MKCOL / PUT，
 * 因此由服务端做一层无状态转发。与 /api/proxy 一致：账号密码仅随请求透传，
 * 服务端不持久化、不写日志、不缓存任何凭据与备份正文。
 */

/** 前端提交的 WebDAV 请求载荷，password 与 username 用完即弃 */
export interface WebdavPayload {
  url?: string;
  username?: string;
  password?: string;
  path?: string;
  content?: string;
}

/** 统一的操作结果，供 Hono 路由与 Vercel 函数复用 */
export interface WebdavResult {
  status: number;
  body: Record<string, unknown>;
}

const WEBDAV_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

/** 备份正文控制在 2MB，给 Vercel 4.5MB 请求/响应限制与 JSON 转义留足余量。 */
export const MAX_WEBDAV_SNAPSHOT_BYTES = 2 * 1024 * 1024;

/** 仅允许访问公网地址，阻止代理探测本机、内网、链路本地和保留地址 */
const blockedAddresses = new BlockList();
blockedAddresses.addSubnet('0.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('100.64.0.0', 10, 'ipv4');
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
blockedAddresses.addSubnet('192.0.0.0', 24, 'ipv4');
blockedAddresses.addSubnet('192.0.2.0', 24, 'ipv4');
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('198.18.0.0', 15, 'ipv4');
blockedAddresses.addSubnet('198.51.100.0', 24, 'ipv4');
blockedAddresses.addSubnet('203.0.113.0', 24, 'ipv4');
blockedAddresses.addSubnet('224.0.0.0', 4, 'ipv4');
blockedAddresses.addSubnet('240.0.0.0', 4, 'ipv4');
blockedAddresses.addAddress('::', 'ipv6');
blockedAddresses.addAddress('::1', 'ipv6');
blockedAddresses.addSubnet('100::', 64, 'ipv6');
blockedAddresses.addSubnet('2001:db8::', 32, 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');
blockedAddresses.addSubnet('ff00::', 8, 'ipv6');

class WebdavSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebdavSecurityError';
  }
}

class WebdavContentTooLargeError extends Error {
  constructor(message = 'WebDAV 备份超过 2MB 上限。') {
    super(message);
    this.name = 'WebdavContentTooLargeError';
  }
}

/** 流式读取上游文件，在内存累计前执行体积上限。 */
async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new WebdavContentTooLargeError();
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new WebdavContentTooLargeError();
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

function isBlockedIpAddress(address: string, family: 4 | 6): boolean {
  const normalized = normalizeHostname(address);
  // BlockList 会把 IPv4 与 IPv4-mapped IPv6 做统一匹配；这里显式拒绝 mapped IPv6，避免误伤普通公网 IPv4。
  if (family === 6 && normalized.startsWith('::ffff:')) return true;
  return blockedAddresses.check(normalized, family === 6 ? 'ipv6' : 'ipv4');
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;

  const family = isIP(normalized);
  if (family === 4 || family === 6) return isBlockedIpAddress(normalized, family);
  return false;
}

/**
 * 发请求前解析域名并检查所有解析结果，避免把公网代理用来访问服务端内网。
 * 重定向每一跳都会重新调用本函数。
 */
async function assertSafeWebdavTarget(targetUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new WebdavSecurityError('WebDAV 地址格式不正确。');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new WebdavSecurityError('WebDAV 地址仅允许使用 http:// 或 https://。');
  }
  if (parsed.username || parsed.password) {
    throw new WebdavSecurityError('WebDAV 地址中不能内嵌账号或密码，请使用独立的账号密码字段。');
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (isBlockedHostname(hostname)) {
    throw new WebdavSecurityError('WebDAV 地址不能指向本机、内网、链路本地或保留地址。');
  }

  if (!isIP(hostname)) {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length) throw new WebdavSecurityError('WebDAV 域名没有可用的解析地址。');
    for (const item of addresses) {
      const family = item.family === 6 ? 6 : 4;
      if (isBlockedIpAddress(item.address, family)) {
        throw new WebdavSecurityError('WebDAV 域名解析到了本机、内网、链路本地或保留地址。');
      }
    }
  }

  return parsed;
}

/** 对单个路径段做有限次重复解码，堵住 %2e%2e / %252e%252e 等编码绕过 */
function decodePathSegment(rawSegment: string): string {
  let decoded = rawSegment;
  for (let index = 0; index < 4; index += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new WebdavSecurityError('备份文件路径包含无效的 URL 编码。');
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  if (/%[0-9a-f]{2}/i.test(decoded)) {
    throw new WebdavSecurityError('备份文件路径的 URL 编码层级过深。');
  }
  return decoded;
}

/**
 * 将相对路径规范化为安全的 URL path。
 * 每个路径段先完整解码，再拒绝 . / ..、编码后的斜杠、反斜杠和控制字符。
 */
export function normalizeWebdavPath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, '');
  if (!trimmed) throw new WebdavSecurityError('缺少备份文件路径。');

  const trailingSlash = trimmed.endsWith('/');
  const segments = trimmed.split('/').filter(Boolean).map((rawSegment) => {
    const decoded = decodePathSegment(rawSegment);
    if (decoded === '.' || decoded === '..') {
      throw new WebdavSecurityError('备份文件路径不能包含 . 或 .. 路径段。');
    }
    if (decoded.includes('/') || decoded.includes('\\')) {
      throw new WebdavSecurityError('备份文件路径段不能包含编码后的斜杠或反斜杠。');
    }
    if (/[\u0000-\u001f\u007f]/.test(decoded)) {
      throw new WebdavSecurityError('备份文件路径不能包含控制字符。');
    }
    return encodeURIComponent(decoded);
  });

  if (!segments.length) throw new WebdavSecurityError('缺少备份文件路径。');
  return `${segments.join('/')}${trailingSlash ? '/' : ''}`;
}

/**
 * 校验载荷。requireContent 仅在上传时开启。
 * 返回 null 表示校验通过，否则返回给用户看的中文提示。
 */
export function validateWebdavPayload(payload: WebdavPayload, requireContent = false): string | null {
  const url = payload.url?.trim();
  if (!url) return '缺少 WebDAV 服务器地址。';
  if (!/^https?:\/\//i.test(url)) return 'WebDAV 地址必须以 http:// 或 https:// 开头。';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'WebDAV 地址仅允许使用 http:// 或 https://。';
    if (parsed.username || parsed.password) return 'WebDAV 地址中不能内嵌账号或密码。';
    if (isBlockedHostname(parsed.hostname)) return 'WebDAV 地址不能指向本机、内网、链路本地或保留地址。';
  } catch {
    return 'WebDAV 地址格式不正确。';
  }
  try {
    normalizeWebdavPath(payload.path ?? '');
  } catch (error) {
    return error instanceof Error ? error.message : '备份文件路径不正确。';
  }
  if (requireContent) {
    if (typeof payload.content !== 'string' || !payload.content) return '缺少要上传的备份内容。';
    if (Buffer.byteLength(payload.content, 'utf8') > MAX_WEBDAV_SNAPSHOT_BYTES) return '备份内容超过 2MB 上限。';
  }
  return null;
}

/**
 * 把「服务器地址 + 相对路径」拼成完整 URL，逐段编码以兼容中文与空格目录名。
 * 入参以 / 结尾时保留尾斜杠：WebDAV 规范中集合（目录）URI 必须带尾斜杠，
 * 否则 MKCOL 建出的资源与后续 PUT 的父目录对不上，部分服务器会直接返回 409。
 */
export function buildWebdavUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  return `${base}/${normalizeWebdavPath(path)}`;
}

/** 取备份文件所在目录的逐级路径，用于依次 MKCOL 建目录 */
function collectParentPaths(path: string): string[] {
  const normalized = normalizeWebdavPath(path).replace(/\/$/, '');
  const segments = normalized.split('/').filter(Boolean);
  segments.pop();
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

/** 把上游状态码翻译成用户能理解的中文错误 */
export function classifyWebdavStatus(status: number): string {
  if (status === 401) return 'WebDAV 鉴权失败，请检查账号与密码（部分网盘需使用应用专用密码）。';
  if (status === 403) return 'WebDAV 拒绝访问，请检查该账号对目标目录是否有读写权限。';
  if (status === 404) return 'WebDAV 路径不存在，请检查服务器地址与备份路径。';
  if (status === 405) return 'WebDAV 服务器不支持该操作，请确认地址指向 WebDAV 根目录。';
  if (status === 409) return 'WebDAV 目标目录不存在，无法写入。';
  if (status === 507) return 'WebDAV 存储空间不足。';
  if (status >= 500) return 'WebDAV 服务暂时不可用。';
  return `WebDAV 返回错误（${status}）。`;
}

function authHeader(payload: WebdavPayload): Record<string, string> {
  const username = payload.username?.trim() ?? '';
  const password = payload.password ?? '';
  if (!username && !password) return {};
  return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 307 || status === 308;
}

/**
 * 带超时的 WebDAV 请求。每次请求和重定向都会重新检查目标地址；
 * 重定向不允许跳到其他主机，避免 Basic 凭据泄露给第三方目标。
 */
async function webdavFetch(
  url: string,
  method: string,
  payload: WebdavPayload,
  init: { headers?: Record<string, string>; body?: string } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBDAV_TIMEOUT_MS);
  try {
    const initialTarget = await assertSafeWebdavTarget(url);
    const allowedHostname = normalizeHostname(initialTarget.hostname);
    let currentUrl = initialTarget.toString();

    for (let redirectCount = 0; ; redirectCount += 1) {
      const currentTarget = await assertSafeWebdavTarget(currentUrl);
      if (normalizeHostname(currentTarget.hostname) !== allowedHostname) {
        throw new WebdavSecurityError('WebDAV 重定向不能跳转到其他主机。');
      }

      const response = await fetch(currentTarget.toString(), {
        method,
        headers: { ...authHeader(payload), ...(init.headers ?? {}) },
        body: init.body,
        redirect: 'manual',
        signal: controller.signal
      });

      if (!isRedirectStatus(response.status)) return response;
      const location = response.headers.get('location');
      if (!location) return response;
      if (redirectCount >= MAX_REDIRECTS) {
        await response.body?.cancel();
        throw new WebdavSecurityError('WebDAV 重定向次数过多。');
      }

      const nextTarget = new URL(location, currentTarget);
      if (normalizeHostname(nextTarget.hostname) !== allowedHostname) {
        await response.body?.cancel();
        throw new WebdavSecurityError('WebDAV 重定向不能跳转到其他主机。');
      }
      await response.body?.cancel();
      currentUrl = nextTarget.toString();
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** 把网络异常统一成中文提示 */
function describeNetworkError(error: any): WebdavResult {
  if (error instanceof WebdavSecurityError) {
    return { status: 400, body: { error: error.message } };
  }
  if (error instanceof WebdavContentTooLargeError) {
    return { status: 413, body: { error: error.message } };
  }
  if (error?.name === 'AbortError') {
    return { status: 504, body: { error: 'WebDAV 请求超时，请检查服务器地址或网络。' } };
  }
  return { status: 502, body: { error: '无法连接 WebDAV 服务器，请检查地址是否可访问。' } };
}

/**
 * 连通性测试：对备份文件所在目录发 PROPFIND(Depth:0)。
 * 目录尚未创建时会返回 404，这属于「地址与账号可用、只是还没同步过」，同样视为通过。
 */
export async function testWebdavConnection(payload: WebdavPayload): Promise<WebdavResult> {
  const parents = collectParentPaths(payload.path!);
  const probePath = parents.length ? `${parents[parents.length - 1]}/` : '';
  const url = probePath ? buildWebdavUrl(payload.url!, probePath) : payload.url!.trim().replace(/\/+$/, '') + '/';
  try {
    const response = await webdavFetch(url, 'PROPFIND', payload, {
      headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'
    });
    if (response.ok || response.status === 207) return { status: 200, body: { ok: true } };
    if (response.status === 404) return { status: 200, body: { ok: true, missingDirectory: true } };
    return { status: response.status, body: { error: classifyWebdavStatus(response.status) } };
  } catch (error) {
    return describeNetworkError(error);
  }
}

/** 下载备份文件；文件不存在时返回 missing 标记而不是错误，方便前端提示「云端还没有备份」 */
export async function readWebdavFile(payload: WebdavPayload): Promise<WebdavResult> {
  const url = buildWebdavUrl(payload.url!, payload.path!);
  try {
    const response = await webdavFetch(url, 'GET', payload);
    if (response.status === 404) return { status: 200, body: { ok: true, missing: true } };
    if (!response.ok) return { status: response.status, body: { error: classifyWebdavStatus(response.status) } };
    const content = await readResponseTextLimited(response, MAX_WEBDAV_SNAPSHOT_BYTES);
    const body = { ok: true, missing: false, content };
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_WEBDAV_PROXY_BODY_BYTES) {
      return { status: 413, body: { error: 'WebDAV 备份经过代理封装后超过 4MB 响应上限。' } };
    }
    return { status: 200, body };
  } catch (error) {
    return describeNetworkError(error);
  }
}

/**
 * 上传备份文件：先自上而下逐级 MKCOL 建目录（已存在会返回 405/301，直接忽略），再 PUT 覆盖。
 * 少数网盘对不存在的父目录返回 409，这里通过预建目录规避。
 */
export async function writeWebdavFile(payload: WebdavPayload): Promise<WebdavResult> {
  if (Buffer.byteLength(payload.content ?? '', 'utf8') > MAX_WEBDAV_SNAPSHOT_BYTES) {
    return { status: 413, body: { error: '备份内容超过 2MB 上限。' } };
  }
  try {
    for (const parent of collectParentPaths(payload.path!)) {
      const directoryUrl = buildWebdavUrl(payload.url!, `${parent}/`);
      const created = await webdavFetch(directoryUrl, 'MKCOL', payload);
      // 405 表示目录已存在，401/403 才是真正的失败
      if (created.status === 401 || created.status === 403) {
        return { status: created.status, body: { error: classifyWebdavStatus(created.status) } };
      }
    }

    const url = buildWebdavUrl(payload.url!, payload.path!);
    const response = await webdavFetch(url, 'PUT', payload, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: payload.content!
    });
    if (!response.ok) return { status: response.status, body: { error: classifyWebdavStatus(response.status) } };
    return { status: 200, body: { ok: true, bytes: Buffer.byteLength(payload.content!, 'utf8') } };
  } catch (error) {
    return describeNetworkError(error);
  }
}
