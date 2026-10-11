// 结姻（孙尚香·M16）：出牌阶段限一次，可以弃置两张手牌并选择一名已受伤的男性角色，
// 双方各回复 1 点体力。
import { GENERAL_SEX } from '../types';
import type { Card } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const jieyin: SkillHooks = {
  validateActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'jieyin'; cardIds?: number[]; targetIds?: number[] };
    if (!hasSkill(actor, 'jieyin')) throw new Error('你没有该技能');
    if (s.usedSkills.includes('jieyin')) throw new Error('【结姻】每回合限一次');
    if (!a.cardIds || a.cardIds.length !== 2) throw new Error('【结姻】需要弃置两张手牌');
    if (new Set(a.cardIds).size !== 2 || !a.cardIds.every(id => actor.hand.some(c => c.id === id)))
      throw new Error('【结姻】弃置的牌不合法');
    const t = a.targetIds?.[0] == null ? undefined : s.players[a.targetIds[0]];
    if (!t || !t.alive || t.id === actor.id) throw new Error('【结姻】目标不合法');
    if (GENERAL_SEX[t.general] !== 'm') throw new Error('【结姻】目标必须是男性');
    if (t.hp >= t.maxHp) throw new Error('【结姻】目标体力已满');
  },

  applyActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'jieyin'; cardIds?: number[]; targetIds?: number[] };
    // 弃两张手牌，双方各回复 1 点（自己满血时也照样回，取上限）
    const t = s.players[a.targetIds![0]!]!;
    const ids = new Set(a.cardIds!);
    const kept: Card[] = [];
    for (const c of actor.hand) (ids.has(c.id) ? s.discard : kept).push(c);
    actor.hand = kept;
    s.log.push({ t: 'discardCards', player: actor.id, n: 2 });
    s.log.push({ t: 'skill', player: actor.id, sub: 'jieyin', detail: `与 ${t.name} 各回复1点体力` });
    actor.hp = Math.min(actor.maxHp, actor.hp + 1);
    t.hp = Math.min(t.maxHp, t.hp + 1);
    s.log.push({ t: 'heal', player: actor.id, amount: 1 });
    s.log.push({ t: 'heal', player: t.id, amount: 1 });
  },
};
