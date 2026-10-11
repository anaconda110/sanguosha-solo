// 离间（貂蝉）：出牌阶段限一次，可以弃置一张手牌并指定两名男性角色，
// 视为前者对后者使用一张【决斗】。
import { GENERAL_SEX } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const lijian: SkillHooks = {
  validateActive(s, ctx) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'lijian'; cardId?: number; targetIds?: number[] };
    if (!hasSkill(actor, 'lijian')) throw new Error('你没有该技能');
    if (s.usedSkills.includes('lijian')) throw new Error('【离间】每回合限一次');
    const c = actor.hand.find(x => x.id === a.cardId);
    if (!c) throw new Error('【离间】需要弃置一张手牌');
    if (!a.targetIds || a.targetIds.length !== 2 || a.targetIds[0] === a.targetIds[1])
      throw new Error('【离间】需要两名不同的男性角色');
    for (const tid of a.targetIds) {
      const t = s.players[tid];
      if (!t || !t.alive || t.id === actor.id) throw new Error('【离间】目标不合法');
      if (GENERAL_SEX[t.general] !== 'm') throw new Error('【离间】目标必须是男性');
    }
  },

  applyActive(s, ctx, ops) {
    const actor = ctx.player;
    const a = ctx.action as { type: 'useSkill'; sub: 'lijian'; cardId?: number; targetIds?: number[] };
    // 被弃的手牌即决斗帧的因果牌，入弃牌堆；可被无懈可击抵消
    const card = ops.removeFromHand(actor, a.cardId!);
    s.discard.push(card);
    const [userId, targetId] = a.targetIds!;
    s.frames.push(ops.makeTrickFrame(s, userId, 'juedou', card, [targetId]));
  },
};
