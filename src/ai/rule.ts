// A1→M5 规则型 AI：优先级表驱动（ADR-0003/0005/0010/0011）。
// 只使用公开信息（座次/血量/装备/判定区/手牌数/距离）与自己的手牌身份，不作读牌。
// 已知局限（记录在案）：不使用无懈可击、不用闪电、鬼才只优化自己的判定、
// 丈八蛇矛仅在无普通杀素材且手牌≥3 时动用、方天画戟不用在丈八两牌上。
import { canPlayShaNow, hasAnyCard, inShaRange, seatDistance } from '../engine/step';
import { canActAsSha, canActAsShan, hasSkill, isBlackCard, isKongcheng } from '../engine/skills';
import { CARD_INFO, GENERAL_SEX } from '../engine/types';
import type { Action, Card, CardSub, GameState, PlayerState } from '../engine/types';
import { viewOf } from '../engine/view';

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

export function ruleAction(s: GameState, playerId: number): Action | null {
  const v = viewOf(s, playerId);
  const pend = v.pending;
  if (!pend || !v.me || pend.playerId !== playerId) return null;
  const me = s.players[playerId]!;
  const hand = v.me.hand;
  const meP = v.players.find(p => p.id === playerId)!;

  // 敌我：只用自身身份 + 主公明置。反贼主公优先；忠臣/内奸不打主公。
  const enemies: number[] = (() => {
    const others = v.players.filter(p => p.alive && p.id !== playerId);
    switch (v.me.identity) {
      case 'fan':
        return [...others.filter(p => p.isZhu), ...others.filter(p => !p.isZhu)].map(p => p.id);
      case 'zhong':
      case 'nei':
        return others.filter(p => !p.isZhu).map(p => p.id);
      default:
        return others.map(p => p.id);
    }
  })();
  const first = (sub: CardSub): Card | undefined => hand.find(c => c.sub === sub);

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
        const t = enemies.find(id => hasAnyCard(s.players[id]!) && seatDistance(s, playerId, id) <= 1);
        if (t != null) return { type: 'playTrick', cardId: ss.id, targetId: t };
      }
      // 5. 过河拆桥（含奇袭：黑色非锦囊牌当拆——天然锦囊不转换，ADR-0014）
      const gh =
        first('guohe') ??
        (hasSkill(me, 'qixi')
          ? hand.find(c => isBlackCard(c) && c.sub !== 'tao' && CARD_INFO[c.sub].kind !== 'trick')
          : undefined);
      if (gh) {
        const t = enemies.find(id => hasAnyCard(s.players[id]!));
        if (t != null) return { type: 'playTrick', cardId: gh.id, targetId: t };
      }
      // 6. 乐不思蜀（含国色：方块非锦囊牌当乐——天然锦囊不转换；无距离限制；不重复放置）
      const le =
        first('lebusi') ??
        (hasSkill(me, 'guose')
          ? hand.find(c => c.suit === '♦' && c.sub !== 'tao' && CARD_INFO[c.sub].kind !== 'trick')
          : undefined);
      if (le) {
        const t = enemies.find(id => !s.players[id]!.judgements.some(c => (c.asSub ?? c.sub) === 'lebusi'));
        if (t != null) return { type: 'playTrick', cardId: le.id, targetId: t };
      }
      // 7. 兵粮寸断（距离 1；不重复放置）
      const bl = first('bingliang');
      if (bl) {
        const t = enemies.find(
          id => !s.players[id]!.judgements.some(c => (c.asSub ?? c.sub) === 'bingliang') && seatDistance(s, playerId, id) <= 1,
        );
        if (t != null) return { type: 'playTrick', cardId: bl.id, targetId: t };
      }
      // 8. 决斗（手里有杀素材才打得赢；空城空手目标免打）
      const jd = first('juedou');
      if (jd && shaMaterial(me, hand)) {
        const t = enemies.find(id => !isKongcheng(s.players[id]!));
        if (t != null) return { type: 'playTrick', cardId: jd.id, targetId: t };
      }
      // 8.5 离间：两名男性敌人在场时弃最不值钱的牌借刀（杀素材多者当决斗使用者）
      if (hasSkill(me, 'lijian') && !s.usedSkills.includes('lijian') && hand.length >= 2) {
        const males = enemies.filter(id => {
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
      // 9. 群体锦囊（闪电不用——ADR-0005）
      const nm = first('nanman');
      if (nm) return { type: 'playTrick', cardId: nm.id };
      const wj = first('wanjian');
      if (wj) return { type: 'playTrick', cardId: wj.id };
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
        const inRange = enemies
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
      // 11. 桃园结义（场上有人掉血才值得）
      const ty = first('taoyuan');
      if (ty && v.players.some(p => p.alive && p.hp < p.maxHp))
        return { type: 'playTrick', cardId: ty.id };
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
      // M6 接上：自保 + 忠内保主公。不无懈自己使用的锦囊，不参与无懈对无懈。
      const f = s.frames.find(fr => fr.id === pend.frameId);
      if (!f || f.kind !== 'trick') return { type: 'respondWuxie', cardId: null };
      if (f.userId === me.id) return { type: 'respondWuxie', cardId: null };
      const targetId = pend.trickTargetId;
      if (targetId == null) return { type: 'respondWuxie', cardId: null };
      const self = targetId === me.id;
      const zhu = v.players.find(p => p.isZhu && p.alive);
      const protectZhu =
        (v.me.identity === 'zhong' || v.me.identity === 'nei') && targetId === zhu?.id;
      if (!self && !protectZhu) return { type: 'respondWuxie', cardId: null };
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
      const foes = pend.liuliTo.filter(id => enemies.includes(id));
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
      const tao = worthSaving ? first('tao') : undefined;
      return { type: 'respondTao', cardId: tao ? tao.id : null };
    }
    case 'discard': {
      // 保留价值：桃 > 闪 > 杀 > 锦囊/装备，弃最不值钱的
      const n = pend.count ?? 0;
      return { type: 'discard', cardIds: cheapest(hand, n).map(c => c.id) };
    }
  }
}
