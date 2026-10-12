<script setup lang="ts">
// 桌面中央信息区（M22 自 App.vue 迁出）：牌堆/弃牌数、当前回合武将与阶段。
import { PHASE_NAMES } from '../composables/labels';
import type { Phase } from '../engine/types';

defineProps<{
  deckCount: number;
  discardCount: number;
  winner: boolean;
  turnName: string;
  phase: Phase;
}>();
</script>

<template>
  <div class="center">
    <div class="pile">牌堆 {{ deckCount }}</div>
    <div class="pile">弃牌 {{ discardCount }}</div>
    <div class="center-turn">
      {{ winner ? '对局结束' : '当前：' + turnName }}
    </div>
    <div class="center-phase">{{ PHASE_NAMES[phase] }}</div>
  </div>
</template>

<style>
.center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #8b93a3;
  font-size: 13px;
  line-height: 1.5;
  z-index: 1;
}
.pile {
  display: inline-block;
  margin: 0 6px;
}
.center-turn {
  color: #e5b567;
}
.center-phase {
  color: #6b7280;
  font-size: 12px;
}
</style>
