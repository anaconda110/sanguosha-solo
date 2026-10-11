// 救援（孙权·主公技）：其他吴势力角色对主公使用【桃】时，主公额外回复 1 点体力。
// 换算依赖（势力表）在 types；主公技的求援流程本身留在框架层（ADR-0026）。
import { GENERAL_FACTION } from '../types';
import { hasSkill } from '../queries';
import type { SkillHooks } from '../skill-runtime';

export const jiuyuan: SkillHooks = {
  /** respondTao：主公的额外回复（在基础 1 点回复的 heal 事件之后） */
  taoExtraHeal(s, ctx) {
    const dying = ctx.player;
    const actor = ctx.saver!;
    if (actor.id === dying.id) return;
    if (dying.identity !== 'zhu' || !hasSkill(dying, 'jiuyuan')) return;
    if (GENERAL_FACTION[actor.general] !== 'wu') return;
    dying.hp += 1;
    s.log.push({ t: 'skill', player: dying.id, sub: 'jiuyuan', detail: `${actor.name} 的【桃】额外回复1点` });
    s.log.push({ t: 'heal', player: dying.id, amount: 1 });
  },
};
