// 反馈（司马懿）：受到伤害后，可以获得伤害来源的一张牌。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const fankui: SkillHooks = {
  /** dealDamage：来源存在（非自伤）且有牌时入队 */
  onDamaged(s, ctx, ops) {
    const target = ctx.player;
    const sourceId = ctx.sourceId;
    if (!hasSkill(target, 'fankui')) return;
    if (sourceId == null || sourceId === target.id) return;
    const src = s.players[sourceId]!;
    if (ops.hasAnyCard(src)) ops.queueTrigger(s, { sub: 'fankui', playerId: target.id, sourceId });
  },

  /** respondTrigger：由技能发起选牌询问（可选项唯一时直接结算，不打扰玩家） */
  onTrigger(s, ctx, ops) {
    const p = ctx.player;
    const srcId = ctx.pend!.triggerSourceId;
    if (srcId == null) return;
    ops.askSkillPick(s, p.id, 'fankui', srcId);
  },
};
