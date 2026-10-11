// 裸衣（许褚·M16）：摸牌阶段可少摸一张，本回合【杀】/【决斗】造成的伤害 +1。
// 加成经 GameState.damageBonus 承载（状态字段保留），回合结束由 endTurn 清零。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const luoyi: SkillHooks = {
  /** advance 摸牌分支：许褚本回合尚未被询问过摸牌抉择时先问 */
  drawPhaseAsk(s, ctx) {
    return hasSkill(ctx.player, 'luoyi');
  },

  /** respondDraw：少摸一张（默认 2 → 1），伤害加成 +1，进出牌阶段 */
  drawPhaseChoice(s, ctx, ops) {
    const actor = ctx.player;
    s.log.push({ t: 'skill', player: actor.id, sub: 'luoyi' });
    ops.drawCards(s, actor.id, 1);
    s.log.push({ t: 'draw', player: actor.id, n: 1 });
    s.damageBonus += 1;
    s.phase = 'play';
    return true;
  },

  /** shaDamageAmount：本回合裸衣已发动则杀/决斗伤害 +1 */
  modifyShaDamage(s) {
    return s.damageBonus;
  },
};
