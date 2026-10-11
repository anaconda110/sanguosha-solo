// 刚烈（夏侯惇）：受到伤害后可以进行判定，若结果非红桃，伤害来源受到 1 点反伤。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const ganglie: SkillHooks = {
  /** dealDamage：存活且来源是别人时开判定链（判定摸牌在遗计摸牌之后，次序见 index） */
  onDamaged(s, ctx, ops) {
    const target = ctx.player;
    const sourceId = ctx.sourceId;
    if (target.hp <= 0 || !hasSkill(target, 'ganglie')) return;
    if (sourceId == null || sourceId === target.id) return;
    ops.beginJudge(s, {
      forId: target.id,
      reason: 'ganglie',
      result: ops.drawJudgeCard(s, target.id, 'ganglie'),
      mode: 'ganglie',
      ganglieSourceId: sourceId,
    });
  },

  /** resolveJudge（mode = ganglie）：非红桃 → 来源受 1 点反伤（来源 = 夏侯惇） */
  onJudgeResolved(s, ctx, ops) {
    const js = ctx.judge!;
    const jc = js.result;
    if (jc.suit !== '♥' && js.ganglieSourceId != null) {
      const src = s.players[js.ganglieSourceId]!;
      if (src.alive) {
        s.log.push({ t: 'skill', player: js.forId, sub: 'ganglie', detail: `${src.name} 受到1点反伤` });
        ops.dealDamage(s, src.id, 1, js.forId);
      }
    }
  },
};
