<script setup lang="ts">
// 座次详情面板：悬停可进入保持，点击座次后固定；固定态提供显式关闭按钮。
import { GENERAL_SKILLS, SKILL_INFO } from '../engine/types';
import type { GameApi, InteractionApi } from '../composables/types';
import { disp } from '../composables/labels';

const props = defineProps<{ game: GameApi; interact: InteractionApi }>();
const { view } = props.game;
const { hoverSeat, seatTipPos, seatDetailPinned, seatDetailEnter, seatHoverLeave, closeSeatDetail } = props.interact;
</script>

<template>
  <div
    v-if="hoverSeat != null && view.players[hoverSeat]"
    class="seat-tip"
    :class="{ pinned: seatDetailPinned }"
    role="dialog"
    :aria-label="`${view.players[hoverSeat].name} 的座次详情`"
    :style="{ left: seatTipPos.x + 'px', top: seatTipPos.y + 'px' }"
    @mouseenter="seatDetailEnter"
    @mouseleave="seatHoverLeave"
  >
    <div class="seat-tip-name">
      <span>
        {{ view.players[hoverSeat].name }}（{{ view.players[hoverSeat].handCount }} 手牌）
        <span v-if="view.players[hoverSeat].isZhu">主公</span>
      </span>
      <button v-if="seatDetailPinned" type="button" class="seat-tip-close" aria-label="关闭座次详情" @click="closeSeatDetail">×</button>
    </div>
    <div class="seat-tip-row" v-if="Object.keys(view.players[hoverSeat].equipSlots).length">
      装备：<span v-for="(sub, slot) in view.players[hoverSeat].equipSlots" :key="slot">【{{ disp(sub) }}】</span>
    </div>
    <div class="seat-tip-row" v-else>装备：无</div>
    <div class="seat-tip-row" v-if="view.players[hoverSeat].judgements.length">
      判定区：<span v-for="j in view.players[hoverSeat].judgements" :key="j">【{{ disp(j) }}】</span>
    </div>
    <div class="seat-tip-row seat-tip-skills" v-if="GENERAL_SKILLS[view.players[hoverSeat].general].length">
      <span v-for="sk in GENERAL_SKILLS[view.players[hoverSeat].general]" :key="sk">
        <b>【{{ SKILL_INFO[sk].display }}】</b>{{ SKILL_INFO[sk].desc }}
      </span>
    </div>
  </div>
</template>

<style>
.seat-tip {
  position: fixed;
  z-index: 60;
  width: min(310px, calc(100vw - 16px));
  padding: 11px 13px;
  border: 1px solid rgb(217 181 111 / 30%);
  border-radius: 11px;
  background:
    linear-gradient(115deg, rgb(217 181 111 / 8%), transparent 40%),
    rgb(17 24 28 / 97%);
  pointer-events: auto;
  box-shadow: 0 14px 34px rgb(0 0 0 / 55%), inset 0 1px rgb(255 255 255 / 4%);
  backdrop-filter: blur(10px);
}
.seat-tip.pinned {
  border-color: rgb(217 181 111 / 58%);
  box-shadow: 0 18px 42px rgb(0 0 0 / 62%), 0 0 0 1px rgb(217 181 111 / 18%), inset 0 1px rgb(255 255 255 / 4%);
}
.seat-tip-name {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  color: var(--gold-bright, #f0d393);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.seat-tip-close {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #3d4b53;
  border-radius: 7px;
  background: rgb(0 0 0 / 16%);
  color: #aab7bd;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.seat-tip-close:hover,
.seat-tip-close:focus-visible {
  border-color: var(--gold-dim, #8b7044);
  color: var(--gold-bright, #f0d393);
  outline: none;
}
.seat-tip-row {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgb(255 255 255 / 9%);
  color: #c8d0d3;
  font-size: 12px;
  line-height: 1.65;
}
.seat-tip-row:first-of-type {
  border-top: none;
  margin-top: 0;
  padding-top: 0;
}
.seat-tip-skills span {
  display: block;
  margin-bottom: 4px;
  color: #8f9ca2;
}
.seat-tip-skills b {
  color: #d9c18e;
}
</style>
