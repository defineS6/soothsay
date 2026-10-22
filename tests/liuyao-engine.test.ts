import { describe, expect, it } from 'vitest';
import { enrichLiuyao, getXunKong, makeLiuyao, type YaoValue } from '../src/liuyao/engine';

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
  it('旬空按完整六十甲子推算', () => {
    expect(getXunKong('甲子')).toEqual(['戌','亥']);
    expect(getXunKong('甲戌')).toEqual(['申','酉']);
    expect(getXunKong('癸亥')).toEqual(['子','丑']);
    expect(()=>getXunKong('甲丑')).toThrow();
  });
  it('动爻装变卦纳甲，并据日月标空破冲', () => {
    const result=enrichLiuyao(makeLiuyao([9,7,7,7,7,7]),{monthGanZhi:'丙午',dayGanZhi:'甲子'});
    expect(result.lines[0].transformed).toMatchObject({stem:'辛',branch:'丑'});
    expect(result.lines[0].monthBroken).toBe(true);
    expect(result.lines[0].dayClashed).toBe(false);
    expect(result.calendar.xunKong).toEqual(['戌','亥']);
  });
  it('八宫所有卦伏神均取自宫首同位且补全缺失六亲', () => {
    for(let mask=0;mask<64;mask++) {
      const values=Array.from({length:6},(_,i)=>(mask&(1<<i))?7:8) as YaoValue[];
      const result=enrichLiuyao(makeLiuyao(values),{monthGanZhi:'丙寅',dayGanZhi:'甲子'});
      const existing=new Set(result.lines.map(line=>line.relative));
      for(const hidden of result.hidden) {
        expect(existing.has(hidden.relative)).toBe(false);
        expect(hidden.flyingBranch).toBe(result.lines[hidden.index-1].branch);
      }
      expect(new Set([...existing,...result.hidden.map(h=>h.relative)]).size).toBe(5);
    }
  });
  it('拒绝错误爻数', () => {
    expect(()=>makeLiuyao([7,8])).toThrow();
  });
});
