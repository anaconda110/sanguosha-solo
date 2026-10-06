// A2 验证：MC AI 自战少量对局——终止性、守恒、确定性（ADR-0006 第 3 条）。
// 用法：npx tsx scripts/smoke-mc.ts [局数=4]
import { aiAction } from '../src/ai/mc';
import { setup } from '../src/engine/setup';
import { TOTAL_CARDS, step } from '../src/engine/step';
import type { GameState } from '../src/engine/types';

const N = Number(process.argv[2] ?? 4);

function cardTotal(s: GameState): number {
  const equips = s.players.reduce(
    (n, p) => n + Object.values(p.equipment).filter(Boolean).length,
    0,
  );
  const judgements = s.players.reduce((n, p) => n + p.judgements.length, 0);
  return (
    s.deck.length +
    s.discard.length +
    s.players.reduce((n, p) => n + p.hand.length, 0) +
    equips +
    judgements
  );
}

function playGame(seed: number): GameState {
  let s = setup(seed);
  for (let i = 0; i < 50000 && !s.winner; i++) {
    const pend = s.pending!;
    const a = aiAction(s, pend.playerId);
    if (!a) throw new Error(`seed ${seed}: AI 无法应答 ${pend.kind}`);
    s = step(s, a);
    if (i % 200 === 0) {
      const total = cardTotal(s);
      if (total !== TOTAL_CARDS)
        throw new Error(`seed ${seed} step ${i}: 守恒失败 ${total} != ${TOTAL_CARDS}`);
    }
  }
  if (!s.winner) throw new Error(`seed ${seed}: 未终局`);
  return s;
}

const t0 = Date.now();
const tally = new Map<string, number>();
for (let seed = 1; seed <= N; seed++) {
  const s = playGame(seed);
  tally.set(s.winner!.side, (tally.get(s.winner!.side) ?? 0) + 1);
  console.error(`seed ${seed} ✓ ${s.log.length} 事件 ${s.winner!.side}胜`);
}
const a = playGame(1);
const b = playGame(1);
const det = JSON.stringify(a.log) === JSON.stringify(b.log);
console.log(
  `${N} 局 MC 对局全部终局 ✓ 确定性: ${det ? '通过' : '失败'}，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
console.log('胜方分布:', Object.fromEntries(tally));
if (!det) process.exit(1);
