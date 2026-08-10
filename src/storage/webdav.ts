import type { WebdavConfig } from './types';

const KEY = 'soothsay-webdav';

/** 未填写路径时使用的默认备份文件位置 */
export const DEFAULT_WEBDAV_PATH = 'soothsay/soothsay-backup.json';

function createEmptyConfig(): WebdavConfig {
  return { url: '', username: '', password: '', path: DEFAULT_WEBDAV_PATH };
}

/** 读取本机保存的 WebDAV 配置；没有或已损坏时返回空配置，调用方无需再判空 */
export function getWebdavConfig(): WebdavConfig {
  const raw = localStorage.getItem(KEY);
  if (!raw) return createEmptyConfig();
  try {
    const parsed = JSON.parse(raw) as Partial<WebdavConfig>;
    return {
      url: parsed.url ?? '',
      username: parsed.username ?? '',
      password: parsed.password ?? '',
      path: parsed.path || DEFAULT_WEBDAV_PATH,
      lastSyncAt: parsed.lastSyncAt,
      lastSyncAction: parsed.lastSyncAction
    };
  } catch {
    return createEmptyConfig();
  }
}

export function saveWebdavConfig(config: WebdavConfig) {
  const stored = getWebdavConfig();
  localStorage.setItem(
    KEY,
    JSON.stringify({
      url: config.url.trim().replace(/\/+$/, ''),
      username: config.username.trim(),
      password: config.password,
      path: config.path.trim().replace(/^\/+/, '') || DEFAULT_WEBDAV_PATH,
      // 同步时间由 markWebdavSynced 维护，保存表单时沿用已有记录
      lastSyncAt: config.lastSyncAt ?? stored.lastSyncAt,
      lastSyncAction: config.lastSyncAction ?? stored.lastSyncAction
    })
  );
}

export function clearWebdavConfig() {
  localStorage.removeItem(KEY);
}

/** 同步成功后记录时间与方向，供设置页展示「上次同步」 */
export function markWebdavSynced(action: 'upload' | 'download'): WebdavConfig {
  const config = getWebdavConfig();
  const next: WebdavConfig = { ...config, lastSyncAt: new Date().toISOString(), lastSyncAction: action };
  saveWebdavConfig(next);
  return next;
}

/** 表单校验：返回 null 表示可用，否则返回提示文案 */
export function validateWebdavConfig(config: WebdavConfig): string | null {
  if (!config.url.trim()) return '请先填写 WebDAV 服务器地址';
  if (!/^https?:\/\//i.test(config.url.trim())) return 'WebDAV 地址必须以 http:// 或 https:// 开头';
  if (!config.path.trim()) return '请填写备份文件路径';
  if (!/\.json$/i.test(config.path.trim())) return '备份文件路径需以 .json 结尾';
  if (config.path.includes('..')) return '备份文件路径不能包含 .. 片段';
  return null;
}
