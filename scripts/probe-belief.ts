// 身份推断准确率探针（M12）：把推断结果与终局时的真实身份对照。
// 只看"存活到终局的玩家"和推断出的三态，统计命中/误判/弃权。
// 用法：npx tsx scripts/probe-belief.ts [局数=40]
import { inferLordFavor, SIDE_OF, stanceOf } from '../src/ai/belief';
import { ruleAction } from '../src/ai/rule';
import { setup } from '../src/engine/setup';
import { step } from '../src/engine/step';
import type { GameState, Identity } from '../src/engine/types';

const N = Number(process.argv[2] ?? 40);

let hit = 0;
let miss = 0;
let abstain = 0;
const byViewer: Record<string, { hit: number; miss: number; abstain: number }> = {};

/** 在若干时点采样：局中与终局各一次 */
function sample(s: GameState): void {
  const zhu = s.players.find(p => p.identity === 'zhu');
  const favor = inferLordFavor(s);
  for (const viewer of s.players) {
    if (!viewer.alive) continue;
    // 只评估"视角者不可能知道"的目标：排除自己与明置主公
    for (const t of s.players) {
      if (t.id === viewer.id || t.id === zhu?.id || !t.alive) continue;
      const st = stanceOf(viewer.identity, favor[t.id] ?? 0, t.id, zhu?.id ?? -1);
      const bucket = (byViewer[viewer.identity] ??= { hit: 0, miss: 0, abstain: 0 });
      if (st === 'unknown') { abstain += 1; bucket.abstain += 1; continue; }
      // 信念的直接断言："敌视主公者" = 反贼或内奸；"护主者" = 忠臣。
      // 因此按推断的语义核对真值，而不是按"视角者的敌人"（反贼视角下两者恰好相反）。
      const isFoeTruth = t.identity === 'fan' || t.identity === 'nei';
      const guessFoe = st === 'foe';
      if (guessFoe === isFoeTruth) { hit += 1; bucket.hit += 1; } else { miss += 1; bucket.miss += 1; }
    }
  }
}

let stepsSum = 0;
let draws = 0;
for (let seed = 1; seed <= N; seed++) {
  let s: GameState = setup(seed);
  const halfway = Math.floor(120 + (seed % 60)); // 粗略的中盘采样点（步数）
  let i = 0;
  for (; i < 50000 && !s.winner; i++) {
    if (i === halfway) sample(s);
    const a = ruleAction(s, s.pending!.playerId);
    if (!a) throw new Error(`seed ${seed}: AI 无法应答 ${s.pending!.kind}`);
    s = step(s, a);
  }
  sample(s);
  stepsSum += i;
  if (s.winner?.side === 'draw') draws += 1;
}

const decided = hit + miss;
console.log(`${N} 局：平均 ${(stepsSum / N).toFixed(0)} 步，平局 ${draws} 局`);
console.log(`身份推断（断言"敌视主公"= 反贼/内奸；仅统计视角者无从得知的目标）：`);
console.log(`  有结论 ${decided} 例：命中 ${hit}（${((hit / Math.max(1, decided)) * 100).toFixed(1)}%），误判 ${miss}`);
console.log(`  弃权（unknown）${abstain} 例，占 ${((abstain / Math.max(1, abstain + decided)) * 100).toFixed(1)}%`);
console.log('  按视角者身份：', byViewer);
