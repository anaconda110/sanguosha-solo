// 天妒（郭嘉·M16）：判定牌生效后可以获得之——直接收进手牌，不再进弃牌堆。
// 对所有判定 mode 生效（八卦/铁骑/刚烈/洛神/延时锦囊），次序在 mode 分派之前。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const tiandu: SkillHooks = {
  /** resolveJudge：返回 true 表示判定牌已收进判定者手牌；false 时框架将其置入弃牌堆 */
  judgeCardGain(s, ctx) {
    const judger = ctx.player;
    if (!hasSkill(judger, 'tiandu')) return false;
    judger.hand.push(ctx.judge!.result);
    s.log.push({ t: 'skill', player: judger.id, sub: 'tiandu', detail: '获得判定牌' });
    s.log.push({ t: 'gainCard', player: judger.id, from: judger.id });
    return true;
  },
};
