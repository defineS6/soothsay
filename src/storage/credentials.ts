import type { LocalCredentials } from './types';

const KEY = 'soothsay-byok';

export function getCredentials(): LocalCredentials | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalCredentials>;
    if (!parsed.baseUrl || !parsed.apiKey || !parsed.model) return null;
    return {
      baseUrl: parsed.baseUrl,
      apiKey: parsed.apiKey,
      model: parsed.model
    };
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: LocalCredentials) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      baseUrl: credentials.baseUrl.trim(),
      apiKey: credentials.apiKey.trim(),
      model: credentials.model.trim() || 'gpt-4o-mini'
    })
  );
}

export function clearCredentials() {
  localStorage.removeItem(KEY);
}

export function validateCredentials(credentials: LocalCredentials): string | null {
  if (!credentials.baseUrl.trim()) return '请先填写 base_url';
  if (!/^https?:\/\//i.test(credentials.baseUrl.trim())) return 'base_url 必须以 http:// 或 https:// 开头';
  if (!credentials.apiKey.trim()) return '请先填写 key';
  if (!credentials.model.trim()) return '请填写模型名称';
  return null;
}
