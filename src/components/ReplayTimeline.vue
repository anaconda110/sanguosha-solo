<script setup lang="ts">
// 终局关键时间线：直接把公开日志中的关键事件映射为一键回放入口。
import { computed } from 'vue';
import type { GameEvent } from '../engine/types';
import type { PublicPlayer } from '../engine/view';
import { isKeyEvent } from '../interaction/action-hints';
import { describeGameEvent } from '../review/event-text';

const props = defineProps<{ events: GameEvent[]; players: PublicPlayer[] }>();
const emit = defineEmits<{ seek: [eventSeq: number] }>();

const entries = computed(() => {
  let turn = 0;
  const out: Array<{ seq: number; turn: number; event: GameEvent; text: string }> = [];
  props.events.forEach((event, index) => {
    if (event.t === 'turnStart') turn += 1;
    if (!isKeyEvent(event)) return;
    out.push({
      seq: index + 1,
      turn: Math.max(1, turn),
      event,
      text: describeGameEvent(event, props.players),
    });
  });
  return out;
});
</script>

<template>
  <section v-if="entries.length" class="replay-timeline" aria-label="关键事件时间线">
    <header>
      <span>REPLAY TIMELINE</span>
      <strong>关键节点</strong>
      <small>点击跳转回放</small>
    </header>
    <div class="replay-timeline-track">
      <button
        v-for="entry in entries"
        :key="entry.seq"
        type="button"
        class="replay-timeline-item"
        :class="`ev-${entry.event.t}`"
        :data-seq="entry.seq"
        :title="entry.text"
        @click="emit('seek', entry.seq)"
      >
        <span class="replay-timeline-turn">回合 {{ entry.turn }}</span>
        <span class="replay-timeline-text">{{ entry.text }}</span>
        <span class="replay-timeline-seq">#{{ entry.seq }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.replay-timeline {
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 9px;
  background: rgb(0 0 0 / 14%);
}
.replay-timeline header {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-bottom: 6px;
}
.replay-timeline header span {
  color: #71654e;
  font: 700 7px/1.2 Georgia, serif;
  letter-spacing: 0.18em;
}
.replay-timeline header strong {
  color: #c8b78f;
  font-size: 10px;
}
.replay-timeline header small {
  margin-left: auto;
  color: #68757c;
  font-size: 8px;
}
.replay-timeline-track {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-color: #3a474f transparent;
  scrollbar-width: thin;
}
.replay-timeline-item {
  display: grid;
  min-width: 170px;
  max-width: 230px;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1px 6px;
  padding: 6px 8px;
  border: 1px solid #35424a;
  border-radius: 7px;
  background: #151d21;
  color: #aeb9be;
  text-align: left;
  cursor: pointer;
}
.replay-timeline-item:hover,
.replay-timeline-item:focus-visible {
  border-color: var(--gold-dim);
  background: rgb(217 181 111 / 8%);
  outline: none;
}
.replay-timeline-turn {
  grid-row: 1 / 3;
  align-self: center;
  color: #857653;
  font-size: 8px;
  white-space: nowrap;
}
.replay-timeline-text {
  overflow: hidden;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.replay-timeline-seq {
  color: #5f6c73;
  font-size: 7px;
}
.ev-damage,
.ev-dying,
.ev-death {
  border-color: rgb(164 76 76 / 30%);
}
.ev-gameOver {
  border-color: rgb(217 181 111 / 50%);
  color: var(--gold-bright);
}
</style>
