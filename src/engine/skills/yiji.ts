// 遗计（郭嘉·M16）：每受到 1 点伤害后摸两张牌，然后逐张分配给任意角色
//（放弃分配即等于自己留着）。牌先入自己手牌，分配由 trigger 后的 yiji 询问逐张进行。
import { CARD_INFO } from '../types';
import type { Card } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const yiji: SkillHooks = {
  /** dealDamage：按伤害点数摸 2×N 张并入自己手牌，再入队分配询问。
   *  牌在此处（而非 trigger 结算时）离堆——次序在刚烈的判定摸牌之前，不可调整。 */
  onDamaged(s, ctx, ops) {
    const target = ctx.player;
    if (!hasSkill(target, 'yiji')) return;
    const want = ctx.amount! * 2;
    const cards: Card[] = [];
    for (let i = 0; i < want; i++) {
      ops.reshuffleIfNeeded(s);
      if (s.deck.length === 0) break;
      cards.push(s.deck.pop()!);
    }
    if (cards.length > 0) {
      target.hand.push(...cards);
      s.log.push({ t: 'skill', player: target.id, sub: 'yiji', detail: `摸 ${cards.length} 张（可分配）` });
      s.log.push({ t: 'draw', player: target.id, n: cards.length });
      ops.queueTrigger(s, { sub: 'yiji', playerId: target.id, cards });
    }
  },

  /** respondTrigger：开出逐张分配询问（全部留给自己 = 直接结束） */
  onTrigger(s, ctx) {
    const p = ctx.player;
    const pool = (ctx.pend!.triggerCards ?? []).filter(c => p.hand.some(x => x.id === c.id));
    if (pool.length > 0) s.pending = { kind: 'yiji', playerId: p.id, yijiPool: pool };
  },

  /** respondYiji：把池中一张牌交给所选角色（null = 自己留着） */
  applyPending(s, ctx, ops) {
    const a = ctx.action as { type: 'respondYiji'; cardId: number; toId: number | null };
    const pend = ctx.pend!;
    const actor = ctx.player;
    const pool = pend.yijiPool!;
    const i = pool.findIndex(c => c.id === a.cardId);
    const [card] = pool.splice(i, 1);
    const to = a.toId == null ? actor : s.players[a.toId]!;
    if (to.id !== actor.id) {
      // 牌已在遗计生效时摸进自己手里，交给别人需先从手牌移出
      ops.removeFromHand(actor, card!.id);
      to.hand.push(card!);
      s.log.push({ t: 'skill', player: actor.id, sub: 'yiji', detail: `将【${CARD_INFO[card!.sub].display}】交给 ${to.name}` });
      s.log.push({ t: 'gainCard', player: to.id, from: actor.id });
    }
    // 池中还有牌就继续问；清空则结束
    if (pool.length > 0) {
      s.pending = { kind: 'yiji', playerId: actor.id, yijiPool: pool };
    }
  },
};
