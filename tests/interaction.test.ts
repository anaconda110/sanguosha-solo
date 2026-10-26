import { describe, expect, it } from 'vitest';
import {
  cardActionReason,
  isKeyEvent,
  isPublicActionEvent,
  matchesLogFilter,
  type CardActionContext,
} from '../src/interaction/action-hints';
import { skillTrayEntries, type SkillAvailabilityContext } from '../src/interaction/skills';
import type { Card, GameEvent, Inquiry } from '../src/engine/types';

const SHA: Card = { id: 1, sub: 'sha', suit: '♠', rank: 7 };
const SHAN: Card = { id: 2, sub: 'shan', suit: '♥', rank: 8 };
const TAO: Card = { id: 3, sub: 'tao', suit: '♥', rank: 9 };
const WUXIE: Card = { id: 4, sub: 'wuxie', suit: '♣', rank: 10 };
const EQUIP: Card = { id: 5, sub: 'bagua', suit: '♣', rank: 2 };

const PLAY: Inquiry = { kind: 'play', playerId: 0 };

function actionCtx(patch: Partial<CardActionContext> = {}): CardActionContext {
  return {
    pending: PLAY,
    selectedSub: null,
    hasSecondCard: false,
    zhangbaOn: false,
    canSha: true,
    hp: 4,
    maxHp: 4,
    activeMode: null,
    activeSelectionCount: 0,
    activeSelectionIncludes: false,
    discardSelectionIds: [],
    discardCount: 2,
    guanshiSelectionIds: [],
    general: 'baiban',
    isRed: false,
    lijianMode: false,
    lijianCardSelected: false,
    ...patch,
  };
}

function skillCtx(patch: Partial<SkillAvailabilityContext> = {}): SkillAvailabilityContext {
  return {
    skills: ['kurou', 'jianxiong', 'zhiheng', 'lijian', 'qingnang', 'jieyin'],
    usedSkills: [],
    pendingKind: 'play',
    handCount: 2,
    hp: 3,
    maxHp: 4,
    injuredCount: 1,
    injuredMaleCount: 1,
    otherAliveCount: 1,
    lijianReady: true,
    ...patch,
  };
}

describe('cardActionReason', () => {
  it('没有询问时拒绝出牌，出牌阶段按牌型给出明确原因', () => {
    expect(cardActionReason(SHA, actionCtx({ pending: null }))).toBe('当前没有可响应的询问');
    expect(cardActionReason(TAO, actionCtx())).toBe('体力已满，不能使用【桃】');
    expect(cardActionReason(TAO, actionCtx({ hp: 3 }))).toBeNull();
    expect(cardActionReason(SHA, actionCtx({ canSha: false }))).toBe('本回合已使用过【杀】');
    expect(cardActionReason(WUXIE, actionCtx())).toBe('只能在需要【无懈可击】时使用');
    expect(cardActionReason(SHAN, actionCtx())).toBe('只能在需要【闪】时使用');
    expect(cardActionReason(EQUIP, actionCtx())).toBeNull();
  });

  it('离间选择模式优先于普通出牌限制，且选牌后进入目标选择提示', () => {
    expect(cardActionReason(SHAN, actionCtx({ lijianMode: true, canSha: false }))).toBeNull();
    expect(cardActionReason(SHAN, actionCtx({ lijianMode: true, lijianCardSelected: true }))).toBe(
      '离间手牌已选，请选择两名男性目标',
    );
  });

  it('结姻限制两张牌，丈八第一张杀素材可选中任意另一张牌', () => {
    expect(cardActionReason(SHAN, actionCtx({
      activeMode: 'jieyin',
      activeSelectionCount: 2,
    }))).toBe('结姻最多选择两张手牌');
    expect(cardActionReason(SHAN, actionCtx({
      activeMode: 'jieyin',
      activeSelectionCount: 2,
      activeSelectionIncludes: true,
    }))).toBeNull();
    expect(cardActionReason(SHAN, actionCtx({
      selectedSub: 'sha',
      zhangbaOn: true,
      hasSecondCard: false,
    }))).toBeNull();
  });

  it('响应阶段只允许规则内牌与技能转换，并正确限制弃牌数量', () => {
    const respondShan: Inquiry = { kind: 'respondShan', playerId: 0 };
    const respondSha: Inquiry = { kind: 'respondSha', playerId: 0 };
    expect(cardActionReason(SHAN, actionCtx({ pending: respondShan }))).toBeNull();
    expect(cardActionReason(SHA, actionCtx({ pending: respondShan, general: 'zhaoyun' }))).toBeNull();
    expect(cardActionReason(WUXIE, actionCtx({ pending: { kind: 'respondWuxie', playerId: 0 } }))).toBeNull();
    expect(cardActionReason(SHAN, actionCtx({ pending: respondSha, general: 'zhaoyun' }))).toBeNull();
    expect(cardActionReason(TAO, actionCtx({ pending: respondSha }))).toBe('需要打出【杀】（或通过技能转换）');
    expect(cardActionReason(SHAN, actionCtx({ pending: respondSha }))).toBe('需要打出【杀】（或通过技能转换）');

    const discard: Inquiry = { kind: 'discard', playerId: 0, count: 2 };
    expect(cardActionReason(SHA, actionCtx({
      pending: discard,
      discardSelectionIds: [SHA.id],
      discardCount: 2,
    }))).toBeNull();
    expect(cardActionReason(SHAN, actionCtx({
      pending: discard,
      discardSelectionIds: [TAO.id, WUXIE.id],
      discardCount: 2,
    }))).toBe('已经选够 2 张牌');
  });
});

describe('skillTrayEntries', () => {
  it('主动技在可发动时给出选择模式，被动技明确说明由系统处理', () => {
    const entries = skillTrayEntries(skillCtx());
    expect(entries.map(entry => entry.id)).toEqual(['kurou', 'jianxiong', 'zhiheng', 'lijian', 'qingnang', 'jieyin']);
    expect(entries[0]).toMatchObject({ available: true, selectionMode: 'kurou' });
    expect(entries[1]).toMatchObject({ available: false, kind: 'passive', reason: '满足条件时自动询问' });
    expect(entries[3]).toMatchObject({ available: true, selectionMode: 'lijian' });
    expect(entries[5]).toMatchObject({ available: true, selectionMode: 'jieyin' });
  });

  it('已发动、阶段不符和资源不足都给出首个阻断原因', () => {
    expect(skillTrayEntries(skillCtx({ usedSkills: ['zhiheng'] })).find(entry => entry.id === 'zhiheng'))
      .toMatchObject({ available: false, reason: '本回合已发动过' });
    expect(skillTrayEntries(skillCtx({ pendingKind: 'respondShan' })).find(entry => entry.id === 'kurou'))
      .toMatchObject({ available: false, reason: '只能在出牌阶段发动' });
    expect(skillTrayEntries(skillCtx({ hp: 1 })).find(entry => entry.id === 'kurou'))
      .toMatchObject({ available: false, reason: '体力为 1，不能失去体力' });
    expect(skillTrayEntries(skillCtx({ handCount: 0 })).find(entry => entry.id === 'zhiheng'))
      .toMatchObject({ available: false, reason: '没有可用于制衡的手牌' });
    expect(skillTrayEntries(skillCtx({ injuredMaleCount: 0 })).find(entry => entry.id === 'jieyin'))
      .toMatchObject({ available: false, reason: '没有已受伤男性角色' });
  });
});

describe('战报筛选与公开口径', () => {
  const events: GameEvent[] = [
    { t: 'draw', player: 0, n: 2 },
    { t: 'playCard', player: 1, card: 'sha', target: 0 },
    { t: 'damage', player: 0, amount: 1, source: 1 },
    { t: 'heal', player: 0, amount: 1 },
    { t: 'skill', player: 1, sub: 'wusheng' },
    { t: 'judge', player: 0, card: SHA, reason: 'bagua' },
    { t: 'negate', player: 1, sub: 'shunshou', targetId: 0, chain: 1 },
    { t: 'gameOver', side: 'fan' },
  ];

  it('关键事件筛选覆盖伤害、技能、判定和终局', () => {
    expect(events.map(isKeyEvent)).toEqual([false, false, true, true, true, true, true, true]);
    expect(matchesLogFilter(events[2]!, 'damage')).toBe(true);
    expect(matchesLogFilter(events[4]!, 'skill')).toBe(true);
    expect(matchesLogFilter(events[5]!, 'judge')).toBe(true);
    expect(matchesLogFilter(events[6]!, 'key')).toBe(true);
    expect(matchesLogFilter(events[0]!, 'all')).toBe(true);
    expect(matchesLogFilter(events[0]!, 'key')).toBe(false);
  });

  it('AI 公开动向只接受已经写入公开战报的行为事件', () => {
    expect(events.map(isPublicActionEvent)).toEqual([false, true, true, false, true, false, false, false]);
    expect(isPublicActionEvent({ t: 'respond', player: 0, card: 'shan', resp: 'shan' })).toBe(true);
    expect(isPublicActionEvent({ t: 'ability', player: 0, sub: 'bagua' })).toBe(true);
    expect(isPublicActionEvent({ t: 'death', player: 0, identity: 'fan' })).toBe(true);
  });
});
