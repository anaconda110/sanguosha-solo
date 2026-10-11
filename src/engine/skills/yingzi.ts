// 英姿（周瑜·锁定）：摸牌阶段多摸一张牌。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const yingzi: SkillHooks = {
  /** drawPhaseDefault：贡献额外摸牌数；skill 事件自记（先于摸牌，次序与迁移前一致） */
  drawCountBonus(s, ctx) {
    const cur = ctx.player;
    if (!hasSkill(cur, 'yingzi')) return 0;
    s.log.push({ t: 'skill', player: cur.id, sub: 'yingzi' });
    return 1;
  },
};
