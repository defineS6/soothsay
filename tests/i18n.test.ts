import { describe, expect, it } from 'vitest';
import { normalizeLocale, translate } from '@/i18n';

describe('轻量国际化', () => {
  it('按浏览器语言归一化为支持的语言', () => {
    expect(normalizeLocale('en-GB')).toBe('en-US');
    expect(normalizeLocale('zh-TW')).toBe('zh-CN');
    expect(normalizeLocale(undefined)).toBe('zh-CN');
  });

  it('翻译界面文本并替换参数', () => {
    expect(translate('en-US', 'nav.chart')).toBe('Chart');
    expect(translate('zh-CN', 'common.items', { count: 3 })).toBe('3 条');
    expect(translate('en-US', 'home.askMaster', { master: 'Aster' })).toBe('Ask Aster');
  });
});
