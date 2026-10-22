export type YaoValue = 6 | 7 | 8 | 9;
type Element = '木' | '火' | '土' | '金' | '水';
type Trigram = { name: string; bits: number[]; element: Element; innerStem: string; outerStem: string; innerBranches: string[]; outerBranches: string[] };
const TRIGRAMS: Trigram[] = [
  { name: '乾', bits: [1,1,1], element: '金', innerStem: '甲', outerStem: '壬', innerBranches: ['子','寅','辰'], outerBranches: ['午','申','戌'] },
  { name: '兑', bits: [1,1,0], element: '金', innerStem: '丁', outerStem: '丁', innerBranches: ['巳','卯','丑'], outerBranches: ['亥','酉','未'] },
  { name: '离', bits: [1,0,1], element: '火', innerStem: '己', outerStem: '己', innerBranches: ['卯','丑','亥'], outerBranches: ['酉','未','巳'] },
  { name: '震', bits: [1,0,0], element: '木', innerStem: '庚', outerStem: '庚', innerBranches: ['子','寅','辰'], outerBranches: ['午','申','戌'] },
  { name: '巽', bits: [0,1,1], element: '木', innerStem: '辛', outerStem: '辛', innerBranches: ['丑','亥','酉'], outerBranches: ['未','巳','卯'] },
  { name: '坎', bits: [0,1,0], element: '水', innerStem: '戊', outerStem: '戊', innerBranches: ['寅','辰','午'], outerBranches: ['申','戌','子'] },
  { name: '艮', bits: [0,0,1], element: '土', innerStem: '丙', outerStem: '丙', innerBranches: ['辰','午','申'], outerBranches: ['戌','子','寅'] },
  { name: '坤', bits: [0,0,0], element: '土', innerStem: '乙', outerStem: '癸', innerBranches: ['未','巳','卯'], outerBranches: ['丑','亥','酉'] }
];
const BRANCH_ELEMENTS: Record<string, Element> = { 子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水' };
const PRODUCES: Record<Element, Element> = { 木:'火',火:'土',土:'金',金:'水',水:'木' };
const CONTROLS: Record<Element, Element> = { 木:'土',土:'水',水:'火',火:'金',金:'木' };
const SPIRITS = ['青龙','朱雀','勾陈','螣蛇','白虎','玄武'];
const PALACE_LABELS = ['本宫','一世','二世','三世','四世','五世','游魂','归魂'];
const HEXAGRAM_NAMES: Record<string,string> = {
  '乾乾':'乾为天','坤坤':'坤为地','坎震':'水雷屯','艮坎':'山水蒙','坎乾':'水天需','乾坎':'天水讼','坤坎':'地水师','坎坤':'水地比',
  '巽乾':'风天小畜','乾兑':'天泽履','坤乾':'地天泰','乾坤':'天地否','乾离':'天火同人','离乾':'火天大有','坤艮':'地山谦','震坤':'雷地豫',
  '兑震':'泽雷随','艮巽':'山风蛊','坤兑':'地泽临','巽坤':'风地观','离震':'火雷噬嗑','艮离':'山火贲','艮坤':'山地剥','坤震':'地雷复',
  '乾震':'天雷无妄','艮乾':'山天大畜','艮震':'山雷颐','兑巽':'泽风大过','坎坎':'坎为水','离离':'离为火','兑艮':'泽山咸','震巽':'雷风恒',
  '乾艮':'天山遁','震乾':'雷天大壮','离坤':'火地晋','坤离':'地火明夷','巽离':'风火家人','离兑':'火泽睽','坎艮':'水山蹇','震坎':'雷水解',
  '艮兑':'山泽损','巽震':'风雷益','兑乾':'泽天夬','乾巽':'天风姤','兑坤':'泽地萃','坤巽':'地风升','兑坎':'泽水困','坎巽':'水风井',
  '兑离':'泽火革','离巽':'火风鼎','震震':'震为雷','艮艮':'艮为山','巽艮':'风山渐','震兑':'雷泽归妹','震离':'雷火丰','离艮':'火山旅',
  '巽巽':'巽为风','兑兑':'兑为泽','巽坎':'风水涣','坎兑':'水泽节','巽兑':'风泽中孚','震艮':'雷山小过','坎离':'水火既济','离坎':'火水未济'
};
function sameBits(a: number[], b: number[]): boolean { return a.every((v,i)=>v===b[i]); }
function trigram(bits: number[]): Trigram {
  const found = TRIGRAMS.find(item=>sameBits(item.bits,bits));
  if (!found) throw new Error('无效三爻');
  return found;
}
function relatives(palace: Element, branch: Element): string {
  if (palace === branch) return '兄弟';
  if (PRODUCES[palace] === branch) return '子孙';
  if (PRODUCES[branch] === palace) return '父母';
  if (CONTROLS[palace] === branch) return '妻财';
  return '官鬼';
}
function identifyPalace(bits: number[]) {
  for (const root of TRIGRAMS) {
    const base = [...root.bits,...root.bits];
    const masks = [[],[0],[0,1],[0,1,2],[0,1,2,3],[0,1,2,3,4],[0,1,2,4],[4]];
    for (let i=0;i<masks.length;i++) {
      const altered=base.map((v,j)=>masks[i].includes(j)?1-v:v);
      if (sameBits(altered,bits)) return { palace:root, index:i, shi:[5,0,1,2,3,4,3,2][i] };
    }
  }
  throw new Error('无法确定八宫');
}
function gua(bits: number[]) {
  const inner=trigram(bits.slice(0,3));
  const outer=trigram(bits.slice(3,6));
  return { inner, outer, name: HEXAGRAM_NAMES[outer.name+inner.name] ?? outer.name+inner.name };
}
export function makeLiuyao(values: YaoValue[], dayStem = '甲') {
  if (values.length!==6 || values.some(v=>![6,7,8,9].includes(v))) throw new Error('请提供初爻到上爻共六爻（6、7、8、9）');
  const bits=values.map(v=>v%2);
  const changed=values.map(v=>v===6?1:v===9?0:v%2);
  const primary=gua(bits);
  const transformed=gua(changed);
  const group=identifyPalace(bits);
  const start=dayStem==='甲'||dayStem==='乙'?0:dayStem==='丙'||dayStem==='丁'?1:dayStem==='戊'?2:dayStem==='己'?3:dayStem==='庚'||dayStem==='辛'?4:5;
  const lines=values.map((value,index)=>{
    const layer=index<3?primary.inner:primary.outer;
    const localIndex=index%3;
    const stem=index<3?layer.innerStem:layer.outerStem;
    const branch=(index<3?layer.innerBranches:layer.outerBranches)[localIndex];
    const element=BRANCH_ELEMENTS[branch];
    return { index:index+1,value,yang:value%2===1,moving:value===6||value===9,stem,branch,element,relative:relatives(group.palace.element,element),spirit:SPIRITS[(start+index)%6],shi:index===group.shi,ying:index===(group.shi+3)%6 };
  });
  return { ruleVersion:'jingfang-najia-v1',values:[...values],primary:primary.name,transformed:transformed.name,palace:group.palace.name,palaceElement:group.palace.element,palaceStage:PALACE_LABELS[group.index],lines };
}
export type LiuyaoChart = ReturnType<typeof makeLiuyao>;
