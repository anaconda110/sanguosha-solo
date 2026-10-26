<script setup lang="ts">
// 战报侧栏：公开事件筛选 + 关键事件回放定位。实时模式自动跟随，回放时不抢滚动位置。
import { computed, nextTick, ref, watch } from 'vue';
import type { GameEvent } from '../engine/types';
import type { PublicPlayer } from '../engine/view';
import { describeGameEvent } from '../review/event-text';
import { isKeyEvent, matchesLogFilter, type LogFilter } from '../interaction/action-hints';

const props = defineProps<{ events: GameEvent[]; players: PublicPlayer[]; replaying?: boolean }>();
const emit = defineEmits<{ seek: [eventSeq: number] }>();
const stream = ref<HTMLElement | null>(null);
const filter = ref<LogFilter>('all');
const FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'damage', label: '伤害' },
  { id: 'skill', label: '技能' },
  { id: 'judge', label: '判定' },
  { id: 'key', label: '关键' },
];

/** seq 基于完整 events 计算，不能因为只渲染最近一段而失真。 */
const visible = computed(() =>
  props.events
    .map((event, index) => ({ event, seq: index + 1 }))
    .filter(entry => matchesLogFilter(entry.event, filter.value))
    .slice(-80),
);

function evText(e: GameEvent): string {
  return describeGameEvent(e, props.players);
}

watch(
  () => [props.events.length, filter.value, props.replaying] as const,
  async () => {
    await nextTick();
    if (!props.replaying && stream.value) stream.value.scrollTop = stream.value.scrollHeight;
  },
);

function seekEvent(entry: { event: GameEvent; seq: number }) {
  if (isKeyEvent(entry.event)) emit('seek', entry.seq);
}
</script>

<template>
  <section class="log" aria-label="战报">
    <header class="log-head">
      <div class="log-heading">
        <span class="log-eyebrow">BATTLE LOG</span>
        <strong>战报</strong>
      </div>
      <span class="log-count">{{ events.length }} 条</span>
    </header>
    <div class="log-filters" role="group" aria-label="筛选战报">
      <button
        v-for="item in FILTERS"
        :key="item.id"
        type="button"
        class="log-filter"
        :class="{ active: filter === item.id }"
        :aria-pressed="filter === item.id"
        @click="filter = item.id"
      >{{ item.label }}</button>
    </div>
    <div ref="stream" class="log-stream" role="log" aria-live="polite">
      <div
        v-for="entry in visible"
        :key="entry.seq"
        class="logev"
        :class="[`ev-${entry.event.t}`, { seekable: isKeyEvent(entry.event) }]"
        :data-seq="entry.seq"
        :role="isKeyEvent(entry.event) ? 'button' : undefined"
        :tabindex="isKeyEvent(entry.event) ? 0 : undefined"
        :title="isKeyEvent(entry.event) ? '跳到这个关键事件' : undefined"
        @click="seekEvent(entry)"
        @keydown.enter.prevent="seekEvent(entry)"
        @keydown.space.prevent="seekEvent(entry)"
      >
        <span class="log-dot" aria-hidden="true" />
        <span class="log-text"><span class="log-seq">{{ entry.seq }}</span>{{ evText(entry.event) }}</span>
      </div>
      <div v-if="visible.length === 0" class="log-empty">当前筛选下暂无事件</div>
    </div>
    <footer class="log-foot">
      {{ filter === 'all' ? '全部事件' : FILTERS.find(item => item.id === filter)?.label + '事件' }} · 显示最近 {{ visible.length }} 条
      <span v-if="!replaying"> · 实时跟随</span>
      <span v-else> · 回放中</span>
    </footer>
  </section>
</template>

<style>
.log {
  display: flex;
  min-height: 300px;
  height: min(680px, calc(100vh - 128px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line, #34404a);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 18%),
    var(--panel, #151c22);
  box-shadow: var(--shadow-sm, 0 8px 20px rgb(0 0 0 / 18%));
}
.log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 14px 11px;
  border-bottom: 1px solid rgb(255 255 255 / 6%);
  background: rgb(0 0 0 / 9%);
}
.log-heading {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.log-eyebrow {
  color: #697982;
  font: 700 8px/1.2 Georgia, serif;
  letter-spacing: 0.22em;
}
.log-heading strong {
  color: var(--text, #f2ead8);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 16px;
  letter-spacing: 0.08em;
}
.log-count {
  padding: 2px 7px;
  border: 1px solid #37434b;
  border-radius: 999px;
  color: #7e8d96;
  font-size: 9px;
}
.log-filters {
  display: flex;
  gap: 4px;
  padding: 7px 10px;
  border-bottom: 1px solid rgb(255 255 255 / 5%);
  background: rgb(0 0 0 / 5%);
}
.log-filter {
  min-height: 26px;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: #718087;
  font-size: 10px;
  cursor: pointer;
}
.log-filter:hover,
.log-filter:focus-visible {
  border-color: rgb(217 181 111 / 24%);
  color: #c8b78f;
  outline: none;
}
.log-filter.active {
  border-color: rgb(217 181 111 / 32%);
  background: rgb(217 181 111 / 9%);
  color: var(--gold, #d9b56f);
  font-weight: 700;
}
.log-stream {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px 12px;
  scrollbar-color: #39464e transparent;
  scrollbar-width: thin;
}
.logev {
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  padding: 5px 1px;
  border-bottom: 1px solid rgb(255 255 255 / 3.5%);
  color: #9aa7ae;
  font-size: 11px;
  line-height: 1.55;
}
.logev.seekable {
  margin: 0 -5px;
  padding-inline: 5px;
  border-radius: 5px;
  cursor: pointer;
}
.logev.seekable:hover,
.logev.seekable:focus-visible {
  outline: none;
  background: rgb(217 181 111 / 7%);
}
.logev:last-child {
  border-bottom: 0;
}
.log-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #557078;
}
.log-text {
  overflow-wrap: anywhere;
}
.log-seq {
  display: inline-block;
  min-width: 20px;
  margin-right: 5px;
  color: #506068;
  font: 9px/1.2 'Cascadia Mono', Consolas, monospace;
  text-align: right;
}
.ev-damage .log-dot,
.ev-death .log-dot,
.ev-dying .log-dot {
  background: #d56d6d;
  box-shadow: 0 0 5px rgb(213 109 109 / 45%);
}
.ev-damage .log-text,
.ev-death .log-text,
.ev-dying .log-text {
  color: #d7a1a1;
}
.ev-heal .log-dot { background: #69be8a; }
.ev-heal .log-text { color: #a6d4b3; }
.ev-playCard .log-dot,
.ev-equip .log-dot,
.ev-respond .log-dot { background: #c8a860; }
.ev-skill .log-dot,
.ev-ability .log-dot { background: #75a9c2; }
.ev-skill .log-text,
.ev-ability .log-text { color: #aac7d4; }
.ev-turnStart .log-text {
  color: #d7caa9;
  font-weight: 700;
}
.ev-gameOver .log-text {
  color: #f0cd83;
  font-weight: 700;
}
.log-empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  color: #64727a;
  font-size: 12px;
}
.log-foot {
  padding: 7px 12px;
  border-top: 1px solid rgb(255 255 255 / 5%);
  color: #5e6c74;
  font-size: 9px;
  text-align: right;
}
@media (max-width: 1000px) {
  .log {
    height: 300px;
    min-height: 0;
  }
}
@media (max-width: 760px) {
  .log {
    height: 260px;
    border-radius: 12px;
  }
}
</style>
