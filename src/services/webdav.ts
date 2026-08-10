import {
  getAllRoleHistories,
  getBirthProfiles,
  getSharedProfile,
  replaceAllLocalData
} from '@/storage/indexed-db';
import { applyPreferences, readPreferences } from '@/storage/preferences';
import { markWebdavSynced } from '@/storage/webdav';
import type { BirthProfile, RoleHistory, SharedProfile, SyncSnapshot, WebdavConfig } from '@/storage/types';

/** 快照格式版本，将来结构变动时用于兼容判断 */
const SNAPSHOT_VERSION = 1;

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
  const response = await fetch(`/api/webdav/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: config.url.trim(),
      username: config.username.trim(),
      password: config.password,
      path: config.path.trim().replace(/^\/+/, ''),
      content
    })
  });
  const payload = (await response.json().catch(() => ({}))) as WebdavResponse;
  if (!response.ok) throw new Error(payload.error ?? 'WebDAV 请求失败');
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

/** 解析云端 JSON，结构不符时直接抛错，避免把脏数据写进 IndexedDB */
function parseSnapshot(raw: string): SyncSnapshot {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('云端备份不是合法的 JSON，可能被其他程序覆盖过');
  }
  if (parsed?.app !== 'soothsay') throw new Error('云端文件不是 Soothsay 备份');
  if (Number(parsed.version) > SNAPSHOT_VERSION) throw new Error('云端备份来自更高版本，请先升级本端再同步');
  return {
    app: 'soothsay',
    version: Number(parsed.version) || SNAPSHOT_VERSION,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    sharedProfile: (parsed.sharedProfile ?? null) as SharedProfile | null,
    birthProfiles: Array.isArray(parsed.birthProfiles) ? (parsed.birthProfiles as BirthProfile[]) : [],
    roleHistories: Array.isArray(parsed.roleHistories) ? (parsed.roleHistories as RoleHistory[]) : [],
    preferences: parsed.preferences ?? {}
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
  const result = await callWebdav('upload', config, JSON.stringify(snapshot));
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
