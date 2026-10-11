// 仁德（刘备）：出牌阶段限一次，可以将任意张手牌交给一名其他角色，
// 若给出的牌数不少于两张，回复 1 点体力。
import type { Card } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const rende: SkillHooks = {
  validateActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'rende'; cardIds?: number[]; targetIds?: number[] };
    if (!hasSkill(actor, 'rende')) throw new Error('你没有该技能');
    if (s.usedSkills.includes('rende')) throw new Error('【仁德】每回合限一次');
    if (!a.cardIds || a.cardIds.length === 0) throw new Error('【仁德】至少给出一张手牌');
    if (new Set(a.cardIds).size !== a.cardIds.length || !a.cardIds.every(id => actor.hand.some(c => c.id === id)))
      throw new Error('给出的牌不合法');
    const t = a.targetIds?.[0] == null ? undefined : s.players[a.targetIds[0]];
    if (!t || !t.alive || t.id === actor.id) throw new Error('【仁德】目标不合法');
  },

  applyActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'rende'; cardIds?: number[]; targetIds?: number[] };
    const t = s.players[a.targetIds![0]!]!;
    const ids = new Set(a.cardIds!);
    const kept: Card[] = [];
    for (const c of actor.hand) (ids.has(c.id) ? t.hand : kept).push(c);
    actor.hand = kept;
    s.log.push({ t: 'skill', player: actor.id, sub: 'rende', detail: `将 ${a.cardIds!.length} 张手牌交给 ${t.name}` });
    if (a.cardIds!.length >= 2 && actor.hp < actor.maxHp) {
      actor.hp += 1;
      s.log.push({ t: 'heal', player: actor.id, amount: 1 });
    }
  },
};
