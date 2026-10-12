// AI 调度链（ADR-0008 + ADR-0025，M22 自 App.vue 迁出）。
//
// ┌─ 调度链不变量（docs/adr/0025-ai-chain-invariant.md，M18–M20 三次冻结事故的结论）─┐
// │ ① setTimeout 回调末尾必须无条件 `void scheduleAi()`：胜负/换局由回调开头的    │
// │    guard（gid !== gameId / state.winner / !state.pending）提前退出；任何      │
// │    "出错就 return 不重调度" 的路径都是潜在冻结点（!a 分支除外——AI 返回 null   │
// │    时链路已无法继续，必须 console.error 暴露而非静默续链）。                  │
// │ ② 初始调度必须位于 setup 顶层、settings 初始化之后（App.vue 组合根执行         │
// │    `void scheduler.scheduleAi()`）：settings 未初始化即调度是 M19 TDZ 冻结    │
// │    事故根因；把初始调度包进某个函数体内、等事件才触发则是 M20 事故根因。        │
// └──────────────────────────────────────────────────────────────────────────┘
// 语义逐字节保持：setTimeout 延时、Worker 15s 保险丝、同步回退、快照剥日志均不变。
import { ref } from 'vue';
import { aiAction } from '../ai/mc';
import type { Action, GameState } from '../engine/types';
import type { View } from '../engine/view';
import type { Ref } from 'vue';
import type { Settings } from '../settings';

export interface SchedulerDeps {
  settings: Ref<Settings>;
  view: Ref<View>;
  /** 观战模式：无真人询问，全部由 AI 应答 */
  spectate: Ref<boolean>;
  /** 人类座次；-1 = 观战 */
  humanId: Ref<number>;
  /** 当前引擎状态（普通对象，step 后换新绑定——必须经 getter 取，勿闭包捕获） */
  getState: () => GameState;
  /** 对局代号：newGame/续局自增，调度回调据此丢弃旧局的迟到响应 */
  getGameId: () => number;
  /** 统一的推进一步（useGame 提供）；调度层异常不杀链 */
  applyStep: (a: Action) => void;
}

export function useScheduler(deps: SchedulerDeps) {
  const { settings, view, spectate, humanId, getState, getGameId, applyStep } = deps;

  /** AI 思考指示（ADR-0008：MC 在 Worker 中计算期间点亮，主线程保持可交互） */
  const thinking = ref(false);

  // —— AI Worker（ADR-0008）：不可用（如 file:// 直开构建产物）时回退主线程同步计算 ——
  let aiWorker: Worker | null = null;
  try {
    aiWorker = new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' });
  } catch {
    aiWorker = null;
  }
  let aiSeq = 0;

  function askAi(playerId: number): Promise<Action | null> {
    return new Promise(resolve => {
      const difficulty = settings.value.difficulty;
      if (!aiWorker) {
        resolve(aiAction(getState(), playerId, difficulty)); // 同步回退：冻结回归但游戏不死
        return;
      }
      const requestId = ++aiSeq;
      let done = false;
      const finish = (a: Action | null) => {
        if (done) return;
        done = true;
        aiWorker?.removeEventListener('message', onMsg);
        clearTimeout(timer);
        resolve(a);
      };
      const onMsg = (e: MessageEvent<{ action?: Action | null; error?: string; requestId: number }>) => {
        if (e.data.requestId !== requestId) return;
        finish(e.data.action ?? null);
      };
      // Worker 挂死保险丝：15s 未响应则回退主线程同步计算（迟到的响应被忽略）
      const timer = setTimeout(() => finish(aiAction(getState(), playerId, difficulty)), 15000);
      aiWorker.addEventListener('message', onMsg);
      // 快照剥离日志：Worker 端仿真不读日志，避免大日志的克隆开销
      const snapshot = { ...getState(), log: [], actionLog: [] };
      aiWorker.postMessage({ state: snapshot, playerId, requestId, difficulty });
    });
  }

  async function scheduleAi() {
    const p = view.value.pending;
    if (!p || view.value.winner) return;
    if (!spectate.value && p.playerId === humanId.value && view.value.me) return; // 等真人操作
    const gid = getGameId();
    window.setTimeout(async () => {
      // 不变量①：本回调所有提前 return 之外，末尾必须无条件 void scheduleAi()
      const st0 = getState();
      if (gid !== getGameId() || st0.winner || !st0.pending) return;
      const pid = st0.pending.playerId;
      thinking.value = true;
      const a = await askAi(pid);
      thinking.value = false;
      const st1 = getState();
      if (gid !== getGameId() || st1.winner || !st1.pending || st1.pending.playerId !== pid) return;
      if (!a) {
        console.error('aiAction 返回 null：AI 链中止', pid, st1.pending.kind);
        return;
      }
      try {
        applyStep(a);
      } catch (e) {
        console.error('applyStep 异常（AI 链继续）:', e); // 演出层故障不杀 AI 链（M19 修复）
      }
      void scheduleAi(); // 递归调度：AI 回合结束后安排下一步（M20 编辑曾误删致全局冻结）

    }, (spectate.value ? 700 : 550) / settings.value.speed);
  }

  return { thinking, scheduleAi };
}

export type SchedulerApi = ReturnType<typeof useScheduler>;
