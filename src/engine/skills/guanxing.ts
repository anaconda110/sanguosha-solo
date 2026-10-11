// 观星（诸葛亮）：准备阶段观看牌堆顶的 X 张牌（X = 存活角色数，至多 5），
// 将其中任意牌置于牌堆顶，其余置于牌堆底。
import type { Card } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const guanxing: SkillHooks = {
  /** advance 准备阶段：翻牌并开出询问（返回 true = advance 立即停下） */
  preparePhase(s, ctx) {
    const cur = ctx.player;
    if (!hasSkill(cur, 'guanxing') || s.deck.length === 0) return false;
    const x = Math.min(s.players.filter(p => p.alive).length, s.deck.length, 5);
    const cards: Card[] = [];
    for (let i = 0; i < x; i++) cards.push(s.deck.pop()!);
    s.pending = { kind: 'guanxing', playerId: cur.id, guanxingCards: cards };
    return true;
  },

  /** respondGuanxing：topIds[0] 最先被摸到 → 逆序压回牌堆顶；其余按原顺序置底 */
  applyPending(s, ctx) {
    const a = ctx.action as { type: 'respondGuanxing'; topIds: number[] };
    const shown = ctx.pend!.guanxingCards ?? [];
    const byId = new Map(shown.map(c => [c.id, c]));
    const topSet = new Set(a.topIds);
    const rest = shown.filter(c => !topSet.has(c.id));
    s.deck.unshift(...rest);
    for (let i = a.topIds.length - 1; i >= 0; i--) s.deck.push(byId.get(a.topIds[i]!)!);
    s.log.push({
      t: 'skill',
      player: ctx.player.id,
      sub: 'guanxing',
      detail: `观星 ${shown.length} 张：${a.topIds.length} 张置顶`,
    });
  },
};
