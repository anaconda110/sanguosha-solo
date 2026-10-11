// 克己（吕蒙·锁定）：若本回合未使用或打出过【杀】，跳过弃牌阶段。
// shaUsed 在 playSha 与 respondSha（打出杀应答）两处置位（ADR-0022）。
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const keji: SkillHooks = {
  /** advance 弃牌阶段：返回 true = 跳过（skill 事件由本钩子自记，位置与迁移前一致） */
  skipDiscard(s, ctx) {
    const cur = ctx.player;
    if (!hasSkill(cur, 'keji') || s.shaUsed) return false;
    s.log.push({ t: 'skill', player: cur.id, sub: 'keji' });
    return true;
  },
};
