<script setup lang="ts">
// 手牌区：牌面信息、可用态、选中反馈、键盘操作与拖拽出牌。
// 点击/拖拽语义集中在 useInteraction；本组件只负责渲染和转发。
import { computed } from 'vue';
import { CARD_INFO, type Card, type CardKind, type Suit } from '../engine/types';
import type { GameApi, InteractionApi } from '../composables/types';
import { disp } from '../composables/labels';

const props = defineProps<{ game: GameApi; interact: InteractionApi }>();
const { me, meP, myGeneral, pend, zhangbaOn } = props.game;
const {
  activeMode, lijianCard, hoverCard, drag, onCardClick, cardPointerDown,
  isCardActionable, isCardActionableReason, resetAll, discardCount,
  selectedCardIds, hasSelection, selectionLabel, targetingMode,
} = props.interact;

const KIND_ORDER: Record<CardKind, number> = { basic: 0, trick: 1, equip: 2 };
const SUIT_ORDER: Record<Suit, number> = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };
const KIND_LABEL: Record<CardKind, string> = { basic: '基本', trick: '锦囊', equip: '装备' };

const handSorted = computed(() => {
  const hand = me.value?.hand ?? [];
  return [...hand].sort((a, b) => {
    const k = KIND_ORDER[CARD_INFO[a.sub].kind] - KIND_ORDER[CARD_INFO[b.sub].kind];
    if (k !== 0) return k;
    const s = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    if (s !== 0) return s;
    return a.rank - b.rank;
  });
});

const handHint = computed(() => {
  const p = pend.value;
  if (!p) return me.value ? '等待当前行动结束' : '观战模式';
  if (p.kind === 'play') {
    if (activeMode.value) return '点选技能所需手牌';
    if (lijianCard.value) return '离间手牌已选，下一步选择两名男性角色';
    return '高亮牌可使用；杀与锦囊选牌后再点目标';
  }
  if (p.kind === 'discard') return `点选 ${discardCount.value} 张要弃置的手牌`;
  if (['respondShan', 'respondSha', 'respondWuxie', 'respondTao', 'shaAgain', 'jiedao'].includes(p.kind)) {
    return '可直接点击高亮手牌应答，也可使用下方按钮';
  }
  if (p.kind === 'skillCard') return '点一张手牌替换判定牌';
  if (p.kind === 'guanshi') return '点选两张手牌发动贯石斧';
  if (p.kind === 'liuli') return '点一张手牌作为流离代价';
  return '按提示栏继续当前步骤';
});

/** 手牌技能角标：返回该牌当前可用技能名，无则 null（提示可当杀/当闪） */
function skillHint(c: Card): string | null {
  const g = myGeneral.value;
  if (g === 'guanyu') {
    if (c.sub === 'sha') return null;
    if (c.sub === 'tao') return (meP.value?.hp ?? 0) >= (meP.value?.maxHp ?? 0) ? '武圣' : null;
    return props.game.isRedCard(c) ? '武圣' : zhangbaHint(c);
  }
  if (g === 'zhaoyun') {
    if (c.sub === 'shan') return null;
    if (c.sub === 'sha') return '龙胆·闪';
    return zhangbaHint(c);
  }
  if (g === 'zhenji') {
    if (c.sub === 'shan') return null;
    if (!props.game.isRedCard(c)) return '倾国';
    return zhangbaHint(c);
  }
  if (g === 'dajiao') {
    if (c.suit === ('♦' as Suit) && CARD_INFO[c.sub].kind !== 'trick' && c.sub !== 'tao') return '国色';
    return zhangbaHint(c);
  }
  if (g === 'ganning') {
    if (!props.game.isRedCard(c) && CARD_INFO[c.sub].kind !== 'trick' && c.sub !== 'tao') return '奇袭';
    return zhangbaHint(c);
  }
  return zhangbaHint(c);
}

function zhangbaHint(c: Card): string | null {
  return zhangbaOn.value && c.sub !== 'tao' ? '丈八' : null;
}

function isSelected(c: Card): boolean {
  return selectedCardIds.value.has(c.id);
}

function cardAriaLabel(c: Card): string {
  const reason = isCardActionableReason(c);
  const action = reason === null ? '可使用' : `当前不可使用：${reason}`;
  return `${disp(c.sub)}，${c.suit}${c.rank}，${action}`;
}
</script>

<template>
  <div
    v-if="hoverCard && CARD_INFO[hoverCard.sub].desc"
    class="card-tip"
    :class="{ 'with-target-tray': targetingMode }"
  >
    <div class="card-tip-head">
      <span>【{{ CARD_INFO[hoverCard.sub].display }}】</span>
      <span class="card-tip-sub">{{ hoverCard.suit }}{{ hoverCard.rank }} · {{ KIND_LABEL[CARD_INFO[hoverCard.sub].kind] }}{{ CARD_INFO[hoverCard.sub].range ? ' · 射程 ' + CARD_INFO[hoverCard.sub].range : '' }}</span>
    </div>
    <div class="card-tip-desc">{{ CARD_INFO[hoverCard.sub].desc }}</div>
  </div>

  <section class="hand-shell" :class="{ targeting: targetingMode }" aria-label="我的手牌">
    <div class="hand-toolbar">
      <div class="hand-title">
        <span class="hand-title-main">手牌</span>
        <span class="hand-count">{{ handSorted.length }}</span>
      </div>
      <span class="hand-hint">{{ handHint }}</span>
    </div>

    <div class="hand" role="list">
      <button
        v-for="c in handSorted"
        :key="c.id"
        type="button"
        role="listitem"
        :data-cid="c.id"
        class="card"
        :class="[
          c.sub,
          CARD_INFO[c.sub].kind,
          c.suit === '♥' || c.suit === '♦' ? 'suit-red' : 'suit-black',
          {
            selected: isSelected(c),
            clickable: isCardActionable(c),
            dragging: drag?.card.id === c.id && drag.active,
          },
        ]"
        :aria-pressed="isSelected(c)"
        :aria-label="cardAriaLabel(c)"
        :title="isCardActionableReason(c) ?? '可使用'"
        @click="onCardClick(c)"
        @pointerdown="cardPointerDown(c, $event)"
        @mouseenter="hoverCard = c"
        @mouseleave="hoverCard = null"
        @focus="hoverCard = c"
        @blur="hoverCard = null"
      >
        <span class="card-corner">
          <span class="csuit">{{ c.suit }}</span>
          <span class="crank">{{ c.rank }}</span>
        </span>
        <span class="card-category">{{ KIND_LABEL[CARD_INFO[c.sub].kind] }}</span>
        <span class="cname" :class="{ long: disp(c.sub).length > 2 }">{{ disp(c.sub) }}</span>
        <span v-if="skillHint(c)" class="card-skill">{{ skillHint(c) }}</span>
        <span v-if="isCardActionable(c)" class="card-ready" aria-hidden="true" />
      </button>
      <div v-if="!me" class="spectating">观战中 · 手牌不可见</div>
      <div v-else-if="handSorted.length === 0" class="empty-hand">暂无手牌</div>
    </div>

    <div v-if="hasSelection" class="selection-bar" role="status">
      <span class="selection-mark">✓</span>
      <span class="selection-text">{{ selectionLabel }}</span>
      <button class="btn ghost selection-cancel" @click="resetAll">取消选择 <kbd>Esc</kbd></button>
    </div>
  </section>
</template>

<style>
.hand-shell {
  position: relative;
  margin-bottom: 4px;
  padding: 12px 14px 14px;
  border: 1px solid var(--line, #34404a);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 40%),
    var(--panel, #151c22);
  box-shadow: var(--shadow-sm, 0 8px 20px rgb(0 0 0 / 18%));
}
.hand-shell.targeting {
  position: fixed;
  left: max(14px, calc((100vw - 1212px) / 2));
  bottom: 10px;
  z-index: 70;
  width: calc(100vw - 342px);
  max-width: 898px;
  margin-bottom: 0;
  padding: 9px 12px 10px;
  border-color: rgb(217 181 111 / 48%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 5%), transparent 34%),
    rgb(15 22 26 / 97%);
  box-shadow: 0 18px 42px rgb(0 0 0 / 58%), 0 0 0 1px rgb(217 181 111 / 8%);
  backdrop-filter: blur(14px);
  animation: targetTrayIn 160ms ease-out both;
}
.hand-shell.targeting .hand-toolbar {
  display: none;
}
.hand-shell.targeting .hand {
  min-height: 0;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: 4px 2px 5px;
  scrollbar-width: thin;
  scroll-snap-type: x proximity;
}
.hand-shell.targeting .card {
  scroll-snap-align: start;
}
.hand-shell.targeting .selection-bar {
  margin-top: 0;
  padding: 5px 8px;
}
@keyframes targetTrayIn {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
.card-tip.with-target-tray {
  bottom: 192px;
}
.hand-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
  margin-bottom: 10px;
}
.hand-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text, #f2ead8);
  font-weight: 700;
  letter-spacing: 0.08em;
}
.hand-title-main {
  font-size: 14px;
}
.hand-count {
  display: inline-grid;
  min-width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid var(--gold-dim, #8b7044);
  border-radius: 999px;
  color: var(--gold, #d9b56f);
  font-size: 11px;
  letter-spacing: 0;
}
.hand-hint {
  color: var(--muted, #8b99a5);
  font-size: 12px;
  text-align: right;
}
.hand {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 108px;
}
.card {
  --card-accent: #c9d2db;
  position: relative;
  width: 76px;
  height: 108px;
  flex: 0 0 auto;
  overflow: hidden;
  padding: 0;
  border: 1px solid #49535c;
  border-radius: 9px;
  background:
    linear-gradient(150deg, rgb(255 255 255 / 10%), transparent 40%),
    linear-gradient(180deg, #e8dfcc 0%, #d5cab5 100%);
  color: #24201a;
  font: inherit;
  text-align: center;
  user-select: none;
  box-shadow: 0 3px 0 #0b0d0f, 0 6px 12px rgb(0 0 0 / 26%);
  transition: transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease, border-color 150ms ease;
}
.card::after {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1px solid rgb(63 48 26 / 24%);
  border-radius: 6px;
  pointer-events: none;
}
.card.clickable {
  cursor: pointer;
  border-color: var(--gold, #d9b56f);
  box-shadow: 0 3px 0 #493a20, 0 7px 16px rgb(0 0 0 / 32%), 0 0 0 1px rgb(217 181 111 / 22%);
}
.card:not(.clickable) {
  opacity: 0.52;
  filter: saturate(0.6);
  cursor: default;
}
.card:hover,
.card:focus-visible {
  z-index: 5;
  outline: none;
  transform: translateY(-8px) scale(1.035);
  box-shadow: 0 10px 22px rgb(0 0 0 / 45%), 0 0 0 2px var(--gold, #d9b56f);
}
.card.clickable:hover {
  transform: translateY(-12px) scale(1.045);
}
.card:focus-visible {
  outline: 2px solid #fff3ce;
  outline-offset: 3px;
}
.card.selected {
  z-index: 4;
  border-color: #ffdfa0;
  transform: translateY(-12px);
  box-shadow: 0 10px 22px rgb(0 0 0 / 42%), 0 0 0 3px var(--gold, #d9b56f), 0 0 24px rgb(217 181 111 / 35%);
}
.card.dragging {
  opacity: 0.82;
  transform: scale(1.1) rotate(3deg);
  z-index: 50;
  cursor: grabbing;
}
.card-corner {
  position: absolute;
  top: 7px;
  left: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 12px;
  line-height: 1.05;
}
.card.suit-red .card-corner {
  color: #a82e2e;
}
.card.suit-black .card-corner {
  color: #252a2f;
}
.crank {
  font-size: 13px;
  font-weight: 800;
}
.card-category {
  position: absolute;
  top: 8px;
  right: 7px;
  color: rgb(45 38 28 / 55%);
  font-size: 9px;
  letter-spacing: 0.08em;
}
.card .cname {
  position: absolute;
  top: 50%;
  left: 8px;
  right: 8px;
  transform: translateY(-50%);
  color: var(--card-accent);
  font-family: 'Noto Serif SC', 'Songti SC', 'STSong', serif;
  font-size: 25px;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.04em;
  text-shadow: 0 1px 0 rgb(255 255 255 / 45%);
}
.card .cname.long {
  font-size: 16px;
  line-height: 1.2;
  letter-spacing: 0;
}
.card.sha { --card-accent: #8f2e2e; }
.card.shan { --card-accent: #315f88; }
.card.tao { --card-accent: #2d7a45; }
.card.trick { --card-accent: #64409a; }
.card.equip { --card-accent: #8a641c; }
.card-skill {
  position: absolute;
  right: 5px;
  bottom: 5px;
  z-index: 2;
  padding: 1px 5px;
  border: 1px solid #9d743d;
  border-radius: 999px;
  background: #2b2117;
  color: #f3cd85;
  font-size: 9px;
  line-height: 1.35;
  pointer-events: none;
}
.card-ready {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #62c57b;
  box-shadow: 0 0 0 3px rgb(98 197 123 / 18%), 0 0 8px #62c57b;
}
.selection-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid rgb(217 181 111 / 42%);
  border-radius: 9px;
  background: rgb(217 181 111 / 10%);
  color: #ead8b3;
  font-size: 12px;
  animation: selectionIn 160ms ease-out;
}
@keyframes selectionIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.selection-mark {
  display: inline-grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: var(--gold, #d9b56f);
  color: #231b10;
  font-weight: 900;
}
.selection-text {
  flex: 1;
}
.selection-cancel {
  flex: 0 0 auto;
  padding: 4px 9px;
}
kbd {
  margin-left: 4px;
  padding: 1px 4px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 3px;
  color: var(--muted, #8b99a5);
  font: inherit;
  font-size: 10px;
}
.spectating,
.empty-hand {
  display: grid;
  min-height: 108px;
  flex: 1;
  place-items: center;
  color: var(--muted, #8b99a5);
  font-size: 13px;
}
.card-tip {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 90;
  width: min(560px, calc(100vw - 24px));
  transform: translateX(-50%);
  padding: 11px 14px;
  border: 1px solid #665538;
  border-radius: 11px;
  background: rgb(17 22 27 / 96%);
  box-shadow: 0 14px 36px rgb(0 0 0 / 55%);
  pointer-events: none;
  backdrop-filter: blur(8px);
}
.card-tip-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
  color: var(--gold, #d9b56f);
  font-size: 13px;
  font-weight: 700;
}
.card-tip-sub {
  color: var(--muted, #8b99a5);
  font-size: 11px;
  font-weight: 400;
}
.card-tip-desc {
  color: #d2d9df;
  font-size: 12px;
  line-height: 1.55;
}
@media (max-width: 1000px) {
  .hand-shell.targeting {
    left: 14px;
    width: calc(100vw - 28px);
    max-width: none;
  }
}
@media (max-width: 760px) {
  .hand-shell {
    padding: 10px;
  }
  .hand-shell.targeting {
    left: 9px;
    bottom: 8px;
    width: calc(100vw - 18px);
    max-height: 46vh;
    padding: 8px 9px 9px;
    overflow-y: auto;
  }
  .hand-shell.targeting .selection-bar {
    position: sticky;
    top: 0;
    z-index: 2;
    background: rgb(37 31 18 / 97%);
  }
  .hand-shell.targeting .card {
    width: 68px;
    height: 96px;
  }
  .hand-shell.targeting .card .cname {
    font-size: 21px;
  }
  .card-tip.with-target-tray {
    bottom: auto;
  }
  .hand-toolbar {
    align-items: flex-start;
  }
  .hand-hint {
    max-width: 68%;
    font-size: 11px;
    line-height: 1.4;
  }
  .hand {
    min-height: 98px;
    flex-wrap: nowrap;
    overflow-x: auto;
    padding: 4px 2px 8px;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
  }
  .card {
    width: 70px;
    height: 100px;
    scroll-snap-align: start;
  }
  .card .cname {
    font-size: 22px;
  }
  .card .cname.long {
    font-size: 14px;
  }
  .selection-bar {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .selection-text {
    min-width: calc(100% - 34px);
  }
  .selection-cancel {
    margin-left: auto;
  }
  .card-tip {
    position: static;
    width: 100%;
    margin-bottom: 8px;
    transform: none;
    border-color: rgb(217 181 111 / 32%);
    background:
      linear-gradient(110deg, rgb(217 181 111 / 8%), transparent 42%),
      #121a1e;
    box-shadow: none;
    backdrop-filter: none;
  }
  .card-tip-head {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .card-tip-sub {
    width: 100%;
  }
}
</style>
