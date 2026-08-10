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

/** 备份文件体积上限，避免代理被当成任意文件中转 */
const MAX_CONTENT_BYTES = 20 * 1024 * 1024;

/**
 * 校验载荷。requireContent 仅在上传时开启。
 * 返回 null 表示校验通过，否则返回给用户看的中文提示。
 */
export function validateWebdavPayload(payload: WebdavPayload, requireContent = false): string | null {
  const url = payload.url?.trim();
  if (!url) return '缺少 WebDAV 服务器地址。';
  if (!/^https?:\/\//i.test(url)) return 'WebDAV 地址必须以 http:// 或 https:// 开头。';
  try {
    new URL(url);
  } catch {
    return 'WebDAV 地址格式不正确。';
  }
  if (!payload.path?.trim()) return '缺少备份文件路径。';
  if (payload.path.includes('..')) return '备份文件路径不能包含 .. 片段。';
  if (requireContent) {
    if (typeof payload.content !== 'string' || !payload.content) return '缺少要上传的备份内容。';
    if (Buffer.byteLength(payload.content, 'utf8') > MAX_CONTENT_BYTES) return '备份内容超过 20MB 上限。';
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
  const trimmed = path.trim();
  const segments = trimmed
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)));
  return `${base}/${segments.join('/')}${trimmed.endsWith('/') ? '/' : ''}`;
}

/** 取备份文件所在目录的逐级路径，用于依次 MKCOL 建目录 */
function collectParentPaths(path: string): string[] {
  const segments = path.trim().split('/').filter(Boolean);
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

/** 带超时的 WebDAV 请求，超时会抛出 AbortError 由调用方翻译 */
async function webdavFetch(
  url: string,
  method: string,
  payload: WebdavPayload,
  init: { headers?: Record<string, string>; body?: string } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBDAV_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      headers: { ...authHeader(payload), ...(init.headers ?? {}) },
      body: init.body,
      redirect: 'follow',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** 把网络异常统一成中文提示 */
function describeNetworkError(error: any): WebdavResult {
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
    const content = await response.text();
    return { status: 200, body: { ok: true, missing: false, content } };
  } catch (error) {
    return describeNetworkError(error);
  }
}

/**
 * 上传备份文件：先自上而下逐级 MKCOL 建目录（已存在会返回 405/301，直接忽略），再 PUT 覆盖。
 * 少数网盘对不存在的父目录返回 409，这里通过预建目录规避。
 */
export async function writeWebdavFile(payload: WebdavPayload): Promise<WebdavResult> {
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
