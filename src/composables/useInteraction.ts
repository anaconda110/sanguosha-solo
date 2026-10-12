// 提示栏会话态 + 交互性强化（M20，M22 自 App.vue 迁出）：
// 选牌/多选模式/离间/方天/突袭/流离/观星等"点牌-点目标"会话状态，
// 以及悬停说明、拖拽出牌、目标高亮（targetingMode/isTargetable）。
// 依赖单向：interaction → game（读 view/pend、经 act 提交动作），绝不反向 import。
// 重置纪律：act/resetUi 后由 game 经组合根回调 resetAll() 清空全部会话选择，
// 清空顺序与原实现逐行一致（cancelSel → 各多选清空 → resetLijian）。
import { computed, ref } from 'vue';
import { hasAnyCard, inShaRange, seatDistance } from '../engine/step';
import { CARD_INFO } from '../engine/types';
import type { Card, CardSub, Suit } from '../engine/types';
import type { GameApi } from './useGame';

export function useInteraction(deps: { game: GameApi }) {
  const { view, humanId, spectate, pend, me, meP, myGeneral, canSha, zhangbaOn, act, getState, altShaMaterial, isRedCard } = deps.game;

  /** 出牌阶段选中的手牌：杀（含技能转换）或需指定目标的锦囊 */
  const selected = ref<{ cardId: number; sub: CardSub } | null>(null);
  /** 丈八蛇矛：与 selected 配对的第二张手牌（两张当杀） */
  const selected2 = ref<Card | null>(null);
  /** 方天画戟：多目标选择（确认后一次性使用） */
  const fangtianTargets = ref<number[]>([]);
  /** 借刀杀人（M13）：两步——先点持武器者，再点杀的目标 */
  const jiedaoVictim = ref<number | null>(null);
  /** 贯石斧：弃两张手牌强行命中的选择 */
  const guanshiSel = ref<number[]>([]);
  /** 离间三步：按钮 → 点一张手牌 → 点两名男性（先选决斗使用者） */
  const lijianMode = ref(false);
  const lijianCard = ref<Card | null>(null);
  const lijianTargets = ref<number[]>([]);
  /** 观星：点选置顶的牌（顺序即摸取顺序） */
  const guanxingPick = ref<number[]>([]);
  /** 通用主动技多选（M10/M11）：制衡/仁德/青囊/反间——先点技按钮，再点手牌，最后点确认/目标 */
  const activeMode = ref<'zhiheng' | 'rende' | 'qingnang' | 'fanjian' | 'jieyin' | null>(null);
  const activeSel = ref<number[]>([]);
  /** 流离两步：点一张手牌弃置 → 点要转移给的男性 */
  const liuliPick = ref<Card | null>(null);
  /** 突袭（张辽·M16）：至多两名目标的多选 */
  const tuxiSel = ref<number[]>([]);
  const discardSel = ref<number[]>([]);

  // —— 交互性强化（M20）：悬停说明 / 目标反馈 / 拖拽出牌 / 详情面板 ——

  /** 悬停的手牌（底部说明条内容） */
  const hoverCard = ref<Card | null>(null);

  /** 悬停的座次 + 详情面板位置（跟随鼠标） */
  const hoverSeat = ref<number | null>(null);
  const seatTipPos = ref({ x: 0, y: 0 });
  function seatHoverEnter(pid: number, ev: MouseEvent) {
    hoverSeat.value = pid;
    seatTipPos.value = { x: ev.clientX + 14, y: ev.clientY + 10 };
  }
  function seatHoverMove(ev: MouseEvent) {
    if (hoverSeat.value == null) return;
    seatTipPos.value = { x: ev.clientX + 14, y: ev.clientY + 10 };
  }
  function seatHoverLeave() {
    hoverSeat.value = null;
  }

  /** 拖拽出牌：按下手牌拖到可目标座次松手即出；点击选牌行为不变 */
  const drag = ref<{ card: Card; active: boolean; x: number; y: number; over: number | null } | null>(null);
  let dragStart = { x: 0, y: 0 };
  function cardPointerDown(c: Card, ev: PointerEvent) {
    if (pend.value?.kind !== 'play' || spectate.value) return;
    dragStart = { x: ev.clientX, y: ev.clientY };
    drag.value = { card: c, active: false, x: ev.clientX, y: ev.clientY, over: null };
    window.addEventListener('pointermove', cardDragMove);
    window.addEventListener('pointerup', cardDragUp, { once: true });
  }
  function cardDragMove(ev: PointerEvent) {
    const d = drag.value;
    if (!d) return;
    if (!d.active && Math.hypot(ev.clientX - dragStart.x, ev.clientY - dragStart.y) > 10) d.active = true;
    if (!d.active) return;
    d.x = ev.clientX;
    d.y = ev.clientY;
    const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.seat');
    d.over = el ? Number((el as HTMLElement).dataset.pid) || null : null;
  }
  function cardDragUp(ev: PointerEvent) {
    window.removeEventListener('pointermove', cardDragMove);
    const d = drag.value;
    drag.value = null;
    if (!d) return;
    if (d.active && d.over != null && isTargetable(d.over)) {
      clickSuppressed = true; // 拖拽后的 click 不再触发选牌
      onSeatClick(d.over);
      setTimeout(() => (clickSuppressed = false), 0);
    }
  }

  /** 是否处于"点了牌等目标"状态：高亮可选目标、置灰其余座次（M20） */
  let clickSuppressed = false; // 拖拽结束后紧随的 click 需吞掉

  const targetingMode = computed(
    () =>
      !spectate.value &&
      ((pend.value?.kind === 'play' && (!!selected.value || !!activeMode.value)) ||
        pend.value?.kind === 'tuxi' ||
        (pend.value?.kind === 'liuli' && !!liuliPick.value)),
  );

  // —— 会话选择的重置 ——
  function resetLijian() {
    lijianMode.value = false;
    lijianCard.value = null;
    lijianTargets.value = [];
  }

  function cancelSel() {
    selected.value = null;
    selected2.value = null;
    fangtianTargets.value = [];
    jiedaoVictim.value = null;
  }

  /** act/resetUi 后清空全部会话选择（顺序与原实现一致；game 经组合根回调） */
  function resetAll() {
    cancelSel();
    discardSel.value = [];
    guanshiSel.value = [];
    guanxingPick.value = [];
    liuliPick.value = null;
    tuxiSel.value = [];
    activeMode.value = null;
    activeSel.value = [];
    resetLijian();
  }

  // —— 离间（貂蝉）：三步交互 ——
  function toggleLijian() {
    resetLijian();
    lijianMode.value = true;
  }
  /** 离间选目标：点选两名男性，集齐即提交 */
  function lijianSeatClick(pid: number) {
    const i = lijianTargets.value.indexOf(pid);
    if (i >= 0) {
      lijianTargets.value.splice(i, 1);
      return;
    }
    if (lijianTargets.value.length >= 2) return;
    lijianTargets.value.push(pid);
    if (lijianTargets.value.length === 2 && lijianCard.value) {
      act({ type: 'useSkill', sub: 'lijian', cardId: lijianCard.value.id, targetIds: [...lijianTargets.value] });
    }
  }
  /** 方天画戟多目标可用：选中的杀是最后一张手牌 */
  const fangtianEligible = computed(() => {
    if (pend.value?.kind !== 'play' || selected.value?.sub !== 'sha' || selected2.value) return false;
    if (!meP.value?.equips.includes('fangtian')) return false;
    return (me.value?.hand.length ?? 0) === 1;
  });

  // —— 弃牌询问 ——
  const discardCount = computed(() => view.value.pending?.count ?? 0);
  const canConfirmDiscard = computed(() => discardSel.value.length === discardCount.value);

  function isTargetable(pid: number): boolean {
    const sel = selected.value;
    if (activeMode.value === 'rende') {
      const t = view.value.players[pid]!;
      return activeSel.value.length > 0 && t.alive && pid !== humanId.value;
    }
    if (activeMode.value === 'qingnang') {
      const t = view.value.players[pid]!;
      return activeSel.value.length === 1 && t.alive && t.hp < t.maxHp;
    }
    if (activeMode.value === 'fanjian') {
      const t = view.value.players[pid]!;
      return activeSel.value.length === 1 && t.alive && pid !== humanId.value;
    }
    if (activeMode.value === 'jieyin') {
      const t = view.value.players[pid]!;
      return activeSel.value.length === 2 && t.alive && t.sex === 'm' && t.hp < t.maxHp;
    }
    if (lijianMode.value && lijianCard.value) {
      const t = view.value.players[pid]!;
      return t.alive && t.id !== humanId.value && t.sex === 'm';
    }
    if (pend.value?.kind === 'liuli' && liuliPick.value) {
      return (pend.value.liuliTo ?? []).includes(pid);
    }
    if (pend.value?.kind === 'tuxi') {
      const t = view.value.players[pid]!;
      return t.alive && pid !== humanId.value && (pend.value.tuxiTo ?? []).includes(pid);
    }
    if (!sel || pend.value?.kind !== 'play') return false;
    const t = view.value.players[pid]!;
    if (!t.alive || t.id === humanId.value) return false;
    if (sel.sub === 'sha') return inShaRange(getState(), humanId.value, pid);
    if (sel.sub === 'jiedao') {
      // 借刀：先选持武器者（不可选自己），再选其攻击范围内的杀目标
      if (jiedaoVictim.value == null) {
        return t.alive && t.id !== humanId.value && !!getState().players[pid]!.equipment.weapon;
      }
      return t.alive && t.id !== jiedaoVictim.value && inShaRange(getState(), jiedaoVictim.value, pid);
    }
    if (sel.sub === 'shunshou')
      return hasAnyCard(getState().players[pid]!) && seatDistance(getState(), humanId.value, pid) <= 1;
    if (sel.sub === 'lebusi') return !t.judgements.includes('lebusi');
    if (sel.sub === 'bingliang')
      return !t.judgements.includes('bingliang') && seatDistance(getState(), humanId.value, pid) <= 1;
    // guohe / juedou
    return hasAnyCard(getState().players[pid]!);
  }

  /** 出牌阶段的卡牌点击语义 */
  function onCardClick(c: Card) {
    if (clickSuppressed) {
      clickSuppressed = false;
      return;
    }
    if (pend.value?.kind === 'play') {
      if (lijianMode.value) {
        if (!lijianCard.value) lijianCard.value = c; // 第一步：选弃置的手牌
        return;
      }
      if (activeMode.value) {
        // 制衡/仁德：多选切换；青囊/反间：单选（点新牌替换）
        const i = activeSel.value.indexOf(c.id);
        if (activeMode.value === 'qingnang' || activeMode.value === 'fanjian') activeSel.value = i >= 0 ? [] : [c.id];
        else if (activeMode.value === 'jieyin' && activeSel.value.length >= 2 && i < 0) return; // 结姻最多两张
        else if (i >= 0) activeSel.value.splice(i, 1);
        else activeSel.value.push(c.id);
        return;
      }
      // 丈八蛇矛：已选中一张杀素材时，再点任意不同手牌 → 组成两张当杀
      if (zhangbaOn.value && canSha.value && selected.value?.sub === 'sha' && !selected2.value) {
        if (c.id === selected.value.cardId) {
          cancelSel();
          return;
        }
        selected2.value = c;
        return;
      }
      if (c.sub === 'tao' && meP.value && meP.value.hp < meP.value.maxHp) {
        act({ type: 'playTao', cardId: c.id });
      } else if (CARD_INFO[c.sub].kind === 'equip') {
        act({ type: 'playEquip', cardId: c.id });
      } else if (
        c.sub === 'wuzhong' || c.sub === 'nanman' || c.sub === 'wanjian' ||
        c.sub === 'taoyuan' || c.sub === 'shandian' || c.sub === 'wugu'
      ) {
        act({ type: 'playTrick', cardId: c.id }); // 无需指定目标
      } else if (c.sub === 'sha' && canSha.value) {
        selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'sha' };
        fangtianTargets.value = [];
      } else if (c.sub !== 'sha' && c.sub !== 'wuxie' && altShaMaterial()?.id === c.id && canSha.value) {
        // 武圣/龙胆：红牌或闪当作杀
        selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'sha' };
        fangtianTargets.value = [];
      } else if (
        c.sub === 'guohe' || c.sub === 'shunshou' || c.sub === 'juedou' ||
        c.sub === 'lebusi' || c.sub === 'bingliang' || c.sub === 'jiedao'
      ) {
        selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: c.sub };
        jiedaoVictim.value = null;
      } else if (myGeneral.value === 'dajiao' && c.suit === ('♦' as Suit) && c.sub !== 'tao' && CARD_INFO[c.sub].kind !== 'trick') {
        // 国色：方块非锦囊牌当乐不思蜀
        selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'lebusi' };
      } else if (myGeneral.value === 'ganning' && !isRedCard(c) && c.sub !== 'tao' && CARD_INFO[c.sub].kind !== 'trick') {
        // 奇袭：黑色非锦囊牌当过河拆桥
        selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'guohe' };
      } else if (zhangbaOn.value && canSha.value) {
        // 丈八蛇矛：任意手牌（闪/无懈等）都能作为杀的第一张
        selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'sha' };
        fangtianTargets.value = [];
      }
      // 闪（非龙胆）/无懈可击不能主动使用
    } else if (pend.value?.kind === 'discard') {
      const i = discardSel.value.indexOf(c.id);
      if (i >= 0) discardSel.value.splice(i, 1);
      else if (discardSel.value.length < discardCount.value) discardSel.value.push(c.id);
    } else if (pend.value?.kind === 'skillCard') {
      // 鬼才：点手牌替换判定牌
      act({ type: 'respondSkillCard', cardId: c.id });
    } else if (pend.value?.kind === 'guanshi') {
      // 贯石斧：点两张手牌
      const i = guanshiSel.value.indexOf(c.id);
      if (i >= 0) guanshiSel.value.splice(i, 1);
      else if (guanshiSel.value.length < 2) guanshiSel.value.push(c.id);
    } else if (pend.value?.kind === 'liuli') {
      // 流离：先点弃置的手牌
      liuliPick.value = c;
    }
  }

  /** 观星：点牌按顺序置顶，再点取消 */
  function onGuanxingClick(c: Card) {
    const i = guanxingPick.value.indexOf(c.id);
    if (i >= 0) guanxingPick.value.splice(i, 1);
    else guanxingPick.value.push(c.id);
  }

  function onSeatClick(pid: number) {
    if (activeMode.value === 'rende') {
      const t = view.value.players[pid]!;
      if (!t.alive || pid === humanId.value || activeSel.value.length === 0) return;
      act({ type: 'useSkill', sub: 'rende', cardIds: [...activeSel.value], targetIds: [pid] });
      return;
    }
    if (activeMode.value === 'qingnang') {
      const t = view.value.players[pid]!;
      if (!t.alive || t.hp >= t.maxHp || activeSel.value.length !== 1) return;
      act({ type: 'useSkill', sub: 'qingnang', cardId: activeSel.value[0], targetIds: [pid] });
      return;
    }
    if (activeMode.value === 'fanjian') {
      const t = view.value.players[pid]!;
      if (!t.alive || pid === humanId.value || activeSel.value.length !== 1) return;
      act({ type: 'useSkill', sub: 'fanjian', cardId: activeSel.value[0], targetIds: [pid] });
      return;
    }
    if (activeMode.value === 'jieyin') {
      const t = view.value.players[pid]!;
      if (!t.alive || t.sex !== 'm' || t.hp >= t.maxHp || activeSel.value.length !== 2) return;
      act({ type: 'useSkill', sub: 'jieyin', cardIds: [...activeSel.value], targetIds: [pid] });
      return;
    }
    if (lijianMode.value && lijianCard.value) {
      if (!isTargetable(pid)) return;
      lijianSeatClick(pid);
      return;
    }
    if (pend.value?.kind === 'liuli' && liuliPick.value) {
      if (!isTargetable(pid)) return;
      act({ type: 'respondLiuli', cardId: liuliPick.value.id, transferTo: pid });
      return;
    }
    if (pend.value?.kind === 'tuxi') {
      // 突袭：点选切换（至多两名），「确定」按钮提交
      if (!isTargetable(pid)) return;
      const i = tuxiSel.value.indexOf(pid);
      if (i >= 0) tuxiSel.value.splice(i, 1);
      else if (tuxiSel.value.length < 2) tuxiSel.value.push(pid);
      return;
    }
    if (!selected.value || pend.value?.kind !== 'play') return;
    if (!isTargetable(pid)) return;
    if (selected.value.sub === 'jiedao') {
      // 借刀杀人：第一步点持武器者，第二步点他要打的杀目标（M13）
      if (jiedaoVictim.value == null) {
        jiedaoVictim.value = pid;
        return;
      }
      if (pid === jiedaoVictim.value) {
        jiedaoVictim.value = null; // 再点自己取消
        return;
      }
      act({
        type: 'playTrick',
        cardId: selected.value.cardId,
        targetId: jiedaoVictim.value,
        targetIds: [jiedaoVictim.value, pid],
      });
      jiedaoVictim.value = null;
      return;
    }
    if (selected.value.sub === 'sha') {
      if (fangtianEligible.value) {
        // 方天画戟：目标点击切换选择，确认按钮统一使用
        const i = fangtianTargets.value.indexOf(pid);
        if (i >= 0) fangtianTargets.value.splice(i, 1);
        else if (fangtianTargets.value.length < 3) fangtianTargets.value.push(pid);
        return;
      }
      act({ type: 'playSha', cardId: selected.value.cardId, cardId2: selected2.value?.id, targetId: pid });
    } else {
      act({ type: 'playTrick', cardId: selected.value.cardId, targetId: pid });
    }
  }

  /** 方天画戟确认：单目标走普通使用，多目标走 targetIds */
  function confirmFangtian() {
    if (!selected.value || fangtianTargets.value.length === 0) return;
    const ts = [...fangtianTargets.value];
    if (ts.length === 1) act({ type: 'playSha', cardId: selected.value.cardId, targetId: ts[0]! });
    else act({ type: 'playSha', cardId: selected.value.cardId, targetId: ts[0]!, targetIds: ts });
  }

  return {
    selected,
    selected2,
    fangtianTargets,
    jiedaoVictim,
    guanshiSel,
    lijianMode,
    lijianCard,
    lijianTargets,
    guanxingPick,
    activeMode,
    activeSel,
    liuliPick,
    tuxiSel,
    discardSel,
    hoverCard,
    hoverSeat,
    seatTipPos,
    drag,
    targetingMode,
    fangtianEligible,
    discardCount,
    canConfirmDiscard,
    seatHoverEnter,
    seatHoverMove,
    seatHoverLeave,
    cardPointerDown,
    resetLijian,
    cancelSel,
    resetAll,
    toggleLijian,
    lijianSeatClick,
    isTargetable,
    onCardClick,
    onGuanxingClick,
    onSeatClick,
    confirmFangtian,
  };
}

export type InteractionApi = ReturnType<typeof useInteraction>;
