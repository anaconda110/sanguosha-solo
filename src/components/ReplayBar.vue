<script setup lang="ts">
// 回放条（M15，M22 自 App.vue 迁出）：终局后拖动/步进回看整局。
// seek(k) 交由父级 useGame.showReplay 执行（重演引擎动作）；本组件只维护数字输入框镜像。
import { ref, watch } from 'vue';

const props = defineProps<{ replayIdx: number | null; replayTotal: number }>();
const emit = defineEmits<{ seek: [k: number | null] }>();

const replayInput = ref<number | null>(null);
watch(
  () => props.replayIdx,
  k => (replayInput.value = k), // showReplay 后同步输入框（原实现内联赋值）
);

/** 回放进度条拖动：数字输入即时跳转（越界钳制） */
function onReplaySeek() {
  const v = Number(replayInput.value ?? 0);
  if (!Number.isFinite(v)) return;
  emit('seek', Math.max(0, Math.min(props.replayTotal, Math.floor(v))));
}
</script>

<template>
  <div class="replay-bar">
    <span>回放</span>
    <button class="btn ghost" @click="emit('seek', Math.max(0, (replayIdx ?? replayTotal) - 1))">◀</button>
    <input
      class="replay-seek"
      type="range"
      min="0"
      :max="replayTotal"
      :value="replayIdx ?? replayTotal"
      title="拖动跳转到任意时刻"
      @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
    />
    <input
      v-model.number="replayInput"
      class="replay-num"
      type="number"
      min="0"
      :max="replayTotal"
      @change="onReplaySeek"
    />
    <span class="replay-total">/ {{ replayTotal }}</span>
    <button class="btn ghost" @click="emit('seek', Math.min(replayTotal, (replayIdx ?? replayTotal) + 1))">▶</button>
    <button class="btn ghost" @click="emit('seek', null)">退出回放</button>
  </div>
</template>

<style>
.replay-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
  padding: 5px 6px;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 9px;
  background: rgb(0 0 0 / 14%);
  color: var(--muted, #8b99a5);
  font-size: 10px;
  white-space: nowrap;
}
/* 回放拖动条（M15） */
.replay-seek {
  width: 150px;
  accent-color: var(--gold, #d9b56f);
}
.replay-num {
  width: 58px;
  height: 26px;
  padding: 2px 5px;
  font-size: 10px;
}
.replay-total {
  color: #64727a;
}
.replay-bar .btn {
  min-height: 26px;
  padding: 2px 7px;
  font-size: 10px;
}
.report-entry {
  display: flex;
  justify-content: flex-end;
}
.report-open {
  min-height: 37px;
  border-color: var(--gold-dim, #8b7044);
  color: var(--gold-bright, #f0d393);
}
@media (max-width: 760px) {
  .replay-bar {
    justify-content: flex-start;
  }
  .replay-seek {
    min-width: 110px;
    flex: 1;
  }
}
</style>
