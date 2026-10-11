// 青囊（华佗）：出牌阶段限一次，可以弃置一张手牌并选择一名已受伤的角色，
// 其回复 1 点体力（不占出桃次数）。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const qingnang: SkillHooks = {
  validateActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'qingnang'; cardId?: number; targetIds?: number[] };
    if (!hasSkill(actor, 'qingnang')) throw new Error('你没有该技能');
    if (s.usedSkills.includes('qingnang')) throw new Error('【青囊】每回合限一次');
    if (a.cardId == null || !actor.hand.some(c => c.id === a.cardId)) throw new Error('【青囊】需要弃置一张手牌');
    const t = a.targetIds?.[0] == null ? undefined : s.players[a.targetIds[0]];
    if (!t || !t.alive) throw new Error('【青囊】目标不合法');
    if (t.hp >= t.maxHp) throw new Error('【青囊】目标体力已满');
  },

  applyActive(s, ctx, ops) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'qingnang'; cardId?: number; targetIds?: number[] };
    const t = s.players[a.targetIds![0]!]!;
    s.discard.push(ops.removeFromHand(actor, a.cardId!));
    s.log.push({ t: 'skill', player: actor.id, sub: 'qingnang', detail: `${t.name} 回复1点体力` });
    t.hp += 1;
    s.log.push({ t: 'heal', player: t.id, amount: 1 });
  },
};
