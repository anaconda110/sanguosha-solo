// 冒烟测试：规则 AI 自战 N 局，验证引擎能正确终局、卡牌守恒、同 seed 完全可复现。
import { ruleAction } from '../src/ai/rule';
import { setup } from '../src/engine/setup';
import { TOTAL_CARDS, step } from '../src/engine/step';
import type { GameState } from '../src/engine/types';

const MAX_STEPS = 50000;

function cardTotal(s: GameState): number {
  const equips = s.players.reduce(
    (n, p) => n + Object.values(p.equipment).filter(Boolean).length,
    0,
  );
  const judgements = s.players.reduce((n, p) => n + p.judgements.length, 0);
  // 判定链中的牌：判定牌 + 延时锦囊本体（M4 起判定不再即时结算）
  const judging = s.judgeState ? (s.judgeState.zoneCard ? 2 : 1) : 0;
  // 观星翻看的牌握在询问里（M7）
  const guanxing = s.pending?.kind === 'guanxing' ? (s.pending.guanxingCards?.length ?? 0) : 0;
  return (
    s.deck.length +
    s.discard.length +
    s.players.reduce((n, p) => n + p.hand.length, 0) +
    equips +
    judgements +
    judging +
    guanxing
  );
}

function playGame(seed: number): { steps: number; winner: string; log: GameState['log'] } {
  let s = setup(seed);
  for (let i = 0; ; i++) {
    if (i >= MAX_STEPS) throw new Error(`seed ${seed}: ${MAX_STEPS} 步内未终局`);
    if (s.winner) return { steps: i, winner: s.winner.side, log: s.log };
    const pend = s.pending!;
    const a = ruleAction(s, pend.playerId);
    if (!a) throw new Error(`seed ${seed} step ${i}: AI 无法应答 ${pend.kind}`);
    s = step(s, a);
    // 每步都校验。濒死求桃进行中时，濒死者（dyingId）合法地处于存活且体力≤0 的中间态。
    const dyingId = s.pending?.kind === 'respondTao' ? s.pending.dyingId : null;
    const total = cardTotal(s);
    if (total !== TOTAL_CARDS)
      throw new Error(`seed ${seed} step ${i}: 卡牌守恒失败（${total} != ${TOTAL_CARDS}）`);
    for (const p of s.players) {
      if (p.alive && p.hp <= 0 && p.id !== dyingId)
        throw new Error(`seed ${seed} step ${i}: 玩家 ${p.id} 体力异常 ${p.hp}`);
      if (p.alive && p.hp > p.maxHp)
        throw new Error(`seed ${seed} step ${i}: 玩家 ${p.id} 体力超上限 ${p.hp}`);
    }
  }
}

const N = Number(process.argv[2] ?? 120); // M2 牌局长，单局秒级；逐局进度打印便于定位卡点
const START = Number(process.argv[3] ?? 1);
const tally = new Map<string, number>();
let sum = 0;
let max = 0;
for (let seed = START; seed < START + N; seed++) {
  const r = playGame(seed);
  tally.set(r.winner, (tally.get(r.winner) ?? 0) + 1);
  sum += r.steps;
  max = Math.max(max, r.steps);
  console.error(`seed ${seed} ✓ ${r.steps} 步 ${r.winner}胜`);
}

const a = playGame(42);
const b = playGame(42);
const deterministic =
  JSON.stringify({ w: a.winner, s: a.steps, l: a.log }) ===
  JSON.stringify({ w: b.winner, s: b.steps, l: b.log });

console.log(`${N} 局全部正常终局 ✓`);
console.log(`确定性校验: ${deterministic ? '通过（seed 42 两局完全一致）' : '失败 ✗'}`);
console.log(`步数: 平均 ${(sum / N).toFixed(1)}，最长 ${max}`);
console.log('胜方分布:', Object.fromEntries(tally));
if (!deterministic) process.exit(1);
