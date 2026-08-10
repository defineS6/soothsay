import {
  getAllRoleHistories,
  getBirthProfiles,
  getSharedProfile,
  replaceAllLocalData
} from '@/storage/indexed-db';
import { applyPreferences, readPreferences } from '@/storage/preferences';
import { markWebdavSynced } from '@/storage/webdav';
import type { BirthProfile, ChatMessage, RoleHistory, SharedProfile, SyncPreferences, SyncSnapshot, WebdavConfig } from '@/storage/types';

/** 快照格式版本，将来结构变动时用于兼容判断 */
const SNAPSHOT_VERSION = 1;
const MAX_WEBDAV_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_WEBDAV_PROXY_BODY_BYTES = 4 * 1024 * 1024;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

type WebdavAction = 'test' | 'download' | 'upload';

interface WebdavResponse {
  ok?: boolean;
  error?: string;
  missing?: boolean;
  missingDirectory?: boolean;
  content?: string;
  bytes?: number;
}

/** 统一走服务端代理转发，浏览器不直接连 WebDAV（跨域与预检限制） */
async function callWebdav(action: WebdavAction, config: WebdavConfig, content?: string): Promise<WebdavResponse> {
  const body = JSON.stringify({
    url: config.url.trim(),
    username: config.username.trim(),
    password: config.password,
    path: config.path.trim().replace(/^\/+/, ''),
    content
  });
  if (utf8ByteLength(body) > MAX_WEBDAV_PROXY_BODY_BYTES) {
    throw new Error('WebDAV 请求超过 4MB 代理上限，请减少本机备份数据后重试');
  }

  const response = await fetch(`/api/webdav/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Soothsay-WebDAV': '1'
    },
    body
  });
  const payload = (await response.json().catch(() => ({}))) as WebdavResponse;
  if (!response.ok) {
    const fallback = response.status === 413 ? 'WebDAV 备份超过当前代理大小限制（最大约 2MB）' : 'WebDAV 请求失败';
    throw new Error(payload.error ?? fallback);
  }
  return payload;
}

/** 打包当前浏览器里的全部可同步数据 */
export async function buildSnapshot(): Promise<SyncSnapshot> {
  const [sharedProfile, birthProfiles, roleHistories] = await Promise.all([
    getSharedProfile(),
    getBirthProfiles(),
    getAllRoleHistories()
  ]);
  return {
    app: 'soothsay',
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    sharedProfile,
    birthProfiles,
    roleHistories,
    preferences: readPreferences()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && (value.role === 'user' || value.role === 'assistant')
    && typeof value.content === 'string'
    && isNonEmptyString(value.createdAt);
}

function isSharedProfile(value: unknown): value is SharedProfile | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  if (value.id !== 'default' || !Array.isArray(value.facts) || !value.facts.every((item) => typeof item === 'string')) return false;
  if (!isNonEmptyString(value.updatedAt)) return false;
  if (value.activeBirthProfileId !== undefined && typeof value.activeBirthProfileId !== 'string') return false;
  if (value.chart !== undefined && !isRecord(value.chart)) return false;
  return true;
}

function isBirthProfile(value: unknown): value is BirthProfile {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && typeof value.name === 'string'
    && isRecord(value.input)
    && isRecord(value.chart)
    && isNonEmptyString(value.createdAt)
    && isNonEmptyString(value.updatedAt);
}

function isRoleHistory(value: unknown): value is RoleHistory {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.personaId) || !Array.isArray(value.messages) || !value.messages.every(isChatMessage)) return false;
  if (!isNonEmptyString(value.updatedAt)) return false;
  if (value.summary !== undefined && typeof value.summary !== 'string') return false;
  return true;
}

function isSyncPreferences(value: unknown): value is SyncPreferences {
  if (!isRecord(value)) return false;
  if (value.theme !== undefined && typeof value.theme !== 'string') return false;
  if (value.locale !== undefined && typeof value.locale !== 'string') return false;
  return true;
}

function hasDuplicateIds(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

/** 解析并严格校验云端 JSON；任何缺字段或类型异常都在覆盖 IndexedDB 之前拒绝 */
export function parseSnapshot(raw: string): SyncSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('云端备份不是合法的 JSON，可能被其他程序覆盖过');
  }
  if (!isRecord(parsed)) throw new Error('云端备份结构不正确，已取消还原');
  if (parsed.app !== 'soothsay') throw new Error('云端文件不是 Soothsay 备份');

  const requiredKeys = ['version', 'exportedAt', 'sharedProfile', 'birthProfiles', 'roleHistories', 'preferences'];
  if (requiredKeys.some((key) => !hasOwn(parsed, key))) {
    throw new Error('云端备份缺少必要字段，已取消还原');
  }

  if (!Number.isInteger(parsed.version) || Number(parsed.version) < 1) {
    throw new Error('云端备份版本号不正确，已取消还原');
  }
  if (Number(parsed.version) > SNAPSHOT_VERSION) {
    throw new Error('云端备份来自更高版本，请先升级本端再同步');
  }
  if (!isNonEmptyString(parsed.exportedAt) || Number.isNaN(Date.parse(parsed.exportedAt))) {
    throw new Error('云端备份导出时间不正确，已取消还原');
  }
  if (!isSharedProfile(parsed.sharedProfile)) {
    throw new Error('云端备份的共享档案结构不正确，已取消还原');
  }
  if (!Array.isArray(parsed.birthProfiles) || !parsed.birthProfiles.every(isBirthProfile)) {
    throw new Error('云端备份的生辰档案结构不正确，已取消还原');
  }
  if (!Array.isArray(parsed.roleHistories) || !parsed.roleHistories.every(isRoleHistory)) {
    throw new Error('云端备份的对话记录结构不正确，已取消还原');
  }
  if (!isSyncPreferences(parsed.preferences)) {
    throw new Error('云端备份的界面偏好结构不正确，已取消还原');
  }

  const birthProfiles = parsed.birthProfiles as BirthProfile[];
  const roleHistories = parsed.roleHistories as RoleHistory[];
  if (hasDuplicateIds(birthProfiles.map((item) => item.id))) {
    throw new Error('云端备份包含重复的生辰档案 ID，已取消还原');
  }
  if (hasDuplicateIds(roleHistories.map((item) => item.personaId))) {
    throw new Error('云端备份包含重复的角色对话 ID，已取消还原');
  }
  for (const history of roleHistories) {
    if (hasDuplicateIds(history.messages.map((message) => message.id))) {
      throw new Error(`云端备份中角色 ${history.personaId} 包含重复的消息 ID，已取消还原`);
    }
  }

  return {
    app: 'soothsay',
    version: Number(parsed.version),
    exportedAt: parsed.exportedAt,
    sharedProfile: parsed.sharedProfile as SharedProfile | null,
    birthProfiles,
    roleHistories,
    preferences: parsed.preferences as SyncPreferences
  };
}

/** 连通性测试：地址、账号密码与目标目录是否可用 */
export async function testWebdavConnection(config: WebdavConfig): Promise<{ missingDirectory: boolean }> {
  const result = await callWebdav('test', config);
  return { missingDirectory: Boolean(result.missingDirectory) };
}

/** 上传：用本机数据整体覆盖云端备份文件 */
export async function uploadSnapshot(config: WebdavConfig): Promise<{ bytes: number; profiles: number; histories: number }> {
  const snapshot = await buildSnapshot();
  const content = JSON.stringify(snapshot);
  if (utf8ByteLength(content) > MAX_WEBDAV_SNAPSHOT_BYTES) {
    throw new Error('本机 WebDAV 备份超过 2MB 上限，请先减少历史对话或档案数据');
  }
  const result = await callWebdav('upload', config, content);
  markWebdavSynced('upload');
  return {
    bytes: result.bytes ?? 0,
    profiles: snapshot.birthProfiles.length,
    histories: snapshot.roleHistories.length
  };
}

/**
 * 下载：用云端备份整体覆盖本机数据。
 * 模型凭据不在快照内，因此本机的 base_url/key 不会被这一步清掉。
 */
export async function downloadSnapshot(config: WebdavConfig): Promise<{
  snapshot: SyncSnapshot;
  profiles: number;
  histories: number;
}> {
  const result = await callWebdav('download', config);
  if (result.missing || !result.content) throw new Error('云端还没有备份文件，请先执行一次上传');

  const snapshot = parseSnapshot(result.content);
  await replaceAllLocalData({
    sharedProfile: snapshot.sharedProfile,
    birthProfiles: snapshot.birthProfiles,
    roleHistories: snapshot.roleHistories
  });
  applyPreferences(snapshot.preferences);
  markWebdavSynced('download');
  return {
    snapshot,
    profiles: snapshot.birthProfiles.length,
    histories: snapshot.roleHistories.length
  };
}
