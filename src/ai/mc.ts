// A2 蒙特卡洛 AI（ADR-0006）：根决策 MC 只管出牌阶段，响应类沿用规则策略。
// 确定性：采样随机数从公开状态字段派生，同一 seed 的整局对局仍可复现。
// 本文件以增量方式构建（骨架先行、小步 Edit、每步 tsc 验证）。
import { canPlayShaNow, cloneState, hasAnyCard, inShaRange, seatDistance, step } from '../engine/step';
import { canActAsSha, hasSkill, isKongcheng } from '../engine/skills';
import { CARD_INFO } from '../engine/types';
import type { Action, Card, GameState, Identity, PlayerState } from '../engine/types';
import { ruleAction } from './rule';

const ROLLOUTS = 4; // 每候选 rollout 次数（预算实测调定：决策 ≈ 1s）
const ROLLOUT_CAP = 150; // rollout 步数上限，超出按部分局面评估
const MAX_CANDIDATES = 4; // 候选上限（含结束出牌）；ADR-0006 上限 6 的收紧实现

const SIDE_OF: Record<Identity, 'zhu' | 'fan' | 'nei'> = {
  zhu: 'zhu',
  zhong: 'zhu',
  fan: 'fan',
  nei: 'nei',
};

/** AI 统一入口：仅回合首个出牌决策走 MC（ADR-0006 第 1 条），其余沿用规则策略 */
export function aiAction(s: GameState, playerId: number): Action | null {
  const pend = s.pending!;
  if (pend.kind === 'play' && s.turnPlays === 0) {
    const cands = playCandidates(s, playerId);
    if (cands.length > 1) return mcPick(s, playerId, cands);
  }
  return ruleAction(s, playerId);
}

// —— MC 内部：以下函数体由后续小步 Edit 逐段补齐 ——

/** MC 采样随机数：由公开状态字段哈希派生（确定性，ADR-0006 第 3 条） */
function sampleRng(s: GameState, playerId: number): () => number {
  let h = (s.seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (s.turnIdx + 1), 2654435761);
  for (const p of s.players) {
    if (!p.alive) continue;
    h = Math.imul(h ^ (p.hand.length * 31 + p.hp), 2246822519);
  }
  let a = h | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FULL_MULTISEC: Identity[] = ['zhu', 'zhong', 'fan', 'fan', 'nei'];

/**
 * 确定性化（PIMC，ADR-0006 第 2 条）：未知牌池 = 他人手牌 ∪ 牌堆，均匀重洗后
 * 按各家手牌数重发，余下作新牌堆；弃牌堆公开、保留不动。隐藏身份按多重集
 * 约束均匀指派（死者已亮扣除）。读取他人手牌仅用于池化——采样结果与真实
 * 手牌内容统计独立，不构成读牌。
 */
function determinize(s: GameState, viewerId: number, rng: () => number): GameState {
  const d = cloneState(s);
  d.log = s.log; // 仿真不读日志；共享只读引用让 step() 的拼接链保持正确
  d.actionLog = s.actionLog;

  const pool: Card[] = [];
  const sizes: Array<{ p: PlayerState; n: number }> = [];
  for (const p of d.players) {
    if (!p.alive || p.id === viewerId) continue;
    pool.push(...p.hand);
    sizes.push({ p, n: p.hand.length });
    p.hand = [];
  }
  pool.push(...d.deck);
  d.deck = [];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let k = 0;
  for (const { p, n } of sizes) {
    p.hand = pool.slice(k, k + n);
    k += n;
  }
  d.deck = pool.slice(k);

  const taken: Identity[] = ['zhu'];
  const hidden: PlayerState[] = [];
  for (const p of d.players) {
    if (p.id === viewerId || p.identity === 'zhu') continue; // 自己/主公保持真实
    if (!p.alive) {
      taken.push(p.identity); // 死亡即亮明
      continue;
    }
    hidden.push(p);
  }
  const remaining = FULL_MULTISEC.filter(x => {
    const i = taken.indexOf(x);
    if (i >= 0) {
      taken.splice(i, 1);
      return false;
    }
    return true;
  });
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  hidden.forEach((p, i) => {
    p.identity = remaining[i]!;
  });
  return d;
}



/**
 * 出牌阶段候选集（≤ MAX_CANDIDATES，含结束出牌）：
 * 桃 / 每个射程内敌人一张杀（素材取真杀优先、其次技能转换）/ 每类锦囊一个
 * 候选（目标沿用规则启发式，MC 评估"是否值得出"而非"打谁"）/ 装备。
 */
function playCandidates(s: GameState, playerId: number): Action[] {
  const me = s.players[playerId]!;
  const hand = me.hand;
  const out: Action[] = [];
  const enemies = s.players.filter(p => p.alive && p.id !== playerId);

  const tao = hand.find(c => c.sub === 'tao');
  if (tao && me.hp < me.maxHp) out.push({ type: 'playTao', cardId: tao.id });

  const canSha = canPlayShaNow(s, me);
  if (canSha) {
    for (const t of enemies) {
      if (!inShaRange(s, playerId, t.id)) continue;
      if (isKongcheng(t)) continue;
      const mat =
        hand.find(c => c.sub === 'sha') ??
        (hasSkill(me, 'wusheng')
          ? hand.find(c => c.sub !== 'sha' && c.sub !== 'tao' && canActAsSha(me, c))
          : undefined) ??
        (hasSkill(me, 'longdan') ? hand.find(c => c.sub === 'shan') : undefined);
      if (mat) out.push({ type: 'playSha', cardId: mat.id, targetId: t.id });
    }
  }

  for (const c of hand) {
    if (c.sub === 'wuzhong' || c.sub === 'nanman' || c.sub === 'wanjian' || c.sub === 'taoyuan') {
      out.push({ type: 'playTrick', cardId: c.id });
    } else if (c.sub === 'guohe' || c.sub === 'juedou') {
      const t = enemies.find(x => hasAnyCard(x) && (c.sub === 'guohe' || !isKongcheng(x)));
      if (t) out.push({ type: 'playTrick', cardId: c.id, targetId: t.id });
    } else if (c.sub === 'shunshou') {
      const t = enemies.find(x => hasAnyCard(x) && seatDistance(s, playerId, x.id) <= 1);
      if (t) out.push({ type: 'playTrick', cardId: c.id, targetId: t.id });
    } else if (c.sub === 'lebusi') {
      const t = enemies.find(x => !x.judgements.some(j => (j.asSub ?? j.sub) === 'lebusi'));
      if (t) out.push({ type: 'playTrick', cardId: c.id, targetId: t.id });
    } else if (c.sub === 'bingliang') {
      const t = enemies.find(
        x => !x.judgements.some(j => (j.asSub ?? j.sub) === 'bingliang') && seatDistance(s, playerId, x.id) <= 1,
      );
      if (t) out.push({ type: 'playTrick', cardId: c.id, targetId: t.id });
    } else if (CARD_INFO[c.sub].kind === 'equip') {
      out.push({ type: 'playEquip', cardId: c.id });
    }
  }

  const top = out.slice(0, MAX_CANDIDATES - 1);
  top.push({ type: 'endPlay' }); // 结束出牌恒为候选
  return top;
}

/** 截断局面的部分评估：存活与血量差折算 0.1~0.9（ADR-0006 第 1 条，惩罚拖延） */
function partialScore(s: GameState, playerId: number): number {
  const me = s.players[playerId]!;
  const mySide = SIDE_OF[me.identity];
  let mine = 0;
  let theirs = 0;
  let meAlive = false;
  for (const p of s.players) {
    if (!p.alive) continue;
    if (p.id === playerId) meAlive = true;
    if (SIDE_OF[p.identity] === mySide) mine += p.hp;
    else theirs += p.hp;
  }
  const base = meAlive ? 0.5 : 0;
  return Math.max(0.1, Math.min(0.9, base + (mine - theirs) / 16));
}

/** rollout：规则 AI 打到终局或 ROLLOUT_CAP 截断，返回己方视角得分 */
function rollout(s0: GameState, playerId: number): number {
  let s = s0;
  for (let i = 0; i < ROLLOUT_CAP && !s.winner; i++) {
    const pend = s.pending;
    if (!pend) throw new Error('rollout 遇到无 pending 且未终局');
    const a = ruleAction(s, pend.playerId);
    if (!a) throw new Error('rollout 规则 AI 无法应答');
    s = step(s, a);
  }
  if (s.winner) {
    const me = s.players[playerId]!;
    return s.winner.side === SIDE_OF[me.identity] ? 1 : 0;
  }
  return partialScore(s, playerId);
}

/** 根决策：每候选确定性化 × ROLLOUTS 次仿真，取己方视角均分最高者 */
function mcPick(s: GameState, playerId: number, cands: Action[]): Action {
  const rng = sampleRng(s, playerId);
  let best = cands[0]!;
  let bestScore = -1;
  for (const c of cands) {
    let sum = 0;
    for (let r = 0; r < ROLLOUTS; r++) {
      const d = determinize(s, playerId, rng);
      sum += rollout(step(d, c), playerId);
    }
    const score = sum / ROLLOUTS;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
