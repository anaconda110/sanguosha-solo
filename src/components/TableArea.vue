<script setup lang="ts">
// 牌桌主舞台：箭头演出层 + 座次位置 + 中央牌堆信息。
// .seat 外框的状态 class 与点击、悬停事件保持既有交互契约。
import { nextTick, ref, watch } from 'vue';
import type { AnimationsApi, GameApi, InteractionApi } from '../composables/types';
import SeatCard from './SeatCard.vue';
import TableCenter from './TableCenter.vue';

const props = defineProps<{ game: GameApi; anim: AnimationsApi; interact: InteractionApi }>();

const { view, humanId, seatPos, orderedPlayers, seatSkillOn } = props.game;
const { arrows, floatsFor, flashesFor, centerPlay, setSeatsBox, setSeatEl } = props.anim;
const {
  targetingMode, drag, isTargetable, submitSeat, openSeatDetail,
  seatHoverEnter, seatHoverMove, seatHoverLeave,
} = props.interact;

/** 目标态点击 = 提交选择；其余时候点击 = 固定座次详情。 */
function activateSeat(pid: number, ev: MouseEvent) {
  if (targetingMode.value && isTargetable(pid)) submitSeat(pid);
  else openSeatDetail(pid, ev);
}
function activateSeatKey(pid: number) {
  if (targetingMode.value && isTargetable(pid)) submitSeat(pid);
  else openSeatDetail(pid);
}

const stageEl = ref<HTMLElement | null>(null);

// 选牌进入目标态时立即把牌桌带回视野；手牌区同步变成底部浮动托盘，
// 这样无需来回滚动就能完成「选牌 → 拖到座次」。instant 滚动避免操作途中位移。
watch(targetingMode, async active => {
  if (!active) return;
  await nextTick();
  stageEl.value?.scrollIntoView({ block: 'start', behavior: 'auto' });
});

function skipAnimations() {
  props.anim.skipAnimations(props.game.getState().log.length);
}
</script>

<template>
  <section ref="stageEl" class="table-stage" aria-label="牌桌">
    <div class="table-stage-head">
      <span class="stage-label"><i />战局</span>
      <span class="stage-status" :class="{ targeting: targetingMode }">
        {{ targetingMode ? '请选择高亮座次作为目标' : '点桌面空白处可跳过演出' }}
      </span>
    </div>

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
        role="button"
        tabindex="0"
        :aria-label="`${p.name}，${p.handCount} 张手牌${isTargetable(p.id) ? '，可选为目标' : ''}`"
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
        @click="activateSeat(p.id, $event)"
        @keydown.enter.prevent="activateSeatKey(p.id)"
        @keydown.space.prevent="activateSeatKey(p.id)"
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
      <div
        v-if="centerPlay"
        :key="centerPlay.id"
        class="center-play-feedback"
        role="status"
        aria-live="polite"
      >
        <span class="center-play-name">【{{ centerPlay.name }}】</span>
        <span class="center-play-targets">
          {{ centerPlay.targetCount > 0 ? `${centerPlay.targetCount} 名目标` : '无指定目标' }}
        </span>
      </div>
    </section>
  </section>
</template>

<style>
.table-stage {
  position: relative;
  scroll-margin-top: 78px;
  margin-bottom: 12px;
  padding: 11px 12px 13px;
  border: 1px solid var(--line, #34404a);
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 50% 42%, rgb(39 79 63 / 24%), transparent 61%),
    linear-gradient(160deg, rgb(255 255 255 / 2%), transparent 35%),
    #10171b;
  box-shadow: var(--shadow, 0 15px 36px rgb(0 0 0 / 28%)), inset 0 1px rgb(255 255 255 / 4%);
}
.table-stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px 9px;
  color: var(--muted, #8b99a5);
  font-size: 10px;
  letter-spacing: 0.06em;
}
.stage-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--gold, #d9b56f);
  font-weight: 700;
  letter-spacing: 0.18em;
}
.stage-label i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
}
.stage-status {
  transition: color 160ms ease;
}
.stage-status.targeting {
  color: #8bd59c;
  font-weight: 700;
}
.table {
  position: relative;
  width: 100%;
  aspect-ratio: 1.56 / 1;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 13px;
  background:
    radial-gradient(ellipse at center, rgb(30 55 46 / 68%) 0 30%, transparent 61%),
    repeating-linear-gradient(92deg, rgb(255 255 255 / 1.5%) 0 1px, transparent 1px 7px),
    linear-gradient(145deg, #14231f, #0d1719 52%, #121b20);
}
.table::before {
  content: '';
  position: absolute;
  inset: 17% 19%;
  border: 1px solid rgb(201 168 103 / 18%);
  border-radius: 50%;
  box-shadow: 0 0 0 20px rgb(201 168 103 / 2.2%), inset 0 0 50px rgb(0 0 0 / 18%);
  pointer-events: none;
}
.table::after {
  content: 'SANGUOSHA';
  position: absolute;
  left: 50%;
  bottom: 4.5%;
  transform: translateX(-50%);
  color: rgb(217 181 111 / 10%);
  font: 700 9px/1 Georgia, serif;
  letter-spacing: 0.48em;
  pointer-events: none;
}
.arrow-layer {
  position: absolute;
  inset: 0;
  z-index: 8;
  overflow: visible;
  pointer-events: none;
}
.arrow-line {
  stroke: #e05555;
  stroke-width: 3;
  stroke-dasharray: 6 4;
  animation: arrowFade 0.7s ease-out forwards;
}
@keyframes arrowFade {
  0% { opacity: 0; stroke-dashoffset: 20; }
  25% { opacity: 1; }
  100% { opacity: 0; stroke-dashoffset: 0; }
}
.center-play-feedback {
  position: absolute;
  left: 50%;
  top: calc(50% - 111px);
  z-index: 7;
  display: flex;
  align-items: baseline;
  gap: 7px;
  max-width: min(300px, 70%);
  padding: 7px 13px;
  transform: translateX(-50%);
  border: 1px solid rgb(240 211 147 / 42%);
  border-radius: 999px;
  background: rgb(11 20 21 / 92%);
  box-shadow: 0 8px 24px rgb(0 0 0 / 36%), 0 0 22px rgb(217 181 111 / 12%);
  color: #e7dcc4;
  pointer-events: none;
  white-space: nowrap;
  animation: centerPlayIn 180ms ease-out both;
}
.center-play-name {
  overflow: hidden;
  color: var(--gold-bright, #f0d393);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 15px;
  font-weight: 800;
  text-overflow: ellipsis;
}
.center-play-targets {
  color: #91a89d;
  font-size: 10px;
  letter-spacing: 0.04em;
}
@keyframes centerPlayIn {
  from { opacity: 0; transform: translate(-50%, 5px) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
.seat {
  position: absolute;
  z-index: 2;
  width: 178px;
  min-height: 158px;
  padding: 10px;
  border: 1px solid #38434a;
  border-radius: 13px;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 4%), transparent 36%),
    linear-gradient(180deg, #20282e, #171e23);
  box-shadow: 0 8px 18px rgb(0 0 0 / 33%), inset 0 1px rgb(255 255 255 / 3%);
  text-align: center;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, opacity 160ms ease;
}
.seat.pos-bottom {
  left: 50%;
  bottom: 2.2%;
  transform: translateX(-50%);
}
.seat.pos-left {
  left: 1.5%;
  top: 53%;
  transform: translateY(-50%);
}
.seat.pos-right {
  right: 1.5%;
  top: 53%;
  transform: translateY(-50%);
}
.seat.pos-top-left {
  left: 10%;
  top: 3.5%;
}
.seat.pos-top-right {
  right: 10%;
  top: 3.5%;
}
.seat.turn {
  border-color: #a9884d;
  box-shadow: 0 0 0 1px rgb(217 181 111 / 25%), 0 0 24px rgb(217 181 111 / 18%), 0 9px 22px rgb(0 0 0 / 38%);
}
.seat.turn::before {
  content: '行动中';
  position: absolute;
  top: -9px;
  left: 14px;
  z-index: 3;
  padding: 1px 7px;
  border-radius: 999px;
  background: #b89350;
  color: #1c170e;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.seat.me {
  border-color: rgb(102 142 125 / 48%);
  background:
    linear-gradient(145deg, rgb(108 156 135 / 8%), transparent 42%),
    linear-gradient(180deg, #202b2c, #171f22);
}
.seat.dead {
  opacity: 0.42;
  filter: grayscale(0.75);
}
.seat.dead .pname {
  text-decoration: line-through;
}
.seat.dimmed {
  opacity: 0.3;
  filter: grayscale(0.9);
  pointer-events: none;
}
.seat.targetable {
  z-index: 4;
  border-color: #78c88d;
  cursor: crosshair;
  box-shadow: 0 0 0 2px #69bd7e, 0 0 24px rgb(105 189 126 / 43%), 0 10px 24px rgb(0 0 0 / 36%);
  animation: targetPulse 1.4s ease-in-out infinite;
}
.seat:focus-visible {
  outline: 3px solid #f0d393;
  outline-offset: 3px;
}
.seat.targetable::after {
  content: '可选';
  position: absolute;
  right: 10px;
  bottom: -8px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #69bd7e;
  color: #0c1b11;
  font-size: 8px;
  font-weight: 900;
}
@keyframes targetPulse {
  0%, 100% { box-shadow: 0 0 0 2px #69bd7e, 0 0 18px rgb(105 189 126 / 32%), 0 10px 24px rgb(0 0 0 / 36%); }
  50% { box-shadow: 0 0 0 3px #9be1ad, 0 0 30px rgb(105 189 126 / 55%), 0 10px 24px rgb(0 0 0 / 36%); }
}
.seat.drag-over {
  border-color: #f1d18e;
  box-shadow: 0 0 0 3px #e8c268, 0 0 30px rgb(232 194 104 / 62%);
}
.seat.flash-dmg { animation: flashDmg 0.8s ease-out; }
@keyframes flashDmg {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  30% { box-shadow: 0 0 20px 5px #e05555 inset, 0 0 26px rgb(224 85 85 / 55%); }
}
.seat.flash-dying { animation: flashDying 0.8s ease-out; }
@keyframes flashDying {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  50% { box-shadow: 0 0 22px 7px #ff2222 inset, 0 0 30px rgb(255 34 34 / 60%); }
}
@media (max-width: 760px) {
  .table-stage {
    padding: 9px;
    border-radius: 14px;
  }
  .table-stage-head {
    padding: 0 2px 8px;
  }
  .stage-status {
    max-width: 62%;
    text-align: right;
  }
  .table {
    display: grid;
    grid-template-areas:
      'top-left top-right'
      'left right'
      'center center'
      'me me';
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
    aspect-ratio: auto;
    overflow: visible;
    padding: 9px;
    border-radius: 11px;
  }
  .table::before,
  .table::after,
  .arrow-layer {
    display: none;
  }
  .seat {
    position: relative;
    inset: auto !important;
    width: auto;
    min-height: 0;
    padding: 9px;
    transform: none !important;
    border-radius: 10px;
  }
  .seat.pos-top-left { grid-area: top-left; }
  .seat.pos-top-right { grid-area: top-right; }
  .seat.pos-left { grid-area: left; }
  .seat.pos-right { grid-area: right; }
  .seat.pos-bottom { grid-area: me; }
  .seat.turn::before { top: -7px; left: 9px; }
  .seat.targetable::after { right: 8px; bottom: -7px; }
  .seat.drag-over {
    transform: none !important;
    box-shadow: 0 0 0 3px #e8c268, 0 0 24px rgb(232 194 104 / 55%);
  }
  .center-play-feedback {
    top: 50%;
    max-width: calc(100% - 32px);
    padding: 6px 11px;
  }
  .center-play-name { font-size: 13px; }
  .center-play-targets { font-size: 9px; }
}
</style>
