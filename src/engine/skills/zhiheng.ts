// 制衡（孙权）：出牌阶段限一次，可以弃置任意张手牌，然后摸等量的牌。
import type { Card } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const zhiheng: SkillHooks = {
  validateActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'zhiheng'; cardIds?: number[] };
    if (!hasSkill(actor, 'zhiheng')) throw new Error('你没有该技能');
    if (s.usedSkills.includes('zhiheng')) throw new Error('【制衡】每回合限一次');
    if (!a.cardIds || a.cardIds.length === 0) throw new Error('【制衡】至少弃置一张手牌');
    if (new Set(a.cardIds).size !== a.cardIds.length || !a.cardIds.every(id => actor.hand.some(c => c.id === id)))
      throw new Error('弃置的牌不合法');
  },

  applyActive(s, ctx, ops) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'zhiheng'; cardIds?: number[] };
    const ids = new Set(a.cardIds!);
    const kept: Card[] = [];
    for (const c of actor.hand) (ids.has(c.id) ? s.discard : kept).push(c);
    actor.hand = kept;
    s.log.push({ t: 'skill', player: actor.id, sub: 'zhiheng', detail: `弃置 ${a.cardIds!.length} 张，摸 ${a.cardIds!.length} 张` });
    s.log.push({ t: 'discardCards', player: actor.id, n: a.cardIds!.length });
    ops.drawCards(s, actor.id, a.cardIds!.length);
    s.log.push({ t: 'draw', player: actor.id, n: a.cardIds!.length });
  },
};
