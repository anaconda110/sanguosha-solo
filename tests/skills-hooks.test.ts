// 五个技能钩子的行为验证（ADR-0026 钩子化后，skills/*.ts）：
//   裸衣 luoyi —— 摸牌阶段少摸一张（4→5），本回合【杀】/【决斗】伤害 +1（经 damageBonus 字段）
//   克己 keji  —— 本回合未使用/打出过【杀】则跳过弃牌阶段
//   天妒 tiandu —— 判定牌生效后收进手牌（否则框架入弃牌堆）
//   集智 jizhi —— 使用非延时锦囊摸一张（延时锦囊与无懈不算）
//   闭月 biyue —— 回合结束摸一张（死亡玩家不摸）
// 裸衣/克己/闭月走完整 step() 流程：setup 末尾 advance 会把主公推进到首个决策点
// （setup.ts:95），扫描 seed 定位对应武将坐在 0 号位即可从真实局面驱动；
// 天妒/集智直接构造最小局面调用钩子。钩子经 SkillOps 拿到 step.ts 原语，
// 直调时注入一个最小 ops（drawCards 复刻 step.ts:1722 的"牌堆弹出，空则洗回"）。
import { describe, expect, it } from 'vitest';
import { setup } from '../src/engine/setup';
import { step } from '../src/engine/step';
import { SKILL_HOOKS } from '../src/engine/skills';
import type { SkillCtx, SkillOps } from '../src/engine/skill-runtime';
import type { GameState, JudgeState, PlayerState } from '../src/engine/types';
import { makeCard, makePlayer } from './helpers';

// —— 直调钩子用的最小 ops：只有 drawCards / reshuffleIfNeeded 会被用到 ——
const ops: SkillOps = {
  dealDamage() { throw new Error('本测试未用到 dealDamage'); },
  hurt() { throw new Error('本测试未用到 hurt'); },
  drawCards(s, id, n) {
    for (let i = 0; i < n; i++) {
      if (s.deck.length === 0) { s.deck = s.discard; s.discard = []; }
      s.players[id]!.hand.push(s.deck.pop()!);
    }
  },
  reshuffleIfNeeded(s) {
    if (s.deck.length === 0 && s.discard.length > 0) { s.deck = s.discard; s.discard = []; }
  },
  drawJudgeCard() { throw new Error('本测试未用到 drawJudgeCard'); },
  beginJudge() { throw new Error('本测试未用到 beginJudge'); },
  queueTrigger() { throw new Error('本测试未用到 queueTrigger'); },
  drawPhaseDefault() { throw new Error('本测试未用到 drawPhaseDefault'); },
  othersInOrder() { throw new Error('本测试未用到 othersInOrder'); },
  seatDistance() { throw new Error('本测试未用到 seatDistance'); },
  hasAnyCard() { throw new Error('本测试未用到 hasAnyCard'); },
  askSkillPick() { throw new Error('本测试未用到 askSkillPick'); },
  removeFromHand() { throw new Error('本测试未用到 removeFromHand'); },
  shaHit() { throw new Error('本测试未用到 shaHit'); },
  makeTrickFrame() { throw new Error('本测试未用到 makeTrickFrame'); },
};

function makeState(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  return {
    seed: 1, deck: [], discard: [], players, turnIdx: 0, turnCount: 0,
    phase: 'play', playedSha: false, turnPlays: 0, judging: false, skipDraw: false,
    skipPlay: false, damageBonus: 0, shaUsed: false, drawPhaseAsked: false,
    prepared: true, usedSkills: [], frames: [], frameSeq: 0, triggerQueue: [],
    judgeState: null, pending: null, log: [], actionLog: [], winner: null,
    ...overrides,
  };
}

/** 扫描 seed 找"指定武将坐主公位"的初始局（setup 纯函数，可重复调用） */
function findSeed(general: string, extra?: (s: GameState) => boolean, max = 400): { seed: number; s: GameState } {
  for (let seed = 1; seed <= max; seed++) {
    const s = setup(seed);
    if (s.players[0]!.general !== general) continue;
    if (extra && !extra(s)) continue;
    return { seed, s };
  }
  throw new Error(`seed ≤ ${max} 内找不到主公位为 ${general}（含附加条件）的种子`);
}

/** 杀的目标选 1 号位：需排除流离/铁骑（杀的目标询问）与奸雄/反馈/遗计/刚烈（受伤后触发询问），
 *  否则结算会被技能询问打断，断言面扩大 */
const SHA_TARGET_BLOCKERS = ['dajiao', 'machao', 'caocao', 'simayi', 'guojia', 'xiahoudun'];
const safeShaTarget = (s: GameState) => !SHA_TARGET_BLOCKERS.includes(s.players[1]!.general);

describe('裸衣 luoyi（许褚）', () => {
  it('respondDraw 选择裸衣：少摸一张（手牌 4→5 而非 6）、damageBonus +1、进出牌阶段', () => {
    const { s } = findSeed('xuchu');
    expect(s.pending?.kind).toBe('drawPhase'); // 摸牌阶段先问许褚（step.ts advance → drawPhaseAsk）
    const s2 = step(s, { type: 'respondDraw', skill: 'luoyi' });
    expect(s2.players[0]!.hand).toHaveLength(5);
    expect(s2.damageBonus).toBe(1);
    expect(s2.phase).toBe('play');
    expect(s2.pending?.kind).toBe('play');
    expect(s2.log).toContainEqual({ t: 'skill', player: 0, sub: 'luoyi' });
    expect(s2.log).toContainEqual({ t: 'draw', player: 0, n: 1 });
  });

  it('完整流程：裸衣杀命中伤害 2（1+1）；同 seed 对照——默认摸牌则伤害 1', () => {
    const { seed, s } = findSeed('xuchu', st => st.players[0]!.hand.some(c => c.sub === 'sha') && safeShaTarget(st));
    const shaId = s.players[0]!.hand.find(c => c.sub === 'sha')!.id;

    // 裸衣线：摸牌抉择选裸衣，再对相邻的 1 号位出杀
    const s1 = step(s, { type: 'respondDraw', skill: 'luoyi' });
    const hpBefore1 = s1.players[1]!.hp;
    const afterSha1 = step(s1, { type: 'playSha', cardId: shaId, targetId: 1 });
    const hit1 = afterSha1.pending?.kind === 'respondShan'
      ? step(afterSha1, { type: 'respondShan', cardId: null })
      : afterSha1;
    expect(hit1.log).toContainEqual({ t: 'damage', player: 1, amount: 2, source: 0 });
    expect(hit1.players[1]!.hp).toBe(hpBefore1 - 2);

    // 对照线：同 seed 同手牌，摸牌阶段不选技能 → 无加成
    const base = setup(seed);
    const s0 = step(base, { type: 'respondDraw' });
    expect(s0.damageBonus).toBe(0);
    const hpBefore0 = s0.players[1]!.hp;
    const afterSha0 = step(s0, { type: 'playSha', cardId: shaId, targetId: 1 });
    const hit0 = afterSha0.pending?.kind === 'respondShan'
      ? step(afterSha0, { type: 'respondShan', cardId: null })
      : afterSha0;
    expect(hit0.log).toContainEqual({ t: 'damage', player: 1, amount: 1, source: 0 });
    expect(hit0.players[1]!.hp).toBe(hpBefore0 - 1);
  });

  it('钩子单元：modifyShaDamage 读 damageBonus；drawPhaseChoice 置位加成并摸 1 张', () => {
    const s = makeState([makePlayer(0, 'xuchu', 'zhu')]);
    const ctx: SkillCtx = { player: s.players[0]! };
    expect(SKILL_HOOKS.luoyi.modifyShaDamage!(s, ctx)).toBe(0);
    s.damageBonus = 1;
    expect(SKILL_HOOKS.luoyi.modifyShaDamage!(s, ctx)).toBe(1);

    const s2 = makeState([makePlayer(0, 'xuchu', 'zhu')], { phase: 'draw', deck: [makeCard('tao', '♥', 1)] });
    expect(SKILL_HOOKS.luoyi.drawPhaseChoice!(s2, { player: s2.players[0]! }, ops)).toBe(true);
    expect(s2.players[0]!.hand).toHaveLength(1);
    expect(s2.damageBonus).toBe(1);
    expect(s2.phase).toBe('play');
  });
});

describe('克己 keji（吕蒙）', () => {
  it('完整流程：本回合未用杀 → endPlay 后跳过弃牌阶段（无 discard 询问），log 记克己，轮到下家', () => {
    const { s } = findSeed('lvmeng');
    expect(s.pending?.kind).toBe('play');
    const lord = s.players[0]!;
    expect(lord.hand.length).toBeGreaterThan(lord.hp); // 确有超出体力上限的手牌需要弃
    const s2 = step(s, { type: 'endPlay' });
    expect(s2.pending?.kind).not.toBe('discard');
    expect(s2.log).toContainEqual({ t: 'skill', player: 0, sub: 'keji' });
    expect(s2.turnIdx).toBe(1);
  });

  it('对照：无克己的武将（关羽）同样局面 endPlay → 出现弃牌询问', () => {
    const { s } = findSeed('guanyu');
    expect(s.pending?.kind).toBe('play');
    const lord = s.players[0]!;
    expect(lord.hand.length).toBeGreaterThan(lord.hp);
    const s2 = step(s, { type: 'endPlay' });
    expect(s2.pending?.kind).toBe('discard');
    expect(s2.pending!.count).toBe(lord.hand.length - lord.hp);
    expect(s2.log.some(e => e.t === 'skill' && e.sub === 'keji')).toBe(false);
  });

  it('钩子单元：shaUsed 置位（使用或打出过杀）时不再跳过；非克己持有者恒 false', () => {
    const sUnused = makeState([makePlayer(0, 'lvmeng', 'zhu')], { shaUsed: false });
    expect(SKILL_HOOKS.keji.skipDiscard!(sUnused, { player: sUnused.players[0]! })).toBe(true);
    expect(sUnused.log).toContainEqual({ t: 'skill', player: 0, sub: 'keji' });

    const sUsed = makeState([makePlayer(0, 'lvmeng', 'zhu')], { shaUsed: true });
    expect(SKILL_HOOKS.keji.skipDiscard!(sUsed, { player: sUsed.players[0]! })).toBe(false);

    const sOther = makeState([makePlayer(0, 'guanyu', 'zhu')], { shaUsed: false });
    expect(SKILL_HOOKS.keji.skipDiscard!(sOther, { player: sOther.players[0]! })).toBe(false);
  });
});

describe('天妒 tiandu（郭嘉）', () => {
  const judge = (forId: number, mode: JudgeState['mode'], reason: JudgeState['reason'], result: ReturnType<typeof makeCard>): Omit<JudgeState, 'usedGuicai'> & { usedGuicai: number[] } => ({
    forId, mode, reason, result, usedGuicai: [],
  });

  it('判定牌生效后收进手牌，返回 true（框架不再入弃牌堆），log 记技能与 gainCard', () => {
    const s = makeState([makePlayer(0, 'guojia', 'zhu'), makePlayer(1, 'baiban', 'fan')]);
    const card = makeCard('shandian', '♠', 5);
    const ok = SKILL_HOOKS.tiandu.judgeCardGain!(
      s,
      { player: s.players[0]!, judge: judge(0, 'delayed', 'shandian', card) },
    );
    expect(ok).toBe(true);
    expect(s.players[0]!.hand).toContainEqual(card);
    expect(s.log).toContainEqual({ t: 'skill', player: 0, sub: 'tiandu', detail: '获得判定牌' });
    expect(s.log).toContainEqual({ t: 'gainCard', player: 0, from: 0 });
  });

  it('对所有判定 mode 生效（八卦/铁骑/刚烈/洛神/延时）', () => {
    const modes: Array<[JudgeState['mode'], JudgeState['reason']]> = [
      ['bagua', 'bagua'], ['tieji', 'tieji'], ['ganglie', 'ganglie'], ['luoshen', 'luoshen'], ['delayed', 'lebusi'],
    ];
    for (const [mode, reason] of modes) {
      const s = makeState([makePlayer(0, 'guojia', 'zhu')]);
      const ok = SKILL_HOOKS.tiandu.judgeCardGain!(
        s,
        { player: s.players[0]!, judge: judge(0, mode, reason, makeCard('tao', '♥', 3)) },
      );
      expect(ok).toBe(true);
      expect(s.players[0]!.hand).toHaveLength(1);
    }
  });

  it('非天妒持有者：返回 false（判定牌由框架进弃牌堆），手牌不变', () => {
    const s = makeState([makePlayer(0, 'baiban', 'zhu')]);
    const ok = SKILL_HOOKS.tiandu.judgeCardGain!(
      s,
      { player: s.players[0]!, judge: judge(0, 'delayed', 'lebusi', makeCard('tao', '♥', 3)) },
    );
    expect(ok).toBe(false);
    expect(s.players[0]!.hand).toHaveLength(0);
  });
});

describe('集智 jizhi（黄月英）', () => {
  it('非延时锦囊（含无中生有/过河拆桥/决斗等）使用时摸一张，log 记 skill + draw', () => {
    const nonDelayed = ['wuzhong', 'guohe', 'shunshou', 'juedou', 'nanman', 'wanjian', 'taoyuan', 'wugu', 'jiedao'] as const;
    for (const sub of nonDelayed) {
      const s = makeState([makePlayer(0, 'huangyueying', 'zhu')], { deck: [makeCard('tao', '♥', 1)] });
      SKILL_HOOKS.jizhi.onTrickPlayed!(s, { player: s.players[0]!, cardSub: sub }, ops);
      expect(s.players[0]!.hand, sub).toHaveLength(1);
      expect(s.log, sub).toContainEqual({ t: 'skill', player: 0, sub: 'jizhi' });
      expect(s.log, sub).toContainEqual({ t: 'draw', player: 0, n: 1 });
    }
  });

  it('延时锦囊（乐/兵/闪电）与无懈可击不摸', () => {
    const excluded = ['lebusi', 'bingliang', 'shandian', 'wuxie'] as const;
    for (const sub of excluded) {
      const s = makeState([makePlayer(0, 'huangyueying', 'zhu')], { deck: [makeCard('tao', '♥', 1)] });
      SKILL_HOOKS.jizhi.onTrickPlayed!(s, { player: s.players[0]!, cardSub: sub }, ops);
      expect(s.players[0]!.hand, sub).toHaveLength(0);
      expect(s.log.some(e => e.t === 'skill' && e.sub === 'jizhi'), sub).toBe(false);
    }
  });

  it('非集智持有者不摸', () => {
    const s = makeState([makePlayer(0, 'baiban', 'zhu')], { deck: [makeCard('tao', '♥', 1)] });
    SKILL_HOOKS.jizhi.onTrickPlayed!(s, { player: s.players[0]!, cardSub: 'wuzhong' }, ops);
    expect(s.players[0]!.hand).toHaveLength(0);
  });
});

describe('闭月 biyue（貂蝉）', () => {
  it('完整流程：主公貂蝉弃牌收尾后回合结束摸一张，轮到下家', () => {
    const { s } = findSeed('diaochan');
    expect(s.pending?.kind).toBe('play');
    const lord = s.players[0]!;
    expect(lord.hand).toHaveLength(6); // 4 起手 + 摸牌 2
    const afterEnd = step(s, { type: 'endPlay' }); // 3 血主公 +1 → hp4，6−4=2 → 弃牌询问
    expect(afterEnd.pending?.kind).toBe('discard');
    expect(afterEnd.pending!.count).toBe(2);
    const ids = afterEnd.players[0]!.hand.slice(0, 2).map(c => c.id);
    const s2 = step(afterEnd, { type: 'discard', cardIds: ids });
    expect(s2.log).toContainEqual({ t: 'skill', player: 0, sub: 'biyue' });
    expect(s2.log).toContainEqual({ t: 'draw', player: 0, n: 1 });
    expect(s2.players[0]!.hand).toHaveLength(4 + 1); // 弃 2 剩 4 + 闭月 1
    expect(s2.turnIdx).toBe(1);
  });

  it('钩子单元：死亡玩家不摸；非闭月持有者不摸', () => {
    const dead = makePlayer(0, 'diaochan', 'zhu');
    dead.alive = false;
    const s = makeState([dead], { deck: [makeCard('tao', '♥', 1)] });
    SKILL_HOOKS.biyue.onTurnEnd!(s, { player: s.players[0]! }, ops);
    expect(s.players[0]!.hand).toHaveLength(0);

    const s2 = makeState([makePlayer(0, 'guanyu', 'zhu')], { deck: [makeCard('tao', '♥', 1)] });
    SKILL_HOOKS.biyue.onTurnEnd!(s2, { player: s2.players[0]! }, ops);
    expect(s2.players[0]!.hand).toHaveLength(0);
  });

  it('钩子单元：存活持有者回合结束摸一张（牌堆 −1）', () => {
    const s = makeState([makePlayer(0, 'diaochan', 'zhu')], { deck: [makeCard('tao', '♥', 1)] });
    SKILL_HOOKS.biyue.onTurnEnd!(s, { player: s.players[0]! }, ops);
    expect(s.players[0]!.hand).toHaveLength(1);
    expect(s.deck).toHaveLength(0);
    expect(s.log).toContainEqual({ t: 'skill', player: 0, sub: 'biyue' });
    expect(s.log).toContainEqual({ t: 'draw', player: 0, n: 1 });
  });
});
