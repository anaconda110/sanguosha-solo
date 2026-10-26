// 技能可用性解释（纯函数）：把“为什么按钮不亮”从 PromptBar/技能托盘模板中抽离。
import { SKILL_INFO, type SkillSub } from '../engine/types';
import type { ActiveSelectionMode } from './action-hints';

export interface SkillAvailabilityContext {
  skills: SkillSub[];
  usedSkills: SkillSub[];
  pendingKind: string | null;
  handCount: number;
  hp: number;
  maxHp: number;
  injuredCount: number;
  injuredMaleCount: number;
  otherAliveCount: number;
  lijianReady: boolean;
}

export interface SkillTrayEntry {
  id: SkillSub;
  name: string;
  description: string;
  kind: 'active' | 'passive';
  available: boolean;
  reason: string;
  selectionMode?: Exclude<ActiveSelectionMode, null> | 'lijian' | 'kurou';
}

const PLAY_ACTIVE = new Set<SkillSub>(['kurou', 'lijian', 'zhiheng', 'rende', 'qingnang', 'fanjian', 'jieyin']);

/** 当前展示的技能清单；主动技给出原因，被动/触发技明确标注为自动或条件询问。 */
export function skillTrayEntries(ctx: SkillAvailabilityContext): SkillTrayEntry[] {
  return ctx.skills.map(id => {
    const info = SKILL_INFO[id];
    const base = { id, name: info.display, description: info.desc };
    if (!PLAY_ACTIVE.has(id)) {
      return {
        ...base,
        kind: 'passive' as const,
        available: false,
        reason: info.kind === 'lock' ? '锁定技，自动生效' : '满足条件时自动询问',
      };
    }

    const used = ctx.usedSkills.includes(id);
    const inPlay = ctx.pendingKind === 'play';
    let reason = '';
    if (!inPlay) reason = '只能在出牌阶段发动';
    else if (used) reason = '本回合已发动过';
    else {
      switch (id) {
        case 'kurou':
          if (ctx.hp <= 1) reason = '体力为 1，不能失去体力';
          break;
        case 'lijian':
          if (!ctx.lijianReady) reason = '需要至少一张手牌和两名存活男性';
          break;
        case 'zhiheng':
          if (ctx.handCount < 1) reason = '没有可用于制衡的手牌';
          break;
        case 'rende':
          if (ctx.handCount < 1) reason = '没有可交给其他角色的手牌';
          if (ctx.otherAliveCount < 1) reason = '没有其他存活角色';
          break;
        case 'qingnang':
          if (ctx.handCount < 1) reason = '没有可用于青囊的手牌';
          if (ctx.injuredCount < 1) reason = '场上没有已受伤角色';
          break;
        case 'fanjian':
          if (ctx.handCount < 1) reason = '没有可用于反间的手牌';
          if (ctx.otherAliveCount < 1) reason = '没有其他存活角色';
          break;
        case 'jieyin':
          if (ctx.handCount < 2) reason = '结姻需要两张手牌';
          if (ctx.injuredMaleCount < 1) reason = '没有已受伤男性角色';
          break;
      }
    }

    return {
      ...base,
      kind: 'active' as const,
      available: reason === '',
      reason: reason || '可以发动',
      selectionMode:
        id === 'kurou' ? 'kurou' :
        id === 'lijian' ? 'lijian' :
        id as Exclude<ActiveSelectionMode, null>,
    };
  });
}
