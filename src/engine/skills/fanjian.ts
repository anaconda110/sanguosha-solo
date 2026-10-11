// 反间（周瑜）：出牌阶段限一次，令一名其他角色选择一种花色，然后展示一张手牌并交给其；
// 若其选择的花色与展示的牌不同，其受到 1 点伤害。
import { CARD_INFO } from '../types';
import type { Suit } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const fanjian: SkillHooks = {
  validateActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'fanjian'; cardId?: number; targetIds?: number[] };
    if (!hasSkill(actor, 'fanjian')) throw new Error('你没有该技能');
    if (s.usedSkills.includes('fanjian')) throw new Error('【反间】每回合限一次');
    const c = actor.hand.find(x => x.id === a.cardId);
    if (!c) throw new Error('【反间】需要展示一张手牌');
    const t = a.targetIds?.[0] == null ? undefined : s.players[a.targetIds[0]];
    if (!t || !t.alive || t.id === actor.id) throw new Error('【反间】目标不合法');
  },

  /** useSkill：开出猜花色询问（由目标应答；展示牌对猜测者隐藏，见 view） */
  applyActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'fanjian'; cardId?: number; targetIds?: number[] };
    const t = s.players[a.targetIds![0]!]!;
    s.log.push({ t: 'skill', player: actor.id, sub: 'fanjian', detail: `令 ${t.name} 猜一种花色` });
    s.pending = { kind: 'fanjian', playerId: t.id, fanjian: { sourceId: actor.id, cardId: a.cardId! } };
  },

  /** respondFanjian：展示手牌交给目标；猜错花色则受 1 点伤害（周瑜造成） */
  applyPending(s, ctx, ops) {
    const a = ctx.action as { type: 'respondFanjian'; suit: Suit };
    const fj = ctx.pend!.fanjian!;
    const source = s.players[fj.sourceId]!;
    const actor = ctx.player;
    const card = ops.removeFromHand(source, fj.cardId);
    actor.hand.push(card);
    s.log.push({ t: 'skill', player: source.id, sub: 'fanjian', detail: `展示【${CARD_INFO[card.sub].display}】交给 ${actor.name}` });
    s.log.push({ t: 'gainCard', player: actor.id, from: source.id });
    if (a.suit === card.suit) {
      s.log.push({ t: 'skill', player: source.id, sub: 'fanjian', detail: `${actor.name} 猜中花色，未受伤` });
    } else {
      ops.dealDamage(s, actor.id, 1, source.id);
    }
  },
};
