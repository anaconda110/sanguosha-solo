// 牌面内容数据（M23 内容数据化）：从 engine/types.ts 原样迁出，值逐字节不变。
// 引擎经 engine/types.ts 的 re-export 消费，不得直接 import 本目录。
import type { CardInfo, CardSub } from '../engine/types';

export const CARD_INFO: Record<CardSub, CardInfo> = {
  sha: { kind: 'basic', display: '杀', desc: '对攻击范围内一名角色造成 1 点伤害；每回合限一次（连弩/咆哮除外）' },
  shan: { kind: 'basic', display: '闪', desc: '抵消一次【杀】或【万箭齐发】；只能在响应时打出' },
  tao: { kind: 'basic', display: '桃', desc: '回复 1 点体力；仅自己回合或有人濒死时可用' },
  wuzhong: { kind: 'trick', display: '无中生有', desc: '摸两张牌' },
  guohe: { kind: 'trick', display: '过河拆桥', desc: '弃置一名角色区域里的一张牌' },
  shunshou: { kind: 'trick', display: '顺手牵羊', desc: '获得距离 1 以内一名角色的一张牌' },
  juedou: { kind: 'trick', display: '决斗', desc: '与目标轮流打出【杀】，未出者受 1 点伤害' },
  nanman: { kind: 'trick', display: '南蛮入侵', desc: '其他所有角色需打出【杀】，否则受 1 点伤害' },
  wanjian: { kind: 'trick', display: '万箭齐发', desc: '其他所有角色需打出【闪】，否则受 1 点伤害' },
  taoyuan: { kind: 'trick', display: '桃园结义', desc: '所有存活角色各回复 1 点体力' },
  wuxie: { kind: 'trick', display: '无懈可击', desc: '抵消一张锦囊对一名目标的效果；可被反无懈' },
  wugu: { kind: 'trick', display: '五谷丰登', desc: '亮出等同人数的牌，每名角色依次选一张' },
  jiedao: { kind: 'trick', display: '借刀杀人', desc: '令装备武器者对指定目标出【杀】，否则武器归你' },
  lebusi: { kind: 'trick', display: '乐不思蜀', desc: '延时：目标判定阶段判定，非红桃则跳过出牌阶段' },
  bingliang: { kind: 'trick', display: '兵粮寸断', desc: '延时：目标判定阶段判定，草花则跳过摸牌阶段' },
  shandian: { kind: 'trick', display: '闪电', desc: '延时：判定 ♠2-9 受 3 点伤害，否则移给下家' },
  liannu: { kind: 'equip', display: '诸葛连弩', range: 1, desc: '武器·射程1：出【杀】不限次数' },
  qinggang: { kind: 'equip', display: '青釭剑', range: 2, desc: '武器·射程2：你的【杀】无视目标防具' },
  cixiong: { kind: 'equip', display: '雌雄双股剑', range: 2, desc: '武器·射程2：对异性目标，其弃 1 手牌或你摸 1 张' },
  qinglong: { kind: 'equip', display: '青龙偃月刀', range: 3, desc: '武器·射程3：【杀】被闪后可立即再杀' },
  zhangba: { kind: 'equip', display: '丈八蛇矛', range: 3, desc: '武器·射程3：两张手牌可当【杀】使用或打出' },
  guanshi: { kind: 'equip', display: '贯石斧', range: 3, desc: '武器·射程3：【杀】被闪后可弃 2 张牌强制命中' },
  fangtian: { kind: 'equip', display: '方天画戟', range: 4, desc: '武器·射程4：【杀】为最后手牌时可指定至多 3 个目标' },
  qilin: { kind: 'equip', display: '麒麟弓', range: 5, desc: '武器·射程5：【杀】命中后弃置目标一匹坐骑' },
  bagua: { kind: 'equip', display: '八卦阵', desc: '防具：需【闪】时可判定，红色视为打出【闪】' },
  jia1ma: { kind: 'equip', display: '+1马', desc: '其他角色计算到你的距离 +1' },
  jian1ma: { kind: 'equip', display: '-1马', desc: '你计算到其他角色的距离 -1' },
};

/** 天然锦囊牌名（queries 判定牌类别用；自 engine/queries.ts 原样迁出） */
export const TRICK_SUBS = new Set<CardSub>([
  'wuzhong', 'guohe', 'shunshou', 'juedou', 'nanman', 'wanjian', 'taoyuan', 'wuxie',
  'wugu', 'jiedao',
  'lebusi', 'bingliang', 'shandian',
]);
