<script setup lang="ts">
// 手牌区（M22 自 App.vue 迁出）：排序（类型→花色→点数）、选中态、悬停说明条、拖拽出牌。
// 点击/拖拽语义在 useInteraction；本组件只做渲染与转发。
import { computed } from 'vue';
import { CARD_INFO, type Card, type CardKind, type Suit } from '../engine/types';
import type { GameApi, InteractionApi } from '../composables/types';
import { disp } from '../composables/labels';

const props = defineProps<{ game: GameApi; interact: InteractionApi }>();
// 解构复制 ref 本体，模板自动解包，响应式不丢
const { me, meP, myGeneral, pend, zhangbaOn } = props.game;
const {
  selected, selected2, discardSel, guanshiSel, activeSel, guanxingPick, lijianCard,
  hoverCard, drag, onCardClick, cardPointerDown,
} = props.interact;

// —— 手牌排序 FLIP（ADR-0009）：类型分组（基本→锦囊→装备）+ 花色点数 ——
const KIND_ORDER: Record<CardKind, number> = { basic: 0, trick: 1, equip: 2 };
const SUIT_ORDER: Record<Suit, number> = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };
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

/** 丈八蛇矛：非桃手牌都能凑两张当杀 */
function zhangbaHint(c: Card): string | null {
  return zhangbaOn.value && c.sub !== 'tao' ? '丈八' : null;
}
</script>

<template>
  <div v-if="hoverCard && CARD_INFO[hoverCard.sub].desc" class="card-tip">
    <div class="card-tip-head">
      【{{ CARD_INFO[hoverCard.sub].display }}】
      <span class="card-tip-sub">{{ hoverCard.suit }}{{ hoverCard.rank }} · {{ CARD_INFO[hoverCard.sub].kind === 'basic' ? '基本牌' : CARD_INFO[hoverCard.sub].kind === 'trick' ? '锦囊牌' : '装备牌' }}{{ CARD_INFO[hoverCard.sub].range ? '·射程' + CARD_INFO[hoverCard.sub].range : '' }}</span>
    </div>
    <div class="card-tip-desc">{{ CARD_INFO[hoverCard.sub].desc }}</div>
  </div>

  <section class="hand">
    <div
      v-for="c in handSorted"
      :key="c.id"
      :data-cid="c.id"
      class="card"
      :class="[
        c.sub,
        CARD_INFO[c.sub].kind,
        {
          selected: selected?.cardId === c.id || selected2?.id === c.id || discardSel.includes(c.id) || guanshiSel.includes(c.id) || activeSel.includes(c.id) || guanxingPick.includes(c.id) || lijianCard?.id === c.id,
          clickable: !!pend,
          dragging: drag?.card.id === c.id && drag.active,
        },
      ]"
      @click="onCardClick(c)"
      @pointerdown="cardPointerDown(c, $event)"
      @mouseenter="hoverCard = c"
      @mouseleave="hoverCard = null"
    >
      <div class="cname" :class="{ long: disp(c.sub).length > 2 }">{{ disp(c.sub) }}</div>
      <div class="csuit">{{ c.suit }}{{ c.rank }}</div>
      <div v-if="skillHint(c)" class="card-skill">{{ skillHint(c) }}</div>
    </div>
    <div v-if="!me" class="spectating">（观战中）</div>
  </section>
</template>

<style>
/* 样式相对顺序＝原 App.vue 单一 style 块中的顺序（同级选择器靠后者胜，勿重排）：
   M20（card:hover/dragging）→ card 基础/选中 → card-tip。 */
.card:hover {
  transform: translateY(-14px) scale(1.08);
  z-index: 5;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  cursor: pointer;
}
.card.dragging {
  opacity: 0.85;
  transform: scale(1.12) rotate(3deg);
  z-index: 50;
  cursor: grabbing;
}
.card {
  position: relative;
}
.card-skill {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #7a3b12;
  color: #ffd9a8;
  font-size: 10px;
  border-radius: 6px;
  padding: 0 5px;
  border: 1px solid #e5b567;
  pointer-events: none;
}
.hand {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 100px;
  margin-bottom: 12px;
}
.card {
  width: 68px;
  height: 96px;
  border-radius: 8px;
  border: 2px solid #444;
  background: #2b303b;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.card.clickable {
  cursor: pointer;
}
.card.selected {
  border-color: #e5b567;
  transform: translateY(-10px);
}
.card .cname {
  font-size: 26px;
  font-weight: bold;
  padding: 0 4px;
  text-align: center;
}
.card .cname.long {
  font-size: 15px;
  line-height: 1.3;
}
.card.sha .cname {
  color: #e07070;
}
.card.shan .cname {
  color: #7aa5e0;
}
.card.tao .cname {
  color: #7fd08a;
}
.card.trick .cname {
  color: #c39bff;
}
.card.equip .cname {
  color: #e5b567;
}
.csuit {
  color: #8b93a3;
  font-size: 13px;
  margin-top: 6px;
}
.spectating {
  color: #6b7280;
  align-self: center;
}
.card-tip {
  position: fixed;
  left: 50%;
  bottom: 172px;
  transform: translateX(-50%);
  max-width: 560px;
  background: #14171e;
  border: 1px solid #3a4250;
  border-radius: 10px;
  padding: 10px 14px;
  z-index: 40;
  pointer-events: none;
}
.card-tip-head {
  font-size: 13px;
  color: #e8c268;
  margin-bottom: 4px;
}
.card-tip-sub {
  color: #8b93a3;
  font-size: 12px;
}
.card-tip-desc {
  font-size: 13px;
  line-height: 1.5;
  color: #cfd5df;
}
</style>
