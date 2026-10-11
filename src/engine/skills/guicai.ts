// 鬼才（司马懿）：判定牌生效前，可以打出一张手牌替换之。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const guicai: SkillHooks = {
  /** stepJudge 询问链：有手牌且本判定未询问过（usedGuicai 由框架维护）即可被询问 */
  judgeWantsAsk(s, ctx) {
    const p = ctx.player;
    return hasSkill(p, 'guicai') && p.hand.length > 0;
  },

  /** respondSkillCard：打出的手牌成为新判定牌，旧判定牌进弃牌堆（判定牌在生效时统一处置） */
  replaceJudgeCard(s, ctx) {
    const js = s.judgeState;
    if (!js) return false;
    const p = ctx.player;
    const card = ctx.card!;
    const old = js.result;
    js.result = card;
    s.discard.push(old);
    js.usedGuicai.push(p.id);
    s.log.push({ t: 'judgeModify', player: p.id, sub: 'guicai', card });
    return true;
  },
};
