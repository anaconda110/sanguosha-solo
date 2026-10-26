// 战报事件 → 回放动作数映射（纯逻辑）。
// GameEvent 不带动作序号；这里按同一 seed + actionLog 确定性重演，记录每个动作新增的事件区间。
import { setup } from '../engine/setup';
import { step } from '../engine/step';
import type { Action, GameState } from '../engine/types';

export interface EventActionSeek {
  /** 一基事件下标，与 GameState.log 对齐。 */
  eventSeq: number;
  /** 要传给 showReplay(k) 的动作数。 */
  actionCount: number;
}

/**
 * 返回长度为 state.log.length + 1 的映射；索引 0 固定为 0。
 * setup 阶段产生的事件映射到 0，动作 i（一基）产生的事件映射到 i。
 */
export function buildEventActionIndex(seed: number, actionLog: Action[]): number[] {
  let state: GameState = setup(seed);
  const index = new Array<number>(state.log.length + 1).fill(0);
  for (let i = 0; i < actionLog.length; i++) {
    const before = state.log.length;
    state = step(state, actionLog[i]!);
    const actionCount = i + 1;
    while (index.length <= state.log.length) index.push(actionCount);
    for (let seq = before + 1; seq <= state.log.length; seq++) index[seq] = actionCount;
  }
  return index;
}

/** 事件下标越界时钳制；seq=0 表示回到开局。 */
export function actionCountForEvent(index: readonly number[], eventSeq: number): number {
  if (!Number.isFinite(eventSeq)) return 0;
  const seq = Math.max(0, Math.min(index.length - 1, Math.floor(eventSeq)));
  return index[seq] ?? 0;
}

/** 给定动作数，返回当时最后一个可见事件（用于回放条摘要）。 */
export function eventSeqForAction(index: readonly number[], actionCount: number): number {
  let found = 0;
  for (let seq = 0; seq < index.length; seq++) {
    if ((index[seq] ?? 0) <= actionCount) found = seq;
    else break;
  }
  return found;
}

export function eventSeeks(seed: number, actionLog: Action[], eventSeqs: number[]): EventActionSeek[] {
  const index = buildEventActionIndex(seed, actionLog);
  return eventSeqs.map(eventSeq => ({ eventSeq, actionCount: actionCountForEvent(index, eventSeq) }));
}
