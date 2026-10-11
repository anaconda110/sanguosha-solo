// 闭月（貂蝉）：结束阶段摸一张牌（自动发动；死亡玩家不摸）。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const biyue: SkillHooks = {
  /** endTurn：回合收尾时摸一张（先于阶段复位，次序与迁移前一致） */
  onTurnEnd(s, ctx, ops) {
    const cur = ctx.player;
    if (!cur.alive || !hasSkill(cur, 'biyue')) return;
    ops.drawCards(s, cur.id, 1);
    s.log.push({ t: 'skill', player: cur.id, sub: 'biyue' });
    s.log.push({ t: 'draw', player: cur.id, n: 1 });
  },
};
