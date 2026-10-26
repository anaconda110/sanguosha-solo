<script setup lang="ts">
// 桌面中央信息区：牌堆/弃牌数、当前回合武将与阶段。
import { PHASE_NAMES } from '../composables/labels';
import type { Phase } from '../engine/types';

const props = defineProps<{
  deckCount: number;
  discardCount: number;
  winner: boolean;
  turnName: string;
  phase: Phase;
}>();

const PHASES: Array<{ id: Phase; label: string }> = [
  { id: 'judge', label: '判定' },
  { id: 'draw', label: '摸牌' },
  { id: 'play', label: '出牌' },
  { id: 'discard', label: '弃牌' },
];
</script>

<template>
  <div class="center">
    <div class="center-emblem" aria-hidden="true">杀</div>
    <div class="center-round">{{ winner ? '战局终了' : '当前行动' }}</div>
    <div class="center-turn">{{ winner ? '对局结束' : turnName }}</div>
    <div class="center-phase">{{ winner ? '可回看整局' : PHASE_NAMES[phase] }}</div>
    <div v-if="!winner" class="center-flow" aria-label="回合阶段">
      <span
        v-for="step in PHASES"
        :key="step.id"
        class="phase-step"
        :class="{ active: step.id === props.phase }"
        :aria-current="step.id === props.phase ? 'step' : undefined"
      >{{ step.label }}</span>
    </div>
    <div class="center-piles">
      <span class="pile"><b>{{ deckCount }}</b><small>牌堆</small></span>
      <span class="pile"><b>{{ discardCount }}</b><small>弃牌</small></span>
    </div>
  </div>
</template>

<style>
.center {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  display: flex;
  width: 172px;
  min-height: 172px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%);
  border: 1px solid rgb(217 181 111 / 30%);
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 35%, rgb(217 181 111 / 14%), transparent 54%),
    rgb(12 24 23 / 74%);
  box-shadow: inset 0 0 30px rgb(0 0 0 / 32%), 0 0 0 10px rgb(255 255 255 / 2%);
  color: var(--muted, #8b99a5);
  text-align: center;
  backdrop-filter: blur(4px);
}
.center-emblem {
  position: absolute;
  top: 17px;
  display: grid;
  width: 29px;
  height: 29px;
  place-items: center;
  border: 1px solid rgb(217 181 111 / 40%);
  border-radius: 50%;
  color: rgb(217 181 111 / 56%);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 15px;
}
.center-round {
  margin-top: 8px;
  color: #71817b;
  font-size: 9px;
  letter-spacing: 0.22em;
}
.center-turn {
  max-width: 138px;
  margin-top: 2px;
  overflow: hidden;
  color: var(--gold-bright, #f0d393);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 19px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.center-phase {
  margin-top: 1px;
  color: #aab6ad;
  font-size: 11px;
}
.center-flow {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 6px;
}
.phase-step {
  position: relative;
  padding: 2px 4px;
  border-radius: 999px;
  color: #5f6d6a;
  font-size: 8px;
  line-height: 1.2;
}
.phase-step + .phase-step::before {
  content: '›';
  position: absolute;
  left: -5px;
  color: #40504d;
}
.phase-step.active {
  background: rgb(217 181 111 / 13%);
  color: var(--gold-bright, #f0d393);
  font-weight: 800;
}
.center-piles {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid rgb(255 255 255 / 7%);
}
.pile {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 32px;
  color: #87978e;
  font-size: 10px;
}
.pile b {
  color: #d7ddd7;
  font-size: 14px;
  line-height: 1.1;
}
.pile small {
  font-size: 9px;
}
@media (max-width: 760px) {
  .center {
    position: relative;
    left: auto;
    top: auto;
    width: auto;
    min-height: 0;
    grid-column: 1 / -1;
    grid-row: 3;
    flex-direction: row;
    gap: 10px;
    padding: 8px 12px;
    transform: none;
    border-radius: 10px;
    text-align: left;
  }
  .center-emblem,
  .center-round {
    display: none;
  }
  .center-turn {
    max-width: none;
    margin: 0;
    font-size: 14px;
  }
  .center-phase {
    margin: 0;
  }
  .center-flow {
    margin: 0;
  }
  .phase-step {
    white-space: nowrap;
  }
  .center-piles {
    gap: 10px;
    margin: 0 0 0 auto;
    padding: 0 0 0 10px;
    border-top: 0;
    border-left: 1px solid rgb(255 255 255 / 9%);
  }
  .pile {
    flex-direction: row;
    gap: 3px;
    min-width: 0;
  }
}
</style>
