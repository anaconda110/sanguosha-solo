// 奸雄（曹操）：受到伤害后，可以获得造成伤害的牌。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const jianxiong: SkillHooks = {
  /** dealDamage：把因果牌记入触发队列（结算时从弃牌堆取走） */
  onDamaged(s, ctx, ops) {
    const target = ctx.player;
    const cardId = ctx.cardId;
    if (!hasSkill(target, 'jianxiong') || cardId == null) return;
    const card = s.discard.find(c => c.id === cardId);
    if (card) ops.queueTrigger(s, { sub: 'jianxiong', playerId: target.id, cards: [card] });
  },

  /** respondTrigger：从弃牌堆收回造成伤害的牌 */
  onTrigger(s, ctx) {
    const p = ctx.player;
    for (const c of ctx.pend!.triggerCards ?? []) {
      const i = s.discard.findIndex(x => x.id === c.id);
      if (i >= 0) {
        const [card] = s.discard.splice(i, 1);
        p.hand.push(card!);
      }
    }
  },
};
