// 武将内容数据（M23 内容数据化）：从 engine/types.ts 原样迁出，值逐字节不变。
// GENERAL_INFO 仍由 GENERAL_SKILLS × SKILL_INFO 派生（键序随之不变）。
import type { Faction, GeneralSub, Sex, SkillSub } from '../engine/types';
import { SKILL_INFO } from './skills';

/** 性别（雌雄双股剑 / 离间依赖） */
export const GENERAL_SEX: Record<GeneralSub, Sex> = {
  baiban: 'm', guanyu: 'm', zhangfei: 'm', zhaoyun: 'm',
  caocao: 'm', simayi: 'm', huanggai: 'm', zhouyu: 'm', lvbu: 'm',
  sunshangxiang: 'f', diaochan: 'f',
  zhugeliang: 'm', zhenji: 'f',
  dajiao: 'f', ganning: 'm',
  machao: 'm', sunquan: 'm', xiahoudun: 'm', liubei: 'm', huatuo: 'm',
  zhangliao: 'm', xuchu: 'm', guojia: 'm', huangyueying: 'f', lvmeng: 'm', luxun: 'm',
};

/** 势力（主公技依赖）：魏/蜀/吴/群 */
export const FACTION_NAMES: Record<Faction, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };
export const GENERAL_FACTION: Record<GeneralSub, Faction> = {
  baiban: 'qun',
  caocao: 'wei', simayi: 'wei', xiahoudun: 'wei', zhangliao: 'wei', xuchu: 'wei', guojia: 'wei',
  liubei: 'shu', guanyu: 'shu', zhangfei: 'shu', zhaoyun: 'shu', zhugeliang: 'shu', machao: 'shu', huangyueying: 'shu',
  sunquan: 'wu', zhouyu: 'wu', huanggai: 'wu', sunshangxiang: 'wu', dajiao: 'wu', ganning: 'wu', lvmeng: 'wu', luxun: 'wu',
  diaochan: 'qun', lvbu: 'qun', zhenji: 'qun', huatuo: 'qun',
};

export const GENERAL_SKILLS: Record<GeneralSub, SkillSub[]> = {
  baiban: [],
  guanyu: ['wusheng'],
  zhangfei: ['paoxiao'],
  zhaoyun: ['longdan'],
  caocao: ['jianxiong', 'hujia'],
  simayi: ['guicai', 'fankui'],
  huanggai: ['kurou'],
  zhouyu: ['yingzi', 'fanjian'],
  lvbu: ['wushuang'],
  sunshangxiang: ['xiaoji', 'jieyin'],
  diaochan: ['lijian', 'biyue'],
  zhugeliang: ['guanxing', 'kongcheng'],
  zhenji: ['luoshen', 'qingguo'],
  dajiao: ['guose', 'liuli'],
  ganning: ['qixi'],
  machao: ['mashu', 'tieji'],
  sunquan: ['zhiheng', 'jiuyuan'],
  xiahoudun: ['ganglie'],
  liubei: ['rende', 'jijiang'],
  huatuo: ['qingnang', 'jijiu'],
  zhangliao: ['tuxi'],
  xuchu: ['luoyi'],
  guojia: ['tiandu', 'yiji'],
  huangyueying: ['jizhi', 'qicai'],
  lvmeng: ['keji'],
  luxun: ['qianxun', 'lianying'],
};

export const GENERAL_INFO: Record<GeneralSub, { display: string; skill: string }> = Object.fromEntries(
  (Object.keys(GENERAL_SKILLS) as GeneralSub[]).map(g => [
    g,
    {
      display: {
        baiban: '白板', guanyu: '关羽', zhangfei: '张飞', zhaoyun: '赵云',
        caocao: '曹操', simayi: '司马懿', huanggai: '黄盖', zhouyu: '周瑜', lvbu: '吕布',
        sunshangxiang: '孙尚香', diaochan: '貂蝉',
        zhugeliang: '诸葛亮', zhenji: '甄姬',
        dajiao: '大乔', ganning: '甘宁',
        machao: '马超', sunquan: '孙权', xiahoudun: '夏侯惇', liubei: '刘备', huatuo: '华佗',
        zhangliao: '张辽', xuchu: '许褚', guojia: '郭嘉', huangyueying: '黄月英', lvmeng: '吕蒙', luxun: '陆逊',
      }[g],
      skill: GENERAL_SKILLS[g].map(s => SKILL_INFO[s].display).join('·'),
    },
  ]),
) as Record<GeneralSub, { display: string; skill: string }>;
