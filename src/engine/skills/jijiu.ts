// 急救（华佗）：你的回合外，可以将一张红色牌当【桃】使用。
// 红牌换算（isRedCard）是静态查询，留在 queries；这里只接濒死求桃的询问资格。
import { hasSkill, isRedCard } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const jijiu: SkillHooks = {
  /** askNextTao：持有急救且有红色手牌即可被询问求桃 */
  canSaveTao(s, ctx) {
    const p = ctx.player;
    return hasSkill(p, 'jijiu') && p.hand.some(c => isRedCard(c));
  },
};
