import { timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';

function getExpectedCredentials() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function parseBasicAuth(header: string | undefined) {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

export function isAdminAuthorized(c: Context) {
  const expected = getExpectedCredentials();
  if (!expected) return false;
  const credentials = parseBasicAuth(c.req.header('Authorization'));
  if (!credentials) return false;
  return safeEqual(credentials.username, expected.username) && safeEqual(credentials.password, expected.password);
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  if (!getExpectedCredentials()) {
    return c.json({ error: '管理后台凭据未配置，请通过环境变量 ADMIN_USERNAME 与 ADMIN_PASSWORD 注入。' }, 503);
  }
  if (!isAdminAuthorized(c)) {
    return c.json({ error: '未授权，请使用有效 admin 凭据。' }, 401, {
      'WWW-Authenticate': 'Basic realm="Soothsay Admin"'
    });
  }
  await next();
};
