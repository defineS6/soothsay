import type { BaziChart } from '@/bazi/types';
import type { BirthDateTimeInput } from '@/bazi/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface SharedProfile {
  id: 'default';
  chart?: BaziChart;
  activeBirthProfileId?: string;
  facts: string[];
  updatedAt: string;
}

export interface BirthProfile {
  id: string;
  name: string;
  input: BirthDateTimeInput;
  chart: BaziChart;
  createdAt: string;
  updatedAt: string;
}

export interface RoleHistory {
  personaId: string;
  messages: ChatMessage[];
  summary?: string;
  updatedAt: string;
}

export interface LocalCredentials {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** WebDAV 同步配置，保存在本机 localStorage，不会随备份上传 */
export interface WebdavConfig {
  url: string;
  username: string;
  password: string;
  path: string;
  lastSyncAt?: string;
  lastSyncAction?: 'upload' | 'download';
}

/** 界面偏好，属于 localStorage 里的轻量设置，随备份一起同步 */
export interface SyncPreferences {
  theme?: string;
  locale?: string;
  /** 是否跳过开屏动画（乾坤启阵） */
  skipOpening?: boolean;
}

/**
 * 上传到 WebDAV 的备份快照。
 * 只包含命盘、档案、对话与界面偏好；模型凭据（含 key）不参与同步，避免明文落到网盘。
 */
export interface SyncSnapshot {
  app: 'soothsay';
  version: number;
  exportedAt: string;
  sharedProfile: SharedProfile | null;
  birthProfiles: BirthProfile[];
  roleHistories: RoleHistory[];
  preferences: SyncPreferences;
}
