// 流离（大乔）：成为【杀】的目标时，可弃一张手牌并把【杀】转移给
// 距离 1 以内的一名其他男性角色（防互转：每目标一次）。
import { GENERAL_SEX } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const liuli: SkillHooks = {
  /** stepSha：满足条件则开出弃牌转移询问（返回 true = 杀帧暂停推进） */
  onShaTargeted(s, ctx, ops) {
    const target = ctx.player;
    const sourceId = ctx.sourceId!;
    const f = ctx.frame!;
    if (!hasSkill(target, 'liuli') || f.liuliDone.includes(target.id) || target.hand.length === 0) {
      return false;
    }
    const to = ops.othersInOrder(s, target.id).filter(
      id =>
        GENERAL_SEX[s.players[id]!.general] === 'm' &&
        id !== sourceId &&
        ops.seatDistance(s, target.id, id) <= 1,
    );
    if (to.length === 0) return false;
    f.liuliDone.push(target.id);
    s.pending = { kind: 'liuli', playerId: target.id, frameId: f.id, liuliTo: to, liuliSourceId: sourceId };
    return true;
  },

  /** respondLiuli：弃一张手牌并把杀转移给所选男性（帧内当前目标直接换人，stepSha 重新推进） */
  applyPending(s, ctx, ops) {
    const a = ctx.action as { type: 'respondLiuli'; cardId: number | null; transferTo?: number };
    const pend = ctx.pend!;
    const actor = ctx.player;
    const f = pend.frameId != null ? s.frames.find(fr => fr.id === pend.frameId) : undefined;
    if (a.cardId != null && f && f.kind === 'sha') {
      s.discard.push(ops.removeFromHand(actor, a.cardId));
      s.log.push({ t: 'skill', player: actor.id, sub: 'liuli', detail: `弃牌，【杀】转移给 ${s.players[a.transferTo!]!.name}` });
      f.targets[f.idx] = a.transferTo!;
    }
  },
};
