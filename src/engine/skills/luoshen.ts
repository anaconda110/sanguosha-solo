// 洛神（甄姬）：准备阶段可以判定，若结果为黑色，获得此判定牌并可以继续判定。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const luoshen: SkillHooks = {
  /** advance 准备阶段：入触发队列（advance 继续流转，队列在 pending 清空后消费） */
  preparePhase(s, ctx, ops) {
    if (!hasSkill(ctx.player, 'luoshen')) return false;
    ops.queueTrigger(s, { sub: 'luoshen', playerId: ctx.player.id });
    return false;
  },

  /** respondTrigger：开判定链 */
  onTrigger(s, ctx, ops) {
    const p = ctx.player;
    ops.beginJudge(s, { forId: p.id, reason: 'luoshen', result: ops.drawJudgeCard(s, p.id, 'luoshen'), mode: 'luoshen' });
  },

  /** resolveJudge（mode = luoshen）：黑色 → 判定牌收入手牌并继续判定；红色 → 终止（判定牌已处置） */
  onJudgeResolved(s, ctx, ops) {
    const js = ctx.judge!;
    const jc = js.result;
    const actor = ctx.player;
    if (jc.suit === '♠' || jc.suit === '♣') {
      const i = s.discard.findIndex(c => c.id === jc.id);
      if (i >= 0) s.discard.splice(i, 1);
      actor.hand.push(jc);
      s.log.push({ t: 'gainCard', player: actor.id, from: actor.id });
      ops.queueTrigger(s, { sub: 'luoshen', playerId: actor.id });
    }
  },
};
