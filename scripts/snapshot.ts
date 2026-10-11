// 基线快照（ADR-0026 技能钩子重构的行为护栏）：对 seeds 1..N 各开一局，
// 与 smoke.ts 完全相同的开局与规则 AI 自战，跑到终局后记录终局状态指纹。
// 用法：npx tsx scripts/snapshot.ts --out <file> [--seeds 24] [--start 1]
// 输出确定性（无时间戳等随机因素）：同参数两次运行逐字节相同，
// 配合 cmp 可断言"重构前后对局结果与事件日志逐字节一致"。
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ruleAction } from '../src/ai/rule';
import { setup } from '../src/engine/setup';
import { step } from '../src/engine/step';
import type { GameState } from '../src/engine/types';

const MAX_STEPS = 50000;

function argOf(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1]! : fallback;
}

const OUT = argOf('out', '/tmp/snapshot-out.json');
const N = Number(argOf('seeds', '24'));
const START = Number(argOf('start', '1'));

/** 终局状态指纹：winner + 每名玩家的 hp/手牌/装备/判定区 + 牌堆与弃牌堆长度 + 全量事件日志 */
function fingerprint(s: GameState): string {
  const payload = {
    winner: s.winner,
    players: s.players.map(p => ({
      hp: p.hp,
      hand: p.hand,
      equipment: p.equipment,
      judgements: p.judgements,
    })),
    deckLen: s.deck.length,
    discardLen: s.discard.length,
    log: s.log,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function playGame(seed: number): { steps: number; winnerSide: string; hash: string } {
  let s = setup(seed);
  for (let i = 0; ; i++) {
    if (i >= MAX_STEPS) throw new Error(`seed ${seed}: ${MAX_STEPS} 步内未终局`);
    if (s.winner) return { steps: i, winnerSide: s.winner.side, hash: fingerprint(s) };
    const a = ruleAction(s, s.pending!.playerId);
    if (!a) throw new Error(`seed ${seed} step ${i}: AI 无法应答 ${s.pending!.kind}`);
    s = step(s, a);
  }
}

const rows = [];
for (let seed = START; seed < START + N; seed++) {
  const r = playGame(seed);
  rows.push({ seed, steps: r.steps, winnerSide: r.winnerSide, hash: r.hash });
  console.error(`seed ${seed} ✓ ${r.steps} 步 ${r.winnerSide}胜 ${r.hash.slice(0, 12)}`);
}

// 确定性自检：任取一局重跑一遍，指纹必须一致（seed 2 与首批任一 seed 不重叠场景均可）
const probe = START + Math.floor(N / 2);
const again = playGame(probe);
const first = rows.find(r => r.seed === probe)!;
if (again.hash !== first.hash || again.steps !== first.steps) {
  console.error(`确定性自检失败：seed ${probe} 两局不一致`);
  process.exit(1);
}
console.error(`确定性自检通过（seed ${probe} 两局指纹一致）`);

writeFileSync(OUT, JSON.stringify({ start: START, seeds: N, rows }, null, 2) + '\n');
console.log(`已写出 ${rows.length} 局快照 → ${OUT}`);
