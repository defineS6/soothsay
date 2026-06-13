export const supportedLocales = ['zh-CN', 'en-US'] as const;

export type Locale = (typeof supportedLocales)[number];
export const localeStorageKey = 'soothsay-locale';

const messages = {
  'zh-CN': {
    'language.label': '切换到英文',
    'nav.main': '主导航',
    'nav.chooseMaster': '选大师',
    'nav.profile': '个人档案',
    'nav.history': '解读记录',
    'nav.birthProfile': '生辰档案',
    'nav.credentials': '凭据设置',
    'nav.admin': '管理后台',
    'nav.home': '首页',
    'nav.chart': '命盘',
    'nav.reading': '解读',
    'nav.mine': '我的',
    'nav.mobile': '移动端主导航',
    'home.currentChart': '当前命盘',
    'home.viewFullChart': '查看完整命盘',
    'home.noBirthProfile': '还没有选择生辰档案。',
    'home.openBirthProfile': '打开生辰档案',
    'home.todayReading': '今日解读',
    'home.askMaster': '向{master}追问',
    'home.masterFallback': '大师',
    'home.history': '历史对话',
    'home.fullReading': '八字全解',
    'home.dailyFortune': '每日运势',
    'home.dailyLot': '今日抽签',
    'home.askPlaceholder': '向大师追问...',
    'home.sendFollowUp': '发送追问',
    'home.readingHint': '命盘生成后可请求解读；没有 key 也不影响排盘。',
    'home.recent': '最近摘要',
    'home.recentSummary': '最近解读摘要',
    'home.viewAll': '查看全部',
    'home.noReply': '还没有大师回复。完成一次解读后会显示摘要。',
    'mine.management': '管理入口',
    'mine.chooseMaster': '选择大师',
    'mine.notSelected': '未选择',
    'mine.configured': '已配置',
    'mine.notConfigured': '未配置',
    'mine.roles': '角色与体系',
    'common.items': '{count} 条',
    'common.loading': '加载中',
    'greeting.morning': '早安，愿你今天顺心如意。',
    'greeting.afternoon': '午安，愿你此刻心定事明。',
    'greeting.evening': '晚安，愿你今晚安然从容。',
    'daily.pending': '命盘生成后显示今日干支',
    'daily.today': '今日 {ganZhi} · {relation}'
  },
  'en-US': {
    'language.label': '切换到中文',
    'nav.main': 'Main navigation',
    'nav.chooseMaster': 'Choose guide',
    'nav.profile': 'Profile',
    'nav.history': 'Readings',
    'nav.birthProfile': 'Birth profiles',
    'nav.credentials': 'API credentials',
    'nav.admin': 'Admin',
    'nav.home': 'Home',
    'nav.chart': 'Chart',
    'nav.reading': 'Reading',
    'nav.mine': 'Me',
    'nav.mobile': 'Mobile navigation',
    'home.currentChart': 'Current chart',
    'home.viewFullChart': 'View full chart',
    'home.noBirthProfile': 'No birth profile selected yet.',
    'home.openBirthProfile': 'Open birth profiles',
    'home.todayReading': "Today's reading",
    'home.askMaster': 'Ask {master}',
    'home.masterFallback': 'your guide',
    'home.history': 'Conversation history',
    'home.fullReading': 'Full Bazi reading',
    'home.dailyFortune': 'Daily fortune',
    'home.dailyLot': 'Draw a daily lot',
    'home.askPlaceholder': 'Ask your guide...',
    'home.sendFollowUp': 'Send follow-up',
    'home.readingHint': 'Create a chart to request a reading. No API key is needed to view the chart.',
    'home.recent': 'Recent summary',
    'home.recentSummary': 'Latest reading summary',
    'home.viewAll': 'View all',
    'home.noReply': 'No reply yet. A summary will appear after your first reading.',
    'mine.management': 'Management',
    'mine.chooseMaster': 'Choose guide',
    'mine.notSelected': 'Not selected',
    'mine.configured': 'Configured',
    'mine.notConfigured': 'Not configured',
    'mine.roles': 'Guides and systems',
    'common.items': '{count}',
    'common.loading': 'Loading',
    'greeting.morning': 'Good morning. May your day unfold smoothly.',
    'greeting.afternoon': 'Good afternoon. May clarity guide you.',
    'greeting.evening': 'Good evening. May your night be calm.',
    'daily.pending': "Create a chart to see today's cycle",
    'daily.today': 'Today: {ganZhi} · {relation}'
  }
} as const;

export type TranslationKey = keyof (typeof messages)['zh-CN'];
type TranslationParams = Record<string, string | number>;

export function normalizeLocale(locale?: string | null): Locale {
  return locale?.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

export function translate(locale: Locale, key: TranslationKey, params: TranslationParams = {}): string {
  const template = messages[locale][key] ?? messages['zh-CN'][key];
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template as string
  );
}
