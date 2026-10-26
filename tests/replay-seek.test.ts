import { describe, expect, it } from 'vitest';
import { ruleAction } from '../src/ai/rule';
import { setup } from '../src/engine/setup';
import { step } from '../src/engine/step';
import type { Action, GameState } from '../src/engine/types';
import {
  actionCountForEvent,
  buildEventActionIndex,
  eventSeeks,
  eventSeqForAction,
} from '../src/replay/seek';

function firstActions(seed: number, count: number): Action[] {
  let state = setup(seed);
  const actions: Action[] = [];
  while (actions.length < count && !state.winner) {
    if (!state.pending) throw new Error('测试重演没有待决策询问');
    const action = ruleAction(state, state.pending.playerId);
    if (!action) throw new Error(`AI 无法应答 ${state.pending.kind}`);
    actions.push(action);
    state = step(state, action);
  }
  return actions;
}

describe('buildEventActionIndex', () => {
  it('仅包含开局事件时全部映射到动作 0', () => {
    const initial: GameState = setup(42);
    const index = buildEventActionIndex(42, []);
    expect(index).toHaveLength(initial.log.length + 1);
    expect(index.every(actionCount => actionCount === 0)).toBe(true);
  });

  it('动作日志产生的映射单调不减，且动作数不越过输入长度', () => {
    const actions = firstActions(42, 18);
    const index = buildEventActionIndex(42, actions);
    expect(index.length).toBeGreaterThan(1);
    expect(index[0]).toBe(0);
    expect(index.at(-1)).toBeGreaterThan(0);
    for (let i = 1; i < index.length; i++) {
      expect(index[i]).toBeGreaterThanOrEqual(index[i - 1]!);
      expect(index[i]).toBeLessThanOrEqual(actions.length);
    }
  });
});

describe('actionCountForEvent', () => {
  it('对负数、非有限值和越界事件下标做确定性钳制', () => {
    const actions = firstActions(42, 10);
    const index = buildEventActionIndex(42, actions);
    expect(actionCountForEvent(index, -100)).toBe(0);
    expect(actionCountForEvent(index, Number.NaN)).toBe(0);
    expect(actionCountForEvent(index, Number.POSITIVE_INFINITY)).toBe(0);
    expect(actionCountForEvent(index, 1.9)).toBe(index[1]);
    expect(actionCountForEvent(index, index.length + 500)).toBe(index.at(-1));
    expect(actionCountForEvent([], 3)).toBe(0);
  });

  it('事件与动作互查时落到同一动作区间', () => {
    const actions = firstActions(42, 18);
    const index = buildEventActionIndex(42, actions);
    for (let seq = 0; seq < index.length; seq++) {
      const actionCount = index[seq]!;
      expect(actionCountForEvent(index, eventSeqForAction(index, actionCount))).toBe(actionCount);
    }
    expect(eventSeqForAction(index, -1)).toBe(0);
    expect(eventSeqForAction(index, actions.length + 100)).toBe(index.length - 1);
    expect(eventSeqForAction([], 10)).toBe(0);
  });
});

describe('eventSeeks', () => {
  it('保留请求的事件序号并返回对应或钳制后的动作数', () => {
    const actions = firstActions(42, 10);
    const index = buildEventActionIndex(42, actions);
    const last = index.length - 1;
    const seeks = eventSeeks(42, actions, [0, last, last + 20, -3]);
    expect(seeks).toEqual([
      { eventSeq: 0, actionCount: index[0] },
      { eventSeq: last, actionCount: index[last] },
      { eventSeq: last + 20, actionCount: index[last] },
      { eventSeq: -3, actionCount: index[0] },
    ]);
  });
});
