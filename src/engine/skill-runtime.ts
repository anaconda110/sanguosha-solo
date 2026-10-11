// 技能钩子运行时接口（ADR-0026）：skills/*.ts 只能 import types 与纯查询（queries.ts），
// step.ts 的内部原语（dealDamage/drawCards/beginJudge/queueTrigger 等）通过 SkillOps
// 注入——技能模块对 step.ts 零依赖，杜绝循环引用。本文件只含类型，无运行时代码。
import type {
  Action,
  Card,
  CardSub,
  GameState,
  Inquiry,
  JudgeState,
  PendingTrigger,
  PlayerState,
  ShaFrame,
  TrickFrame,
} from './types';

/** step.ts 注入给钩子的内部原语（模块级常量，构造一次；全部以 s 为首参的纯推进函数） */
export interface SkillOps {
  /** 伤害入口：记账 + 伤害后触发技（onDamaged 钩子）+ 濒死求桃 */
  dealDamage(s: GameState, targetId: number, amount: number, sourceId?: number, cardId?: number): void;
  /** 失去体力（无来源伤害语义；濒死时同样求桃） */
  hurt(s: GameState, playerId: number, amount: number, sourceId?: number): void;
  /** 摸 n 张（必要时先洗弃牌堆） */
  drawCards(s: GameState, playerId: number, n: number): void;
  /** 弃牌堆耗尽时洗回牌堆 */
  reshuffleIfNeeded(s: GameState): void;
  /** 翻一张判定牌（记 judge 事件） */
  drawJudgeCard(s: GameState, forId: number, reason: JudgeState['reason']): Card;
  /** 开启判定链（翻牌已出 → 鬼才询问 → 生效） */
  beginJudge(s: GameState, st: Omit<JudgeState, 'usedGuicai'> & { usedGuicai?: number[] }): void;
  /** 触发技入队（同技能同玩家去重，cards 累加） */
  queueTrigger(s: GameState, t: PendingTrigger): void;
  /** 摸牌阶段默认结算（英姿加成 → 摸牌 → 进出牌阶段） */
  drawPhaseDefault(s: GameState, cur: PlayerState): void;
  /** 从 userId 起按座次的其他存活角色 */
  othersInOrder(s: GameState, userId: number): number[];
  /** 座次距离（含马术/-1马/+1马 修正） */
  seatDistance(s: GameState, from: number, to: number): number;
  /** 是否有任何牌（手牌或装备区） */
  hasAnyCard(p: PlayerState): boolean;
  /** 由技能发起的选牌询问（反馈：可选项唯一时直接结算） */
  askSkillPick(s: GameState, ownerId: number, sub: 'fankui', targetId: number): void;
  /** 从手牌移除一张牌（不存在则抛错） */
  removeFromHand(p: PlayerState, cardId: number): Card;
  /** 杀命中结算（含麒麟弓弃坐骑） */
  shaHit(s: GameState, sourceId: number, targetId: number, cardId: number): void;
  /** 建锦囊结算帧并入栈（离间视为决斗） */
  makeTrickFrame(s: GameState, userId: number, sub: CardSub, card: Card, targets?: number[]): TrickFrame;
}

/**
 * 钩子调用点的状态句柄：player 恒有值（触发者/应答者/判定者/伤害目标/阶段玩家），
 * 其余字段按各钩子的语义由调用点填充，钩子按需取用。
 */
export interface SkillCtx {
  /** 钩子主体 */
  player: PlayerState;
  /** apply 期：当前询问（框架在分派前已置 s.pending = null） */
  pend?: Inquiry;
  /** apply 期：当前动作 */
  action?: Action;
  /** 伤害上下文：点数 / 来源 / 因果牌 */
  amount?: number;
  sourceId?: number;
  cardId?: number;
  /** 锦囊生效牌名（onTrickPlayed） */
  cardSub?: CardSub;
  /** 判定上下文（judgeWantsAsk/replaceJudgeCard/judgeCardGain/onJudgeResolved） */
  judge?: JudgeState;
  /** respondSkillCard：应答打出的牌（已离手） */
  card?: Card;
  /** 杀帧上下文（onShaTargeted/modifyShaHit；player = 当前目标） */
  frame?: ShaFrame;
  /** 濒死求桃上下文（taoExtraHeal：用桃救人的角色） */
  saver?: PlayerState;
}

/**
 * 技能钩子集：每个武将技能一个模块，按需实现若干切入点。
 * 全部为可选方法；同一钩子点的多个实现之间的调用次序见 skills/index.ts 的注释
 * （次序即迁移前 step.ts 里的分支顺序，行为保持的关键，不可调整）。
 */
export interface SkillHooks {
  // —— 摸牌阶段（突袭/裸衣）——
  /** advance 摸牌分支：本技能是否需要在摸牌阶段发起抉择询问 */
  drawPhaseAsk?(s: GameState, ctx: SkillCtx): boolean;
  /** respondDraw：处理本技能的抉择；返回 true = 已完全结算（含进出牌阶段/开出后续询问） */
  drawPhaseChoice?(s: GameState, ctx: SkillCtx, ops: SkillOps): boolean;
  /** 技能自有询问的应答应用（respondTuxi/respondYiji/respondGuanxing/respondLiuli/respondFanjian） */
  applyPending?(s: GameState, ctx: SkillCtx, ops: SkillOps): void;
  /** 摸牌阶段的额外摸牌数（英姿）；贡献时自行记 skill 事件 */
  drawCountBonus?(s: GameState, ctx: SkillCtx): number;

  // —— 伤害 ——
  /** dealDamage 记账后调用（奸雄/反馈/遗计/刚烈；调用次序敏感，见 index 的 DAMAGED_ORDER） */
  onDamaged?(s: GameState, ctx: SkillCtx, ops: SkillOps): void;
  /** 杀/决斗伤害加成（裸衣经 damageBonus 字段贡献，回合结束由框架清零） */
  modifyShaDamage?(s: GameState, ctx: SkillCtx): number;

  // —— 判定链 ——
  /** 判定询问链：该玩家是否要被询问（鬼才；命中即以该技能名开 skillCard 询问） */
  judgeWantsAsk?(s: GameState, ctx: SkillCtx): boolean;
  /** respondSkillCard：打出的牌替换判定牌；返回 false = 牌进弃牌堆 */
  replaceJudgeCard?(s: GameState, ctx: SkillCtx): boolean;
  /** 判定牌生效后的归属：返回 true = 已收进手牌（天妒），否则框架将其置入弃牌堆 */
  judgeCardGain?(s: GameState, ctx: SkillCtx): boolean;
  /** 判定生效效果（铁骑/刚烈/洛神，各自只在 js.mode 匹配时起作用） */
  onJudgeResolved?(s: GameState, ctx: SkillCtx, ops: SkillOps): void;

  // —— 触发 / 失牌时机 ——
  /** respondTrigger：触发技效果（框架按 pend.sub 分派） */
  onTrigger?(s: GameState, ctx: SkillCtx, ops: SkillOps): void;
  /** 失去装备区一张牌后（枭姬） */
  onEquipLost?(s: GameState, ctx: SkillCtx, ops: SkillOps): void;
  /** 使用非延时锦囊时（集智） */
  onTrickPlayed?(s: GameState, ctx: SkillCtx, ops: SkillOps): void;
  /** 失去最后一张手牌（连营；prev = 动作应用前的状态） */
  onLastHandLost?(s: GameState, ctx: SkillCtx, prev: GameState, ops: SkillOps): void;

  // —— 阶段机 ——
  /** 准备阶段：返回 true = 已开出询问，advance 立即停下（观星）；否则继续（洛神入队） */
  preparePhase?(s: GameState, ctx: SkillCtx, ops: SkillOps): boolean;
  /** 弃牌阶段：返回 true = 跳过弃牌阶段（克己；skill 事件由钩子自记） */
  skipDiscard?(s: GameState, ctx: SkillCtx): boolean;
  /** 回合结束（闭月） */
  onTurnEnd?(s: GameState, ctx: SkillCtx, ops: SkillOps): void;

  // —— 杀的目标 ——
  /** stepSha：成为杀的目标时的询问（流离转移/铁骑判定）；返回 true = 询问已开出，stepSha 立即返回 */
  onShaTargeted?(s: GameState, ctx: SkillCtx, ops: SkillOps): boolean;
  /** stepSha：命中改写（铁骑判定成功后不可闪避）；返回 true = 已结算命中并推进帧 */
  modifyShaHit?(s: GameState, ctx: SkillCtx, ops: SkillOps): boolean;

  // —— 主动技 ——
  /** useSkill 校验（不合法直接抛错） */
  validateActive?(s: GameState, ctx: SkillCtx): void;
  /** useSkill 应用（框架已记 usedSkills 与 skill 事件） */
  applyActive?(s: GameState, ctx: SkillCtx, ops: SkillOps): void;

  // —— 濒死求桃 ——
  /** 手牌可充当【桃】的额外条件（急救：红色牌） */
  canSaveTao?(s: GameState, ctx: SkillCtx): boolean;
  /** respondTao：他人用桃救主公时的额外回复（救援） */
  taoExtraHeal?(s: GameState, ctx: SkillCtx, ops: SkillOps): void;
}

/** 技能自有询问的 pending.kind：step.ts 按它把 respondXxx 动作分派回所属技能模块 */
export type SkillPendingKind = 'tuxi' | 'yiji' | 'guanxing' | 'liuli' | 'fanjian';
