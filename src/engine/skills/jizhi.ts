// 集智（黄月英·M16）：使用非延时锦囊时摸一张牌（延时锦囊与无懈不算）。
import type { CardSub } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

const DELAYED: CardSub[] = ['lebusi', 'bingliang', 'shandian'];

export const jizhi: SkillHooks = {
  /** playTrick：以生效牌名（asSub）判定，转换锦囊（国色/奇袭）同样结算 */
  onTrickPlayed(s, ctx, ops) {
    const actor = ctx.player;
    if (!hasSkill(actor, 'jizhi')) return;
    const sub = ctx.cardSub!;
    if (DELAYED.includes(sub) || sub === 'wuxie') return;
    ops.drawCards(s, actor.id, 1);
    s.log.push({ t: 'skill', player: actor.id, sub: 'jizhi' });
    s.log.push({ t: 'draw', player: actor.id, n: 1 });
  },
};
