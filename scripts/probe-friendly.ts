// 误伤探针（M12）：统计规则 AI 自战里的"打自己人"事件——阵营内部的伤害。
// 阵营：主公+忠臣 = 主公阵营；反贼；内奸独行。同一阵营互伤即误伤。
// 用法：npx tsx scripts/probe-friendly.ts [局数=40]
import { ruleAction } from '../src/ai/rule';
import { setup } from '../src/engine/setup';
import { step } from '../src/engine/step';
import { SIDE_OF } from '../src/ai/belief';
import type { GameState } from '../src/engine/types';

const N = Number(process.argv[2] ?? 40);

let friendlyHits = 0;
let hostileHits = 0;
let totalDamage = 0;
let friendlyAoE = 0; // 其中由群体锦囊造成的（不可选的附伤）
let aoePlays = 0;
let aoeBadPlays = 0; // 群体锦囊的盟友受伤人数 > 敌人受伤人数
const bySide: Record<string, number> = {};

/** 逐事件跟踪最近一次群体的来源，供伤害归因 */
for (let seed = 1; seed <= N; seed++) {
  let s: GameState = setup(seed);
  for (let i = 0; i < 50000 && !s.winner; i++) {
    const a = ruleAction(s, s.pending!.playerId);
    if (!a) throw new Error(`seed ${seed}: AI 无法应答 ${s.pending!.kind}`);
    s = step(s, a);
  }
  // 群体锦囊的"值得用吗"：统计每次施放后敌我受伤比
  let lastAoe: { player: number; friendly: number; hostile: number } | null = null;
  for (const e of s.log) {
    if (e.t === 'playCard' && (e.card === 'nanman' || e.card === 'wanjian')) {
      if (lastAoe) {
        aoePlays += 1;
        if (lastAoe.friendly > lastAoe.hostile) aoeBadPlays += 1;
      }
      lastAoe = { player: e.player, friendly: 0, hostile: 0 };
      continue;
    }
    if (e.t !== 'damage') continue;
    totalDamage += 1;
    if (e.source == null) { lastAoe = null; continue; }
    const src = s.players[e.source];
    const dst = s.players[e.player];
    if (!src || !dst) continue;
    const a = SIDE_OF[src.identity];
    const b = SIDE_OF[dst.identity];
    if (lastAoe && lastAoe.player === e.source) {
      if (a === b) { friendlyAoE += 1; lastAoe.friendly += 1; }
      else lastAoe.hostile += 1;
      continue;
    }
    if (a === b && src.id !== dst.id) {
      friendlyHits += 1;
      bySide[a] = (bySide[a] ?? 0) + 1;
    } else if (a !== b) {
      hostileHits += 1;
    }
  }
  if (lastAoe) {
    aoePlays += 1;
    if (lastAoe.friendly > lastAoe.hostile) aoeBadPlays += 1;
  }
}

console.log(`${N} 局规则 AI 自战：`);
console.log(`  误伤（同阵营互伤）：${friendlyHits} 次`, bySide);
console.log(`  其中群体锦囊附伤：${friendlyAoE} 次`);
console.log(`  敌对伤害：${hostileHits} 次`);
console.log(`  伤害事件合计：${totalDamage}（无来源：${totalDamage - friendlyHits - hostileHits - friendlyAoE} 次）`);
console.log(
  `  误伤占比：${(((friendlyHits + friendlyAoE) / Math.max(1, friendlyHits + friendlyAoE + hostileHits)) * 100).toFixed(1)}%`,
);
console.log(`  群体锦囊施放 ${aoePlays} 次，其中"伤友多于伤敌" ${aoeBadPlays} 次`);
