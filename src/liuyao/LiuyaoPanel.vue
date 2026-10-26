<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Solar } from 'lunar-javascript';
import {
  Compass,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Wand2
} from 'lucide-vue-next';
import type { PersonaSkin, PersonaEngine } from '@server-shared/persona';
import type { LocalCredentials } from '@/storage/types';
import { streamFortuneReading } from '@/services/proxy';
import { makeLiuyao, enrichLiuyao, type ProfessionalLiuyaoChart, type YaoValue } from './engine';

const props = defineProps<{
  persona?: PersonaSkin;
  engine?: PersonaEngine;
  credentials: LocalCredentials;
  mobileTab?: 'home' | 'chart' | 'reading' | 'mine';
}>();

const emit = defineEmits<{
  (event: 'switch-mobile-tab', tab: 'home' | 'chart' | 'reading' | 'mine'): void;
}>();

interface CaseRecord {
  id: string;
  question: string;
  dateTime: string;
  values: YaoValue[];
  chart: ProfessionalLiuyaoChart;
  reading: string;
}

const STORAGE_KEY = 'soothsay.liuyao.cases.v1';
const YAO_POSITION_LABELS = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'] as const;

const question = ref('');
const dateTime = ref('');
const values = ref<YaoValue[]>([]);
const chart = ref<ProfessionalLiuyaoChart | null>(null);
const records = ref<CaseRecord[]>([]);
const selectedId = ref('');
const reading = ref('');
const followUp = ref('');
const history = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
const busy = ref(false);
const error = ref('');

const options: Array<{ value: YaoValue; label: string; shortLabel: string; tag: string }> = [
  { value: 6, label: '老阴 6 ×', shortLabel: '老阴', tag: '6 × 阴动' },
  { value: 7, label: '少阳 7', shortLabel: '少阳', tag: '7 阳静' },
  { value: 8, label: '少阴 8', shortLabel: '少阴', tag: '8 阴静' },
  { value: 9, label: '老阳 9 ○', shortLabel: '老阳', tag: '9 ○ 阳动' }
];

const currentCase = computed(() => records.value.find((item) => item.id === selectedId.value));
const displayLines = computed(() => (chart.value ? [...chart.value.lines].reverse() : []));
const movingLineCount = computed(() => (chart.value ? chart.value.lines.filter((line) => line.moving).length : 0));

// 六爻槽位展示：从初爻到上爻逐步点亮
const tossSlots = computed(() =>
  YAO_POSITION_LABELS.map((posLabel, index) => {
    const value = values.value[index];
    const matched = options.find((item) => item.value === value);
    return {
      index: index + 1,
      posLabel,
      value,
      filled: value !== undefined,
      label: matched?.label ?? '待起爻',
      isMoving: value === 6 || value === 9
    };
  })
);

function yaoPositionLabel(index: number) {
  return YAO_POSITION_LABELS[index - 1] ?? `${index}爻`;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.value));
  } catch {
    error.value = '本地存储空间不足，案例未保存';
  }
}

onMounted(() => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  dateTime.value = local.toISOString().slice(0, 16);
  try {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(items)) records.value = items;
  } catch {
    /* ignore damaged local cache */
  }
});

// 录入单爻：满 6 爻后自动触发排盘预览，方便一气呵成
function add(value: YaoValue) {
  if (busy.value || values.value.length >= 6) return;
  values.value = [...values.value, value];
  chart.value = null;
  error.value = '';
}

function toss() {
  if (busy.value || values.value.length >= 6) return;
  const coins: number[] = Array.from({ length: 3 }, () => (Math.random() < 0.5 ? 2 : 3));
  add(coins.reduce((a, b) => a + b, 0) as YaoValue);
}

function undoLastYao() {
  if (busy.value || !values.value.length) return;
  values.value = values.value.slice(0, -1);
  chart.value = null;
  error.value = '';
}

function clear() {
  if (busy.value) return;
  values.value = [];
  chart.value = null;
  selectedId.value = '';
  reading.value = '';
  history.value = [];
  error.value = '';
}

function getCalendar(at = dateTime.value) {
  const date = new Date(at);
  if (!at || Number.isNaN(date.valueOf())) throw new Error('请选择有效的占问时间');
  const lunar = Solar.fromYmdHms(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0
  ).getLunar();
  return {
    dayGanZhi: String(lunar.getDayInGanZhiExact()),
    monthGanZhi: String(lunar.getMonthInGanZhiExact())
  };
}

function generate() {
  if (busy.value) return;
  try {
    if (values.value.length !== 6) throw new Error('请从初爻开始完成六次起卦');
    const calendar = getCalendar();
    chart.value = enrichLiuyao(makeLiuyao(values.value, calendar.dayGanZhi[0]), calendar);
    const duplicate = currentCase.value;
    if (
      duplicate &&
      duplicate.question === question.value.trim() &&
      duplicate.dateTime === dateTime.value &&
      duplicate.values.every((value, index) => value === values.value[index])
    ) {
      error.value = '当前卦已保存，无需重复排盘';
      return;
    }
    const item: CaseRecord = {
      id: crypto.randomUUID(),
      question: question.value.trim(),
      dateTime: dateTime.value,
      values: [...values.value],
      chart: chart.value,
      reading: ''
    };
    records.value = [item, ...records.value].slice(0, 100);
    selectedId.value = item.id;
    reading.value = '';
    history.value = [];
    save();
    error.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '排盘失败';
  }
}

function deleteCase(item: CaseRecord) {
  if (busy.value) return;
  if (!window.confirm(`删除占问记录「${item.question || item.chart.primary}」？`)) return;
  records.value = records.value.filter((record) => record.id !== item.id);
  if (selectedId.value === item.id) clear();
  save();
}

function selectCase(item: CaseRecord) {
  if (busy.value) return;
  selectedId.value = item.id;
  question.value = item.question;
  dateTime.value = item.dateTime;
  values.value = [...item.values];
  chart.value =
    'calendar' in item.chart
      ? item.chart
      : enrichLiuyao(makeLiuyao(item.values, getCalendar(item.dateTime).dayGanZhi[0]), getCalendar(item.dateTime));
  reading.value = item.reading;
  history.value = item.reading
    ? [
        { role: 'user', content: item.question || '请解读本卦' },
        { role: 'assistant', content: item.reading }
      ]
    : [];
  error.value = '';
}

async function ask(follow = false) {
  if (!chart.value || busy.value) return;
  if (!props.credentials.baseUrl || !props.credentials.apiKey || !props.credentials.model) {
    error.value = '请先在设置页配置模型凭据';
    return;
  }
  const query = follow ? followUp.value.trim() : question.value.trim() || '请解读此六爻卦';
  if (!query) return;

  if (!follow) {
    emit('switch-mobile-tab', 'reading');
  }

  const targetCaseId = selectedId.value;
  const facts = JSON.stringify(
    {
      ruleVersion: chart.value.ruleVersion,
      占问时间: dateTime.value,
      占问问题: question.value,
      卦象: chart.value
    },
    null,
    2
  );
  const system = [
    `你是${props.persona?.name || '六爻解读助手'}。 ${props.engine?.worldview || ''}`,
    ...(props.engine?.promptRules || []),
    props.persona?.customPrompt || '',
    '任务：依据京房纳甲盘，以传统六爻方法做结构化解释。区分程序已算出的事实、传统术数解释与现实行动建议。只引用结构化盘面给出的月建、旬空、伏神、变爻纳甲；未计算的依据请明确说明。',
    '不把传统占卜当成有科学验证的预测，也不得用于替代医疗、法律和投资专业判断。',
    `【已计算的盘面事实】\n${facts}`
  ]
    .filter(Boolean)
    .join('\n');
  const messages = [
    { role: 'system' as const, content: system },
    ...history.value.slice(-8),
    { role: 'user' as const, content: query }
  ];
  busy.value = true;
  error.value = '';
  reading.value = '';
  try {
    const answer = await streamFortuneReading({
      credentials: props.credentials,
      messages,
      onDelta: (chunk) => {
        reading.value += chunk;
      }
    });
    history.value = [
      ...history.value,
      { role: 'user', content: query },
      { role: 'assistant', content: answer }
    ];
    followUp.value = '';
    const item = records.value.find((record) => record.id === targetCaseId) ?? currentCase.value;
    if (item) {
      item.reading = answer;
      save();
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '解读失败';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="reading-stage liuyao-stage" :class="`liuyao-view-${mobileTab || 'chart'}`" aria-live="polite">
    <!-- 左栏：六爻起卦与装卦盘面（严格对齐八字 chart-panel 结构与视觉） -->
    <section class="panel chart-panel liuyao-chart-panel">
      <div class="panel-title chart-panel-header liuyao-panel-title">
        <slot name="switcher">
          <div class="liuyao-title-main">
            <Compass :size="18" aria-hidden="true" />
            <h2>六爻纳甲</h2>
            <span class="liuyao-subtitle-badge">京房八宫</span>
          </div>
        </slot>
        <button class="ghost-button panel-title-action liuyao-reset-btn" type="button" :disabled="busy" @click="clear">
          <RotateCcw :size="14" aria-hidden="true" />
          新起一卦
        </button>
      </div>

      <div v-if="persona" class="chart-master-strip">
        <img class="chart-master-avatar" :src="persona.avatarUrl" :alt="persona.name" />
        <div class="chart-master-copy">
          <div class="chart-master-meta">
            <strong>{{ persona.name }}</strong>
            <span v-if="engine?.name">{{ engine.name }}</span>
          </div>
          <p :title="persona.opening">{{ persona.opening }}</p>
        </div>
      </div>

      <div class="chart-content liuyao-chart-content">
        <p v-if="error" class="liuyao-error" role="alert">{{ error }}</p>

        <!-- 命盘主角区：排盘完成后置顶展示本卦/变卦、四值与六爻装盘 -->
        <div v-if="chart" class="chart-hero liuyao-hero">
          <div class="liuyao-hexagram-board" role="region" aria-label="本卦与变卦">
            <div class="liuyao-hexagram-cell is-primary">
              <span class="pillar-label">本卦 · {{ chart.palace }}宫{{ chart.palaceElement }}（{{ chart.palaceStage }}）</span>
              <strong class="liuyao-hexagram-name">{{ chart.primary }}</strong>
            </div>
            <div class="liuyao-hexagram-arrow" aria-hidden="true">→</div>
            <div class="liuyao-hexagram-cell">
              <span class="pillar-label">之卦 · {{ movingLineCount ? `${movingLineCount} 爻动` : '六爻安静' }}</span>
              <strong class="liuyao-hexagram-name">{{ chart.transformed }}</strong>
            </div>
          </div>

          <div class="stats-grid liuyao-stats-grid">
            <span>月建 {{ chart.calendar.monthGanZhi }}</span>
            <span>日辰 {{ chart.calendar.dayGanZhi }}</span>
            <span>旬空 {{ chart.calendar.xunKong.join('') }}</span>
            <span>{{ chart.palace }}宫{{ chart.palaceElement }}</span>
          </div>

          <p v-if="question.trim()" class="note-line chart-hero-summary">
            占问：{{ question.trim() }}
          </p>

          <!-- 六爻装卦盘面列表（上爻至初爻） -->
          <div class="liuyao-lines-board" role="list" aria-label="六爻装盘">
            <article
              v-for="line in displayLines"
              :key="line.index"
              class="liuyao-line-item"
              :class="{ 'is-shi': line.shi, 'is-moving': line.moving }"
              role="listitem"
            >
              <div class="liuyao-line-main">
                <span class="liuyao-pos">{{ yaoPositionLabel(line.index) }}</span>
                <span class="liuyao-spirit">{{ line.spirit }}</span>
                <div class="liuyao-najia">
                  <strong>{{ line.relative }}</strong>
                  <span>{{ line.stem }}{{ line.branch }}{{ line.element }}</span>
                </div>
                <div class="liuyao-symbol" :class="{ 'is-yang': line.yang, 'is-yin': !line.yang, 'is-moving': line.moving }">
                  <span class="liuyao-bar" aria-hidden="true">
                    <i></i>
                    <i v-if="!line.yang"></i>
                  </span>
                  <b class="liuyao-move-mark">{{ line.moving ? (line.yang ? '○' : '×') : '' }}</b>
                </div>
                <span class="liuyao-shiying">
                  <em v-if="line.shi" class="badge-shi">世</em>
                  <em v-else-if="line.ying" class="badge-ying">应</em>
                </span>
              </div>

              <div
                v-if="line.transformed || line.void || line.monthBroken || line.dayClashed"
                class="liuyao-line-meta"
              >
                <span v-if="line.transformed" class="liuyao-tag is-transformed">
                  化 {{ line.transformed.relative }} {{ line.transformed.stem }}{{ line.transformed.branch }}{{ line.transformed.element }}
                </span>
                <span v-if="line.void" class="liuyao-tag is-status">旬空</span>
                <span v-if="line.monthBroken" class="liuyao-tag is-status">月破</span>
                <span v-if="line.dayClashed" class="liuyao-tag is-status">日冲</span>
              </div>
            </article>
          </div>
        </div>

        <!-- 起卦与占问表单（手风琴折叠卡，未排盘时默认展开，已排盘可收起或调整） -->
        <details class="chart-section-details" :open="!chart">
          <summary>
            <span>铜钱起卦 · 占问录入</span>
            <strong>{{ values.length }}/6 爻</strong>
          </summary>
          <div class="chart-section-body liuyao-form-body">
            <label>
              占问之事
              <textarea
                v-model="question"
                rows="2"
                :disabled="busy"
                placeholder="例如：近期的项目合作是否顺利？"
              />
            </label>
            <label>
              占问时间（本地时间）
              <input v-model="dateTime" type="datetime-local" :disabled="busy" />
            </label>

            <div class="liuyao-section-head">
              <span>六爻进度（初爻 → 上爻）</span>
              <button
                v-if="values.length"
                class="ghost-button liuyao-inline-btn"
                type="button"
                :disabled="busy"
                @click="undoLastYao"
              >
                <Undo2 :size="13" aria-hidden="true" />
                撤销末爻
              </button>
            </div>

            <div class="liuyao-toss-track" role="list" aria-label="已摇爻象">
              <div
                v-for="slot in tossSlots"
                :key="slot.index"
                class="liuyao-toss-slot"
                :class="{ 'is-filled': slot.filled, 'is-moving': slot.isMoving }"
                role="listitem"
              >
                <small>{{ slot.posLabel }}</small>
                <strong>{{ slot.label }}</strong>
              </div>
            </div>

            <div class="liuyao-manual-block">
              <small class="note-line">手动指定单爻（从初爻开始依次录入）：</small>
              <div class="liuyao-manual-grid">
                <button
                  v-for="item in options"
                  :key="item.value"
                  type="button"
                  class="secondary-button liuyao-manual-btn"
                  :disabled="busy || values.length >= 6"
                  @click="add(item.value)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
          </div>
        </details>

        <!-- 伏神与规则说明 -->
        <details v-if="chart" class="chart-section-details" :open="Boolean(chart.hidden.length)">
          <summary>
            <span>伏神与盘面说明</span>
            <strong>{{ chart.hidden.length ? `${chart.hidden.length} 伏神` : '六亲俱全' }}</strong>
          </summary>
          <div class="chart-section-body">
            <div v-if="chart.hidden.length" class="relation-list">
              <span v-for="item in chart.hidden" :key="item.relative">
                <strong>伏神 {{ item.relative }}</strong>
                <small>第{{ item.index }}爻 · 飞神{{ item.flyingBranch }}</small>
                <em>{{ item.stem }}{{ item.branch }} 伏于{{ yaoPositionLabel(item.index) }}之下</em>
              </span>
            </div>
            <p v-else class="note-line">本卦六亲俱全，无缺爻伏神。</p>
            <p class="note-line">
              规则版本 {{ chart.ruleVersion }}。月建按节气月，空亡按日旬；旺衰及用神取舍由解读层结合占事给出。
            </p>
          </div>
        </details>

        <!-- 历史占问案例（桌面与移动端统一可访问） -->
        <details class="chart-section-details" :open="Boolean(records.length && !chart)">
          <summary>
            <span>六爻占问案例</span>
            <strong>{{ records.length }}</strong>
          </summary>
          <div class="chart-section-body">
            <p v-if="!records.length" class="note-line">暂无占问记录，排盘后将自动保存在本机。</p>
            <div v-else class="liuyao-records">
              <div
                v-for="item in records"
                :key="item.id"
                class="liuyao-record-row"
                :class="{ active: item.id === selectedId }"
              >
                <button
                  class="liuyao-record-select"
                  type="button"
                  :disabled="busy"
                  @click="selectCase(item)"
                >
                  <div class="liuyao-record-head">
                    <strong>{{ item.chart.primary }} → {{ item.chart.transformed }}</strong>
                    <small>{{ item.dateTime.replace('T', ' ') }}</small>
                  </div>
                  <span>{{ item.question || '未命名占问' }}</span>
                </button>
                <button
                  class="icon-button danger liuyao-record-delete"
                  type="button"
                  title="删除占问记录"
                  aria-label="删除占问记录"
                  :disabled="busy"
                  @click="deleteCase(item)"
                >
                  <Trash2 :size="15" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>

      <!-- 底部吸底主操作栏（对齐八字 chart-actions） -->
      <div class="actions-row chart-actions liuyao-chart-actions">
        <button
          :class="values.length < 6 ? 'primary-button' : 'secondary-button'"
          type="button"
          :disabled="busy || values.length >= 6"
          @click="toss"
        >
          <Sparkles :size="17" aria-hidden="true" />
          摇一次铜钱
        </button>
        <button
          :class="values.length === 6 && !chart ? 'primary-button' : 'secondary-button'"
          type="button"
          :disabled="busy || values.length !== 6"
          @click="generate"
        >
          <Wand2 :size="17" aria-hidden="true" />
          排六爻盘
        </button>
        <button
          :class="chart ? 'primary-button' : 'secondary-button'"
          type="button"
          :disabled="busy || !chart"
          @click="ask(false)"
        >
          <MessageCircle :size="17" aria-hidden="true" />
          {{ busy ? '解读中…' : '请大师解卦' }}
        </button>
      </div>
    </section>

    <!-- 右栏：大师解卦与追问对话面板（严格对齐八字 conversation-panel 结构与视觉） -->
    <section class="panel conversation-panel liuyao-conversation-panel">
      <div class="panel-title liuyao-panel-title">
        <div class="liuyao-title-main">
          <MessageCircle :size="18" aria-hidden="true" />
          <h2>六爻解卦</h2>
        </div>
        <span v-if="chart" class="liuyao-reading-context">
          {{ chart.primary }} · {{ question.trim() || '未命名占问' }}
        </span>
      </div>

      <div class="answer-box">
        <div v-if="busy || reading" class="markdown-frame reading-document">
          <header class="reading-document-head">
            <img v-if="persona" :src="persona.avatarUrl" :alt="persona.name" />
            <div>
              <span>{{ chart ? `${chart.primary} → ${chart.transformed}` : '六爻解卦' }}</span>
              <strong>{{ persona?.name ?? '六爻解读助手' }}</strong>
            </div>
          </header>
          <slot name="markdown" :text="reading">
            <div class="markdown-body">
              <p>{{ reading }}</p>
            </div>
          </slot>
          <span v-if="busy" class="caret markdown-caret"></span>
        </div>

        <template v-if="history.length > 2">
          <article
            v-for="(message, index) in history.slice(0, -2)"
            :key="index"
            :class="['chat-message', `chat-${message.role}`]"
          >
            <slot name="markdown" :text="message.content">
              <div class="markdown-body">
                <p>{{ message.content }}</p>
              </div>
            </slot>
          </article>
        </template>

        <div v-if="!busy && !reading" class="empty-state">
          <template v-if="chart">
            <p>已排定「{{ chart.primary }} → {{ chart.transformed }}」，点击下方或左栏「请大师解卦」获取详细断卦分析。</p>
            <button class="primary-button liuyao-empty-cta" type="button" :disabled="busy" @click="ask(false)">
              <Sparkles :size="17" aria-hidden="true" />
              请大师解卦
            </button>
          </template>
          <template v-else>
            <p>完成六次铜钱起卦并排盘后，可在此请求大师解卦；未配置 API 凭据也不影响本地起卦排盘。</p>
          </template>
        </div>
      </div>

      <div class="follow-row" role="group" aria-label="六爻追问输入">
        <input
          v-model="followUp"
          type="text"
          :disabled="!chart || busy"
          placeholder="继续追问本卦细节（如应期、用神、取舍建议）…"
          @keyup.enter="ask(true)"
        />
        <button
          class="composer-send"
          type="button"
          title="发送追问"
          aria-label="发送追问"
          :disabled="!chart || busy || !followUp.trim()"
          @click="ask(true)"
        >
          <Send :size="18" aria-hidden="true" />
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.liuyao-panel-title {
  justify-content: space-between;
}

.liuyao-title-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.liuyao-title-main > svg {
  color: var(--accent);
  flex-shrink: 0;
}

.liuyao-subtitle-badge {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--bg-soft);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.liuyao-reset-btn {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
}

.liuyao-reading-context {
  max-width: 55%;
  overflow: hidden;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  border: 1px solid var(--line-soft);
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.liuyao-error {
  margin: 0;
  padding: 9px 12px;
  border: 1px solid var(--danger);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

/* 本卦与变卦顶板：对齐八字 pillar-board 宣纸卡片风格 */
.liuyao-hexagram-board {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: stretch;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.liuyao-hexagram-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 10px;
  text-align: center;
  min-width: 0;
}

.liuyao-hexagram-cell.is-primary {
  background: var(--accent-soft);
  box-shadow: inset 0 2px 0 var(--accent);
}

.liuyao-hexagram-cell .pillar-label {
  margin-bottom: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.liuyao-hexagram-name {
  color: var(--ink);
  font-family: var(--font-display);
  font-size: clamp(20px, 1.9vw, 24px);
  font-weight: 600;
  line-height: 1.2;
}

.liuyao-hexagram-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  color: var(--muted);
  font-size: 14px;
  border-left: 1px solid var(--line-soft);
  border-right: 1px solid var(--line-soft);
  background: var(--surface-raised);
}

.liuyao-stats-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

/* 六爻装卦盘面 */
.liuyao-lines-board {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.liuyao-line-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line-soft);
  transition: background-color var(--dur-micro) var(--ease);
}

.liuyao-line-item:last-child {
  border-bottom: 0;
}

.liuyao-line-item.is-shi {
  background: var(--accent-soft);
}

.liuyao-line-main {
  display: grid;
  grid-template-columns: 34px 38px minmax(0, 1fr) 92px 24px;
  gap: 6px;
  align-items: center;
}

.liuyao-pos {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.liuyao-spirit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 5px;
  border-radius: var(--radius-sm);
  background: var(--bg-soft);
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 600;
}

.liuyao-najia {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.liuyao-najia strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.liuyao-najia span {
  color: var(--ink-soft);
  font-size: 12px;
  white-space: nowrap;
}

/* 阴阳爻视觉线条 + 动爻标记 */
.liuyao-symbol {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.liuyao-bar {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 64px;
  height: 8px;
}

.liuyao-bar i {
  display: block;
  height: 6px;
  border-radius: 3px;
  background: var(--ink);
}

.liuyao-symbol.is-yang .liuyao-bar i {
  width: 100%;
}

.liuyao-symbol.is-yin .liuyao-bar i {
  width: 43%;
}

.liuyao-symbol.is-moving .liuyao-bar i {
  background: var(--accent);
}

.liuyao-move-mark {
  width: 14px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  line-height: 1;
}

.liuyao-shiying {
  display: flex;
  justify-content: center;
}

.badge-shi,
.badge-ying {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-pill);
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
}

.badge-shi {
  background: var(--accent);
  color: var(--primary-ink);
}

.badge-ying {
  background: var(--bg-soft);
  color: var(--ink-soft);
  border: 1px solid var(--line);
}

.liuyao-line-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-left: 34px;
}

.liuyao-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
}

.liuyao-tag.is-transformed {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.liuyao-tag.is-status {
  background: var(--surface-raised);
  border: 1px solid var(--line-soft);
  color: var(--muted);
}

/* 起卦表单与进度槽 */
.liuyao-form-body {
  gap: 10px;
}

.liuyao-form-body textarea {
  min-height: 62px;
}

.liuyao-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 600;
}

.liuyao-inline-btn {
  min-height: 26px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--accent);
}

.liuyao-toss-track {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.liuyao-toss-slot {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  transition:
    border-color var(--dur-micro) var(--ease),
    background-color var(--dur-micro) var(--ease);
}

.liuyao-toss-slot.is-filled {
  border-style: solid;
  border-color: var(--line);
  background: var(--surface);
}

.liuyao-toss-slot.is-moving {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.liuyao-toss-slot small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
}

.liuyao-toss-slot strong {
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.liuyao-toss-slot.is-filled strong {
  color: var(--ink);
}

.liuyao-toss-slot.is-moving strong {
  color: var(--accent);
}

.liuyao-manual-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.liuyao-manual-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.liuyao-manual-btn {
  min-height: 34px;
  padding: 0 10px;
  font-size: 12px;
}

/* 历史案例列表 */
.liuyao-records {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.liuyao-record-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 6px;
  align-items: center;
}

.liuyao-record-select {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
  text-align: left;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  transition:
    border-color var(--dur-micro) var(--ease),
    background-color var(--dur-micro) var(--ease);
}

.liuyao-record-select:hover:not(:disabled) {
  border-color: var(--muted);
  background: var(--surface);
}

.liuyao-record-row.active .liuyao-record-select {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.liuyao-record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.liuyao-record-head strong {
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.liuyao-record-head small {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 11px;
}

.liuyao-record-select span {
  color: var(--ink-soft);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.liuyao-record-delete {
  width: 34px;
  min-height: 34px;
}

.liuyao-empty-cta {
  margin-top: 12px;
}

@media (max-width: 560px) {
  .liuyao-stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .liuyao-line-main {
    grid-template-columns: 30px 34px minmax(0, 1fr) 78px 22px;
    gap: 4px;
  }

  .liuyao-bar {
    width: 52px;
  }

  .liuyao-toss-track {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
