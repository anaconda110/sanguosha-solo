<script setup lang="ts">
// 环形桌位区（ADR-0009，M22 自 App.vue 迁出）：箭头演出层 + 座次循环 + 中央信息区。
// .seat 外框的定位/状态 class 与点击、悬停事件在此编排；SeatCard 只渲染座次内容。
// 跳过动画：点桌面空白处立即结算待播演出（M20）——anim.skipAnimations 需当前日志长度。
import type { AnimationsApi, GameApi, InteractionApi } from '../composables/types';
import SeatCard from './SeatCard.vue';
import TableCenter from './TableCenter.vue';

const props = defineProps<{ game: GameApi; anim: AnimationsApi; interact: InteractionApi }>();

const { view, humanId, seatPos, orderedPlayers, seatSkillOn } = props.game;
const { arrows, floatsFor, flashesFor, setSeatsBox, setSeatEl } = props.anim;
const { targetingMode, drag, isTargetable, onSeatClick, seatHoverEnter, seatHoverMove, seatHoverLeave } = props.interact;

function skipAnimations() {
  props.anim.skipAnimations(props.game.getState().log.length);
}
</script>

<template>
  <section class="table" :ref="setSeatsBox" title="点空白处可跳过动画" @click.self="skipAnimations">
    <svg v-if="arrows.length" class="arrow-layer">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#e05555" />
        </marker>
      </defs>
      <line
        v-for="a in arrows"
        :key="a.id"
        :x1="a.x1"
        :y1="a.y1"
        :x2="a.x2"
        :y2="a.y2"
        class="arrow-line"
        marker-end="url(#arrowhead)"
      />
    </svg>
    <div
      v-for="p in orderedPlayers"
      :key="p.id"
      :ref="el => setSeatEl(p.id, el)"
      :data-pid="p.id"
      class="seat"
      :class="[
        'pos-' + seatPos[p.id],
        {
          me: p.id === humanId,
          turn: p.id === view.players[view.turnIdx]!.id && !view.winner,
          dead: !p.alive,
          targetable: isTargetable(p.id),
          dimmed: targetingMode && !isTargetable(p.id),
          'drag-over': drag?.active && drag.over === p.id,
          'flash-dmg': flashesFor(p.id).some(f => f.kind === 'dmg'),
          'flash-dying': flashesFor(p.id).some(f => f.kind === 'dying'),
        },
      ]"
      @click="onSeatClick(p.id)"
      @mouseenter="seatHoverEnter(p.id, $event)"
      @mousemove="seatHoverMove($event)"
      @mouseleave="seatHoverLeave()"
    >
      <SeatCard :p="p" :is-human="p.id === humanId" :skill-on="seatSkillOn(p.id)" :floats="floatsFor(p.id)" />
    </div>
    <TableCenter
      :deck-count="view.deckCount"
      :discard-count="view.discardCount"
      :winner="!!view.winner"
      :turn-name="view.players[view.turnIdx]!.name"
      :phase="view.phase"
    />
  </section>
</template>

<style>
/* 样式相对顺序＝原 App.vue 单一 style 块中的顺序（同级选择器靠后者胜，勿重排）：
   M20 反馈（dimmed/targetable/drag-over）→ 环形桌位与箭头 → .seat 基础/方位/turn/me/dead → 闪光。 */
/* M20 交互反馈（原 2135-2147） */
.seat.dimmed {
  opacity: 0.35;
  filter: grayscale(0.8);
  pointer-events: none;
}
.seat.targetable {
  box-shadow: 0 0 0 2px #58c470, 0 0 14px rgba(88, 196, 112, 0.55);
  cursor: crosshair;
}
.seat.drag-over {
  box-shadow: 0 0 0 3px #e8c268, 0 0 20px rgba(232, 194, 104, 0.7);
  transform: scale(1.04);
}
/* —— 环形桌位（ADR-0009）：自己居下，四家环绕，中央信息区 —— */
.table {
  position: relative;
  width: 100%;
  max-width: 720px;
  margin: 0 auto 12px;
  aspect-ratio: 16 / 10;
}
.arrow-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 8;
  overflow: visible;
}
.arrow-line {
  stroke: #e05555;
  stroke-width: 3;
  stroke-dasharray: 6 4;
  animation: arrowFade 0.7s ease-out forwards;
}
@keyframes arrowFade {
  0% {
    opacity: 0;
    stroke-dashoffset: 20;
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    stroke-dashoffset: 0;
  }
}
.seat {
  position: absolute;
  width: 148px;
  background: #22262f;
  border: 2px solid #2c313c;
  border-radius: 8px;
  padding: 6px 8px;
  text-align: center;
  z-index: 2;
}
.seat.pos-bottom {
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
}
.seat.pos-left {
  left: 0;
  top: 50%;
  transform: translateY(-50%);
}
.seat.pos-right {
  right: 0;
  top: 50%;
  transform: translateY(-50%);
}
.seat.pos-top-left {
  left: 15%;
  top: 0;
}
.seat.pos-top-right {
  right: 15%;
  top: 0;
}
.seat.turn {
  border-color: #e5b567;
  box-shadow: 0 0 10px rgba(229, 181, 103, 0.45);
}
.seat.me {
  background: #232b3a;
}
.seat.dead {
  opacity: 0.4;
}
.seat.dead .pname {
  text-decoration: line-through;
}
.seat.targetable {
  border-color: #e05555;
  cursor: pointer;
}
.seat.flash-dmg {
  animation: flashDmg 0.8s ease-out;
}
@keyframes flashDmg {
  0%,
  100% {
    box-shadow: none;
  }
  30% {
    box-shadow: 0 0 14px 4px #e05555 inset;
  }
}
.seat.flash-dying {
  animation: flashDying 0.8s ease-out;
}
@keyframes flashDying {
  0%,
  100% {
    box-shadow: none;
  }
  50% {
    box-shadow: 0 0 18px 6px #ff2222 inset;
  }
}
</style>
