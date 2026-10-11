// 苦肉（黄盖）：出牌阶段，可以失去 1 点体力，摸两张牌。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const kurou: SkillHooks = {
  validateActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action!;
    if (!hasSkill(actor, 'kurou')) throw new Error('你没有该技能');
    if (actor.hp <= 1) throw new Error('体力不足，不能发动【苦肉】');
  },

  applyActive(s, ctx, ops) {
    const actor = ctx.player;
    // 失去 1 点体力（无来源），摸两张
    ops.hurt(s, actor.id, 1, undefined);
    ops.drawCards(s, actor.id, 2);
    s.log.push({ t: 'draw', player: actor.id, n: 2 });
  },
};
