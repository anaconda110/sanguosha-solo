// 逐技回归护栏（M11）：不引入测试框架，用 tsx 直接跑。
// 单趟跑 N 局规则 AI 自战，边跑边收集：技能发动计数（含 use/lock 反推）、
// 无懈链深度、卡牌守恒、体力表与技能归属断言、同 seed 确定性。
// 用法：npx tsx scripts/regression.ts [局数=20]
import { ruleAction } from '../src/ai/rule';
import { hpOf, setup } from '../src/engine/setup';
import { hasSkill } from '../src/engine/skills';
import { TOTAL_CARDS, advance, step } from '../src/engine/step';
import { GENERAL_SKILLS } from '../src/engine/types';
import { viewOf } from '../src/engine/view';
import type { Action, GameState, Inquiry } from '../src/engine/types';

const N = Number(process.argv[2] ?? 20);
let failed = 0;

/** 无懈链当前奇偶（最近一张 negate 的 chain） */
function negateChain(s: GameState): number {
  const ns = s.log.filter(e => e.t === 'negate');
  return ns.length === 0 ? 0 : (ns[ns.length - 1] as { chain?: number }).chain ?? 1;
}

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

// —— 1. 体力表（M11 清偿：3 血武将）——
console.log('\n[1] 体力表');
const HP3 = ['simayi', 'zhenji', 'zhugeliang', 'zhouyu', 'dajiao', 'sunshangxiang', 'diaochan', 'huatuo'] as const;
const HP4 = ['guanyu', 'zhangfei', 'zhaoyun', 'caocao', 'huanggai', 'lvbu', 'ganning', 'machao', 'sunquan', 'xiahoudun', 'liubei'] as const;
check('3 血表（司马懿/甄姬/诸葛亮/周瑜/大乔/孙尚香/貂蝉/华佗）', HP3.every(g => hpOf(g, 1) === 3));
check('4 血表（关羽/张飞/赵云/曹操/黄盖/吕布/甘宁/马超/孙权/夏侯惇/刘备）', HP4.every(g => hpOf(g, 1) === 4));
check('主公位 +1（曹操主公 5 血、貂蝉主公 4 血）', hpOf('caocao', 0) === 5 && hpOf('diaochan', 0) === 4);

// —— 2. 技能归属（M11 清偿）——
console.log('\n[2] 技能归属');
check('司马懿 = 鬼才 + 反馈', GENERAL_SKILLS.simayi.includes('guicai') && GENERAL_SKILLS.simayi.includes('fankui'));
check(
  '周瑜 = 英姿 + 反间（不再持有反馈）',
  GENERAL_SKILLS.zhouyu.includes('yingzi') &&
    GENERAL_SKILLS.zhouyu.includes('fanjian') &&
    !GENERAL_SKILLS.zhouyu.includes('fankui'),
);

// —— 3. 单趟自战：逐技计数 + 无懈链 + 守恒 ——
const seen = new Map<string, number>();
const bump = (k: string) => seen.set(k, (seen.get(k) ?? 0) + 1);

/** use/lock 类技能不写 skill 事件，须从动作流反推（判据随武将：关羽红牌=武圣，赵云闪=龙胆） */
function observeUse(s: GameState, pend: Inquiry, a: Action): void {
  const actor = s.players[pend.playerId]!;
  const handCard = (id: number | null | undefined) =>
    id == null ? undefined : actor.hand.find(c => c.id === id);
  const isRed = (suit: string) => suit === '♥' || suit === '♦';
  if (pend.kind === 'play' && a.type === 'playSha') {
    const c = handCard(a.cardId);
    // cardId2 非空 = 丈八蛇矛两张当杀，不按武圣/龙胆归类
    if (c && c.sub !== 'sha' && a.cardId2 == null) {
      if (hasSkill(actor, 'longdan') && c.sub === 'shan') bump('longdan');
      else if (hasSkill(actor, 'wusheng') && isRed(c.suit)) bump('wusheng');
    }
    if (s.playedSha && actor.general === 'zhangfei') bump('paoxiao');
  } else if (pend.kind === 'respondShan' && a.type === 'respondShan') {
    const c = handCard(a.cardId);
    if (c && c.sub !== 'shan') {
      if (hasSkill(actor, 'longdan')) bump('longdan');
      else if (hasSkill(actor, 'qingguo')) bump('qingguo');
    }
    if ((pend.needShan ?? 1) === 2) bump('wushuang');
  } else if (pend.kind === 'respondTao' && a.type === 'respondTao') {
    const c = handCard(a.cardId);
    if (c && c.sub !== 'tao') bump('jijiu');
  }
}

function cardTotal(s: GameState): number {
  const equips = s.players.reduce((n, p) => n + Object.values(p.equipment).filter(Boolean).length, 0);
  const judgements = s.players.reduce((n, p) => n + p.judgements.length, 0);
  const judging = s.judgeState ? (s.judgeState.zoneCard ? 2 : 1) : 0;
  const guanxing = s.pending?.kind === 'guanxing' ? (s.pending.guanxingCards?.length ?? 0) : 0;
  return (
    s.deck.length + s.discard.length +
    s.players.reduce((n, p) => n + p.hand.length, 0) +
    equips + judgements + judging + guanxing
  );
}

console.log(`\n[3] ${N} 局自战：逐技计数 / 无懈链 / 卡牌守恒`);
let conserved = true;
let chainDeep = 0;
let chainSeen = 0;
for (let seed = 1; seed <= N; seed++) {
  let s = setup(seed);
  for (let i = 0; i < 50000 && !s.winner; i++) {
    const pend = s.pending!;
    const a = ruleAction(s, pend.playerId);
    if (!a) throw new Error(`seed ${seed} step ${i}: AI 无法应答 ${pend.kind}`);
    observeUse(s, pend, a);
    s = step(s, a);
  }
  for (const e of s.log) {
    if (e.t === 'skill') bump(e.sub);
    if (e.t === 'negate') {
      chainSeen += 1;
      if ((e.chain ?? 1) >= 2) chainDeep += 1;
    }
  }
  if (cardTotal(s) !== TOTAL_CARDS) {
    conserved = false;
    console.log(`    seed ${seed}: 卡牌守恒失败 ${cardTotal(s)} != ${TOTAL_CARDS}`);
  }
}

const expectSeen: Array<[string, string]> = [
  ['wusheng', '武圣'], ['paoxiao', '咆哮'], ['longdan', '龙胆'], ['jianxiong', '奸雄'],
  ['fankui', '反馈'], ['guicai', '鬼才'], ['kurou', '苦肉'], ['wushuang', '无双'],
  ['xiaoji', '枭姬'], ['lijian', '离间'], ['biyue', '闭月'], ['guanxing', '观星'],
  ['luoshen', '洛神'], ['qingguo', '倾国'], ['guose', '国色'], ['liuli', '流离'],
  ['qixi', '奇袭'], ['tieji', '铁骑'], ['ganglie', '刚烈'], ['zhiheng', '制衡'],
  ['rende', '仁德'], ['qingnang', '青囊'], ['yingzi', '英姿'], ['fanjian', '反间'],
];
// 【急救】不在自战期望表内：它需要"华佗在场 + 濒死的是自己或主公 + 手牌≥2"三重条件，
// 20 局内常常一次都不触发；由 [6] 构造局面单点覆盖。
for (const [sub, name] of expectSeen) {
  check(`【${name}】发动过（${seen.get(sub) ?? 0} 次）`, (seen.get(sub) ?? 0) > 0);
}
check('【急救】自战触发数（构造局面另测）', true, `本次 ${seen.get('jijiu') ?? 0} 次`);
check('卡牌守恒（每局终局后 113 张）', conserved);

console.log('\n[4] 无懈链（M11）');
check(`无懈总数（${chainSeen} 次）`, chainSeen > 0);
check(`反无懈（chain≥2，${chainDeep} 次）`, chainDeep > 0, '反无懈需立场相悖，AI 才会应答');

console.log('\n[5] 确定性');
function run(seed: number): string {
  let s = setup(seed);
  const acts: Action[] = [];
  while (!s.winner) {
    const a = ruleAction(s, s.pending!.playerId)!;
    acts.push(a);
    s = step(s, a);
  }
  return JSON.stringify({ w: s.winner, log: s.log, acts });
}
check('同 seed 完全可复现（seed 42 跑两遍逐字节相同）', run(42) === run(42));

// —— 6. 构造局面：自战覆盖不到的技能单点验证（M11 新增）——
// 自战里【急救】极少触发（需华佗、濒死者是自己/主公、且手牌≥2），故直接摆出局面。
console.log('\n[6] 构造局面');
{
  const s = setup(1);
  const me = s.players[2]!;
  me.general = 'huatuo';
  me.maxHp = 3;
  me.hp = 1;
  me.hand = [
    { id: 9001, sub: 'sha', suit: '♦', rank: 5 },
    { id: 9002, sub: 'sha', suit: '♥', rank: 7 },
  ];
  s.pending = { kind: 'respondTao', playerId: me.id, dyingId: me.id, askedIds: [] };
  const a = ruleAction(s, me.id);
  const ok = a?.type === 'respondTao' && a.cardId === 9001;
  check('【急救】AI 选红牌当【桃】自救', ok, JSON.stringify(a));
  if (ok && a!.type === 'respondTao') {
    const s2 = step(s, a!);
    check(
      '【急救】生效：日志记 jijiu 且体力 +1',
      s2.log.some(e => e.t === 'skill' && e.sub === 'jijiu') && s2.players[me.id]!.hp === 2,
    );
  }
}
{
  // 反馈（司马懿）：受伤后取走来源一张牌
  const s = setup(1);
  const victim = s.players[1]!;
  victim.general = 'simayi';
  victim.hand = [];
  const src = s.players[3]!;
  src.hand = [{ id: 9101, sub: 'sha', suit: '♠', rank: 3 }];
  s.pending = null;
  s.triggerQueue = [{ sub: 'fankui', playerId: victim.id, sourceId: src.id }];
  advance(s); // 触发队列先于一切：advance 应开出 trigger 询问
  const p2 = s.pending as Inquiry | null;
  check('【反馈】受伤后开出发动询问', p2?.kind === 'trigger' && p2.sub === 'fankui' && p2.playerId === victim.id);
  const s2 = step(s, { type: 'respondTrigger', use: true });
  check(
    '【反馈】发动后取走来源的牌',
    s2.players[src.id]!.hand.length === 0 &&
      s2.players[victim.id]!.hand.length === 1 &&
      s2.log.some(e => e.t === 'skill' && e.sub === 'fankui'),
  );
}
{
  // 反间（周瑜）：猜错花色受伤；且猜测者看不到展示牌
  const s = setup(1);
  const zy = s.players[0]!;
  zy.general = 'zhouyu';
  zy.hand = [{ id: 9201, sub: 'sha', suit: '♦', rank: 5 }];
  const t = s.players[1]!;
  const hpBefore = t.hp;
  s.pending = { kind: 'play', playerId: zy.id };
  const s1 = step(s, { type: 'useSkill', sub: 'fanjian', cardId: 9201, targetIds: [t.id] });
  check(
    '【反间】开出猜花色询问（由目标应答）',
    s1.pending?.kind === 'fanjian' && s1.pending.playerId === t.id,
  );
  check('【反间】猜测者看不到展示牌（view 里 cardId = -1）', viewOf(s1, t.id).pending?.fanjian?.cardId === -1);
  const s2 = step(s1, { type: 'respondFanjian', suit: '♠' }); // 实际是 ♦，猜错
  check(
    '【反间】猜错：目标受 1 点伤害并得到该牌',
    s2.players[t.id]!.hp === hpBefore - 1 && s2.players[t.id]!.hand.some(c => c.id === 9201),
  );
}
{
  // 无懈链：两张无懈相互抵消 → 锦囊恢复生效（偶数=生效）
  const s = setup(1);
  const me = s.players[0]!;
  me.hand = [
    { id: 9301, sub: 'wuzhong', suit: '♥', rank: 3 },
    { id: 9302, sub: 'wuxie', suit: '♠', rank: 4 },
  ];
  const other = s.players[1]!;
  other.hand = [{ id: 9303, sub: 'wuxie', suit: '♣', rank: 6 }];
  for (const idx of [2, 3, 4]) s.players[idx]!.hand = []; // 排除牌堆发的无懈，保证链上只有 0/1 号
  s.pending = { kind: 'play', playerId: me.id };
  const s1 = step(s, { type: 'playTrick', cardId: 9301 }); // 无中生有 → 走帧 + 无懈询问
  const p1 = s1.pending as Inquiry | null;
  check('无中生有走帧：开出无懈询问', p1?.kind === 'respondWuxie');
  const s2 = step(s1, { type: 'respondWuxie', cardId: 9303 }); // 他人无懈 → 抵消生效中
  check('第 1 张无懈：奇偶 = 1（抵消）', negateChain(s2) === 1);
  const s3 = step(s2, { type: 'respondWuxie', cardId: 9302 }); // 自己反无懈 → 恢复
  check('第 2 张无懈：奇偶 = 2（反制恢复）', negateChain(s3) === 2);
  // 牌堆里其他人的无懈已被清空，链自然终止（每人一圈内只被问一次）→ 恢复生效
  check(
    '链终止后无中生有恢复生效：摸 2 张',
    s3.log.some(e => e.t === 'draw' && e.player === me.id && e.n === 2),
    `pending=${(s3.pending as Inquiry | null)?.kind}`,
  );
}

console.log(failed === 0 ? '\n全部通过 ✓' : `\n${failed} 项失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
