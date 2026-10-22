<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Solar } from 'lunar-javascript';
import type { PersonaSkin, PersonaEngine } from '@server-shared/persona';
import type { LocalCredentials } from '@/storage/types';
import { streamFortuneReading } from '@/services/proxy';
import { makeLiuyao, enrichLiuyao, type ProfessionalLiuyaoChart, type YaoValue } from './engine';

const props = defineProps<{ persona?: PersonaSkin; engine?: PersonaEngine; credentials: LocalCredentials; mobileTab?: 'home' | 'chart' | 'reading' | 'mine' }>();
interface CaseRecord { id: string; question: string; dateTime: string; values: YaoValue[]; chart: ProfessionalLiuyaoChart; reading: string; }
const STORAGE_KEY = 'soothsay.liuyao.cases.v1';
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
const options: Array<{ value: YaoValue; label: string }> = [
  {value:6,label:'老阴 6 ×'}, {value:7,label:'少阳 7'}, {value:8,label:'少阴 8'}, {value:9,label:'老阳 9 ○'}
];
const currentCase = computed(() => records.value.find(item=>item.id===selectedId.value));
const displayLines = computed(()=>chart.value?[...chart.value.lines].reverse():[]);
function save() { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(records.value)); } catch { error.value='本地存储空间不足，案例未保存'; } }
onMounted(()=>{
  const now=new Date();
  const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);
  dateTime.value=local.toISOString().slice(0,16);
  try { const items=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); if(Array.isArray(items)) records.value=items; } catch { /* ignore damaged local cache */ }
});
function add(value: YaoValue) { if(values.value.length<6) { values.value=[...values.value,value]; chart.value=null; } }
function toss() {
  const coins: number[]=Array.from({length:3},()=>Math.random()<0.5?2:3);
  add(coins.reduce((a,b)=>a+b,0) as YaoValue);
}
function clear() { values.value=[]; chart.value=null; selectedId.value=''; reading.value=''; history.value=[]; error.value=''; }
function getCalendar(at = dateTime.value) {
  const date=new Date(at);
  if(!at || Number.isNaN(date.valueOf())) throw new Error('请选择有效的占问时间');
  const lunar=Solar.fromYmdHms(date.getFullYear(),date.getMonth()+1,date.getDate(),date.getHours(),date.getMinutes(),0).getLunar();
  return { dayGanZhi: String(lunar.getDayInGanZhiExact()), monthGanZhi: String(lunar.getMonthInGanZhiExact()) };
}
function generate() {
  try {
    if(values.value.length!==6) throw new Error('请从初爻开始完成六次起卦');
    const calendar=getCalendar();
    chart.value=enrichLiuyao(makeLiuyao(values.value,calendar.dayGanZhi[0]),calendar);
    const duplicate=currentCase.value;
    if (duplicate && duplicate.question===question.value.trim() && duplicate.dateTime===dateTime.value && duplicate.values.every((value,index)=>value===values.value[index])) {
      error.value='当前卦已保存，无需重复排盘';
      return;
    }
    const item: CaseRecord={ id:crypto.randomUUID(),question:question.value.trim(),dateTime:dateTime.value,values:[...values.value],chart:chart.value,reading:'' };
    records.value=[item,...records.value].slice(0,100);
    selectedId.value=item.id;
    reading.value='';
    history.value=[];
    save();
    error.value='';
  } catch(e) { error.value=e instanceof Error?e.message:'排盘失败'; }
}
function deleteCase(item: CaseRecord) {
  if (!window.confirm(`删除占问记录「${item.question || item.chart.primary}」？`)) return;
  records.value=records.value.filter(record=>record.id!==item.id);
  if(selectedId.value===item.id) clear();
  save();
}
function selectCase(item: CaseRecord) {
  selectedId.value=item.id;question.value=item.question;dateTime.value=item.dateTime;
  values.value=[...item.values];chart.value=('calendar' in item.chart)?item.chart:enrichLiuyao(makeLiuyao(item.values,getCalendar(item.dateTime).dayGanZhi[0]),getCalendar(item.dateTime));reading.value=item.reading;
  history.value=item.reading?[{role:'user',content:item.question||'请解读本卦'},{role:'assistant',content:item.reading}]:[];
}
async function ask(follow=false) {
  if(!chart.value || busy.value) return;
  if(!props.credentials.baseUrl||!props.credentials.apiKey||!props.credentials.model) { error.value='请先在设置页配置模型凭据';return; }
  const query=follow?followUp.value.trim():(question.value.trim()||'请解读此六爻卦');
  if(!query) return;
  const facts=JSON.stringify({ruleVersion:chart.value.ruleVersion,占问时间:dateTime.value,占问问题:question.value,卦象:chart.value},null,2);
  const system=[
    `你是${props.persona?.name||'六爻解读助手'}。 ${props.engine?.worldview||''}`,
    ...(props.engine?.promptRules||[]),
    props.persona?.customPrompt||'',
    '任务：依据京房纳甲盘，以传统六爻方法做结构化解释。区分程序已算出的事实、传统术数解释与现实行动建议。只引用结构化盘面给出的月建、旬空、伏神、变爻纳甲；未计算的依据请明确说明。',
    '不把传统占卜当成有科学验证的预测，也不得用于替代医疗、法律和投资专业判断。',
    `【已计算的盘面事实】\n${facts}`
  ].filter(Boolean).join('\n');
  const messages=[{role:'system' as const,content:system},...history.value.slice(-8),{role:'user' as const,content:query}];
  busy.value=true;error.value='';reading.value='';
  try {
    const answer=await streamFortuneReading({credentials:props.credentials,messages,onDelta:chunk=>reading.value+=chunk});
    history.value=[...history.value,{role:'user',content:query},{role:'assistant',content:answer}];
    followUp.value='';
    const item=currentCase.value;
    if(item) {item.reading=answer;save();}
  } catch(e) {error.value=e instanceof Error?e.message:'解读失败';}
  finally {busy.value=false;}
}
</script>

<template>
  <section class="liuyao-panel" :class="`liuyao-view-${mobileTab || 'chart'}`">
    <header v-if="mobileTab !== 'mine'" class="liuyao-heading"><div><h2>六爻纳甲</h2><p>三枚铜钱 · 京房八宫 · 本地起盘</p></div><button class="secondary-button" type="button" @click="clear">新起一卦</button></header>
    <div class="liuyao-layout">
      <div class="liuyao-card liuyao-input-card">
        <label>占问之事<textarea v-model="question" rows="2" placeholder="例如：近期的合作是否顺利？" /></label>
        <label>占问时间（本地时间）<input v-model="dateTime" type="datetime-local" /></label>
        <div class="liuyao-heading"><strong>铜钱起卦</strong><small>从初爻至上爻，已完成 {{ values.length }}/6</small></div>
        <div class="liuyao-controls liuyao-primary-actions">
          <button class="primary-button" type="button" :disabled="values.length>=6" @click="toss">摇一次铜钱</button>
          <button class="primary-button" type="button" :disabled="values.length!==6" @click="generate">排六爻盘</button>
          <button class="secondary-button" type="button" :disabled="!values.length" @click="values=values.slice(0,-1);chart=null">撤销末爻</button>
        </div>
        <div class="liuyao-toss-list"><span v-for="(value,index) in values" :key="index">{{ index+1 }}爻：{{ options.find(item=>item.value===value)?.label }}</span></div>
        <div class="liuyao-manual"><small>或手动录入一爻（从初爻开始）</small><div><button v-for="item in options" :key="item.value" type="button" class="secondary-button" :disabled="values.length>=6" @click="add(item.value)">{{ item.label }}</button></div></div>
        <p v-if="error" class="liuyao-error" role="alert">{{ error }}</p>
      </div>
      <div class="liuyao-card liuyao-result-card">
        <template v-if="chart">
          <h3>{{ chart.primary }} <span>→</span> {{ chart.transformed }}</h3>
          <p>{{ chart.palace }}宫 · {{ chart.palaceElement }} · {{ chart.palaceStage }}</p>
          <p>月建 {{ chart.calendar.monthGanZhi }} · 日辰 {{ chart.calendar.dayGanZhi }} · 旬空 {{ chart.calendar.xunKong.join('') }}</p>
          <div class="liuyao-lines">
            <div v-for="line in displayLines" :key="line.index" class="liuyao-line">
              <small>{{ line.spirit }}</small><strong>{{ line.relative }}</strong><span>{{ line.stem }}{{ line.branch }}{{ line.element }}</span>
              <b>{{ line.yang?'━━━':'━ ━' }}{{ line.moving?(line.yang?' ○':' ×'):'' }}</b>
              <em>{{ line.shi?'世':line.ying?'应':'' }}</em>
              <small v-if="line.transformed">化 {{ line.transformed.relative }} {{ line.transformed.stem }}{{ line.transformed.branch }}</small>
              <small v-if="line.void || line.monthBroken || line.dayClashed">{{ [line.void?'旬空':'',line.monthBroken?'月破':'',line.dayClashed?'日冲':''].filter(Boolean).join(' · ') }}</small>
            </div>
          </div>
          <div v-if="chart.hidden.length" class="liuyao-toss-list"><strong>伏神 / 飞神</strong><span v-for="item in chart.hidden" :key="item.relative">{{ item.relative }} {{ item.stem }}{{ item.branch }} 伏于第{{ item.index }}爻（飞神 {{ item.flyingBranch }}）</span></div>
          <small>规则版本 {{ chart.ruleVersion }}。月建按节气月，空亡按日旬；旺衰及用神取舍仍由解读层给出。</small>

        </template>
        <p v-else>完成六次起卦后，可以在这里查看本卦、变卦与装卦结果。</p>
      </div>
    </div>
    <section class="liuyao-card liuyao-reading-card">
      <h3>AI 大师解读</h3>
      <p v-if="chart">{{ chart.primary }} · {{ question || '未命名占问' }}</p>
      <p v-else>请先在排盘页起卦。</p>
      <div v-if="chart" class="liuyao-controls"><button class="primary-button" type="button" :disabled="busy" @click="ask(false)">{{ busy?'解读中…':'请大师解卦' }}</button></div>
      <p v-if="reading" class="liuyao-reading">{{ reading }}</p>
      <div v-if="chart && history.length" class="liuyao-follow"><input v-model="followUp" placeholder="继续追问本卦…" @keyup.enter="ask(true)" /><button class="secondary-button" type="button" :disabled="busy||!followUp.trim()" @click="ask(true)">追问</button></div>
    </section>
    <section class="liuyao-card liuyao-history-card"><h3>六爻占问案例（{{ records.length }}）</h3>
      <p v-if="!records.length">暂无占问记录。</p>
      <div class="liuyao-records"><div v-for="item in records" :key="item.id" class="liuyao-record-row"><button class="secondary-button" type="button" @click="selectCase(item)">{{ item.chart.primary }} · {{ item.question||'未命名占问' }} · {{ item.dateTime.replace('T',' ') }}</button><button class="secondary-button" type="button" @click="deleteCase(item)">删除</button></div></div>
    </section>
  </section>
</template>

<style scoped>
.liuyao-panel{width:min(1120px,100%);margin:24px auto;display:grid;gap:16px;color:var(--ink)}
.liuyao-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.liuyao-heading h2{margin:0}.liuyao-heading p,.liuyao-card p,.liuyao-card small{color:var(--muted)}
.liuyao-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px}
.liuyao-card{background:var(--surface);border:1px solid var(--line);padding:20px;border-radius:var(--radius-lg,14px);display:grid;gap:16px;align-content:start;min-width:0}
.liuyao-card label{display:grid;gap:8px}.liuyao-card textarea,.liuyao-card input{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface-raised);color:var(--ink)}
.liuyao-controls,.liuyao-manual>div{display:flex;gap:8px;flex-wrap:wrap}.liuyao-primary-actions{position:sticky;top:12px;z-index:2;background:var(--surface);padding:8px 0}.liuyao-primary-actions .primary-button,.liuyao-primary-actions .secondary-button{flex:1 1 auto}.liuyao-toss-list,.liuyao-records{display:grid;gap:8px}
.liuyao-toss-list span{padding:6px 10px;background:var(--surface-raised);border-radius:6px}
.liuyao-manual{display:grid;gap:8px}.liuyao-manual button{font-size:12px}
.liuyao-lines{display:grid;gap:9px}.liuyao-line{display:grid;grid-template-columns:38px 44px 1fr 105px 22px minmax(100px,1fr) minmax(80px,1fr);gap:6px;align-items:center;padding:9px 6px;border-bottom:1px solid var(--line-soft)}
.liuyao-line b{font-family:serif;white-space:nowrap}.liuyao-line em{font-style:normal;color:var(--accent)}
.liuyao-reading{white-space:pre-wrap;line-height:1.8}.liuyao-follow{display:flex;gap:8px}.liuyao-error{color:#b42318!important}
.liuyao-records button{text-align:left}.liuyao-record-row{display:flex;gap:8px;min-width:0}.liuyao-record-row button:first-child{flex:1;min-width:0;overflow-wrap:anywhere}.liuyao-reading-card{min-width:0}
@media(max-width:760px){.liuyao-layout{grid-template-columns:1fr}.liuyao-panel{padding:0 4px 16px;max-width:100%;margin:8px auto}.liuyao-card{padding:14px}.liuyao-line{grid-template-columns:30px 38px minmax(0,1fr) 70px 16px;font-size:12px;gap:3px}.liuyao-line small:nth-last-child(-n+2){grid-column:3/-1}.liuyao-line b{font-size:11px}.liuyao-heading{flex-wrap:wrap}.liuyao-card textarea,.liuyao-card input{min-width:0}.liuyao-primary-actions{top:0}.liuyao-primary-actions button{min-width:0}}
@media(min-width:901px){.liuyao-reading-card{grid-column:1/-1}.liuyao-history-card{display:none}}
@media(max-width:900px){.liuyao-panel{width:100%;max-width:100%;margin:0;overflow-y:auto;min-height:0;padding-bottom:100px}.liuyao-layout{grid-template-columns:1fr}.liuyao-view-chart .liuyao-reading-card,.liuyao-view-chart .liuyao-history-card{display:none}.liuyao-view-reading .liuyao-layout,.liuyao-view-reading .liuyao-history-card{display:none}.liuyao-view-mine .liuyao-layout,.liuyao-view-mine .liuyao-reading-card{display:none}.liuyao-view-mine{padding-top:12px}.liuyao-view-reading .liuyao-reading-card{min-height:50vh}}
</style>
