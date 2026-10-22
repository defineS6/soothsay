import { describe, expect, it } from 'vitest';
import { makeLiuyao, type YaoValue } from '../src/liuyao/engine';

describe('六爻基础纳甲', () => {
  it('64 卦均有确定宫位、完整六爻和卦名', () => {
    const names = new Set<string>();
    for (let mask=0;mask<64;mask++) {
      const values=Array.from({length:6},(_,i)=>(mask&(1<<i))?7:8) as YaoValue[];
      const chart=makeLiuyao(values);
      expect(chart.lines).toHaveLength(6);
      expect(chart.primary).not.toMatch(/^[乾兑离震巽坎艮坤]{2}$/);
      names.add(chart.primary);
      expect(chart.lines.filter(line=>line.shi)).toHaveLength(1);
      expect(chart.lines.filter(line=>line.ying)).toHaveLength(1);
    }
    expect(names.size).toBe(64);
  });
  it('乾为天：乾宫本宫，世上应三，纳甲甲子至壬戌', () => {
    const chart=makeLiuyao([7,7,7,7,7,7]);
    expect(chart.primary).toBe('乾为天');
    expect(chart.palace).toBe('乾');
    expect(chart.palaceStage).toBe('本宫');
    expect(chart.lines.map(line=>line.stem+line.branch)).toEqual(['甲子','甲寅','甲辰','壬午','壬申','壬戌']);
    expect(chart.lines[5].shi).toBe(true);
    expect(chart.lines[2].ying).toBe(true);
  });
  it('老阴老阳动爻形成正确变卦', () => {
    const chart=makeLiuyao([9,7,7,7,7,7]);
    expect(chart.transformed).toBe('天风姤');
    expect(chart.lines[0].moving).toBe(true);
  });
  it('拒绝错误爻数', () => {
    expect(()=>makeLiuyao([7,8])).toThrow();
  });
});
