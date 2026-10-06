// M4 探针：跑一批对局，统计四类技能的实际发动次数。
// - use/active/trigger 型：引擎日志里的 t:'skill' 事件
// - use 型（武圣/龙胆）与 lock 型（咆哮/无双）：无事件，从动作流反推（出牌时牌面 ≠ 名义牌）
import { ruleAction } from '../src/ai/rule';
import { setup } from '../src/engine/setup';
import { hasSkill } from '../src/engine/skills';
import { step } from '../src/engine/step';
import type { GameState, Inquiry } from '../src/engine/types';

const N = Number(process.argv[2] ?? 40);
const counts = new Map<string, number>();

function bump(k: string) {
  counts.set(k, (counts.get(k) ?? 0) + 1);
}

/** 找牌（手牌里按 id 查，用于判断这张牌是不是被技能转换使用的） */
function handCard(s: GameState, pid: number, id: number | null | undefined) {
  if (id == null) return undefined;
  return s.players[pid]!.hand.find(c => c.id === id);
}

function observe(s: GameState, pend: Inquiry, a: { type: string; [k: string]: unknown }): void {
  if (pend.kind === 'play' && a.type === 'playSha') {
    const c = handCard(s, pend.playerId, a.cardId as number);
    if (c && c.sub !== 'sha') bump(c.sub === 'shan' ? 'use:龙胆(闪当杀)' : 'use:武圣(红牌当杀)');
    if (s.playedSha && hasSkill(s.players[pend.playerId]!, 'paoxiao')) bump('lock:咆哮(多刀)');
  } else if (pend.kind === 'respondShan' && a.type === 'respondShan') {
    const actor = s.players[pend.playerId]!;
    const c = handCard(s, pend.playerId, a.cardId as number | null);
    if (c && c.sub !== 'shan') bump(hasSkill(actor, 'longdan') ? 'use:龙胆(杀当闪)' : 'use:倾国(黑牌当闪)');
    if ((pend.needShan ?? 1) === 2) bump('lock:无双(双闪)');
  } else if (pend.kind === 'respondSha' && a.type === 'respondSha' && s.frames.length > 0) {
    const f = s.frames[s.frames.length - 1]!;
    if (f.kind === 'trick' && f.sub === 'juedou' && f.duelShaPlayed === 1) bump('lock:无双(决斗双杀)');
  }
}

for (let seed = 1; seed <= N; seed++) {
  let s = setup(seed);
  for (let i = 0; i < 50000 && !s.winner; i++) {
    const pend = s.pending!;
    const a = ruleAction(s, pend.playerId);
    if (!a) throw new Error(`seed ${seed}: AI 无法应答 ${pend.kind}`);
    observe(s, pend, a as unknown as { type: string });
    s = step(s, a);
  }
  for (const e of s.log) {
    if (e.t === 'skill') bump(`${e.sub}(${{ wusheng: 'use', longdan: 'use', paoxiao: 'lock', jianxiong: 'trigger', fankui: 'trigger', guicai: 'trigger', kurou: 'active', wushuang: 'lock', xiaoji: 'trigger', lijian: 'active', biyue: 'trigger', guanxing: 'active', kongcheng: 'lock', luoshen: 'trigger', qingguo: 'use', guose: 'use', liuli: 'trigger', qixi: 'use' }[e.sub]})`);
    else if (e.t === 'ability') bump(`ability:${e.sub}`);
    else if (e.t === 'negate') bump('wuxie(negate)');
  }
}

console.log(`${N} 局技能统计：`, Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])));
