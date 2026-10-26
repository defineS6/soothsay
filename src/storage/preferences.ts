import { localeStorageKey, normalizeLocale } from '@/i18n';
import type { SyncPreferences } from './types';

/** 主题存储键：与 App.vue 共用同一常量，避免字符串散落两处 */
export const themeStorageKey = 'soothsay-theme';

/** 开屏动画开关的存储键：后台管理页写入，页面启动时读取 */
export const skipOpeningStorageKey = 'soothsay-skip-opening';

/** 读取「跳过开屏动画」偏好，默认不跳过 */
export function readSkipOpening(): boolean {
  return localStorage.getItem(skipOpeningStorageKey) === '1';
}

/** 写入「跳过开屏动画」偏好 */
export function writeSkipOpening(skip: boolean) {
  localStorage.setItem(skipOpeningStorageKey, skip ? '1' : '0');
}

/** 读取界面偏好，用于打包 WebDAV 备份 */
export function readPreferences(): SyncPreferences {
  return {
    theme: localStorage.getItem(themeStorageKey) ?? undefined,
    locale: localStorage.getItem(localeStorageKey) ?? undefined,
    skipOpening: readSkipOpening()
  };
}

/**
 * 把云端偏好写回 localStorage。
 * 只负责持久化，界面上的实际应用（切主题、切语言、跳动画）由 App.vue 在还原后统一刷新。
 * 主题值不在这里做白名单校验，交给 App.vue 的 isKnownTheme 兜底，避免主题列表重复维护。
 */
export function applyPreferences(preferences: SyncPreferences | undefined) {
  if (!preferences) return;
  if (preferences.theme) localStorage.setItem(themeStorageKey, preferences.theme);
  if (preferences.locale) localStorage.setItem(localeStorageKey, normalizeLocale(preferences.locale));
  if (typeof preferences.skipOpening === 'boolean') writeSkipOpening(preferences.skipOpening);
}
