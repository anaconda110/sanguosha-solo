// 连营（陆逊·M16）：失去最后一张手牌后可摸一张。
// 手牌离开的路径太多（出牌/应答/弃置/被夺），逐个插钩子必然漏——框架在 step() 首尾
// 各比对一次"动作前有牌、动作后无牌"的持有者（checkLianying），这里只负责发动。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const lianying: SkillHooks = {
  /** checkLianying：动作前有牌、动作后无牌且仍存活时入队（queueTrigger 按技能去重） */
  onLastHandLost(s, ctx, prev, ops) {
    const p = ctx.player;
    if (!p.alive || !hasSkill(p, 'lianying')) return;
    const before = prev.players[p.id]!.hand.length;
    if (before > 0 && p.hand.length === 0) {
      ops.queueTrigger(s, { sub: 'lianying', playerId: p.id });
    }
  },

  /** respondTrigger：摸一张 */
  onTrigger(s, ctx, ops) {
    const p = ctx.player;
    ops.drawCards(s, p.id, 1);
    s.log.push({ t: 'draw', player: p.id, n: 1 });
  },
};
