// 测试夹具：按 src/engine/types.ts 的类型定义手写最小状态对象。
import type { Card, CardSub, GeneralSub, Identity, PlayerState, Suit } from '../src/engine/types';

/** 构造一张最小牌；rank 仅展示/判定用色，测试默认 5 */
export function makeCard(sub: CardSub, suit: Suit, id = 0): Card {
  return { id, sub, suit, rank: 5 };
}

/** 构造一名最小玩家；装备区与判定区为空 */
export function makePlayer(
  id: number,
  general: GeneralSub,
  identity: Identity,
  hand: Card[] = [],
): PlayerState {
  return {
    id,
    name: `P${id}`,
    general,
    hp: 4,
    maxHp: 4,
    hand,
    equipment: {},
    judgements: [],
    alive: true,
    identity,
  };
}
