// 交互解释层（纯函数）：组件只消费“能不能做 / 为什么不能”，不在模板里重复规则。
import { CARD_INFO, type Card, type CardSub, type GameEvent, type GeneralSub, type Inquiry } from '../engine/types';

export type ActiveSelectionMode = 'zhiheng' | 'rende' | 'qingnang' | 'fanjian' | 'jieyin' | null;

export interface CardActionContext {
  pending: Inquiry | null;
  selectedSub: CardSub | null;
  hasSecondCard: boolean;
  zhangbaOn: boolean;
  canSha: boolean;
  hp: number;
  maxHp: number;
  activeMode: ActiveSelectionMode;
  activeSelectionCount: number;
  activeSelectionIncludes: boolean;
  discardSelectionIds: number[];
  discardCount: number;
  guanshiSelectionIds: number[];
  general: GeneralSub;
  isRed: boolean;
  altShaCardId?: number;
  lijianMode: boolean;
  lijianCardSelected: boolean;
}

/** 返回 null 表示可操作；返回文本表示当前不可操作的原因。 */
export function cardActionReason(card: Card, ctx: CardActionContext): string | null {
  const p = ctx.pending;
  if (!p) return '当前没有可响应的询问';

  if (p.kind === 'play') {
    if (ctx.lijianMode) {
      return ctx.lijianCardSelected ? '离间手牌已选，请选择两名男性目标' : null;
    }
    if (ctx.activeMode) {
      if (ctx.activeMode !== 'jieyin') return null;
      return ctx.activeSelectionIncludes || ctx.activeSelectionCount < 2 ? null : '结姻最多选择两张手牌';
    }
    if (ctx.selectedSub === 'sha' && ctx.zhangbaOn && ctx.canSha && !ctx.hasSecondCard) {
      return null; // 第一张杀素材已选，任意另一张牌可组成丈八杀。
    }
    if (card.sub === 'tao') {
      return ctx.hp < ctx.maxHp ? null : '体力已满，不能使用【桃】';
    }
    if (CARD_INFO[card.sub].kind === 'equip') return null;
    if (card.sub === 'wuzhong' || card.sub === 'nanman' || card.sub === 'wanjian' ||
        card.sub === 'taoyuan' || card.sub === 'shandian' || card.sub === 'wugu') return null;
    if (card.sub === 'sha') return ctx.canSha ? null : '本回合已使用过【杀】';
    if (card.sub !== 'wuxie' && ctx.altShaCardId === card.id && ctx.canSha) return null;
    if (card.sub === 'guohe' || card.sub === 'shunshou' || card.sub === 'juedou' ||
        card.sub === 'lebusi' || card.sub === 'bingliang' || card.sub === 'jiedao') return null;
    if (ctx.general === 'dajiao' && card.suit === '♦' && CARD_INFO[card.sub].kind !== 'trick') return null;
    if (ctx.general === 'ganning' && !ctx.isRed && CARD_INFO[card.sub].kind !== 'trick') return null;
    if (ctx.zhangbaOn && ctx.canSha) return null;
    if (card.sub === 'wuxie') return '只能在需要【无懈可击】时使用';
    if (card.sub === 'shan') return '只能在需要【闪】时使用';
    return '当前不能使用这张牌';
  }

  if (p.kind === 'discard') {
    return ctx.discardSelectionIds.includes(card.id) || ctx.discardSelectionIds.length < ctx.discardCount
      ? null
      : `已经选够 ${ctx.discardCount} 张牌`;
  }
  if (p.kind === 'skillCard' || p.kind === 'liuli') return null;
  if (p.kind === 'guanshi') {
    return ctx.guanshiSelectionIds.includes(card.id) || ctx.guanshiSelectionIds.length < 2
      ? null
      : '贯石斧最多选择两张手牌';
  }
  if (p.kind === 'respondShan') {
    if (card.sub === 'shan') return null;
    if (ctx.general === 'zhaoyun' && card.sub === 'sha') return null;
    if (ctx.general === 'zhenji' && !ctx.isRed) return null;
    return '需要打出【闪】（或通过技能转换）';
  }
  if (p.kind === 'respondSha' || p.kind === 'shaAgain' || p.kind === 'jiedao') {
    if (card.sub === 'sha') return null;
    if (ctx.general === 'zhaoyun' && card.sub === 'shan') return null;
    if (ctx.general === 'guanyu' && ctx.isRed) {
      return card.sub !== 'tao' || ctx.hp >= ctx.maxHp ? null : '体力已满，【桃】不能当【杀】';
    }
    return '需要打出【杀】（或通过技能转换）';
  }
  if (p.kind === 'respondWuxie') return card.sub === 'wuxie' ? null : '需要打出【无懈可击】';
  if (p.kind === 'respondTao') {
    if (card.sub === 'tao') return null;
    if (ctx.general === 'huatuo' && ctx.isRed) return null;
    return '需要打出【桃】（或通过急救转换）';
  }
  return '当前询问不能使用手牌';
}

export type LogFilter = 'all' | 'damage' | 'skill' | 'judge' | 'key';

const KEY_EVENT_TYPES: ReadonlySet<GameEvent['t']> = new Set([
  'damage', 'heal', 'dying', 'death', 'rewardDraw', 'penaltyDiscard', 'negate',
  'judge', 'judgeModify', 'moveJudgement', 'skill', 'ability', 'gameOver',
]);

export function isKeyEvent(event: GameEvent): boolean {
  return KEY_EVENT_TYPES.has(event.t);
}

export function matchesLogFilter(event: GameEvent, filter: LogFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'key') return isKeyEvent(event);
  if (filter === 'damage') return event.t === 'damage' || event.t === 'heal' || event.t === 'dying' || event.t === 'death';
  if (filter === 'skill') return event.t === 'skill' || event.t === 'ability';
  return event.t === 'judge' || event.t === 'judgeModify' || event.t === 'moveJudgement';
}

/** AI 公开动向：只看已经出现在战报里的公开事件，不推断隐藏手牌或内部权重。 */
export function isPublicActionEvent(event: GameEvent): boolean {
  return event.t === 'playCard' || event.t === 'respond' || event.t === 'skill' ||
    event.t === 'ability' || event.t === 'damage' || event.t === 'death';
}
