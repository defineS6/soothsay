<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { BookOpen, Clock3, Copy, Hash, MessageCircle, RotateCcw, Send, Sparkles, Trash2, Wand2 } from 'lucide-vue-next';
import type { PersonaSkin, PersonaEngine } from '@server-shared/persona';
import type { LocalCredentials } from '@/storage/types';
import { streamFortuneReading } from '@/services/proxy';
import { buildMeihuaChartText, copyTextToClipboard } from '@/export/chart-text';
import { makeMeihuaByNumbers, makeMeihuaByTime, type MeihuaChart, type MeihuaMethod } from './engine';

const props = defineProps<{
  persona?: PersonaSkin;
  engine?: PersonaEngine;
  credentials: LocalCredentials;
  mobileTab?: 'home' | 'chart' | 'reading' | 'mine';
}>();
const emit = defineEmits<{
  (event: 'switch-mobile-tab', tab: 'home' | 'chart' | 'reading' | 'mine'): void;
  (event: 'notify', message: string): void;
}>();

type Conversation = { role: 'user' | 'assistant'; content: string };
interface CaseRecord {
  id: string;
  question: string;
  dateTime: string;
  first: number | null;
  second: number | null;
  chart: MeihuaChart;
  messages: Conversation[];
}
const STORAGE_KEY = 'soothsay.meihua.cases.v1';
const method = ref<MeihuaMethod>('time');
const dateTime = ref('');
const firstNumber = ref<number | null>(null);
const secondNumber = ref<number | null>(null);
const question = ref('');
const chart = ref<MeihuaChart | null>(null);
const records = ref<CaseRecord[]>([]);
const selectedId = ref('');
const history = ref<Conversation[]>([]);
const reading = ref('');
const followUp = ref('');
const busy = ref(false);
const error = ref('');

const currentCase = computed(() => records.value.find((item) => item.id === selectedId.value));
const movingLabel = computed(() => ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'][chart.value?.movingLine ? chart.value.movingLine - 1 : 0]);
const recentMessages = computed(() => history.value.slice(-8));

function localDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

onMounted(() => {
  dateTime.value = localDateTime();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) {
      records.value = parsed.filter((item): item is CaseRecord =>
        item && typeof item.id === 'string' && item.chart?.ruleVersion === 'meihua-xiantian-v1'
      ).slice(0, 100);
    }
  } catch {
    error.value = '历史记录读取失败，仍可正常起卦';
  }
});

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.value));
  } catch {
    error.value = '本地存储空间不足，记录未能保存';
  }
}

function invalidate() {
  if (busy.value) return;
  chart.value = null;
  selectedId.value = '';
  history.value = [];
  reading.value = '';
  followUp.value = '';
  error.value = '';
}

function chooseMethod(next: MeihuaMethod) {
  if (busy.value || next === method.value) return;
  method.value = next;
  invalidate();
}

function randomNumbers() {
  if (busy.value) return;
  const data = crypto.getRandomValues(new Uint32Array(2));
  firstNumber.value = (data[0] % 999) + 1;
  secondNumber.value = (data[1] % 999) + 1;
  invalidate();
}

function reset() {
  if (busy.value) return;
  question.value = '';
  dateTime.value = localDateTime();
  firstNumber.value = null;
  secondNumber.value = null;
  invalidate();
}

function createChart() {
  if (busy.value) return;
  try {
    const next = method.value === 'time'
      ? makeMeihuaByTime(dateTime.value)
      : makeMeihuaByNumbers(Number(firstNumber.value), Number(secondNumber.value));
    const same = currentCase.value;
    if (same && same.question === question.value.trim() &&
        JSON.stringify(same.chart.source) === JSON.stringify(next.source)) {
      error.value = '此卦已保存，无需重复排盘';
      return;
    }
    const record: CaseRecord = {
      id: crypto.randomUUID(),
      question: question.value.trim(),
      dateTime: dateTime.value,
      first: method.value === 'numbers' ? firstNumber.value : null,
      second: method.value === 'numbers' ? secondNumber.value : null,
      chart: next,
      messages: []
    };
    chart.value = next;
    selectedId.value = record.id;
    records.value = [record, ...records.value].slice(0, 100);
    history.value = [];
    reading.value = '';
    error.value = '';
    saveRecords();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '起卦失败';
  }
}

function chooseRecord(item: CaseRecord) {
  if (busy.value) return;
  selectedId.value = item.id;
  chart.value = item.chart;
  question.value = item.question;
  method.value = item.chart.method;
  dateTime.value = item.dateTime;
  firstNumber.value = item.first;
  secondNumber.value = item.second;
  history.value = Array.isArray(item.messages) ? [...item.messages] : [];
  reading.value = history.value.filter((row) => row.role === 'assistant').at(-1)?.content ?? '';
  followUp.value = '';
  error.value = '';
}

function deleteRecord(item: CaseRecord) {
  if (busy.value || !window.confirm(`删除占问记录「${item.question || item.chart.primary.name}」？`)) return;
  records.value = records.value.filter((record) => record.id !== item.id);
  if (selectedId.value === item.id) invalidate();
  saveRecords();
}

async function copyChart() {
  if (!chart.value) return;
  try {
    await copyTextToClipboard(buildMeihuaChartText(chart.value, question.value));
    emit('notify', '梅花易数卦盘已复制');
  } catch {
    error.value = '复制失败，请检查剪贴板权限';
  }
}

async function ask(isFollowUp = false) {
  if (!chart.value || busy.value) return;
  const { baseUrl, apiKey, model } = props.credentials;
  if (!baseUrl || !apiKey || !model) {
    error.value = '请先在设置页配置模型凭据';
    return;
  }
  const text = isFollowUp ? followUp.value.trim() : question.value.trim() || '请结合此梅花易数卦象分析所问之事';
  if (!text) return;
  const current = chart.value;
  const targetId = selectedId.value;
  const existing = isFollowUp ? [...history.value] : [];
  const facts = JSON.stringify({ 占问: question.value.trim(), 排盘: current }, null, 2);
  const system = [
    `你是${props.persona?.name || '梅花易数解读助手'}。`,
    props.engine?.worldview ?? '',
    ...(props.engine?.promptRules ?? []),
    props.persona?.customPrompt ?? '',
    '你正在解读梅花易数，不要混用六爻纳甲、世应、六亲、六神等其他体系的规则。',
    '先说明本卦、动爻和体用，再结合互卦、变卦与体用五行生克，分析发展过程与变化趋势。',
    '程序已算好的卦象、阴阳爻、体用与五行关系不得改写。要明确区分盘面事实、传统术数解释与现实建议。',
    '传统占卜没有经过科学验证的预测能力，不得将解释当成确定事实，更不可替代医疗、法律或投资决策。',
    `【本地排盘事实】\n${facts}`
  ].filter(Boolean).join('\n');
  if (!isFollowUp) emit('switch-mobile-tab', 'reading');
  busy.value = true;
  error.value = '';
  reading.value = '';
  try {
    const answer = await streamFortuneReading({
      credentials: props.credentials,
      messages: [
        { role: 'system', content: system },
        ...existing.slice(-8),
        { role: 'user', content: text }
      ],
      onDelta: (delta) => { reading.value += delta; }
    });
    history.value = [...existing, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: answer }].slice(-20);
    const record = records.value.find((item) => item.id === targetId);
    if (record) {
      record.messages = [...history.value];
      saveRecords();
    }
    followUp.value = '';
  } catch (e) {
    reading.value = existing.filter((row) => row.role === 'assistant').at(-1)?.content ?? '';
    error.value = e instanceof Error ? e.message : '解卦失败';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="reading-stage meihua-stage" aria-live="polite">
    <section class="panel chart-panel">
      <div class="panel-title chart-panel-header meihua-panel-title">
        <slot name="switcher">
          <div class="meihua-title"><BookOpen :size="18" /><h2>梅花易数</h2></div>
        </slot>
        <button class="ghost-button panel-title-action meihua-reset" type="button" :disabled="busy" @click="reset">
          <RotateCcw :size="14" /> 新起一卦
        </button>
      </div>
      <div v-if="persona" class="chart-master-strip">
        <img class="chart-master-avatar" :src="persona.avatarUrl" :alt="persona.name" />
        <div class="chart-master-copy">
          <div class="chart-master-meta"><strong>{{ persona.name }}</strong><span v-if="engine?.name">{{ engine.name }}</span></div>
          <p :title="persona.opening">{{ persona.opening }}</p>
        </div>
      </div>

      <div class="chart-content">
        <p v-if="error" class="meihua-error" role="alert">{{ error }}</p>
        <div v-if="chart" class="chart-hero meihua-hero">
          <div class="meihua-hexagrams" role="list" aria-label="本卦、互卦、变卦">
            <article v-for="(item, index) in [
              { label: '本卦', hex: chart.primary },
              { label: '互卦', hex: chart.mutual },
              { label: '变卦', hex: chart.changed }
            ]" :key="index" class="meihua-hex-card" :class="{ primary: index === 0 }" role="listitem">
              <span class="meihua-card-label">{{ item.label }}</span>
              <strong>{{ item.hex.name }}</strong>
              <div class="meihua-lines" :aria-label="item.hex.name">
                <div v-for="(yang, lineIndex) in [...item.hex.lines].reverse()" :key="lineIndex" class="meihua-yao"
                  :class="{ moving: index === 0 && 6 - lineIndex === chart.movingLine }">
                  <span :class="{ yin: yang === 0 }"><i></i><i v-if="yang === 0"></i></span>
                </div>
              </div>
              <small>{{ item.hex.upper.symbol }} {{ item.hex.upper.name }}上 · {{ item.hex.lower.symbol }} {{ item.hex.lower.name }}下</small>
            </article>
          </div>
          <div class="meihua-metrics">
            <span><small>动爻</small><strong>{{ movingLabel }}动</strong></span>
            <span><small>体卦</small><strong>{{ chart.body.name }}{{ chart.body.element }}（{{ chart.bodyPosition === 'upper' ? '上' : '下' }}）</strong></span>
            <span><small>用卦</small><strong>{{ chart.use.name }}{{ chart.use.element }}（{{ chart.usePosition === 'upper' ? '上' : '下' }}）</strong></span>
            <span><small>体用</small><strong>{{ chart.relations.primary }}</strong></span>
          </div>
          <p v-if="question.trim()" class="note-line">占问：{{ question.trim() }}</p>
          <details class="chart-section-details">
            <summary><span>体用与卦变详情</span><strong>{{ chart.relations.changed }}</strong></summary>
            <div class="chart-section-body">
              <div class="meihua-relation-row"><span>本卦 · 体用</span><strong>{{ chart.body.name }}{{ chart.body.element }} / {{ chart.use.name }}{{ chart.use.element }}</strong><em>{{ chart.relations.primary }}</em></div>
              <div class="meihua-relation-row"><span>互卦 · 上互</span><strong>{{ chart.mutual.upper.name }}{{ chart.mutual.upper.element }}</strong><em>{{ chart.relations.mutualUpper }}</em></div>
              <div class="meihua-relation-row"><span>互卦 · 下互</span><strong>{{ chart.mutual.lower.name }}{{ chart.mutual.lower.element }}</strong><em>{{ chart.relations.mutualLower }}</em></div>
              <div class="meihua-relation-row"><span>变卦 · 变用</span><strong>{{ chart.changedUse.name }}{{ chart.changedUse.element }}</strong><em>{{ chart.relations.changed }}</em></div>
              <p class="note-line">动爻所在经卦为用，未动的一卦为体；本卦取当前，互卦看过程，变卦看变化。此处为传统象数解释框架。</p>
            </div>
          </details>
        </div>

        <details class="chart-section-details" :open="!chart">
          <summary><span>起卦方式 · 占问录入</span><strong>{{ method === 'time' ? '年月日时' : '两数取卦' }}</strong></summary>
          <div class="chart-section-body meihua-form">
            <label>占问之事
              <textarea v-model="question" rows="2" :disabled="busy" placeholder="例如：近期的工作安排是否顺利？" @input="invalidate" />
            </label>
            <div class="meihua-methods" role="group" aria-label="起卦方式">
              <button type="button" :class="{ active: method === 'time' }" :disabled="busy" @click="chooseMethod('time')"><Clock3 :size="15" /> 时间起卦</button>
              <button type="button" :class="{ active: method === 'numbers' }" :disabled="busy" @click="chooseMethod('numbers')"><Hash :size="15" /> 数字起卦</button>
            </div>
            <template v-if="method === 'time'">
              <label>占问时间（本地公历）
                <input v-model="dateTime" type="datetime-local" :disabled="busy" @input="invalidate" />
              </label>
              <p class="note-line">自动换算为农历。年取地支序数、月日取农历数字、时取地支序数；闰月按原月份计数。</p>
              <p v-if="chart?.source.lunarText" class="note-line">起卦农历：{{ chart.source.lunarText }}</p>
            </template>
            <template v-else>
              <div class="meihua-number-fields">
                <label>第一数 · 上卦<input v-model.number="firstNumber" type="number" min="1" step="1" :disabled="busy" placeholder="如 17" @input="invalidate" /></label>
                <label>第二数 · 下卦<input v-model.number="secondNumber" type="number" min="1" step="1" :disabled="busy" placeholder="如 28" @input="invalidate" /></label>
              </div>
              <button class="ghost-button meihua-random" type="button" :disabled="busy" @click="randomNumbers"><Sparkles :size="14" /> 随机生成两数</button>
              <p class="note-line">第一数取上卦，第二数取下卦，两数之和取动爻；余数为 0 时按八卦取 8、六爻取 6。</p>
            </template>
          </div>
        </details>

        <details class="chart-section-details" :open="Boolean(records.length && !chart)">
          <summary><span>梅花占问记录</span><strong>{{ records.length }}</strong></summary>
          <div class="chart-section-body">
            <p v-if="!records.length" class="note-line">暂无记录。起卦后自动保存在本机。</p>
            <div v-else class="meihua-record-list">
              <div v-for="item in records" :key="item.id" class="meihua-record-row" :class="{ active: item.id === selectedId }">
                <button class="meihua-record-select" type="button" :disabled="busy" @click="chooseRecord(item)">
                  <strong>{{ item.chart.primary.name }} → {{ item.chart.changed.name }}</strong>
                  <span>{{ item.question || '未命名占问' }} · {{ item.chart.method === 'time' ? item.dateTime.replace('T', ' ') : '数字起卦' }}</span>
                </button>
                <button class="icon-button danger" type="button" title="删除占问记录" aria-label="删除占问记录" :disabled="busy" @click="deleteRecord(item)"><Trash2 :size="15" /></button>
              </div>
            </div>
          </div>
        </details>
      </div>

      <div class="actions-row chart-actions meihua-actions">
        <button class="primary-button" type="button" :disabled="busy" @click="createChart"><Wand2 :size="17" /> {{ chart ? '重新起卦' : '起卦排盘' }}</button>
        <button class="secondary-button" type="button" :disabled="busy || !chart" @click="ask(false)"><MessageCircle :size="17" /> {{ busy ? '解读中…' : '请大师解卦' }}</button>
        <button class="secondary-button chart-copy-button" type="button" :disabled="!chart" title="复制卦盘给 AI" aria-label="复制卦盘给 AI" @click="copyChart"><Copy :size="17" /></button>
      </div>
    </section>

    <section class="panel conversation-panel">
      <div class="panel-title meihua-panel-title">
        <div class="meihua-title"><MessageCircle :size="18" /><h2>梅花解卦</h2></div>
        <span v-if="chart" class="meihua-context">{{ chart.primary.name }} · {{ chart.changed.name }}</span>
      </div>
      <div class="answer-box">
        <template v-if="recentMessages.length">
          <article v-for="(message, index) in recentMessages.slice(0, busy ? recentMessages.length : -1)" :key="index" :class="['chat-message', `chat-${message.role}`]">
            <slot name="markdown" :text="message.content"><p>{{ message.content }}</p></slot>
          </article>
        </template>
        <div v-if="busy || reading" class="markdown-frame reading-document">
          <header class="reading-document-head">
            <img v-if="persona" :src="persona.avatarUrl" :alt="persona.name" />
            <div><span>{{ chart?.primary.name || '梅花易数' }}</span><strong>{{ persona?.name || '梅花解读助手' }}</strong></div>
          </header>
          <slot name="markdown" :text="reading"><p>{{ reading }}</p></slot>
          <span v-if="busy" class="caret markdown-caret"></span>
        </div>
        <div v-if="!busy && !reading" class="empty-state">
          <p>{{ chart ? '卦盘已排好。可请大师结合本卦、互卦、变卦与体用生克解读。' : '请在左栏使用时间或数字起卦。无需模型凭据也可查看完整卦盘。' }}</p>
          <button v-if="chart" class="primary-button meihua-cta" type="button" @click="ask(false)"><Sparkles :size="17" /> 请大师解卦</button>
        </div>
      </div>
      <div class="follow-row" role="group" aria-label="梅花易数追问">
        <input v-model="followUp" type="text" placeholder="继续问卦象细节、体用生克与现实建议…" :disabled="!chart || busy" @keyup.enter="ask(true)" />
        <button class="composer-send" type="button" title="发送追问" aria-label="发送追问" :disabled="!chart || busy || !followUp.trim()" @click="ask(true)"><Send :size="18" /></button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.meihua-panel-title { justify-content: space-between; gap: 8px; }
.meihua-title { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
.meihua-title svg { color: var(--accent); flex-shrink: 0; }
.meihua-reset { flex: 0 0 auto; padding: 0 9px; min-height: 30px; font-size: 12px; }
.meihua-error { margin: 0; padding: 9px 12px; border: 1px solid var(--danger); background: var(--danger-soft); color: var(--danger); border-radius: var(--radius-md); font-size: 12px; }
.meihua-hexagrams { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: var(--radius-md); overflow: hidden; background: var(--surface); }
.meihua-hex-card { min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: center; text-align: center; padding: 12px 5px; border-right: 1px solid var(--line-soft); }
.meihua-hex-card:last-child { border-right: 0; }
.meihua-hex-card.primary { background: var(--accent-soft); box-shadow: inset 0 2px 0 var(--accent); }
.meihua-card-label { font-size: 11px; color: var(--muted); }
.meihua-hex-card strong { font-size: clamp(15px, 1.4vw, 19px); font-family: var(--font-display); color: var(--ink); line-height: 1.4; }
.meihua-hex-card small { color: var(--muted); font-size: 10px; }
.meihua-lines { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; }
.meihua-yao { display: flex; justify-content: center; }
.meihua-yao > span { display: flex; justify-content: space-between; width: 56px; height: 6px; }
.meihua-yao i { display: block; width: 100%; background: var(--ink); border-radius: 2px; }
.meihua-yao .yin i { width: 43%; }
.meihua-yao.moving i { background: var(--accent); }
.meihua-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.meihua-metrics > span { display: flex; flex-direction: column; gap: 4px; padding: 9px 10px; border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--surface-raised); min-width: 0; }
.meihua-metrics small { color: var(--muted); font-size: 11px; }
.meihua-metrics strong { color: var(--ink); font-size: 13px; }
.meihua-relation-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
.meihua-relation-row span { color: var(--muted); flex: 1; }
.meihua-relation-row strong { color: var(--ink); }
.meihua-relation-row em { color: var(--accent); font-style: normal; }
.meihua-form { gap: 10px; }
.meihua-form textarea { min-height: 62px; }
.meihua-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.meihua-methods button { display: flex; justify-content: center; align-items: center; gap: 5px; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); cursor: pointer; }
.meihua-methods button.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.meihua-number-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.meihua-number-fields label { min-width: 0; }
.meihua-random { display: flex; align-items: center; align-self: flex-start; gap: 5px; font-size: 12px; }
.meihua-record-list { display: flex; flex-direction: column; gap: 6px; }
.meihua-record-row { display: grid; grid-template-columns: minmax(0, 1fr) 34px; gap: 6px; align-items: center; }
.meihua-record-select { display: flex; flex-direction: column; gap: 4px; min-width: 0; text-align: left; padding: 9px 10px; border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--surface-raised); cursor: pointer; }
.meihua-record-select strong, .meihua-record-select span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.meihua-record-select strong { color: var(--ink); font-size: 12px; }
.meihua-record-select span { color: var(--muted); font-size: 11px; }
.meihua-record-row.active .meihua-record-select { background: var(--accent-soft); border-color: var(--accent); }
.meihua-context { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meihua-cta { margin-top: 12px; }
@media (max-width: 560px) {
  .meihua-hex-card { padding: 10px 3px; }
  .meihua-hex-card strong { font-size: 15px; }
  .meihua-yao > span { width: 46px; }
  .meihua-context { max-width: 48%; }
}
</style>
