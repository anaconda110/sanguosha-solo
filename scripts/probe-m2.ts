// M2 探针：跑一批对局，统计新系统事件（判定/闪电转移/无懈/技能杀）的实际发生次数。
import { ruleAction } from '../src/ai/rule';
import { setup } from '../src/engine/setup';
import { step } from '../src/engine/step';

const N = Number(process.argv[2] ?? 40);
const counts = new Map<string, number>();
let games = 0;
let samples: string[] = [];

for (let seed = 1; seed <= N; seed++) {
  let s = setup(seed);
  for (let i = 0; i < 50000 && !s.winner; i++) {
    const pend = s.pending!;
    const a = ruleAction(s, pend.playerId);
    if (!a) throw new Error(`seed ${seed}: AI 无法应答 ${pend.kind}`);
    s = step(s, a);
  }
  games++;
  for (const e of s.log) {
    if (e.t === 'judge') {
      counts.set('judge', (counts.get('judge') ?? 0) + 1);
      if (samples.length < 8)
        samples.push(
          `seed${seed}: ${s.players[e.player]!.name}【${e.reason}】→ ${e.card.suit}${e.card.rank}${e.card.sub}`,
        );
    } else if (e.t === 'moveJudgement') {
      counts.set('lightningMove', (counts.get('lightningMove') ?? 0) + 1);
    } else if (e.t === 'negate') {
      counts.set('wuxieNegate', (counts.get('wuxieNegate') ?? 0) + 1);
    }
  }
  // 技能杀（转换使用）：日志里的 playCard sha 有多少来自非杀牌——从 actionLog 无法直接看，
  // 改统计武将技能持有者的杀使用次数做旁证
  for (const p of s.players) {
    if (p.general !== 'baiban' && s.log.some(e => e.t === 'playCard' && e.card === 'sha' && e.player === p.id)) {
      counts.set(`skillGeneralActive:${p.general}`, (counts.get(`skillGeneralActive:${p.general}`) ?? 0) + 1);
    }
  }
}
console.log(`${games} 局统计：`);
for (const [k, v] of [...counts].sort()) console.log(`  ${k}: ${v}`);
console.log('判定样本：');
for (const s of samples) console.log('  ' + s);
