// 武将技判定（ADR-0010）：引擎与 AI 共用的技能静态查询。
// 用牌转换类（武圣/龙胆/倾国/国色/奇袭）以 canActAs* / trickAsSub 形式暴露；
// 触发/主动/锁定技由 step.ts 消费。
import { GENERAL_SKILLS } from './types';
import type { Card, CardSub, PlayerState, SkillSub } from './types';

export function hasSkill(p: PlayerState, sub: SkillSub): boolean {
  return GENERAL_SKILLS[p.general].includes(sub);
}

export const isRedCard = (c: Card) => c.suit === '♥' || c.suit === '♦';
export const isBlackCard = (c: Card) => c.suit === '♠' || c.suit === '♣';

/** 可作为【杀】使用/打出的牌：真杀；武圣红牌；龙胆闪 */
export function canActAsSha(p: PlayerState, c: Card): boolean {
  if (c.sub === 'sha') return true;
  if (hasSkill(p, 'wusheng') && isRedCard(c)) return true;
  if (hasSkill(p, 'longdan') && c.sub === 'shan') return true;
  return false;
}

/** 可作为【闪】打出：真闪；龙胆杀；倾国黑色手牌（桃必为红色，不会被倾国误收） */
export function canActAsShan(p: PlayerState, c: Card): boolean {
  if (c.sub === 'shan') return true;
  if (hasSkill(p, 'longdan') && c.sub === 'sha') return true;
  if (hasSkill(p, 'qingguo') && isBlackCard(c)) return true;
  return false;
}

/** 手牌中是否有杀素材 */
export function hasShaMaterial(p: PlayerState): boolean {
  return p.hand.some(c => canActAsSha(p, c));
}

/** 空城（诸葛亮·锁定）：无手牌时不能成为【杀】/【决斗】的目标 */
export function isKongcheng(p: PlayerState): boolean {
  return hasSkill(p, 'kongcheng') && p.hand.length === 0;
}

/** 锦囊转换（M8）：国色方块当乐不思蜀、奇袭黑牌当过河拆桥；非转换返回 null */
export function trickAsSub(p: PlayerState, c: Card): CardSub | null {
  if (hasSkill(p, 'guose') && c.suit === '♦') return 'lebusi';
  if (hasSkill(p, 'qixi') && isBlackCard(c)) return 'guohe';
  return null;
}

/** 这张牌作为锦囊使用时的生效牌名：天然锦囊按原牌名（转换技不覆盖天然锦囊）；
 *  非锦囊牌走转换技，仍不可用则返回 null */
export function asTrickSub(p: PlayerState, c: Card): CardSub | null {
  if (CARD_KIND_TRICK(c)) return c.sub;
  return trickAsSub(p, c);
}

const CARD_KIND_TRICK = (c: Card) => TRICK_SUBS.has(c.sub);
const TRICK_SUBS = new Set<CardSub>([
  'wuzhong', 'guohe', 'shunshou', 'juedou', 'nanman', 'wanjian', 'taoyuan', 'wuxie', 'lebusi', 'bingliang', 'shandian',
]);
