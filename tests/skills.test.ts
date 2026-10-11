// skills.ts：用牌转换类技能的静态查询（ADR-0010）。
// 武将-技能映射取自 types.ts 的 GENERAL_SKILLS：
//   关羽=武圣, 赵云=龙胆, 甄姬=倾国, 大乔=国色, 甘宁=奇袭, 诸葛亮=空城, 白板=无技能
import { describe, expect, it } from 'vitest';
import { canActAsSha, canActAsShan, hasSkill, isKongcheng, trickAsSub } from '../src/engine/skills';
import { makeCard, makePlayer } from './helpers';

const baiban = makePlayer(0, 'baiban', 'fan'); // 无技能
const guanyu = makePlayer(1, 'guanyu', 'zhong'); // 武圣：红牌当杀
const zhaoyun = makePlayer(2, 'zhaoyun', 'fan'); // 龙胆：杀/闪互换
const zhenji = makePlayer(3, 'zhenji', 'fan'); // 倾国：黑色手牌当闪
const dajiao = makePlayer(4, 'dajiao', 'zhong'); // 国色：方块当乐不思蜀
const ganning = makePlayer(5, 'ganning', 'fan'); // 奇袭：黑牌当过河拆桥

describe('hasSkill', () => {
  it('按 GENERAL_SKILLS 查询，命中与不命中', () => {
    expect(hasSkill(guanyu, 'wusheng')).toBe(true);
    expect(hasSkill(guanyu, 'longdan')).toBe(false);
    expect(hasSkill(baiban, 'wusheng')).toBe(false);
  });
});

describe('canActAsSha', () => {
  it('真杀对任何武将都可用（无技能白板也算素材）', () => {
    expect(canActAsSha(baiban, makeCard('sha', '♠'))).toBe(true);
    expect(canActAsSha(guanyu, makeCard('sha', '♦'))).toBe(true);
  });

  it('武圣：红色牌（♥/♦）可当杀，与牌名无关', () => {
    expect(canActAsSha(guanyu, makeCard('wuzhong', '♥'))).toBe(true);
    expect(canActAsSha(guanyu, makeCard('shan', '♦'))).toBe(true);
  });

  it('武圣：黑色牌（♠/♣）不可当杀', () => {
    expect(canActAsSha(guanyu, makeCard('wuzhong', '♠'))).toBe(false);
    expect(canActAsSha(guanyu, makeCard('tao', '♣'))).toBe(false);
  });

  it('龙胆：闪可当杀；桃等其他牌不可', () => {
    expect(canActAsSha(zhaoyun, makeCard('shan', '♦'))).toBe(true);
    expect(canActAsSha(zhaoyun, makeCard('tao', '♥'))).toBe(false);
    expect(canActAsSha(zhaoyun, makeCard('wuzhong', '♠'))).toBe(false);
  });
});

describe('canActAsShan', () => {
  it('真闪对任何武将可打出', () => {
    expect(canActAsShan(baiban, makeCard('shan', '♦'))).toBe(true);
  });

  it('龙胆：杀可当闪', () => {
    expect(canActAsShan(zhaoyun, makeCard('sha', '♠'))).toBe(true);
  });

  it('倾国：黑色牌可当闪；红色牌不可（桃必为红，不会被误收）', () => {
    expect(canActAsShan(zhenji, makeCard('sha', '♣'))).toBe(true);
    expect(canActAsShan(zhenji, makeCard('wuzhong', '♠'))).toBe(true);
    expect(canActAsShan(zhenji, makeCard('tao', '♥'))).toBe(false);
    expect(canActAsShan(zhenji, makeCard('shan', '♦'))).toBe(true); // 真闪分支优先
  });
});

describe('trickAsSub 锦囊转换', () => {
  it('国色：方块当乐不思蜀；非方块不转换', () => {
    expect(trickAsSub(dajiao, makeCard('shan', '♦'))).toBe('lebusi');
    expect(trickAsSub(dajiao, makeCard('sha', '♠'))).toBeNull();
  });

  it('奇袭：黑牌当过河拆桥；红牌不转换', () => {
    expect(trickAsSub(ganning, makeCard('sha', '♠'))).toBe('guohe');
    expect(trickAsSub(ganning, makeCard('tao', '♥'))).toBeNull();
    expect(trickAsSub(ganning, makeCard('shan', '♦'))).toBeNull(); // 国色才管方块
  });

  it('无转换技能时返回 null（含天然锦囊牌名不在此层转换）', () => {
    expect(trickAsSub(baiban, makeCard('wuzhong', '♦'))).toBeNull();
    expect(trickAsSub(zhaoyun, makeCard('sha', '♦'))).toBeNull();
  });
});

describe('isKongcheng 空城', () => {
  it('诸葛亮无手牌时触发；有手牌或非诸葛亮不触发', () => {
    const kongcheng = makePlayer(6, 'zhugeliang', 'zhong', []);
    expect(isKongcheng(kongcheng)).toBe(true);
    expect(isKongcheng(makePlayer(6, 'zhugeliang', 'zhong', [makeCard('sha', '♠')]))).toBe(false);
    expect(isKongcheng(makePlayer(0, 'baiban', 'fan', []))).toBe(false);
  });
});
