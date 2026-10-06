// MC 决策 Worker（ADR-0008）：主线程发送剥离日志的状态快照，此处计算并返回 Action。
// 引擎为纯逻辑库（ADR-0002），MC 全部计算不触碰 DOM，天然可移入 Worker。
import { aiAction } from './mc';
import type { Action, GameState } from '../engine/types';

interface AiRequest {
  state: GameState;
  playerId: number;
  requestId: number;
}

const ctx = self as unknown as Worker;

ctx.addEventListener('message', (e: MessageEvent<AiRequest>) => {
  const { state, playerId, requestId } = e.data;
  try {
    const action: Action | null = aiAction(state, playerId);
    ctx.postMessage({ action, requestId });
  } catch (err) {
    ctx.postMessage({ error: String(err), requestId });
  }
});
