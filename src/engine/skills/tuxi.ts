// 突袭（张辽·M16）：摸牌阶段可放弃摸牌，改为获得至多两名其他角色各一张手牌（手牌随机）。
import { randU32 } from '../rng';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const tuxi: SkillHooks = {
  /** advance 摸牌分支：张辽本回合尚未被询问过摸牌抉择时先问 */
  drawPhaseAsk(s, ctx) {
    return hasSkill(ctx.player, 'tuxi');
  },

  /** respondDraw：放弃摸牌 → 开选目标询问；无目标可选则落回默认摸牌 */
  drawPhaseChoice(s, ctx, ops) {
    const actor = ctx.player;
    const to = ops.othersInOrder(s, actor.id).filter(id => s.players[id]!.hand.length > 0);
    if (to.length === 0) {
      ops.drawPhaseDefault(s, actor);
      return true;
    }
    s.pending = { kind: 'tuxi', playerId: actor.id, tuxiTo: to };
    return true;
  },

  /** respondTuxi：夺取所选角色（至多两名）各一张手牌，随后进出牌阶段 */
  applyPending(s, ctx) {
    const a = ctx.action as { type: 'respondTuxi'; targetIds: number[] };
    const pend = ctx.pend!;
    const actor = ctx.player;
    const ids = a.targetIds.filter(id => pend.tuxiTo?.includes(id)).slice(0, 2);
    for (const tid of ids.slice(0, 2)) {
      const t = s.players[tid]!;
      if (!t.alive || t.hand.length === 0) continue;
      const idx = randU32(s) % t.hand.length;
      const [card] = t.hand.splice(idx, 1);
      actor.hand.push(card!);
      s.log.push({ t: 'skill', player: actor.id, sub: 'tuxi', detail: `获得 ${t.name} 的一张手牌` });
      s.log.push({ t: 'gainCard', player: actor.id, from: tid });
    }
    s.phase = 'play';
  },
};
