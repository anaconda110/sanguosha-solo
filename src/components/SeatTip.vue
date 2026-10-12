<script setup lang="ts">
// 座次悬停详情面板（M20，M22 自 App.vue 迁出）：跟随鼠标的信息浮层，纯展示。
import { GENERAL_SKILLS, SKILL_INFO } from '../engine/types';
import type { GameApi, InteractionApi } from '../composables/types';
import { disp } from '../composables/labels';

const props = defineProps<{ game: GameApi; interact: InteractionApi }>();
const { view } = props.game;
const { hoverSeat, seatTipPos } = props.interact;
</script>

<template>
  <div
    v-if="hoverSeat != null && view.players[hoverSeat]"
    class="seat-tip"
    :style="{ left: seatTipPos.x + 'px', top: seatTipPos.y + 'px' }"
  >
    <div class="seat-tip-name">
      {{ view.players[hoverSeat].name }}（{{ view.players[hoverSeat].handCount }} 手牌）
      <span v-if="view.players[hoverSeat].isZhu">主公</span>
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
  width: 300px;
  background: #14171e;
  border: 1px solid #3a4250;
  border-radius: 10px;
  padding: 10px 12px;
  pointer-events: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
}
.seat-tip-name {
  font-size: 13px;
  font-weight: 600;
  color: #e8c268;
  margin-bottom: 6px;
}
.seat-tip-row {
  font-size: 12px;
  line-height: 1.6;
  color: #cfd5df;
  border-top: 1px dashed #2a3140;
  padding-top: 5px;
  margin-top: 5px;
}
.seat-tip-row:first-of-type {
  border-top: none;
  margin-top: 0;
  padding-top: 0;
}
.seat-tip-skills span {
  display: block;
  margin-bottom: 3px;
  color: #9aa3b2;
}
.seat-tip-skills b {
  color: #cfd5df;
}
</style>
