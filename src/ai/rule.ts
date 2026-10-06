// A1→M12 规则型 AI：优先级表驱动（ADR-0003/0005/0010/0011/0017）。
// 只使用公开信息（座次/血量/装备/判定区/手牌数/距离）与自己的手牌身份，不作读牌。
// 身份推断见 belief.ts：只读公开日志的最近片段，纯函数、可复现。
// 已知局限（记录在案）：不用闪电、鬼才只优化自己的判定、丈八蛇矛仅在无普通杀素材且
// 手牌≥3 时动用、身份推断的误判率约 20%（probe-belief）。
import { canPlayShaNow, hasAnyCard, inShaRange, seatDistance } from '../engine/step';
import { canActAsSha, hasSkill, isBlackCard, isKongcheng, isRedCard } from '../engine/skills';
import { CARD_INFO, GENERAL_SEX } from '../engine/types';
import type { Action, Card, CardSub, GameState, PlayerState } from '../engine/types';
import { viewOf } from '../engine/view';
import { inferLordFavor, THRESHOLD } from './belief';

/** 手牌价值：弃牌/鬼才/贯石斧共用——桃 > 闪 > 杀 > 其余 */
function cardValue(c: Card): number {
  return c.sub === 'tao' ? 3 : c.sub === 'shan' ? 2 : c.sub === 'sha' ? 1 : 0;
}

/** 按价值升序取最不值钱的 n 张 */
function cheapest(hand: Card[], n: number): Card[] {
  return [...hand].sort((a, b) => cardValue(a) - cardValue(b) || a.id - b.id).slice(0, n);
}

/** 杀的可用素材：真杀 → 武圣红牌（桃满血才用）→ 龙胆闪 */
function shaMaterial(me: PlayerState, hand: Card[]): Card | undefined {
  return (
    hand.find(c => c.sub === 'sha') ??
    (hasSkill(me, 'wusheng')
      ? hand.find(c => c.sub !== 'sha' && c.sub !== 'tao' && canActAsSha(me, c))
      : undefined) ??
    (hasSkill(me, 'longdan') ? hand.find(c => c.sub === 'shan') : undefined)
  );
}

/** 闪的可用素材：真闪 → 龙胆杀 → 倾国黑色手牌（价值最低的先出） */
function shanMaterial(me: PlayerState, hand: Card[]): Card | undefined {
  return (
    hand.find(c => c.sub === 'shan') ??
    (hasSkill(me, 'longdan') ? hand.find(c => c.sub === 'sha') : undefined) ??
    (hasSkill(me, 'qingguo')
      ? hand.filter(c => isBlackCard(c)).sort((a, b) => cardValue(a) - cardValue(b))[0]
      : undefined)
  );
}

/**
 * 目标优先级（M12 身份推断的落点）：同身份内按"最该打的人"排序；
 * 排序只影响选择顺序，任何存活的其他角色仍可能在列表末尾——避免残局僵持。
 * 优先级：反贼打主公最优先；主公/忠臣打推断为反贼者最优先；内奸先帮主公清场。
 */
function enemyOrder(s: GameState, playerId: number): number[] {
  const me = s.players[playerId]!;
  const zhuId = s.players.find(p => p.identity === 'zhu')?.id ?? -1;
  const favor = inferLordFavor(s);
  const rank = (id: number): number => {
    const favorScore = favor[id] ?? 0;
    if (me.identity === 'fan') {
      if (id === zhuId) return 4;
      if (favorScore <= -THRESHOLD) return 3; // 护主公的（忠臣）
      if (Math.abs(favorScore) < THRESHOLD) return 2; // 未表态
      return 1; // 疑似同伙：只在没有别人可打时（反贼很少打自己人）
    }
    if (id === zhuId) return me.identity === 'nei' ? 1 : 0;
    if (favorScore >= THRESHOLD) return 4; // 疑似反贼
    if (Math.abs(favorScore) < THRESHOLD) return 3;
    return 2; // 疑似忠臣
  };
  return s.players
    .filter(p => p.alive && p.id !== playerId)
    .sort((a, b) => rank(b.id) - rank(a.id) || a.hp - b.hp)
    .filter(p => !(me.identity === 'zhu' && p.id === zhuId))
    .map(p => p.id);
}

export function ruleAction(s: GameState, playerId: number): Action | null {
  const v = viewOf(s, playerId);
  const pend = v.pending;
  if (!pend || !v.me || pend.playerId !== playerId) return null;
  const me = s.players[playerId]!;
  const hand = v.me.hand;
  const meP = v.players.find(p => p.id === playerId)!;

  // 身份立场（M12，ADR-0003 承诺的行为打分）：从公开日志归因，未知时退回保守策略。
  // 只影响"打谁/救谁"的选择，不改任何规则判定。
  // 惰性求值：只有真需要选目标时才扫日志——MC rollout 里绝大多数调用是应答类
  // （出闪/出杀/求桃），不该为它们付推断成本。
  const zhuId = v.players.find(p => p.isZhu)?.id ?? -1;
  const myIdentity = v.me.identity;
  let favorCache: number[] | null = null;
  const favor = (): number[] => (favorCache ??= inferLordFavor(s));
  let enemyCache: number[] | null = null;
  // 敌我：自身身份 + 主公明置 + 行为推断。推断只决定"先打谁"（排序），
  // 不决定"谁不能被打"——后者会让某些目标永不可选，残局变成互相干瞪眼直到回合熔断。
  const enemies = (): number[] => (enemyCache ??= enemyOrder(s, playerId));
  const first = (sub: CardSub): Card | undefined => hand.find(c => c.sub === sub);

  // 盟友（青囊/仁德受益人）：在明置信息之上叠加行为推断——
  // 主公/忠臣认"护主者"，反贼认"反主者"（不含主公），内奸只认自己。
  const allies = (): number[] => {
    const others = v.players.filter(p => p.alive && p.id !== playerId);
    const f = favor();
    switch (myIdentity) {
      case 'zhu':
        return others.filter(p => (f[p.id] ?? 0) <= -THRESHOLD).map(p => p.id);
      case 'zhong':
        return others.filter(p => p.id === zhuId || (f[p.id] ?? 0) <= -THRESHOLD).map(p => p.id);
      case 'fan':
        return others.filter(p => p.id !== zhuId && (f[p.id] ?? 0) >= THRESHOLD).map(p => p.id);
      default:
        return [];
    }
  };

  switch (pend.kind) {
    case 'play': {
      // 1. 无中生有必用
      const wz = first('wuzhong');
      if (wz) return { type: 'playTrick', cardId: wz.id };
      // 2. 受伤先吃桃
      const tao = first('tao');
      if (tao && meP.hp < meP.maxHp) return { type: 'playTao', cardId: tao.id };
      // 2.5 苦肉：手牌紧张且体力有余时换两张（每回合限一次）
      if (hasSkill(me, 'kurou') && meP.hp >= 3 && hand.length <= 3 && !s.usedSkills.includes('kurou')) {
        return { type: 'useSkill', sub: 'kurou' };
      }
      // 2.6 青囊（华佗）：弃最不值钱的牌奶最缺血的友方/自己
      if (hasSkill(me, 'qingnang') && !s.usedSkills.includes('qingnang') && hand.length >= 2) {
        const wounded = [me.id, ...allies()]
          .map(id => s.players[id]!)
          .filter(p => p.alive && p.hp < p.maxHp)
          .sort((a, b) => a.hp - b.hp);
        if (wounded.length > 0) {
          return { type: 'useSkill', sub: 'qingnang', cardId: cheapest(hand, 1)[0]!.id, targetIds: [wounded[0]!.id] };
        }
      }
      // 2.7 制衡（孙权）：多余牌换手（手牌≥4 且本回合还没动过关键锦囊时）
      if (hasSkill(me, 'zhiheng') && !s.usedSkills.includes('zhiheng') && hand.length >= 4) {
        const junk = hand.filter(c => cardValue(c) === 0 || (cardValue(c) === 1 && hand.filter(x => x.sub === 'sha').length > 1));
        if (junk.length >= 2) {
          return { type: 'useSkill', sub: 'zhiheng', cardIds: junk.map(c => c.id) };
        }
      }
      // 2.8 仁德（刘备）：给主公/队友送牌补血（给出≥2张回1血）
      if (hasSkill(me, 'rende') && !s.usedSkills.includes('rende') && hand.length >= 3) {
        const recipient = allies().find(id => s.players[id]!.alive);
        if (recipient != null && (me.hp < me.maxHp || hand.length >= 5)) {
          const give = cheapest(hand, Math.min(2, hand.length - 1)).map(c => c.id);
          if (give.length === 2) return { type: 'useSkill', sub: 'rende', cardIds: give, targetIds: [recipient] };
        }
      }
      // 3. 装备：换更大范围的武器、补缺的装备
      const curW = me.equipment.weapon;
      const better = hand
        .filter(c => CARD_INFO[c.sub].kind === 'equip' && CARD_INFO[c.sub].range != null)
        .sort((a, b) => CARD_INFO[b.sub].range! - CARD_INFO[a.sub].range!)[0];
      if (better && (!curW || CARD_INFO[better.sub].range! > CARD_INFO[curW.sub].range!))
        return { type: 'playEquip', cardId: better.id };
      const bg = first('bagua');
      if (bg && !me.equipment.shield) return { type: 'playEquip', cardId: bg.id };
      const j1 = first('jia1ma');
      if (j1 && !me.equipment.jia1ma) return { type: 'playEquip', cardId: j1.id };
      const j2 = first('jian1ma');
      if (j2 && !me.equipment.jian1ma) return { type: 'playEquip', cardId: j2.id };
      // 4. 顺手牵羊（距离 1 内有牌的敌人）
      const ss = first('shunshou');
      if (ss) {
        const t = enemies().find(id => hasAnyCard(s.players[id]!) && seatDistance(s, playerId, id) <= 1);
        if (t != null) return { type: 'playTrick', cardId: ss.id, targetId: t };
      }
      // 5. 过河拆桥（含奇袭：黑色非锦囊牌当拆——天然锦囊不转换，ADR-0014）
      const gh =
        first('guohe') ??
        (hasSkill(me, 'qixi')
          ? hand.find(c => isBlackCard(c) && c.sub !== 'tao' && CARD_INFO[c.sub].kind !== 'trick')
          : undefined);
      if (gh) {
        const t = enemies().find(id => hasAnyCard(s.players[id]!));
        if (t != null) return { type: 'playTrick', cardId: gh.id, targetId: t };
      }
      // 6. 乐不思蜀（含国色：方块非锦囊牌当乐——天然锦囊不转换；无距离限制；不重复放置）
      const le =
        first('lebusi') ??
        (hasSkill(me, 'guose')
          ? hand.find(c => c.suit === '♦' && c.sub !== 'tao' && CARD_INFO[c.sub].kind !== 'trick')
          : undefined);
      if (le) {
        const t = enemies().find(id => !s.players[id]!.judgements.some(c => (c.asSub ?? c.sub) === 'lebusi'));
        if (t != null) return { type: 'playTrick', cardId: le.id, targetId: t };
      }
      // 7. 兵粮寸断（距离 1；不重复放置）
      const bl = first('bingliang');
      if (bl) {
        const t = enemies().find(
          id => !s.players[id]!.judgements.some(c => (c.asSub ?? c.sub) === 'bingliang') && seatDistance(s, playerId, id) <= 1,
        );
        if (t != null) return { type: 'playTrick', cardId: bl.id, targetId: t };
      }
      // 8. 决斗（手里有杀素材才打得赢；空城空手目标免打）
      const jd = first('juedou');
      if (jd && shaMaterial(me, hand)) {
        const t = enemies().find(id => !isKongcheng(s.players[id]!));
        if (t != null) return { type: 'playTrick', cardId: jd.id, targetId: t };
      }
      // 8.5 离间：两名男性敌人在场时弃最不值钱的牌借刀（杀素材多者当决斗使用者）
      if (hasSkill(me, 'lijian') && !s.usedSkills.includes('lijian') && hand.length >= 2) {
        const males = enemies().filter(id => {
          const p = s.players[id]!;
          return p.alive && GENERAL_SEX[p.general] === 'm';
        });
        if (males.length >= 2) {
          const bySha = [...males].sort(
            (a, b) => s.players[b]!.hand.filter(c => canActAsSha(s.players[b]!, c)).length -
              s.players[a]!.hand.filter(c => canActAsSha(s.players[a]!, c)).length,
          );
          return {
            type: 'useSkill',
            sub: 'lijian',
            cardId: cheapest(hand, 1)[0]!.id,
            targetIds: [bySha[0]!, bySha[1]!],
          };
        }
      }
      // 8.6 反间（周瑜）：展示最不值钱的牌给敌人猜花色，猜错即伤 1 点
      if (hasSkill(me, 'fanjian') && !s.usedSkills.includes('fanjian') && hand.length >= 1) {
        const t = enemies().find(id => s.players[id]!.alive);
        if (t != null) {
          return { type: 'useSkill', sub: 'fanjian', cardId: cheapest(hand, 1)[0]!.id, targetIds: [t] };
        }
      }
      // 9. 群体锦囊（闪电不用——ADR-0005）：只在自己人不会吃亏时才放（M12）。
      //    只用手牌数估计命中概率——绝不读他人手牌（本项目 AI 的公开信息约束）。
      const others = v.players.filter(p => p.alive && p.id !== playerId);
      const hitChance = (id: number, kind: 'nanman' | 'wanjian') => {
        const p = s.players[id]!;
        if (kind === 'wanjian' && p.equipment.shield) return 0; // 八卦阵按"有闪"计
        const n = p.hand.length;
        const dodge = kind === 'nanman' ? 0.265 : 0.16; // 牌堆里杀/闪的密度（cards.ts）
        return Math.pow(1 - dodge, n);
      };
      const aoeWorthIt = (kind: 'nanman' | 'wanjian') => {
        const foes = others.filter(p => enemies().includes(p.id)).reduce((n, p) => n + hitChance(p.id, kind), 0);
        const allyCount = others
          .filter(p => !enemies().includes(p.id))
          .reduce((n, p) => n + hitChance(p.id, kind), 0);
        return foes > allyCount + 0.4; // 留一点余量：宁可少放，不放亏的
      };
      const nm = first('nanman');
      if (nm && aoeWorthIt('nanman')) return { type: 'playTrick', cardId: nm.id };
      const wj = first('wanjian');
      if (wj && aoeWorthIt('wanjian')) return { type: 'playTrick', cardId: wj.id };
      // 10. 杀：打攻击范围内血最少的敌人（方天画戟 + 最后手牌 → 多目标）
      const canSha = canPlayShaNow(s, me);
      let sm = canSha ? shaMaterial(me, hand) : undefined;
      let sm2: Card | undefined; // 丈八蛇矛第二张
      if (!sm && canSha && me.equipment.weapon?.sub === 'zhangba' && hand.length >= 3) {
        const two = cheapest(hand, 2);
        if (two.length === 2) {
          sm = two[0];
          sm2 = two[1];
        }
      }
      if (sm) {
        const inRange = enemies()
          .filter(id => {
            const t = s.players[id]!;
            return inShaRange(s, playerId, id) && !isKongcheng(t);
          })
          .sort((a, b) => s.players[a]!.hp - s.players[b]!.hp);
        if (inRange.length > 0) {
          if (me.equipment.weapon?.sub === 'fangtian' && hand.length === 1 && inRange.length >= 2) {
            return { type: 'playSha', cardId: sm.id, targetId: inRange[0]!, targetIds: inRange.slice(0, 3) };
          }
          return { type: 'playSha', cardId: sm.id, cardId2: sm2?.id, targetId: inRange[0]! };
        }
      }
      // 11. 桃园结义：全场回血，只在"自己人受益不少于敌人"时值得（M12）
      const ty = first('taoyuan');
      if (ty) {
        const wounded = v.players.filter(p => p.alive && p.hp < p.maxHp);
        const allyHeal = wounded.filter(p => p.id === playerId || !enemies().includes(p.id)).length;
        const foeHeal = wounded.filter(p => p.id !== playerId && enemies().includes(p.id)).length;
        if (allyHeal > foeHeal || (allyHeal > 0 && meP.hp < meP.maxHp && allyHeal >= foeHeal))
          return { type: 'playTrick', cardId: ty.id };
      }
      return { type: 'endPlay' };
    }
    case 'respondShan': {
      // 八卦阵优先判定（每条询问仅一次；青釭剑无视）
      if (me.equipment.shield && !pend.baguaTried && !pend.qinggang) return { type: 'respondBagua' };
      const sh = shanMaterial(me, hand);
      return { type: 'respondShan', cardId: sh ? sh.id : null };
    }
    case 'respondSha': {
      const sm = shaMaterial(me, hand);
      return { type: 'respondSha', cardId: sm ? sm.id : null };
    }
    case 'shaAgain': {
      const sm = shaMaterial(me, hand);
      return { type: 'shaAgain', cardId: sm ? sm.id : null };
    }
    case 'pickCard': {
      // AI 选牌：优先拿/拆对方武器，其次八卦/防具、坐骑，手牌随机兜底（ADR-0008）
      const t = s.players[pend.trickTargetId!]!;
      if (t.equipment.weapon) return { type: 'pickCard', from: 'weapon' };
      if (t.equipment.shield) return { type: 'pickCard', from: 'shield' };
      if (t.equipment.jian1ma) return { type: 'pickCard', from: 'jian1ma' };
      if (t.equipment.jia1ma) return { type: 'pickCard', from: 'jia1ma' };
      return { type: 'pickCard', from: 'hand' };
    }
    case 'respondWuxie': {
      // 无懈链（M11）：先判"我是否希望这张锦囊生效"（三态：希望/反对/不关心），
      // 再与当前奇偶（是否已被抵消）比对——只有立场与现状相悖时才出牌。
      // 这使"反无懈救自己的锦囊/救主公"自然成立；队友的锦囊仍不掺和（记录在案）。
      const f = s.frames.find(fr => fr.id === pend.frameId);
      if (!f || f.kind === 'sha') return { type: 'respondWuxie', cardId: null };
      const zhu = v.players.find(p => p.isZhu && p.alive);
      const myIdentity = v.me.identity;
      const iProtect = (id: number) =>
        id === me.id || ((myIdentity === 'zhong' || myIdentity === 'nei') && id === zhu?.id);
      const isDelayed = f.kind === 'delayedJudge';
      const targetId = isDelayed ? f.ownerId : f.targets[f.idx];
      let stance: boolean | null = null; // true=希望生效，false=希望被抵消，null=不关心
      if (isDelayed) {
        stance = iProtect(f.ownerId) ? false : null;
      } else if (f.userId === me.id) {
        stance = true; // 自己打出的锦囊，别人反无懈时我要救
      } else if (f.sub === 'wuzhong' || f.sub === 'taoyuan') {
        stance = iProtect(targetId!) ? true : null;
      } else {
        stance = iProtect(targetId!) ? false : null;
      }
      if (stance == null) return { type: 'respondWuxie', cardId: null };
      if (stance === (f.wuxieCount % 2 === 0)) return { type: 'respondWuxie', cardId: null };
      const wx = first('wuxie');
      return { type: 'respondWuxie', cardId: wx ? wx.id : null };
    }
    case 'trigger': {
      // 触发技（奸雄/反馈/洛神/枭姬）：AI 一律发动；洛神例外——手牌已多就收手
      if (pend.sub === 'luoshen' && hand.length >= 8) return { type: 'respondTrigger', use: false };
      return { type: 'respondTrigger', use: true };
    }
    case 'skillCard': {
      // 鬼才改判（M5 接上）：只优化自己的判定——八卦要红、乐要红桃、兵避草花、闪电避黑桃2-9
      const js = s.judgeState;
      if (!js || js.forId !== me.id || hand.length < 2)
        return { type: 'respondSkillCard', cardId: null };
      const r = js.result;
      const isRed = (c: Card) => c.suit === '♥' || c.suit === '♦';
      let want: ((c: Card) => boolean) | undefined;
      if (js.mode === 'bagua' && !isRed(r)) want = isRed;
      else if (js.reason === 'lebusi' && r.suit !== '♥') want = c => c.suit === '♥';
      else if (js.reason === 'bingliang' && r.suit === '♣') want = c => c.suit !== '♣';
      else if (js.reason === 'shandian' && r.suit === '♠' && r.rank >= 2 && r.rank <= 9)
        want = c => !(c.suit === '♠' && c.rank >= 2 && c.rank <= 9);
      const card = want ? hand.filter(want).sort((a, b) => cardValue(a) - cardValue(b) || a.id - b.id)[0] : undefined;
      return { type: 'respondSkillCard', cardId: card ? card.id : null };
    }
    case 'cixiong':
      // 雌雄双股剑：弃一张手牌比挨一刀划算
      return { type: 'respondCixiong', discard: true };
    case 'guanshi': {
      // 贯石斧：手牌充裕（≥3）时弃两张最不值钱的强行命中
      if (hand.length < 3) return { type: 'respondGuanshi', cardIds: null };
      return { type: 'respondGuanshi', cardIds: cheapest(hand, 2).map(c => c.id) };
    }
    case 'liuli': {
      // 流离：还有余牌就把杀甩给距离1内的男性敌人（无敌人可甩则不弃牌硬吃）
      if (hand.length < 2 || !pend.liuliTo || pend.liuliTo.length === 0)
        return { type: 'respondLiuli', cardId: null };
      const foes = pend.liuliTo.filter(id => enemies().includes(id));
      const to = foes[0] ?? pend.liuliTo[0]!;
      return { type: 'respondLiuli', cardId: cheapest(hand, 1)[0]!.id, transferTo: to };
    }
    case 'guanxing': {
      // 观星：全部置顶，按价值降序（先摸桃，其次闪/杀）——桃多为红桃，还能顺带躲乐
      const shown = pend.guanxingCards ?? [];
      const ordered = [...shown].sort((a, b) => cardValue(b) - cardValue(a) || a.id - b.id);
      return { type: 'respondGuanxing', topIds: ordered.map(c => c.id) };
    }
    case 'respondTao': {
      const dying = v.players.find(p => p.id === pend.dyingId)!;
      const worthSaving = playerId === dying.id || (v.me.identity === 'zhong' && dying.isZhu);
      // 桃优先；华佗急救助手：红色非桃手牌当桃（手牌≥2 时保留最后一张自救）
      const tao =
        (worthSaving ? first('tao') : undefined) ??
        (worthSaving && hasSkill(me, 'jijiu') && hand.length >= 2
          ? hand.find(c => c.sub !== 'tao' && c.sub !== 'shan' && isRedCard(c))
          : undefined);
      return { type: 'respondTao', cardId: tao ? tao.id : null };
    }
    case 'fanjian': {
      // 反间应答：猜花色。无信息可用时按牌堆构成猜【♥】（桃/杀/闪红牌最多）
      return { type: 'respondFanjian', suit: '♥' };
    }
    case 'discard': {
      // 保留价值：桃 > 闪 > 杀 > 锦囊/装备，弃最不值钱的
      const n = pend.count ?? 0;
      return { type: 'discard', cardIds: cheapest(hand, n).map(c => c.id) };
    }
  }
}
