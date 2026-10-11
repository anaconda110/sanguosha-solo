// 枭姬（孙尚香）：失去装备区里的一张牌后，摸两张牌。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const xiaoji: SkillHooks = {
  /** loseEquipTrigger（换装备/被夺走/麒麟弓弃坐骑均经此入口；死亡清算不触发） */
  onEquipLost(s, ctx, ops) {
    const owner = ctx.player;
    if (!owner.alive || !hasSkill(owner, 'xiaoji')) return;
    ops.queueTrigger(s, { sub: 'xiaoji', playerId: owner.id });
  },

  /** respondTrigger：摸两张 */
  onTrigger(s, ctx, ops) {
    const p = ctx.player;
    ops.drawCards(s, p.id, 2);
    s.log.push({ t: 'draw', player: p.id, n: 2 });
  },
};
