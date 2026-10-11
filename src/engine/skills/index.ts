// 技能钩子注册表（ADR-0026）：把 step.ts 里的技能分支搬成一技能一模块，
// step.ts 只 import 本文件。静态换算类技能（武圣/龙胆/倾国/国色/奇袭/空城/马术/
// 咆哮/奇才/谦逊 + 急救的红牌换算）保留在 ../queries 原查询层，这里整体再导出，
// 维持 '../engine/skills' 既有导入面（AI / 回归脚本 / 测试不受影响）。
// 主公技求援流程（护驾/激将）、无双、武器/防具效果留在 step.ts 框架层（ADR-0026），
// 在总表里以空钩子占位。
import type { Action, Card, CardSub, GameState, JudgeState, PlayerState, SkillSub } from '../types';
import type { SkillCtx, SkillHooks, SkillOps, SkillPendingKind } from '../skill-runtime';

export * from '../queries';

// —— 技能模块 ——
import { jianxiong } from './jianxiong';
import { fankui } from './fankui';
import { guicai } from './guicai';
import { kurou } from './kurou';
import { xiaoji } from './xiaoji';
import { lijian } from './lijian';
import { biyue } from './biyue';
import { guanxing } from './guanxing';
import { luoshen } from './luoshen';
import { liuli } from './liuli';
import { tieji } from './tieji';
import { ganglie } from './ganglie';
import { zhiheng } from './zhiheng';
import { rende } from './rende';
import { qingnang } from './qingnang';
import { jijiu } from './jijiu';
import { yingzi } from './yingzi';
import { fanjian } from './fanjian';
import { jiuyuan } from './jiuyuan';
import { tuxi } from './tuxi';
import { luoyi } from './luoyi';
import { tiandu } from './tiandu';
import { yiji } from './yiji';
import { jizhi } from './jizhi';
import { keji } from './keji';
import { lianying } from './lianying';
import { jieyin } from './jieyin';

/**
 * 技能钩子总表：key 即 SkillSub（主动技/触发技按 sub 直接分派）。
 * 声明顺序即"多实现钩子点"的遍历次序——其中 preparePhase 必须保持
 * guanxing 先于 luoshen（迁移前 advance 准备阶段的分支顺序）。
 */
export const SKILL_HOOKS: Record<SkillSub, SkillHooks> = {
  // 静态换算类（queries.ts 查询层，无 step 期钩子）与框架层技能（主公技/无双）
  wusheng: {}, paoxiao: {}, longdan: {}, kongcheng: {}, qingguo: {},
  guose: {}, qixi: {}, mashu: {}, qicai: {}, qianxun: {},
  wushuang: {}, hujia: {}, jijiang: {},
  // —— 已迁移技能 ——
  jianxiong, fankui, guicai, kurou, xiaoji, lijian, biyue,
  guanxing, // 准备阶段：观星询问先于洛神触发（次序不可调换）
  luoshen, liuli, tieji, ganglie, zhiheng, rende, qingnang, jijiu, yingzi,
  fanjian, jiuyuan, tuxi, luoyi, tiandu, yiji, jizhi, keji, lianying, jieyin,
};

/**
 * 伤害后触发钩子的调用次序 = 迁移前 dealDamage 里的分支顺序（奸雄→反馈→遗计→刚烈）。
 * 行为保持的关键：遗计的摸牌消耗牌堆必须发生在刚烈的判定摸牌之前，不可调整。
 */
const DAMAGED_ORDER: SkillHooks[] = [SKILL_HOOKS.jianxiong, SKILL_HOOKS.fankui, SKILL_HOOKS.yiji, SKILL_HOOKS.ganglie];

/**
 * 技能自有询问的应答分派：step.ts 按 pending.kind 把 respondXxx 动作
 * 交回所属技能模块（框架只负责 s.pending = null 与校验）。
 */
export const PENDING_HOOKS: Record<SkillPendingKind, (s: GameState, ctx: SkillCtx, ops: SkillOps) => void> = {
  tuxi: (s, ctx, ops) => SKILL_HOOKS.tuxi.applyPending?.(s, ctx, ops),
  yiji: (s, ctx, ops) => SKILL_HOOKS.yiji.applyPending?.(s, ctx, ops),
  guanxing: (s, ctx, ops) => SKILL_HOOKS.guanxing.applyPending?.(s, ctx, ops),
  liuli: (s, ctx, ops) => SKILL_HOOKS.liuli.applyPending?.(s, ctx, ops),
  fanjian: (s, ctx, ops) => SKILL_HOOKS.fanjian.applyPending?.(s, ctx, ops),
};

// —— 聚合分派（step.ts 的唯一钩子入口；签名与迁移前对应函数一致）——

/** advance 摸牌分支：是否存在需要先询问的摸牌阶段抉择（突袭/裸衣） */
export function skillDrawPhaseAsk(s: GameState, cur: PlayerState): boolean {
  for (const h of Object.values(SKILL_HOOKS)) {
    if (h.drawPhaseAsk?.(s, { player: cur })) return true;
  }
  return false;
}

/** respondDraw：按动作里的 skill 名分派到对应模块；无人认领（默认摸牌）返回 false */
export function skillDrawPhaseChoice(
  s: GameState,
  actor: PlayerState,
  a: Action & { type: 'respondDraw' },
  ops: SkillOps,
): boolean {
  if (a.skill == null) return false;
  return SKILL_HOOKS[a.skill].drawPhaseChoice?.(s, { player: actor, action: a }, ops) ?? false;
}

/** shaDamageAmount：杀/决斗伤害加成之和（裸衣经 damageBonus 贡献） */
export function skillModifyShaDamage(s: GameState, sourceId: number): number {
  let bonus = 0;
  for (const h of Object.values(SKILL_HOOKS)) {
    bonus += h.modifyShaDamage?.(s, { player: s.players[sourceId]!, sourceId }) ?? 0;
  }
  return bonus;
}

/** dealDamage：伤害记账后的触发技入队（次序见 DAMAGED_ORDER） */
export function skillOnDamaged(
  s: GameState,
  targetId: number,
  amount: number,
  sourceId: number | undefined,
  cardId: number | undefined,
  ops: SkillOps,
): void {
  const ctx: SkillCtx = { player: s.players[targetId]!, amount, sourceId, cardId };
  for (const h of DAMAGED_ORDER) h.onDamaged?.(s, ctx, ops);
}

/** stepJudge：该玩家是否要被本判定询问；命中则返回询问所用的技能名（鬼才） */
export function skillJudgeAskSub(s: GameState, p: PlayerState, js: JudgeState): SkillSub | null {
  for (const [sub, h] of Object.entries(SKILL_HOOKS) as [SkillSub, SkillHooks][]) {
    if (h.judgeWantsAsk?.(s, { player: p, judge: js })) return sub;
  }
  return null;
}

/** respondSkillCard：打出的牌是否被用于替换判定牌（鬼才）；false = 牌进弃牌堆 */
export function skillReplaceJudgeCard(s: GameState, p: PlayerState, card: Card): boolean {
  for (const h of Object.values(SKILL_HOOKS)) {
    if (h.replaceJudgeCard?.(s, { player: p, card })) return true;
  }
  return false;
}

/** resolveJudge：判定牌生效后的归属（天妒）；返回 true = 判定牌已入手 */
export function skillJudgeCardGain(s: GameState, judger: PlayerState, js: JudgeState): boolean {
  for (const h of Object.values(SKILL_HOOKS)) {
    if (h.judgeCardGain?.(s, { player: judger, judge: js })) return true;
  }
  return false;
}

/** loseEquipTrigger：失去装备区一张牌后的触发（枭姬） */
export function skillOnEquipLost(s: GameState, owner: PlayerState, ops: SkillOps): void {
  for (const h of Object.values(SKILL_HOOKS)) {
    h.onEquipLost?.(s, { player: owner }, ops);
  }
}

/** playTrick：使用非延时锦囊时的触发（集智） */
export function skillOnTrickPlayed(s: GameState, actor: PlayerState, cardSub: CardSub, ops: SkillOps): void {
  for (const h of Object.values(SKILL_HOOKS)) {
    h.onTrickPlayed?.(s, { player: actor, cardSub }, ops);
  }
}

/** checkLianying：失去最后一张手牌的触发（连营） */
export function skillOnLastHandLost(s: GameState, p: PlayerState, prev: GameState, ops: SkillOps): void {
  for (const h of Object.values(SKILL_HOOKS)) {
    h.onLastHandLost?.(s, { player: p }, prev, ops);
  }
}

/** advance 准备阶段：返回 true = 已开出询问，advance 立即停下（观星；洛神入队后继续） */
export function skillPreparePhase(s: GameState, cur: PlayerState, ops: SkillOps): boolean {
  // 遍历次序 = SKILL_HOOKS 声明序：观星在洛神之前（迁移前的分支顺序）
  for (const h of Object.values(SKILL_HOOKS)) {
    if (h.preparePhase?.(s, { player: cur }, ops)) return true;
  }
  return false;
}

/** advance 弃牌阶段：克己等跳过判定（skill 事件由钩子自记） */
export function skillSkipDiscard(s: GameState, cur: PlayerState): boolean {
  for (const h of Object.values(SKILL_HOOKS)) {
    if (h.skipDiscard?.(s, { player: cur })) return true;
  }
  return false;
}

/** endTurn：回合结束触发（闭月） */
export function skillOnTurnEnd(s: GameState, cur: PlayerState, ops: SkillOps): void {
  for (const h of Object.values(SKILL_HOOKS)) {
    h.onTurnEnd?.(s, { player: cur }, ops);
  }
}

/** drawPhaseDefault：摸牌阶段的额外摸牌数之和（英姿） */
export function skillDrawCountBonus(s: GameState, cur: PlayerState): number {
  let bonus = 0;
  for (const h of Object.values(SKILL_HOOKS)) {
    bonus += h.drawCountBonus?.(s, { player: cur }) ?? 0;
  }
  return bonus;
}

/** askNextTao：手牌可充当【桃】的额外资格（急救） */
export function skillCanSaveTao(s: GameState, p: PlayerState): boolean {
  for (const h of Object.values(SKILL_HOOKS)) {
    if (h.canSaveTao?.(s, { player: p })) return true;
  }
  return false;
}

/** respondTao：他人用桃救主公时的额外回复（救援） */
export function skillTaoExtraHeal(s: GameState, dying: PlayerState, saver: PlayerState, ops: SkillOps): void {
  for (const h of Object.values(SKILL_HOOKS)) {
    h.taoExtraHeal?.(s, { player: dying, saver }, ops);
  }
}
