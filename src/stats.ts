// 战绩统计（M9）：规则 AI 自战批量对局的累加器。纯数据层，分批驱动由 UI 负责
// （每局之间让出主线程，保持页面可交互）。种子固定为 1000+i 起的连续段，
// 同参数的两次统计完全可复现。
import { ruleAction } from './ai/rule';
import { setup } from './engine/setup';
import { step } from './engine/step';
import type { Identity, WinSide } from './engine/types';

export interface GeneralStat {
  games: number;
  wins: number;
}

export interface BatchResult {
  games: number;
  sideWins: Partial<Record<WinSide, number>>;
  stepsSum: number;
  maxSteps: number;
  generals: Record<string, GeneralStat>;
}

export function emptyBatch(): BatchResult {
  return { games: 0, sideWins: {}, stepsSum: 0, maxSteps: 0, generals: {} };
}

/** 该玩家的阵营是否赢得了这局（平局无人获胜） */
function sideWon(side: WinSide | undefined, identity: Identity): boolean {
  if (!side) return false;
  if (side === 'zhu') return identity === 'zhu' || identity === 'zhong';
  return side === identity;
}

/** 跑一局并累进 acc；局内步数上限与引擎 MAX_TURNS 熔断双重兜底 */
export function runOneGame(seed: number, acc: BatchResult): void {
  let s = setup(seed);
  let steps = 0;
  for (let i = 0; i < 50000 && !s.winner; i++) {
    steps = i;
    const a = ruleAction(s, s.pending!.playerId);
    if (!a) break;
    s = step(s, a);
  }
  const side = s.winner?.side;
  acc.games += 1;
  if (side) acc.sideWins[side] = (acc.sideWins[side] ?? 0) + 1;
  acc.stepsSum += steps;
  acc.maxSteps = Math.max(acc.maxSteps, steps);
  for (const p of s.players) {
    const g = (acc.generals[p.general] ??= { games: 0, wins: 0 });
    g.games += 1;
    if (sideWon(side, p.identity)) g.wins += 1;
  }
}
