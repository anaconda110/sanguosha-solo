// 开发调试工具：用规则 AI 打一整局并打印完整事件日志，供人工核对规则实现。
import { ruleAction } from '../src/ai/rule';
import { setup } from '../src/engine/setup';
import { step } from '../src/engine/step';
import { CARD_INFO, IDENTITY_NAMES } from '../src/engine/types';
import type { CardSub, GameEvent } from '../src/engine/types';

const seed = Number(process.argv[2] ?? 42);
let s = setup(seed);
let i = 0;
// 状态循环检测：本质状态（座次/阶段/种子/手牌/判定区/装备/牌堆序/pending）签名去重
const seen = new Map<string, number>();
while (!s.winner && i < 50000) {
  const sig = JSON.stringify([
    s.turnIdx, s.phase, s.seed,
    s.players.map(p => [p.hand.map(c => c.id), p.hp, p.alive, p.judgements.map(c => c.id), Object.values(p.equipment).map(c => c.id), p.identity]),
    s.deck.map(c => c.id), s.discard.map(c => c.id), s.pending,
  ]);
  const prev = seen.get(sig);
  if (prev !== undefined) {
    console.log(`\n⚠ 状态循环：步 ${prev} → 步 ${i}（周期 ${i - prev}）`);
    console.log(`循环点 pending: ${JSON.stringify(s.pending)}`);
    break;
  }
  seen.set(sig, i);
  const pend = s.pending!;
  const a = ruleAction(s, pend.playerId);
  if (!a) throw new Error(`AI 无法应答 ${pend.kind}`);
  s = step(s, a);
  i++;
}
if (!s.winner && i >= 50000) console.log('\n⚠ 50000 步未终局且无精确状态循环（疑似漂移型僵局）');
const name = (id?: number) => (id == null ? '' : s.players[id]!.name);
const disp = (sub: CardSub) => CARD_INFO[sub].display;
console.log('座次：', s.players.map(p => `${p.id}.${p.name}=${IDENTITY_NAMES[p.identity]}`).join(' '));
for (const e of s.log) {
  switch (e.t) {
    case 'turnStart':
      console.log(`\n── ${name(e.player)} 的回合 ──`);
      break;
    case 'draw':
      console.log(`  ${name(e.player)} 摸 ${e.n}`);
      break;
    case 'playCard':
      console.log(
        e.target != null
          ? `  ${name(e.player)} 对 ${name(e.target)} 使用【${disp(e.card)}】`
          : `  ${name(e.player)} 使用【${disp(e.card)}】`,
      );
      break;
    case 'respond':
      console.log(
        `    ${name(e.player)} ${e.card ? `打出【${disp(e.card)}】` : `不响应（${e.resp}）`}`,
      );
      break;
    case 'damage':
      console.log(`    ${name(e.player)} 受到 ${e.amount} 点伤害`);
      break;
    case 'heal':
      console.log(`    ${name(e.player)} 回复 ${e.amount} 体力`);
      break;
    case 'dying':
      console.log(`    ⚠ ${name(e.player)} 濒死`);
      break;
    case 'death':
      console.log(`  ☠ ${name(e.player)} 死亡，身份【${IDENTITY_NAMES[e.identity]}】`);
      break;
    case 'rewardDraw':
      console.log(`  ${name(e.player)} 杀死反贼，奖励摸三`);
      break;
    case 'penaltyDiscard':
      console.log(`  ${name(e.player)} 杀死忠臣，弃置全部手牌`);
      break;
    case 'discardCards':
      console.log(`  ${name(e.player)} 弃 ${e.n}`);
      break;
    case 'equip':
      console.log(`  ${name(e.player)} 装备【${disp(e.sub)}】`);
      break;
    case 'unequip':
      console.log(`  ${name(e.player)} 的【${disp(e.sub)}】被弃置`);
      break;
    case 'gainCard':
      console.log(`  ${name(e.player)} 获得一张牌（来自 ${name(e.from)}）`);
      break;
    case 'negate':
      console.log(`  ${name(e.player)} 无懈了【${disp(e.sub)}】${e.targetId != null ? `（目标 ${name(e.targetId)}）` : ''}`);
      break;
    case 'judge':
      console.log(`    ${name(e.player)} 判定【${e.reason}】→ ${e.card.suit}${e.card.rank} ${disp(e.card.sub)}`);
      break;
    case 'moveJudgement':
      console.log(`  【${disp(e.sub)}】移至 ${name(e.to)} 的判定区`);
      break;
    case 'gameOver':
      console.log(`\n■■ ${e.side} 获胜`);
      break;
  }
}
console.log(`\n步数 ${i}，胜方 ${s.winner?.side}`);
