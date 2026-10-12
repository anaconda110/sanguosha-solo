// 演出层（ADR-0009，M22 自 App.vue 迁出）：箭头/浮字/闪光的排队与清理。
// 只读事件日志做演出，绝不回写引擎状态；节奏随设置倍率（M18）。
// 依赖注入说明：引擎 state 是普通对象（非响应式），为避免闭包捕获过期绑定，
// enqueueAnimations/skipAnimations 由调用方（useGame.applyStep / resetUi / 桌面点击）
// 传入当前 state 与"是否回放"标记，本模块自身不持有对局状态。
import { nextTick, ref } from 'vue';
import { CARD_INFO, SKILL_INFO, type GameEvent, type GameState } from '../engine/types';
import { playSound, type SoundKind } from '../sound';
import type { Ref } from 'vue';
import type { Settings } from '../settings';

export interface Arrow { id: number; x1: number; y1: number; x2: number; y2: number }
export interface FloatText { id: number; playerId: number; text: string; kind: string }
export interface Flash { id: number; playerId: number; kind: string }

export function useAnimations(settings: Ref<Settings>) {
  // 已经过动画的事件下标（日志只追加，切片即新事件）
  let animIdx = 0;
  let animSeq = 0;
  const arrows = ref<Arrow[]>([]);
  const floats = ref<FloatText[]>([]);
  const flashes = ref<Flash[]>([]);
  // 注意：与原实现一致，enqueueAnimations 的 setTimeout 并未登记进 animTimers，
  // 它只在 skipAnimations 里被整体清空（当前恒为空——保留原样，行为零变化）。
  const animTimers: number[] = [];
  const seatEls: Record<number, HTMLElement | null> = {};
  const seatsBox = ref<HTMLElement | null>(null);

  /** 桌面容器与座次元素的 DOM 登记（表格区模板 :ref 调用） */
  function setSeatsBox(el: unknown) {
    seatsBox.value = (el as HTMLElement) ?? null;
  }
  function setSeatEl(pid: number, el: unknown) {
    seatEls[pid] = (el as HTMLElement) ?? null;
  }

  function spawnArrow(fromId: number, toId: number) {
    const box = seatsBox.value;
    const a = seatEls[fromId];
    const b = seatEls[toId];
    if (!box || !a || !b) return;
    const rb = box.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rc = b.getBoundingClientRect();
    const id = ++animSeq;
    arrows.value.push({
      id,
      x1: ra.left + ra.width / 2 - rb.left,
      y1: ra.top + ra.height / 2 - rb.top,
      x2: rc.left + rc.width / 2 - rb.left,
      y2: rc.top + rc.height / 2 - rb.top,
    });
    window.setTimeout(() => {
      arrows.value = arrows.value.filter(x => x.id !== id);
    }, 700);
  }

  function spawnFloat(playerId: number, text: string, kind: string) {
    const id = ++animSeq;
    floats.value.push({ id, playerId, text, kind });
    window.setTimeout(() => {
      floats.value = floats.value.filter(f => f.id !== id);
    }, 1500);
  }

  function spawnFlash(playerId: number, kind: string) {
    const id = ++animSeq;
    flashes.value.push({ id, playerId, kind });
    window.setTimeout(() => {
      flashes.value = flashes.value.filter(f => f.id !== id);
    }, 850);
  }

  /** 把 [fromIdx, now) 的新事件映射为动画；批内按 260ms 逐个错开，读出先后感 */
  function eventSound(e: GameEvent): SoundKind | null {
    switch (e.t) {
      case 'playCard':
      case 'respond':
        return e.t === 'respond' && e.card == null ? null : 'card';
      case 'draw':
        return 'draw';
      case 'damage':
        return 'damage';
      case 'heal':
        return 'heal';
      case 'dying':
        return 'dying';
      case 'negate':
        return 'negate';
      case 'judge':
      case 'judgeModify':
        return 'judge';
      case 'equip':
      case 'unequip':
        return 'equip';
      case 'gameOver':
        return 'gameover';
      default:
        return null;
    }
  }

  /**
   * 把 [fromIdx, state.log.length) 的新事件排队演出。
   * @param replaying 回放进行中则不演出，仅推进已演下标
   */
  function enqueueAnimations(fromIdx: number, state: GameState, replaying: boolean) {
    if (replaying) {
      animIdx = state.log.length; // 回放不演出
      return;
    }
    const news = state.log.slice(fromIdx);
    news.forEach((e, i) => {
      const delay = (i * 260) / settings.value.speed; // 动画节奏随设置倍率（M18）
      const snd = eventSound(e); // null = 无音效（playSound 对 null 本就 no-op）
      try { if (snd) playSound(snd, delay / 1000); } catch { /* 音效故障不得中断演出/游戏 */ }
      switch (e.t) {
        case 'playCard': {
          const name = CARD_INFO[e.card].display;
          const ts = e.targets ?? (e.target != null ? [e.target] : []);
          window.setTimeout(() => {
            for (const t of ts) {
              spawnArrow(e.player, t);
              spawnFloat(t, `【${name}】`, 'card');
            }
            if (ts.length === 0) spawnFloat(e.player, `【${name}】`, 'card');
          }, delay);
          break;
        }
        case 'damage':
          window.setTimeout(() => {
            spawnFlash(e.player, 'dmg');
            spawnFloat(e.player, `-${e.amount}`, 'dmg');
          }, delay);
          break;
        case 'heal':
          window.setTimeout(() => spawnFloat(e.player, `+${e.amount}`, 'heal'), delay);
          break;
        case 'dying':
          window.setTimeout(() => spawnFlash(e.player, 'dying'), delay);
          break;
        case 'death':
          window.setTimeout(() => spawnFloat(e.player, '阵亡', 'death'), delay);
          break;
        case 'judge':
          window.setTimeout(
            () => spawnFloat(e.player, `判定 ${e.card.suit}${e.card.rank}【${CARD_INFO[e.card.sub].display}】`, 'judge'),
            delay,
          );
          break;
        case 'skill':
        case 'judgeModify':
          window.setTimeout(() => spawnFloat(e.player, `【${SKILL_INFO[e.sub].display}】`, 'card'), delay);
          break;
        case 'ability':
          window.setTimeout(() => spawnFloat(e.player, `【${CARD_INFO[e.sub].display}】`, 'card'), delay);
          break;
        case 'negate':
          if (e.targetId != null) {
            window.setTimeout(() => spawnFloat(e.targetId!, '无懈可击！', 'wuxie'), delay);
          }
          break;
      }
    });
    animIdx = state.log.length;
  }

  /** 动画跳过：点桌面空白处立即结算所有待播演出（M20） */
  function skipAnimations(logLen: number) {
    for (const id of animTimers.splice(0)) clearTimeout(id);
    animIdx = logLen;
    arrows.value = [];
    floats.value = [];
    flashes.value = [];
  }

  /** 新局/续局：清空待播演出，且不补演开场事件 */
  function clearAndSync(logLen: number) {
    arrows.value = [];
    floats.value = [];
    flashes.value = [];
    animIdx = logLen;
  }

  const floatsFor = (pid: number) => floats.value.filter(f => f.playerId === pid);
  const flashesFor = (pid: number) => flashes.value.filter(f => f.playerId === pid);

  // —— 手牌排序 FLIP（ADR-0009）：记录旧位置，DOM 更新后平移动画到新位置 ——
  function captureHandRects(): Map<number, DOMRect> {
    const m = new Map<number, DOMRect>();
    document.querySelectorAll<HTMLElement>('.hand .card[data-cid]').forEach(el => {
      m.set(Number(el.dataset.cid), el.getBoundingClientRect());
    });
    return m;
  }
  async function flipHand(from: Map<number, DOMRect>) {
    await nextTick();
    document.querySelectorAll<HTMLElement>('.hand .card[data-cid]').forEach(el => {
      const old = from.get(Number(el.dataset.cid));
      if (!old) return;
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left;
      if (Math.abs(dx) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateX(${dx}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.28s ease';
        el.style.transform = '';
      });
    });
  }

  return {
    arrows,
    floats,
    flashes,
    setSeatsBox,
    setSeatEl,
    enqueueAnimations,
    skipAnimations,
    clearAndSync,
    floatsFor,
    flashesFor,
    captureHandRects,
    flipHand,
  };
}

export type AnimationsApi = ReturnType<typeof useAnimations>;
