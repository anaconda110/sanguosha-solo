// 铁骑（马超）：使用【杀】指定目标后判定，若结果为红色，此目标不可用【闪】响应
//（每目标判定一次；"发动即记技能事件、结果另见 judge 事件"——ADR-0022 的观测修正）。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const tieji: SkillHooks = {
  /** stepSha：对目标开判定链（返回 true = 杀帧暂停推进，判定链走完重新入帧） */
  onShaTargeted(s, ctx, ops) {
    const source = s.players[ctx.sourceId!]!;
    const target = ctx.player;
    const f = ctx.frame!;
    if (!hasSkill(source, 'tieji') || !source.alive || f.tiejiTried.includes(target.id)) return false;
    f.tiejiTried.push(target.id);
    s.log.push({ t: 'skill', player: source.id, sub: 'tieji', detail: `对 ${target.name} 判定` });
    ops.beginJudge(s, {
      forId: source.id,
      reason: 'tieji',
      result: ops.drawJudgeCard(s, source.id, 'tieji'),
      mode: 'tieji',
      tiejiFrameId: f.id,
      tiejiTargetId: target.id,
    });
    return true;
  },

  /** stepSha 重入：判定成功的目标不可闪避，直接命中并推进帧 */
  modifyShaHit(s, ctx, ops) {
    const source = s.players[ctx.sourceId!]!;
    const target = ctx.player;
    const f = ctx.frame!;
    if (!f.tiejiHit.includes(target.id)) return false;
    s.log.push({ t: 'skill', player: source.id, sub: 'tieji', detail: `${target.name} 不可用【闪】响应` });
    ops.shaHit(s, source.id, target.id, f.cardId);
    f.idx += 1;
    return true;
  },

  /** resolveJudge（mode = tieji）：判定红色 → 目标不可用闪响应（记入杀帧） */
  onJudgeResolved(s, ctx) {
    const js = ctx.judge!;
    const jc = js.result;
    if (jc.suit === '♥' || jc.suit === '♦') {
      const f = s.frames.find(fr => fr.id === js.tiejiFrameId);
      if (f && f.kind === 'sha') f.tiejiHit.push(js.tiejiTargetId!);
    }
  },
};
