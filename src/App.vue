<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, reactive, ref } from 'vue';
import type { PropType } from 'vue';
import {
  CalendarDays,
  Check,
  Copy,
  KeyRound,
  Lock,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Wand2
} from 'lucide-vue-next';
import { createBaziChart } from '@/bazi/engine';
import type { BaziChart, BirthDateTimeInput, PillarName } from '@/bazi/types';
import { buildFortuneMessages, buildPersonaGenerationMessages, type FortuneTask, type PersonaGenerationDraft } from '@/persona/prompt';
import { fetchPersonas } from '@/services/personas';
import { streamFortuneReading, testCredentials } from '@/services/proxy';
import {
  createAdminPersona,
  deleteAdminPersona,
  fetchAdminPersonas,
  type AdminSession,
  type PersonaPayload,
  updateAdminPersona,
  uploadRoleImage,
  verifyAdmin
} from '@/services/admin';
import { clearCredentials, getCredentials, saveCredentials, validateCredentials } from '@/storage/credentials';
import {
  appendRoleMessage,
  clearRoleHistory,
  createMemoryWindow,
  deleteBirthProfile,
  deleteRoleMessage,
  getBirthProfiles,
  getRoleHistory,
  getSharedProfile,
  removeSharedFact,
  saveBirthProfile,
  saveSharedChart,
  saveSharedFact
} from '@/storage/indexed-db';
import type { BirthProfile, ChatMessage, LocalCredentials, RoleHistory, SharedProfile } from '@/storage/types';
import {
  type EngineId,
  type FortuneCategory,
  type PersonaEngine,
  type PersonaSkin,
  isBuiltinEngineId
} from '@server-shared/persona';

type Panel = 'reading' | 'settings' | 'admin';
type CropField = 'avatarFile' | 'backgroundFile';
type MarkdownInline = {
  type: 'text' | 'strong' | 'em' | 'code';
  text: string;
};
type MarkdownBlock =
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: MarkdownInline[] }
  | { type: 'blockquote'; children: MarkdownInline[] }
  | { type: 'list'; ordered: boolean; items: MarkdownInline[][] }
  | { type: 'code'; code: string; language: string }
  | { type: 'hr' };

const personas = ref<PersonaSkin[]>([]);
const engines = ref<PersonaEngine[]>([]);
const selectedPersonaId = ref('');
const chart = ref<BaziChart | null>(null);
const sharedProfile = ref<SharedProfile | null>(null);
const roleHistory = ref<RoleHistory | null>(null);
const activePanel = ref<Panel>('reading');
const loading = ref(false);
const appMessage = ref('');
const readingText = ref('');
const streaming = ref(false);
const drawingLot = ref(false);
const followQuestion = ref('');
const factDraft = ref('');
const showOpeningAnimation = ref(true);
const openingAnimationClosing = ref(false);
const masterModalOpen = ref(false);
const profileModalOpen = ref(false);
const historyModalOpen = ref(false);
const birthModalOpen = ref(false);
const birthProfiles = ref<BirthProfile[]>([]);
const editingBirthProfileId = ref('');
const birthProfileName = ref('');

function createDefaultBirthInput(): BirthDateTimeInput {
  return {
    calendarType: 'solar',
    year: 1995,
    month: 12,
    day: 18,
    hour: 10,
    minute: 28,
    gender: 'female',
    isLeapMonth: false,
    location: undefined,
    ziHourPolicy: 'lateZiNextDay',
    directPillars: {
      year: '',
      month: '',
      day: '',
      hour: ''
    }
  };
}

const birthForm = reactive<BirthDateTimeInput>(createDefaultBirthInput());

const longitudeDraft = ref<string | number>('');
const directPillarsText = ref('');

const credentialsDraft = reactive<LocalCredentials>({
  baseUrl: '',
  apiKey: '',
  model: 'gpt-4o-mini'
});
const credentialsStatus = ref('');
const testingCredentials = ref(false);

const adminSession = reactive<AdminSession>({
  username: '',
  password: ''
});
const adminAuthed = ref(false);
const adminMessage = ref('');
const adminPersonas = ref<PersonaSkin[]>([]);
const adminGeneratedHighlight = ref(false);
const avatarPreviewUrl = ref('');
const backgroundPreviewUrl = ref('');
const cropImageRef = ref<HTMLImageElement | null>(null);
const cropFrameRef = ref<HTMLDivElement | null>(null);
const adminGenerator = reactive({
  direction: '',
  generating: false
});
const adminForm = reactive({
  id: '',
  name: '',
  engineId: 'daoist' as EngineId,
  opening: '',
  customPrompt: '',
  avatarUrl: '/defaults/custom-avatar.svg',
  backgroundUrl: '/defaults/custom-bg.svg',
  tone: {
    directness: 50,
    detail: 60
  },
  categories: ['bazi', 'daily'] as FortuneCategory[],
  avatarFile: null as File | null,
  backgroundFile: null as File | null
});
const adminEngineForm = reactive({
  id: '',
  name: '',
  worldview: '',
  promptRulesText: ''
});
const cropSession = reactive({
  open: false,
  field: 'avatarFile' as CropField,
  sourceUrl: '',
  fileName: '',
  aspectRatio: 1,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  baseWidth: 0,
  baseHeight: 0,
  naturalWidth: 0,
  naturalHeight: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragOffsetX: 0,
  dragOffsetY: 0
});

const selectedPersona = computed(() => personas.value.find((persona) => persona.id === selectedPersonaId.value) ?? personas.value[0]);
const directPillars = computed(() => birthForm.directPillars!);
const savedFacts = computed(() => sharedProfile.value?.facts ?? []);
const historyMessages = computed(() => roleHistory.value?.messages ?? []);
const activeBirthProfile = computed(
  () => birthProfiles.value.find((profile) => profile.id === sharedProfile.value?.activeBirthProfileId) ?? null
);
const birthTriggerLabel = computed(() => activeBirthProfile.value?.name ?? (chart.value ? '当前命盘' : '生辰档案'));
const adminEditingPersona = computed(() => adminPersonas.value.find((persona) => persona.id === adminForm.id) ?? null);
const adminEditingBuiltin = computed(() => Boolean(adminEditingPersona.value?.builtin));
const avatarPreview = computed(() => avatarPreviewUrl.value || adminForm.avatarUrl);
const backgroundPreview = computed(() => backgroundPreviewUrl.value || adminForm.backgroundUrl);
const cropTitle = computed(() => (cropSession.field === 'avatarFile' ? '裁剪头像' : '裁剪背景'));
const cropHint = computed(() => (cropSession.field === 'avatarFile' ? '头像会按正方形保存。' : '背景会按 16:9 横幅保存。'));
const cropFrameStyle = computed(() => ({ aspectRatio: String(cropSession.aspectRatio) }));
const cropImageStyle = computed(() => ({
  width: `${cropSession.baseWidth}px`,
  height: `${cropSession.baseHeight}px`,
  transform: `translate(-50%, -50%) translate(${cropSession.offsetX}px, ${cropSession.offsetY}px) scale(${cropSession.zoom})`
}));
const cropMaxOffsetX = computed(() => {
  const frame = cropFrameRef.value;
  if (!frame) return 0;
  return Math.max(0, Math.round((cropSession.baseWidth * cropSession.zoom - frame.clientWidth) / 2));
});
const cropMaxOffsetY = computed(() => {
  const frame = cropFrameRef.value;
  if (!frame) return 0;
  return Math.max(0, Math.round((cropSession.baseHeight * cropSession.zoom - frame.clientHeight) / 2));
});
const activeReadingBlocks = computed(() => parseMarkdown(readingText.value));
const selectedPersonaEngine = computed(() => (selectedPersona.value ? engineById(selectedPersona.value.engineId) : undefined));
const pillarRows = computed(() => {
  if (!chart.value) return [];
  const names: PillarName[] = ['year', 'month', 'day', 'hour'];
  return names.map((name) => chart.value!.pillars[name]);
});
const hasCredentials = computed(() => Boolean(credentialsDraft.baseUrl && credentialsDraft.apiKey && credentialsDraft.model));
const adminEditing = computed(() => Boolean(adminForm.id));
const adminEngineDraftActive = computed(
  () => Boolean(adminEngineForm.id) && adminForm.engineId === adminEngineForm.id && !isBuiltinEngineId(adminForm.engineId)
);

function engineById(id: string) {
  return engines.value.find((engine) => engine.id === id);
}

function engineNameById(id: string) {
  return engineById(id)?.name ?? '未知体系';
}

function createClientEngineId() {
  return `engine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function upsertLocalEngine(engine: PersonaEngine) {
  const index = engines.value.findIndex((item) => item.id === engine.id);
  if (index >= 0) {
    engines.value[index] = engine;
  } else {
    engines.value.push(engine);
  }
}

function clearAdminEngineDraft() {
  Object.assign(adminEngineForm, {
    id: '',
    name: '',
    worldview: '',
    promptRulesText: ''
  });
}

function setAdminEngineDraft(engine?: PersonaEngine) {
  if (!engine || isBuiltinEngineId(engine.id)) {
    clearAdminEngineDraft();
    return;
  }
  Object.assign(adminEngineForm, {
    id: engine.id,
    name: engine.name,
    worldview: engine.worldview,
    promptRulesText: engine.promptRules.join('\n')
  });
}

function onAdminEngineChange() {
  setAdminEngineDraft(engineById(adminForm.engineId));
}

function buildAdminEnginePayload(): PersonaEngine | undefined {
  if (!adminEngineDraftActive.value) return undefined;
  const promptRules = adminEngineForm.promptRulesText
    .split('\n')
    .map((rule) => rule.trim())
    .filter(Boolean);
  return {
    id: adminEngineForm.id,
    name: adminEngineForm.name.trim(),
    worldview: adminEngineForm.worldview.trim(),
    promptRules,
    builtin: false
  };
}

function readGeneratedText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim();
}

function clampGeneratedNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function normalizeGeneratedCategories(value: unknown): FortuneCategory[] {
  if (!Array.isArray(value)) return ['bazi', 'daily'];
  const categories = value.filter((item): item is FortuneCategory => item === 'bazi' || item === 'daily');
  return categories.length ? [...new Set(categories)] : ['bazi', 'daily'];
}

function extractJsonObject(text: string) {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('AI 没有返回可解析的 JSON');
  return text.slice(first, last + 1);
}

function normalizeGeneratedDraft(raw: any): PersonaGenerationDraft {
  const engine = raw?.engine ?? {};
  const persona = raw?.persona ?? {};
  const promptRules = Array.isArray(engine.promptRules)
    ? engine.promptRules.map((rule: unknown) => readGeneratedText(rule)).filter(Boolean).slice(0, 8)
    : [];
  const draft: PersonaGenerationDraft = {
    engine: {
      name: readGeneratedText(engine.name).slice(0, 30),
      worldview: readGeneratedText(engine.worldview).slice(0, 500),
      promptRules
    },
    persona: {
      name: readGeneratedText(persona.name).slice(0, 40),
      opening: readGeneratedText(persona.opening).slice(0, 300),
      customPrompt: readGeneratedText(persona.customPrompt).slice(0, 1200),
      tone: {
        directness: clampGeneratedNumber(persona.tone?.directness, 50),
        detail: clampGeneratedNumber(persona.tone?.detail, 70)
      },
      categories: normalizeGeneratedCategories(persona.categories)
    }
  };

  if (!draft.engine.name || !draft.engine.worldview || draft.engine.promptRules.length === 0) {
    throw new Error('AI 返回的体系信息不完整');
  }
  if (!draft.persona.name || !draft.persona.opening || !draft.persona.customPrompt) {
    throw new Error('AI 返回的大师信息不完整');
  }
  return draft;
}

function parseGeneratedDraft(text: string) {
  return normalizeGeneratedDraft(JSON.parse(extractJsonObject(text)));
}

function triggerAdminGeneratedHighlight() {
  adminGeneratedHighlight.value = true;
  window.setTimeout(() => {
    adminGeneratedHighlight.value = false;
  }, 1500);
}

function setMessage(message: string) {
  appMessage.value = message;
  window.setTimeout(() => {
    if (appMessage.value === message) appMessage.value = '';
  }, 4000);
}

function formatMessageTime(message: ChatMessage) {
  const date = new Date(message.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

async function openHistoryModal() {
  if (selectedPersonaId.value) {
    roleHistory.value = await getRoleHistory(selectedPersonaId.value);
  }
  historyModalOpen.value = true;
}

async function copyHistoryMessage(message: ChatMessage) {
  try {
    await navigator.clipboard.writeText(message.content);
    setMessage('消息已复制');
  } catch {
    setMessage('复制失败，请手动选择文本');
  }
}

async function removeHistoryMessage(message: ChatMessage) {
  if (!selectedPersonaId.value) return;
  if (!window.confirm('删除这条解读记录？')) return;
  roleHistory.value = await deleteRoleMessage(selectedPersonaId.value, message.id);
  setMessage('消息已删除');
}

async function clearCurrentHistory() {
  if (!selectedPersonaId.value || !selectedPersona.value) return;
  if (!window.confirm(`清空「${selectedPersona.value.name}」的全部解读记录？`)) return;
  await clearRoleHistory(selectedPersonaId.value);
  roleHistory.value = await getRoleHistory(selectedPersonaId.value);
  readingText.value = '';
  historyModalOpen.value = false;
  setMessage('解读记录已清空');
}

function parseMarkdownInline(text: string): MarkdownInline[] {
  const tokens: MarkdownInline[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] === '`') {
      const end = text.indexOf('`', index + 1);
      if (end > index + 1) {
        tokens.push({ type: 'code', text: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (text.startsWith('**', index)) {
      const end = text.indexOf('**', index + 2);
      if (end > index + 2) {
        tokens.push({ type: 'strong', text: text.slice(index + 2, end) });
        index = end + 2;
        continue;
      }
    }

    if (text[index] === '*') {
      const end = text.indexOf('*', index + 1);
      if (end > index + 1) {
        tokens.push({ type: 'em', text: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    const nextSpecials = ['`', '**', '*']
      .map((marker) => text.indexOf(marker, index + 1))
      .filter((position) => position > -1);
    const next = nextSpecials.length ? Math.min(...nextSpecials) : text.length;
    tokens.push({ type: 'text', text: text.slice(index, next) });
    index = next;
  }

  return tokens;
}

function isMarkdownBlockStart(line: string) {
  return (
    /^```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*(---|\*\*\*|___)\s*$/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*([-*])\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line)
  );
}

function parseMarkdown(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];

  const flushParagraph = () => {
    const content = paragraphLines.join('\n').trim();
    if (content) blocks.push({ type: 'paragraph', children: parseMarkdownInline(content) });
    paragraphLines.length = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^```/.test(line)) {
      flushParagraph();
      const language = line.replace(/^```/, '').trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', code: codeLines.join('\n'), language });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseMarkdownInline(heading[2].trim())
      });
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'hr' });
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: 'blockquote', children: parseMarkdownInline(quoteLines.join('\n').trim()) });
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const orderedList = Boolean(ordered);
      const items: MarkdownInline[][] = [];
      while (index < lines.length) {
        const current = lines[index];
        const item = orderedList ? current.match(/^\s*\d+\.\s+(.+)$/) : current.match(/^\s*[-*]\s+(.+)$/);
        if (!item) break;
        items.push(parseMarkdownInline(item[1].trim()));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: 'list', ordered: orderedList, items });
      continue;
    }

    if (paragraphLines.length && isMarkdownBlockStart(line)) {
      flushParagraph();
    }
    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
}

const MarkdownRenderer = defineComponent({
  name: 'MarkdownRenderer',
  props: {
    blocks: {
      type: Array as PropType<MarkdownBlock[]>,
      required: true
    }
  },
  setup(props) {
    const renderInline = (children: MarkdownInline[]) =>
      children.map((child, index) => {
        const key = `${child.type}-${index}`;
        if (child.type === 'strong') return h('strong', { key }, child.text);
        if (child.type === 'em') return h('em', { key }, child.text);
        if (child.type === 'code') return h('code', { key, class: 'md-inline-code' }, child.text);
        return h('span', { key }, child.text);
      });

    return () =>
      h(
        'div',
        { class: 'markdown-body' },
        props.blocks.map((block, index) => {
          if (block.type === 'heading') return h(`h${block.level}`, { key: index }, renderInline(block.children));
          if (block.type === 'blockquote') return h('blockquote', { key: index }, renderInline(block.children));
          if (block.type === 'list') {
            const tag = block.ordered ? 'ol' : 'ul';
            return h(tag, { key: index }, block.items.map((item, itemIndex) => h('li', { key: itemIndex }, renderInline(item))));
          }
          if (block.type === 'code') {
            return h('pre', { key: index, class: 'md-code-block' }, [
              h('code', { class: block.language ? `language-${block.language}` : undefined }, block.code)
            ]);
          }
          if (block.type === 'hr') return h('hr', { key: index });
          return h('p', { key: index }, renderInline(block.children));
        })
      );
  }
});

async function loadPersonas() {
  const response = await fetchPersonas();
  personas.value = response.personas;
  engines.value = response.engines;
  if (!selectedPersonaId.value && response.personas[0]) {
    selectedPersonaId.value = response.personas[0].id;
  }
}

async function switchToNextPersona() {
  await loadPersonas();
  if (personas.value.length < 2) {
    setMessage('当前只有一位大师可选');
    return;
  }
  const currentIndex = personas.value.findIndex((persona) => persona.id === selectedPersonaId.value);
  const nextPersona = personas.value[(currentIndex + 1) % personas.value.length];
  await selectPersona(nextPersona);
  await nextTick();
  setMessage(`已切换到${nextPersona.name}`);
}

async function loadLocalState() {
  sharedProfile.value = await getSharedProfile();
  await loadBirthProfiles();
  chart.value = sharedProfile.value?.chart ?? null;
  const activeProfile = birthProfiles.value.find((profile) => profile.id === sharedProfile.value?.activeBirthProfileId);
  if (activeProfile) {
    chart.value = activeProfile.chart;
    syncBirthDraftFromProfile(activeProfile);
  } else if (!chart.value && birthProfiles.value[0]) {
    await activateBirthProfile(birthProfiles.value[0], { silent: true });
  }
  const stored = getCredentials();
  if (stored) Object.assign(credentialsDraft, stored);
  if (selectedPersonaId.value) {
    roleHistory.value = await getRoleHistory(selectedPersonaId.value);
  }
}

async function selectPersona(persona: PersonaSkin) {
  selectedPersonaId.value = persona.id;
  activePanel.value = 'reading';
  roleHistory.value = await getRoleHistory(persona.id);
  readingText.value = '';
}

async function choosePersona(persona: PersonaSkin) {
  await selectPersona(persona);
  masterModalOpen.value = false;
  setMessage(`已选择${persona.name}`);
}

async function loadBirthProfiles() {
  birthProfiles.value = await getBirthProfiles();
}

function cloneBirthInput(input: BirthDateTimeInput): BirthDateTimeInput {
  return JSON.parse(JSON.stringify(input));
}

function syncBirthDraftFromInput(input: BirthDateTimeInput, name = '', id = '') {
  Object.assign(birthForm, cloneBirthInput(input));
  birthProfileName.value = name;
  editingBirthProfileId.value = id;
  longitudeDraft.value = input.location?.longitude === undefined ? '' : String(input.location.longitude);
  directPillarsText.value = input.directPillars
    ? [input.directPillars.year, input.directPillars.month, input.directPillars.day, input.directPillars.hour].filter(Boolean).join(' ')
    : '';
}

function syncBirthDraftFromProfile(profile: BirthProfile) {
  syncBirthDraftFromInput(profile.input, profile.name, profile.id);
}

function resetBirthDraft() {
  syncBirthDraftFromInput(createDefaultBirthInput(), '', '');
}

function openBirthModal() {
  if (activeBirthProfile.value) {
    syncBirthDraftFromProfile(activeBirthProfile.value);
  } else if (!editingBirthProfileId.value) {
    resetBirthDraft();
  }
  birthModalOpen.value = true;
}

function createFallbackBirthName() {
  const index = editingBirthProfileId.value ? birthProfiles.value.findIndex((profile) => profile.id === editingBirthProfileId.value) + 1 : birthProfiles.value.length + 1;
  return `生辰档案 ${Math.max(index, 1)}`;
}

function padNumber(value: number) {
  return String(value).padStart(2, '0');
}

function formatBirthProfileMeta(profile: BirthProfile) {
  if (profile.input.calendarType === 'bazi') {
    const pillars = profile.input.directPillars;
    return `四柱 ${pillars?.year || '--'} ${pillars?.month || '--'} ${pillars?.day || '--'} ${pillars?.hour || '--'}`;
  }
  const calendar = profile.input.calendarType === 'solar' ? '公历' : '农历';
  return `${calendar} ${profile.input.year}-${padNumber(profile.input.month)}-${padNumber(profile.input.day)} ${padNumber(profile.input.hour)}:${padNumber(profile.input.minute)}`;
}

async function activateBirthProfile(profile: BirthProfile, options: { silent?: boolean; closeModal?: boolean } = {}) {
  chart.value = profile.chart;
  syncBirthDraftFromProfile(profile);
  sharedProfile.value = await saveSharedChart(profile.chart, profile.id);
  if (options.closeModal) birthModalOpen.value = false;
  if (!options.silent) setMessage(`已切换到 ${profile.name}`);
}

function updateLocation() {
  const rawLongitude = String(longitudeDraft.value ?? '').trim();
  if (!rawLongitude) {
    birthForm.location = undefined;
    return;
  }
  const longitude = Number(rawLongitude);
  birthForm.location = Number.isFinite(longitude)
    ? {
        name: '出生地',
        longitude
      }
    : undefined;
}

async function submitBirthForm() {
  try {
    if (birthForm.calendarType === 'bazi') {
      applyDirectPillarsText();
    }
    updateLocation();
    const birthInput = cloneBirthInput(birthForm);
    const nextChart = createBaziChart(birthInput);
    const profile = await saveBirthProfile({
      id: editingBirthProfileId.value || undefined,
      name: birthProfileName.value.trim() || createFallbackBirthName(),
      birthInput,
      chart: nextChart
    });
    await loadBirthProfiles();
    chart.value = nextChart;
    sharedProfile.value = await saveSharedChart(nextChart, profile.id);
    syncBirthDraftFromProfile(profile);
    birthModalOpen.value = false;
    setMessage(`${profile.name} 已保存并切换`);
  } catch (error: any) {
    setMessage(error?.message ?? '生辰保存失败');
  }
}

function applyDirectPillarsText() {
  const parts = directPillarsText.value
    .replace(/[，,、/|]+/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length === 4 && birthForm.directPillars) {
    const names: PillarName[] = ['year', 'month', 'day', 'hour'];
    names.forEach((name, index) => {
      birthForm.directPillars![name] = parts[index];
    });
  }
}

async function removeBirthProfile(profile: BirthProfile, event?: Event) {
  event?.stopPropagation();
  if (!window.confirm(`删除「${profile.name}」？`)) return;
  const wasActive = sharedProfile.value?.activeBirthProfileId === profile.id;
  const wasEditing = editingBirthProfileId.value === profile.id;
  await deleteBirthProfile(profile.id);
  await loadBirthProfiles();
  if (wasActive) {
    const nextProfile = birthProfiles.value[0];
    if (nextProfile) {
      await activateBirthProfile(nextProfile, { silent: true });
      setMessage(`已删除并切换到 ${nextProfile.name}`);
    } else {
      chart.value = null;
      resetBirthDraft();
      sharedProfile.value = await saveSharedChart(null, null);
      setMessage('生辰档案已清空');
    }
    return;
  }
  if (wasEditing) resetBirthDraft();
  setMessage('生辰档案已删除');
}

async function addFact() {
  if (!factDraft.value.trim()) return;
  sharedProfile.value = await saveSharedFact(factDraft.value);
  factDraft.value = '';
  setMessage('档案已更新');
}

function startOpeningAnimation() {
  window.setTimeout(() => {
    openingAnimationClosing.value = true;
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 2200 : 3800);
  window.setTimeout(() => {
    showOpeningAnimation.value = false;
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 2600 : 4400);
}

function skipOpeningAnimation() {
  openingAnimationClosing.value = true;
  window.setTimeout(() => {
    showOpeningAnimation.value = false;
  }, 220);
}

async function removeFact(fact: string) {
  sharedProfile.value = await removeSharedFact(fact);
  setMessage('上下文已移除');
}

function openSettings() {
  activePanel.value = 'settings';
}

async function persistCredentials() {
  const error = validateCredentials(credentialsDraft);
  if (error) {
    credentialsStatus.value = error;
    return;
  }
  saveCredentials(credentialsDraft);
  credentialsStatus.value = '凭据已保存到本机浏览器';
}

async function runCredentialTest() {
  const error = validateCredentials(credentialsDraft);
  if (error) {
    credentialsStatus.value = error;
    return;
  }
  testingCredentials.value = true;
  credentialsStatus.value = '';
  try {
    await testCredentials(credentialsDraft);
    credentialsStatus.value = '连通性测试通过';
  } catch (error: any) {
    credentialsStatus.value = error?.message ?? '连通性测试失败';
  } finally {
    testingCredentials.value = false;
  }
}

function removeCredentials() {
  clearCredentials();
  credentialsDraft.baseUrl = '';
  credentialsDraft.apiKey = '';
  credentialsDraft.model = 'gpt-4o-mini';
  credentialsStatus.value = '凭据已从本机浏览器移除';
}

async function requestReading(task: FortuneTask, question?: string) {
  if (!chart.value || !selectedPersona.value) {
    setMessage('请先选择大师并生成命盘');
    return;
  }
  const credentialError = validateCredentials(credentialsDraft);
  if (credentialError) {
    activePanel.value = 'settings';
    credentialsStatus.value = '请求解读前需要配置凭据；命盘仍可继续查看';
    return;
  }

  streaming.value = true;
  readingText.value = '';
  const currentHistory = roleHistory.value ?? (await getRoleHistory(selectedPersona.value.id));
  const messages = buildFortuneMessages({
    persona: selectedPersona.value,
    engine: selectedPersonaEngine.value,
    chart: chart.value,
    task,
    sharedProfile: sharedProfile.value,
    roleHistory: createMemoryWindow(currentHistory),
    question
  });
  const userText = messages[messages.length - 1].content;

  try {
    await appendRoleMessage(selectedPersona.value.id, { role: 'user', content: userText });
    const fullText = await streamFortuneReading({
      credentials: credentialsDraft,
      messages,
      onDelta(delta) {
        readingText.value += delta;
      }
    });
    roleHistory.value = await appendRoleMessage(selectedPersona.value.id, {
      role: 'assistant',
      content: fullText
    });
    followQuestion.value = '';
  } catch (error: any) {
    setMessage(error?.message ?? '解读失败');
  } finally {
    streaming.value = false;
  }
}

async function requestDailyLot() {
  if (drawingLot.value || streaming.value) return;
  drawingLot.value = true;
  const animationMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 220 : 860;
  window.setTimeout(() => {
    drawingLot.value = false;
  }, animationMs);
  await requestReading('daily_lot');
}

async function loginAdmin() {
  adminMessage.value = '';
  try {
    await verifyAdmin(adminSession);
    adminAuthed.value = true;
    await reloadAdminPersonas();
  } catch (error: any) {
    adminMessage.value = error?.message ?? '登录失败';
  }
}

async function reloadAdminPersonas() {
  adminPersonas.value = await fetchAdminPersonas(adminSession);
}

function resetAdminForm() {
  clearCropPreviews();
  clearAdminEngineDraft();
  Object.assign(adminForm, {
    id: '',
    name: '',
    engineId: 'daoist',
    opening: '',
    customPrompt: '',
    avatarUrl: '/defaults/custom-avatar.svg',
    backgroundUrl: '/defaults/custom-bg.svg',
    tone: { directness: 50, detail: 60 },
    categories: ['bazi', 'daily'],
    avatarFile: null,
    backgroundFile: null
  });
}

function editPersona(persona: PersonaSkin) {
  clearCropPreviews();
  setAdminEngineDraft(engineById(persona.engineId));
  Object.assign(adminForm, {
    id: persona.id,
    name: persona.name,
    engineId: persona.engineId,
    opening: persona.opening,
    customPrompt: persona.customPrompt ?? '',
    avatarUrl: persona.avatarUrl,
    backgroundUrl: persona.backgroundUrl,
    tone: { ...persona.tone },
    categories: [...persona.categories],
    avatarFile: null,
    backgroundFile: null
  });
}

function clearCropPreviews() {
  if (avatarPreviewUrl.value) URL.revokeObjectURL(avatarPreviewUrl.value);
  if (backgroundPreviewUrl.value) URL.revokeObjectURL(backgroundPreviewUrl.value);
  avatarPreviewUrl.value = '';
  backgroundPreviewUrl.value = '';
}

function openCropper(file: File, field: CropField) {
  closeCropper();
  cropSession.open = true;
  cropSession.field = field;
  cropSession.sourceUrl = URL.createObjectURL(file);
  cropSession.fileName = file.name;
  cropSession.aspectRatio = field === 'avatarFile' ? 1 : 16 / 9;
  cropSession.zoom = 1;
  cropSession.offsetX = 0;
  cropSession.offsetY = 0;
  cropSession.baseWidth = 0;
  cropSession.baseHeight = 0;
  cropSession.naturalWidth = 0;
  cropSession.naturalHeight = 0;
}

function setUpload(event: Event, field: CropField) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    adminMessage.value = '请上传图片文件';
    return;
  }
  openCropper(file, field);
}

function closeCropper() {
  if (cropSession.sourceUrl) URL.revokeObjectURL(cropSession.sourceUrl);
  cropSession.open = false;
  cropSession.sourceUrl = '';
  cropSession.fileName = '';
  cropSession.dragging = false;
}

function onCropImageLoad() {
  const image = cropImageRef.value;
  const frame = cropFrameRef.value;
  if (!image || !frame) return;
  cropSession.naturalWidth = image.naturalWidth;
  cropSession.naturalHeight = image.naturalHeight;
  const scale = Math.max(frame.clientWidth / image.naturalWidth, frame.clientHeight / image.naturalHeight);
  cropSession.baseWidth = image.naturalWidth * scale;
  cropSession.baseHeight = image.naturalHeight * scale;
  cropSession.zoom = 1;
  cropSession.offsetX = 0;
  cropSession.offsetY = 0;
}

function clampCropOffset() {
  cropSession.offsetX = Math.max(-cropMaxOffsetX.value, Math.min(cropMaxOffsetX.value, cropSession.offsetX));
  cropSession.offsetY = Math.max(-cropMaxOffsetY.value, Math.min(cropMaxOffsetY.value, cropSession.offsetY));
}

function startCropDrag(event: PointerEvent) {
  cropSession.dragging = true;
  cropSession.dragStartX = event.clientX;
  cropSession.dragStartY = event.clientY;
  cropSession.dragOffsetX = cropSession.offsetX;
  cropSession.dragOffsetY = cropSession.offsetY;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveCropDrag(event: PointerEvent) {
  if (!cropSession.dragging) return;
  cropSession.offsetX = cropSession.dragOffsetX + event.clientX - cropSession.dragStartX;
  cropSession.offsetY = cropSession.dragOffsetY + event.clientY - cropSession.dragStartY;
  clampCropOffset();
}

function endCropDrag() {
  cropSession.dragging = false;
}

function createCroppedFile(blob: Blob) {
  const baseName = cropSession.fileName.replace(/\.[^.]+$/, '') || (cropSession.field === 'avatarFile' ? 'avatar' : 'background');
  return new File([blob], `${baseName}-cropped.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

async function confirmCrop() {
  const image = cropImageRef.value;
  const frame = cropFrameRef.value;
  if (!image || !frame || !cropSession.naturalWidth || !cropSession.naturalHeight) return;

  const outputWidth = cropSession.field === 'avatarFile' ? 640 : 1440;
  const outputHeight = Math.round(outputWidth / cropSession.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    adminMessage.value = '图片裁剪失败';
    return;
  }

  const frameWidth = frame.clientWidth;
  const frameHeight = frame.clientHeight;
  const displayWidth = cropSession.baseWidth * cropSession.zoom;
  const displayHeight = cropSession.baseHeight * cropSession.zoom;
  const scaleX = outputWidth / frameWidth;
  const scaleY = outputHeight / frameHeight;

  context.fillStyle = '#fffdf8';
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    (outputWidth - displayWidth * scaleX) / 2 + cropSession.offsetX * scaleX,
    (outputHeight - displayHeight * scaleY) / 2 + cropSession.offsetY * scaleY,
    displayWidth * scaleX,
    displayHeight * scaleY
  );

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) {
    adminMessage.value = '图片裁剪失败';
    return;
  }

  const croppedFile = createCroppedFile(blob);
  adminForm[cropSession.field] = croppedFile;
  const previewUrl = URL.createObjectURL(croppedFile);
  if (cropSession.field === 'avatarFile') {
    if (avatarPreviewUrl.value) URL.revokeObjectURL(avatarPreviewUrl.value);
    avatarPreviewUrl.value = previewUrl;
    adminMessage.value = '头像已裁剪，保存角色后生效';
  } else {
    if (backgroundPreviewUrl.value) URL.revokeObjectURL(backgroundPreviewUrl.value);
    backgroundPreviewUrl.value = previewUrl;
    adminMessage.value = '背景已裁剪，保存角色后生效';
  }
  closeCropper();
}

async function uploadIfNeeded(file: File | null, fallback: string) {
  return file ? uploadRoleImage(adminSession, file) : fallback;
}

async function generatePersonaDraft() {
  const direction = adminGenerator.direction.trim();
  if (!direction) {
    adminMessage.value = '先写一个大师方向';
    return;
  }
  const credentialError = validateCredentials(credentialsDraft);
  if (credentialError) {
    adminMessage.value = `请先在凭据设置里配置模型：${credentialError}`;
    return;
  }

  adminGenerator.generating = true;
  adminMessage.value = '';
  try {
    const text = await streamFortuneReading({
      credentials: credentialsDraft,
      messages: buildPersonaGenerationMessages(direction, engines.value),
      onDelta() {}
    });
    const draft = parseGeneratedDraft(text);
    const engine: PersonaEngine = {
      id: createClientEngineId(),
      name: draft.engine.name,
      worldview: draft.engine.worldview,
      promptRules: draft.engine.promptRules,
      builtin: false
    };
    upsertLocalEngine(engine);
    clearCropPreviews();
    setAdminEngineDraft(engine);
    Object.assign(adminForm, {
      id: '',
      name: draft.persona.name,
      engineId: engine.id,
      opening: draft.persona.opening,
      customPrompt: draft.persona.customPrompt,
      avatarUrl: '/defaults/custom-avatar.svg',
      backgroundUrl: '/defaults/custom-bg.svg',
      tone: { ...draft.persona.tone },
      categories: [...draft.persona.categories],
      avatarFile: null,
      backgroundFile: null
    });
    triggerAdminGeneratedHighlight();
    adminMessage.value = 'AI 已生成大师草稿，请检查后保存';
  } catch (error: any) {
    adminMessage.value = error?.message ?? 'AI 生成失败';
  } finally {
    adminGenerator.generating = false;
  }
}

async function savePersona() {
  adminMessage.value = '';
  try {
    const engine = buildAdminEnginePayload();
    const avatarUrl = await uploadIfNeeded(adminForm.avatarFile, adminForm.avatarUrl);
    const backgroundUrl = await uploadIfNeeded(adminForm.backgroundFile, adminForm.backgroundUrl);
    const payload: PersonaPayload = {
      name: adminForm.name,
      engineId: adminForm.engineId,
      opening: adminForm.opening,
      customPrompt: adminForm.customPrompt,
      avatarUrl,
      backgroundUrl,
      tone: { ...adminForm.tone },
      categories: [...adminForm.categories],
      ...(engine ? { engine } : {})
    };
    if (adminForm.id) {
      await updateAdminPersona(adminSession, adminForm.id, payload);
      adminMessage.value = adminEditingBuiltin.value ? '内置角色资源已更新' : '角色已更新';
    } else {
      await createAdminPersona(adminSession, payload);
      adminMessage.value = '角色已创建';
    }
    resetAdminForm();
    await reloadAdminPersonas();
    await loadPersonas();
  } catch (error: any) {
    adminMessage.value = error?.message ?? '保存失败';
  }
}

async function removePersona(persona: PersonaSkin) {
  adminMessage.value = '';
  try {
    await deleteAdminPersona(adminSession, persona.id);
    adminMessage.value = '角色已删除';
    await reloadAdminPersonas();
    await loadPersonas();
  } catch (error: any) {
    adminMessage.value = error?.message ?? '删除失败';
  }
}

onMounted(async () => {
  startOpeningAnimation();
  loading.value = true;
  try {
    await loadPersonas();
    await loadLocalState();
  } catch (error: any) {
    setMessage(error?.message ?? '应用初始化失败');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="app-shell" :style="{ '--scene': `url(${selectedPersona?.backgroundUrl ?? '/defaults/custom-bg.svg'})` }">
    <div class="scene-layer"></div>
    <div
      v-if="showOpeningAnimation"
      class="bagua-opening"
      :class="{ leaving: openingAnimationClosing }"
      role="status"
      aria-live="polite"
      aria-label="八卦阵启动中"
    >
      <div class="opening-aura" aria-hidden="true"></div>
      <div class="bagua-stage" aria-hidden="true">
        <div class="opening-spark-field">
          <span
            v-for="spark in 16"
            :key="spark"
            class="opening-spark"
            :style="`--spark-angle: ${(spark - 1) * 22.5}deg; --spark-delay: ${spark * 38}ms`"
          ></span>
        </div>
        <div class="opening-runic-ring outer"></div>
        <div class="opening-runic-ring inner"></div>
        <div class="opening-sweep"></div>
        <div class="bagua-ring">
          <span class="bagua-symbol">☰</span>
          <span class="bagua-symbol">☱</span>
          <span class="bagua-symbol">☲</span>
          <span class="bagua-symbol">☳</span>
          <span class="bagua-symbol">☷</span>
          <span class="bagua-symbol">☶</span>
          <span class="bagua-symbol">☵</span>
          <span class="bagua-symbol">☴</span>
        </div>
        <div class="taiji-disc"></div>
      </div>
      <p>乾坤启阵</p>
      <button class="opening-skip" type="button" @click="skipOpeningAnimation">跳过仪式</button>
    </div>
    <header class="topbar">
      <button class="brand-button" type="button" @click="activePanel = 'reading'">
        <Wand2 :size="22" aria-hidden="true" />
        <span>Soothsay</span>
      </button>
      <nav class="top-actions" aria-label="主导航">
        <button class="text-trigger" type="button" title="选大师" @click="masterModalOpen = true">
          <UserRound :size="18" aria-hidden="true" />
          <span>{{ selectedPersona?.name ?? '选大师' }}</span>
        </button>
        <button class="text-trigger" type="button" title="设置个人档案" @click="profileModalOpen = true">
          <Save :size="18" aria-hidden="true" />
          <span>个人档案 {{ savedFacts.length }}</span>
        </button>
        <button class="text-trigger" type="button" title="管理解读记录" @click="openHistoryModal">
          <MessageCircle :size="18" aria-hidden="true" />
          <span>解读记录 {{ historyMessages.length }}</span>
        </button>
        <button class="birth-trigger" type="button" title="生辰档案" @click="openBirthModal">
          <CalendarDays :size="18" aria-hidden="true" />
          <span>{{ birthTriggerLabel }}</span>
        </button>
        <button class="icon-button" type="button" title="凭据设置" @click="openSettings">
          <KeyRound :size="20" aria-hidden="true" />
        </button>
        <button class="icon-button" type="button" title="管理后台" @click="activePanel = 'admin'">
          <ShieldCheck :size="20" aria-hidden="true" />
        </button>
      </nav>
    </header>

    <p v-if="appMessage" class="toast" role="status">{{ appMessage }}</p>

    <div v-if="masterModalOpen" class="modal-backdrop" @click.self="masterModalOpen = false">
      <section class="master-modal" role="dialog" aria-modal="true" aria-labelledby="master-modal-title">
        <header class="modal-heading">
          <div>
            <h2 id="master-modal-title">选择大师</h2>
            <p>切换后会清空当前解读文本，并沿用已选择的命盘。</p>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" type="button" title="换位大师" @click="switchToNextPersona">
              <RefreshCw :size="17" aria-hidden="true" />
              换一位
            </button>
            <button class="secondary-button" type="button" @click="masterModalOpen = false">关闭</button>
          </div>
        </header>
        <div class="master-picker-grid">
          <button
            v-for="persona in personas"
            :key="persona.id"
            class="master-card"
            :class="{ active: persona.id === selectedPersonaId }"
            type="button"
            :aria-current="persona.id === selectedPersonaId ? 'true' : undefined"
            @click="choosePersona(persona)"
          >
            <img :src="persona.avatarUrl" :alt="persona.name" />
            <span class="master-name">{{ persona.name }}</span>
            <span class="master-opening">{{ persona.opening }}</span>
          </button>
          <p v-if="!personas.length" class="empty-state">还没有可选大师。</p>
        </div>
      </section>
    </div>

    <div v-if="profileModalOpen" class="modal-backdrop" @click.self="profileModalOpen = false">
      <section class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
        <header class="modal-heading">
          <div>
            <h2 id="profile-modal-title">个人档案</h2>
            <p>已保存 {{ savedFacts.length }} 条上下文，后续解读会参考这些现实情况。</p>
          </div>
          <button class="secondary-button" type="button" @click="profileModalOpen = false">关闭</button>
        </header>
        <section class="memory-editor profile-memory" aria-label="个人档案维护">
          <div class="fact-row">
            <input v-model="factDraft" type="text" placeholder="补充现实情况" @keyup.enter="addFact" />
            <button class="icon-button" type="button" title="写入档案" @click="addFact">
              <Save :size="18" aria-hidden="true" />
            </button>
          </div>
          <ul v-if="savedFacts.length" class="fact-list" aria-label="已保存上下文">
            <li v-for="fact in savedFacts" :key="fact" class="fact-item">
              <span>{{ fact }}</span>
              <button class="icon-button danger" type="button" title="删除上下文" @click="removeFact(fact)">
                <Trash2 :size="16" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <p v-else class="empty-state">还没有补充现实情况，保存后会参与后续解读。</p>
        </section>
      </section>
    </div>

    <div v-if="historyModalOpen" class="modal-backdrop" @click.self="historyModalOpen = false">
      <section class="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
        <header class="modal-heading">
          <div>
            <h2 id="history-modal-title">解读记录</h2>
            <p>{{ selectedPersona?.name ?? '当前大师' }} · 共 {{ historyMessages.length }} 条消息</p>
          </div>
          <div class="modal-actions">
            <button class="secondary-button danger-soft" type="button" :disabled="!historyMessages.length || streaming" @click="clearCurrentHistory">
              <Trash2 :size="17" aria-hidden="true" />
              清空
            </button>
            <button class="secondary-button" type="button" @click="historyModalOpen = false">关闭</button>
          </div>
        </header>

        <div class="history-list" aria-label="解读记录列表">
          <article v-for="message in historyMessages" :key="message.id" class="history-item">
            <div class="history-item-head">
              <div class="history-meta">
                <span class="history-role" :class="message.role">{{ message.role === 'user' ? '用户' : '大师' }}</span>
                <time>{{ formatMessageTime(message) }}</time>
              </div>
              <div class="history-actions">
                <button class="icon-button" type="button" title="复制消息" @click="copyHistoryMessage(message)">
                  <Copy :size="16" aria-hidden="true" />
                </button>
                <button class="icon-button danger" type="button" title="删除消息" :disabled="streaming" @click="removeHistoryMessage(message)">
                  <Trash2 :size="16" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div class="history-body">
              <MarkdownRenderer :blocks="parseMarkdown(message.content)" />
            </div>
          </article>
          <p v-if="!historyMessages.length" class="empty-state history-empty">还没有解读记录。完成一次解读或追问后会出现在这里。</p>
        </div>
      </section>
    </div>

    <div v-if="birthModalOpen" class="modal-backdrop" @click.self="birthModalOpen = false">
      <section class="birth-modal" role="dialog" aria-modal="true" aria-labelledby="birth-modal-title">
        <header class="modal-heading">
          <div>
            <h2 id="birth-modal-title">生辰档案</h2>
            <p>管理多个生辰，点击左侧档案即可切换当前命盘。</p>
          </div>
          <button class="secondary-button" type="button" @click="birthModalOpen = false">关闭</button>
        </header>

        <div class="birth-modal-body">
          <aside class="birth-profile-list" aria-label="生辰档案列表">
            <div class="birth-list-heading">
              <span>档案 {{ birthProfiles.length }}</span>
              <button class="secondary-button" type="button" @click="resetBirthDraft">新建</button>
            </div>
            <article
              v-for="profile in birthProfiles"
              :key="profile.id"
              class="birth-profile-item"
              :class="{ active: profile.id === sharedProfile?.activeBirthProfileId }"
              role="button"
              tabindex="0"
              @click="activateBirthProfile(profile)"
              @keyup.enter="activateBirthProfile(profile)"
              @keyup.space.prevent="activateBirthProfile(profile)"
            >
              <div>
                <strong>{{ profile.name }}</strong>
                <span>{{ formatBirthProfileMeta(profile) }}</span>
              </div>
              <span class="birth-active-mark">
                <Check v-if="profile.id === sharedProfile?.activeBirthProfileId" :size="17" aria-hidden="true" />
              </span>
              <button class="icon-button danger" type="button" title="删除生辰" @click="removeBirthProfile(profile, $event)">
                <Trash2 :size="16" aria-hidden="true" />
              </button>
            </article>
            <p v-if="!birthProfiles.length" class="empty-state">还没有生辰档案，先在右侧保存一个。</p>
          </aside>

          <form class="birth-editor" @submit.prevent="submitBirthForm">
            <div class="panel-title">
              <CalendarDays :size="18" aria-hidden="true" />
              <h2>{{ editingBirthProfileId ? '编辑生辰' : '新建生辰' }}</h2>
            </div>
            <label>
              档案名称
              <input v-model.trim="birthProfileName" type="text" maxlength="30" placeholder="例如 自己 / 家人 / 客户A" />
            </label>
            <div class="segmented">
              <button type="button" :class="{ active: birthForm.calendarType === 'solar' }" @click="birthForm.calendarType = 'solar'">
                公历
              </button>
              <button type="button" :class="{ active: birthForm.calendarType === 'lunar' }" @click="birthForm.calendarType = 'lunar'">
                农历
              </button>
              <button type="button" :class="{ active: birthForm.calendarType === 'bazi' }" @click="birthForm.calendarType = 'bazi'">
                四柱
              </button>
            </div>
            <div v-if="birthForm.calendarType !== 'bazi'" class="form-grid">
              <label>
                年
                <input v-model.number="birthForm.year" type="number" min="1" required />
              </label>
              <label>
                月
                <input v-model.number="birthForm.month" type="number" min="1" max="12" required />
              </label>
              <label>
                日
                <input v-model.number="birthForm.day" type="number" min="1" max="31" required />
              </label>
              <label>
                时
                <input v-model.number="birthForm.hour" type="number" min="0" max="23" required />
              </label>
              <label>
                分
                <input v-model.number="birthForm.minute" type="number" min="0" max="59" required />
              </label>
              <label>
                性别
                <select v-model="birthForm.gender">
                  <option value="female">女</option>
                  <option value="male">男</option>
                </select>
              </label>
            </div>
            <div v-else class="direct-bazi-fields">
              <label>
                粘贴四柱
                <input v-model="directPillarsText" type="text" placeholder="例如 甲子 乙丑 丙寅 丁卯" @blur="applyDirectPillarsText" />
              </label>
              <div class="form-grid">
                <label>
                  年柱
                  <input v-model.trim="directPillars.year" type="text" maxlength="2" placeholder="甲子" required />
                </label>
                <label>
                  月柱
                  <input v-model.trim="directPillars.month" type="text" maxlength="2" placeholder="乙丑" required />
                </label>
                <label>
                  日柱
                  <input v-model.trim="directPillars.day" type="text" maxlength="2" placeholder="丙寅" required />
                </label>
                <label>
                  时柱
                  <input v-model.trim="directPillars.hour" type="text" maxlength="2" placeholder="丁卯" required />
                </label>
              </div>
              <p class="note-line">直接四柱模式会计算藏干、十神、五行和今日流日关系；起运与大运需出生日期时间。</p>
            </div>
            <label v-if="birthForm.calendarType === 'lunar'" class="check-row">
              <input v-model="birthForm.isLeapMonth" type="checkbox" />
              闰月
            </label>
            <label v-if="birthForm.calendarType !== 'bazi'">
              出生地经度
              <input v-model="longitudeDraft" type="number" step="0.0001" placeholder="例如 116.397" />
            </label>
            <label v-if="birthForm.calendarType !== 'bazi'">
              子时规则
              <select v-model="birthForm.ziHourPolicy">
                <option value="lateZiNextDay">晚子时换日</option>
                <option value="lateZiSameDay">晚子时不换日</option>
              </select>
            </label>
            <div class="actions-row">
              <button class="primary-button" type="submit">
                <Save :size="18" aria-hidden="true" />
                保存并使用
              </button>
              <button class="secondary-button" type="button" @click="resetBirthDraft">清空新建</button>
            </div>
          </form>
        </div>
      </section>
    </div>

    <div v-if="cropSession.open" class="modal-backdrop crop-backdrop" @click.self="closeCropper">
      <section class="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
        <header class="modal-heading">
          <div>
            <h2 id="crop-title">{{ cropTitle }}</h2>
            <p>{{ cropHint }}</p>
          </div>
          <button class="secondary-button" type="button" @click="closeCropper">取消</button>
        </header>
        <div class="crop-body">
          <div
            ref="cropFrameRef"
            class="crop-viewport"
            :style="cropFrameStyle"
            @pointerdown="startCropDrag"
            @pointermove.prevent="moveCropDrag"
            @pointerup="endCropDrag"
            @pointercancel="endCropDrag"
            @pointerleave="endCropDrag"
          >
            <img
              ref="cropImageRef"
              class="crop-source"
              :src="cropSession.sourceUrl"
              :style="cropImageStyle"
              alt="待裁剪图片"
              draggable="false"
              @load="onCropImageLoad"
            />
            <div class="crop-grid" aria-hidden="true"></div>
          </div>
          <div class="crop-controls">
            <label>
              缩放
              <input v-model.number="cropSession.zoom" type="range" min="1" max="3" step="0.01" @input="clampCropOffset" />
            </label>
            <label>
              横向
              <input
                v-model.number="cropSession.offsetX"
                type="range"
                :min="-cropMaxOffsetX"
                :max="cropMaxOffsetX"
                step="1"
                :disabled="cropMaxOffsetX === 0"
                @input="clampCropOffset"
              />
            </label>
            <label>
              纵向
              <input
                v-model.number="cropSession.offsetY"
                type="range"
                :min="-cropMaxOffsetY"
                :max="cropMaxOffsetY"
                step="1"
                :disabled="cropMaxOffsetY === 0"
                @input="clampCropOffset"
              />
            </label>
          </div>
        </div>
        <footer class="crop-actions">
          <button class="secondary-button" type="button" @click="closeCropper">重新选择</button>
          <button class="primary-button" type="button" @click="confirmCrop">
            <Check :size="18" aria-hidden="true" />
            确认裁剪
          </button>
        </footer>
      </section>
    </div>

    <section v-if="activePanel === 'reading'" class="workspace">
      <section class="reading-stage" aria-live="polite">
        <section class="panel chart-panel">
          <div class="panel-title">
            <Wand2 :size="18" aria-hidden="true" />
            <h2>命盘</h2>
          </div>
          <div v-if="selectedPersona" class="chart-master-strip">
            <img class="chart-master-avatar" :src="selectedPersona.avatarUrl" :alt="selectedPersona.name" />
            <div class="chart-master-copy">
              <div class="chart-master-meta">
                <strong>{{ selectedPersona.name }}</strong>
                <span>{{ engineNameById(selectedPersona.engineId) }}</span>
              </div>
              <p :title="selectedPersona.opening">{{ selectedPersona.opening }}</p>
            </div>
          </div>
          <div v-if="chart" class="chart-content">
            <div class="pillar-grid">
              <article v-for="pillar in pillarRows" :key="pillar.name" class="pillar-cell">
                <span>{{ pillar.label }}</span>
                <strong>{{ pillar.ganZhi }}</strong>
                <small>{{ pillar.tenGodOfGan }} · {{ pillar.naYin }}</small>
                <small>藏干 {{ pillar.hiddenGan.join('、') }}</small>
              </article>
            </div>
            <div class="stats-grid">
              <span v-for="(value, key) in chart.fiveElementStats" :key="key">{{ key }} {{ value }}</span>
            </div>
            <p class="note-line">日主 {{ chart.dayMaster.gan }}{{ chart.dayMaster.element }} · 起运 {{ chart.luck.startAgeText }}</p>
            <p v-for="note in chart.notes" :key="note" class="note-line">{{ note }}</p>
            <div class="actions-row">
              <button class="primary-button" type="button" :disabled="streaming" @click="requestReading('bazi_full')">
                <Wand2 :size="18" aria-hidden="true" />
                八字全解
              </button>
              <button class="secondary-button" type="button" :disabled="streaming" @click="requestReading('daily')">
                <CalendarDays :size="18" aria-hidden="true" />
                每日运势
              </button>
              <button
                class="secondary-button lot-button"
                type="button"
                :class="{ drawing: drawingLot }"
                :disabled="streaming || drawingLot"
                @click="requestDailyLot"
              >
                <Sparkles :size="18" aria-hidden="true" />
                今日抽签
              </button>
            </div>
          </div>
          <div v-else class="empty-state chart-empty">
            <p>还没有选择生辰档案。</p>
            <button class="secondary-button" type="button" @click="openBirthModal">打开生辰档案</button>
          </div>
        </section>

        <section class="panel conversation-panel">
          <div class="panel-title">
            <MessageCircle :size="18" aria-hidden="true" />
            <h2>解读</h2>
          </div>
          <div class="answer-box">
            <div v-if="streaming || readingText" class="markdown-frame">
              <MarkdownRenderer :blocks="activeReadingBlocks" />
              <span v-if="streaming" class="caret markdown-caret"></span>
            </div>
            <article v-else-if="roleHistory?.messages.length" v-for="message in roleHistory.messages.slice(-6)" :key="message.id" :class="['chat-message', `chat-${message.role}`]">
              <MarkdownRenderer :blocks="parseMarkdown(message.content)" />
            </article>
            <p v-else class="empty-state">命盘生成后可请求解读；没有 key 也不影响排盘。</p>
          </div>
          <div class="follow-row" role="group" aria-label="追问输入">
            <input v-model="followQuestion" type="text" placeholder="向大师追问" @keyup.enter="requestReading('follow_up', followQuestion)" />
            <button
              class="composer-send"
              type="button"
              title="发送追问"
              aria-label="发送追问"
              :disabled="streaming || !followQuestion.trim()"
              @click="requestReading('follow_up', followQuestion)"
            >
              <Send :size="18" aria-hidden="true" />
            </button>
          </div>
        </section>
      </section>
    </section>

    <section v-else-if="activePanel === 'settings'" class="single-panel">
      <div class="panel settings-panel">
        <div class="panel-title">
          <KeyRound :size="18" aria-hidden="true" />
          <h2>凭据</h2>
        </div>
        <label>
          base_url
          <input v-model="credentialsDraft.baseUrl" type="url" placeholder="https://api.example.com/v1" />
        </label>
        <label>
          key
          <input v-model="credentialsDraft.apiKey" type="password" autocomplete="off" />
        </label>
        <label>
          模型
          <input v-model="credentialsDraft.model" type="text" />
        </label>
        <p class="privacy-line">不存不记凭据：key 仅保存在本机浏览器，请求时随包透传，服务端不持久化、不记录请求正文。</p>
        <div class="actions-row">
          <button class="primary-button" type="button" @click="persistCredentials">
            <Save :size="18" aria-hidden="true" />
            保存
          </button>
          <button class="secondary-button" type="button" :disabled="testingCredentials" @click="runCredentialTest">
            <RefreshCw :size="18" aria-hidden="true" />
            测试
          </button>
          <button class="ghost-button" type="button" @click="removeCredentials">
            <Trash2 :size="18" aria-hidden="true" />
            清除
          </button>
        </div>
        <p v-if="credentialsStatus" class="note-line">{{ credentialsStatus }}</p>
      </div>
    </section>

    <section v-else class="single-panel admin-layout">
      <div v-if="!adminAuthed" class="panel admin-login">
        <div class="panel-title">
          <Lock :size="18" aria-hidden="true" />
          <h2>后台</h2>
        </div>
        <label>
          用户名
          <input v-model="adminSession.username" type="text" autocomplete="username" />
        </label>
        <label>
          密码
          <input v-model="adminSession.password" type="password" autocomplete="current-password" @keyup.enter="loginAdmin" />
        </label>
        <button class="primary-button" type="button" @click="loginAdmin">
          <Lock :size="18" aria-hidden="true" />
          登录
        </button>
        <p v-if="adminMessage" class="note-line">{{ adminMessage }}</p>
      </div>

      <div v-else class="admin-grid">
        <form class="panel admin-form" @submit.prevent="savePersona">
          <div class="panel-title">
            <UserRound :size="18" aria-hidden="true" />
            <h2>{{ adminEditingBuiltin ? '编辑内置资源' : adminEditing ? '编辑角色' : '创建角色' }}</h2>
          </div>
          <p v-if="adminEditingBuiltin" class="note-line">内置角色只能调整头像和背景，名字、体系与话术保持系统默认。</p>
          <div v-else class="ai-generator" :class="{ 'generated-highlight': adminGeneratedHighlight }">
            <div class="generator-heading">
              <Sparkles :size="18" aria-hidden="true" />
              <strong>AI 一键生成大师与体系</strong>
            </div>
            <div class="generator-row">
              <textarea
                v-model="adminGenerator.direction"
                maxlength="240"
                rows="2"
                placeholder="例如：精通紫微和心理咨询的温柔姐姐，擅长关系与职业选择"
                :disabled="adminGenerator.generating"
              ></textarea>
              <button
                class="secondary-button"
                type="button"
                :disabled="adminGenerator.generating || !adminGenerator.direction.trim()"
                @click="generatePersonaDraft"
              >
                <RefreshCw v-if="adminGenerator.generating" :size="18" aria-hidden="true" />
                <Sparkles v-else :size="18" aria-hidden="true" />
                {{ adminGenerator.generating ? '生成中' : '生成' }}
              </button>
            </div>
            <p v-if="!hasCredentials" class="note-line">需要先在凭据设置里配置 base_url、key 和模型。</p>
          </div>
          <label :class="{ 'generated-highlight': adminGeneratedHighlight }">
            名字
            <input v-model="adminForm.name" type="text" maxlength="40" :disabled="adminEditingBuiltin" required />
          </label>
          <label :class="{ 'generated-highlight': adminGeneratedHighlight }">
            体系
            <select v-model="adminForm.engineId" :disabled="adminEditingBuiltin" @change="onAdminEngineChange">
              <option v-for="engine in engines" :key="engine.id" :value="engine.id">{{ engine.name }}</option>
            </select>
          </label>
          <div v-if="adminEngineDraftActive" class="engine-draft" :class="{ 'generated-highlight': adminGeneratedHighlight }">
            <label>
              自定义体系名称
              <input v-model="adminEngineForm.name" type="text" maxlength="30" required />
            </label>
            <label>
              体系世界观
              <textarea v-model="adminEngineForm.worldview" maxlength="500" rows="3" required></textarea>
            </label>
            <label>
              体系提示规则
              <textarea v-model="adminEngineForm.promptRulesText" maxlength="1400" rows="4" placeholder="每行一条规则" required></textarea>
            </label>
          </div>
          <label :class="{ 'generated-highlight': adminGeneratedHighlight }">
            开场白
            <textarea v-model="adminForm.opening" maxlength="300" rows="4" :disabled="adminEditingBuiltin" required></textarea>
          </label>
          <label :class="{ 'generated-highlight': adminGeneratedHighlight }">
            角色自定义提示词
            <textarea
              v-model="adminForm.customPrompt"
              maxlength="1200"
              rows="5"
              :disabled="adminEditingBuiltin"
              placeholder="写给 AI 的角色执行规则，例如口吻、人设边界、解读侧重点、不能说的话。"
            ></textarea>
          </label>
          <label>
            直言程度
            <input v-model.number="adminForm.tone.directness" type="range" min="0" max="100" :disabled="adminEditingBuiltin" />
          </label>
          <label>
            详尽程度
            <input v-model.number="adminForm.tone.detail" type="range" min="0" max="100" :disabled="adminEditingBuiltin" />
          </label>
          <div class="category-row">
            <label class="check-row"><input v-model="adminForm.categories" type="checkbox" value="bazi" :disabled="adminEditingBuiltin" />八字</label>
            <label class="check-row"><input v-model="adminForm.categories" type="checkbox" value="daily" :disabled="adminEditingBuiltin" />每日</label>
          </div>
          <label class="upload-field">
            头像
            <div class="upload-preview-row">
              <img class="upload-preview avatar" :src="avatarPreview" alt="头像预览" />
              <input type="file" accept="image/*" @change="setUpload($event, 'avatarFile')" />
            </div>
          </label>
          <label class="upload-field">
            背景
            <div class="upload-preview-row">
              <img class="upload-preview background" :src="backgroundPreview" alt="背景预览" />
              <input type="file" accept="image/*" @change="setUpload($event, 'backgroundFile')" />
            </div>
          </label>
          <div class="actions-row">
            <button class="primary-button" type="submit">
              <Save :size="18" aria-hidden="true" />
              保存
            </button>
            <button class="secondary-button" type="button" @click="resetAdminForm">重置</button>
          </div>
          <p v-if="adminMessage" class="note-line">{{ adminMessage }}</p>
        </form>

        <section class="panel admin-list">
          <div class="panel-title">
            <ShieldCheck :size="18" aria-hidden="true" />
            <h2>角色列表</h2>
          </div>
          <article v-for="persona in adminPersonas" :key="persona.id" class="admin-role">
            <img :src="persona.avatarUrl" :alt="persona.name" />
            <div>
              <strong>{{ persona.name }}</strong>
              <span>{{ engineNameById(persona.engineId) }} · {{ persona.builtin ? '内置' : '自定义' }}</span>
            </div>
            <button class="icon-button" type="button" :title="persona.builtin ? '编辑头像和背景' : '编辑'" @click="editPersona(persona)">
              <Upload :size="18" aria-hidden="true" />
            </button>
            <button class="icon-button danger" type="button" :title="persona.builtin ? '内置角色不可删除' : '删除'" :disabled="persona.builtin" @click="removePersona(persona)">
              <Trash2 :size="18" aria-hidden="true" />
            </button>
          </article>
        </section>
      </div>
    </section>

    <div v-if="loading" class="loading-mask">加载中</div>
  </main>
</template>
