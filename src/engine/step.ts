// 引擎核心（ADR-0002/0004/0005/0010）：step(state, action) → 新状态，纯函数推进。
// 自动流转集中在 advance()：触发队列 → 判定链（鬼才）→ 结算栈 → 阶段机；
// 推进到需要玩家决策时以 pending 停下。濒死求桃是全局打断，不触碰帧。
import { randU32, shuffleInPlace } from './rng';
import { TOTAL_CARDS } from './cards';
import { CARD_INFO, GENERAL_FACTION, GENERAL_SEX } from './types';
import {
  asTrickSub,
  canActAsSha as skillCanActAsSha,
  canActAsShan as skillCanActAsShan,
  hasShaMaterial,
  hasSkill,
  isKongcheng,
  isRedCard,
} from './skills';
import type {
  Action,
  Card,
  CardSub,
  DelayedFrame,
  EquipSlot,
  Frame,
  GameState,
  Inquiry,
  JudgeState,
  PendingTrigger,
  PlayerState,
  ShaFrame,
  TrickFrame,
} from './types';

export { TOTAL_CARDS };

/** 回合上限：合法最长局远低于此（观测最长 4126 步）；超限强制平局防 AI 死守（ADR-0007） */
export const MAX_TURNS = 5000;

export function step(prev: GameState, action: Action): GameState {
  if (prev.winner) throw new Error('游戏已结束');
  if (!prev.pending) throw new Error('当前没有待决策的询问');
  validate(prev, prev.pending, action);
  const s = cloneState(prev);
  apply(s, prev.pending, action);
  checkLianying(s, prev); // 连营（M16）：动作本身导致手牌清空（出牌/弃置）时入队
  s.actionLog.push(action);
  advance(s);
  // 再查一次：帧内结算（顺手牵羊/过河拆桥拿走最后一张）也会造成手牌清空，
  // 那种情况发生在 advance 期间。queueTrigger 按技能去重，两次检测不会重复触发。
  checkLianying(s, prev);
  // 日志与动作日志是纯追加（ADR-0006）：apply/advance 期间只写缓冲，
  // 最后整表引用拼接——深拷贝不再随日志增长（MC 仿真的性能前提）
  const bufferedEvents = s.log;
  const bufferedActions = s.actionLog;
  s.log = prev.log.concat(bufferedEvents);
  s.actionLog = prev.actionLog.concat(bufferedActions);
  return s;
}

/**
 * 深拷贝可变游戏状态（玩家/牌堆/帧等）；log 与 actionLog 先置空作缓冲、
 * 由 step() 统一拼接。导出供 MC 仿真克隆使用（ADR-0006）。
 */
export function cloneState(prev: GameState): GameState {
  const { log: _log, actionLog: _actionLog, ...rest } = prev;
  const s = structuredClone(rest) as GameState;
  s.log = [];
  s.actionLog = [];
  return s;
}

// —— 公开查询与技能判定（AI 与 UI 共用）——

export function seatDistance(s: GameState, from: number, to: number): number {
  if (from === to) return 0;
  const order = s.players.filter(p => p.alive).map(p => p.id);
  const fi = order.indexOf(from);
  const ti = order.indexOf(to);
  if (fi < 0 || ti < 0) return 99;
  const n = order.length;
  const gap = Math.abs(ti - fi);
  let d = Math.min(gap, n - gap);
  if (s.players[from]!.equipment.jian1ma) d -= 1;
  if (hasSkill(s.players[from]!, 'mashu')) d -= 1; // 马术（马超·锁定）
  if (s.players[to]!.equipment.jia1ma) d += 1;
  return Math.max(d, 1);
}

export function attackRange(s: GameState, playerId: number): number {
  const w = s.players[playerId]!.equipment.weapon;
  return w ? CARD_INFO[w.sub].range ?? 1 : 1;
}

export function inShaRange(s: GameState, from: number, to: number): boolean {
  return seatDistance(s, from, to) <= attackRange(s, from);
}

export function hasAnyCard(p: PlayerState): boolean {
  return p.hand.length > 0 || Object.keys(p.equipment).length > 0;
}

/** 判定区牌的生效牌名：转换放置的延时锦囊以 asSub 为准（M8） */
export function zoneSub(c: Card): CardSub {
  return c.asSub ?? c.sub;
}

/** 武圣：红色牌当杀；龙胆：闪当杀（skills.ts 转发，保持既有导入面） */
export function canActAsSha(p: PlayerState, c: Card): boolean {
  return skillCanActAsSha(p, c);
}

/** 龙胆：杀当闪 */
export function canActAsShan(p: PlayerState, c: Card): boolean {
  return skillCanActAsShan(p, c);
}

/** 使用【杀】的次数限制：咆哮/连弩豁免 */
export function canPlayShaNow(s: GameState, p: PlayerState): boolean {
  return !s.playedSha || p.equipment.weapon?.sub === 'liannu' || hasSkill(p, 'paoxiao');
}

function equipSlotOf(sub: CardSub): EquipSlot {
  if (sub === 'bagua') return 'shield';
  if (sub === 'jia1ma') return 'jia1ma';
  if (sub === 'jian1ma') return 'jian1ma';
  return 'weapon';
}

// —— 校验 ——

function validate(s: GameState, pend: Inquiry, a: Action): void {
  const actor = s.players[pend.playerId]!;
  const hasCard = (id: number, sub?: CardSub) =>
    actor.hand.some(c => c.id === id && (sub == null || c.sub === sub));
  switch (pend.kind) {
    case 'play':
      if (a.type === 'playSha') {
        if (!canPlayShaNow(s, actor)) throw new Error('本回合已使用过【杀】');
        const c = actor.hand.find(x => x.id === a.cardId);
        if (!c) throw new Error('手中没有这张牌');
        if (a.cardId2 != null) {
          // 丈八蛇矛：任意两张手牌当杀
          if (actor.equipment.weapon?.sub !== 'zhangba') throw new Error('需装备【丈八蛇矛】');
          const c2 = actor.hand.find(x => x.id === a.cardId2);
          if (!c2 || c2.id === c.id) throw new Error('【丈八蛇矛】需要两张不同的手牌');
        } else if (!canActAsSha(actor, c)) {
          throw new Error('这张牌不能当【杀】使用');
        }
        if (a.targetIds != null) {
          // 方天画戟：杀是最后的手牌时可指定至多三个目标
          if (actor.equipment.weapon?.sub !== 'fangtian') throw new Error('需装备【方天画戟】');
          if (a.targetIds.length < 2 || a.targetIds.length > 3) throw new Error('【方天画戟】目标数不合法');
          if (actor.hand.length !== (a.cardId2 != null ? 2 : 1)) throw new Error('【方天画戟】：必须是最后的手牌');
          if (a.targetIds[0] !== a.targetId) throw new Error('目标顺序不合法');
          const seen = new Set<number>();
          for (const tid of a.targetIds) {
            const t = s.players[tid];
            if (!t || !t.alive || t.id === actor.id) throw new Error('【杀】的目标不合法');
            if (isKongcheng(t)) throw new Error('目标【空城】，不能成为【杀】的目标');
            if (seen.has(tid)) throw new Error('目标重复');
            seen.add(tid);
            if (!inShaRange(s, actor.id, tid)) throw new Error('目标超出攻击范围');
          }
        } else {
          const t = s.players[a.targetId];
          if (!t || !t.alive || t.id === actor.id) throw new Error('【杀】的目标不合法');
          if (isKongcheng(t)) throw new Error('目标【空城】，不能成为【杀】的目标');
          if (!inShaRange(s, actor.id, a.targetId)) throw new Error('目标超出攻击范围');
        }
      } else if (a.type === 'playTao') {
        if (!hasCard(a.cardId, 'tao')) throw new Error('手中没有这张【桃】');
        if (actor.hp >= actor.maxHp) throw new Error('体力已满，不能使用【桃】');
      } else if (a.type === 'playTrick') {
        // 锦囊转换（M8）：国色方块当乐不思蜀、奇袭黑牌当过河拆桥；生效牌名以 asSub 表达
        const card = actor.hand.find(c => c.id === a.cardId);
        if (!card) throw new Error('手中没有这张牌');
        const asSub = asTrickSub(actor, card);
        if (!asSub) throw new Error('这张牌不是可使用的锦囊');
        if (asSub === 'wuxie') throw new Error('【无懈可击】只能作为响应打出');
        if (asSub === 'shandian') {
          if (a.targetId != null && a.targetId !== actor.id) throw new Error('【闪电】只能置于自己判定区');
          if (actor.judgements.some(c => zoneSub(c) === 'shandian')) throw new Error('你的判定区已有【闪电】');
          return;
        }
        if (asSub === 'lebusi' || asSub === 'bingliang') {
          const t = a.targetId == null ? undefined : s.players[a.targetId];
          if (!t || !t.alive || t.id === actor.id) throw new Error('延时锦囊目标不合法');
          // 谦逊（陆逊·锁定）：不能被【乐不思蜀】指定（M16）
          if (asSub === 'lebusi' && hasSkill(t, 'qianxun')) throw new Error('目标【谦逊】，不能成为【乐不思蜀】的目标');
          if (t.judgements.some(c => zoneSub(c) === asSub)) throw new Error('目标判定区已有该锦囊');
          if (asSub === 'bingliang' && !hasSkill(actor, 'qicai') && seatDistance(s, actor.id, t.id) > 1)
            throw new Error('【兵粮寸断】目标距离超过 1');
          return;
        }
        if (asSub === 'jiedao') {
          // 借刀杀人：指定一名有武器的角色与一个杀的目标（M13）
          const [victimId, shaTargetId] = a.targetIds ?? [];
          const victim = victimId == null ? undefined : s.players[victimId];
          if (!victim || !victim.alive || victim.id === actor.id) throw new Error('【借刀杀人】目标不合法');
          if (!victim.equipment.weapon) throw new Error('【借刀杀人】目标未装备武器');
          const st = shaTargetId == null ? undefined : s.players[shaTargetId];
          if (!st || !st.alive || st.id === victim.id) throw new Error('【借刀杀人】杀的目标不合法');
          if (isKongcheng(st)) throw new Error('目标【空城】，不能成为【杀】的目标');
          if (!inShaRange(s, victim.id, st.id)) throw new Error('【借刀杀人】杀的目标超出其攻击范围');
          return;
        }
        const needsTarget = asSub === 'guohe' || asSub === 'shunshou' || asSub === 'juedou';
        if (needsTarget) {
          const t = a.targetId == null ? undefined : s.players[a.targetId];
          if (!t || !t.alive || t.id === actor.id) throw new Error('锦囊目标不合法');
          // 只有拆/顺要求目标有牌；决斗对空手玩家合法（其无法出杀，直接受伤）
          if (asSub !== 'juedou' && !hasAnyCard(t)) throw new Error('目标没有牌');
          if (asSub === 'juedou' && isKongcheng(t)) throw new Error('目标【空城】，不能成为【决斗】的目标');
          // 谦逊（陆逊·锁定）：不能成为【顺手牵羊】的目标（M16；乐不思蜀在延时分支拦）
          if (asSub === 'shunshou' && hasSkill(t, 'qianxun'))
            throw new Error('目标【谦逊】，不能成为该锦囊的目标');
          if (asSub === 'shunshou' && !hasSkill(actor, 'qicai') && seatDistance(s, actor.id, t.id) > 1)
            throw new Error('【顺手牵羊】目标距离超过 1');
        } else if (a.targetId != null) {
          throw new Error('该锦囊不需要指定目标');
        }
      } else if (a.type === 'playEquip') {
        const card = actor.hand.find(c => c.id === a.cardId);
        if (!card || CARD_INFO[card.sub].kind !== 'equip') throw new Error('手中没有这张装备');
      } else if (a.type === 'useSkill') {
        if (a.sub === 'kurou') {
          if (!hasSkill(actor, 'kurou')) throw new Error('你没有该技能');
          if (actor.hp <= 1) throw new Error('体力不足，不能发动【苦肉】');
        } else if (a.sub === 'zhiheng') {
          if (!hasSkill(actor, 'zhiheng')) throw new Error('你没有该技能');
          if (s.usedSkills.includes('zhiheng')) throw new Error('【制衡】每回合限一次');
          if (!a.cardIds || a.cardIds.length === 0) throw new Error('【制衡】至少弃置一张手牌');
          if (new Set(a.cardIds).size !== a.cardIds.length || !a.cardIds.every(id => hasCard(id)))
            throw new Error('弃置的牌不合法');
        } else if (a.sub === 'rende') {
          if (!hasSkill(actor, 'rende')) throw new Error('你没有该技能');
          if (s.usedSkills.includes('rende')) throw new Error('【仁德】每回合限一次');
          if (!a.cardIds || a.cardIds.length === 0) throw new Error('【仁德】至少给出一张手牌');
          if (new Set(a.cardIds).size !== a.cardIds.length || !a.cardIds.every(id => hasCard(id)))
            throw new Error('给出的牌不合法');
          const t = a.targetIds?.[0] == null ? undefined : s.players[a.targetIds[0]];
          if (!t || !t.alive || t.id === actor.id) throw new Error('【仁德】目标不合法');
        } else if (a.sub === 'qingnang') {
          if (!hasSkill(actor, 'qingnang')) throw new Error('你没有该技能');
          if (s.usedSkills.includes('qingnang')) throw new Error('【青囊】每回合限一次');
          if (a.cardId == null || !hasCard(a.cardId)) throw new Error('【青囊】需要弃置一张手牌');
          const t = a.targetIds?.[0] == null ? undefined : s.players[a.targetIds[0]];
          if (!t || !t.alive) throw new Error('【青囊】目标不合法');
          if (t.hp >= t.maxHp) throw new Error('【青囊】目标体力已满');
        } else if (a.sub === 'jieyin') {
          // 结姻（孙尚香·M16）：弃两张手牌，选择一名已受伤的男性角色，双方各回复 1 点
          if (!hasSkill(actor, 'jieyin')) throw new Error('你没有该技能');
          if (s.usedSkills.includes('jieyin')) throw new Error('【结姻】每回合限一次');
          if (!a.cardIds || a.cardIds.length !== 2) throw new Error('【结姻】需要弃置两张手牌');
          if (new Set(a.cardIds).size !== 2 || !a.cardIds.every(id => hasCard(id)))
            throw new Error('【结姻】弃置的牌不合法');
          const t = a.targetIds?.[0] == null ? undefined : s.players[a.targetIds[0]];
          if (!t || !t.alive || t.id === actor.id) throw new Error('【结姻】目标不合法');
          if (GENERAL_SEX[t.general] !== 'm') throw new Error('【结姻】目标必须是男性');
          if (t.hp >= t.maxHp) throw new Error('【结姻】目标体力已满');
        } else if (a.sub === 'fanjian') {
          if (!hasSkill(actor, 'fanjian')) throw new Error('你没有该技能');
          if (s.usedSkills.includes('fanjian')) throw new Error('【反间】每回合限一次');
          const c = actor.hand.find(x => x.id === a.cardId);
          if (!c) throw new Error('【反间】需要展示一张手牌');
          const t = a.targetIds?.[0] == null ? undefined : s.players[a.targetIds[0]];
          if (!t || !t.alive || t.id === actor.id) throw new Error('【反间】目标不合法');
        } else if (a.sub === 'lijian') {
          if (!hasSkill(actor, 'lijian')) throw new Error('你没有该技能');
          if (s.usedSkills.includes('lijian')) throw new Error('【离间】每回合限一次');
          const c = actor.hand.find(x => x.id === a.cardId);
          if (!c) throw new Error('【离间】需要弃置一张手牌');
          if (!a.targetIds || a.targetIds.length !== 2 || a.targetIds[0] === a.targetIds[1])
            throw new Error('【离间】需要两名不同的男性角色');
          for (const tid of a.targetIds) {
            const t = s.players[tid];
            if (!t || !t.alive || t.id === actor.id) throw new Error('【离间】目标不合法');
            if (GENERAL_SEX[t.general] !== 'm') throw new Error('【离间】目标必须是男性');
          }
        } else {
          throw new Error('该技能不能主动发动');
        }
      } else if (a.type !== 'endPlay') {
        throw new Error('出牌阶段的动作不合法');
      }
      break;
    case 'respondShan': {
      if (a.type === 'respondBagua') {
        if (!actor.equipment.shield) throw new Error('未装备【八卦阵】');
        if (pend.qinggang) throw new Error('【青釭剑】无视八卦阵');
        if (pend.aidForId != null) throw new Error('【护驾】需打出【闪】，不能代判定八卦阵');
        break;
      }
      if (a.type !== 'respondShan') throw new Error('应答类型不合法');
      if (a.cardId != null) {
        const c = actor.hand.find(x => x.id === a.cardId);
        if (!c || !canActAsShan(actor, c)) throw new Error('这张牌不能当【闪】打出');
      }
      break;
    }
    case 'respondSha':
      if (a.type !== 'respondSha') throw new Error('应答类型不合法');
      if (a.cardId != null) {
        const c = actor.hand.find(x => x.id === a.cardId);
        if (!c || !canActAsSha(actor, c)) throw new Error('这张牌不能当【杀】打出');
      }
      break;
    case 'shaAgain':
      if (a.type !== 'shaAgain') throw new Error('应答类型不合法');
      if (a.cardId != null) {
        const c = actor.hand.find(x => x.id === a.cardId);
        if (!c || !canActAsSha(actor, c)) throw new Error('这张牌不能当【杀】使用');
      }
      break;
    case 'pickCard': {
      if (a.type !== 'pickCard') throw new Error('应答类型不合法');
      const pt = s.players[pend.trickTargetId!]!;
      if (a.from === 'hand' && pt.hand.length === 0) throw new Error('目标没有手牌');
      if (a.from !== 'hand' && !pt.equipment[a.from]) throw new Error('目标没有这件装备');
      break;
    }
    case 'respondWuxie':
      if (a.type !== 'respondWuxie') throw new Error('应答类型不合法');
      if (a.cardId != null && !hasCard(a.cardId, 'wuxie')) throw new Error('手中没有这张【无懈可击】');
      break;
    case 'respondTao':
      if (a.type !== 'respondTao') throw new Error('应答类型不合法');
      if (a.cardId != null) {
        const c = actor.hand.find(x => x.id === a.cardId);
        if (!c) throw new Error('手中没有这张牌');
        if (c.sub !== 'tao' && !(hasSkill(actor, 'jijiu') && isRedCard(c)))
          throw new Error('这张牌不能当【桃】使用');
      }
      break;
    case 'trigger':
      if (a.type !== 'respondTrigger') throw new Error('应答类型不合法');
      break;
    case 'skillCard':
      if (a.type !== 'respondSkillCard') throw new Error('应答类型不合法');
      if (a.cardId != null && !hasCard(a.cardId)) throw new Error('手中没有这张牌');
      break;
    case 'discard':
      if (a.type !== 'discard') throw new Error('应答类型不合法');
      if (a.cardIds.length !== (pend.count ?? 0)) throw new Error('弃牌数量不正确');
      if (new Set(a.cardIds).size !== a.cardIds.length || !a.cardIds.every(id => hasCard(id)))
        throw new Error('弃置的牌不合法');
      break;
    case 'cixiong':
      if (a.type !== 'respondCixiong') throw new Error('应答类型不合法');
      if (a.discard && actor.hand.length === 0) throw new Error('没有手牌可弃');
      break;
    case 'guanshi':
      if (a.type !== 'respondGuanshi') throw new Error('应答类型不合法');
      if (a.cardIds != null) {
        if (a.cardIds.length !== 2) throw new Error('【贯石斧】需要弃置两张手牌');
        if (new Set(a.cardIds).size !== a.cardIds.length || !a.cardIds.every(id => hasCard(id)))
          throw new Error('弃置的牌不合法');
      }
      break;
    case 'guanxing': {
      if (a.type !== 'respondGuanxing') throw new Error('应答类型不合法');
      const shown = pend.guanxingCards ?? [];
      if (new Set(a.topIds).size !== a.topIds.length || !a.topIds.every(id => shown.some(c => c.id === id)))
        throw new Error('观星的牌不合法');
      break;
    }
    case 'liuli':
      if (a.type !== 'respondLiuli') throw new Error('应答类型不合法');
      if (a.cardId != null) {
        if (!hasCard(a.cardId)) throw new Error('手中没有这张牌');
        const to = a.transferTo == null ? undefined : s.players[a.transferTo];
        if (!to || !to.alive || to.id === actor.id || to.id === pend.liuliSourceId)
          throw new Error('【流离】转移目标不合法');
        if (!pend.liuliTo?.includes(to.id)) throw new Error('【流离】目标不在可选范围');
      }
      break;
    case 'lordSkill':
      if (a.type !== 'respondLord') throw new Error('应答类型不合法');
      break;
    case 'drawPhase':
      if (a.type !== 'respondDraw') throw new Error('应答类型不合法');
      if (a.skill === 'tuxi' && !hasSkill(actor, 'tuxi')) throw new Error('你没有【突袭】');
      if (a.skill === 'luoyi' && !hasSkill(actor, 'luoyi')) throw new Error('你没有【裸衣】');
      break;
    case 'tuxi':
      if (a.type !== 'respondTuxi') throw new Error('应答类型不合法');
      break;
    case 'yiji':
      if (a.type !== 'respondYiji') throw new Error('应答类型不合法');
      if (!pend.yijiPool?.some(c => c.id === a.cardId)) throw new Error('【遗计】选择的牌不合法');
      if (a.toId != null && !s.players[a.toId]?.alive) throw new Error('【遗计】目标不合法');
      break;
    case 'fanjian':
      if (a.type !== 'respondFanjian') throw new Error('应答类型不合法');
      break;
    case 'wuguPick':
      if (a.type !== 'respondWugu') throw new Error('应答类型不合法');
      if (!pend.wuguCards?.some(c => c.id === a.cardId)) throw new Error('五谷丰登：选择的牌不合法');
      break;
    case 'jiedao':
      if (a.type !== 'respondJiedao') throw new Error('应答类型不合法');
      if (a.cardId != null) {
        const c = actor.hand.find(x => x.id === a.cardId);
        if (!c || !canActAsSha(actor, c)) throw new Error('这张牌不能当【杀】使用');
      }
      break;
  }
}

// —— 动作应用 ——

function apply(s: GameState, pend: Inquiry, a: Action): void {
  const actor = s.players[pend.playerId]!;
  switch (a.type) {
    case 'playSha': {
      s.pending = null;
      s.turnPlays += 1;
      const card = removeFromHand(actor, a.cardId);
      s.discard.push(card);
      if (a.cardId2 != null) {
        s.discard.push(removeFromHand(actor, a.cardId2));
        s.log.push({ t: 'ability', player: actor.id, sub: 'zhangba', detail: '两张手牌当【杀】使用' });
      }
      if (a.targetIds != null) {
        s.log.push({ t: 'ability', player: actor.id, sub: 'fangtian', detail: `指定 ${a.targetIds.length} 个目标` });
      }
      s.log.push({ t: 'playCard', player: actor.id, card: 'sha', target: a.targetId, targets: a.targetIds });
      s.playedSha = true;
      s.shaUsed = true; // 克己（吕蒙）：本回合用过杀就不能跳过弃牌
      startSha(s, actor.id, card.id, a.targetIds ?? [a.targetId]);
      break;
    }
    case 'playTao': {
      s.pending = null;
      s.turnPlays += 1;
      s.discard.push(removeFromHand(actor, a.cardId));
      s.log.push({ t: 'playCard', player: actor.id, card: 'tao' });
      actor.hp = Math.min(actor.maxHp, actor.hp + 1);
      s.log.push({ t: 'heal', player: actor.id, amount: 1 });
      break;
    }
    case 'playTrick': {
      s.pending = null;
      s.turnPlays += 1;
      const card = removeFromHand(actor, a.cardId);
      const asSub = asTrickSub(actor, card)!; // 校验已保证非空
      if (asSub !== card.sub) {
        s.log.push({ t: 'skill', player: actor.id, sub: asSub === 'lebusi' ? 'guose' : 'qixi', detail: `将【${CARD_INFO[card.sub].display}】当【${CARD_INFO[asSub].display}】使用` });
      }
      s.log.push({ t: 'playCard', player: actor.id, card: asSub, target: a.targetId });
      checkJizhi(s, actor, asSub); // 集智（黄月英）：非延时锦囊摸一张（M16）
      switch (asSub) {
        case 'wuzhong':
          // 无中生有：走帧结算才有无懈询问（M11）；牌本体随出牌入弃牌堆（帧只记因果 cardId）
          s.discard.push(card);
          s.frames.push(makeTrickFrame(s, actor.id, asSub, card));
          break;
        case 'taoyuan': {
          // 桃园结义：对每名存活角色（含使用者，从使用者起按座次）结算，逐目标可无懈（M11）
          s.discard.push(card);
          s.frames.push(makeTrickFrame(s, actor.id, asSub, card));
          break;
        }
        case 'wugu': {
          // 五谷丰登：对每名存活角色（从使用者起按座次）结算，逐目标可无懈（M13）
          s.discard.push(card);
          s.frames.push(makeTrickFrame(s, actor.id, asSub, card));
          break;
        }
        case 'jiedao': {
          // 借刀杀人：指定持武器者与杀的目标（M13）
          const [victimId, shaTargetId] = a.targetIds ?? [];
          s.discard.push(card);
          s.log.push({ t: 'playCard', player: actor.id, card: asSub, targets: [...a.targetIds!] });
          const fr = makeTrickFrame(s, actor.id, asSub, card, [victimId!]);
          fr.jiedaoTargetId = shaTargetId;
          s.frames.push(fr);
          break;
        }
        case 'lebusi': {
          const t = s.players[a.targetId!]!;
          t.judgements.push({ ...card, asSub: 'lebusi' });
          break;
        }
        case 'shandian': {
          actor.judgements.push({ ...card, asSub: 'shandian' });
          break;
        }
        case 'bingliang': {
          const t = s.players[a.targetId!]!;
          t.judgements.push({ ...card, asSub: 'bingliang' });
          break;
        }
        default: {
          // 过河拆桥/顺手牵羊/决斗：单目标；南蛮/万箭：其余存活玩家按座次
          s.discard.push(card);
          const targets = a.targetId != null ? [a.targetId] : othersInOrder(s, actor.id);
          s.frames.push(makeTrickFrame(s, actor.id, asSub, card, targets));
        }
      }
      break;
    }
    case 'playEquip': {
      s.pending = null;
      s.turnPlays += 1;
      const card = removeFromHand(actor, a.cardId);
      const slot = equipSlotOf(card.sub);
      const old = actor.equipment[slot];
      if (old) {
        s.discard.push(old);
        s.log.push({ t: 'unequip', player: actor.id, sub: old.sub });
        loseEquipTrigger(s, actor);
      }
      actor.equipment[slot] = card;
      s.log.push({ t: 'equip', player: actor.id, sub: card.sub });
      break;
    }
    case 'useSkill': {
      s.pending = null;
      s.turnPlays += 1;
      s.usedSkills.push(a.sub);
      s.log.push({ t: 'skill', player: actor.id, sub: a.sub });
      if (a.sub === 'kurou') {
        // 苦肉：失去 1 点体力（无来源），摸两张
        hurt(s, actor.id, 1, undefined);
        drawCards(s, actor.id, 2);
        s.log.push({ t: 'draw', player: actor.id, n: 2 });
      } else if (a.sub === 'zhiheng') {
        // 制衡：弃任意张手牌并摸等量的牌
        const ids = new Set(a.cardIds!);
        const kept: Card[] = [];
        for (const c of actor.hand) (ids.has(c.id) ? s.discard : kept).push(c);
        actor.hand = kept;
        s.log.push({ t: 'skill', player: actor.id, sub: 'zhiheng', detail: `弃置 ${a.cardIds!.length} 张，摸 ${a.cardIds!.length} 张` });
        s.log.push({ t: 'discardCards', player: actor.id, n: a.cardIds!.length });
        drawCards(s, actor.id, a.cardIds!.length);
        s.log.push({ t: 'draw', player: actor.id, n: a.cardIds!.length });
      } else if (a.sub === 'rende') {
        // 仁德：把手牌交给一名其他角色；给出不少于两张则回复1点体力
        const t = s.players[a.targetIds![0]!]!;
        const ids = new Set(a.cardIds!);
        const kept: Card[] = [];
        for (const c of actor.hand) (ids.has(c.id) ? t.hand : kept).push(c);
        actor.hand = kept;
        s.log.push({ t: 'skill', player: actor.id, sub: 'rende', detail: `将 ${a.cardIds!.length} 张手牌交给 ${t.name}` });
        if (a.cardIds!.length >= 2 && actor.hp < actor.maxHp) {
          actor.hp += 1;
          s.log.push({ t: 'heal', player: actor.id, amount: 1 });
        }
      } else if (a.sub === 'qingnang') {
        // 青囊：弃一张手牌，令一名已受伤角色回复1点体力（不占出桃次数）
        const t = s.players[a.targetIds![0]!]!;
        s.discard.push(removeFromHand(actor, a.cardId!));
        s.log.push({ t: 'skill', player: actor.id, sub: 'qingnang', detail: `${t.name} 回复1点体力` });
        t.hp += 1;
        s.log.push({ t: 'heal', player: t.id, amount: 1 });
      } else if (a.sub === 'fanjian') {
        // 反间：令目标猜一种花色；猜错则受 1 点伤害（展示的手牌无论如何都交给目标）
        const t = s.players[a.targetIds![0]!]!;
        s.log.push({ t: 'skill', player: actor.id, sub: 'fanjian', detail: `令 ${t.name} 猜一种花色` });
        s.pending = { kind: 'fanjian', playerId: t.id, fanjian: { sourceId: actor.id, cardId: a.cardId! } };
      } else if (a.sub === 'jieyin') {
        // 结姻：弃两张手牌，双方各回复 1 点（自己满血时也照样回，取上限）
        const t = s.players[a.targetIds![0]!]!;
        const ids = new Set(a.cardIds!);
        const kept: Card[] = [];
        for (const c of actor.hand) (ids.has(c.id) ? s.discard : kept).push(c);
        actor.hand = kept;
        s.log.push({ t: 'discardCards', player: actor.id, n: 2 });
        s.log.push({ t: 'skill', player: actor.id, sub: 'jieyin', detail: `与 ${t.name} 各回复1点体力` });
        actor.hp = Math.min(actor.maxHp, actor.hp + 1);
        t.hp = Math.min(t.maxHp, t.hp + 1);
        s.log.push({ t: 'heal', player: actor.id, amount: 1 });
        s.log.push({ t: 'heal', player: t.id, amount: 1 });
      } else if (a.sub === 'lijian') {
        // 离间：弃一张手牌，视为第一名男性对第二名男性使用【决斗】
        // （被弃的手牌即决斗帧的因果牌，入弃牌堆；可被无懈可击抵消）
        const card = removeFromHand(actor, a.cardId!);
        s.discard.push(card);
        const [userId, targetId] = a.targetIds!;
        s.frames.push(makeTrickFrame(s, userId, 'juedou', card, [targetId]));
      }
      break;
    }
    case 'endPlay': {
      s.pending = null;
      s.phase = 'discard';
      break;
    }
    case 'respondShan': {
      const f = pend.frameId != null ? s.frames.find(fr => fr.id === pend.frameId) : undefined;
      // 护驾（主公技）：应答者可能是代主公出闪的盟友——效果归于主公（bearer）
      const bearer = pend.aidForId != null ? s.players[pend.aidForId]! : actor;
      s.pending = null;
      if (a.cardId != null) {
        s.discard.push(removeFromHand(actor, a.cardId));
        s.log.push({ t: 'respond', player: actor.id, card: 'shan', resp: 'shan', aid: pend.aidForId });
        if (f && f.kind === 'trick') {
          advanceTarget(s, f); // 万箭：本目标通过
        } else {
          const need = pend.needShan ?? 1;
          const played = (pend.shanPlayed ?? 0) + 1;
          if (played >= need) {
            shaDodged(s, pend.shaSourceId!, bearer.id, pend.frameId, pend.shaCardId);
          } else {
            // 无双：还需再出一张闪（继续由同一人应答）
            s.pending = { ...pend, shanPlayed: played };
          }
        }
      } else if (pend.aidForId != null) {
        // 盟友不出闪：换下一个盟友，都不应则回退给主公自己
        s.log.push({ t: 'respond', player: actor.id, card: null, resp: 'shan' });
        askNextAid(s, pend);
      } else {
        s.log.push({ t: 'respond', player: actor.id, card: null, resp: 'shan' });
        if (f && f.kind === 'trick') {
          advanceTarget(s, f);
          dealDamage(s, actor.id, 1, f.userId, f.cardId);
        } else {
          // 裸衣（许褚）：杀造成的伤害 +1（M16）
          dealDamage(s, actor.id, shaDamageAmount(s, pend.shaSourceId!), pend.shaSourceId, pend.shaCardId);
          if (f && f.kind === 'sha') f.idx += 1;
        }
      }
      break;
    }
    case 'respondBagua': {
      // 八卦阵：判定红色视为出闪（判定链在 advance 中推进，鬼才可改判）
      s.pending = null;
      beginJudge(s, {
        forId: actor.id,
        reason: 'bagua',
        result: drawJudgeCard(s, actor.id, 'bagua'),
        mode: 'bagua',
        baguaPend: pend,
      });
      break;
    }
    case 'respondSha': {
      const f = topFrame(s, pend.frameId);
      const opponent = actor.id === f.userId ? f.targets[f.idx]! : f.userId;
      s.pending = null;
      if (a.cardId != null) {
        s.discard.push(removeFromHand(actor, a.cardId));
        s.log.push({ t: 'respond', player: actor.id, card: 'sha', resp: 'sha', aid: pend.aidForId });
        s.shaUsed = true; // 克己（吕蒙）：打出杀也算（原版为"使用或打出"）
        if (f.sub !== 'juedou') {
          advanceTarget(s, f); // 南蛮：本目标通过
          return;
        }
        const need = hasSkill(actor, 'wushuang') ? 2 : 1;
        f.duelShaPlayed += 1;
        if (f.duelShaPlayed >= need) {
          f.duelShaPlayed = 0;
          f.duelTurn = opponent; // 轮到对方出杀
        } else {
          // 无双：还需再打出一张杀（继续同一个人）
          s.pending = { kind: 'respondSha', playerId: actor.id, frameId: f.id, trickSub: f.sub, trickTargetId: f.targets[0], aidForId: pend.aidForId };
        }
      } else if (pend.aidForId != null) {
        // 盟友不出杀：换下一个盟友，都不应则回退给主公自己
        s.log.push({ t: 'respond', player: actor.id, card: null, resp: 'sha' });
        askNextAid(s, pend);
      } else {
        advanceTarget(s, f);
        // 裸衣（许褚）：决斗造成的伤害 +1（M16）
        dealDamage(s, actor.id, shaDamageAmount(s, opponent), opponent, f.cardId);
      }
      break;
    }
    case 'shaAgain': {
      // 青龙偃月刀：杀被闪避后对相同目标再使用一张杀（可递归）
      s.pending = null;
      if (pend.frameId != null) advanceSha(s, pend.frameId); // 外层杀帧先推进，避免完成后重复询问
      if (a.cardId != null) {
        const target = s.players[pend.targetId!]!;
        const card = removeFromHand(actor, a.cardId);
        s.discard.push(card);
        s.log.push({ t: 'playCard', player: actor.id, card: 'sha', target: target.id });
        startSha(s, actor.id, card.id, [target.id]);
      }
      break;
    }
    case 'respondWuxie': {
      const f = frameFor(s, pend.frameId ?? -1);
      if (f.kind === 'sha') throw new Error('【杀】不可被无懈');
      s.pending = null;
      if (a.cardId != null) {
        s.discard.push(removeFromHand(actor, a.cardId));
        s.log.push({ t: 'respond', player: actor.id, card: 'wuxie', resp: 'wuxie' });
        // 无懈链（M11）：每张无懈翻转一次是否被抵消（wuxieCount 奇偶），
        // 并重开一圈询问——因为"该不该反无懈"是一个新问题。链必然终止：无懈是有限手牌。
        f.wuxieCount += 1;
        s.log.push({ t: 'negate', player: actor.id, sub: f.sub, targetId: trickTargetOf(f), chain: f.wuxieCount });
        f.askedWuxieIds = [actor.id];
      } else {
        s.log.push({ t: 'respond', player: actor.id, card: null, resp: 'wuxie' });
        f.askedWuxieIds = [...f.askedWuxieIds, actor.id];
      }
      break;
    }
    case 'respondTao': {
      const dying = s.players[pend.dyingId!]!;
      const asked = [...(pend.askedIds ?? []), actor.id];
      s.pending = null;
      if (a.cardId != null) {
        const card = removeFromHand(actor, a.cardId);
        s.discard.push(card);
        dying.hp += 1;
        if (card.sub !== 'tao') {
          s.log.push({ t: 'skill', player: actor.id, sub: 'jijiu', detail: `将【${CARD_INFO[card.sub].display}】当【桃】使用` });
        }
        s.log.push({ t: 'respond', player: actor.id, card: 'tao', resp: 'tao' });
        s.log.push({ t: 'heal', player: dying.id, amount: 1 });
        // 救援（孙权·主公技）：其他吴势力角色对主公使用【桃】时，主公额外回复 1 点（M14）
        if (
          actor.id !== dying.id &&
          dying.identity === 'zhu' &&
          hasSkill(dying, 'jiuyuan') &&
          GENERAL_FACTION[actor.general] === 'wu'
        ) {
          dying.hp += 1;
          s.log.push({ t: 'skill', player: dying.id, sub: 'jiuyuan', detail: `${actor.name} 的【桃】额外回复1点` });
          s.log.push({ t: 'heal', player: dying.id, amount: 1 });
        }
        if (dying.hp <= 0) askNextTao(s, dying.id, pend.shaSourceId ?? null, asked);
      } else {
        s.log.push({ t: 'respond', player: actor.id, card: null, resp: 'tao' });
        askNextTao(s, dying.id, pend.shaSourceId ?? null, asked);
      }
      break;
    }
    case 'respondTrigger': {
      s.pending = null;
      const p = s.players[pend.playerId]!;
      if (a.use) {
        s.usedSkills.push(pend.sub!);
        s.log.push({ t: 'skill', player: p.id, sub: pend.sub! });
        if (pend.sub === 'jianxiong') {
          for (const c of pend.triggerCards ?? []) {
            const i = s.discard.findIndex(x => x.id === c.id);
            if (i >= 0) {
              const [card] = s.discard.splice(i, 1);
              p.hand.push(card!);
            }
          }
        } else if (pend.sub === 'fankui' && pend.triggerSourceId != null) {
          const src = s.players[pend.triggerSourceId]!;
          askSkillPick(s, p.id, 'fankui', src.id);
        } else if (pend.sub === 'xiaoji') {
          drawCards(s, p.id, 2);
          s.log.push({ t: 'draw', player: p.id, n: 2 });
        } else if (pend.sub === 'luoshen') {
          beginJudge(s, { forId: p.id, reason: 'luoshen', result: drawJudgeCard(s, p.id, 'luoshen'), mode: 'luoshen' });
        } else if (pend.sub === 'yiji') {
          // 遗计：牌已在伤害结算时摸进手里，这里逐张问分配（全部留给自己 = 直接结束）
          const pool = (pend.triggerCards ?? []).filter(c => p.hand.some(x => x.id === c.id));
          if (pool.length > 0) s.pending = { kind: 'yiji', playerId: p.id, yijiPool: pool };
        } else if (pend.sub === 'lianying') {
          drawCards(s, p.id, 1);
          s.log.push({ t: 'draw', player: p.id, n: 1 });
        }
      }
      break;
    }
    case 'respondSkillCard': {
      s.pending = null;
      const p = s.players[pend.playerId]!;
      if (a.cardId == null) {
        // 放弃发动（鬼才不替换）：本判定不再询问该玩家
        if (s.judgeState) s.judgeState.usedGuicai.push(p.id);
        break;
      }
      const card = removeFromHand(p, a.cardId);
      s.log.push({ t: 'skill', player: p.id, sub: pend.sub!, detail: `弃【${CARD_INFO[card.sub].display}】` });
      if (pend.sub === 'guicai' && s.judgeState) {
        // 鬼才：打出的手牌成为新判定牌，旧判定牌进弃牌堆（判定牌在生效时统一处置）
        const old = s.judgeState.result;
        s.judgeState.result = card;
        s.discard.push(old);
        s.judgeState.usedGuicai.push(p.id);
        s.log.push({ t: 'judgeModify', player: p.id, sub: 'guicai', card });
      } else {
        s.discard.push(card);
      }
      break;
    }
    case 'pickCard': {
      const target = s.players[pend.trickTargetId!]!;
      s.pending = null;
      if (pend.skillPick) {
        const owner = s.players[pend.skillPick.ownerId]!;
        resolvePickFrom(s, target, a.from, 'give', owner);
        s.log.push({ t: 'gainCard', player: owner.id, from: target.id });
      } else {
        const f = topFrame(s, pend.frameId);
        resolvePickFrom(s, target, a.from, f.sub === 'guohe' ? 'discard' : 'give', s.players[f.userId]!);
        if (f.sub === 'guohe') s.log.push({ t: 'discardCards', player: target.id, n: 1 });
        else s.log.push({ t: 'gainCard', player: f.userId, from: target.id });
        advanceTarget(s, f);
      }
      break;
    }
    case 'discard': {
      const ids = new Set(a.cardIds);
      const kept: Card[] = [];
      for (const c of actor.hand) (ids.has(c.id) ? s.discard : kept).push(c);
      actor.hand = kept;
      s.log.push({ t: 'discardCards', player: actor.id, n: a.cardIds.length });
      s.pending = null;
      if (pend.cixiong) {
        // 雌雄双股剑：目标弃手牌，【杀】对其无效（帧推进到下一目标）
        const cx = s.players[pend.cixiong.sourceId]!;
        s.log.push({ t: 'ability', player: cx.id, sub: 'cixiong', detail: `${actor.name} 弃置一张手牌，【杀】对其无效` });
        advanceSha(s, pend.cixiong.frameId);
      }
      break;
    }
    case 'respondCixiong': {
      s.pending = null;
      const cx = s.players[pend.cixiong!.sourceId]!;
      if (a.discard) {
        s.pending = { kind: 'discard', playerId: actor.id, count: 1, cixiong: pend.cixiong };
      } else {
        drawCards(s, cx.id, 1);
        s.log.push({ t: 'draw', player: cx.id, n: 1 });
        s.log.push({ t: 'ability', player: cx.id, sub: 'cixiong', detail: `${actor.name} 让其摸一张牌` });
      }
      break;
    }
    case 'respondGuanshi': {
      s.pending = null;
      const g = pend.guanshi!;
      if (a.cardIds != null) {
        const ids = new Set(a.cardIds);
        const kept: Card[] = [];
        for (const c of actor.hand) (ids.has(c.id) ? s.discard : kept).push(c);
        actor.hand = kept;
        s.log.push({ t: 'discardCards', player: actor.id, n: 2 });
        s.log.push({ t: 'ability', player: actor.id, sub: 'guanshi', detail: '弃两张手牌，【杀】强行命中' });
        if (g.frameId >= 0) advanceSha(s, g.frameId);
        shaHit(s, actor.id, g.targetId, g.shaCardId);
      } else if (g.frameId >= 0) {
        advanceSha(s, g.frameId);
      }
      break;
    }
    case 'respondGuanxing': {
      // 观星：topIds[0] 最先被摸到 → 逆序压回牌堆顶；其余按原顺序置底
      s.pending = null;
      const shown = pend.guanxingCards ?? [];
      const byId = new Map(shown.map(c => [c.id, c]));
      const topSet = new Set(a.topIds);
      const rest = shown.filter(c => !topSet.has(c.id));
      s.deck.unshift(...rest);
      for (let i = a.topIds.length - 1; i >= 0; i--) s.deck.push(byId.get(a.topIds[i]!)!);
      s.log.push({
        t: 'skill',
        player: actor.id,
        sub: 'guanxing',
        detail: `观星 ${shown.length} 张：${a.topIds.length} 张置顶`,
      });
      break;
    }
    case 'respondLiuli': {
      // 流离：弃一张手牌并把杀转移给所选男性（帧内当前目标直接换人，stepSha 重新推进）
      s.pending = null;
      const f = pend.frameId != null ? s.frames.find(fr => fr.id === pend.frameId) : undefined;
      if (a.cardId != null && f && f.kind === 'sha') {
        s.discard.push(removeFromHand(actor, a.cardId));
        s.log.push({ t: 'skill', player: actor.id, sub: 'liuli', detail: `弃牌，【杀】转移给 ${s.players[a.transferTo!]!.name}` });
        f.targets[f.idx] = a.transferTo!;
      }
      break;
    }
    case 'respondFanjian': {
      // 反间：展示手牌交给目标；猜错花色则受 1 点伤害（周瑜造成）
      s.pending = null;
      const fj = pend.fanjian!;
      const source = s.players[fj.sourceId]!;
      const card = removeFromHand(source, fj.cardId);
      actor.hand.push(card);
      s.log.push({ t: 'skill', player: source.id, sub: 'fanjian', detail: `展示【${CARD_INFO[card.sub].display}】交给 ${actor.name}` });
      s.log.push({ t: 'gainCard', player: actor.id, from: source.id });
      if (a.suit === card.suit) {
        s.log.push({ t: 'skill', player: source.id, sub: 'fanjian', detail: `${actor.name} 猜中花色，未受伤` });
      } else {
        dealDamage(s, actor.id, 1, source.id);
      }
      break;
    }
    case 'respondWugu': {
      // 五谷丰登：取走所选的一张，帧推进到下一个目标
      s.pending = null;
      const f = topFrame(s, pend.frameId);
      const pool = f.wuguCards!;
      const i = pool.findIndex(c => c.id === a.cardId);
      const [picked] = pool.splice(i, 1);
      actor.hand.push(picked!);
      s.log.push({ t: 'gainCard', player: actor.id, from: actor.id });
      advanceTarget(s, f);
      if (f.idx >= f.targets.length) {
        // 最后一个目标领完：剩余的牌进弃牌堆
        s.discard.push(...pool);
        s.log.push({ t: 'discardCards', player: f.userId, n: pool.length });
        f.wuguCards = [];
      }
      break;
    }
    case 'respondJiedao': {
      // 借刀杀人：打出杀则视为对指定目标使用；否则交出武器
      s.pending = null;
      const f = topFrame(s, pend.frameId);
      const jd = pend.jiedao!;
      const victim = s.players[jd.victim]!;
      if (a.cardId != null) {
        const card = removeFromHand(victim, a.cardId);
        s.discard.push(card);
        s.log.push({ t: 'playCard', player: victim.id, card: 'sha', target: pend.targetId });
        s.log.push({ t: 'ability', player: jd.user, sub: 'jiedao', detail: `${victim.name} 对 ${s.players[pend.targetId!]!.name} 使用【杀】` });
        advanceTarget(s, f);
        startSha(s, victim.id, card.id, [pend.targetId!]);
      } else {
        transferWeapon(s, jd.user, victim.id);
        advanceTarget(s, f);
      }
      break;
    }
    case 'respondLord': {
      // 主公技（M14）：同意 → 逐个问同势力盟友；拒绝 → 原询问回给主公
      s.pending = null;
      const lp = pend.lordPend!;
      const aids = pend.aidIds ?? [];
      const first = aids[0];
      if (!a.use || first == null || !s.players[first]!.alive) {
        s.pending = { ...lp, aidForId: undefined, aidIds: undefined };
        break;
      }
      s.pending = { ...lp, playerId: first, aidForId: lp.playerId, aidIds: aids };
      break;
    }
    case 'respondDraw': {
      // 摸牌阶段抉择（M16）：突袭 → 选目标；裸衣 → 少摸一张+伤害加成；默认 → 正常摸牌
      s.pending = null;
      s.drawPhaseAsked = true; // 每回合只问一次
      if (a.skill === 'tuxi') {
        const to = othersInOrder(s, actor.id).filter(id => s.players[id]!.hand.length > 0);
        if (to.length === 0) {
          drawPhaseDefault(s, actor);
          break;
        }
        s.pending = { kind: 'tuxi', playerId: actor.id, tuxiTo: to };
        break;
      }
      if (a.skill === 'luoyi') {
        applyLuoyi(s, actor);
        s.phase = 'play';
        break;
      }
      drawPhaseDefault(s, actor);
      break;
    }
    case 'respondTuxi': {
      // 突袭：夺取所选角色（至多两名）各一张手牌
      s.pending = null;
      const ids = a.targetIds.filter(id => pend.tuxiTo?.includes(id)).slice(0, 2);
      applyTuxi(s, actor, ids);
      s.phase = 'play';
      break;
    }
    case 'respondYiji': {
      // 遗计（郭嘉）：把池中一张牌交给所选角色（null = 自己留着）
      s.pending = null;
      const pool = pend.yijiPool!;
      const i = pool.findIndex(c => c.id === a.cardId);
      const [card] = pool.splice(i, 1);
      const to = a.toId == null ? actor : s.players[a.toId]!;
      if (to.id !== actor.id) {
        // 牌已在遗计生效时摸进自己手里，交给别人需先从手牌移出
        removeFromHand(actor, card!.id);
        to.hand.push(card!);
        s.log.push({ t: 'skill', player: actor.id, sub: 'yiji', detail: `将【${CARD_INFO[card!.sub].display}】交给 ${to.name}` });
        s.log.push({ t: 'gainCard', player: to.id, from: actor.id });
      }
      // 池中还有牌就继续问；清空则结束
      if (pool.length > 0) {
        s.pending = { kind: 'yiji', playerId: actor.id, yijiPool: pool };
      }
      break;
    }
  }
}

// —— 杀的结算（M5：统一走 ShaFrame，逐目标推进） ——

function startSha(s: GameState, sourceId: number, cardId: number, targets: number[]): void {
  s.frames.push({ kind: 'sha', id: s.frameSeq++, userId: sourceId, cardId, targets, idx: 0, cixiongDone: [], liuliDone: [], tiejiTried: [], tiejiHit: [] });
}

/**
 * 建一张锦囊结算帧（M11：无中生有/桃园结义也走帧，才有逐目标的无懈询问）。
 * 无中 = 只对自己；桃园 = 从使用者起按座次的全部存活角色。
 */
function makeTrickFrame(s: GameState, userId: number, sub: CardSub, card: Card, targets?: number[]): TrickFrame {
  const ts = targets ?? (sub === 'wuzhong' ? [userId] : aliveInOrder(s, userId));
  return {
    kind: 'trick',
    id: s.frameSeq++,
    sub,
    userId,
    cardId: card.id,
    targets: ts,
    idx: 0,
    stage: 'wuxie',
    wuxieCount: 0,
    askedWuxieIds: [],
    // 决斗：目标先出杀；其余锦囊不用此字段
    duelTurn: sub === 'juedou' ? (ts[0] ?? -1) : -1,
    duelShaPlayed: 0,
  };
}

/** 从 userId 起按座次的全部存活角色（含自己；桃园结义的结算顺序） */
function aliveInOrder(s: GameState, userId: number): number[] {
  const n = s.players.length;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = s.players[(userId + k) % n]!;
    if (p.alive) out.push(p.id);
  }
  return out;
}

/** 杀帧推进到下一目标（当前目标已闪避/被贯石斧命中/弃牌取消/死亡） */
function advanceSha(s: GameState, frameId: number): void {
  const f = s.frames.find(fr => fr.id === frameId);
  if (f && f.kind === 'sha') f.idx += 1;
}

function stepSha(s: GameState, f: ShaFrame): void {
  if (f.idx >= f.targets.length) {
    s.frames.pop();
    return;
  }
  const source = s.players[f.userId]!;
  const target = s.players[f.targets[f.idx]]!;
  if (!target.alive) {
    f.idx += 1;
    return;
  }
  // 雌雄双股剑：对异性目标每目标一次；目标有手牌则由其选择，否则来源直接摸一张
  if (
    source.alive &&
    source.equipment.weapon?.sub === 'cixiong' &&
    !f.cixiongDone.includes(target.id) &&
    GENERAL_SEX[source.general] !== GENERAL_SEX[target.general]
  ) {
    f.cixiongDone.push(target.id);
    if (target.hand.length > 0) {
      s.pending = { kind: 'cixiong', playerId: target.id, cixiong: { sourceId: source.id, frameId: f.id } };
      return;
    }
    drawCards(s, source.id, 1);
    s.log.push({ t: 'draw', player: source.id, n: 1 });
    s.log.push({ t: 'ability', player: source.id, sub: 'cixiong', detail: `${target.name} 没有手牌，摸一张牌` });
  }
  // 流离（大乔）：成为杀的目标时，可弃一张手牌转移给距离1以内的其他男性（防互转：每目标一次）
  if (hasSkill(target, 'liuli') && !f.liuliDone.includes(target.id) && target.hand.length > 0) {
    const to = othersInOrder(s, target.id).filter(
      id =>
        GENERAL_SEX[s.players[id]!.general] === 'm' &&
        id !== source.id &&
        seatDistance(s, target.id, id) <= 1,
    );
    if (to.length > 0) {
      f.liuliDone.push(target.id);
      s.pending = { kind: 'liuli', playerId: target.id, frameId: f.id, liuliTo: to, liuliSourceId: source.id };
      return;
    }
  }
  // 铁骑（马超）：指定目标后判定，红色则此目标不可闪避（每目标判定一次）
  if (hasSkill(source, 'tieji') && source.alive && !f.tiejiTried.includes(target.id)) {
    f.tiejiTried.push(target.id);
    // 发动即记技能事件（判定结果另见 judge 事件）——否则判定为黑时日志里
    // 完全看不到铁骑发动过，观测与回归都无从下手
    s.log.push({ t: 'skill', player: source.id, sub: 'tieji', detail: `对 ${target.name} 判定` });
    beginJudge(s, {
      forId: source.id,
      reason: 'tieji',
      result: drawJudgeCard(s, source.id, 'tieji'),
      mode: 'tieji',
      tiejiFrameId: f.id,
      tiejiTargetId: target.id,
    });
    return;
  }
  if (f.tiejiHit.includes(target.id)) {
    s.log.push({ t: 'skill', player: source.id, sub: 'tieji', detail: `${target.name} 不可用【闪】响应` });
    shaHit(s, source.id, target.id, f.cardId);
    f.idx += 1;
    return;
  }
  // 青釭剑：无视八卦阵
  const ignoreShield = source.equipment.weapon?.sub === 'qinggang';
  if (ignoreShield && target.equipment.shield) {
    s.log.push({ t: 'ability', player: source.id, sub: 'qinggang', detail: `无视 ${target.name} 的【八卦阵】` });
  }
  const canShan =
    target.hand.some(c => canActAsShan(target, c)) || (!!target.equipment.shield && !ignoreShield);
  if (canShan) {
    // 护驾（曹操·主公技）：目标是主公时先问是否求援（M14）
    askLordFirst(s, {
      kind: 'respondShan',
      playerId: target.id,
      frameId: f.id,
      shaSourceId: source.id,
      shaCardId: f.cardId,
      needShan: hasSkill(source, 'wushuang') ? 2 : 1,
      shanPlayed: 0,
      qinggang: ignoreShield || undefined,
    }, 'hujia');
  } else {
    s.log.push({ t: 'respond', player: target.id, card: null, resp: 'shan' });
    shaHit(s, source.id, target.id, f.cardId);
    f.idx += 1;
  }
}

/** 杀被闪避后的武器结算：青龙偃月刀再杀；贯石斧弃两张手牌强行命中（简化：仅手牌） */
function shaDodged(s: GameState, sourceId: number, targetId: number, frameId?: number, cardId?: number): void {
  const source = s.players[sourceId]!;
  if (!source.alive) {
    if (frameId != null) advanceSha(s, frameId);
    return;
  }
  if (source.equipment.weapon?.sub === 'qinglong' && hasShaMaterial(source)) {
    s.pending = { kind: 'shaAgain', playerId: sourceId, targetId, frameId };
    return;
  }
  if (source.equipment.weapon?.sub === 'guanshi' && source.hand.length >= 2) {
    s.pending = {
      kind: 'guanshi',
      playerId: sourceId,
      guanshi: { targetId, shaCardId: cardId ?? -1, frameId: frameId ?? -1 },
    };
    return;
  }
  if (frameId != null) advanceSha(s, frameId);
}

/** 主公技（M14）：主公需要出【闪】/【杀】时，同势力盟友是否能代劳。
 *  注意主公技只在"持有者正处于主公位"时生效——本作武将随机分配，
 *  曹操/刘备也可能坐在反贼位。 */
function aidCandidates(s: GameState, lordId: number, sub: 'hujia' | 'jijiang'): number[] {
  const lord = s.players[lordId]!;
  if (lord.identity !== 'zhu' || !hasSkill(lord, sub)) return [];
  const faction = GENERAL_FACTION[lord.general];
  const isShan = sub === 'hujia';
  return s.players
    .filter(p => p.alive && p.id !== lordId && GENERAL_FACTION[p.general] === faction)
    .filter(p => (isShan ? p.hand.some(c => canActAsShan(p, c)) : p.hand.some(c => canActAsSha(p, c))))
    .map(p => p.id);
}

/**
 * 主公技（M14）：主公需要打出（或使用）【闪】/【杀】时，先问主公是否向同势力盟友求援。
 * 本作只接"打出"路径（护驾=出闪、激将=出杀应答）——"使用"路径由主公自己在出牌阶段决定，
 * 记在 ADR-0019 的已知简化里。
 */
function askLordFirst(s: GameState, pend: Inquiry, sub: 'hujia' | 'jijiang'): void {
  const aids = aidCandidates(s, pend.playerId, sub);
  if (aids.length === 0) {
    s.pending = pend;
    return;
  }
  s.log.push({ t: 'skill', player: pend.playerId, sub, detail: '询问是否向同势力盟友求援' });
  s.pending = { kind: 'lordSkill', playerId: pend.playerId, sub, lordPend: pend, aidIds: aids };
}

/** 主公技：盟友不应（或没牌了）时换下一个；都问完则回退给主公自己应答 */
function askNextAid(s: GameState, pend: Inquiry): void {
  const rest = (pend.aidIds ?? []).slice(1);
  const next = rest[0];
  if (next != null && s.players[next]!.alive) {
    s.pending = {
      ...pend,
      playerId: next,
      aidForId: pend.aidForId,
      aidIds: rest,
    };
    return;
  }
  // 全部盟友都不应：回退给主公自己（去掉求援标记）
  const lordPend = { ...pend, aidForId: undefined, aidIds: undefined };
  // 万箭的情形：询问本身不区分对象；杀/南蛮：playerId 就是应出牌者
  s.pending = lordPend;
}

/** 借刀杀人：目标拒出杀时，武器牌从 victim 的装备区转给 user */
function transferWeapon(s: GameState, userId: number, victimId: number): void {
  const victim = s.players[victimId]!;
  const w = victim.equipment.weapon;
  if (!w) return;
  delete victim.equipment.weapon;
  s.log.push({ t: 'unequip', player: victimId, sub: w.sub });
  loseEquipTrigger(s, victim);
  s.players[userId]!.hand.push(w);
  s.log.push({ t: 'gainCard', player: userId, from: victimId });
  s.log.push({ t: 'ability', player: userId, sub: 'jiedao', detail: `获得 ${victim.name} 的【${CARD_INFO[w.sub].display}】` });
}

function trickTargetOf(f: Frame): number | undefined {
  if (f.kind === 'trick') return f.targets[f.idx];
  if (f.kind === 'delayedJudge') return f.ownerId;
  return undefined;
}

function topFrame(s: GameState, frameId?: number): TrickFrame {
  const f = s.frames[s.frames.length - 1];
  if (!f || f.kind !== 'trick' || (frameId != null && f.id !== frameId))
    throw new Error('结算帧状态异常');
  return f;
}

/** 无懈可击可作用于锦囊帧与延时判定帧，故返回联合类型 */
function frameFor(s: GameState, frameId: number): Frame {
  const f = s.frames.find(fr => fr.id === frameId);
  if (!f) throw new Error('结算帧状态异常');
  return f;
}

// —— 技能：主动/触发 ——

/** 失去体力（苦肉）：无来源伤害语义，但伤害来源记 undefined */
function hurt(s: GameState, playerId: number, amount: number, sourceId?: number): void {
  const target = s.players[playerId]!;
  target.hp -= amount;
  s.log.push({ t: 'damage', player: playerId, amount, source: sourceId, loss: true });
  if (target.hp <= 0) {
    s.log.push({ t: 'dying', player: playerId });
    askNextTao(s, playerId, sourceId ?? null, []);
  }
}

/** 反馈：由技能发起的选牌询问（仅一个可选项时直接结算，不打扰玩家） */
function askSkillPick(s: GameState, ownerId: number, sub: 'fankui', targetId: number): void {
  const options = pickOptions(s.players[targetId]!);
  if (options.length === 0) return;
  if (options.length === 1) {
    const owner = s.players[ownerId]!;
    resolvePickFrom(s, s.players[targetId]!, options[0]!, 'give', owner);
    s.log.push({ t: 'gainCard', player: ownerId, from: targetId });
    return;
  }
  s.pending = {
    kind: 'pickCard',
    playerId: ownerId,
    trickTargetId: targetId,
    skillPick: { ownerId, sub },
  };
}

/** 伤害入口：记账 + 伤害后触发技（奸雄/反馈）入队 */
function dealDamage(s: GameState, targetId: number, amount: number, sourceId?: number, cardId?: number): void {
  const target = s.players[targetId]!;
  target.hp -= amount;
  s.log.push({ t: 'damage', player: targetId, amount, source: sourceId });
  if (hasSkill(target, 'jianxiong') && cardId != null) {
    const card = s.discard.find(c => c.id === cardId);
    if (card) queueTrigger(s, { sub: 'jianxiong', playerId: targetId, cards: [card] });
  }
  if (hasSkill(target, 'fankui') && sourceId != null && sourceId !== targetId) {
    const src = s.players[sourceId]!;
    if (hasAnyCard(src)) queueTrigger(s, { sub: 'fankui', playerId: targetId, sourceId });
  }
  // 遗计（郭嘉）：每受到 1 点伤害后摸两张牌并可分配（M16）。牌先入自己手牌，
  // 分配由 trigger 后的 yiji 询问逐张进行（放弃分配即等于自己留着）。
  if (hasSkill(target, 'yiji')) {
    const want = amount * 2;
    const cards: Card[] = [];
    for (let i = 0; i < want; i++) {
      reshuffleIfNeeded(s);
      if (s.deck.length === 0) break;
      cards.push(s.deck.pop()!);
    }
    if (cards.length > 0) {
      target.hand.push(...cards);
      s.log.push({ t: 'skill', player: target.id, sub: 'yiji', detail: `摸 ${cards.length} 张（可分配）` });
      s.log.push({ t: 'draw', player: target.id, n: cards.length });
      queueTrigger(s, { sub: 'yiji', playerId: target.id, cards });
    }
  }
  if (
    target.hp > 0 &&
    hasSkill(target, 'ganglie') &&
    sourceId != null &&
    sourceId !== targetId
  ) {
    beginJudge(s, {
      forId: targetId,
      reason: 'ganglie',
      result: drawJudgeCard(s, targetId, 'ganglie'),
      mode: 'ganglie',
      ganglieSourceId: sourceId,
    });
  }
  if (target.hp <= 0) {
    s.log.push({ t: 'dying', player: targetId });
    // 濒死求桃：从濒死玩家自己开始按座次询问；每条询问链每人至多用一张桃（简化）
    askNextTao(s, targetId, sourceId ?? null, []);
  }
}

function queueTrigger(s: GameState, t: PendingTrigger): void {
  const existing = s.triggerQueue.find(x => x.sub === t.sub && x.playerId === t.playerId);
  if (existing) {
    // 同技能的多次触发合并（遗计连续受伤）：牌累加，避免后一次的牌无人过问
    if (t.cards) existing.cards = [...(existing.cards ?? []), ...t.cards];
    return;
  }
  s.triggerQueue.push(t);
}

/**
 * 连营（陆逊·M16）：失去最后一张手牌后可摸一张。
 * 手牌离开的路径太多（出牌/应答/弃置/被夺），逐个插钩子必然漏——改为在动作应用后
 * 统一比对"动作前有牌、动作后无牌"的持有者，一次性入队。
 */
function checkLianying(s: GameState, prev: GameState): void {
  for (const p of s.players) {
    if (!p.alive || !hasSkill(p, 'lianying')) continue;
    const before = prev.players[p.id]!.hand.length;
    if (before > 0 && p.hand.length === 0) {
      queueTrigger(s, { sub: 'lianying', playerId: p.id });
    }
  }
}

/** 集智（黄月英·M16）：使用非延时锦囊时摸一张（延时锦囊与无懈不算） */
function checkJizhi(s: GameState, actor: PlayerState, sub: CardSub): void {
  if (!hasSkill(actor, 'jizhi')) return;
  const DELAYED: CardSub[] = ['lebusi', 'bingliang', 'shandian'];
  if (DELAYED.includes(sub) || sub === 'wuxie') return;
  drawCards(s, actor.id, 1);
  s.log.push({ t: 'skill', player: actor.id, sub: 'jizhi' });
  s.log.push({ t: 'draw', player: actor.id, n: 1 });
}

// —— 判定链（M4：翻开 → 鬼才询问链 → 生效） ——

function drawJudgeCard(s: GameState, forId: number, reason: JudgeState['reason']): Card {
  reshuffleIfNeeded(s);
  const c = s.deck.pop()!;
  s.log.push({ t: 'judge', player: forId, card: c, reason });
  return c;
}

function beginJudge(s: GameState, st: Omit<JudgeState, 'usedGuicai'> & { usedGuicai?: number[] }): void {
  s.judgeState = { ...st, usedGuicai: st.usedGuicai ?? [] };
}

/** 鬼才询问链：从判定者起按座次找第一个有手牌且未询问过的鬼才持有者 */
function stepJudge(s: GameState): void {
  const js = s.judgeState!;
  const n = s.players.length;
  for (let k = 0; k < n; k++) {
    const p = s.players[(js.forId + k) % n]!;
    if (!p.alive) continue;
    if (js.usedGuicai.includes(p.id)) continue;
    if (!hasSkill(p, 'guicai') || p.hand.length === 0) continue;
    s.pending = { kind: 'skillCard', playerId: p.id, sub: 'guicai' };
    return;
  }
  resolveJudge(s);
}

/** 判定生效：按 mode 分发（延时锦囊效果 / 八卦阵出闪）；判定牌一律进弃牌堆 */
function resolveJudge(s: GameState): void {
  const js = s.judgeState!;
  s.judgeState = null;
  const jc = js.result;
  // 天妒（郭嘉·M16）：判定牌生效后可以获得之——直接收进手牌，不再进弃牌堆
  const judger = s.players[js.forId]!;
  if (hasSkill(judger, 'tiandu')) {
    judger.hand.push(jc);
    s.log.push({ t: 'skill', player: judger.id, sub: 'tiandu', detail: '获得判定牌' });
    s.log.push({ t: 'gainCard', player: judger.id, from: judger.id });
  } else {
    s.discard.push(jc); // 判定牌生效后进弃牌堆（被鬼才替换过的旧牌已在替换时入堆）
  }
  if (js.mode === 'bagua') {
    const actor = s.players[js.forId]!;
    const pend = js.baguaPend!;
    if (jc.suit === '♥' || jc.suit === '♦') {
      s.pending = null;
      const f = pend.frameId != null ? s.frames.find(fr => fr.id === pend.frameId) : undefined;
      if (f && f.kind === 'trick') advanceTarget(s, f);
      else shaDodged(s, pend.shaSourceId!, actor.id, pend.frameId, pend.shaCardId);
    } else {
      s.pending = { ...pend, baguaTried: true };
    }
    return;
  }
  if (js.mode === 'tieji') {
    // 铁骑：判定红色 → 目标不可用闪响应（记入杀帧，stepSha 重入时直接命中）
    if (jc.suit === '♥' || jc.suit === '♦') {
      const f = s.frames.find(fr => fr.id === js.tiejiFrameId);
      if (f && f.kind === 'sha') f.tiejiHit.push(js.tiejiTargetId!);
    }
    return;
  }
  if (js.mode === 'ganglie') {
    // 刚烈：非红桃 → 伤害来源受到1点反伤（来源=夏侯惇）
    if (jc.suit !== '♥' && js.ganglieSourceId != null) {
      const src = s.players[js.ganglieSourceId]!;
      if (src.alive) {
        s.log.push({ t: 'skill', player: js.forId, sub: 'ganglie', detail: `${src.name} 受到1点反伤` });
        dealDamage(s, src.id, 1, js.forId);
      }
    }
    return;
  }
  if (js.mode === 'luoshen') {
    // 洛神：黑色 → 判定牌收入手牌并继续判定；红色 → 终止（判定牌已进弃牌堆）
    const actor = s.players[js.forId]!;
    if (jc.suit === '♠' || jc.suit === '♣') {
      const i = s.discard.findIndex(c => c.id === jc.id);
      if (i >= 0) s.discard.splice(i, 1);
      actor.hand.push(jc);
      s.log.push({ t: 'gainCard', player: actor.id, from: actor.id });
      queueTrigger(s, { sub: 'luoshen', playerId: actor.id });
    }
    return;
  }
  // 延时锦囊：zone 牌按效果处置（生效弃置 / 闪电转移）
  const zone = js.zoneCard!;
  switch (js.delayedSub) {
    case 'lebusi':
      delete zone.asSub;
      s.discard.push(zone);
      if (jc.suit !== '♥') s.skipPlay = true;
      break;
    case 'bingliang':
      delete zone.asSub;
      s.discard.push(zone);
      if (jc.suit === '♣') s.skipDraw = true;
      break;
    case 'shandian':
      if (jc.suit === '♠' && jc.rank >= 2 && jc.rank <= 9) {
        delete zone.asSub;
        s.discard.push(zone);
        dealDamage(s, js.forId, 3, undefined);
      } else {
        const to = nextAliveId(s, js.forId);
        if (to != null && to !== js.forId) {
          s.players[to]!.judgements.push(zone);
          s.log.push({ t: 'moveJudgement', sub: zone.sub, from: js.forId, to });
        } else {
          s.discard.push(zone);
        }
      }
      break;
    default:
      s.discard.push(zone);
      break;
  }
}

// —— 结算帧 ——

function stepFrame(s: GameState): void {
  const f = s.frames[s.frames.length - 1]!;
  if (f.kind === 'delayedJudge') return stepDelayed(s, f);
  if (f.kind === 'sha') return stepSha(s, f);
  return stepTrick(s, f);
}

function stepDelayed(s: GameState, f: DelayedFrame): void {
  const owner = s.players[f.ownerId]!;
  const asker = nextWuxieAsker(s, f);
  if (asker != null) {
    s.pending = {
      kind: 'respondWuxie',
      playerId: asker,
      frameId: f.id,
      askedIds: [...f.askedWuxieIds],
      trickSub: f.sub,
      trickTargetId: f.ownerId,
    };
    return;
  }
  // 无懈阶段结束，弹帧
  s.frames.pop();
  const idx = owner.judgements.findIndex(c => zoneSub(c) === f.sub);
  if (!owner.alive || idx < 0) return; // 主人死亡时判定区已随死亡进入弃牌堆
  if (f.wuxieCount % 2 === 1) {
    // 奇数张无懈：该延时锦囊被抵消，直接作废弃置、不判定（M11 无懈链）
    const z = owner.judgements.splice(idx, 1)[0]!;
    delete z.asSub;
    s.discard.push(z);
    return;
  }
  const zone = owner.judgements.splice(idx, 1)[0]!;
  const reason = f.sub as 'lebusi' | 'bingliang' | 'shandian';
  beginJudge(s, {
    forId: f.ownerId,
    reason,
    result: drawJudgeCard(s, f.ownerId, reason),
    mode: 'delayed',
    delayedSub: f.sub,
    zoneCard: zone,
  });
}

function stepTrick(s: GameState, f: TrickFrame): void {
  // 所有目标结算完毕才弹帧——该检查必须先于无懈阶段，否则最后一个目标
  // 结算后 advanceTarget 重置回 wuxie，会对已结束的帧空转一轮无懈询问
  if (f.idx >= f.targets.length) {
    s.frames.pop();
    return;
  }
  if (f.stage === 'wuxie') {
    const asker = nextWuxieAsker(s, f);
    if (asker != null) {
      s.pending = {
        kind: 'respondWuxie',
        playerId: asker,
        frameId: f.id,
        askedIds: [...f.askedWuxieIds],
        trickSub: f.sub,
        trickTargetId: f.targets[f.idx],
      };
      return;
    }
    f.stage = 'effect';
    return;
  }
  const target = s.players[f.targets[f.idx]]!;
  if (f.wuxieCount % 2 === 1 || !target.alive) {
    advanceTarget(s, f);
    return;
  }
  switch (f.sub) {
    case 'wuzhong':
      // 无中生有：对自己结算（无懈可击可抵消，M11 起走帧）
      advanceTarget(s, f);
      drawCards(s, target.id, 2);
      s.log.push({ t: 'draw', player: target.id, n: 2 });
      return;
    case 'taoyuan':
      // 桃园结义：逐目标回复 1 点（满血者无效果）
      advanceTarget(s, f);
      if (target.hp < target.maxHp) {
        target.hp = Math.min(target.maxHp, target.hp + 1);
        s.log.push({ t: 'heal', player: target.id, amount: 1 });
      }
      return;
    case 'nanman':
      if (hasShaMaterial(target)) {
        askLordFirst(s, { kind: 'respondSha', playerId: target.id, frameId: f.id, trickSub: f.sub, trickTargetId: target.id }, 'jijiang');
      } else {
        advanceTarget(s, f);
        dealDamage(s, target.id, 1, f.userId, f.cardId);
      }
      return;
    case 'wanjian':
      if (target.hand.some(c => canActAsShan(target, c)) || target.equipment.shield) {
        askLordFirst(s, { kind: 'respondShan', playerId: target.id, frameId: f.id, trickSub: f.sub, trickTargetId: target.id }, 'hujia');
      } else {
        advanceTarget(s, f);
        dealDamage(s, target.id, 1, f.userId, f.cardId);
      }
      return;
    case 'wugu': {
      // 五谷丰登：亮出 N 张（N = 目标数），逐目标各取一张（M13）
      if (!f.wuguCards) {
        f.wuguCards = [];
        for (let i = 0; i < f.targets.length; i++) {
          reshuffleIfNeeded(s);
          if (s.deck.length === 0) break;
          f.wuguCards.push(s.deck.pop()!);
        }
        s.log.push({ t: 'ability', player: target.id, sub: 'wugu', detail: `亮出 ${f.wuguCards.length} 张牌` });
        for (const c of f.wuguCards) s.log.push({ t: 'wuguReveal', player: target.id, card: c });
      }
      const pool = f.wuguCards;
      if (pool.length === 0) {
        advanceTarget(s, f);
        return;
      }
      if (pool.length === 1) {
        const c = pool.pop()!;
        target.hand.push(c);
        s.log.push({ t: 'gainCard', player: target.id, from: target.id });
        advanceTarget(s, f);
        return;
      }
      s.pending = { kind: 'wuguPick', playerId: target.id, frameId: f.id, wuguCards: [...pool] };
      return;
    }
    case 'jiedao': {
      // 借刀杀人：持刀者需对指定目标使用【杀】，否则武器交给借刀人（M13）
      const victim = target;
      const w = victim.equipment.weapon;
      if (!w) {
        advanceTarget(s, f);
        return;
      }
      const shaTarget = s.players[f.jiedaoTargetId!]!;
      const canSha = shaTarget.alive && hasShaMaterial(victim) && inShaRange(s, victim.id, shaTarget.id);
      if (canSha) {
        s.pending = {
          kind: 'jiedao',
          playerId: victim.id,
          frameId: f.id,
          jiedao: { user: f.userId, victim: victim.id, weaponSub: w.sub },
          targetId: shaTarget.id,
        };
      } else {
        // 无法出杀：武器归属借刀人
        transferWeapon(s, f.userId, victim.id);
        advanceTarget(s, f);
      }
      return;
    }
    case 'juedou': {
      const who = s.players[f.duelTurn]!;
      if (hasShaMaterial(who)) {
        askLordFirst(s, { kind: 'respondSha', playerId: who.id, frameId: f.id, trickSub: f.sub, trickTargetId: f.targets[0] }, 'jijiang');
      } else {
        const opponent = who.id === f.userId ? f.targets[0]! : f.userId;
        advanceTarget(s, f);
        // 裸衣（许褚）：决斗造成的伤害 +1（M16）
        dealDamage(s, who.id, shaDamageAmount(s, opponent), opponent, f.cardId);
      }
      return;
    }
    case 'guohe':
    case 'shunshou': {
      const options = pickOptions(target);
      if (options.length > 1) {
        // 手牌与装备（或多件装备）并存：使用者自主选牌（ADR-0008 仿原版交互）
        f.stage = 'pick';
        s.pending = { kind: 'pickCard', playerId: f.userId, frameId: f.id, trickSub: f.sub, trickTargetId: target.id };
      } else if (options.length === 1) {
        resolvePickFrom(s, target, options[0]!, f.sub === 'guohe' ? 'discard' : 'give', s.players[f.userId]!);
        if (f.sub === 'guohe') s.log.push({ t: 'discardCards', player: target.id, n: 1 });
        else s.log.push({ t: 'gainCard', player: f.userId, from: target.id });
        advanceTarget(s, f);
      } else {
        advanceTarget(s, f); // 校验保证目标有牌，此为兜底
      }
      return;
    }
    default:
      advanceTarget(s, f);
  }
}

/** 目标结算完毕，推进到下一个目标（重置无懈链与决斗状态） */
function advanceTarget(s: GameState, f: TrickFrame): void {
  f.idx += 1;
  f.wuxieCount = 0;
  f.askedWuxieIds = [];
  f.stage = 'wuxie';
  f.duelTurn = f.targets[0] ?? -1;
  f.duelShaPlayed = 0;
}

/**
 * 找下一位可打无懈的人：从帧的"锚点"（锦囊使用者 / 延时锦囊的判定区主人）的下家
 * 按座次扫一整圈，锚点最后被问到——所以使用者本人也有机会反无懈救回自己的锦囊。
 * askedWuxieIds 每有一张无懈打出就被重置为仅含出牌者，链因此可以反复重开；
 * 终止性由"无懈是有限手牌 + 每人一圈内只被问一次"共同保证。
 */
function nextWuxieAsker(s: GameState, f: TrickFrame | DelayedFrame): number | null {
  const n = s.players.length;
  const anchor = f.kind === 'trick' ? f.userId : f.ownerId;
  for (let k = 1; k <= n; k++) {
    const p = s.players[(anchor + k) % n]!;
    if (p.alive && !f.askedWuxieIds.includes(p.id) && p.hand.some(c => c.sub === 'wuxie'))
      return p.id;
  }
  return null;
}

type CardFrom = 'hand' | EquipSlot;

/** 选牌可选项：手牌（暗牌随机）与各件明置装备（含八卦阵） */
function pickOptions(target: PlayerState): CardFrom[] {
  const options: CardFrom[] = [];
  if (target.hand.length > 0) options.push('hand');
  if (target.equipment.weapon) options.push('weapon');
  if (target.equipment.shield) options.push('shield');
  if (target.equipment.jian1ma) options.push('jian1ma');
  if (target.equipment.jia1ma) options.push('jia1ma');
  return options;
}

/** 执行选牌：手牌随机抽取，装备按所选槽位；discard 入弃牌堆，give 入获得者手牌 */
function resolvePickFrom(
  s: GameState,
  target: PlayerState,
  from: CardFrom,
  mode: 'discard' | 'give',
  giver: PlayerState,
): void {
  let card: Card;
  if (from === 'hand') {
    const idx = randU32(s) % target.hand.length;
    [card] = target.hand.splice(idx, 1);
  } else {
    card = target.equipment[from]!;
    delete target.equipment[from];
    s.log.push({ t: 'unequip', player: target.id, sub: card.sub });
    loseEquipTrigger(s, target);
  }
  if (mode === 'discard') s.discard.push(card);
  else giver.hand.push(card);
}

function othersInOrder(s: GameState, userId: number): number[] {
  const n = s.players.length;
  const out: number[] = [];
  for (let k = 1; k <= n; k++) {
    const p = s.players[(userId + k) % n]!;
    if (p.alive) out.push(p.id);
  }
  return out;
}

function nextAliveId(s: GameState, fromId: number): number | null {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const idx = (fromId + k) % n;
    if (s.players[idx]!.alive) return idx;
  }
  return null;
}

// —— 自动流转 ——

/** 引擎自动流转：直到出现待决策询问、游戏结束为止。 */
export function advance(s: GameState): void {
  while (!s.winner) {
    if (s.turnCount >= MAX_TURNS) {
      s.winner = { side: 'draw' };
      s.log.push({ t: 'gameOver', side: 'draw' });
      return;
    }
    if (s.pending) return;
    // 触发技队列优先于判定链与结算栈（受伤后的即时结算）
    if (s.triggerQueue.length > 0 && !s.judgeState) {
      const t = s.triggerQueue.shift()!;
      if (!s.players[t.playerId]!.alive) continue; // 死亡玩家不再发动（伤害后被击杀）
      s.pending = {
        kind: 'trigger',
        playerId: t.playerId,
        sub: t.sub,
        triggerCards: t.cards,
        triggerSourceId: t.sourceId,
      };
      continue;
    }
    // 判定链（M4）：翻牌已出，先问鬼才，再生效
    if (s.judgeState) {
      stepJudge(s);
      continue;
    }
    if (s.frames.length > 0) {
      stepFrame(s);
      continue;
    }
    const cur = s.players[s.turnIdx]!;
    if (!cur.alive) {
      endTurn(s);
      continue;
    }
    // 准备阶段（M7）：观星询问 → 洛神触发，随后进入判定阶段
    if (!s.prepared) {
      s.prepared = true;
      if (hasSkill(cur, 'guanxing') && s.deck.length > 0) {
        const x = Math.min(s.players.filter(p => p.alive).length, s.deck.length, 5);
        const cards: Card[] = [];
        for (let i = 0; i < x; i++) cards.push(s.deck.pop()!);
        s.pending = { kind: 'guanxing', playerId: cur.id, guanxingCards: cards };
        return;
      }
      if (hasSkill(cur, 'luoshen')) queueTrigger(s, { sub: 'luoshen', playerId: cur.id });
    }
    if (s.phase === 'judge') {
      s.judging = true;
      if (cur.judgements.length === 0) {
        s.judging = false;
        s.phase = s.skipDraw ? 'play' : 'draw'; // 兵粮寸断：跳过摸牌阶段
        continue;
      }
      // 从最后放置的延时锦囊开始判定
      const card = cur.judgements[cur.judgements.length - 1]!;
      const zsub = zoneSub(card);
      s.frames.push({
        kind: 'delayedJudge',
        id: s.frameSeq++,
        sub: zsub,
        ownerId: cur.id,
        wuxieCount: 0,
        askedWuxieIds: [],
      });
      continue;
    }
    if (s.phase === 'draw') {
      // 摸牌阶段（M16）：张辽突袭 / 许褚裸衣 会改变本阶段的摸牌数，先问持有者
      if (
        (hasSkill(cur, 'tuxi') || hasSkill(cur, 'luoyi')) &&
        !s.drawPhaseAsked
      ) {
        s.pending = { kind: 'drawPhase', playerId: cur.id };
        return;
      }
      drawPhaseDefault(s, cur);
      continue;
    }
    if (s.phase === 'play') {
      if (s.skipPlay) {
        s.phase = 'discard'; // 乐不思蜀：跳过出牌阶段
        continue;
      }
      s.pending = { kind: 'play', playerId: cur.id };
      return;
    }
    // 弃牌阶段：手牌数须不大于当前体力值；克己（吕蒙·锁定）跳过
    const n = cur.hand.length - cur.hp;
    if (n > 0 && hasSkill(cur, 'keji') && !s.shaUsed) {
      s.log.push({ t: 'skill', player: cur.id, sub: 'keji' });
      endTurn(s);
      continue;
    }
    if (n > 0) {
      s.pending = { kind: 'discard', playerId: cur.id, count: n };
      return;
    }
    endTurn(s);
  }
}

/** 默认摸牌阶段：英姿（周瑜·锁定）多摸一张 */
function drawPhaseDefault(s: GameState, cur: PlayerState): void {
  const n = (hasSkill(cur, 'yingzi') ? 3 : 2) + 0;
  if (n === 3) s.log.push({ t: 'skill', player: cur.id, sub: 'yingzi' });
  drawCards(s, cur.id, n);
  s.log.push({ t: 'draw', player: cur.id, n });
  s.phase = 'play';
}

/** 突袭（张辽）：放弃摸牌，改为获得至多两名其他角色各一张手牌（手牌随机） */
function applyTuxi(s: GameState, actor: PlayerState, targetIds: number[]): void {
  for (const tid of targetIds.slice(0, 2)) {
    const t = s.players[tid]!;
    if (!t.alive || t.hand.length === 0) continue;
    const idx = randU32(s) % t.hand.length;
    const [card] = t.hand.splice(idx, 1);
    actor.hand.push(card!);
    s.log.push({ t: 'skill', player: actor.id, sub: 'tuxi', detail: `获得 ${t.name} 的一张手牌` });
    s.log.push({ t: 'gainCard', player: actor.id, from: tid });
  }
}

/** 裸衣（许褚）：少摸一张，本回合【杀】/【决斗】造成的伤害 +1 */
function applyLuoyi(s: GameState, actor: PlayerState): void {
  s.log.push({ t: 'skill', player: actor.id, sub: 'luoyi' });
  drawCards(s, actor.id, 1);
  s.log.push({ t: 'draw', player: actor.id, n: 1 });
  s.damageBonus += 1;
}

function endTurn(s: GameState): void {
  // 闭月（貂蝉）：结束阶段摸一张牌（自动发动；死亡玩家不摸）
  const cur = s.players[s.turnIdx]!;
  if (cur.alive && hasSkill(cur, 'biyue')) {
    drawCards(s, cur.id, 1);
    s.log.push({ t: 'skill', player: cur.id, sub: 'biyue' });
    s.log.push({ t: 'draw', player: cur.id, n: 1 });
  }
  s.phase = 'judge';
  s.playedSha = false;
  s.turnPlays = 0;
  s.turnCount += 1;
  s.judging = false;
  s.skipDraw = false;
  s.skipPlay = false;
  s.damageBonus = 0;
  s.shaUsed = false;
  s.drawPhaseAsked = false;
  s.prepared = false;
  s.usedSkills = [];
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const idx = (s.turnIdx + k) % n;
    if (s.players[idx]!.alive) {
      s.turnIdx = idx;
      break;
    }
  }
  s.log.push({ t: 'turnStart', player: s.turnIdx });
}

/** 裸衣（许褚·M16）：本回合其【杀】/【决斗】造成的伤害 +1 */
function shaDamageAmount(s: GameState, sourceId: number): number {
  return 1 + s.damageBonus;
}

function shaHit(s: GameState, sourceId: number, targetId: number, cardId: number): void {
  dealDamage(s, targetId, shaDamageAmount(s, sourceId), sourceId, cardId);
  // 麒麟弓：杀命中后弃置目标一匹坐骑（锁定简化；目标已死则装备已随死亡进弃牌堆）
  const source = s.players[sourceId]!;
  const target = s.players[targetId]!;
  if (source.equipment.weapon?.sub === 'qilin' && target.alive) discardMount(s, targetId);
}

function discardMount(s: GameState, targetId: number): void {
  const t = s.players[targetId]!;
  const slots = (['jia1ma', 'jian1ma'] as const).filter(sl => t.equipment[sl]);
  if (slots.length === 0) return;
  const slot = slots[randU32(s) % slots.length]!;
  const card = t.equipment[slot]!;
  delete t.equipment[slot];
  s.discard.push(card);
  s.log.push({ t: 'unequip', player: targetId, sub: card.sub });
  loseEquipTrigger(s, t);
}

/** 枭姬（孙尚香）：失去装备区的一张牌后摸两张（死亡清算不触发） */
function loseEquipTrigger(s: GameState, owner: PlayerState): void {
  if (owner.alive && hasSkill(owner, 'xiaoji')) queueTrigger(s, { sub: 'xiaoji', playerId: owner.id });
}

/**
 * 找下一位求桃对象：从濒死者的座次起扫一整圈，取第一个存活、手中有桃且尚未被询问过的人。
 * askedIds 随每次应答增长，因此询问链长度有上限（存活人数），不会循环。
 */
function askNextTao(s: GameState, dyingId: number, sourceId: number | null, askedIds: number[]): void {
  const n = s.players.length;
  for (let k = 0; k < n; k++) {
    const p = s.players[(dyingId + k) % n]!;
    // 有真桃，或持有急救且有红色手牌（华佗：回合外红牌当桃）都可被询问
    const canSave =
      p.hand.some(c => c.sub === 'tao') ||
      (hasSkill(p, 'jijiu') && p.hand.some(c => isRedCard(c)));
    if (p.alive && !askedIds.includes(p.id) && canSave) {
      s.pending = { kind: 'respondTao', playerId: p.id, dyingId, shaSourceId: sourceId ?? undefined, askedIds };
      return;
    }
  }
  finalizeDeath(s, dyingId, sourceId);
}

function finalizeDeath(s: GameState, victimId: number, killerId: number | null): void {
  const victim = s.players[victimId]!;
  victim.alive = false;
  s.discard.push(...victim.hand);
  victim.hand = [];
  for (const slot of ['weapon', 'shield', 'jia1ma', 'jian1ma'] as const) {
    const c = victim.equipment[slot];
    if (c) s.discard.push(c);
  }
  victim.equipment = {};
  s.discard.push(...victim.judgements);
  victim.judgements = [];
  s.log.push({ t: 'death', player: victimId, identity: victim.identity, killer: killerId ?? undefined });
  // 奖惩：杀死反贼摸三张；主公杀死忠臣弃置全部手牌
  if (killerId != null && victim.identity === 'fan') {
    const killer = s.players[killerId]!;
    if (killer.alive) {
      drawCards(s, killerId, 3);
      s.log.push({ t: 'rewardDraw', player: killerId, n: 3 });
    }
  }
  if (killerId != null && victim.identity === 'zhong') {
    const killer = s.players[killerId]!;
    if (killer.alive && killer.identity === 'zhu') {
      s.log.push({ t: 'penaltyDiscard', player: killerId, n: killer.hand.length });
      s.discard.push(...killer.hand);
      killer.hand = [];
    }
  }
  checkVictory(s);
}

function checkVictory(s: GameState): void {
  if (s.winner) return;
  const zhu = s.players.find(p => p.identity === 'zhu')!;
  const alive = s.players.filter(p => p.alive);
  if (!zhu.alive) {
    // 内奸获胜当且仅当主公死亡时场上只剩内奸一人；否则反贼获胜
    const side = alive.length === 1 && alive[0]!.identity === 'nei' ? ('nei' as const) : ('fan' as const);
    s.winner = { side };
    s.log.push({ t: 'gameOver', side });
  } else if (!alive.some(p => p.identity === 'fan' || p.identity === 'nei')) {
    s.winner = { side: 'zhu' };
    s.log.push({ t: 'gameOver', side: 'zhu' });
  }
}

function reshuffleIfNeeded(s: GameState): void {
  if (s.deck.length === 0) {
    if (s.discard.length === 0) throw new Error('牌堆与弃牌堆均已耗尽');
    s.deck = s.discard;
    s.discard = [];
    shuffleInPlace(s, s.deck);
  }
}

function drawCards(s: GameState, playerId: number, n: number): void {
  const p = s.players[playerId]!;
  for (let i = 0; i < n; i++) {
    reshuffleIfNeeded(s);
    p.hand.push(s.deck.pop()!);
  }
}

function removeFromHand(p: PlayerState, cardId: number): Card {
  const idx = p.hand.findIndex(c => c.id === cardId);
  if (idx < 0) throw new Error(`手牌中不存在卡牌 ${cardId}`);
  return p.hand.splice(idx, 1)[0]!;
}
