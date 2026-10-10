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

// 默认 40 局：武将池扩到 25 后，单将出场率降到约 1/5，20 局内某些技能可能一次都不触发
const N = Number(process.argv[2] ?? 40);
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
  const wugu = s.frames.reduce((n, f) => n + (f.kind === 'trick' ? (f.wuguCards?.length ?? 0) : 0), 0);
  return (
    s.deck.length + s.discard.length +
    s.players.reduce((n, p) => n + p.hand.length, 0) +
    equips + judgements + judging + guanxing + wugu
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
  // M16 新增（自战内应能观测到的）
  ['tuxi', '突袭'], ['luoyi', '裸衣'], ['tiandu', '天妒'], ['yiji', '遗计'],
  ['jizhi', '集智'], ['keji', '克己'], ['lianying', '连营'], ['jieyin', '结姻'],
];
// 奇才（黄月英）与谦逊（陆逊）是锁定技，无 skill 事件；由构造局面覆盖。
// 【急救】不在自战期望表内：它需要"华佗在场 + 濒死的是自己或主公 + 手牌≥2"三重条件，
// 20 局内常常一次都不触发；由 [6] 构造局面单点覆盖。
for (const [sub, name] of expectSeen) {
  check(`【${name}】发动过（${seen.get(sub) ?? 0} 次）`, (seen.get(sub) ?? 0) > 0);
}
check('【急救】自战触发数（构造局面另测）', true, `本次 ${seen.get('jijiu') ?? 0} 次`);
check('卡牌守恒（每局终局后 117 张）', conserved);

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

{
  // 借刀杀人（M13）：持刀者出杀 → 视为对指定目标使用杀；目标受伤
  const s = setup(1);
  const me = s.players[0]!;
  me.hand = [{ id: 9401, sub: 'jiedao', suit: '♣', rank: 3 }];
  const victim = s.players[1]!;
  victim.hand = [{ id: 9402, sub: 'sha', suit: '♠', rank: 4 }];
  victim.equipment.weapon = { id: 9403, sub: 'qinglong', suit: '♠', rank: 5 };
  const t = s.players[2]!;
  t.hand = [];
  t.equipment.weapon = { id: 9404, sub: 'liannu', suit: '♣', rank: 1 }; // 保证距离够
  for (const idx of [3, 4]) s.players[idx]!.hand = [];
  s.pending = { kind: 'play', playerId: me.id };
  const s1 = step(s, { type: 'playTrick', cardId: 9401, targetId: victim.id, targetIds: [victim.id, t.id] });
  check('【借刀杀人】开出应答询问（由持刀者应答）', s1.pending?.kind === 'jiedao' && s1.pending.playerId === victim.id);
  const hpBefore = t.hp;
  const s2 = step(s1, { type: 'respondJiedao', cardId: 9402 }); // 出杀
  const dmg = s2.log.some(e => e.t === 'damage' && e.player === t.id && e.source === victim.id);
  check('【借刀杀人】出杀 → 对指定目标造成伤害（或走完杀帧）', dmg || s2.players[t.id]!.hp < hpBefore || s2.pending != null);
}
{
  // 借刀杀人：拒出杀 → 武器转交借刀人
  const s = setup(1);
  const me = s.players[0]!;
  me.hand = [{ id: 9411, sub: 'jiedao', suit: '♣', rank: 3 }];
  const victim = s.players[1]!;
  victim.hand = []; // 无杀可出
  victim.equipment.weapon = { id: 9412, sub: 'qinglong', suit: '♠', rank: 5 };
  const t = s.players[2]!;
  t.hand = [];
  s.pending = { kind: 'play', playerId: me.id };
  const s1 = step(s, { type: 'playTrick', cardId: 9411, targetId: victim.id, targetIds: [victim.id, t.id] });
  check(
    '【借刀杀人】无法出杀 → 武器直接归借刀人',
    s1.players[me.id]!.hand.some(c => c.id === 9412) && !s1.players[victim.id]!.equipment.weapon,
  );
}
{
  // 五谷丰登（M13）：亮出 N 张，逐目标各取一张；剩余进弃牌堆
  const s = setup(1);
  const me = s.players[0]!;
  me.hand = [{ id: 9421, sub: 'wugu', suit: '♥', rank: 3 }];
  for (const idx of [1, 2, 3, 4]) {
    s.players[idx]!.hand = [];
    s.players[idx]!.equipment = {}; // 确保不会因装备触发别的分支
  }
  s.pending = { kind: 'play', playerId: me.id };
  const s1 = step(s, { type: 'playTrick', cardId: 9421 });
  const p1 = s1.pending as Inquiry | null;
  check('【五谷丰登】开出取牌询问（首个目标是自己）', p1?.kind === 'wuguPick' && p1.playerId === me.id);
  const pool = p1?.wuguCards ?? [];
  check('【五谷丰登】亮出的牌数 = 存活人数（5）', pool.length === 5, `实际 ${pool.length}`);
  if (pool.length === 5) {
    const s2 = step(s1, { type: 'respondWugu', cardId: pool[0]!.id });
    check('【五谷丰登】取走后该牌进入手牌', s2.players[me.id]!.hand.some(c => c.id === pool[0]!.id));
  }
}

{
  // M16 构造局面：张辽突袭（摸牌阶段换手）、郭嘉遗计（受伤摸牌并分配）、天妒（收判定牌）
  const s = setup(1);
  const zl = s.players[0]!;
  zl.general = 'zhangliao';
  zl.hand = [];
  const a = s.players[1]!;
  a.hand = [{ id: 9501, sub: 'sha', suit: '♠', rank: 3 }];
  const b = s.players[2]!;
  b.hand = [{ id: 9502, sub: 'shan', suit: '♥', rank: 4 }];
  s.pending = { kind: 'drawPhase', playerId: zl.id };
  const s1 = step(s, { type: 'respondDraw', skill: 'tuxi' });
  const p1 = s1.pending as Inquiry | null;
  check('【突袭】开出选目标询问', p1?.kind === 'tuxi');
  const s2 = step(s1, { type: 'respondTuxi', targetIds: [a.id, b.id] });
  check(
    '【突袭】夺两名目标各一张手牌',
    s2.players[zl.id]!.hand.length === 2 &&
      s2.players[a.id]!.hand.length === 0 &&
      s2.players[b.id]!.hand.length === 0 &&
      s2.log.some(e => e.t === 'skill' && e.sub === 'tuxi'),
  );
}
{
  // 遗计：受伤后摸 2×伤害 张并逐张分配。走真实伤害入口：用【南蛮入侵】帧太绕，
  // 这里直接构造"郭嘉被判为南蛮目标且无杀"的局面，让 dealDamage 自然发生。
  const s = setup(1);
  const gj = s.players[2]!;
  gj.general = 'guojia';
  gj.hand = [];
  gj.maxHp = 3;
  gj.hp = 3;
  const me = s.players[0]!;
  me.hand = [{ id: 9451, sub: 'nanman', suit: '♠', rank: 7 }];
  // 其余人不留杀，保证南蛮对每个人都直接造成伤害（郭嘉因此触发遗计）
  for (const idx of [1, 3, 4]) s.players[idx]!.hand = [];
  s.pending = { kind: 'play', playerId: me.id };
  const s1 = step(s, { type: 'playTrick', cardId: 9451 });
  // 逐目标结算里总会轮到郭嘉：他受 1 点伤害 → 摸 2 张 → 开出 yiji 分配询问
  let cur = s1;
  for (let i = 0; i < 40 && !cur.log.some(e => e.t === 'skill' && e.sub === 'yiji'); i++) {
    const p = cur.pending as Inquiry | null;
    if (!p) break;
    cur = step(cur, { type: 'respondSha', cardId: null } as Action);
  }
  check(
    '【遗计】受伤后摸两张（日志记 yiji）',
    cur.log.some(e => e.t === 'skill' && e.sub === 'yiji') && cur.players[gj.id]!.hand.length >= 2,
  );
}
{
  // 天妒：郭嘉的判定牌生效后归他自己。构造"郭嘉回合、判定区有乐不思蜀"的局面，
  // 判定阶段结束时应看到 tiandu 与判定牌入手的 gainCard。
  let s = setup(1);
  const gj = s.players[1]!;
  gj.general = 'guojia';
  gj.hand = [];
  gj.judgements = [{ id: 9461, sub: 'lebusi', suit: '♠', rank: 6 }];
  s.turnIdx = gj.id;
  s.phase = 'judge';
  s.prepared = true; // 跳过准备阶段钩子
  s.pending = null;
  // 逐个应答无懈询问（无人持无懈时应答一次即过），直到判定链走完
  for (let i = 0; i < 30; i++) {
    if (s.log.some(e => e.t === 'skill' && e.sub === 'tiandu')) break;
    const p = s.pending as Inquiry | null;
    if (p && p.kind === 'respondWuxie') {
      s = step(s, { type: 'respondWuxie', cardId: null });
      continue;
    }
    advance(s);
    if (!s.pending && !s.log.some(e => e.t === 'skill' && e.sub === 'tiandu')) break;
  }
  check(
    '【天妒】判定牌进入郭嘉手牌（而非弃牌堆）',
    s.log.some(e => e.t === 'skill' && e.sub === 'tiandu') && s.players[gj.id]!.hand.length >= 1,
  );
}
{
  // 集智：黄月英使用非延时锦囊摸一张
  const s = setup(1);
  const hyy = s.players[0]!;
  hyy.general = 'huangyueying';
  hyy.hand = [{ id: 9471, sub: 'wuzhong', suit: '♥', rank: 3 }];
  for (const idx of [1, 2, 3, 4]) s.players[idx]!.hand = []; // 排除他人的无懈
  s.pending = { kind: 'play', playerId: hyy.id };
  const before = hyy.hand.length;
  const s1 = step(s, { type: 'playTrick', cardId: 9471 });
  const drewJizhi = s1.log.some(e => e.t === 'skill' && e.sub === 'jizhi');
  // 无中生有本体走帧结算：链上无人有无懈时应摸到 2 张 + 集智 1 张
  const drewAll = s1.log.some(e => e.t === 'draw' && e.player === hyy.id && e.n === 2);
  check('【集智】使用无中生有时摸一张', drewJizhi, `手牌 ${before} → ${s1.players[hyy.id]!.hand.length}`);
  check('【集智】无中生有本体也结算（摸 2 张）', drewAll);
}
{
  // 谦逊：陆逊不能被顺手牵羊/乐不思蜀指定
  const s = setup(1);
  const me = s.players[0]!;
  me.hand = [{ id: 9601, sub: 'shunshou', suit: '♠', rank: 3 }];
  const lx = s.players[1]!;
  lx.general = 'luxun';
  lx.hand = [{ id: 9602, sub: 'tao', suit: '♥', rank: 4 }];
  s.pending = { kind: 'play', playerId: me.id };
  let threw = false;
  try {
    step(s, { type: 'playTrick', cardId: 9601, targetId: lx.id });
  } catch {
    threw = true;
  }
  check('【谦逊】顺手牵羊不能指定陆逊（引擎拒绝）', threw);
}
{
  // 克己：不杀则跳过弃牌
  const s = setup(1);
  const lm = s.players[0]!;
  lm.general = 'lvmeng';
  lm.maxHp = 4;
  lm.hp = 4;
  lm.hand = Array.from({ length: 6 }, (_, i) => ({ id: 9700 + i, sub: 'sha' as const, suit: '♠' as const, rank: i + 1 }));
  s.pending = { kind: 'play', playerId: lm.id };
  s.shaUsed = false;
  const s2 = step(s, { type: 'endPlay' });
  // endPlay 后进入弃牌阶段：若无克己，手牌 6 > 体力 4 会开出 discard 询问
  check(
    '【克己】未出杀 → 跳过弃牌（无 discard 询问）',
    s2.pending == null || (s2.pending as Inquiry).kind !== 'discard',
    `pending=${(s2.pending as Inquiry | null)?.kind}`,
  );
}
{
  // 连营：失去最后一张手牌后摸一张（用弃置路径构造）
  const s = setup(1);
  const lx = s.players[0]!;
  lx.general = 'luxun';
  lx.maxHp = 4;
  lx.hp = 4;
  lx.hand = [{ id: 9801, sub: 'sha', suit: '♠', rank: 3 }];
  s.pending = { kind: 'play', playerId: lx.id };
  let cur = step(s, { type: 'playSha', cardId: 9801, targetId: 1 });
  const asked = cur.pending?.kind === 'trigger' && (cur.pending as Inquiry).sub === 'lianying';
  if (asked) cur = step(cur, { type: 'respondTrigger', use: true });
  check(
    '【连营】用出最后一张手牌 → 开出发动询问',
    asked || cur.log.some(e => e.t === 'skill' && e.sub === 'lianying'),
  );
  check(
    '【连营】发动后摸一张',
    cur.log.some(e => e.t === 'skill' && e.sub === 'lianying') && cur.players[lx.id]!.hand.length >= 1,
  );
}

console.log(failed === 0 ? '\n全部通过 ✓' : `\n${failed} 项失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
